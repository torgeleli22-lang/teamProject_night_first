"""lambda/functions.json 이 코드와 맞는지 + 의존 규칙 (docs/LAMBDA_STRUCTURE.md §1·§2)
- 함수마다 묶는 파일 = 입구에서 import 를 따라간 파일 (빠지면 배포한 함수가 ImportError, 남으면 필요 없는 파일)
- 라이브러리 = 그 파일들이 부르는 외부 라이브러리 · 환경 변수 = 그 파일들이 읽는 이름
- 경로: 함수 6개를 합치면 서비스의 모든 경로이고, 한 경로는 한 함수에만 · 화면이 경로 앞부분으로 함수를 고를 수 있게
"""
import ast
import importlib.util
import json
import os
import re
import sys
import unittest

from helpers import API_DIR, LAMBDA_DIR

SPEC = json.load(open(os.path.join(LAMBDA_DIR, "functions.json"), encoding="utf-8"))
FUNCTIONS = SPEC["functions"]
# 서비스의 모든 경로 (하나라도 빠지거나 두 함수에 있으면 실패)
ALL_ROUTES = {
    "GET /health", "GET /me", "GET /auth/start", "GET /auth/callback/google", "POST /auth/logout",
    "GET /topic/random", "POST /topic/check", "POST /practice", "POST /practice/adjust",
    "POST /inspect", "POST /inspect/start", "POST /review", "POST /review/retry", "GET /code", "POST /tutor", "GET /study",
    "GET /admin/overview", "POST /admin/ai", "POST /admin/code", "POST /admin/experiment"}
LOCAL = {f[:-3] for f in os.listdir(API_DIR) if f.endswith(".py")}
# 외부 라이브러리 이름 (import 이름 → requirements 이름). boto3·botocore 는 Lambda 런타임에 들어 있다
LIBS = {"aws_lambda_powertools": "aws-lambda-powertools", "pydantic": "pydantic", "tree_sitter": "tree-sitter",
        "tree_sitter_javascript": "tree-sitter-javascript"}
RUNTIME = {"boto3", "botocore"}
# 코드가 읽지만 콘솔에 넣지 않는 환경 변수: 내 컴퓨터용 · Lambda 가 넣어 주는 것
NOT_CONSOLE_ENV = {"LOCAL_DEV", "DYNAMODB_ENDPOINT", "MOCK_DELAY_SEC", "AWS_LAMBDA_FUNCTION_NAME", "POWERTOOLS_SERVICE_NAME"}
# 기능 파일끼리 부를 수 있는 것 (같은 함수에 함께 묶임) — 나머지는 공통 조각만
FEATURE_IMPORTS = {"review": {"study", "tutor_chat"}, "experiment": {"practice"}, "practice": {"samples"}, "topics": {"samples"},
                   "samples": {"samples_js"}}
SHARED = {"core": set(), "ai": {"core"}, "code_store": {"core"}}


