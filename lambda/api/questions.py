import random
import re

from common import (POLICY, ApiError, WEAK, ai_enabled, auto_generation_enabled, choice_order, concept,
                    concept_stats, coverage, curriculum, demand_count, field, generatable_levels, get_learner, get_question,
                    invoke_async, list_attempts, load_content, misconception_counts, now_ms, recommend_code_concept,
                    record_demand, running_job, track_of, unread_lessons, units_of, update_item, wrong_questions, is_weak)

# ─────────────────────────────────────────────────────────────
# 문제 내기 (questions.py) — jojo_api 의 기능 파일
#   저장된 문제 중에서 학습자에게 낼 문제를 고른다 (AI 호출 없음). 정답·해설은 보내지 않는다.
#
#   POST /session   문제 세트 시작   {"level": 2, "track": "code"|"theory", "concept": "map"|"all", "unit": 11, "cert": "정보처리기사",
#                                     "mode": "learn"|"review", "exclude": [...], "ids": [...], "size": 10}
#   POST /hint      힌트 한 단계     {"questionId": "...", "level": 1}
#   GET  /concepts  탐색 화면: 코드·문제 목록 (문제 글만)
#
#   문제가 부족한 칸이면 응답을 기다리게 하지 않고 generate-code Lambda(Node.js)를 불러 새 문제를 만든다 (생성 기준: common.POLICY)
# ─────────────────────────────────────────────────────────────

THEORY_SIZE = 10    # 개념 학습 한 세트의 문제 수
CODE_LESSONS = 2    # 코드 학습 한 세트의 코드 수 (코드마다 단계 문제를 모두 푼다)
REVIEW_SIZE = 8     # 복습 한 세트의 문제 수


# ───────────────────────── 경로별 처리 ─────────────────────────


def start_session(req):
    # 1. 요청 값 확인
    body = req["body"]
    opts = {
        "level": field(body, "level", "int", required=True, low=1, high=5),
        "track": field(body, "track", "str", default="code", choices=["theory", "code"]),
        "concept": field(body, "concept", "str", max_len=50),
        "unit": field(body, "unit", "int", low=1, high=99),
        "cert": field(body, "cert", "str", max_len=40),
        "size": field(body, "size", "int", low=1, high=20),
        "exclude": field(body, "exclude", "list", default=[], max_len=50),
        "mode": field(body, "mode", "str", default="learn", choices=["learn", "review"]),
        "ids": field(body, "ids", "list", default=[], max_len=20),
    }
    if opts["concept"] and opts["concept"] != "all" and not concept(opts["concept"]):
        raise ApiError(400, "요청 값을 확인해 주세요.")

    # 2. 학습자 확인. 새 문제를 시작하면 고른 난이도를 기억한다
    learner = get_learner(req)
    if not opts["exclude"] and opts["mode"] == "learn":
        update_item("LEARNER", learner["id"], set_values={"preferredLevel": opts["level"]})

    # 3. 학습 기록 + 문제 데이터로 문제 고르기
    attempts = list_attempts(learner["id"])
    content = load_content()
    plan = plan_session(content, attempts, opts)

    # 4. 새 문제를 만들지 판단 (코드 학습에서 개념 하나를 골라 새 문제를 풀 때만)
    if opts["mode"] != "learn" or opts["ids"] or opts["concept"] == "all" or plan["track"] != "code":
        return {**plan, "generating": False}
    focus = plan["focusConcept"]
    level = opts["level"]
    stock = coverage().get(f"{focus}:{level}", 0)
    demand = demand_count(focus, level, now_ms() - POLICY["demandWindowDays"] * 86400_000)
    exhausted = plan["unsolvedAtLevel"] < POLICY["learnerLow"]
    decision = decide_on_session(focus, level, stock, plan["unsolvedAtLevel"], demand + (1 if exhausted else 0))
    if not decision["generate"] and decision.get("recordDemand"):
        record_demand(focus, level, learner["id"])

    # 5. 만들기로 했으면 generate-code Lambda 를 부른다 (기다리지 않음). 같은 칸을 이미 만드는 중이면 부르지 않는다
    generating = running_job(focus, level) is not None
    if decision["generate"] and ai_enabled() and not generating and auto_generation_enabled():
        mistakes = misconception_counts([a for a in attempts if focus in a["concepts"]])[:3]
        generating = invoke_async("generate-code", {"concept": focus, "level": level, "trigger": decision["trigger"],
                                                    "reason": decision["reason"], "sessionId": learner["id"],
                                                    "focus": [m["text"] for m in mistakes]})
    return {**plan, "generating": generating, "generation": {"stock": stock, "demand": demand, "decision": decision}}


