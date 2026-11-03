"""
jojo_admin — 관리자 화면·논문 실험 (관리자 코드 필요)

  GET /admin/overview · POST /admin/ai · POST /admin/code · POST /admin/experiment · GET /health

배포할 때 이 파일이 zip 안의 lambda_function.py 가 되고, lambda/functions.json 에 적은 파일·라이브러리만 함께 묶여요
(npm run package · npm run deploy, 구조 기준: docs/LAMBDA_STRUCTURE.md).
"""
import admin
import experiment
from core import (HEALTH, handle, make_app)

ROUTES = {**HEALTH, **admin.ROUTES, **experiment.ROUTES}
APP = make_app(ROUTES, guards={"/admin": admin.require_admin})   # 관리자 경로는 관리자 코드부터 (틀리면 401, 여러 번 틀리면 429)


def lambda_handler(event, context):
    # 1~4 는 core.handle: 콘솔 테스트 이벤트 맞추기 → 로그 이름표 → 경로 → 처리 함수 → 응답 (요청 수 제한·오류도 응답으로)
    return handle(APP, event, context)
