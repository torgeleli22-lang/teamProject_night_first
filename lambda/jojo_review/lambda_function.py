"""jojo_review 입구 — 콘솔의 핸들러: lambda_function.lambda_handler (같이 넣을 파일: 이 폴더 전부 + lambda/shared 전부)"""
from core import HEALTH, handle, make_app
from grade import ROUTES

app = make_app({**ROUTES, **HEALTH})


def lambda_handler(event, context):
    return handle(app, event, context)
