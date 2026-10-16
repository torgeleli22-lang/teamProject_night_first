import hashlib
import hmac
import os
import re

from common import (AI_MODE, MODEL_ID, POLICY, TRIGGER_LABEL, ApiError, bump_content_version, bump_counter, concept, concepts_of,
                    coverage, curriculum, estimate_cost, field, generatable_levels, get_item, get_meta, invoke_async, month_cost_usd,
                    month_key, now_ms, pad, put_item, query_all, read_counter, set_meta, track_of,
                    update_item, usage_summary)

# ─────────────────────────────────────────────────────────────
# 관리자 (admin.py) — jojo_api 의 기능 파일
#   관리자 화면(/admin)이 부른다. 모든 요청에 x-admin-token 헤더(관리자 코드)가 필요하다.
#
#   GET  /admin/overview   현황: AI 모드·비용·문제 재고·생성 작업·AI 콘텐츠
#   POST /admin/generate   AI 문제 만들기 {"concept": "map", "level": 3, "count": 1, "instructions": "..."}
#                          → 코드 주제는 generate-code(Node.js 함수), 개념 주제는 generate_theory.py 를 뒤에서 실행 (기다리지 않음)
#   GET  /admin/fill       출시 전 채우기 계획 (문제가 모자란 칸)
#   POST /admin/fill       출시 전 채우기 시작 (?limit=5)
#   POST /admin/auto       자동 생성 켜기/끄기 {"enabled": true}
#   POST /admin/stop       생성 멈추기 {"jobId": 123} (없으면 전부)
#   POST /admin/code       관리자 코드 바꾸기 {"code": "8자 이상"}
#   POST /admin/repair     반려된 AI 콘텐츠 고쳐서 다시 만들기 {"itemId": "...", "instructions": "..."}
#   GET  /admin/item       AI 콘텐츠 하나 (정답·해설 포함) ?id=...
#   POST /admin/review     승인 대기 개념 문제 승인/반려 {"itemId": "...", "decision": "approve"|"reject", "removeQuestionIds": [...]}
#   GET  /admin/export     AI 콘텐츠·설정·이번 달 사용량 내보내기
#   POST /admin/import     내보낸 파일 가져오기
#
#   관리자 코드: META / admin_code_hash 에 scrypt 해시로 저장 (원문은 저장하지 않음)
#   복구 코드: 환경 변수 ADMIN_TOKEN (관리자 코드를 잊어도 들어올 수 있게). 틀린 코드를 15분에 10번 넣으면 그 IP 는 잠긴다
# ─────────────────────────────────────────────────────────────

ADMIN_CODE_MIN, ADMIN_CODE_MAX = 8, 64
MAX_FAILURES, LOCK_WINDOW_SEC = 10, 15 * 60
EXPORT_FORMAT, OLD_EXPORT_FORMAT = "codereading-export/2", "codereading-export/1"
EXPORT_META_KEYS = ["admin_code_hash", "auto_generation"]
NOT_VERIFIABLE = "이 주제는 아직 AI로 만들 수 없어요."


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


