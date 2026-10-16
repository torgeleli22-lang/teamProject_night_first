"""
코드 리딩 노트 API 공통 도구 (common.py) — jojo_api 함수 안의 파일

기능 파일(practice.py, review.py …)은 '무엇을 하는지'만 쓰고, 여러 기능이 함께 쓰는 일은 여기에 모았어요.

  1. 설정 (환경 변수·숫자)               5. 요청 수 제한
  2. AWS 연결 (DynamoDB·Bedrock)          6. 학습자(세션)
  3. 요청 읽기·응답 만들기 (CORS 포함)     7. AI 호출 (Bedrock, 월 예산·사용량 기록·목업·AI 끄기)
  4. DynamoDB 읽기·쓰기 도구              8. 설정 값 (META)

콘솔에서 이 파일을 고쳤다면 GitHub(lambda/api/common.py)에도 같이 반영해 주세요.
"""
import base64
import json
import os
import random
import re
import time
import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import unquote_plus

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config

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

SESSION_HOURS = 12            # 마지막 사용 후 이 시간이 지나면 학습자가 사라진다 (로그인 없는 임시 학습자)
SESSION_REFRESH_SEC = 15 * 60  # 학습자의 '마지막 사용 시각'은 이 간격마다만 고쳐 쓴다 (요청마다 쓰지 않아 빠르고 쌈)
MOCK_DELAY_SEC = float(os.environ.get("MOCK_DELAY_SEC", "0.8"))   # 목업 응답을 기다리는 시간 (화면 확인용)
MAX_BODY_BYTES = 256 * 1024   # 요청 본문 최대 크기 (300줄 코드 + 메모 → 수십 KB)

# 서비스 숫자 (바꾸면 바로 반영)
MAX_CODE_LINES = 300          # 내 코드 점검: 올릴 수 있는 최대 줄 수
REGEN_LIMIT = 5               # 같은 코드에서 '더 쉽게·더 어렵게'로 다시 만들 수 있는 횟수
READING_KEEP_DAYS = 7         # 연습 코드·첨삭 기록 보관 기간 (지나면 DynamoDB 가 자동 삭제)
UPLOAD_KEEP_DAYS = 1          # 사용자가 올린 코드 보관 기간 (짧게)
MAX_MEMOS = 20                # 한 번에 붙일 수 있는 메모 수
MAX_MEMO_CHARS = 500          # 메모 하나의 최대 글자 수
LANGUAGES = {"python": "Python"}   # 지원 언어 (추후 javascript, java)

# 난이도 3단계 (고정 기준이 아니라 출발점. 사용자가 '더 쉽게·더 어렵게'로 조정)
LEVELS = {
    1: {"name": "입문", "description": "짧은 코드, 변수·조건문·반복문이 위에서 아래로 흘러가요."},
    2: {"name": "초급", "description": "함수 여러 개가 서로를 불러요. 리스트와 딕셔너리가 나와요."},
    3: {"name": "중급", "description": "클래스, 재귀, 예외 처리처럼 흐름이 오가는 코드예요."},
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
                                           config=Config(read_timeout=170, retries={"max_attempts": 2}))
    return _clients["bedrock"]


# ─────────────────────────────────────────────────────────────
# 3. 요청 읽기·응답 만들기
# ─────────────────────────────────────────────────────────────

SESSION_HEADER = "x-session-id"


