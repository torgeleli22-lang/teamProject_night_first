"""
공통 조각 — core: 모든 Lambda 함수에 들어가요 (구조 기준: docs/LAMBDA_STRUCTURE.md)

  1. 설정 (환경 변수·숫자)               5. 요청 수 제한
  2. AWS 연결 (DynamoDB·Bedrock)          6. 학습자(세션)
  3. 요청·응답 (Powertools 경로·로그, 본문 모양)  7. 설정 값 (OPS#CONFIG) · AI 끄기 스위치
  4. DynamoDB 읽기·쓰기 도구              8. 하루 사용 수 (OPS#STATS)
  9. id 만들기 (시간순 UUID)

AI 호출은 ai.py, 읽을 코드(CODE#)는 code_store.py 에 있어요. core 는 둘을 부르지 않아요 (ai·code_store → core 방향만).
"""
import base64
import json
import os
import random
import re
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import unquote_plus

import boto3
from boto3.dynamodb.conditions import Key
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import CORSConfig, LambdaFunctionUrlResolver, Response
from botocore.config import Config
from pydantic import BaseModel, ConfigDict, ValidationError

# ─────────────────────────────────────────────────────────────
# 1. 설정
# ─────────────────────────────────────────────────────────────


TABLE_NAME = os.environ.get("TABLE_NAME", "jojo_table")            # 모든 데이터를 담는 테이블 (파티션 키 pk, 정렬 키 sk)


TTL_ATTR = os.environ.get("TTL_ATTR", "jojo_ttl")                  # 테이블의 TTL(자동 삭제) 속성 이름


DB_REGION = os.environ.get("DB_REGION", "ap-northeast-2")          # DynamoDB 가 있는 곳 (서울)


BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")     # Bedrock 모델을 부르는 곳


MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")


AI_MODE = os.environ.get("AI_MODE", "live")                         # live: 실제 AI, mock: 흉내 낸 응답(비용 없음), off: AI 없이


ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]


# 보관 기간: 학습자가 로그인했는지(member)에 따라 다르다 — keep_seconds() 한 곳에서 정한다
#   로그인 안 함: 학습자 id 는 브라우저 탭(sessionStorage)에만 → 탭·브라우저를 닫으면 다시 찾을 수 없으니 서버 기록도 짧게
#   로그인 (Google, auth.py): 계정에 묶여 오래 남는다
ANON_HOURS = 12               # 로그인 안 한 학습자: 마지막 사용 후 이 시간이 지나면 학습자·기록이 사라진다


ANON_CODE_HOURS = 24       # 로그인 안 한 학습자의 연습 코드·첨삭·'내 공부' 기록


MEMBER_DAYS = 365             # 로그인 학습자: 학습자·'내 공부' 기록


LOGIN_DAYS = 30               # 로그인 토큰: 마지막 사용 후 이 기간이 지나면 다시 로그인


SESSION_REFRESH_SEC = 15 * 60  # 학습자의 '마지막 사용 시각'은 이 간격마다만 고쳐 쓴다 (요청마다 쓰지 않아 빠르고 쌈)


MOCK_DELAY_SEC = float(os.environ.get("MOCK_DELAY_SEC", "0.8"))   # 목업 응답을 기다리는 시간 (화면 확인용)


MAX_BODY_BYTES = 256 * 1024   # 요청 본문 최대 크기 (300줄 코드 + 메모 → 수십 KB)


# 서비스 숫자 (바꾸면 바로 반영)
MAX_CODE_LINES = 300          # 내 코드 점검: 올릴 수 있는 최대 줄 수


REGEN_LIMIT = 5               # 같은 코드에서 '더 쉽게·더 어렵게'로 다시 만들 수 있는 횟수


CODE_KEEP_DAYS = 30        # 로그인 학습자: 연습 코드 원본·첨삭·튜터 대화


UPLOAD_KEEP_DAYS = 1          # 사용자가 올린 코드 보관 기간 (로그인해도 짧게 — 개인정보)


MAX_MEMOS = 20                # 한 번에 붙일 수 있는 메모 수


MAX_MEMO_CHARS = 500          # 메모 하나의 최대 글자 수


MAX_TUTOR_TURNS = 10          # 첨삭 결과의 메모 하나에 AI 튜터에게 물을 수 있는 횟수


