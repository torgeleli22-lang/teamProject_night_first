"""
코드리딩 Lambda 공통 도구 (common.py)

모든 Python Lambda 에 같은 내용으로 넣는 파일이에요.
각 Lambda 의 lambda_function.py 는 '무엇을 하는지'만 쓰고, 여러 Lambda 가 함께 쓰는 일은 여기에 모았어요.

  1. 설정 (환경 변수·정책 숫자)          7. 커리큘럼·문제 데이터 (DynamoDB 에서 읽고 잠깐 보관)
  2. AWS 연결 (DynamoDB·Bedrock·Lambda)  8. 학습 기록 통계 (XP·이해도·난이도 추천)
  3. 요청 읽기·응답 만들기 (CORS 포함)     9. 보기 섞기 (화면 순서 ↔ 원래 순서)
  4. DynamoDB 읽기·쓰기 도구             10. AI 호출 (Bedrock, 월 예산·사용량 기록·목업)
  5. 요청 수 제한                        11. 다른 Lambda 부르기 (응답을 기다리지 않음)
  6. 학습자(세션)                        12. 설정 값·생성 작업 기록

콘솔에서 이 파일을 고쳤다면, 다른 Lambda 의 common.py 와 GitHub(lambda/common/common.py)에도 같이 반영해 주세요.
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
DB_REGION = os.environ.get("DB_REGION", "ap-northeast-2")          # DynamoDB·Lambda 가 있는 곳 (서울)
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")     # Bedrock 모델을 부르는 곳
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
AI_MODE = os.environ.get("AI_MODE", "live")                         # live: 실제 AI, mock: 흉내 낸 응답(비용 없음), off: AI 없이
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

SESSION_HOURS = 12            # 마지막 사용 후 이 시간이 지나면 학습자와 기록이 사라진다 (로그인 없는 임시 학습자)
RECORD_EXTRA_DAYS = 7         # 학습 기록은 학습자보다 조금 더 남긴다
MOCK_DELAY_SEC = float(os.environ.get("MOCK_DELAY_SEC", "0.8"))   # 목업 응답을 기다리는 시간 (화면 확인용)
CONTENT_CHECK_SEC = float(os.environ.get("CONTENT_CHECK_SEC", "30"))  # 문제 데이터가 바뀌었는지 확인하는 간격 (초)


MAX_BODY_BYTES = 256 * 1024   # 요청 본문 최대 크기 (가장 큰 정상 요청은 관리자 가져오기·주관식 답 → 수십 KB)


def _num(name, default):
    value = os.environ.get(name, "")
    return float(value) if value.strip() else default


# 요청 수 제한 (0 이면 끔). 학교 교실처럼 여러 명이 같은 IP 를 쓰는 경우를 막지 않도록 IP 기준은 넉넉하게
LIMITS = {
    "per_ip_per_minute": _num("RATE_LIMIT_PER_MINUTE", 600),         # IP 하나의 전체 요청 (1분)
    "ai_per_session_hour": _num("RATE_LIMIT_AI_PER_SESSION_HOUR", 30),  # 학습자 한 명의 AI 요청 (1시간)
    "ai_per_ip_hour": _num("RATE_LIMIT_AI_PER_IP_HOUR", 300),         # IP 하나의 AI 요청 (1시간)
    "ai_total_hour": _num("RATE_LIMIT_AI_TOTAL_HOUR", 400),           # 서비스 전체 AI 요청 (1시간)
    "new_sessions_per_ip_hour": _num("RATE_LIMIT_NEW_SESSIONS_PER_HOUR", 120),  # IP 하나가 새로 만드는 학습자 (1시간)
}

# AI 문제 생성 기준 (docs/ai-generation-policy.md). 숫자만 바꾸면 된다
POLICY = {
    "minStock": 8,                 # 칸(개념 × 난이도)마다 최소 문제 수
    "maxStock": 28,                # 칸마다 최대 문제 수
    "learnerLow": 4,               # 한 학습자가 안 푼 문제가 이보다 적으면 '소진'
    "demandLearners": 2,           # 최근 demandWindowDays 동안 이만큼의 학습자가 소진하면 생성
    "demandWindowDays": 7,
    "personalPerLearnerPerDay": 1,  # 맞춤 복습 생성: 학습자당 하루 최대
    "dailyLimit": int(_num("AI_GENERATION_DAILY_LIMIT", 30)),         # 하루 전체 생성 상한
    "monthlyBudgetUsd": _num("AI_MONTHLY_BUDGET_USD", 10),            # 한 달 AI 예산 (USD)
}

# 단원별로 AI 생성을 허용하는 난이도 (1~7: JavaScript 단원, 11~14: 개념 분야 — 관리자 승인 필요)
LEVELS_BY_UNIT = {1: [1, 2, 3], 2: [1, 2, 3], 3: [2, 3, 4], 4: [2, 3, 4], 5: [3, 4, 5], 7: [4, 5],
                  11: [1, 2, 3, 4], 12: [1, 2, 3, 4], 13: [1, 2, 3, 4], 14: [1, 2, 3, 4]}

TRIGGER_LABEL = {
    "launch_fill": "출시 전 채우기",
    "stock_floor": "재고 하한 미달",
    "demand": "여러 학습자 소진",
    "personal_review": "맞춤 복습 (혼동 발견)",
    "manual": "관리자 수동",
}

# 응답을 기다리지 않고 부르는 다른 Lambda 의 이름 (콘솔에서 만든 함수 이름과 같아야 함)
FUNCTIONS = {
    "generate-code": os.environ.get("GENERATE_CODE_FUNCTION", "jojo_generate_code"),
    "generate-theory": os.environ.get("GENERATE_THEORY_FUNCTION", "jojo_generate_theory"),
    "learner-analysis": os.environ.get("LEARNER_ANALYSIS_FUNCTION", "jojo_learner_analysis"),
}

# AI 가격표 (USD / 100만 토큰) — 예산 판단·관리자 화면 표시용 추정치
PRICE = {
    "claude-haiku-4-5": {"input": 1, "output": 5, "cacheRead": 0.1},
}

# ─────────────────────────────────────────────────────────────
# 2. AWS 연결 (처음 쓸 때 한 번 만들고, 같은 Lambda 가 다시 불리면 그대로 다시 쓴다)
#    DYNAMODB_ENDPOINT·LAMBDA_ENDPOINT 는 내 컴퓨터에서 실행할 때만 쓴다 (npm run api)
# ─────────────────────────────────────────────────────────────

table = boto3.resource("dynamodb", region_name=DB_REGION, endpoint_url=os.environ.get("DYNAMODB_ENDPOINT") or None).Table(TABLE_NAME)
_clients = {}


def bedrock():
    if "bedrock" not in _clients:
        _clients["bedrock"] = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION,
                                           config=Config(read_timeout=170, retries={"max_attempts": 2}))
    return _clients["bedrock"]


def lambda_client():
    if "lambda" not in _clients:
        _clients["lambda"] = boto3.client("lambda", region_name=DB_REGION, endpoint_url=os.environ.get("LAMBDA_ENDPOINT") or None,
                                          config=Config(connect_timeout=3, read_timeout=5, retries={"max_attempts": 1}))
    return _clients["lambda"]


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
# 5. 요청 수 제한 (여러 Lambda 가 함께 세도록 DynamoDB 의 RL / 키#구간 항목에 센다)
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


AI_LIMIT_MESSAGE = "AI 튜터를 잠깐 너무 많이 썼어요. 조금 쉬었다가(최대 1시간) 다시 물어봐 주세요. 그동안 힌트와 해설은 그대로 볼 수 있어요."

# ─────────────────────────────────────────────────────────────
# 6. 학습자 (세션) — 로그인 없이 브라우저 탭마다 한 명. 세션 id 는 x-session-id 헤더로 주고받는다
#    LEARNER / <세션 id> : 닉네임, 고른 난이도, 총 XP·푼 수(랭킹)
# ─────────────────────────────────────────────────────────────

SESSION_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ADJECTIVES = ["성실한", "호기심 많은", "차분한", "부지런한", "용감한", "꼼꼼한", "즐거운", "끈기 있는", "반짝이는", "느긋한"]
ANIMALS = ["고양이", "판다", "수달", "펭귄", "다람쥐", "고래", "여우", "부엉이", "코알라", "햄스터"]


def random_nickname():
    return f"{random.choice(ADJECTIVES)} {random.choice(ANIMALS)} {random.randint(10, 99)}"


def learner_from_item(item):
    return {"id": item["sk"], "nickname": item["nickname"], "preferredLevel": item.get("preferredLevel"),
            "dailyGoal": item.get("dailyGoal", 5), "createdAt": item.get("createdAt", 0)}


def get_learner(req):
    """요청한 학습자. 아는 세션이면 마지막 사용 시각을 늘리고, 없거나 만료됐으면 새로 만든다 (IP 당 1시간 한도)"""
    if req.get("learner"):
        return req["learner"]
    sid = req["headers"].get(SESSION_HEADER) or ""
    session_ttl = SESSION_HOURS * 3600
    if SESSION_ID.match(sid):
        found = get_item("LEARNER", sid)
        if found and alive(found):
            update_item("LEARNER", sid, set_values={"lastSeen": now_ms(), TTL_ATTR: ttl_after(session_ttl)})
            req["learner"] = learner_from_item(found)
            return req["learner"]
    if not hit_limit(f"new:{req['ip']}", LIMITS["new_sessions_per_ip_hour"], 3600):
        raise ApiError(429, "새로 시작하는 요청이 너무 많아요. 잠시 뒤(최대 1시간)에 다시 시도해 주세요.")
    now = now_ms()
    item = {"pk": "LEARNER", "sk": str(uuid.uuid4()), "nickname": random_nickname(), "preferredLevel": None, "dailyGoal": 5,
            "createdAt": now, "lastSeen": now, TTL_ATTR: ttl_after(session_ttl), "xp": 0, "solved": 0}
    put_item(item)
    req["learner"] = learner_from_item(item)
    return req["learner"]


def record_ttl():
    """학습 기록(S#<세션 id> 파티션)의 TTL 값"""
    return ttl_after(SESSION_HOURS * 3600 + RECORD_EXTRA_DAYS * 86400)


# ─────────────────────────────────────────────────────────────
# 7. 커리큘럼·문제 데이터
#    META / curriculum : 단원·개념·난이도·자격증 (load-content Lambda 가 넣음)
#    CONTENT / <코드 id> : 코드(또는 개념 문제 묶음) 하나와 그 문제들
#    같은 Lambda 가 다시 불리면 메모리에 둔 것을 쓰고, 30초(CONTENT_CHECK_SEC)마다 META / content_version 이 바뀌었는지만 확인한다
# ─────────────────────────────────────────────────────────────

_cache = {"curriculum": None, "content": None, "version": None, "checked": 0}


def curriculum():
    if _cache["curriculum"] is None:
        item = get_item("META", "curriculum")
        if not item:
            raise ApiError(503, "문제 데이터가 아직 준비되지 않았어요. 관리자가 load-content 를 실행해야 해요.")
        data = item["data"]
        data["conceptMap"] = {c["id"]: c for c in data["concepts"]}
        data["unitMap"] = {u["id"]: u for u in data["units"]}
        _cache["curriculum"] = data
    return _cache["curriculum"]


def concept(concept_id):
    return curriculum()["conceptMap"].get(concept_id)


def concept_name(concept_id):
    c = concept(concept_id)
    return c["name"] if c else concept_id


def unit(unit_id):
    return curriculum()["unitMap"].get(unit_id)


def units_of(track):
    return [u for u in curriculum()["units"] if u["track"] == track]


def concepts_of(track):
    ids = {u["id"] for u in units_of(track)}
    return [c for c in curriculum()["concepts"] if c["unitId"] in ids]


def track_of(concept_id):
    c = concept(concept_id)
    u = unit(c["unitId"]) if c else None
    return u["track"] if u else "code"


def level_info(level):
    return curriculum()["levels"][min(max(int(level), 1), 5) - 1]


def generatable_levels(concept_id):
    c = concept(concept_id)
    return LEVELS_BY_UNIT.get(c["unitId"], []) if c else []


def content_version():
    return (get_item("META", "content_version") or {}).get("value", "0")


def load_content():
    """공개(published)된 코드와 문제 전부: {"items": {id: 코드}, "questions": {id: 문제}, "byItem": {코드 id: [문제]}}"""
    if _cache["content"] and time.time() - _cache["checked"] < CONTENT_CHECK_SEC:
        return _cache["content"]
    version = content_version()
    _cache["checked"] = time.time()
    if _cache["content"] and _cache["version"] == version:
        return _cache["content"]
    items, questions, by_item = {}, {}, {}
    for row in query_all("CONTENT"):
        if row.get("status") != "published":
            continue
        items[row["sk"]] = row["item"]
        by_item[row["sk"]] = row.get("questions", [])
        for q in by_item[row["sk"]]:
            questions[q["id"]] = q
    _cache["content"] = {"items": items, "questions": questions, "byItem": by_item}
    _cache["version"] = version
    _cache["curriculum"] = None   # 커리큘럼도 함께 바뀌었을 수 있다
    return _cache["content"]


def get_question(question_id):
    """문제 id → (문제, 그 문제의 코드). 없으면 (None, None)"""
    content = load_content()
    q = content["questions"].get(question_id)
    item = content["items"].get(q["codeItemId"]) if q else None
    return (q, item) if q and item else (None, None)


def bump_content_version():
    put_item({"pk": "META", "sk": "content_version", "value": f"{now_ms()}-{uuid.uuid4().hex[:6]}"})


def coverage():
    """개념 × 난이도('개념:난이도')별 공개 문제 수"""
    content = load_content()
    out = {}
    for item in content["items"].values():
        for c in item["concepts"]:
            key = f"{c}:{item['level']}"
            out[key] = out.get(key, 0) + len(content["byItem"].get(item["id"], []))
    return out


# ─────────────────────────────────────────────────────────────
# 8. 학습 기록 통계 (AI 없이 규칙으로 계산)
#    S#<세션 id> / A#<번호> : 풀이 한 번 (문제, 맞았는지, 힌트, 시간, 오개념)
# ─────────────────────────────────────────────────────────────

MASTERED = 80   # 이해도가 이 이상이면 '익힘'
WEAK = 60       # 2번 이상 풀었는데 이해도가 이보다 낮으면 '다질 개념'


def list_attempts(session_id):
    rows = query_all(f"S#{session_id}", prefix="A#")
    return [{"id": r["id"], "questionId": r["questionId"], "codeItemId": r.get("codeItemId"), "questionType": r["questionType"],
             "concepts": r.get("concepts", []), "level": r.get("level", 1), "correct": bool(r.get("correct")),
             "partial": bool(r.get("partial")), "hintsUsed": r.get("hintsUsed", 0), "timeMs": r.get("timeMs", 0),
             "misconception": r.get("misconception"), "gradedBy": r.get("gradedBy", "rule"), "createdAt": r.get("createdAt", 0),
             "answer": r.get("answer")} for r in rows]


def attempt_quality(a):
    """풀이 한 번이 이해도에 주는 점수 (0~1). 힌트를 많이 볼수록 낮다"""
    if a["correct"]:
        return max(0.4, 1 - 0.15 * min(a["hintsUsed"], 4))
    return 0.5 if a["partial"] else 0


def xp_for_attempt(a):
    base = (15 if a["hintsUsed"] == 0 else 10) if a["correct"] else (6 if a["partial"] else 2)
    return base + ((a["level"] - 1) * 2 if a["correct"] else 0)


def concept_stats(attempts):
    """개념별 통계 {개념 id: {attempts, correct, accuracy, mastery, avgTimeMs, recentWrong}} — 모든 개념이 들어 있다"""
    by = {}
    for a in attempts:
        for c in a["concepts"]:
            by.setdefault(c, []).append(a)
    out = {}
    for c in curriculum()["concepts"]:
        lst = by.get(c["id"], [])
        recent = lst[-5:]
        quality = sum(attempt_quality(a) for a in recent) / len(recent) if recent else 0
        correct = sum(1 for a in lst if a["correct"])
        n = len(lst)
        out[c["id"]] = {"conceptId": c["id"], "attempts": n, "correct": correct,
                        "accuracy": round(correct / n * 100) if n else 0,
                        "mastery": round(quality * min(n / 3, 1) * 100),
                        "avgTimeMs": round(sum(a["timeMs"] for a in lst) / n) if n else 0,
                        "recentWrong": sum(1 for a in lst[-10:] if not a["correct"])}
    return out


def is_weak(s):
    return bool(s) and s["attempts"] >= 2 and s["mastery"] < WEAK


def weak_concepts(stats):
    return sorted([s for s in stats.values() if is_weak(s)], key=lambda s: s["mastery"])


def strong_concepts(stats):
    return sorted([s for s in stats.values() if s["mastery"] >= MASTERED], key=lambda s: -s["mastery"])


def misconception_counts(attempts):
    counts = {}
    for a in attempts:
        if a.get("misconception"):
            counts[a["misconception"]] = counts.get(a["misconception"], 0) + 1
    return sorted([{"text": t, "count": n} for t, n in counts.items()], key=lambda m: -m["count"])


def suggest_level(attempts, current):
    """최근 8번(같은 난이도)의 정답률·힌트로 추천 난이도. 추천만 하고 바꾸지는 않는다"""
    recent = [a for a in attempts if a["level"] == current][-8:]
    if len(recent) < 5:
        return {"level": current, "direction": "stay", "message": "조금 더 풀어보면 알맞은 난이도를 추천해 드릴게요."}
    accuracy = sum(1 for a in recent if a["correct"]) / len(recent)
    hints = sum(min(a["hintsUsed"], 4) for a in recent) / len(recent)
    if accuracy >= 0.8 and hints < 1 and current < 5:
        return {"level": current + 1, "direction": "up", "message": "지금 난이도를 안정적으로 해결하고 있어요. 조금 더 어려운 문제에 도전해 보세요."}
    if accuracy < 0.4 and current > 1:
        return {"level": current - 1, "direction": "down", "message": "한 단계 낮은 난이도로 개념을 다지고 다시 올라와도 좋아요."}
    return {"level": current, "direction": "stay", "message": "지금 난이도가 딱 알맞아요. 이대로 꾸준히 가 봐요."}


def day_key(ms):
    """날짜 (한국 시간 기준 yyyy-mm-dd)"""
    return datetime.fromtimestamp(ms / 1000 + 9 * 3600, tz=timezone.utc).strftime("%Y-%m-%d")


def learner_level(xp):
    level = 1
    while 50 * (level + 1) * level <= xp:
        level += 1
    base = 50 * level * (level - 1)
    nxt = 50 * (level + 1) * level
    return {"level": level, "current": xp - base, "needed": nxt - base}


ANALYSIS_EVERY = 10   # 학습자 분석은 새로 푼 문제가 이만큼 쌓일 때마다 한 번 (AI 비용 관리)


def latest_analysis(session_id):
    """가장 최근 학습자 분석 (S#<세션 id> / N#<번호>)"""
    rows = query_all(f"S#{session_id}", prefix="N#", descending=True, limit=1)
    if not rows:
        return None
    r = rows[0]
    return {"id": r["id"], "attemptCount": r["attemptCount"], "result": r["result"], "source": r["source"], "createdAt": r["createdAt"]}


def unread_lessons(content, seen, level, max_gap, keep=lambda item: True, question_ok=lambda q: True):
    """아직 다 읽지 않은 코드 (난이도 차이 max_gap 안, 가까운 난이도부터)"""
    out = [i for i in content["items"].values()
           if i["track"] == "code" and keep(i) and abs(i["level"] - level) <= max_gap
           and any(question_ok(q) and q["id"] not in seen for q in content["byItem"].get(i["id"], []))]
    return sorted(out, key=lambda i: abs(i["level"] - level))


def recommend_code_concept(content, attempts, stats, level, question_ok=lambda q: True):
    """코드 학습의 추천 개념: 하던 개념 → 아직 익히지 않은 다음 개념 → 새 코드가 남은 개념. (개념, 이유)"""
    seen = {a["questionId"] for a in attempts}
    order = [cid for u in units_of("code") for cid in u["conceptIds"]]
    first = order[0] if order else curriculum()["concepts"][0]["id"]

    def unmastered(cid):
        return stats.get(cid, {}).get("mastery", 0) < MASTERED

    def fresh(cid, gap):
        return unread_lessons(content, seen, level, gap, lambda i: cid in i["concepts"], question_ok)

    last = attempts[-1]["concepts"][0] if attempts and attempts[-1]["concepts"] else None
    if last and track_of(last) == "code" and unmastered(last) and fresh(last, 0):
        return last, "continue"
    nxt = next((c for c in order if unmastered(c) and fresh(c, 0)), None) or next((c for c in order if unmastered(c) and fresh(c, 1)), None)
    if nxt:
        return nxt, "next"
    return next((c for c in order if fresh(c, 4)), first), "polish"


def wrong_questions(attempts):
    """마지막 풀이가 오답인 문제 (최근에 틀린 순서)"""
    last = {}
    for a in attempts:
        prev = last.get(a["questionId"])
        last[a["questionId"]] = {"correct": a["correct"], "at": a["createdAt"],
                                 "misconception": a.get("misconception") or (prev or {}).get("misconception"),
                                 "tries": (prev or {}).get("tries", 0) + 1}
    out = [{"questionId": qid, "lastAt": v["at"], "misconception": v["misconception"], "tries": v["tries"]}
           for qid, v in last.items() if not v["correct"]]
    return sorted(out, key=lambda w: -w["lastAt"])


# ─────────────────────────────────────────────────────────────
# 9. 보기 섞기: 객관식 보기는 문제 id 로 정한 순서로 섞어서 보여 준다 (항상 같은 순서)
#    화면에서 고른 번호 → 원래 번호로 되돌려서 채점한다
# ─────────────────────────────────────────────────────────────


def _imul(a, b):
    return (a * b) & 0xFFFFFFFF


def seeded_permutation(n, seed):
    """seed 로 정해지는 섞인 순서 (원래 순서와 같으면 한 칸 돌림). 예전 Node 서버와 같은 결과"""
    h = 2166136261
    for ch in seed:
        h = _imul(h ^ (ord(ch) & 0xFFFF), 16777619)

    def rand():
        nonlocal h
        h = (_imul(h ^ (h >> 15), 2246822507) ^ _imul(h ^ (h >> 13), 3266489909)) & 0xFFFFFFFF
        return h / 4294967296

    arr = list(range(n))
    for i in range(n - 1, 0, -1):
        j = int(rand() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    if n > 1 and arr == list(range(n)):
        arr = arr[1:] + arr[:1]
    return arr


def has_choices(q):
    return q.get("type") in ("multiple_choice", "fill_blank")


def choice_order(q):
    return seeded_permutation(len(q["choices"]), f"{q['id']}:choices") if has_choices(q) else []


def displayed_choices(q):
    """화면에 보이는 순서의 보기 글"""
    return [q["choices"][i]["text"] for i in choice_order(q)]


def unshuffle_answer(q, answer):
    """화면 번호로 온 답 → 원래 보기 번호"""
    if answer and has_choices(q) and answer.get("type") == q["type"]:
        order = choice_order(q)
        idx = answer.get("index", -1)
        return {**answer, "index": order[idx] if 0 <= idx < len(order) else -1}
    return answer


def display_choice_index(q, original_index):
    order = choice_order(q)
    return order.index(original_index) if original_index in order else -1


# ─────────────────────────────────────────────────────────────
# 10. AI 호출 (Bedrock Converse)
#     - 구조화 응답(ask_ai): 'answer' 도구 하나를 주고 반드시 그 도구로 답하게 해서, 도구 입력(JSON)을 결과로 쓴다
#     - 이번 달 추정 비용 + 이번 호출의 최대 비용이 예산을 넘으면 부르지 않는다 (AiUnavailable → 규칙 기반 대체)
#     - 호출마다 USAGE / <연-월>#<작업>#<모델> 에 토큰 수를 더한다 (관리자 화면의 비용)
#     - AI_MODE=mock 이면 mock 함수의 결과를 돌려준다 (비용 없음, 화면 확인용)
# ─────────────────────────────────────────────────────────────


class AiUnavailable(Exception):
    """AI 를 쓸 수 없음 (꺼짐·예산·형식 오류) → 부른 쪽에서 규칙 기반 결과를 쓴다"""


def ai_enabled():
    return AI_MODE in ("live", "mock")


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
    if month_cost_usd() + worst > POLICY["monthlyBudgetUsd"]:
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


def ask_text(task, system, prompt, history=None, max_tokens=1000, mock=None):
    """AI 에게 묻고 글로 답을 받는다 (튜터 대화). 돌려주는 값: (답, 사용량)"""
    if AI_MODE == "mock":
        if not mock:
            raise AiUnavailable("no mock")
        time.sleep(MOCK_DELAY_SEC)
        answer = mock()
        log_usage(task, f"mock:{MODEL_ID}", (len(system) + len(prompt)) // 2, len(answer) // 2, 0, True)
        return answer, {"inputTokens": 0, "outputTokens": 0}
    if AI_MODE != "live":
        raise AiUnavailable("AI is off")
    messages = build_messages(history, prompt)
    check_budget(len(system) + sum(len(m["content"][0]["text"]) for m in messages), max_tokens)
    ok, usage = False, {}
    try:
        response = bedrock().converse(modelId=MODEL_ID, system=[{"text": system}], messages=messages,
                                      inferenceConfig={"maxTokens": max_tokens, "temperature": 0.3})
        usage = response.get("usage", {})
        answer = response["output"]["message"]["content"][0]["text"]
        ok = True
        return answer, {"inputTokens": usage.get("inputTokens", 0), "outputTokens": usage.get("outputTokens", 0)}
    finally:
        log_usage(task, MODEL_ID, usage.get("inputTokens", 0), usage.get("outputTokens", 0), usage.get("cacheReadInputTokens", 0), ok)


def ask_ai(task, system, prompt, schema, max_tokens=4000, mock=None, history=None, salvage=None, mock_delay=None):
    """AI 에게 정해진 형식(schema, JSON Schema)의 답을 받는다. 형식이 어긋나면 흔한 실수를 고치고, 그래도 틀리면 AiUnavailable"""
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
# 11. 다른 Lambda 부르기 (InvocationType=Event: 응답을 기다리지 않음)
#     실행 역할에 lambda:InvokeFunction 권한이 필요하다
# ─────────────────────────────────────────────────────────────


def invoke_async(name, payload):
    """FUNCTIONS 의 이름(generate-code 등)으로 다른 Lambda 를 부른다. 실패하면 False (학습은 계속)"""
    try:
        lambda_client().invoke(FunctionName=FUNCTIONS[name], InvocationType="Event",
                               Payload=json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        return True
    except Exception as e:
        print("[invoke]", name, repr(e))
        return False


# ─────────────────────────────────────────────────────────────
# 12. 설정 값(META)·생성 작업 기록(JOB)·수요 신호(DEMAND)
# ─────────────────────────────────────────────────────────────


def get_meta(key):
    return (get_item("META", key) or {}).get("value")


def set_meta(key, value):
    put_item({"pk": "META", "sk": key, "value": value})


def auto_generation_enabled():
    return get_meta("auto_generation") != "off"


def jobs_since(since_ms):
    """since_ms 이후에 만든 생성 작업들 (작업 번호가 시각 기반이라 정렬 키 범위로 읽는다)"""
    return query_all("JOB", start=pad(since_ms * 1000))


def running_job(concept_id, level):
    """같은 개념·난이도로 10분 안에 시작해 아직 진행 중인 작업"""
    return next((j for j in jobs_since(now_ms() - 600_000)
                 if j["concept"] == concept_id and j["level"] == level and j["status"] == "running"), None)


def record_demand(concept_id, level, session_id):
    put_item({"pk": "DEMAND", "sk": f"{concept_id}#{level}#{session_id}", "concept": concept_id, "level": level,
              "sessionId": session_id, "lastAt": now_ms(), TTL_ATTR: ttl_after(POLICY["demandWindowDays"] * 86400)})


def demand_count(concept_id, level, since_ms):
    return sum(1 for d in query_all("DEMAND", prefix=f"{concept_id}#{level}#") if d.get("lastAt", 0) >= since_ms)
