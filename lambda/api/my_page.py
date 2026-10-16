import math

from common import (AI_MODE, ANALYSIS_EVERY, MASTERED, SESSION_HOURS, ApiError, alive, batch_delete, concept_stats, curriculum, day_key,
                    field, get_learner, get_question, learner_level, learner_records, load_content,
                    misconception_counts, now_ms, query_all, recommend_code_concept, suggest_level,
                    track_of, unit, units_of, update_item, weak_concepts, wrong_questions, xp_for_attempt)

# ─────────────────────────────────────────────────────────────
# 내 학습 정보 (my_page.py) — jojo_api 의 기능 파일
#   화면마다 필요한 데이터를 한 번에 돌려준다 (정답·해설은 넣지 않음)
#
#   GET  /health     연결 확인
#   GET  /me         헤더: 이름·XP·레벨·연속 학습
#   POST /me         난이도·이름 바꾸기, 기록 초기화   {"preferredLevel": 2} / {"nickname": "..."} / {"reset": true}
#   GET  /learn      학습 탭: 추천 개념·난이도, 오늘 푼 수, 최근 AI 분석
#   GET  /review     복습 탭: 오답 노트, 다질 개념, 자주 하는 착각
#   GET  /dashboard  내 학습: 통계·캘린더·배지·최근 풀이
#   GET  /ranking    랭킹 (지금 참여 중인 학습자)
#
#   학습자는 x-session-id 헤더로 구분한다 (없으면 새로 만들어서 응답 헤더로 알려 줌)
# ─────────────────────────────────────────────────────────────


# ───────────────────────── 경로별 처리 ─────────────────────────


def health(req):
    return {"ok": True, "db": "dynamodb", "ai": AI_MODE}


def me(req):
    # 1. 학습자 확인 (없으면 새로 만듦)
    learner = get_learner(req)
    # 2. 기록을 한 번에 읽어 XP·연속 학습 계산
    p = load_progress(learner_records(learner["id"]))
    return {
        "nickname": learner["nickname"],
        "preferredLevel": learner["preferredLevel"],
        "dailyGoal": learner["dailyGoal"],
        "xp": p["xp"],
        "level": p["level"]["level"],
        "streak": p["streak"],
        "solvedToday": p["solvedToday"],
        "totalSolved": p["totalSolved"],
        "aiMode": AI_MODE,
    }


def update_me(req):
    body = req["body"]
    level = field(body, "preferredLevel", "int", low=1, high=5)
    nickname = field(body, "nickname", "str", max_len=40)
    reset = field(body, "reset", "bool", default=False)
    if nickname is not None:
        nickname = nickname.strip()
        if not 1 <= len(nickname) <= 12:
            raise ApiError(400, "이름은 1~12자로 정해 주세요.")
    # 1. 학습자 확인
    learner = get_learner(req)
    # 2. 기록 초기화: 이 학습자의 기록(S#<id>)을 모두 지우고 총계를 0 으로
    if reset:
        batch_delete(query_all(f"S#{learner['id']}"))
        update_item("LEARNER", learner["id"], set_values={"preferredLevel": None, "xp": 0, "solved": 0})
    # 3. 난이도·이름 저장
    if level is not None:
        update_item("LEARNER", learner["id"], set_values={"preferredLevel": level})
    if nickname:
        update_item("LEARNER", learner["id"], set_values={"nickname": nickname})
    return {"ok": True}


def learn(req):
    # 1. 학습자 + 기록 읽기
    learner = get_learner(req)
    records = learner_records(learner["id"])   # 풀이·하루 요약·개념 요약·분석을 조회 한 번으로
    attempts, analysis = records["attempts"], records["analysis"]
    progress = load_progress(records)
    level = learner["preferredLevel"] or 1
    # 2. 추천 난이도 (최근 정답률) · 추천 개념 (안 익힌 개념 중 새 코드가 있는 것)
    suggestion = suggest_level(attempts, level)
    recommended, _ = recommend_code_concept(load_content(), attempts, concept_stats(attempts), level)
    u = unit(current_unit_id(progress["stats"]))
    return {
        "attemptCount": len(attempts),
        "level": level,
        "suggestion": suggestion,
        "suggestedLevel": (analysis or {}).get("result", {}).get("recommendedLevel") or (suggestion["level"] if suggestion["direction"] != "stay" else None),
        "recommendedConcept": recommended,
        "lastTrack": track_of(attempts[-1]["concepts"][0]) if attempts and attempts[-1]["concepts"] else "code",
        "unit": {"emoji": u["emoji"], "title": u["title"]},
        "solvedToday": progress["solvedToday"],
        "dailyGoal": learner["dailyGoal"],
        "streak": progress["streak"],
        "overall": overall_progress(progress["stats"]),
        "wrongCount": len(wrong_questions(attempts)),
        "weakCount": len(weak_concepts(progress["stats"])),
        "analysis": analysis,
        "analysisEvery": ANALYSIS_EVERY,
        "sinceLastAnalysis": len(attempts) - (analysis or {}).get("attemptCount", 0),
    }