class ApiError(Exception):
    """화면에 그대로 보여 줄 오류 (status: HTTP 상태 코드)"""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def read_request(event):
    """Lambda 함수 URL 이벤트 → 다루기 쉬운 dict. 콘솔 '테스트'로 JSON 만 넣어도 동작한다"""
    http = (event.get("requestContext") or {}).get("http") or {}
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    raw = event.get("body")
    problem = None   # 본문을 읽을 수 없으면 run_route 가 400/413 으로 답한다
    if raw is None and "rawPath" not in event:
        body = {k: v for k, v in event.items() if k not in ("path", "method", "headers")}   # 콘솔 테스트: {"path": "/me", "method": "GET", ...값}
    elif raw and len(raw) > MAX_BODY_BYTES * 1.4:
        body, problem = {}, ApiError(413, "요청이 너무 커요.")
    else:
        try:
            if raw and event.get("isBase64Encoded"):
                raw = base64.b64decode(raw).decode("utf-8")
            body = json.loads(raw) if raw else {}
        except (ValueError, UnicodeDecodeError):
            body, problem = {}, ApiError(400, "잘못된 요청 형식이에요.")
    query = {}
    for part in (event.get("rawQueryString") or "").split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            query[unquote_plus(k)] = unquote_plus(v)
    return {
        "method": http.get("method") or event.get("method") or ("POST" if body else "GET"),
        "path": (event.get("rawPath") or event.get("path") or "/").rstrip("/") or "/",
        "query": query,
        "headers": headers,
        "body": body if isinstance(body, dict) else {},
        # 요청 제한은 IP 로 센다. 브라우저가 보낸 x-forwarded-for 는 믿지 않고 함수 URL 이 확인한 주소를 쓴다
        "ip": http.get("sourceIp") or "local",
        "origin": headers.get("origin"),
        "problem": problem,
    }


def cors_headers(origin):
    """허용한 화면 주소(ALLOWED_ORIGINS)에서 온 요청만 브라우저가 응답을 읽을 수 있게 한다. 비워 두면 모두 허용(로컬)"""
    allow = "*" if not ALLOWED_ORIGINS else (origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0])
    return {
        "access-control-allow-origin": allow,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": f"content-type,{SESSION_HEADER},x-admin-token",
        "access-control-expose-headers": SESSION_HEADER,
        "access-control-max-age": "86400",
        "vary": "origin",
    }


