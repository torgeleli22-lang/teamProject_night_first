import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import common
from common import (AI_MODE, MODEL_ID, MONTHLY_BUDGET_USD, ApiError, ai_switch_on, bump_counter, estimate_cost, field, get_item, get_meta,
                    month_cost_usd, month_key, read_counter, set_meta, usage_summary)

# ─────────────────────────────────────────────────────────────
# 관리자 (admin.py) — jojo_api 의 기능 파일
#   관리자 화면(/admin)이 부른다. 모든 요청에 x-admin-token 헤더(관리자 코드)가 필요하다.
#
#   GET  /admin/overview   현황: AI 모드·AI 스위치·이번 달 비용·예산·작업별 사용량·날짜별 사용 수
#   POST /admin/ai         AI 켜기/끄기 {"enabled": false}  → 끄면 예시 코드·규칙 판정·규칙 첨삭으로 (비용 0)
#   POST /admin/code       관리자 코드 바꾸기 {"code": "8자 이상"}
#
#   관리자 코드: META / admin_code_hash 에 scrypt 해시로 저장 (원문은 저장하지 않음)
#   복구 코드: 환경 변수 ADMIN_TOKEN (관리자 코드를 잊어도 들어올 수 있게). 틀린 코드를 15분에 10번 넣으면 그 IP 는 잠긴다
# ─────────────────────────────────────────────────────────────

ADMIN_CODE_MIN, ADMIN_CODE_MAX = 8, 64
MAX_FAILURES, LOCK_WINDOW_SEC = 10, 15 * 60
STATS_DAYS = 14   # 관리자 화면에 보여 줄 최근 날짜 수


# ───────────────────────── 관리자 확인 ─────────────────────────


def require_admin(req):
    who = req["ip"]
    if read_counter(f"admin-fail:{who}", LOCK_WINDOW_SEC) >= MAX_FAILURES:
        raise ApiError(429, "관리자 코드를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.")
    given = req["headers"].get("x-admin-token") or ""
    recovery = os.environ.get("ADMIN_TOKEN", "")
    stored = get_meta("admin_code_hash")
    if not recovery and not stored:
        if os.environ.get("LOCAL_DEV") == "1":   # 내 컴퓨터(npm run api)에서는 코드 없이 열어 둔다
            return
        raise ApiError(401, "관리자 코드가 설정되지 않았어요. Lambda 환경 변수 ADMIN_TOKEN 을 넣어 주세요.")
    if given and ((recovery and same_text(given, recovery)) or (stored and code_matches(given, stored))):
        return
    if given:
        bump_counter(f"admin-fail:{who}", LOCK_WINDOW_SEC)
    raise ApiError(401, "관리자 권한이 필요해요.")


def same_text(a, b):
    return hmac.compare_digest(hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest())


def hash_code(code):
    """scrypt$소금$해시 (예전 Node 서버와 같은 형식: N=16384, r=8, p=1, 32바이트)"""
    salt = os.urandom(16)
    digest = hashlib.scrypt(code.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def code_matches(code, stored):
    parts = stored.split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    expected = bytes.fromhex(parts[2])
    actual = hashlib.scrypt(code.encode(), salt=bytes.fromhex(parts[1]), n=16384, r=8, p=1, dklen=len(expected))
    return hmac.compare_digest(actual, expected)


# ───────────────────────── 경로별 처리 ─────────────────────────

TASK_NAMES = {"code_generation": "연습 코드 만들기", "topic_check": "주제 판정", "code_inspection": "내 코드 분석", "review": "빨간펜 첨삭"}
EVENT_NAMES = ["practices", "adjusts", "topicChecks", "inspections", "reviews"]


def overview(req):
    # 1. 이번 달 AI 사용량 (작업·모델별)
    usage = usage_summary(month_key())
    real = [u for u in usage if not u["model"].startswith("mock:")]
    # 2. 최근 날짜별 사용 수 (STATS / DAY#날짜)
    days = []
    today = datetime.now(timezone.utc) + timedelta(hours=9)
    for i in range(STATS_DAYS):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        row = get_item("STATS", f"DAY#{day}") or {}
        days.append({"day": day, **{k: int(row.get(k, 0)) for k in EVENT_NAMES}})
    # 3. 화면에 보여 줄 값
    month = month_cost_usd(include_mock=AI_MODE == "mock")
    return {
        "mode": AI_MODE if AI_MODE in ("live", "mock") else "off",
        "aiSwitch": ai_switch_on(),
        "model": MODEL_ID,
        "budget": {"monthlyUsd": MONTHLY_BUDGET_USD, "monthToDateUsd": round(month, 4),
                   "realUsd": round(estimate_cost(real), 4), "percent": round(100 * month / MONTHLY_BUDGET_USD, 1) if MONTHLY_BUDGET_USD else 0},
        "usage": [{**u, "taskName": TASK_NAMES.get(u["task"], u["task"])} for u in usage],
        "days": days,
        "adminCode": {"custom": bool(get_meta("admin_code_hash")), "recovery": bool(os.environ.get("ADMIN_TOKEN"))},
    }


def switch_ai(req):
    enabled = field(req["body"], "enabled", "bool", required=True)
    set_meta("ai_switch", "on" if enabled else "off")
    # 이 Lambda 안의 30초 캐시도 바로 바꾼다 (다른 실행 환경은 30초 안에 따라온다)
    common._switch.update(value=enabled, checked=common.time.time())
    return {"aiSwitch": enabled}


def change_code(req):
    code = field(req["body"], "code", "str", required=True, max_len=200)
    if len(code) < ADMIN_CODE_MIN:
        raise ApiError(400, f"관리자 코드는 {ADMIN_CODE_MIN}자 이상이어야 해요.")
    if len(code) > ADMIN_CODE_MAX:
        raise ApiError(400, f"관리자 코드는 {ADMIN_CODE_MAX}자 이하여야 해요.")
    if code.strip() != code:
        raise ApiError(400, "앞뒤에 공백을 넣을 수 없어요.")
    set_meta("admin_code_hash", hash_code(code))
    return {"ok": True}


ROUTES = {
    "GET /admin/overview": overview,
    "POST /admin/ai": switch_ai,
    "POST /admin/code": change_code,
}