def review(req):
    # 1. 학습자 + 기록 읽기
    learner = get_learner(req)
    records = learner_records(learner["id"])
    attempts = records["attempts"]
    progress = load_progress(records)
    # 2. 마지막 풀이가 오답인 문제 (문제 글은 문제 데이터에서)
    wrong = []
    for w in wrong_questions(attempts):
        q, item = get_question(w["questionId"])
        if not q:
            continue
        wrong.append({**w, "prompt": q["prompt"], "type": q["type"], "stage": q.get("stage"), "track": item["track"],
                      "concept": item["concepts"][0], "level": item["level"]})
    return {
        "level": learner["preferredLevel"] or 1,
        "wrong": wrong,
        "weak": weak_concepts(progress["stats"]),
        "misconceptions": misconception_counts(attempts)[:5],
    }


def ranking(req):
    # 1. 학습자 확인
    learner = get_learner(req)
    # 2. 지금 참여 중이고 1문제 이상 푼 학습자 (XP 높은 순, 같으면 먼저 시작한 순)
    ranked = sorted([l for l in query_all("LEARNER") if alive(l) and l.get("solved", 0) > 0],
                    key=lambda l: (-l.get("xp", 0), l.get("createdAt", 0)))
    # 3. 등수 매기기 (같은 XP 는 같은 등수)
    top, rank, prev = [], 0, None
    for i, l in enumerate(ranked):
        if l.get("xp", 0) != prev:
            rank = i + 1
        prev = l.get("xp", 0)
        if i < 10:
            top.append({"nickname": l["nickname"], "xp": l.get("xp", 0), "solved": l.get("solved", 0), "rank": rank,
                        "isMe": l["sk"] == learner["id"], "level": learner_level(l.get("xp", 0))["level"]})
    mine = None
    me_item = next((l for l in ranked if l["sk"] == learner["id"]), None)
    if me_item:
        xp = me_item.get("xp", 0)
        above = [l.get("xp", 0) for l in ranked if l.get("xp", 0) > xp]
        my_rank = len(above) + 1
        mine = {"rank": my_rank, "xp": xp, "nextXp": min(above) if above else None, "level": learner_level(xp)["level"],
                "topPercent": top_percent(my_rank, len(ranked))}
    return {"nickname": learner["nickname"], "top": top, "total": len(ranked), "mine": mine, "ttlHours": SESSION_HOURS}


def dashboard(req):
    # 1. 학습자 + 기록 읽기
    learner = get_learner(req)
    records = learner_records(learner["id"])
    attempts, analysis = records["attempts"], records["analysis"]
    if not attempts:
        return {"empty": True}
    progress = load_progress(records)
    stats = progress["stats"]
    u = unit(current_unit_id(stats))
    # 2. 최근 풀이 10개 (문제 글 포함)
    recent = []
    for a in list(reversed(attempts))[:10]:
        q, _ = get_question(a["questionId"])
        recent.append({"id": a["id"], "correct": a["correct"], "partial": a["partial"], "concept": a["concepts"][0] if a["concepts"] else "",
                       "prompt": q["prompt"] if q else "", "type": a["questionType"], "timeMs": a["timeMs"], "gradedBy": a["gradedBy"],
                       "xp": xp_for_attempt(a), "createdAt": a["createdAt"]})
    # 3. 통계 묶기
    solved = max(progress["totalSolved"], 1)
    return {
        "empty": False,
        "unit": {"emoji": u["emoji"], "title": u["title"]},
        "preferredLevel": learner["preferredLevel"],
        "xp": progress["xp"],
        "level": progress["level"],
        "streak": progress["streak"],
        "totalSolved": progress["totalSolved"],
        "accuracy": round(progress["totalCorrect"] / solved * 100),
        "avgTimeMs": progress["totalTimeMs"] / solved,
        "hints": sum(min(a["hintsUsed"], 4) for a in attempts),
        "overall": overall_progress(stats),
        "started": [stats[c["id"]] for c in curriculum()["concepts"] if stats[c["id"]]["attempts"] > 0],
        "days": progress["days"],
        "types": sorted(type_stats(attempts), key=lambda t: -t["attempts"]),
        "repeated": sorted([s for s in stats.values() if s["recentWrong"] >= 2], key=lambda s: -s["recentWrong"])[:4],
        "misconceptions": misconception_counts(attempts)[:4],
        "badges": badges(attempts),
        "analysis": analysis,
        "analysisEvery": ANALYSIS_EVERY,
        "sinceLastAnalysis": len(attempts) - (analysis or {}).get("attemptCount", 0),
        "attemptCount": len(attempts),
        "aiGraded": sum(1 for a in attempts if a["gradedBy"] == "ai"),
        "recent": recent,
    }


ROUTES = {
    "GET /health": health,
    "GET /me": me,
    "POST /me": update_me,
    "GET /learn": learn,
    "GET /review": review,
    "GET /dashboard": dashboard,
    "GET /ranking": ranking,
}

# ───────────────────────── 도움 함수 ─────────────────────────