def overview(req):
    # 1. 문제 재고·수요·AI 사용량 모으기
    stock = coverage()
    usage = usage_summary()
    since = now_ms() - POLICY["demandWindowDays"] * 86400_000
    demand = {}
    for d in query_all("DEMAND"):
        if d.get("lastAt", 0) >= since:
            key = f"{d['concept']}:{d['level']}"
            demand[key] = demand.get(key, 0) + 1
    stats = get_item("STATS", "GRADED") or {}
    # 2. 화면에 보여 줄 값
    return {
        "mode": AI_MODE if AI_MODE in ("live", "mock") else "off",
        "autoGeneration": get_meta("auto_generation") != "off",
        "adminCode": {"custom": bool(get_meta("admin_code_hash")), "recovery": bool(os.environ.get("ADMIN_TOKEN"))},
        "models": {"fast": MODEL_ID, "smart": MODEL_ID},
        "db": "dynamodb",
        "policy": POLICY,
        "triggerLabels": TRIGGER_LABEL,
        "generatable": {c["id"]: generatable_levels(c["id"]) for c in curriculum()["concepts"]},
        "coverage": stock,
        "demand": demand,
        "fillPlan": fill_plan(stock),
        "usage": usage,
        "cost": {"total": estimate_cost(usage), "monthToDate": month_cost_usd(include_mock=AI_MODE == "mock")},
        "grading": {"rule": stats.get("rule", 0), "ai": stats.get("ai", 0)},
        "jobs": [job_view(j) for j in query_all("JOB", descending=True, limit=30)],
        "generated": [row_view(r) for r in sorted(ai_items(), key=lambda r: -r.get("createdAt", 0))[:20]],
    }


def generate(req):
    # 1. 요청 값 확인
    body = req["body"]
    concept_id = field(body, "concept", "str", required=True, max_len=50)
    level = field(body, "level", "int", required=True, low=1, high=5)
    count = field(body, "count", "int", default=1, low=1, high=5)
    instructions = (field(body, "instructions", "str", default="", max_len=1000) or "").strip() or None
    if not concept(concept_id):
        raise ApiError(400, "요청 값을 확인해 주세요.")
    if not generatable_levels(concept_id):
        raise ApiError(400, NOT_VERIFIABLE)
    if AI_MODE not in ("live", "mock"):
        raise ApiError(400, "AI 가 꺼져 있어요 (AI_MODE=live 또는 mock 이어야 해요).")
    # 2. 코드 주제 → generate-code, 개념 주제 → generate-theory (응답을 기다리지 않음)
    target = "generate-theory" if track_of(concept_id) == "theory" else "generate-code"
    ok = invoke_async(target, {"concept": concept_id, "level": level, "count": count, "trigger": "manual",
                               "reason": manual_reason(instructions), "instructions": instructions})
    if not ok:
        raise ApiError(500, f"{target} Lambda 를 부르지 못했어요. 함수 이름(환경 변수)과 실행 역할 권한을 확인해 주세요.")
    return {"jobId": 0, "status": "started", "started": count}


def fill_plan_view(req):
    return {"plan": fill_plan(coverage())}


def fill(req):
    if AI_MODE not in ("live", "mock"):
        raise ApiError(400, "AI 가 꺼져 있어요 (AI_MODE=live 또는 mock 이어야 해요).")
    limit = min(int(req["query"].get("limit", "5") or 5), 30)
    cells = fill_plan(coverage())[:limit]
    if cells:
        invoke_async("generate-code", {"fill": [{"concept": c["concept"], "level": c["level"], "stock": c["stock"]} for c in cells]})
    return {"started": len(cells), "cells": cells}


def auto(req):
    enabled = field(req["body"], "enabled", "bool", required=True)
    set_meta("auto_generation", "on" if enabled else "off")
    return {"autoGeneration": enabled}


def stop(req):
    job_id = field(req["body"], "jobId", "int", low=1)
    # 1. 멈출 작업: 지정한 것 하나, 없으면 최근 하루 안의 진행 중 작업 전부
    targets = [job_id] if job_id else [j["id"] for j in query_all("JOB", start=pad((now_ms() - 86400_000) * 1000)) if j["status"] == "running"]
    # 2. 진행 중인 것만 cancelled 로 (생성 Lambda 들이 단계마다 확인하고 멈춘다)
    stopped = 0
    for jid in targets:
        done = update_item("JOB", pad(jid), set_values={"status": "cancelled", "error": "관리자가 중지했어요", "finishedAt": now_ms()},
                           condition="#st = :running", names={"#st": "status"}, values={":running": "running"})
        stopped += done is not None
    # 3. 전부 멈출 때는 시각을 남겨, 여러 칸을 차례로 만드는 작업이 다음 칸으로 넘어가지 않게 한다
    if not job_id:
        set_meta("generation_stop_at", str(now_ms()))
    return {"stopped": stopped}


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


