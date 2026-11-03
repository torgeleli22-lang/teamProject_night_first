"""
jojo_practice — 연습 코드 만들기·더 쉽게/어렵게·주제 고르기

  POST /practice · POST /practice/adjust · GET /topic/random · POST /topic/check · GET /health

배포할 때 이 파일이 zip 안의 lambda_function.py 가 되고, lambda/functions.json 에 적은 파일·라이브러리만 함께 묶여요
(npm run package · npm run deploy, 구조 기준: docs/LAMBDA_STRUCTURE.md).
"""
import practice
import topics
from core import (HEALTH, handle, make_app)

ROUTES = {**HEALTH, **practice.ROUTES, **topics.ROUTES}
APP = make_app(ROUTES)


def lambda_handler(event, context):
    # 1~4 는 core.handle: 콘솔 테스트 이벤트 맞추기 → 로그 이름표 → 경로 → 처리 함수 → 응답 (요청 수 제한·오류도 응답으로)
    return handle(APP, event, context)