MAX_TUTOR_CHARS = 300         # 튜터 질문 하나의 최대 글자 수


MAX_RETRIES = 3               # 첨삭 뒤 힌트를 보고 메모 하나를 다시 써 볼 수 있는 횟수


LANGUAGES = {"python": "Python", "javascript": "JavaScript"}   # 연습 모드 언어 (내 코드 점검은 아직 Python 만, Java 는 나중에)


# 개념 꼬리표: ※ 지점(과 메모 범위)이 어떤 '흐름'을 읽는 곳인지. '내 공부'의 개념별 약점 지도·집중 연습에 쓴다
CONCEPTS = {
    "branch": {"name": "조건 분기", "description": "if·else 로 길이 갈리는 곳"},
    "loop_update": {"name": "반복이 값을 바꾸는 곳", "description": "반복할 때마다 합계·목록·개수가 쌓이거나 바뀌는 곳"},
    "call_flow": {"name": "함수가 함수를 부름", "description": "값이 함수 사이로 넘어가고 돌아오는 곳"},
    "data_update": {"name": "자료구조 다루기", "description": "딕셔너리·리스트(객체·배열)에서 찾고 넣고 바꾸는 곳"},
    "class_state": {"name": "객체 상태 바뀜", "description": "클래스의 self(this) 값이 메서드로 바뀌는 곳"},
    "exception": {"name": "예외 흐름", "description": "raise·throw, try 로 흐름이 건너뛰는 곳"},
    "recursion": {"name": "재귀·되돌아가기", "description": "자기 자신을 부르거나 기록을 거꾸로 따라가는 곳"},
    "algorithm": {"name": "알고리즘 핵심", "description": "정렬·탐색·최단 경로·동적 계획법의 중심 계산"},
}


# 난이도 4단계 (고정 기준이 아니라 출발점. 사용자가 '더 쉽게·더 어렵게'로 조정)
LEVELS = {
    1: {"name": "입문", "description": "짧은 코드, 변수·조건문·반복문이 위에서 아래로 흘러가요."},
    2: {"name": "초급", "description": "함수 여러 개가 서로를 불러요. 리스트와 딕셔너리(배열과 객체)가 나와요."},
    3: {"name": "중급", "description": "60~100줄. 클래스, 재귀, 예외 처리처럼 흐름이 오가는 작은 프로그램이에요."},
    4: {"name": "고급", "description": "100~180줄. 자료구조와 알고리즘(최단 경로·동적 계획법·정렬·탐색 등)이 실제 문제를 푸는 코드예요."},
}


def _num(name, default):
    value = os.environ.get(name, "")
    return float(value) if value.strip() else default


# 요청 수 제한 (0 이면 끔). 학교 교실처럼 여러 명이 같은 IP 를 쓰는 경우를 막지 않도록 IP 기준은 넉넉하게
LIMITS = {
    "per_ip_per_minute": _num("RATE_LIMIT_PER_MINUTE", 600),           # IP 하나의 전체 요청 (1분)
    "ai_per_session_hour": _num("RATE_LIMIT_AI_PER_SESSION_HOUR", 30),  # 학습자 한 명의 AI 요청 (1시간: 코드 받기·주제 판정·첨삭)
    "ai_per_ip_hour": _num("RATE_LIMIT_AI_PER_IP_HOUR", 300),           # IP 하나의 AI 요청 (1시간)
    "ai_total_hour": _num("RATE_LIMIT_AI_TOTAL_HOUR", 400),             # 서비스 전체 AI 요청 (1시간)
    "new_sessions_per_ip_hour": _num("RATE_LIMIT_NEW_SESSIONS_PER_HOUR", 120),  # IP 하나가 새로 만드는 학습자 (1시간)
}


MONTHLY_BUDGET_USD = _num("AI_MONTHLY_BUDGET_USD", 10)   # 한 달 AI 예산 (USD). 넘을 수 있는 호출은 하지 않고 예시 코드·규칙 첨삭으로


# AI 가격표 (USD / 100만 토큰) — 예산 판단·관리자 화면 표시용 추정치
PRICE = {
    "claude-haiku-4-5": {"input": 1, "output": 5, "cacheRead": 0.1},
}