def repair(req):
    item_id = field(req["body"], "itemId", "str", required=True, max_len=120)
    instructions = (field(req["body"], "instructions", "str", default="", max_len=1000) or "").strip() or None
    row = get_item("CONTENT", item_id)
    if not row or row.get("source") != "ai":
        raise ApiError(404, "AI 생성 콘텐츠를 찾을 수 없어요.")
    if row["status"] != "rejected":
        raise ApiError(400, "반려된 콘텐츠만 고쳐서 다시 만들 수 있어요.")
    target_concept = next((c for c in row["item"]["concepts"] if generatable_levels(c)), None)
    if not target_concept:
        raise ApiError(400, NOT_VERIFIABLE)
    checks = (row.get("validation") or {}).get("checks", [])
    failures = "\n".join(f"- {c['name']}{' (' + c['detail'] + ')' if c.get('detail') else ''}" for c in checks if not c["pass"])
    target = "generate-theory" if track_of(target_concept) == "theory" else "generate-code"
    invoke_async(target, {
        "concept": target_concept, "level": row["item"]["level"], "trigger": "manual",
        "reason": manual_reason(instructions, f"(반려된 '{row['item']['title']}' 고치기)"), "instructions": instructions,
        "repairFrom": {"title": row["item"]["title"], "code": row["item"]["code"],
                       "actualOutput": (row.get("validation") or {}).get("actualOutput") or row["item"].get("output"),
                       "questions": row.get("questions", []), "failures": failures or "- (실패 항목 기록 없음)"},
    })
    return {"jobId": 0, "status": "started", "started": 1}


def item(req):
    row = get_item("CONTENT", req["query"].get("id", ""))
    if not row or row.get("source") != "ai":
        raise ApiError(404, "AI 생성 콘텐츠를 찾을 수 없어요.")
    return {"row": row_view(row), "output": row["item"].get("output"), "questions": row.get("questions", [])}


def review(req):
    body = req["body"]
    item_id = field(body, "itemId", "str", required=True, max_len=120)
    decision = field(body, "decision", "str", required=True, choices=["approve", "reject"])
    remove = set(field(body, "removeQuestionIds", "list", default=[], max_len=20))
    # 1. 승인 대기 중인 AI 콘텐츠인지 확인
    row = get_item("CONTENT", item_id)
    if not row or row.get("source") != "ai":
        raise ApiError(404, "AI 생성 콘텐츠를 찾을 수 없어요.")
    if row["status"] != "pending":
        raise ApiError(400, "승인 대기 중인 콘텐츠만 승인·반려할 수 있어요.")
    # 2. 승인: 뺄 문제를 빼고 공개 / 반려: 그대로 반려 상태로
    status = "published" if decision == "approve" else "rejected"
    questions = [q for q in row.get("questions", []) if q["id"] not in remove] if decision == "approve" else row.get("questions", [])
    if decision == "approve" and not questions:
        raise ApiError(400, "남는 문제가 없어요. 반려를 눌러 주세요.")
    put_item({**row, "status": status, "item": {**row["item"], "status": status}, "questions": questions})
    # 3. 문제 목록을 다시 읽도록 버전 올리기
    bump_content_version()
    return {"status": status, "questions": len(questions) if decision == "approve" else 0}


def export(req):
    meta = {k: get_meta(k) for k in EXPORT_META_KEYS if get_meta(k) is not None}
    return {
        "format": EXPORT_FORMAT,
        "exportedAt": now_ms(),
        "from": "dynamodb",
        "items": [{"row": row_view(r), "item": r["item"], "questions": r.get("questions", [])}
                  for r in sorted(ai_items(), key=lambda r: r.get("createdAt", 0))],
        "meta": meta,
        "usageThisMonth": [u for u in usage_summary(month_key()) if not u["model"].startswith("mock:")],
    }


