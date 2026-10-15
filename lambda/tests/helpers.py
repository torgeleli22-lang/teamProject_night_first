"""
Python Lambda 단위 테스트 도우미 (npm run test:lambda). AWS 에 연결하지 않는다.
- common.py 를 불러오고, 커리큘럼은 DynamoDB 대신 lambda/load-content/content.json 에서 채운다.
- 각 Lambda 의 lambda_function.py 를 폴더 이름으로 불러온다.
"""
import importlib.util
import json
import os
import sys

LAMBDA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(LAMBDA_DIR, "common"))
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")

import common  # noqa: E402

with open(os.path.join(LAMBDA_DIR, "load-content", "content.json"), encoding="utf-8") as f:
    CONTENT = json.load(f)

_curriculum = dict(CONTENT["curriculum"])
_curriculum["conceptMap"] = {c["id"]: c for c in _curriculum["concepts"]}
_curriculum["unitMap"] = {u["id"]: u for u in _curriculum["units"]}
common._cache["curriculum"] = _curriculum

SEED_ITEMS = {s["item"]["id"]: s["item"] for s in CONTENT["seed"]}
SEED_QUESTIONS = {q["id"]: q for s in CONTENT["seed"] for q in s["questions"]}


def seed_content():
    """load_content() 와 같은 모양의 시드 콘텐츠"""
    return {"items": dict(SEED_ITEMS), "questions": dict(SEED_QUESTIONS),
            "byItem": {s["item"]["id"]: s["questions"] for s in CONTENT["seed"]}}


def load_lambda(folder):
    path = os.path.join(LAMBDA_DIR, folder, "lambda_function.py")
    spec = importlib.util.spec_from_file_location(f"test_{folder.replace('-', '_')}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
