"""
Lambda 함수 올리기 (CloudShell 에서: npm run deploy). 표는 lambda/functions.json, 묶기는 scripts/package_lambdas.py.

  npm run deploy -- check        확인만 (아무것도 바꾸지 않음): 함수가 있는지 · 런타임·제한 시간 · 코드 올리기 권한 · 함수 URL
  npm run deploy -- setup        처음 한 번: 없는 함수 만들기(실행 역할은 jojo_api_py 와 같게) ·
                                 환경 변수 옮기기(jojo_api_py 에서, 함수마다 필요한 이름만) · 함수 URL 만들기 → 화면에 넣을 주소 안내
  npm run deploy                 코드 올리기 (바뀐 함수만) + 설정(런타임·제한 시간·메모리) 맞추기 + /health 확인
  npm run deploy -- jojo_auth    그 함수만 (여러 개 가능)

AWS CLI(CloudShell 에 들어 있음)로 지금 로그인한 계정에서 실행해요. 표준 라이브러리만 써요.
환경 변수 값(비밀 값 포함)은 화면에 찍지 않고 이름만 보여 줘요. 계정 번호는 <계정> 으로 가려요.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import package_lambdas as pkg  # noqa: E402

SPEC = pkg.SPEC
REGION = SPEC["region"]
SOURCE = next(f["name"] for f in SPEC["functions"] if f.get("legacy"))   # 환경 변수·실행 역할을 가져올 지금 함수 (jojo_api_py)


class AwsError(Exception):
    def __init__(self, text):
        super().__init__(text)
        self.code = (re.search(r"\((\w+Exception|\w+Error)\)", text) or re.search(r"(\w+Exception)", text) or [None, ""])[1]


def hide(text):
    return re.sub(r"\b\d{12}\b", "<계정>", text)


def aws(*args):
    """aws lambda … → JSON (실패하면 AwsError)"""
    p = subprocess.run(["aws", *args, "--region", REGION, "--output", "json"], capture_output=True, text=True)
    if p.returncode != 0:
        raise AwsError(hide(p.stderr.strip() or p.stdout.strip()))
    return json.loads(p.stdout) if p.stdout.strip() else {}


def config(name):
    """함수 설정 (없으면 None)"""
    try:
        return aws("lambda", "get-function-configuration", "--function-name", name)
    except AwsError as e:
        if e.code == "ResourceNotFoundException":
            return None
        raise


def function_url(name):
    try:
        return aws("lambda", "get-function-url-config", "--function-name", name)["FunctionUrl"]
    except AwsError as e:
        if e.code == "ResourceNotFoundException":
            return None
        raise


def wait(kind, name):
    aws("lambda", "wait", kind, "--function-name", name)


def wanted_settings(f):
    return {"Runtime": SPEC["runtime"], "Handler": SPEC["handler"], "Timeout": f["timeout"], "MemorySize": f["memory"]}


def setting_gaps(f, cfg):
    gaps = {k: (cfg.get(k), v) for k, v in wanted_settings(f).items() if cfg.get(k) != v}
    if cfg.get("Architectures", ["x86_64"]) != [SPEC["architecture"]]:
        gaps["Architectures"] = (cfg.get("Architectures"), [SPEC["architecture"]])
    return gaps


def env_for(f, source_env):
    """이 함수에 필요한 환경 변수만 (sharedEnv + 함수의 env, RATE_LIMIT_* 처럼 * 는 앞부분이 같은 이름 모두)"""
    names = SPEC["sharedEnv"] + f["env"]
    keep = lambda n: n in names or any(p.endswith("*") and n.startswith(p[:-1]) for p in names)
    return {k: v for k, v in source_env.items() if keep(k)}


def set_env(name, variables):
    """환경 변수 넣기 — 값이 명령 줄·화면에 보이지 않게 잠깐 파일로 넘긴다"""
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        os.chmod(path, 0o600)
        with os.fdopen(fd, "w") as out:
            json.dump({"Variables": variables}, out)
        aws("lambda", "update-function-configuration", "--function-name", name, "--environment", f"file://{path}")
    finally:
        os.remove(path)
    wait("function-updated-v2", name)


def health(url):
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=20) as res:
            body = json.loads(res.read().decode("utf-8"))
        return f"/health ✓ (AI {'켜짐' if body.get('ai') else '꺼짐'}, {body.get('mode')})"
    except Exception as e:   # noqa: BLE001 — 확인 결과만 알려 준다
        return f"/health ✗ ({type(e).__name__})"


# ───────────────────────── check ─────────────────────────


def check(targets):
    aws("sts", "get-caller-identity")
    print("✓ AWS 연결 (리전", REGION + ")")
    for f in targets:
        cfg = config(f["name"])
        if not cfg:
            print(f"· {f['name']:<14} 없음 → npm run deploy -- setup 으로 만들어요")
            continue
        notes = [f"{k} {a} → {b}" for k, (a, b) in setting_gaps(f, cfg).items()]
        have = set((cfg.get("Environment") or {}).get("Variables", {}))
        missing = [n for n in f["env"] if n not in have and n != "AUTH_CALLBACK_BASE"]
        url = function_url(f["name"])
        path, _ = pkg.build(f)
        try:
            aws("lambda", "update-function-code", "--function-name", f["name"], "--zip-file", f"fileb://{path}", "--dry-run")
            permission = "코드 올리기 권한 ✓"
        except AwsError as e:
            permission = f"코드 올리기 권한 ✗ ({e.code or str(e)[:80]})"
        print(f"✓ {f['name']:<14} {permission} · 환경 변수 {len(have)}개" + (f" (없음: {', '.join(missing)})" if missing else "")
              + (f" · 바꿀 설정: {'; '.join(notes)}" if notes else "") + f" · URL {url or '없음'}")


# ───────────────────────── setup ─────────────────────────


def setup(targets):
    source = config(SOURCE)
    if not source:
        raise SystemExit(f"✗ {SOURCE} 를 찾지 못했어요. 실행 역할·환경 변수를 여기서 가져와요")
    source_env = (source.get("Environment") or {}).get("Variables", {})
    urls = {}
    for f in targets:
        if f.get("legacy"):
            continue
        name, cfg = f["name"], config(f["name"])
        variables = env_for(f, source_env)
        # 1. 없으면 만들기 (실행 역할·런타임·아키텍처·제한 시간·메모리·환경 변수)
        if not cfg:
            path, _ = pkg.build(f)
            fd, env_path = tempfile.mkstemp(suffix=".json")
            try:
                os.chmod(env_path, 0o600)
                with os.fdopen(fd, "w") as out:
                    json.dump({"Variables": variables}, out)
                aws("lambda", "create-function", "--function-name", name, "--role", source["Role"], "--runtime", SPEC["runtime"],
                    "--architectures", SPEC["architecture"], "--handler", SPEC["handler"], "--timeout", str(f["timeout"]),
                    "--memory-size", str(f["memory"]), "--zip-file", f"fileb://{path}", "--environment", f"file://{env_path}")
            finally:
                os.remove(env_path)
            wait("function-active-v2", name)
            print(f"✓ {name:<14} 만듦 (환경 변수 {len(variables)}개: {', '.join(sorted(variables))})")
        # 2. 있으면 빠진 환경 변수만 채우기 (이미 있는 값은 그대로)
        else:
            have = (cfg.get("Environment") or {}).get("Variables", {})
            add = {k: v for k, v in variables.items() if k not in have}
            if add:
                set_env(name, {**have, **add})
            print(f"✓ {name:<14} 있음" + (f" · 환경 변수 채움: {', '.join(sorted(add))}" if add else " · 환경 변수 그대로"))
        # 3. 함수 URL (인증 없음 — CORS 는 코드가 처리) + 공개 호출 허용
        url = function_url(name)
        if not url:
            url = aws("lambda", "create-function-url-config", "--function-name", name, "--auth-type", "NONE")["FunctionUrl"]
        for sid, extra in (("FunctionURLAllowPublicAccess", ["--action", "lambda:InvokeFunctionUrl", "--function-url-auth-type", "NONE"]),
                           ("FunctionURLAllowInvokeAction", ["--action", "lambda:InvokeFunction", "--invoked-via-function-url"])):
            try:
                aws("lambda", "add-permission", "--function-name", name, "--statement-id", sid, "--principal", "*", *extra)
            except AwsError as e:
                if e.code != "ResourceConflictException":   # 이미 있음은 괜찮다
                    raise
        urls[f["key"]] = url.rstrip("/")
    if urls:
        print("\n화면에 넣을 주소 — GitHub 저장소 → Settings → Secrets and variables → Actions → Variables → API_URLS 에 그대로:")
        print(json.dumps(urls, ensure_ascii=False))
        if "auth" in urls:
            print(f"\nGoogle 로그인: Google Cloud Console 의 승인된 리디렉션 URI 에 추가 → {urls['auth']}/auth/callback/google")
        print("다음: npm run deploy  (코드를 올리고 /health 확인)")


# ───────────────────────── deploy ─────────────────────────


def deploy(targets):
    for f in targets:
        name, cfg = f["name"], config(f["name"])
        if not cfg:
            print(f"· {name:<14} 없음 → 건너뜀 (npm run deploy -- setup)")
            continue
        path, sha = pkg.build(f)
        # 1. 코드 (같은 zip 이면 건너뜀)
        if cfg.get("CodeSha256") == sha and cfg.get("Architectures") == [SPEC["architecture"]]:
            code = "코드 그대로"
        else:
            aws("lambda", "update-function-code", "--function-name", name, "--zip-file", f"fileb://{path}",
                "--architectures", SPEC["architecture"])
            wait("function-updated-v2", name)
            code = f"코드 올림 ({os.path.getsize(path) / 1e6:.1f}MB)"
        # 2. 설정 (런타임·입구·제한 시간·메모리) — 환경 변수는 건드리지 않음
        gaps = {k: v for k, (_, v) in setting_gaps(f, config(name)).items() if k != "Architectures"}
        if gaps:
            args = {"Runtime": "--runtime", "Handler": "--handler", "Timeout": "--timeout", "MemorySize": "--memory-size"}
            aws("lambda", "update-function-configuration", "--function-name", name,
                *[x for k, v in gaps.items() for x in (args[k], str(v))])
            wait("function-updated-v2", name)
        url = function_url(name)
        print(f"✓ {name:<14} {code}" + (f" · 설정 맞춤: {', '.join(gaps)}" if gaps else "") + (f" · {health(url)}" if url else " · URL 없음"))


def main(argv):
    command = argv[0] if argv and argv[0] in ("check", "setup", "deploy") else "deploy"
    names = [a for a in argv if a not in ("check", "setup", "deploy") and not a.startswith("-")]
    targets = pkg.selected(names)
    started = time.time()
    try:
        {"check": check, "setup": setup, "deploy": deploy}[command](targets)
    except AwsError as e:
        raise SystemExit(f"✗ AWS 요청이 거절됐어요: {str(e)[:300]}")
    except FileNotFoundError:
        raise SystemExit("✗ aws 명령을 찾지 못했어요. AWS CloudShell 에서 실행해 주세요")
    print(f"끝 ({time.time() - started:.0f}초)")


if __name__ == "__main__":
    main(sys.argv[1:])