# ─────────────────────────────────────────────────────────────
# 2. AWS 연결 (처음 쓸 때 한 번 만들고, 같은 함수가 다시 불리면 그대로 다시 쓴다)
#    DYNAMODB_ENDPOINT 는 내 컴퓨터에서 실행할 때만 쓴다 (npm run api)
# ─────────────────────────────────────────────────────────────


table = boto3.resource("dynamodb", region_name=DB_REGION, endpoint_url=os.environ.get("DYNAMODB_ENDPOINT") or None).Table(TABLE_NAME)


_clients = {}


def bedrock():
    if "bedrock" not in _clients:
        _clients["bedrock"] = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION,
                                           config=Config(read_timeout=180, retries={"max_attempts": 2}))   # 코드 만들기 한 번이 20초 안팎, 중급(150줄)·고급(300줄)은 1~2분
    return _clients["bedrock"]


# ─────────────────────────────────────────────────────────────
# 3. 요청 읽기·응답 만들기
# ─────────────────────────────────────────────────────────────


SESSION_HEADER = "x-session-id"

# 로그: 모든 줄이 JSON 이고 함수 이름·경로·요청 id 가 붙는다 (CloudWatch Logs Insights 에서 `filter level="ERROR"` 처럼 찾기)
#       요청 본문·코드·메모·비밀 값은 남기지 않는다. 함수 이름은 Lambda 가 넣어 주는 AWS_LAMBDA_FUNCTION_NAME
logger = Logger(service=os.environ.get("POWERTOOLS_SERVICE_NAME") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or "local")


class ApiError(Exception):
    """화면에 그대로 보여 줄 오류 (status: HTTP 상태 코드)"""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Body(BaseModel):
    """요청 본문의 모양 (경로마다 기능 파일에서 이 모양을 이어 만든다). 형식은 엄격하게: "3" 은 숫자가 아니고 true 도 숫자가 아니다"""
    model_config = ConfigDict(strict=True, extra="ignore")


def read_body(req, model):
    """요청 본문 → 정한 모양(model). 틀리면 400 (어느 칸이 틀렸는지는 로그에만 남긴다)"""
    try:
        return model.model_validate(req["body"])
    except ValidationError as e:
        logger.info("요청 값 오류", extra={"fields": [".".join(map(str, x["loc"])) for x in e.errors()][:5]})
        raise ApiError(400, "요청 값을 확인해 주세요.")


def to_url_event(event):
    """콘솔 '테스트' 이벤트({"path": "/health", "method": "GET", ...값})도 함수 URL 이벤트 모양으로. 경로 끝의 / 는 뗀다"""
    if "rawPath" not in event:
        values = {k: v for k, v in event.items() if k not in ("path", "method", "headers")}
        event = {"rawPath": event.get("path") or "/", "rawQueryString": "", "headers": event.get("headers") or {},
                 "body": json.dumps(values, ensure_ascii=False) if values else None, "isBase64Encoded": False,
                 "requestContext": {"http": {"method": event.get("method") or ("POST" if values else "GET"), "sourceIp": "local"}}}
    path = (event.get("rawPath") or "/").rstrip("/") or "/"
    context = event.get("requestContext") or {}   # 실제 함수 URL 이벤트에는 늘 있는 값 (내 컴퓨터·콘솔 이벤트를 위해 채운다)
    context = {"stage": "$default", **context, "http": {"path": path, **(context.get("http") or {})}}
    return {**event, "rawPath": path, "headers": event.get("headers") or {}, "requestContext": context}


def read_request(event):
    """함수 URL 이벤트 → 기능 파일이 다루는 dict (경로·학습자 헤더·본문·접속 IP)"""
    http = (event.get("requestContext") or {}).get("http") or {}
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    raw = event.get("body")
    body, problem = {}, None   # 본문을 읽을 수 없으면 처리 함수 대신 400/413 으로 답한다
    if raw and len(raw) > MAX_BODY_BYTES * 1.4:
        problem = ApiError(413, "요청이 너무 커요.")
    else:
        try:
            if raw and event.get("isBase64Encoded"):
                raw = base64.b64decode(raw).decode("utf-8")
            body = json.loads(raw) if raw else {}
        except (ValueError, UnicodeDecodeError):
            problem = ApiError(400, "잘못된 요청 형식이에요.")
    query = {}
    for part in (event.get("rawQueryString") or "").split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            query[unquote_plus(k)] = unquote_plus(v)
    return {
        "method": http.get("method") or "GET",
        "path": event.get("rawPath") or "/",
        "query": query,
        "headers": headers,
        "body": body if isinstance(body, dict) else {},
        # 요청 제한은 IP 로 센다. 브라우저가 보낸 x-forwarded-for 는 믿지 않고 함수 URL 이 확인한 주소를 쓴다
        "ip": http.get("sourceIp") or "local",
        "origin": headers.get("origin"),
        "host": headers.get("host") or "",                                       # 로그인 콜백 주소를 만들 때
        "domain": (event.get("requestContext") or {}).get("domainName") or "",   # 함수 URL 의 도메인
        "problem": problem,
    }


