import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import common
from common import (AI_MODE, MODEL_ID, MONTHLY_BUDGET_USD, ApiError, ai_switch_on, bump_counter, estimate_cost, field, get_item, get_meta,
                    month_cost_usd, month_key, normalize_model, query_all, read_counter, set_meta)

# ─────────────────────────────────────────────────────────────
# 관리자 (admin.py) — jojo_api 의 기능 파일
#   관리자 화면(/admin)이 부른다. 모든 요청에 x-admin-token 헤더(관리자 코드)가 필요하다.
#
#   GET  /admin/overview   현황: AI 모드·AI 스위치·이번 달 비용·예산·작업별 사용량(성공·실패·마지막 실패 이유)·최근 AI 호출 기록·날짜별 사용 수
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

# 지금 쓰는 AI 작업 (USAGE 의 작업 이름 → 화면 이름 · 설명). 여기 없는 이름은 예전 서비스의 기록이다
TASKS = {
    "code_generation": ("연습 코드 만들기", "연습 모드 '코드 받기'와 더 쉽게·더 어렵게. 검사에 걸리면 한 번 더 불러요"),
    "topic_check": ("주제 판정", "'직접 적기'로 낸 주제가 괜찮은지 봐요"),
    "code_inspection": ("내 코드 분석", "내 코드 점검 '메모하러 가기'. 난이도와 ※ 지점을 정해요"),
    "review": ("빨간펜 첨삭", "'첨삭 받기'. 메모가 하나도 없으면 AI 없이 규칙으로 해요"),
}
OLD_TASKS = {"tutor_chat": "튜터 대화", "content_generation": "문제 생성", "learner_analysis": "학습자 분석",
             "short_answer_eval": "주관식 평가", "theory_generation": "개념 문제 생성", "theory_review": "개념 문제 검수"}
EVENT_NAMES = ["practices", "adjusts", "topicChecks", "inspections", "reviews"]
RECENT_LOGS = 50

# 실패 이유 (common.ask_ai 가 남기는 영어 오류 → 관리자가 읽을 말)
ERROR_REASONS = [
    ("AccessDenied", "Bedrock 권한이 없어요 (실행 역할 또는 모델 사용 신청 확인)"),
    ("Throttling", "요청이 몰려 AWS 가 잠시 거절했어요"),
    ("ServiceQuota", "Bedrock 사용 한도에 닿았어요"),
    ("Validation", "요청 형식이 맞지 않아요 (MODEL_ID 확인)"),
    ("ResourceNotFound", "모델을 찾지 못했어요 (MODEL_ID·리전 확인)"),
    ("Timeout", "응답이 너무 늦었어요"),
    ("EndpointConnection", "Bedrock 에 연결하지 못했어요"),
    ("truncated", "답이 너무 길어서 잘렸어요"),
    ("could not parse", "AI 답의 형식이 맞지 않았어요"),
    ("budget", "이번 달 예산에 닿았어요"),
]


def reason(error):
    """오류 → 관리자가 읽을 짧은 이유. 서버 검사(stage=check) 문구는 이미 한국어라 그대로"""
    if not error:
        return ""
    for key, text in ERROR_REASONS:
        if key.lower() in error.lower():
            return f"{text} — {error}"
    return error


def task_name(task):
    if task in TASKS:
        return TASKS[task][0]
    return OLD_TASKS.get(task, task)


def short_model(model):
    return ("목업 · " if model.startswith("mock:") else "") + normalize_model(model)


def overview(req):
    # 1. 이번 달 AI 사용량: 작업 × 모델 한 줄씩 (지금 쓰는 작업 먼저)
    rows = []
    for r in query_all("USAGE", prefix=month_key()):
        calls, failures = int(r.get("calls", 0)), int(r.get("failures", 0))
        rows.append({
            "task": r.get("task"), "taskName": task_name(r.get("task")), "current": r.get("task") in TASKS,
            "description": TASKS.get(r.get("task"), ("", "예전 서비스(문제 풀이)에서 쓰던 작업이에요. 지금은 부르지 않아요"))[1],
            "model": r.get("model"), "modelName": short_model(r.get("model", "")), "mock": r.get("model", "").startswith("mock:"),
            "calls": calls, "successes": calls - failures, "failures": failures,
            "input": int(r.get("input", 0)), "output": int(r.get("output", 0)), "cacheRead": int(r.get("cacheRead", 0)),
            "costUsd": round(estimate_cost([{"model": r.get("model", ""), "input": r.get("input", 0), "output": r.get("output", 0),
                                              "cacheRead": r.get("cacheRead", 0)}]), 4),
            "lastAt": r.get("lastAt"), "lastError": reason(r.get("lastError")), "lastErrorAt": r.get("lastErrorAt"),
        })
    order = list(TASKS)
    rows.sort(key=lambda u: (not u["current"], order.index(u["task"]) if u["current"] else 0, -u["calls"]))
    real = [u for u in rows if not u["mock"]]

    # 2. 최근 AI 호출 하나하나 (14일 보관)
    recent = [{"at": r.get("createdAt"), "task": r.get("task"), "taskName": task_name(r.get("task")), "modelName": short_model(r.get("model", "")),
               "ok": bool(r.get("ok")), "stage": r.get("stage", "ai"), "input": int(r.get("input", 0)), "output": int(r.get("output", 0)),
               "ms": int(r.get("ms", 0)), "error": reason(r.get("error"))}
              for r in query_all("AILOG", descending=True, limit=RECENT_LOGS)]

    # 3. 최근 날짜별 사용 수 (STATS / DAY#날짜)
    days = []
    today = datetime.now(timezone.utc) + timedelta(hours=9)
    for i in range(STATS_DAYS):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        row = get_item("STATS", f"DAY#{day}") or {}
        days.append({"day": day, **{k: int(row.get(k, 0)) for k in EVENT_NAMES}})

    # 4. 화면에 보여 줄 값
    month = month_cost_usd(include_mock=AI_MODE == "mock")
    return {
        "mode": AI_MODE if AI_MODE in ("live", "mock") else "off",
        "aiSwitch": ai_switch_on(),
        "model": MODEL_ID,
        "budget": {"monthlyUsd": MONTHLY_BUDGET_USD, "monthToDateUsd": round(month, 4),
                   "realUsd": round(estimate_cost(real), 4), "percent": round(100 * month / MONTHLY_BUDGET_USD, 1) if MONTHLY_BUDGET_USD else 0},
        "usage": rows,
        "recent": recent,
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