def hint(req):
    question_id = field(req["body"], "questionId", "str", required=True, max_len=120)
    level = field(req["body"], "level", "int", required=True, low=1, high=4)
    # 1. 문제 찾기
    q, _ = get_question(question_id)
    if not q:
        raise ApiError(404, "문제를 찾을 수 없어요.")
    # 2. 미리 저장된 힌트 중 요청한 단계 하나만 (AI 호출 없음)
    hints = [h for h in q.get("hints", []) if h.strip()]
    if level > len(hints):
        raise ApiError(400, "더 볼 힌트가 없어요.")
    return {"hint": hints[level - 1]}


def concepts_view(req):
    # 1. 학습자 + 기록
    learner = get_learner(req)
    attempts = list_attempts(learner["id"])
    content = load_content()
    solved = {}
    for a in attempts:
        solved[a["questionId"]] = solved.get(a["questionId"], False) or a["correct"]
    stats = concept_stats(attempts)
    # 2. 코드·문제 목록 (문제 글만, 정답 없음)
    return {
        "initialLevel": learner["preferredLevel"],
        "mastery": {cid: {"mastery": s["mastery"], "weak": is_weak(s)} for cid, s in stats.items()},
        "items": [{
            "id": item["id"], "track": item["track"], "title": item["title"], "concepts": item["concepts"], "level": item["level"],
            "source": item.get("source"), "lines": item.get("factors", {}).get("lines", 0),
            "questions": [{"id": q["id"], "type": q["type"], "stage": q.get("stage"), "prompt": q["prompt"], "solved": solved.get(q["id"])}
                          for q in content["byItem"].get(item["id"], [])],
        } for item in content["items"].values()],
    }


ROUTES = {
    "POST /session": start_session,
    "POST /hint": hint,
    "GET /concepts": concepts_view,
}

# ───────────────────────── 문제 고르기 (일반 알고리즘) ─────────────────────────


