"""
레이어 zip 만들기 (npm run layer) → dist/jojo_libs_layer.zip
lambda/requirements.txt 의 라이브러리(Powertools·Pydantic·tree-sitter)를 Lambda(Python 3.14 · arm64)용으로 받아 python/ 아래에 묶는다.
콘솔: Lambda → 계층 → 계층 생성(호환 런타임 Python 3.14, 아키텍처 arm64) → 함수 3개에 이 계층 추가. 이미 jojo_libs 가 있으면 다시 만들 필요 없어요.
"""
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist")
LIBS = [re.split(r"\s+#", line)[0].strip() for line in open(os.path.join(ROOT, "lambda", "requirements.txt"), encoding="utf-8")
        if line.strip() and not line.startswith("#")]

if __name__ == "__main__":
    target = os.path.join(OUT, "layer", "python")
    shutil.rmtree(os.path.join(OUT, "layer"), ignore_errors=True)
    cmd = [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-compile", "--target", target,
           "--implementation", "cp", "--python-version", "3.14", "--only-binary=:all:",
           "--platform", "manylinux2014_aarch64", "--platform", "manylinux_2_28_aarch64", *LIBS]
    if subprocess.run(cmd, env={**os.environ, "PIP_ROOT_USER_ACTION": "ignore"}).returncode != 0:
        raise SystemExit("✗ 라이브러리를 받지 못했어요. 인터넷 연결과 pip 를 확인해 주세요")
    path = os.path.join(OUT, "jojo_libs_layer.zip")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, dirs, files in os.walk(os.path.dirname(target)):
            dirs[:] = sorted(d for d in dirs if d not in ("__pycache__", "bin"))
            for name in sorted(files):
                full = os.path.join(base, name)
                zf.write(full, os.path.relpath(full, os.path.dirname(target)).replace(os.sep, "/"))
    print(f"✓ {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1e6:.1f}MB, {', '.join(LIBS)})")
