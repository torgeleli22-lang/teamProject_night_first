import threading
import time

import common
import practice
from common import LANGUAGES, field

# ─────────────────────────────────────────────────────────────
# 문항 생성·검증 실험 (experiment.py) — jojo_api 의 기능 파일. 논문 표 1 (docs/EXPERIMENT.md)
#
#   POST /admin/experiment   {"no": 1, "language": "python", "level": 2, "topic": "카페 주문"}   (관리자 코드 필요)
#   → 연습 모드와 똑같이 문항 하나를 만들고(practice.make_code), 단계마다 무엇이 있었는지 돌려준다
#     {"attempts": [{"rule_problems", "check_problems", "check_ran", "fixed", …}], "origin": "ai"|"sample",
#      "seconds", "tokens_in", "tokens_out", "ai_errors", "code", "marks", …}
#
#   - 출제 → 규칙 검사 → 교차 검토 → (재생성) → 예시 코드 흐름은 그대로이고, 단계 함수를 감싸서 기록만 한다
#   - 만든 문항은 저장하지 않는다 (학습자 기록과 섞이지 않게). AI 사용량은 관리자 화면 비용에 그대로 잡힌다
#   - 실험 중에만 요청 수 한도(1시간 30번)를 건너뛴다. 월 예산 확인·AI 끄기는 그대로
#   - 실험이 아닌 요청에서는 감싼 함수가 원래 함수를 그대로 부른다 (기록 없음)
#   - 40문항은 scripts/experiment_generation.py 가 이 경로를 여러 번 불러 모은다
# ─────────────────────────────────────────────────────────────

_local = threading.local()   # 지금 만들고 있는 문항의 기록 (실험 요청일 때만 있음)


def rec():
    return getattr(_local, "rec", None)


# ───────────────────────── 단계 함수 감싸기 (실험일 때만 기록, 동작은 그대로) ─────────────────────────

_orig = {
    "check_generated": practice.check_generated,
    "ai_check_code": practice.ai_check_code,
    "ask_ai": practice.ask_ai,
    "ai_allowed": practice.ai_allowed,
    "log_usage": common.log_usage,
}


def check_generated(r, level, language="python"):
    """② 규칙 검사: 시도마다 문제 목록을 적는다"""
    code, marks, problems = _orig["check_generated"](r, level, language)
    if rec() is not None:
        rec()["attempts"].append({"lines": len(code.split("\n")), "marks": len(marks), "rule_problems": problems,
                                  "check_problems": None, "check_ran": False, "fixed": 0, "fixed_ids": []})
    return code, marks, problems


def ai_check_code(code, marks, level, language):
    """③ 교차 검토: 재생성할 문제와, 교체된 모범 설명 수를 적는다"""
    before = {m["id"]: m["explanation"] for m in marks}
    problems, fixed_marks = _orig["ai_check_code"](code, marks, level, language)
    if rec() is not None:
        attempt = rec()["attempts"][-1]
        attempt["check_ran"] = not rec().pop("_check_unavailable", False)
        attempt["check_problems"] = problems
        attempt["fixed_ids"] = [m["id"] for m in fixed_marks if before.get(m["id"]) != m["explanation"]]
        attempt["fixed"] = len(attempt["fixed_ids"])
    return problems, fixed_marks


def ask_ai(task, *args, **kwargs):
    """AI 호출 시간·실패 이유를 적는다 (code_generation · code_check)"""
    if rec() is None:
        return _orig["ask_ai"](task, *args, **kwargs)
    started = time.time()
    try:
        return _orig["ask_ai"](task, *args, **kwargs)
    except common.AiUnavailable as e:
        rec()["ai_errors"].append(f"{task}: {e}")
        if task == "code_check":
            rec()["_check_unavailable"] = True
        raise
    finally:
        rec()["ai_calls"].append({"task": task, "sec": round(time.time() - started, 2)})


def ai_allowed(req):
    """실험 중에는 요청 수 한도를 건너뛴다 (월 예산 확인은 ask_ai 안에서 그대로)"""
    return True if rec() is not None else _orig["ai_allowed"](req)


def log_usage(task, model, inp, out, cache_read, ok, error=None, ms=0):
    """토큰 수를 문항 기록에 더한다 (원래 기록 — OPS#USAGE · OPS#AILOG — 도 그대로)"""
    if rec() is not None:
        rec()["tokens_in"] += int(inp or 0)
        rec()["tokens_out"] += int(out or 0)
    return _orig["log_usage"](task, model, inp, out, cache_read, ok, error=error, ms=ms)


def install():
    """감싼 함수로 바꿔 끼운다 (한 번만)"""
    if practice.check_generated is check_generated:
        return
    practice.check_generated = check_generated
    practice.ai_check_code = ai_check_code
    practice.ask_ai = ask_ai
    practice.ai_allowed = ai_allowed
    common.log_usage = log_usage


# ───────────────────────── 문항 하나 만들기 ─────────────────────────


def make_one(item):
    """item: {"no", "language", "level", "topic"} → 단계별 기록"""
    install()
    _local.rec = r = {**item, "attempts": [], "ai_calls": [], "ai_errors": [], "tokens_in": 0, "tokens_out": 0}
    user = {"userId": "experiment", "recentTopics": [], "member": False}
    req = {"ip": "experiment", "headers": {}, "user": user}
    started = time.time()
    try:
        made = practice.make_code(req, item["level"], item["topic"], user, prompt_extra="", language=item["language"])
        r.update(origin=made["origin"], note=made.get("note"), title=made["title"], code=made["code"],
                 marks=[{k: m.get(k) for k in ("id", "start", "end", "concept", "explanation", "keywords")} for m in made["marks"]])
    except Exception as e:   # 예상하지 못한 오류도 기록하고 돌려준다 (실험이 멈추지 않게)
        r.update(origin="error", note=repr(e), title="", code="", marks=[])
    finally:
        r["seconds"] = round(time.time() - started, 2)
        r.pop("_check_unavailable", None)
        _local.rec = None
    r.update(model=common.MODEL_ID, aiMode=common.AI_MODE)
    return r


def run(req):
    # 1. 요청 값 확인
    body = req["body"]
    item = {"no": field(body, "no", "int", default=0, low=0, high=9999),
            "language": field(body, "language", "str", required=True, choices=list(LANGUAGES)),
            "level": field(body, "level", "int", required=True, low=1, high=4),
            "topic": field(body, "topic", "str", required=True, max_len=50).strip()}
    item["rep"] = field(body, "rep", "int", default=0, low=0, high=999)

    # 2. 연습 모드와 같은 흐름으로 만들고 단계 기록을 돌려준다 (저장하지 않음)
    return make_one(item)


ROUTES = {"POST /admin/experiment": run}