def import_data(req):
    body = req["body"]
    fmt = field(body, "format", "str", required=True, choices=[EXPORT_FORMAT, OLD_EXPORT_FORMAT])
    items = field(body, "items", "list", default=[], max_len=2000)
    meta = field(body, "meta", "dict", default={})
    usage = field(body, "usageThisMonth", "list", default=[])
    include_usage = field(body, "includeUsage", "bool", default=False)
    # 예전 형식(1)의 콘텐츠는 지금 학습 구조와 맞지 않아 건너뛴다
    kept = items if fmt == EXPORT_FORMAT else []
    for e in kept:
        row, it = e["row"], e["item"]
        if row.get("status") not in ("published", "rejected", "pending"):
            raise ApiError(400, "요청 값을 확인해 주세요.")
        put_item({"pk": "CONTENT", "sk": row["id"], "item": {**it, "source": "ai"}, "questions": e.get("questions", []), "source": "ai",
                  "status": row["status"], "validation": row.get("validation"), "jobId": None, "createdAt": row.get("createdAt", now_ms())})
    if kept:
        bump_content_version()
    settings = 0
    for key, value in meta.items():
        if key in EXPORT_META_KEYS and isinstance(value, str):
            set_meta(key, value)
            settings += 1
    if include_usage:
        month = month_key()
        for u in usage:
            update_item("USAGE", f"{month}#{u['task']}#{u['model']}", set_values={"task": u["task"], "model": u["model"], "month": month},
                        add_values={k: u.get(k, 0) for k in ("calls", "input", "output", "cacheRead", "failures")})
    return {"items": len(kept), "skippedItems": len(items) - len(kept), "settings": settings, "usage": len(usage) if include_usage else 0}


ROUTES = {
    "GET /admin/overview": overview,
    "POST /admin/generate": generate,
    "GET /admin/fill": fill_plan_view,
    "POST /admin/fill": fill,
    "POST /admin/auto": auto,
    "POST /admin/stop": stop,
    "POST /admin/code": change_code,
    "POST /admin/repair": repair,
    "GET /admin/item": item,
    "POST /admin/review": review,
    "GET /admin/export": export,
    "POST /admin/import": import_data,
}

# ───────────────────────── 도움 함수 ─────────────────────────


def ai_items():
    return [r for r in query_all("CONTENT") if r.get("source") == "ai"]


def row_view(r):
    return {"id": r["sk"], "title": r["item"]["title"], "code": r["item"]["code"], "concepts": r["item"]["concepts"],
            "level": r["item"]["level"], "status": r["status"], "validation": r.get("validation"),
            "questionCount": len(r.get("questions", [])), "createdAt": r.get("createdAt", 0)}


def job_view(j):
    return {k: j.get(k) for k in ("id", "concept", "level", "trigger", "sessionId", "mock", "status", "reason", "itemId", "error", "createdAt", "finishedAt")}


def fill_plan(stock):
    """출시 전 채우기: 생성 대상 칸 중 최소 재고에 못 미치는 칸과 필요한 세트 수 (코드 세트 하나 = 문제 4개)"""
    out = []
    for c in concepts_of("code"):
        for lv in generatable_levels(c["id"]):
            n = stock.get(f"{c['id']}:{lv}", 0)
            if n < POLICY["minStock"]:
                out.append({"concept": c["id"], "level": lv, "stock": n, "sets": -(-(POLICY["minStock"] - n) // 4)})
    return out


def manual_reason(instructions, progress=""):
    head = f"관리자 수동 생성{' ' + progress if progress else ''}"
    if not instructions:
        return head
    short = re.sub(r"\s+", " ", instructions).strip()
    return f"{head}: {short[:60] + '…' if len(short) > 60 else short}"
