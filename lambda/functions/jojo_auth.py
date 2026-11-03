"""
jojo_auth — 로그인·현재 학습자

  GET /me · GET /auth/start · GET /auth/callback/google · POST /auth/logout · GET /health

배포할 때 이 파일이 zip 안의 lambda_function.py 가 되고, lambda/functions.json 에 적은 파일·라이브러리만 함께 묶여요
(npm run package · npm run deploy, 구조 기준: docs/LAMBDA_STRUCTURE.md).
"""
import auth
from core import (HEALTH, handle, make_app)

ROUTES = {**HEALTH, **auth.ROUTES}
APP = make_app(ROUTES)


def lambda_handler(event, context):
    # 1~4 는 core.handle: 콘솔 테스트 이벤트 맞추기 → 로그 이름표 → 경로 → 처리 함수 → 응답 (요청 수 제한·오류도 응답으로)
    return handle(APP, event, context)