def reply(status, data, req=None):
    """화면으로 보낼 JSON 응답. 학습자를 새로 만들었거나 확인했으면 세션 id 를 헤더로 알려 준다 (CORS 헤더는 Powertools 가 붙인다)"""
    headers = {"cache-control": "no-store"}
    user = (req or {}).get("user")
    if user:
        # 로그인 안 함: 학습자 id / 로그인: 로그인 토큰 (계정의 학습자 id 는 화면으로 보내지 않는다)
        headers[SESSION_HEADER] = user.get("sid") or user["userId"]
    return Response(status, "application/json; charset=utf-8", "" if data is None else json.dumps(to_plain(data), ensure_ascii=False), headers)


def make_app(routes, guards=None):
    """경로 표(ROUTES: {"POST /review": 처리 함수}) → Powertools 경로 처리기 (모든 함수가 이 하나로 만든다)
    guards: {"/admin": 확인 함수} — 그 경로로 시작하면 처리 함수 전에 확인 (관리자 코드)"""
    # CORS: 허용한 화면 주소(ALLOWED_ORIGINS)에서 온 요청만 브라우저가 응답을 읽을 수 있다. 비워 두면 모두 허용(내 컴퓨터)
    cors = CORSConfig(allow_origin=ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else "*", extra_origins=ALLOWED_ORIGINS[1:],
                      allow_headers=["content-type", SESSION_HEADER, "x-admin-token"], expose_headers=[SESSION_HEADER], max_age=86400)
    app = LambdaFunctionUrlResolver(cors=cors)
    for key, fn in routes.items():
        method, path = key.split(" ", 1)
        app.route(path, method=method)(_route_handler(app, fn, path, guards or {}))

    @app.not_found
    def not_found(_):
        return reply(404, {"error": "없는 API 예요."})

    @app.exception_handler(Exception)
    def unexpected(_):   # 처리 함수 밖에서 난 오류 (보통은 _route_handler 가 먼저 잡는다)
        logger.exception("예상하지 못한 오류")
        return reply(500, {"error": "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요."})
    return app


def _route_handler(app, fn, path, guards):
    """처리 함수 하나를 감싼다: 요청 읽기 → 관리자 확인 또는 요청 수 제한 → 처리 함수 → 응답 (오류도 응답으로) → 요청 로그"""
    guard = next((g for prefix, g in guards.items() if path.startswith(prefix)), None)

    def run():
        started = time.time()
        # 1. 화면에서 온 요청 꺼내기
        req = read_request(app.current_event.raw_event)
        try:
            if req["problem"]:
                raise req["problem"]
            # 2. 관리자 경로는 관리자 코드부터 (여러 번 틀리면 잠금). 나머지는 IP 별 요청 수 제한
            if guard:
                guard(req)
            elif not hit_limit(f"all:{req['ip']}", LIMITS["per_ip_per_minute"], 60):
                raise ApiError(429, "요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요.")
            # 3. 기능 실행 → 응답 (로그인은 다른 주소로 보내기 302)
            result = fn(req)
            if isinstance(result, dict) and result.get("_redirect"):
                res = Response(302, None, "", {"location": result["_redirect"], "cache-control": "no-store"})
            else:
                res = reply(200, result, req)
        except ApiError as e:   # 예상한 오류 (사용자 잘못·한도): 짧게
            res = reply(e.status, {"error": e.message}, req)
        except Exception:      # 예상하지 못한 오류: 파일·줄·스택 전체를 로그에, 학습자에게는 짧게
            logger.exception("예상하지 못한 오류")
            res = reply(500, {"error": "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요."}, req)
        # 4. 요청 로그 (상태·걸린 시간·학습자 id 앞 8자리만)
        logger.info("요청", extra={"status": res.status_code, "ms": round((time.time() - started) * 1000),
                                   "user": ((req.get("user") or {}).get("userId") or "")[:8]})
        return res
    run.__name__ = fn.__name__
    return run


