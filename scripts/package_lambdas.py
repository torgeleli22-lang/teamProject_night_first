"""
Lambda 함수마다 zip 묶기 (npm run package). 표는 lambda/functions.json 하나예요.

  npm run package                      → dist/lambda/<함수 이름>.zip (functions.json 의 함수 모두)
                                         + lambda/console/ (콘솔에 붙여넣을 파일을 함수 이름별 폴더로 · 라이브러리 레이어 zip)
  npm run package -- jojo_auth         → 그 함수의 zip 만

함수 zip 안:
  lambda_function.py   그 함수의 입구 (lambda/functions/<이름>.py — 예전 함수는 lambda/api/lambda_function.py)
  <기능·공통 파일>      functions.json 의 files (lambda/api 에서)
  <라이브러리>          functions.json 의 libs — lambda/requirements.txt 의 버전으로, Lambda(Python 3.14 · arm64)용 배포판을 받아요

표준 라이브러리만 써서 Python 3.9 이상이면 어디서든 돌아가요 (CloudShell 포함). 라이브러리를 받을 때만 인터넷(PyPI)이 필요해요.
같은 내용이면 zip 도 똑같이 만들어서(파일 순서·시각 고정), npm run deploy 가 바뀐 함수만 올릴 수 있어요.
"""
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMBDA = os.path.join(ROOT, "lambda")
OUT = os.path.join(ROOT, "dist", "lambda")
SPEC = json.load(open(os.path.join(LAMBDA, "functions.json"), encoding="utf-8"))
FIXED_TIME = (2026, 1, 1, 0, 0, 0)   # zip 안 파일 시각 (같은 내용 → 같은 zip)
SKIP = ("__pycache__", ".pyc", ".dist-info/RECORD", ".dist-info/INSTALLER", ".dist-info/REQUESTED", ".dist-info/direct_url.json")


def pinned():
    """lambda/requirements.txt → {이름: "이름==버전"}"""
    out = {}
    for line in open(os.path.join(LAMBDA, "requirements.txt"), encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "==" in line:
            out[line.split("==")[0].strip()] = line
    return out


def install_libs(libs):
    """라이브러리 묶음을 Lambda(Python 3.14 · arm64)용으로 한 번 받아 둔다 → 폴더 경로 (같은 묶음은 다시 받지 않음)"""
    versions = pinned()
    wanted = sorted(versions[name] for name in libs)
    key = hashlib.sha256("\n".join(wanted).encode()).hexdigest()[:12]
    target = os.path.join(OUT, "libs", key)
    if os.path.exists(os.path.join(target, ".done")):
        return target
    shutil.rmtree(target, ignore_errors=True)
    py = SPEC["runtime"].replace("python", "")   # "3.14"
    cmd = [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-compile", "--target", target,
           "--implementation", "cp", "--python-version", py, "--only-binary=:all:",
           "--platform", "manylinux2014_aarch64", "--platform", "manylinux_2_28_aarch64", *wanted]
    print("  라이브러리 받기:", ", ".join(wanted))
    if subprocess.run(cmd, env={**os.environ, "PIP_ROOT_USER_ACTION": "ignore"}).returncode != 0:
        raise SystemExit("✗ 라이브러리를 받지 못했어요. 인터넷 연결과 pip 를 확인해 주세요 (pip 가 오래됐으면: python3 -m pip install --user --upgrade pip)")
    open(os.path.join(target, ".done"), "w").close()
    return target


def add_tree(zf, folder):
    for base, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__" and d != "bin")
        for name in sorted(files):
            full = os.path.join(base, name)
            arc = os.path.relpath(full, folder).replace(os.sep, "/")
            if name == ".done" or any(s in arc for s in SKIP):
                continue
            add_file(zf, full, arc)


def add_file(zf, path, arc):
    info = zipfile.ZipInfo(arc, FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    with open(path, "rb") as f:
        zf.writestr(info, f.read())


def build(f):
    """함수 하나의 zip → (경로, Lambda 가 쓰는 코드 해시 CodeSha256)"""
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{f['name']}.zip")
    libs = install_libs(f["libs"]) if f["libs"] else None
    with zipfile.ZipFile(path, "w") as zf:
        add_file(zf, os.path.join(LAMBDA, f["entry"]), "lambda_function.py")
        for name in sorted(f["files"]):
            add_file(zf, os.path.join(LAMBDA, "api", name), name)
        if libs:
            add_tree(zf, libs)
    data = open(path, "rb").read()
    return path, base64.b64encode(hashlib.sha256(data).digest()).decode()


def selected(names):
    known = {f["name"]: f for f in SPEC["functions"]}
    unknown = [n for n in names if n not in known]
    if unknown:
        raise SystemExit(f"✗ functions.json 에 없는 함수: {', '.join(unknown)} (있는 것: {', '.join(known)})")
    return [known[n] for n in names] if names else SPEC["functions"]


def main(names):
    for f in selected(names):
        path, _ = build(f)
        print(f"✓ {f['name']:<14} {os.path.getsize(path) / 1e6:.1f}MB  {os.path.relpath(path, ROOT)}  (파일 {len(f['files']) + 1}개 + {', '.join(f['libs'])})")
    if not names:   # 함수 이름별 콘솔용 폴더도 함께 (lambda/console — scripts/console_lambdas.py)
        import console_lambdas
        console_lambdas.write_all()


if __name__ == "__main__":
    main([a for a in sys.argv[1:] if not a.startswith("-")])
