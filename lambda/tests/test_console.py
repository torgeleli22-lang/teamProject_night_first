"""콘솔용 폴더 lambda/console/<함수 이름>/ 가 원본과 같은지 (scripts/console_lambdas.py 가 만든 복사본)
다르면: npm run package 로 다시 만들어 주세요 (원본 lambda/api · lambda/functions 를 고친 뒤)"""
import os
import subprocess
import sys
import sysconfig
import unittest
import zipfile

from helpers import LAMBDA_DIR

sys.path.insert(0, os.path.join(os.path.dirname(LAMBDA_DIR), "scripts"))
import console_lambdas as console  # noqa: E402

FIX = " → npm run package 로 lambda/console 을 다시 만들어 주세요"


class ConsoleFolders(unittest.TestCase):
    def test_folders_hold_exact_copies(self):
        self.assertEqual(set(os.listdir(console.CONSOLE)) - {"__pycache__"},
                         {"README.md", console.LAYER_ZIP} | {f["name"] for f in console.functions()}, FIX)
        for f in console.functions():
            folder = os.path.join(console.CONSOLE, f["name"])
            wanted = dict(console.files_of(f))
            self.assertEqual(set(os.listdir(folder)) - {"__pycache__"}, set(wanted) | {"README.md"}, f["name"] + FIX)
            for name, source in wanted.items():
                with open(os.path.join(folder, name), "rb") as a, open(source, "rb") as b:
                    self.assertEqual(a.read(), b.read(), f"{f['name']}/{name} 가 원본과 달라요" + FIX)
            with open(os.path.join(folder, "README.md"), encoding="utf-8") as r:
                self.assertEqual(r.read(), console.function_readme(f), f"{f['name']}/README.md" + FIX)
        with open(os.path.join(console.CONSOLE, "README.md"), encoding="utf-8") as r:
            self.assertEqual(r.read(), console.top_readme(), "README.md" + FIX)

    def test_layer_has_pinned_libraries(self):
        with zipfile.ZipFile(os.path.join(console.CONSOLE, console.LAYER_ZIP)) as z:
            names = z.namelist()
        self.assertTrue(all(n.startswith("python/") for n in names))   # Lambda 가 /opt/python 으로 풀어요
        found = {n.split("/")[1] for n in names if n.endswith(".dist-info/METADATA")}
        for line in console.pkg.pinned().values():
            name, version = line.split("==")
            self.assertIn(f"{name.replace('-', '_')}-{version}.dist-info", found, line + FIX)
        self.assertTrue(any(n.endswith("aarch64-linux-gnu.so") for n in names))   # Lambda arm64 용

    def test_each_folder_runs_alone(self):
        # 그 폴더의 파일 + 라이브러리만으로 불러와지는지 (lambda/api 없이) — 빠진 파일이 있으면 콘솔에서 ImportError
        libs = [sysconfig.get_paths()["purelib"], sysconfig.get_paths()["platlib"]]
        for f in console.functions():
            folder = os.path.join(console.CONSOLE, f["name"])
            code = (f"import sys; sys.path[:0] = [{folder!r}, *{libs!r}]; import lambda_function as m; "
                    "print(sorted(m.ROUTES))")
            run = subprocess.run([sys.executable, "-I", "-B", "-c", code], capture_output=True, text=True, timeout=60,
                                 env={**os.environ, "AWS_DEFAULT_REGION": "ap-northeast-2", "POWERTOOLS_LOG_LEVEL": "WARNING"}, cwd=folder)
            self.assertEqual(run.returncode, 0, f"{f['name']}: {run.stderr[-500:]}")
            self.assertIn("'GET /health'", run.stdout, f["name"])


if __name__ == "__main__":
    unittest.main()
