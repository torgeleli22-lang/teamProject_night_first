"""
검토 경험으로 배우기 (docs/GENERATION_STANDARD.md 8.1 · 개발 계획 docs/REVIEW_LEARNING_PLAN.md) — AI 없음

  code_features(code, language)          코드 특징 (줄·함수·반복·중첩 반복·분기·정렬·등호 비교·나눗셈) — 사례·생성 기록에 함께 저장
  record_cases(language, level, topic, log, experiment)
                                          버린 시도(동작 문제 · 두 검토 불일치)를 CASE#<언어>#<난이도> 에 label=pending 으로 (180일)
  review_experiences(code, language, level)
                                          EXPERIENCE#<언어> 의 검증된 경험 중 비슷한 것 최대 3개 → 검토 1·2 에 덧붙일 글

정답(label)은 실행 전용 Lambda(계획)가 사례를 실제로 실행해 붙인다. 이 파일은 코드를 실행하지 않는다.
경험은 참고일 뿐 — 두 검토의 출력이 같아야 제공하는 규칙은 그대로다. 환경 변수 REVIEW_EXPERIENCE=off 면 보여 주지 않는다 (기록은 계속).
"""
import os
import re

from core import TTL_ATTR, case_pk, experience_pk, logger, now_ms, pad, put_item, query_all, time_id, ttl_after
from rules import flow_points

KEEP_DAYS = 180
CASE_OUTCOMES = ("not_runnable", "disagree")   # 실제 실행으로 정답을 붙일 수 있는 것만 사례로 남김
VERIFIED = ("false_alarm", "real_error", "trace_slip")
KIND_NAMES = {"false_alarm": "판정 오류", "real_error": "진짜 오류", "trace_slip": "추적 실수"}
RECENT = 60          # 경험을 고를 때 읽는 최근 경험 수
SHOW = 3             # 검토에 보여 주는 경험 수
SAME_KIND = 2        # 같은 종류는 이만큼까지 (한쪽으로 치우치지 않게)
TEXT_MAX = 300       # 경험 하나의 글자 수 상한
FEATURE_KEYS = ("sort", "eqCompare", "division", "nestedLoop")   # 비슷한 경험을 고를 때 보는 특징


def experience_on():
    return os.environ.get("REVIEW_EXPERIENCE", "on").strip().lower() != "off"


# ───────────────────────── 코드 특징 ─────────────────────────


def code_features(code, language):
    """코드 특징 (AI 없음). 개념(반복·분기)과 모호함(정렬·등호 비교·나눗셈)을 함께 세어 둔다 — 실패 예측 모델의 학습 데이터"""
    text = strip_comments(code or "", language)
    points = flow_points(code or "", language)
    loops = [p for p in points if p["kind"] == "loop"]
    nested = any(a is not b and a["start"] < b["start"] <= b["end"] <= a["end"] for a in loops for b in loops)
    sort = re.search(r"\bsorted\s*\(|\.sort\s*\(", text) is not None
    division = len(re.findall(r"(?<![/*])/(?![/=*])", text))
    return {"lines": len((code or "").split("\n")), "functions": sum(p["kind"] == "function" for p in points), "loops": len(loops),
            "nestedLoop": nested, "branches": len(re.findall(r"\b(?:if|elif|else\s+if)\b", text)), "sort": sort,
            "eqCompare": len(re.findall(r">=|<=|={2,3}", text)), "division": division}


def strip_comments(code, language):
    """주석·문자열을 대충 지움 (특징을 셀 때 '/' 나 'if' 가 글자 안에서 세지지 않게)"""
    code = re.sub(r"(\"\"\"|''')[\s\S]*?\1", "", code)
    code = re.sub(r"(['\"`])(?:\\.|(?!\1).)*\1", "''", code)
    return re.sub(r"#.*" if language == "python" else r"//.*|/\*[\s\S]*?\*/", "", code)


# ───────────────────────── 사례 기록 ─────────────────────────


def record_cases(language, level, topic, log, experiment=False):
    """버린 시도 → CASE#<언어>#<난이도> (label=pending). 실패해도 코드 만들기를 막지 않는다"""
    from history import attempt_outcome   # 순환 import 를 피해 여기서
    try:
        stamp = pad(time_id())
        for i, step in enumerate(log.get("attempts", []), 1):
            outcome, detail = attempt_outcome(step, level)
            if outcome not in CASE_OUTCOMES or not step.get("code"):
                continue
            review, check = step.get("review") or {}, step.get("check") or {}
            put_item({"pk": case_pk(language, level), "sk": f"{stamp}#{i}", "createdAt": now_ms(), "language": language, "level": level,
                      "topic": topic, "outcome": outcome, "detail": str(detail)[:300], "code": step["code"],
                      "problems": [str(p)[:300] for p in review.get("problems") or []][:5],
                      "reviewOutput": check.get("reviewOutput"), "checkOutput": check.get("checkOutput"), "checkModel": check.get("checkModel"),
                      "diff": (check.get("diff") or [])[:5], "features": code_features(step["code"], language),
                      "label": "pending", "experiment": experiment, TTL_ATTR: ttl_after(KEEP_DAYS * 86400)})
    except Exception as e:
        logger.warning("검토 사례 기록 실패", extra={"error": repr(e)})


# ───────────────────────── 경험 보여 주기 ─────────────────────────


def review_experiences(code, language, level):
    """검증된 경험 중 이 코드와 비슷한 것 → (검토에 덧붙일 글, 쓴 경험 sk 목록). 없거나 꺼져 있으면 ("", [])"""
    if not experience_on():
        return "", []
    try:
        rows = query_all(experience_pk(language), descending=True, limit=RECENT)
    except Exception as e:
        logger.warning("검토 경험 읽기 실패", extra={"error": repr(e)})
        return "", []
    rows = [r for r in rows if r.get("kind") in VERIFIED and r.get("lesson")]
    if not rows:
        return "", []
    mine = code_features(code, language)
    def score(r):
        f = r.get("features") or {}
        return (2 if r.get("level") == level else 0) + sum(1 for k in FEATURE_KEYS if bool(f.get(k)) and bool(mine.get(k)))
    picked, kinds = [], {}
    for r in sorted(rows, key=lambda r: (-score(r), r["sk"][::-1])):
        if kinds.get(r["kind"], 0) >= SAME_KIND:
            continue
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        picked.append(r)
        if len(picked) >= SHOW:
            break
    lines = [f"- [{KIND_NAMES[r['kind']]}] " + " → ".join(x for x in (
        f"검토가 쓴 것: {r['claim']}" if r.get("claim") else "", f"실제: {r['truth']}" if r.get("truth") else "",
        f"교훈: {r['lesson']}") if x)[:TEXT_MAX] for r in picked]
    text = ("참고 — 실제 실행으로 확인한 지난 검토 사례예요. 이 코드와 다를 수 있으니, 판단은 이 코드를 직접 따라가서 해:\n" + "\n".join(lines))
    return text, [r["sk"] for r in picked]
