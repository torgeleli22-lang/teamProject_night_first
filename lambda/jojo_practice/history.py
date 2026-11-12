"""
생성 기록으로 배우기 (docs/GENERATION_STANDARD.md 8장) — AI 없음

  record_generation(...)        코드를 하나 만들 때마다 성공·실패를 GENLOG#<언어>#<난이도> 에 한 줄 (180일, 코드 원문 대신 시도마다 코드 특징)
  history_hints(language, level) 같은 언어·난이도의 최근 기록 → 생성 AI 에게 덧붙일 지침 (자주 걸린 이유 · 통과한 코드의 모양)

코드 원문을 지침에 넣지 않아 같은 코드가 반복되지 않게 한다. 환경 변수 HISTORY_HINTS=off 면 지침을 쓰지 않는다 (기록은 계속).
"""
import os
import statistics

from core import LEVELS, TTL_ATTR, genlog_pk, logger, now_ms, pad, put_item, query_all, time_id, ttl_after
from experience import code_features
from rules import flow_points

KEEP_DAYS = 180
RECENT = 40            # 지침을 만들 때 읽는 최근 기록 수
MIN_RECORDS = 5        # 이보다 적으면 지침을 쓰지 않음
MIN_COUNT, MIN_RATIO = 2, 0.15   # 자주 걸린 이유: 2번 이상 · 시도의 15% 이상
INFRA = {"unavailable", "review_error", "check_error"}   # AI 를 못 쓴 것 — 코드의 문제가 아니라 지침에 쓰지 않음

ADVICE = {
    "level_up": "요청한 난이도보다 어렵다고 판정된 경우가 잦았어요: 쓰는 개념의 수와 함수·중첩을 줄여 {level} 기준에 맞춰 주세요",
    "level_down": "요청한 난이도보다 쉽다고 판정된 경우가 잦았어요: {level} 기준의 개념 연계와 데이터 전달을 빠뜨리지 말아 주세요",
    "disagree": "두 AI 가 실행 결과를 서로 다르게 따라간 경우가 잦았어요: 정렬에서 같은 값의 순서, 여러 조건이 겹치는 분기, 복잡한 점수·소수 계산처럼 "
                "따라가다 헷갈리기 쉬운 곳을 줄이고, 결과가 하나로 분명히 정해지게 만들어 주세요",
    "too_big": "따라가기에 너무 큰 코드가 잦았어요: 데이터 개수·반복 횟수·출력 줄을 한도보다 넉넉히 작게 해 주세요",
    "not_runnable": "실제로 동작하지 않는 코드가 잦았어요: 이름은 쓰기 전에 정의하고, 빈 목록에서 꺼내기·0 으로 나누기·범위를 벗어난 인덱스를 피해 주세요",
    "rule": "문법 오류·오타가 잦았어요: 괄호·따옴표·들여쓰기와 이름 철자를 다시 확인해 주세요",
}


def hints_on():
    return os.environ.get("HISTORY_HINTS", "on").strip().lower() != "off"


# ───────────────────────── 기록 ─────────────────────────


def attempt_outcome(step, level):
    """시도 하나의 결과 분류와 짧은 이유 (make_code 의 단계 기록 step)"""
    if step.get("genError"):
        return "unavailable", step["genError"]
    rule = step["ruleAfterFix"] if "ruleAfterFix" in step else step.get("rule")
    if rule:
        return "rule", rule[0]
    review = step.get("review") or {}
    if not review:
        return "unavailable", ""
    if review.get("error"):
        return "review_error", review["error"]
    if review.get("problems") or review.get("runnable") is False:
        return "not_runnable", (review.get("problems") or ["실제로 동작하지 않음"])[0]
    if review.get("size"):
        return "too_big", review["size"][0]
    judged = (review.get("level") or {})
    if judged.get("match") is False:
        return ("level_up" if (judged.get("overall") or level) > level else "level_down"), judged.get("advice", "")
    check = step.get("check")
    if check is None:
        return "unavailable", ""
    if check.get("error"):
        return "check_error", check["error"]
    if not check.get("passed"):
        return "disagree", (check.get("diff") or [""])[0]
    return "ok", ""