_warm = {"done": False}


def handle(app, event, context):
    """Lambda 입구(lambda_handler)가 부르는 한 가지 길 — 모든 함수 같음"""
    # 1. 콘솔 테스트 이벤트도 함수 URL 이벤트 모양으로
    event = to_url_event(event)
    # 2. 이 요청의 로그 이름표 (경로·요청 id·처음 실행인지)
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "")
    logger.append_keys(route=f"{method} {event['rawPath']}", request_id=getattr(context, "aws_request_id", None), cold_start=not _warm["done"])
    _warm["done"] = True
    # 3. 경로 → 처리 함수 → 응답 (CORS·사전 요청(OPTIONS)·없는 경로는 Powertools 가 처리)
    return app.resolve(event, context)


# ─────────────────────────────────────────────────────────────
# 4. DynamoDB 읽기·쓰기 도구
#    DynamoDB 는 숫자를 Decimal 로 주고받아서, 읽을 때 int/float 로, 쓸 때 Decimal 로 바꾼다
#
#    키 이름표 — 테이블 하나(jojo_table)에 들어가는 모든 항목. 기능 파일은 아래 함수·이름으로만 pk·sk 를 만든다
#      규칙 1  pk = 무엇의 것인가 + id      규칙 2  sk = 어떤 종류인가 (+ 시각·번호)      규칙 3  운영 데이터는 OPS# 로 시작
#
#      pk                         sk                                   무엇
#      USER#<사용자 id>           PROFILE                              학습자 (난이도·최근 주제·회원 정보)
#      USER#<사용자 id>           STUDYREC#<코드 id>                   내 공부 기록 (코드 하나당 한 줄)
#      CODE#<코드 id>             INFO                                 읽을 코드 (코드·※ 지점·모범 설명·userId)
#      CODE#<코드 id>             REVIEW#<시각>                        첨삭 결과
#      CODE#<코드 id>             REVIEW#<시각>#RETRY#<항목 번호>      힌트 보고 다시 써 보기
#      CODE#<코드 id>             REVIEW#<시각>#CHAT#<항목 번호>       AI 튜터 대화
#      LOGIN#<토큰>               USER                                 로그인 토큰 → 사용자
#      ACCOUNT#<제공자>:<번호>    USER                                 소셜 계정 → 사용자
#      AUTH#<state>               STATE                                로그인 시작 기록 (10분)
#      OPS#STATS                  DAY#<날짜>                           하루 사용 수
#      OPS#USAGE                  <월>#<작업>#<모델>                   AI 사용량·비용
#      OPS#AILOG                  <시각>                               AI 호출 기록
#      OPS#CONFIG                 ai_switch · admin_code_hash          AI 끄기 · 관리자 코드
#      OPS#LIMIT                  <종류>:<대상>#<시간 칸>              요청 수 제한
# ─────────────────────────────────────────────────────────────


PROFILE, INFO, USER, STATE = "PROFILE", "INFO", "USER", "STATE"


OPS_STATS, OPS_USAGE, OPS_AILOG, OPS_CONFIG, OPS_LIMIT = "OPS#STATS", "OPS#USAGE", "OPS#AILOG", "OPS#CONFIG", "OPS#LIMIT"


def user_pk(user_id):
    return f"USER#{user_id}"


def studyrec_sk(code_id):
    return f"STUDYREC#{code_id}"


def code_pk(code_id):
    return f"CODE#{code_id}"


def login_pk(token):
    return f"LOGIN#{token}"


def account_pk(provider_and_number):
    return f"ACCOUNT#{provider_and_number}"


def auth_pk(state):
    return f"AUTH#{state}"


def to_plain(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: to_plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_plain(v) for v in value]
    return value