def reply(status, data, req=None):
    """프론트로 돌려줄 응답. 학습자를 새로 만들었거나 확인했으면 세션 id 를 헤더로 알려 준다"""
    headers = {**cors_headers((req or {}).get("origin")), "content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
    learner = (req or {}).get("learner")
    if learner:
        headers[SESSION_HEADER] = learner["id"]
    return {"statusCode": status, "headers": headers, "body": "" if data is None else json.dumps(to_plain(data), ensure_ascii=False)}


def run_route(req, routes):
    """경로 표에서 처리 함수를 찾아 실행하고 응답을 만든다 (오류도 응답으로)"""
    if req["method"] == "OPTIONS":
        return reply(204, None, req)
    try:
        if req.get("problem"):
            raise req["problem"]
        route = routes.get(f"{req['method']} {req['path']}")
        if not route:
            raise ApiError(404, "없는 API 예요.")
        if not req["path"].startswith("/admin") and not hit_limit(f"all:{req['ip']}", LIMITS["per_ip_per_minute"], 60):
            raise ApiError(429, "요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요.")
        return reply(200, route(req), req)
    except ApiError as e:
        return reply(e.status, {"error": e.message}, req)
    except Exception as e:  # 예상하지 못한 오류: 로그(CloudWatch)에 남기고 학습자에게는 짧게
        print("[error]", req["method"], req["path"], repr(e))
        traceback.print_exc()
        return reply(500, {"error": "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요."}, req)


def field(body, name, kind, default=None, required=False, max_len=None, choices=None, low=None, high=None):
    """요청 값 하나 꺼내기 + 형식 확인 (틀리면 400)"""
    value = body.get(name, default)
    if value is None:
        if required:
            raise ApiError(400, "요청 값을 확인해 주세요.")
        return default
    ok = {"str": isinstance(value, str), "int": isinstance(value, int) and not isinstance(value, bool),
          "bool": isinstance(value, bool), "list": isinstance(value, list), "dict": isinstance(value, dict)}[kind]
    if not ok or (max_len is not None and len(value) > max_len) or (choices is not None and value not in choices) \
            or (low is not None and value < low) or (high is not None and value > high):
        raise ApiError(400, "요청 값을 확인해 주세요.")
    return value


# ─────────────────────────────────────────────────────────────
# 4. DynamoDB 읽기·쓰기 도구
#    DynamoDB 는 숫자를 Decimal 로 주고받아서, 읽을 때 int/float 로, 쓸 때 Decimal 로 바꾼다
# ─────────────────────────────────────────────────────────────


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
# 5. 요청 수 제한 (함수가 여러 개 떠도 함께 세도록 DynamoDB 의 RL / 키#구간 항목에 센다)
# ─────────────────────────────────────────────────────────────


def bump_counter(key, window_sec):
    window_start = int(time.time() // window_sec * window_sec) * 1000
    item = update_item("RL", f"{key}#{window_start}", set_values={TTL_ATTR: window_start // 1000 + window_sec + 60},
                       add_values={"n": 1}, return_new=True)
    return int(item.get("n", 0))


def read_counter(key, window_sec):
    window_start = int(time.time() // window_sec * window_sec) * 1000
    return int((get_item("RL", f"{key}#{window_start}") or {}).get("n", 0))


def hit_limit(key, limit, window_sec):
    """한 번 센다. 한도 안이면 True (limit 이 0 이면 항상 True)"""
    return limit <= 0 or bump_counter(key, window_sec) <= limit


def ai_allowed(req):
    """AI 를 부르는 요청: 학습자·IP·전체 1시간 한도 (넘으면 False)"""
    learner = req.get("learner")
    if learner and not hit_limit(f"ai-s:{learner['id']}", LIMITS["ai_per_session_hour"], 3600):
        return False
    return hit_limit(f"ai-ip:{req['ip']}", LIMITS["ai_per_ip_hour"], 3600) and hit_limit("ai-all", LIMITS["ai_total_hour"], 3600)


AI_LIMIT_MESSAGE = "AI 를 잠깐 너무 많이 썼어요. 조금 쉬었다가(최대 1시간) 다시 해 주세요."

# ─────────────────────────────────────────────────────────────
# 6. 학습자 (세션) — 로그인 없이 브라우저 탭마다 한 명. 세션 id 는 x-session-id 헤더로 주고받는다
#    LEARNER / <세션 id> : 고른 난이도, 최근 주제
# ─────────────────────────────────────────────────────────────

SESSION_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
RECENT_TOPICS = 10   # 랜덤 주제에서 빼는 최근 주제 수


def learner_from_item(item):
    return {"id": item["sk"], "level": item.get("level"), "recentTopics": item.get("recentTopics", []), "createdAt": item.get("createdAt", 0)}


def get_learner(req):
    """요청한 학습자. 아는 세션이면 마지막 사용 시각을 늘리고, 없거나 만료됐으면 새로 만든다 (IP 당 1시간 한도)"""
    if req.get("learner"):
        return req["learner"]
    sid = req["headers"].get(SESSION_HEADER) or ""
    session_ttl = SESSION_HOURS * 3600
    if SESSION_ID.match(sid):
        found = get_item("LEARNER", sid)
        if found and alive(found):
            # 마지막 사용 시각(=자동 삭제 기한)은 15분마다만 늘린다 (요청마다 쓰기를 하지 않아 빠르고 쌈)
            if now_ms() - found.get("lastSeen", 0) > SESSION_REFRESH_SEC * 1000:
                update_item("LEARNER", sid, set_values={"lastSeen": now_ms(), TTL_ATTR: ttl_after(session_ttl)})
            req["learner"] = learner_from_item(found)
            return req["learner"]
    if not hit_limit(f"new:{req['ip']}", LIMITS["new_sessions_per_ip_hour"], 3600):
        raise ApiError(429, "새로 시작하는 요청이 너무 많아요. 잠시 뒤(최대 1시간)에 다시 시도해 주세요.")
    now = now_ms()
    item = {"pk": "LEARNER", "sk": str(uuid.uuid4()), "level": None, "recentTopics": [],
            "createdAt": now, "lastSeen": now, TTL_ATTR: ttl_after(session_ttl)}
    put_item(item)
    req["learner"] = learner_from_item(item)
    return req["learner"]


def remember_topic(learner, topic, level):
    """최근 주제(랜덤에서 빼기)와 고른 난이도를 기억한다"""
    recent = [t for t in learner["recentTopics"] if t != topic][-(RECENT_TOPICS - 1):] + [topic]
    update_item("LEARNER", learner["id"], set_values={"recentTopics": recent, "level": level})
    learner["recentTopics"], learner["level"] = recent, level


# ─────────────────────────────────────────────────────────────
# 7. AI 호출 (Bedrock Converse)
#     - 구조화 응답(ask_ai): 'answer' 도구 하나를 주고 반드시 그 도구로 답하게 해서, 도구 입력(JSON)을 결과로 쓴다
#     - 이번 달 추정 비용 + 이번 호출의 최대 비용이 예산을 넘으면 부르지 않는다 (AiUnavailable → 규칙 기반 대체)
#     - 호출마다 USAGE / <연-월>#<작업>#<모델> 에 토큰 수를 더한다 (관리자 화면의 비용)
#     - AI_MODE=mock 이면 mock 함수의 결과를 돌려준다 (비용 없음, 화면 확인용)
# ─────────────────────────────────────────────────────────────


class AiUnavailable(Exception):
    """AI 를 쓸 수 없음 (꺼짐·예산·형식 오류) → 부른 쪽에서 규칙 기반 결과를 쓴다"""


_switch = {"value": None, "checked": 0}


def ai_switch_on():
    """관리자 화면의 'AI 끄기' 스위치 (META / ai_switch). 30초마다만 다시 읽는다"""
    if time.time() - _switch["checked"] > 30:
        _switch["value"] = get_meta("ai_switch") != "off"
        _switch["checked"] = time.time()
    return _switch["value"]


def ai_enabled():
    """AI 를 쓸 수 있는지: 환경 변수 AI_MODE 가 live·mock 이고, 관리자가 끄지 않았을 때"""
    return AI_MODE in ("live", "mock") and ai_switch_on()


def month_key(ms=None):
    return datetime.fromtimestamp((ms or now_ms()) / 1000, tz=timezone.utc).strftime("%Y-%m")


def normalize_model(model):
    """'us.anthropic.claude-haiku-4-5-20251001-v1:0' → 'claude-haiku-4-5' (가격표 이름)"""
    model = re.sub(r"^mock:", "", model)
    model = re.sub(r"^(?:[a-z]{2,6}\.)?anthropic\.", "", model)
    return re.sub(r"-\d{8}(?:-v\d+(?::\d+)?)?$", "", model)


def usage_summary(since_month=""):
    """작업·모델별 사용량 합계 (since_month 부터)"""
    by = {}
    for r in query_all("USAGE", start=since_month or None):
        key = (r.get("task"), r.get("model"))
        cur = by.setdefault(key, {"task": r.get("task"), "model": r.get("model"), "calls": 0, "input": 0, "output": 0, "cacheRead": 0, "failures": 0})
        for k in ("calls", "input", "output", "cacheRead", "failures"):
            cur[k] += r.get(k, 0)
    return sorted(by.values(), key=lambda u: -u["calls"])


def estimate_cost(rows):
    total = 0.0
    for u in rows:
        p = PRICE.get(normalize_model(u["model"]))
        if p:
            total += (u["input"] * p["input"] + u["output"] * p["output"] + u["cacheRead"] * p["cacheRead"]) / 1e6
    return total


def month_cost_usd(include_mock=False):
    return estimate_cost([u for u in usage_summary(month_key()) if include_mock or not u["model"].startswith("mock:")])


def log_usage(task, model, inp, out, cache_read, ok):
    month = month_key()
    try:
        update_item("USAGE", f"{month}#{task}#{model}", set_values={"task": task, "model": model, "month": month},
                    add_values={"calls": 1, "input": inp, "output": out, "cacheRead": cache_read, "failures": 0 if ok else 1})
    except Exception as e:  # 사용량 기록 실패가 학습을 막지 않도록
        print("[usage]", repr(e))


def check_budget(input_chars, max_tokens):
    """이번 호출이 쓸 수 있는 최대 비용까지 더해도 월 예산 안인지 (넘으면 AiUnavailable)"""
    p = PRICE.get(normalize_model(MODEL_ID)) or max(PRICE.values(), key=lambda x: x["output"])
    worst = (input_chars * p["input"] + max_tokens * p["output"]) / 1e6
    if month_cost_usd() + worst > MONTHLY_BUDGET_USD:
        raise AiUnavailable("monthly AI budget reached")


def build_messages(history, prompt):
    """이전 대화 + 이번 질문 → Converse messages (user 로 시작, 같은 역할이 이어지면 합침)"""
    out = []
    for turn in list(history or []) + [{"role": "user", "text": prompt}]:
        text = (turn.get("text") or "").strip()
        if not text or (not out and turn["role"] != "user"):
            continue
        if out and out[-1]["role"] == turn["role"]:
            out[-1]["content"][0]["text"] += "\n\n" + text
        else:
            out.append({"role": turn["role"], "content": [{"text": text}]})
    return out


def ask_ai(task, system, prompt, schema, max_tokens=4000, mock=None, history=None, salvage=None, mock_delay=None):
    """AI 에게 정해진 형식(schema, JSON Schema)의 답을 받는다. 형식이 어긋나면 흔한 실수를 고치고, 그래도 틀리면 AiUnavailable"""
    if not ai_enabled():
        raise AiUnavailable("AI is off")
    if AI_MODE == "mock":
        if not mock:
            raise AiUnavailable("no mock for this task")
        time.sleep(MOCK_DELAY_SEC if mock_delay is None else mock_delay)
        result = mock()
        log_usage(task, f"mock:{MODEL_ID}", (len(system) + len(prompt)) // 2, len(json.dumps(result, ensure_ascii=False)) // 2, 0, True)
        return result
    if AI_MODE != "live":
        raise AiUnavailable("AI is off")
    messages = build_messages(history, prompt)
    input_chars = len(system) + sum(len(m["content"][0]["text"]) for m in messages)
    check_budget(input_chars, max_tokens)
    ok, usage = False, {}
    try:
        try:
            response = bedrock().converse(
                modelId=MODEL_ID,
                system=[{"text": system}],
                messages=messages,
                inferenceConfig={"maxTokens": max_tokens},
                toolConfig={
                    "tools": [{"toolSpec": {
                        "name": "answer",
                        "description": "결과를 이 형식(JSON)으로 제출한다. 모든 칸을 빠짐없이 쓰고, 해당 없는 칸은 null 로 쓴다. 배열·객체를 문자열로 감싸지 않는다.",
                        "inputSchema": {"json": schema},
                    }}],
                    "toolChoice": {"tool": {"name": "answer"}},
                },
            )
        except Exception as e:
            # AWS 가 거절한 요청(권한·모델·한도)은 비용이 없고, 연결이 끊긴 요청은 답을 만들었을 수 있어 최대 사용량으로 기록한다
            if not getattr(e, "response", None):
                usage = {"inputTokens": input_chars, "outputTokens": max_tokens}
            raise AiUnavailable(f"bedrock: {type(e).__name__}")
        usage = response.get("usage", {})
        if response.get("stopReason") == "max_tokens":
            raise AiUnavailable("response was truncated")
        tool = next((c["toolUse"] for c in response["output"]["message"]["content"] if "toolUse" in c), None)
        if not tool:
            raise AiUnavailable("could not parse response: 응답에 결과(JSON)가 없음")
        value = repair_for_schema(tool["input"], schema)
        issues = check_schema(value, schema)
        if issues and salvage:
            kept = salvage(value)
            if not check_schema(kept, schema):
                value, issues = kept, []
        if issues:
            print("[ai] 응답 형식 불일치:", task, issues[:3])
            raise AiUnavailable("could not parse response: " + "; ".join(issues[:3]))
        ok = True
        return value
    finally:
        log_usage(task, MODEL_ID, usage.get("inputTokens", 0), usage.get("outputTokens", 0), usage.get("cacheReadInputTokens", 0), ok)


def _allows(schema, kind):
    if "anyOf" in schema:
        return any(_allows(s, kind) for s in schema["anyOf"])
    t = schema.get("type")
    types = t if isinstance(t, list) else [t]
    return kind in types or (kind == "number" and "integer" in types)


def repair_for_schema(value, schema):
    """도구 입력에서 자주 어긋나는 것만 고친다: 빠진 칸 → null, 문자열로 감싼 배열·객체 → 풀기, "3" → 3"""
    if isinstance(value, str) and (_allows(schema, "array") or _allows(schema, "object")) and not _allows(schema, "string"):
        t = value.strip()
        if t[:1] in ("[", "{"):
            try:
                value = json.loads(t)
            except json.JSONDecodeError:
                pass
    if isinstance(value, str) and (_allows(schema, "number") or _allows(schema, "integer")) and not _allows(schema, "string"):
        try:
            return int(value) if re.fullmatch(r"-?\d+", value.strip()) else float(value)
        except ValueError:
            pass
    branch = schema
    for s in schema.get("anyOf", []):
        if (isinstance(value, list) and _allows(s, "array")) or (isinstance(value, dict) and _allows(s, "object")):
            branch = s
    if isinstance(value, list) and "items" in branch:
        return [repair_for_schema(v, branch["items"]) for v in value]
    if isinstance(value, dict) and "properties" in branch:
        out = dict(value)
        for key, sub in branch["properties"].items():
            if key not in out:
                if _allows(sub, "null"):
                    out[key] = None
            else:
                out[key] = repair_for_schema(out[key], sub)
        return out
    return value


def check_schema(value, schema, path="(전체)"):
    """간단한 JSON Schema 검사 (type·enum·properties·required·items·minimum·maximum·anyOf). 문제 목록을 돌려준다"""
    if "anyOf" in schema:
        return [] if any(not check_schema(value, s, path) for s in schema["anyOf"]) else [f"{path}: 형식이 맞지 않음"]
    t = schema.get("type")
    types = t if isinstance(t, list) else ([t] if t else [])
    kind = ("null" if value is None else "boolean" if isinstance(value, bool) else "integer" if isinstance(value, int)
            else "number" if isinstance(value, float) else "string" if isinstance(value, str)
            else "array" if isinstance(value, list) else "object" if isinstance(value, dict) else "?")
    if types and not (kind in types or (kind == "integer" and "number" in types)):
        return [f"{path}: {'/'.join(types)} 이어야 함"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{path}: 허용되지 않은 값"]
    if kind in ("integer", "number"):
        if "minimum" in schema and value < schema["minimum"] or "maximum" in schema and value > schema["maximum"]:
            return [f"{path}: 범위를 벗어남"]
    issues = []
    if kind == "object":
        for key in schema.get("required", []):
            if key not in value:
                issues.append(f"{path}.{key}: 없음")
        for key, sub in schema.get("properties", {}).items():
            if key in value:
                issues += check_schema(value[key], sub, f"{path}.{key}")
    if kind == "array" and "items" in schema:
        for i, v in enumerate(value):
            issues += check_schema(v, schema["items"], f"{path}.{i}")
    return issues



# ─────────────────────────────────────────────────────────────
# 8. 설정 값 (META / <키>)
# ─────────────────────────────────────────────────────────────


def get_meta(key):
    return (get_item("META", key) or {}).get("value")


def set_meta(key, value):
    put_item({"pk": "META", "sk": key, "value": value})


# ─────────────────────────────────────────────────────────────
# 9. 읽을 코드 (READ#<id> / CODE) — 연습 모드·내 코드 점검이 함께 쓴다
#    코드, 언어, 난이도, 주제, ※ 꼭 설명할 곳(marks: 줄 범위 + 모범 설명 + 핵심 표현)
#    화면에는 public_reading() 만 보낸다 (모범 설명·핵심 표현은 첨삭 뒤에만)
# ─────────────────────────────────────────────────────────────


def day_key(ms=None):
    """날짜 (한국 시간 기준 yyyy-mm-dd)"""
    return datetime.fromtimestamp((ms or now_ms()) / 1000 + 9 * 3600, tz=timezone.utc).strftime("%Y-%m-%d")


def count_event(name):
    """관리자 화면의 하루 사용 수 (STATS / DAY#날짜 에 더하기). 실패해도 학습은 계속"""
    try:
        update_item("STATS", f"DAY#{day_key()}", set_values={TTL_ATTR: ttl_after(90 * 86400)}, add_values={name: 1})
    except Exception as e:
        print("[stats]", repr(e))


def numbered(code):
    """AI 에게 보여 줄 줄 번호 붙인 코드"""
    return "\n".join(f"{i + 1:3}| {line}" for i, line in enumerate(code.split("\n")))


def clean_marks(code, marks, limit=4):
    """※ 지점 정리: 코드 줄 범위 안으로, 시작 순서대로, 겹치면 빼고, 최대 limit 곳. id 는 m1, m2 …"""
    total = len(code.split("\n"))
    out = []
    for m in sorted(marks, key=lambda m: m["start"]):
        start, end = max(1, int(m["start"])), min(total, int(m["end"]))
        if start > end or (out and start <= out[-1]["end"]):
            continue
        out.append({"id": f"m{len(out) + 1}", "start": start, "end": end, "why": str(m.get("why", ""))[:80],
                    "explanation": str(m.get("explanation", ""))[:600], "keywords": [str(k)[:30] for k in m.get("keywords", [])][:8]})
        if len(out) >= limit:
            break
    return out


def save_reading(learner, **fields):
    """읽을 코드 하나를 저장하고 돌려준다. fields: source, level, topic, title, code, marks, rootId, regenCount, origin, keepDays"""
    reading_id = str(uuid.uuid4())
    keep_days = fields.pop("keepDays", READING_KEEP_DAYS)
    item = {"pk": f"READ#{reading_id}", "sk": "CODE", "id": reading_id, "owner": learner["id"], "language": "python",
            "createdAt": now_ms(), "rootId": fields.pop("rootId", None) or reading_id, "regenCount": fields.pop("regenCount", 0),
            TTL_ATTR: ttl_after(keep_days * 86400), **fields}
    put_item(item)
    return item


def load_reading(reading_id, learner):
    """내 코드만 꺼낼 수 있다 (다른 사람의 id 를 알아도 못 봄)"""
    if not isinstance(reading_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", reading_id):
        raise ApiError(400, "요청 값을 확인해 주세요.")
    item = get_item(f"READ#{reading_id}", "CODE")
    if not item or not alive(item) or item.get("owner") != learner["id"]:
        raise ApiError(404, "코드를 찾을 수 없어요. 시간이 지나 지워졌을 수 있어요.")
    return item


def public_reading(item):
    """화면으로 보낼 모양 (※ 지점은 줄 범위만)"""
    level = item.get("level") or 1
    return {
        "id": item["id"], "source": item["source"], "language": item["language"], "level": level, "levelName": LEVELS[level]["name"],
        "topic": item.get("topic", ""), "title": item.get("title", ""), "code": item["code"],
        "marks": [{"id": m["id"], "start": m["start"], "end": m["end"]} for m in item.get("marks", [])],
        "regenLeft": max(0, REGEN_LIMIT - item.get("regenCount", 0)), "note": item.get("note"),
        "functions": item.get("functions"), "levelReason": item.get("levelReason"),
    }