def code_shape(made, language):
    """통과한 코드의 모양 (원문 대신 저장)"""
    points = flow_points(made["code"], language)
    counts = [u["count"] for u in made.get("units", []) if isinstance(u.get("count"), int)]
    return {"lines": len(made["code"].split("\n")), "functions": sum(p["kind"] == "function" for p in points),
            "loops": sum(p["kind"] == "loop" for p in points), "outputLines": len([o for o in made.get("output") or [] if str(o).strip()]),
            "maxCount": max(counts, default=0), "judged": (made.get("levelCheck") or {}).get("overall")}


def record_generation(language, level, topic, made, log, calls=0, experiment=False):
    """GENLOG#<언어>#<난이도> / <시각> 에 한 줄. 실패해도 학습을 막지 않는다"""
    try:
        attempts = []
        for s in log.get("attempts", []):
            o, d = attempt_outcome(s, level)
            attempts.append({"outcome": o, "detail": str(d)[:150], **({"features": code_features(s["code"], language)} if s.get("code") else {})})
        item = {"pk": genlog_pk(language, level), "sk": pad(time_id()), "createdAt": now_ms(), "language": language, "level": level,
                "topic": topic, "origin": made["origin"], "title": made.get("title", ""), "attempts": attempts, "calls": calls,
                "hinted": bool(log.get("hints")), "experiment": experiment, TTL_ATTR: ttl_after(KEEP_DAYS * 86400)}
        if made["origin"] == "ai":
            item["shape"] = code_shape(made, language)
        put_item(item)
    except Exception as e:
        logger.warning("생성 기록 실패", extra={"error": repr(e)})


# ───────────────────────── 지침 ─────────────────────────


def history_hints(language, level):
    """최근 기록 → (생성 AI 에게 덧붙일 글, 무엇을 썼는지). 기록이 적거나 꺼져 있으면 ("", {})"""
    if not hints_on():
        return "", {}
    try:
        rows = sorted(query_all(genlog_pk(language, level), descending=True, limit=RECENT), key=lambda r: r["sk"], reverse=True)[:RECENT]
    except Exception as e:
        logger.warning("생성 기록 읽기 실패", extra={"error": repr(e)})
        return "", {}
    if len(rows) < MIN_RECORDS:
        return "", {}
    outcomes = [a["outcome"] for r in rows for a in r.get("attempts", []) if a.get("outcome") not in INFRA]
    if not outcomes:
        return "", {}
    frequent = sorted({o for o in outcomes if o != "ok"}, key=lambda o: -outcomes.count(o))
    frequent = [o for o in frequent if o in ADVICE and outcomes.count(o) >= MIN_COUNT and outcomes.count(o) / len(outcomes) >= MIN_RATIO][:3]
    lines = [f"- {ADVICE[o].format(level=LEVELS[level]['name'])} (최근 시도 {len(outcomes)}번 중 {outcomes.count(o)}번)" for o in frequent]
    shapes = [r["shape"] for r in rows if r.get("origin") == "ai" and r.get("shape")]
    if len(shapes) >= 3:
        med = lambda k: round(statistics.median(s.get(k, 0) for s in shapes))
        lines.append(f"- 최근 통과한 {LEVELS[level]['name']} 코드의 모양 ({len(shapes)}개의 가운데 값): 약 {med('lines')}줄 · 함수 {med('functions')}개 · "
                     f"반복문 {med('loops')}개 · 출력 {med('outputLines')}줄 — 크기와 구조만 참고하고, 주제와 구성은 새롭게 만들어 주세요")
    if not lines:
        return "", {}
    text = f"참고 — 같은 언어·난이도로 최근에 만든 코드 {len(rows)}개의 기록이에요:\n" + "\n".join(lines)
    return text, {"records": len(rows), "frequent": frequent, "shapes": len(shapes)}