def plan_session(content, attempts, opts):
    """
    - learn · 개념 갈래: 고른 주제(또는 분야·전체)·자격증에서 아직 안 푼 객관식을 가까운 난이도부터 10문제
    - learn · 코드 갈래: 고른 개념(또는 추천 개념)의 아직 안 읽은 코드 2개를, 코드마다 읽기 단계 순서로
    - review: 틀린 문제 먼저, 그다음 다질 개념의 문제
    - ids   : 특정 문제 다시 풀기 (오답 노트)
    """
    level, mode = opts["level"], opts["mode"]
    items, by_item, questions = content["items"], content["byItem"], content["questions"]
    chosen = opts["concept"] if opts["concept"] and opts["concept"] != "all" else None
    track = opts.get("track") or (track_of(chosen) if chosen else "code")
    stats = concept_stats(attempts)
    seen = {a["questionId"] for a in attempts}
    excluded = set(opts["exclude"])
    cert_subjects = None   # 자격증을 골랐으면 그 자격증 과목 id 들
    if opts["cert"]:
        cert_subjects = {c["id"] for c in curriculum()["certSubjects"] if c["cert"] == opts["cert"]} or {opts["cert"]}
    first_concept = (units_of(track)[0]["conceptIds"][0] if units_of(track) else curriculum()["concepts"][0]["id"])

    def question_ok(q):
        return q["id"] not in excluded and (not cert_subjects or any(c in cert_subjects for c in q.get("certs", [])))

    def questions_of(keep):
        return [(q, item) for item in items.values() if item["track"] == track and keep(item)
                for q in by_item.get(item["id"], []) if question_ok(q)]

    def plan(focus, reason, picked, unsolved=0, plan_track=None):
        return {"mode": mode, "track": plan_track or track, "focusConcept": focus, "level": level,
                "reason": reason if picked else "empty", "questions": [to_public(q, item) for q, item in picked],
                "unsolvedAtLevel": unsolved}

    def unsolved_at_level(focus):
        return sum(1 for q, _ in questions_of(lambda i: focus in i["concepts"] and i["level"] == level) if q["id"] not in seen)

    # ── 특정 문제 다시 풀기
    if opts["ids"]:
        picked = [(questions[i], items[questions[i]["codeItemId"]]) for i in opts["ids"]
                  if i in questions and questions[i]["codeItemId"] in items]
        return plan(picked[0][1]["concepts"][0] if picked else first_concept, "picked", picked,
                    plan_track=picked[0][1]["track"] if picked else track)

    # ── 복습: 틀린 문제 → 다질 개념의 문제 (이 갈래에서)
    if mode == "review":
        size = opts["size"] or REVIEW_SIZE
        wrong = []
        for w in wrong_questions(attempts):
            q = questions.get(w["questionId"])
            item = items.get(q["codeItemId"]) if q else None
            if q and item and item["track"] == track and question_ok(q):
                wrong.append((q, item))
        weak = [s["conceptId"] for s in sorted(stats.values(), key=lambda s: s["mastery"])
                if s["attempts"] >= 2 and s["mastery"] < WEAK and track_of(s["conceptId"]) == track]
        wrong_ids = {q["id"] for q, _ in wrong}
        weak_qs = []
        for c in weak:
            pool = [p for p in questions_of(lambda i: c in i["concepts"]) if p[0]["id"] not in wrong_ids]
            # 가까운 난이도 → 본 적 있는 문제 먼저 (다시 확인)
            weak_qs += sorted(pool, key=lambda p: (abs(p[1]["level"] - level), p[0]["id"] not in seen))
        picked = (wrong[:size] + weak_qs)[:size]
        focus = wrong[0][1]["concepts"][0] if wrong else (weak[0] if weak else first_concept)
        return plan(focus, "wrong" if wrong else "weak", picked)

    def in_scope(item):
        if chosen:
            return chosen in item["concepts"]
        if opts["unit"]:
            unit_concepts = next((u["conceptIds"] for u in units_of(track) if u["id"] == opts["unit"]), [])
            return any(c in unit_concepts for c in item["concepts"])
        return True

    # ── 개념 학습: 범위 안의 안 푼 문제를 가까운 난이도부터 (같은 난이도 안에서는 섞어서)
    if track == "theory":
        size = opts["size"] or THEORY_SIZE
        fresh = [p for p in questions_of(in_scope) if p[0]["id"] not in seen]
        random.shuffle(fresh)
        fresh.sort(key=lambda p: abs(p[1]["level"] - level))
        picked = fresh[:size]
        focus = chosen or (picked[0][1]["concepts"][0] if picked else first_concept)
        return plan(focus, "chosen" if chosen else "all", picked, unsolved_at_level(focus))

    # ── 코드 학습: 아직 다 읽지 않은 코드를 골라, 코드마다 단계 순서로
    if opts["concept"] == "all":
        lessons = unread_lessons(content, seen, level, 1, question_ok=question_ok)
        random.shuffle(lessons)
        lessons.sort(key=lambda i: abs(i["level"] - level))
        focus = lessons[0]["concepts"][0] if lessons else first_concept
        reason = "all"
    elif chosen:
        focus, reason = chosen, "chosen"
        lessons = unread_lessons(content, seen, level, 4, lambda i: chosen in i["concepts"], question_ok)
    else:
        focus, reason = recommend_code_concept(content, attempts, stats, level, question_ok)
        lessons = unread_lessons(content, seen, level, 4, lambda i: focus in i["concepts"], question_ok)
        # 이 개념의 새 코드가 모자라면 다른 개념의 새 코드를 이어 붙인다
        if len(lessons) < CODE_LESSONS:
            lessons += unread_lessons(content, seen, level, 1, lambda i: focus not in i["concepts"], question_ok)
    count = max(1, -(-opts["size"] // 4)) if opts["size"] else CODE_LESSONS
    stage_order = curriculum()["stages"]
    picked = [(q, item) for item in lessons[:count]
              for q in sorted([q for q in by_item.get(item["id"], []) if question_ok(q)],
                              key=lambda q: stage_order.get(q.get("stage") or "wrapup", {}).get("order", 9))]
    return plan(focus, reason, picked, unsolved_at_level(focus))


def decide_on_session(concept_id, level, stock, unsolved, demand):
    """이 칸(개념 × 난이도)에 새 문제를 만들지: 재고가 최소보다 적거나, 여러 학습자가 다 풀었을 때만"""
    if level not in generatable_levels(concept_id):
        return {"generate": False, "reason": "이 칸은 AI 생성 대상이 아님 (사람 작성 또는 난이도 범위 밖)"}
    if stock < POLICY["minStock"]:
        return {"generate": True, "trigger": "stock_floor", "reason": f"공개 문제 {stock}개 < 최소 {POLICY['minStock']}개"}
    if unsolved >= POLICY["learnerLow"]:
        return {"generate": False, "reason": "안 푼 문제가 충분함"}
    # 여기부터는 이 학습자가 칸을 다 푼 상태 → 수요로 기록한다
    if stock >= POLICY["maxStock"]:
        return {"generate": False, "reason": f"최대 {POLICY['maxStock']}개 도달 → 틀린·오래된 문제를 다시 출제", "recordDemand": True}
    if demand >= POLICY["demandLearners"]:
        return {"generate": True, "trigger": "demand", "reason": f"최근 {POLICY['demandWindowDays']}일 동안 {demand}명이 소진"}
    return {"generate": False, "reason": f"소진한 학습자 {demand}명 < {POLICY['demandLearners']}명 → 기존 문제 재출제", "recordDemand": True}


# ───────────────────────── 화면으로 보낼 문제 (정답 빼기) ─────────────────────────


def to_public(q, item):
    """정답·해설·채점 기준을 뺀 문제. 객관식 보기는 섞인 순서로 (답은 이 순서의 번호로 제출)"""
    out = {
        "id": q["id"], "codeItemId": item["id"], "codeTitle": item["title"], "track": item["track"], "type": q["type"],
        "skill": q["skill"], "prompt": q["prompt"], "concepts": item["concepts"], "level": item["level"],
        "focusLines": q.get("focusLines") or [], "hintCount": len([h for h in q.get("hints", []) if h.strip()]),
        "code": item["code"],
    }
    if q.get("stage"):
        out["stage"] = q["stage"]
    if q.get("certs"):
        out["certs"] = q["certs"]
    if q["type"] in ("multiple_choice", "fill_blank"):
        out["choices"] = [q["choices"][i]["text"] for i in choice_order(q)]
    if q["type"] == "fill_blank":
        out["code"] = blanked_display(item["code"], q["blankedCode"], q["choices"][q["answerIndex"]]["text"])
    if q["type"] == "trace":
        out["focusLines"] = list(dict.fromkeys(w["line"] for w in q["watch"]))
        out["trace"] = [{"line": r["line"], "when": r["when"], "context": r["context"], "expr": r["expr"]} for r in q["rows"]]
    return out


def blanked_display(code, blanked, answer):
    """원본 코드에서 정답 부분을 빈칸 버전으로 바꿔 끼운 화면용 코드 (못 찾으면 빈칸 코드만)"""
    pos = locate(code, blanked.replace("____", answer, 1))
    return code[:pos[0]] + blanked + code[pos[1]:] if pos else blanked


def locate(code, fragment):
    """공백 차이를 무시하고 code 안에서 fragment 의 [시작, 끝) 위치"""
    target = re.sub(r"\s+", "", fragment)
    if not target:
        return None
    for start in range(len(code)):
        if code[start].isspace():
            continue
        i, j = start, 0
        while i < len(code) and j < len(target):
            if code[i].isspace():
                i += 1
                continue
            if code[i] != target[j]:
                break
            i += 1
            j += 1
        if j == len(target):
            return (start, i)
    return None
