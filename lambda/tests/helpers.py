"""
Python Lambda 단위 테스트 도우미 (npm run test:lambda). AWS 에 연결하지 않는다.
- lambda/api 의 파일들을 불러온다.
"""
import importlib
import os
import sys

LAMBDA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(LAMBDA_DIR, "api")
sys.path.insert(0, API_DIR)
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")

import common  # noqa: E402


def load_lambda(name):
    """lambda/api 의 기능 파일 (예: "review")"""
    return importlib.import_module(name)
