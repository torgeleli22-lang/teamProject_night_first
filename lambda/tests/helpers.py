"""
Python Lambda 단위 테스트 도우미 (npm run test:lambda). AWS 에 연결하지 않는다.
- lambda/api 의 파일들을 불러온다 (커리큘럼은 같은 폴더의 content.json 에서 읽음).
"""
import importlib
import json
import os
import sys

LAMBDA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(LAMBDA_DIR, "api")
sys.path.insert(0, API_DIR)
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")

import common  # noqa: E402

with open(os.path.join(API_DIR, "content.json"), encoding="utf-8") as f:
    CONTENT = json.load(f)

SEED_ITEMS = {s["item"]["id"]: s["item"] for s in CONTENT["seed"]}
SEED_QUESTIONS = {q["id"]: q for s in CONTENT["seed"] for q in s["questions"]}


def seed_content():
    """load_content() 와 같은 모양의 시드 콘텐츠"""
    return {"items": dict(SEED_ITEMS), "questions": dict(SEED_QUESTIONS),
            "byItem": {s["item"]["id"]: s["questions"] for s in CONTENT["seed"]}}


def load_lambda(name):
    """lambda/api 의 기능 파일 (예: "submit_answer")"""
    return importlib.import_module(name)
