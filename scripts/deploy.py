"""
Lambda 올리기 (npm run deploy) — AWS CloudShell 에서 실행해요 (aws CLI 와 로그인이 이미 되어 있어요).

  npm run deploy                    함수 3개 모두
  npm run deploy -- jojo_practice   함수 하나만 (여러 개 가능)

함수마다: lambda/<함수>/*.py + lambda/shared/*.py 를 zip 하나로 묶어(폴더 없이) 코드를 통째로 바꾼다
→ 반영될 때까지 기다린다 → 함수 URL 의 /health 로 확인한다.
같은 코드면 올리지 않아요. 환경 변수·설정·비밀 값은 건드리지도, 화면에 찍지도 않아요. 표준 라이브러리만 써요 (CloudShell 기본 python3).
"""
import base64
import glob
import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMBDA = os.path.join(ROOT, "lambda")
FUNCTIONS = ["jojo_auth", "jojo_practice", "jojo_review"]


def build(name):
    """함수 폴더 + shared 의 .py → zip (바이트). 파일 시각을 고정해 같은 코드면 같은 zip 이 된다"""
    files = sorted(glob.glob(os.path.join(LAMBDA, name, "*.py"))) + sorted(glob.glob(os.path.join(LAMBDA, "shared", "*.py")))
    names = [os.path.basename(f) for f in files]
    if len(set(names)) != len(names):
        sys.exit(f"✗ {name}: 함수 폴더와 shared 에 같은 이름의 파일이 있어요")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, arc in zip(files, names):
            info = zipfile.ZipInfo(arc, date_time=(2020, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as f:
                zf.writestr(info, f.read())
    return buf.getvalue(), names


def aws(*args):
    """aws CLI → JSON. 실패하면 오류 글(계정 번호는 가림)과 함께 멈춘다"""
    p = subprocess.run(["aws", *args, "--output", "json"], capture_output=True, text=True)
    if p.returncode != 0:
        message = p.stderr.strip().splitlines()[-1] if p.stderr.strip() else "알 수 없는 오류"
        raise RuntimeError(hide(message))
    return json.loads(p.stdout) if p.stdout.strip() else {}


def hide(text):
    import re
    return re.sub(r"\b\d{12}\b", "<계정>", text)


def health(url):
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=30) as res:
            info = json.loads(res.read().decode())
            return f"/health ✓ (AI_MODE={info.get('mode')})" if info.get("ok") else f"/health ✗ {info}"
    except urllib.error.HTTPError as e:
        return f"/health ✗ HTTP {e.code} {e.read().decode(errors='replace')[:80]} — 콘솔 테스트 탭에서 오류를 확인해 주세요"
    except Exception as e:
        return f"/health ✗ {type(e).__name__}"


def deploy(name):
    data, names = build(name)
    sha = base64.b64encode(hashlib.sha256(data).digest()).decode()
    current = aws("lambda", "get-function-configuration", "--function-name", name, "--query", "{sha: CodeSha256}")
    if current.get("sha") == sha:
        status = "코드 그대로 (올리지 않음)"
    else:
        path = os.path.join(ROOT, "dist", f"{name}.zip")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        aws("lambda", "update-function-code", "--function-name", name, "--zip-file", f"fileb://{path}", "--query", "{sha: CodeSha256}")
        try:
            aws("lambda", "wait", "function-updated-v2", "--function-name", name)
        except RuntimeError:   # 예전 aws CLI 에는 -v2 가 없어요
            aws("lambda", "wait", "function-updated", "--function-name", name)
        status = f"올림 ({len(names)}개 파일: {', '.join(names)})"
    try:
        url = aws("lambda", "get-function-url-config", "--function-name", name, "--query", "{url: FunctionUrl}")["url"]
        check = health(url)
    except RuntimeError:
        check = "/health — 함수 URL 이 없어요"
    return f"{status} · {check}"


def main(argv):
    names = argv or FUNCTIONS
    unknown = [n for n in names if n not in FUNCTIONS]
    if unknown:
        sys.exit(f"✗ 모르는 함수: {', '.join(unknown)} (함수: {', '.join(FUNCTIONS)})")
    if subprocess.run(["aws", "--version"], capture_output=True).returncode != 0:
        sys.exit("✗ aws CLI 가 없어요. AWS CloudShell 에서 실행해 주세요 (docs/DEPLOY_LAMBDA.md 3)")
    failed = False
    for name in names:
        try:
            print(f"{name}: {deploy(name)}", flush=True)
        except RuntimeError as e:
            failed = True
            print(f"{name}: ✗ {e}", flush=True)
    if failed:
        sys.exit("\n일부 함수를 올리지 못했어요. AccessDenied 면 콘솔에 붙여넣어 주세요 (docs/DEPLOY_LAMBDA.md 3)")


if __name__ == "__main__":
    main(sys.argv[1:])