def to_db(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_db(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_db(v) for v in value]
    return value


def now_ms():
    return int(time.time() * 1000)


def ttl_after(seconds):
    """지금부터 seconds 초 뒤 (TTL 속성 값). DynamoDB 가 이 시각이 지나면 항목을 지운다"""
    return int(time.time()) + int(seconds)


def alive(item):
    """TTL 삭제는 늦을 수 있어서, 기한이 지난 항목은 읽을 때 걸러 낸다"""
    t = (item or {}).get(TTL_ATTR)
    return not t or t > time.time()


def time_id(ms=None):
    """시간순으로 정렬되는 고유 번호 (밀리초 × 1000 + 임의 수)"""
    return (ms or now_ms()) * 1000 + random.randint(0, 999)


def pad(n, width=16):
    return str(max(0, int(n))).zfill(width)


def get_item(pk, sk):
    return to_plain(table.get_item(Key={"pk": pk, "sk": sk}, ConsistentRead=True).get("Item"))


def put_item(item):
    table.put_item(Item=to_db(item))


def delete_item(pk, sk):
    table.delete_item(Key={"pk": pk, "sk": sk})


def query_all(pk, prefix=None, start=None, descending=False, limit=None):
    """한 파티션(pk)의 항목을 끝까지 읽는다. prefix: sk 가 이것으로 시작하는 것만, start: sk 가 이 값 이상인 것만"""
    cond = Key("pk").eq(pk)
    if prefix:
        cond = cond & Key("sk").begins_with(prefix)
    elif start is not None:
        cond = cond & Key("sk").gte(start)
    args = {"KeyConditionExpression": cond, "ScanIndexForward": not descending}
    out = []
    while True:
        if limit:
            args["Limit"] = limit - len(out)
        page = table.query(**args)
        out += page.get("Items", [])
        if "LastEvaluatedKey" not in page or (limit and len(out) >= limit):
            return to_plain(out)
        args["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def update_item(pk, sk, set_values=None, add_values=None, condition=None, names=None, values=None, return_new=False):
    """SET(덮어쓰기)·ADD(더하기). condition 이 맞지 않으면 None, 아니면 갱신된 항목(return_new) 또는 {}"""
    names = dict(names or {})
    vals = dict(values or {})
    parts = []
    sets = [(k, v) for k, v in (set_values or {}).items()]
    if sets:
        exprs = []
        for i, (k, v) in enumerate(sets):
            names[f"#s{i}"] = k
            vals[f":s{i}"] = to_db(v)
            exprs.append(f"#s{i} = :s{i}")
        parts.append("SET " + ", ".join(exprs))
    adds = list((add_values or {}).items())
    if adds:
        exprs = []
        for i, (k, v) in enumerate(adds):
            names[f"#a{i}"] = k
            vals[f":a{i}"] = to_db(v)
            exprs.append(f"#a{i} :a{i}")
        parts.append("ADD " + ", ".join(exprs))
    args = {"Key": {"pk": pk, "sk": sk}, "UpdateExpression": " ".join(parts), "ExpressionAttributeNames": names,
            "ReturnValues": "ALL_NEW" if return_new else "NONE"}
    if vals:
        args["ExpressionAttributeValues"] = vals
    if condition:
        args["ConditionExpression"] = condition
    try:
        result = table.update_item(**args)
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return None
    return to_plain(result.get("Attributes", {}))


def batch_delete(keys):
    with table.batch_writer() as batch:
        for k in keys:
            batch.delete_item(Key={"pk": k["pk"], "sk": k["sk"]})


def batch_put(items):
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=to_db(item))


# ─────────────────────────────────────────────────────────────
# 5. 요청 수 제한 (함수가 여러 개 떠도 함께 세도록 DynamoDB 의 OPS#LIMIT / 키#구간 항목에 센다)
# ─────────────────────────────────────────────────────────────


def bump_counter(key, window_sec):
    window_start = int(time.time() // window_sec * window_sec) * 1000
    item = update_item(OPS_LIMIT, f"{key}#{window_start}", set_values={TTL_ATTR: window_start // 1000 + window_sec + 60},
                       add_values={"n": 1}, return_new=True)
    return int(item.get("n", 0))


def read_counter(key, window_sec):
    window_start = int(time.time() // window_sec * window_sec) * 1000
    return int((get_item(OPS_LIMIT, f"{key}#{window_start}") or {}).get("n", 0))


def hit_limit(key, limit, window_sec):
    """한 번 센다. 한도 안이면 True (limit 이 0 이면 항상 True)"""
    return limit <= 0 or bump_counter(key, window_sec) <= limit


def ai_allowed(req):
    """AI 를 부르는 요청: 학습자·IP·전체 1시간 한도 (넘으면 False)"""
    user = req.get("user")
    if user and not hit_limit(f"ai-s:{user['userId']}", LIMITS["ai_per_session_hour"], 3600):
        return False
    return hit_limit(f"ai-ip:{req['ip']}", LIMITS["ai_per_ip_hour"], 3600) and hit_limit("ai-all", LIMITS["ai_total_hour"], 3600)


AI_LIMIT_MESSAGE = "AI 를 잠깐 너무 많이 썼어요. 조금 쉬었다가(최대 1시간) 다시 해 주세요."


# ─────────────────────────────────────────────────────────────
# 6. 학습자 (세션) — 로그인 없이 브라우저 탭마다 한 명. 세션 id 는 x-session-id 헤더로 주고받는다
#    USER#<사용자 id> / PROFILE : 고른 난이도, 최근 주제, (로그인) 회원 정보
# ─────────────────────────────────────────────────────────────


SESSION_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


RECENT_TOPICS = 10   # 랜덤 주제에서 빼는 최근 주제 수


def user_from_item(item):
    return {"userId": item["pk"][len("USER#"):], "level": item.get("level"), "recentTopics": item.get("recentTopics", []), "createdAt": item.get("createdAt", 0),
            "member": bool(item.get("member")), "name": item.get("name"), "provider": item.get("provider"),   # member: 로그인 학습자
            "formerUserIds": item.get("formerUserIds", [])}   # 로그인 전 탭의 학습자 id (그때 받은 코드도 계속 열 수 있게)


def keep_seconds(user, what):
    """보관 기간(초). what: user(학습자) · code(연습 코드·첨삭) · study('내 공부' 기록) · upload(올린 코드)"""
    if what == "upload":
        return UPLOAD_KEEP_DAYS * 86400
    if (user or {}).get("member"):
        return {"user": MEMBER_DAYS, "code": CODE_KEEP_DAYS, "study": MEMBER_DAYS}[what] * 86400
    return (ANON_HOURS if what == "user" else ANON_CODE_HOURS) * 3600


def get_user(req):
    """요청한 학습자. 아는 세션이면 마지막 사용 시각을 늘리고, 없거나 만료됐으면 새로 만든다 (IP 당 1시간 한도)"""
    if req.get("user"):
        return req["user"]
    sid = req["headers"].get(SESSION_HEADER) or ""
    if SESSION_ID.match(sid):
        # 1. 로그인 안 한 학습자: 학습자 id 그대로 (계정의 학습자 id 를 직접 보내면 받지 않는다 — 로그인 토큰으로만)
        found = get_item(user_pk(sid), PROFILE)
        if found and alive(found) and not found.get("member"):
            return use_user(req, found, sid)
        # 2. 로그인 학습자: 로그인 토큰 (LOGIN#<토큰> / USER → 계정의 학습자, auth.py 가 만든다)
        login = get_item(login_pk(sid), USER)
        if login and alive(login) and login.get("userId"):   # userId 가 없는 토큰은 로그인으로 보지 않는다 (예전 형식은 '예전 데이터 옮기기'로 고친다)
            member = get_item(user_pk(login["userId"]), PROFILE)
            if member and alive(member):
                return use_user(req, member, sid, login)
    if not hit_limit(f"new:{req['ip']}", LIMITS["new_sessions_per_ip_hour"], 3600):
        raise ApiError(429, "새로 시작하는 요청이 너무 많아요. 잠시 뒤(최대 1시간)에 다시 시도해 주세요.")
    # 3. 처음이거나 기한이 지났으면 새 학습자 (로그인 안 함)
    now = now_ms()
    item = {"pk": user_pk(new_id()), "sk": PROFILE, "level": None, "recentTopics": [],
            "createdAt": now, "lastSeen": now, TTL_ATTR: ttl_after(keep_seconds(None, "user"))}
    put_item(item)
    req["user"] = user_from_item(item)
    return req["user"]


def use_user(req, item, sid, login=None):
    """찾은 학습자를 이 요청에 쓴다. 마지막 사용 시각(=자동 삭제 기한)은 15분마다만 늘린다 (요청마다 쓰지 않아 빠르고 쌈)"""
    user = {**user_from_item(item), "sid": sid}
    if now_ms() - item.get("lastSeen", 0) > SESSION_REFRESH_SEC * 1000:
        update_item(item["pk"], PROFILE, set_values={"lastSeen": now_ms(), TTL_ATTR: ttl_after(keep_seconds(user, "user"))})
        if login:   # 로그인 토큰도 쓰는 동안은 기한을 늘린다
            update_item(login_pk(sid), USER, set_values={TTL_ATTR: ttl_after(LOGIN_DAYS * 86400)})
    req["user"] = user
    return user


def remember_topic(user, topic, level):
    """최근 주제(랜덤에서 빼기)와 고른 난이도를 기억한다"""
    recent = [t for t in user["recentTopics"] if t != topic][-(RECENT_TOPICS - 1):] + [topic]
    update_item(user_pk(user["userId"]), PROFILE, set_values={"recentTopics": recent, "level": level})
    user["recentTopics"], user["level"] = recent, level


# ─────────────────────────────────────────────────────────────
# 7. 설정 값 (OPS#CONFIG / <키>) · 관리자의 AI 끄기 스위치
# ─────────────────────────────────────────────────────────────


_switch = {"value": None, "checked": 0}


def ai_switch_on():
    """관리자 화면의 'AI 끄기' 스위치 (OPS#CONFIG / ai_switch). 30초마다만 다시 읽는다"""
    if time.time() - _switch["checked"] > 30:
        _switch["value"] = get_meta("ai_switch") != "off"
        _switch["checked"] = time.time()
    return _switch["value"]


def ai_enabled():
    """AI 를 쓸 수 있는지: 환경 변수 AI_MODE 가 live·mock 이고, 관리자가 끄지 않았을 때"""
    return AI_MODE in ("live", "mock") and ai_switch_on()


def get_meta(key):
    return (get_item(OPS_CONFIG, key) or {}).get("value")


def set_meta(key, value):
    put_item({"pk": OPS_CONFIG, "sk": key, "value": value})


# ─────────────────────────────────────────────────────────────
# 8. 하루 사용 수 (OPS#STATS / DAY#날짜) — 관리자 화면
# ─────────────────────────────────────────────────────────────


def day_key(ms=None):
    """날짜 (한국 시간 기준 yyyy-mm-dd)"""
    return datetime.fromtimestamp((ms or now_ms()) / 1000 + 9 * 3600, tz=timezone.utc).strftime("%Y-%m-%d")


def count_event(name):
    """관리자 화면의 하루 사용 수 (OPS#STATS / DAY#날짜 에 더하기). 실패해도 학습은 계속"""
    try:
        update_item(OPS_STATS, f"DAY#{day_key()}", set_values={TTL_ATTR: ttl_after(90 * 86400)}, add_values={name: 1})
    except Exception as e:
        logger.warning("하루 사용 수 기록 실패", extra={"error": repr(e)})


# ─────────────────────────────────────────────────────────────
# 9. id 만들기 — 시간순 UUID (버전 7)
#     학습자 id(USER#<id>)·읽을 코드 id(CODE#<id>) 에 쓴다. 로그인 토큰은 비밀번호 같은 값이라 전부 무작위(uuid4)
# ─────────────────────────────────────────────────────────────


def new_id(ms=None):
    """시간순 UUID: 앞 12글자 = 만든 시각(밀리초), 나머지 = 무작위 74비트. 예) 019a1b2c-3d4e-7f01-8a2b-…
    36글자 uuid 모양 그대로라 id 검사(SESSION_ID)·화면 주소·예전 uuid4 데이터와 함께 쓸 수 있고, 문자열로 정렬하면 만든 순서가 된다"""
    value = ((ms or now_ms()) & (2 ** 48 - 1)) << 80 | int.from_bytes(os.urandom(10), "big")   # 시각 48비트 + 무작위 80비트
    value = value & ~(0xF << 76) | 0x7 << 76                                                 # 버전 7 (13번째 글자가 7)
    value = value & ~(0x3 << 62) | 0x2 << 62                                                 # 변형 표시 (17번째 글자가 8~b)
    return str(uuid.UUID(int=value))