def load_progress(records):
    """하루 요약(D#)·개념 요약(C#)으로 XP·연속 학습·개념별 이해도를 만든다 (풀이를 처음부터 다시 계산하지 않음)"""
    days = [{"day": r["day"], "solved": r.get("solved", 0), "correct": r.get("correct", 0), "timeMs": r.get("timeMs", 0), "xp": r.get("xp", 0)}
            for r in records["days"]]
    by = {r["concept"]: r for r in records["concepts"]}
    stats = {}
    for c in curriculum()["concepts"]:
        r = by.get(c["id"], {})
        n = r.get("attempts", 0)
        quality = r.get("recentQuality") or []
        q = sum(quality) / len(quality) if quality else 0
        stats[c["id"]] = {"conceptId": c["id"], "attempts": n, "correct": r.get("correct", 0),
                          "accuracy": round(r.get("correct", 0) / n * 100) if n else 0,
                          "mastery": round(q * min(n / 3, 1) * 100),
                          "avgTimeMs": round(r.get("timeMs", 0) / n) if n else 0,
                          "recentWrong": sum(1 for ok in (r.get("recentResults") or []) if not ok)}
    xp = sum(d["xp"] for d in days)
    today = day_key(now_ms())
    return {
        "stats": stats,
        "days": days,
        "xp": xp,
        "level": learner_level(xp),
        "streak": streak([d["day"] for d in days]),
        "solvedToday": next((d["solved"] for d in days if d["day"] == today), 0),
        "totalSolved": sum(d["solved"] for d in days),
        "totalCorrect": sum(d["correct"] for d in days),
        "totalTimeMs": sum(d["timeMs"] for d in days),
    }


def streak(day_list, now=None):
    """오늘(또는 어제)부터 거꾸로 이어서 공부한 날 수"""
    days = set(day_list)
    cursor = now or now_ms()
    if day_key(cursor) not in days:
        cursor -= 86400_000
    n = 0
    while day_key(cursor) in days:
        n += 1
        cursor -= 86400_000
    return n


def overall_progress(stats):
    values = list(stats.values())
    return round(sum(s["mastery"] for s in values) / len(values)) if values else 0


def current_unit_id(stats, track="code"):
    """지금 공부 중인 단원: 아직 모든 개념을 익히지 못한 첫 단원"""
    units = units_of(track)
    for u in units:
        if any(stats.get(c, {}).get("mastery", 0) < MASTERED for c in u["conceptIds"]):
            return u["id"]
    return units[-1]["id"]


def type_stats(attempts):
    by = {}
    for a in attempts:
        by.setdefault(a["questionType"], []).append(a)
    return [{"type": t, "attempts": len(lst), "accuracy": round(sum(1 for a in lst if a["correct"]) / len(lst) * 100),
             "avgTimeMs": round(sum(a["timeMs"] for a in lst) / len(lst))} for t, lst in by.items()]


def top_percent(rank, total):
    if total <= 0:
        return 100
    pct = rank / total * 100
    return max(0.1, round(pct * 10) / 10) if pct < 1 else math.ceil(pct)


def badges(attempts):
    stats = concept_stats(attempts)

    def mastered(ids):
        return all(stats.get(c, {}).get("mastery", 0) >= MASTERED for c in ids)

    days = streak([day_key(a["createdAt"]) for a in attempts])
    return [
        {"id": "first", "emoji": "🌱", "title": "첫 걸음", "description": "첫 문제 풀기", "earned": len(attempts) > 0},
        {"id": "ten", "emoji": "🔟", "title": "꾸준함의 시작", "description": "문제 10개 풀기", "earned": len(attempts) >= 10},
        {"id": "streak3", "emoji": "🔥", "title": "3일 연속", "description": "3일 연속 학습", "earned": days >= 3},
        {"id": "nohint", "emoji": "🧠", "title": "스스로 해결", "description": "힌트 없이 5문제 맞히기",
         "earned": sum(1 for a in attempts if a["correct"] and a["hintsUsed"] == 0) >= 5},
        {"id": "explain", "emoji": "🗣️", "title": "설명왕", "description": "주관식 문제 통과",
         "earned": any(a["questionType"] == "short_answer" and a["correct"] for a in attempts)},
        {"id": "level3", "emoji": "🌳", "title": "초급 돌파", "description": "초급(Lv.3) 문제 5개 맞히기",
         "earned": sum(1 for a in attempts if a["level"] >= 3 and a["correct"]) >= 5},
        {"id": "arrays", "emoji": "🛠️", "title": "배열 장인", "description": "map·filter 익히기", "earned": mastered(["map", "filter"])},
        {"id": "network", "emoji": "🌐", "title": "네트워크 입문", "description": "OSI 7계층·TCP/UDP 익히기", "earned": mastered(["net-osi", "net-tcp-udp"])},
        {"id": "security", "emoji": "🔐", "title": "보안 기본기", "description": "보안 분야 주제 2개 익히기",
         "earned": sum(1 for c in ["sec-crypto", "sec-web", "sec-auth", "sec-threats"] if stats.get(c, {}).get("mastery", 0) >= MASTERED) >= 2},
    ]