def imports(path):
    tree = ast.parse(open(path, encoding="utf-8").read())
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            out |= {a.name.split(".")[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
            out.add(n.module.split(".")[0])
    return out


def closure(entry):
    """입구에서 import 를 따라간 (lambda/api 파일들, 외부 모듈들)"""
    seen, todo, outside = set(), [os.path.join(LAMBDA_DIR, entry)], set()
    while todo:
        for m in imports(todo.pop()):
            if m in LOCAL:
                if m not in seen:
                    seen.add(m)
                    todo.append(os.path.join(API_DIR, f"{m}.py"))
            else:
                outside.add(m)
    return seen, outside


def env_names(modules):
    names = set()
    for m in modules:
        text = open(os.path.join(API_DIR, f"{m}.py"), encoding="utf-8").read()
        names |= set(re.findall(r"os\.environ(?:\.get)?[\[(]\s*\"([A-Z0-9_]+)\"", text))
        names |= {f"RATE_LIMIT_{n}" for n in re.findall(r"_num\(\"RATE_LIMIT_([A-Z0-9_]+)\"", text)}
        names |= set(re.findall(r"_env\": \"([A-Z0-9_]+)\"", text))   # auth.PROVIDERS 의 id_env·secret_env
    return names


def load_entry(f):
    spec = importlib.util.spec_from_file_location(f"entry_{f['name']}", os.path.join(LAMBDA_DIR, f["entry"]))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FunctionsJson(unittest.TestCase):
    def test_files_and_libraries_match_imports(self):
        for f in SPEC["functions"]:
            modules, outside = closure(f["entry"])
            entry_module = os.path.basename(f["entry"])[:-3]
            self.assertEqual(sorted(f["files"]), sorted(f"{m}.py" for m in modules - {entry_module}), f["name"])
            self.assertEqual(sorted(f["libs"]), sorted(LIBS[m] for m in outside if m in LIBS), f["name"])
            unknown = {m for m in outside if m not in LIBS and m not in RUNTIME and m not in sys.stdlib_module_names}
            self.assertEqual(unknown, set(), f"{f['name']}: functions.json·LAMBDA_STRUCTURE §4 에 없는 라이브러리")

    def test_requirements_pin_every_library(self):
        pinned = {line.split("==")[0].strip() for line in open(os.path.join(LAMBDA_DIR, "requirements.txt"), encoding="utf-8")
                  if "==" in line}
        self.assertEqual(pinned, set(LIBS.values()))

    def test_environment_names(self):
        shared = set(SPEC["sharedEnv"])
        for f in SPEC["functions"]:
            used = env_names(closure(f["entry"])[0]) - NOT_CONSOLE_ENV
            listed = shared | set(f["env"])
            missing = {n for n in used if n not in listed and not any(p.endswith("*") and n.startswith(p[:-1]) for p in listed)}
            self.assertEqual(missing, set(), f"{f['name']}: functions.json 에 없는 환경 변수")
            self.assertEqual(set(f["env"]) - used, set(), f"{f['name']}: 쓰지 않는 환경 변수")
        # 비밀 값은 그 값을 쓰는 함수에만
        holders = lambda name: {f["name"] for f in FUNCTIONS if name in f["env"]}
        self.assertEqual(holders("GOOGLE_CLIENT_SECRET"), {"jojo_auth"})
        self.assertEqual(holders("ADMIN_TOKEN"), {"jojo_admin"})

    def test_routes_split_without_overlap(self):
        seen = {}
        for f in FUNCTIONS:
            routes = load_entry(f).ROUTES
            self.assertIn("GET /health", routes, f["name"])
            for key in routes:
                if key == "GET /health":
                    continue
                self.assertNotIn(key, seen, f"{key}: {seen.get(key)} 와 {f['name']} 에 모두 있음")
                seen[key] = f["name"]
                path = key.split(" ", 1)[1]
                owners = [g["name"] for g in FUNCTIONS if any(path == p or path.startswith(p + "/") for p in g["paths"])]
                self.assertEqual(owners, [f["name"]], f"{key}: 화면이 경로 앞부분(paths)으로 이 함수를 고를 수 있어야 해요")
        self.assertEqual(set(seen) | {"GET /health"}, ALL_ROUTES)
        # 기능 파일의 경로는 모두 어느 함수엔가 들어 있다 (새 경로를 만들고 입구에 넣지 않은 경우)
        for m in LOCAL:
            text = open(os.path.join(API_DIR, f"{m}.py"), encoding="utf-8").read()
            for key in re.findall(r'"((?:GET|POST) /[\w/]*)":', text):
                self.assertIn(key, ALL_ROUTES, f"{m}.py")

    def test_settings(self):
        self.assertEqual((SPEC["runtime"], SPEC["architecture"], SPEC["handler"]), ("python3.14", "arm64", "lambda_function.lambda_handler"))
        self.assertEqual([f["key"] for f in FUNCTIONS], ["auth", "practice", "inspect", "review", "study", "admin"])
        for f in SPEC["functions"]:
            self.assertTrue(3 <= f["timeout"] <= 900 and f["memory"] in (128, 256, 512, 1024), f["name"])


class DependencyRules(unittest.TestCase):
    def test_shared_pieces_point_only_to_core(self):
        for name, allowed in SHARED.items():
            self.assertEqual(imports(os.path.join(API_DIR, f"{name}.py")) & LOCAL, allowed, name)

    def test_features_use_shared_pieces_and_listed_exceptions(self):
        for name in LOCAL - set(SHARED):
            local = imports(os.path.join(API_DIR, f"{name}.py")) & LOCAL
            self.assertEqual(local - set(SHARED) - FEATURE_IMPORTS.get(name, set()), set(), f"{name}.py 가 다른 기능 파일을 불러요")


if __name__ == "__main__":
    unittest.main()
