from common import (CONCEPTS, LEVELS, TTL_ATTR, alive, day_key, get_item, get_learner, keep_seconds, now_ms, put_item,
                    query_all, studyrec_sk, ttl_after, user_pk)

# ─────────────────────────────────────────────────────────────
# 내 공부 (study.py) — jojo_api 의 기능 파일. AI 를 쓰지 않는다 (모두 규칙)
#
#   GET /study  → {"levels": 난이도 추천, "concepts": 개념별 약점 지도, "notes": 내 설명 노트, "recent": 최근 공부, "summary": 요약}
#
#   기록: 첨삭을 받을 때(review.py) 읽은 코드 하나마다 USER#<학습자> / STUDYREC#<읽은 코드 id> 한 줄을 쓰고,
#         힌트 보고 다시 써서 나아지면 그 항목을 고친다. 코드 원본은 넣지 않아 작다.
#         보관: 로그인 안 한 학습자는 하루(탭을 닫으면 다시 찾을 수 없음), 로그인 학습자는 1년 — common.keep_seconds
#         (연습 코드는 잘라 낸 몇 줄을 함께 저장해 원본이 지워져도 노트에서 볼 수 있다. 올린 코드는 개인정보라 저장하지 않음)
#
#   난이도 추천: 같은 난이도에서 최근 첨삭 5개의 ○ 비율 — 80% 이상(3개 이상)이면 올려 보기, 40% 미만이면 내려 보기
#   개념별 약점: 개념마다 처음 판정의 ○ 비율 + 다시 써서 ○ 가 된 수. 2번 이상 나온 개념 중 가장 낮은 것이 '집중 연습' 추천
#   내 설명 노트: ○ 를 받은(처음이든 다시 써서든) 내 설명을 개념별로
# ─────────────────────────────────────────────────────────────

RECENT_PER_LEVEL = 5         # 난이도 추천에 보는 최근 첨삭 수
LEVEL_UP, LEVEL_DOWN = 0.8, 0.4
MIN_FOR_LEVEL = 3            # 이만큼은 풀어야 추천
MIN_FOR_WEAK = 2             # 개념이 이만큼은 나와야 약점 판단
SNIPPET_LINES = 12           # 노트에 함께 저장하는 코드 줄 수 (연습 코드만)
MAX_NOTES = 60


def overview(req):
    # 1. 내 기록 전부 (1년 치, 첨삭 하나당 한 줄이라 작다)
    learner = get_learner(req)
    rows = sorted((r for r in query_all(user_pk(learner["id"]), prefix="STUDYREC#") if alive(r)), key=lambda r: -r.get("reviewedAt", 0))

    # 2. 난이도 추천 / 개념별 약점 / 내 설명 노트 (모두 규칙)
    return {
        "summary": summarize(rows),
        "levels": recommend_levels(rows, learner.get("level")),
        "concepts": concept_map(rows),
        "notes": explanation_notes(rows),
        "recent": [{"readingId": r["readingId"], "source": r["source"], "level": r["level"], "title": r["title"],
                    "language": r.get("language") or "python",
                    "counts": r["counts"], "reviewedAt": r["reviewedAt"], "open": reading_alive(r)} for r in rows[:10]],
    }


ROUTES = {"GET /study": overview}

# ───────────────────────── 기록 쓰기 (review.py 가 부름) ─────────────────────────


def record_review(learner, reading, result):
    """첨삭 하나 → 읽은 코드 하나의 기록 (같은 코드를 다시 첨삭 받으면 최신 결과로 바꾸고 횟수를 센다)"""
    try:
        key = {"pk": user_pk(learner["id"]), "sk": studyrec_sk(reading["id"])}
        old = get_item(key["pk"], key["sk"]) or {}
        lines = reading["code"].split("\n")
        items = []
        for e in result["items"]:
            snippet = None
            if reading["source"] == "practice":   # 올린 코드는 저장하지 않음
                snippet = "\n".join(lines[e["start"] - 1:min(e["end"], e["start"] - 1 + SNIPPET_LINES)])
            items.append({"concept": e.get("concept") or "data_update", "first": e["mark"], "best": e["mark"], "marked": e["marked"],
                          "start": e["start"], "end": e["end"], "memo": e["memo"], "bestText": e["memo"], "snippet": snippet})
        put_item({**key, "readingId": reading["id"], "source": reading["source"], "level": int(reading.get("level") or 1),
                  "language": reading.get("language") or "python",
                  "title": reading.get("title") or reading.get("topic", ""), "topic": reading.get("topic", ""),
                  "counts": result["counts"], "items": items, "reviews": int(old.get("reviews", 0)) + 1,
                  "createdAt": old.get("createdAt") or now_ms(), "reviewedAt": now_ms(),
                  "readingTtl": int(reading.get(TTL_ATTR, 0)), TTL_ATTR: ttl_after(keep_seconds(learner, "study"))})
    except Exception as e:   # 기록이 실패해도 첨삭은 그대로 돌려준다
        print("[study]", repr(e))


def record_retry(learner, reading, index, mark, text):
    """다시 써서 더 좋은 판정을 받으면 그 항목의 best·bestText 를 바꾼다"""
    try:
        row = get_item(user_pk(learner["id"]), studyrec_sk(reading["id"]))
        if not row or index >= len(row.get("items", [])):
            return
        item = row["items"][index]
        if RANK[mark] > RANK.get(item["best"], 0):
            item["best"], item["bestText"] = mark, text
            put_item(row)
    except Exception as e:
        print("[study]", repr(e))


# ───────────────────────── 계산 (AI 없음) ─────────────────────────

RANK = {"missing": 0, "wrong": 1, "partial": 2, "correct": 3}


def correct_ratio(items):
    return sum(1 for i in items if i["first"] == "correct") / len(items) if items else 0


def summarize(rows):
    items = [i for r in rows for i in r.get("items", [])]
    days = {day_key(r["reviewedAt"]) for r in rows}
    return {"codes": len(rows), "days": len(days), "items": len(items), "correctRate": round(correct_ratio(items), 2),
            "improved": sum(1 for i in items if i["first"] != "correct" and i["best"] == "correct")}


def recommend_levels(rows, current):
    """난이도마다 최근 첨삭 RECENT_PER_LEVEL 개의 ○ 비율 → 추천 (연습 모드만)"""
    out = []
    for lv in sorted(LEVELS):
        recent = [r for r in rows if r["source"] == "practice" and r["level"] == lv][:RECENT_PER_LEVEL]
        items = [i for r in recent for i in r.get("items", [])]
        rate = correct_ratio(items)
        advice = "none"
        if len(recent) >= MIN_FOR_LEVEL:
            advice = "up" if rate >= LEVEL_UP and lv < max(LEVELS) else "down" if rate < LEVEL_DOWN and lv > 1 else "stay"
        out.append({"level": lv, "name": LEVELS[lv]["name"], "codes": len(recent), "correctRate": round(rate, 2), "advice": advice})
    # 지금 추천할 난이도: 가장 최근에 푼 난이도에서 올리기·내리기·그대로
    last = next((r["level"] for r in rows if r["source"] == "practice"), current or 1)
    here = next(o for o in out if o["level"] == last)
    suggested = last + (1 if here["advice"] == "up" else -1 if here["advice"] == "down" else 0)
    message = {
        "up": f"{LEVELS[last]['name']}에서 최근 {here['codes']}개의 ○ 비율이 {round(here['correctRate'] * 100)}%예요. {LEVELS[suggested]['name']}에 도전해 볼까요?",
        "down": f"{LEVELS[last]['name']}에서 최근 ○ 비율이 {round(here['correctRate'] * 100)}%예요. {LEVELS[suggested]['name']}에서 흐름을 다져 볼까요?",
        "stay": f"{LEVELS[last]['name']}이 지금 딱 맞아요 (최근 ○ 비율 {round(here['correctRate'] * 100)}%). 조금 더 다져 봐요.",
        "none": f"{LEVELS[last]['name']}에서 {MIN_FOR_LEVEL}개 이상 첨삭을 받으면 난이도를 추천해 드려요.",
    }[here["advice"]]
    return {"current": last, "suggested": suggested, "advice": here["advice"], "message": message, "byLevel": out}


def concept_map(rows):
    """개념마다 몇 번 나왔고, 처음에 ○ 를 받은 비율, 다시 써서 ○ 가 된 수. 가장 약한 개념에 집중 연습 추천"""
    out = []
    for key, c in CONCEPTS.items():
        items = [i for r in rows for i in r.get("items", []) if i["concept"] == key]
        out.append({"concept": key, "name": c["name"], "description": c["description"], "count": len(items),
                    "correctRate": round(correct_ratio(items), 2),
                    "improved": sum(1 for i in items if i["first"] != "correct" and i["best"] == "correct"),
                    "missing": sum(1 for i in items if i["first"] == "missing")})
    seen = [o for o in out if o["count"] >= MIN_FOR_WEAK]
    weakest = min(seen, key=lambda o: (o["correctRate"], -o["count"]))["concept"] if seen else None
    return {"items": out, "weakest": weakest}


def explanation_notes(rows):
    """내 설명 노트: ○ 를 받은 내 설명 (다시 써서 받은 것 포함), 최신 순"""
    notes = []
    for r in rows:
        for i in r.get("items", []):
            if i["best"] == "correct" and i.get("bestText"):
                notes.append({"concept": i["concept"], "conceptName": CONCEPTS.get(i["concept"], {}).get("name", ""),
                              "text": i["bestText"], "improved": i["first"] != "correct", "start": i["start"], "end": i["end"],
                              "snippet": i.get("snippet"), "title": r["title"], "level": r["level"], "source": r["source"],
                              "language": r.get("language") or "python",
                              "readingId": r["readingId"], "open": reading_alive(r), "at": r["reviewedAt"]})
    return notes[:MAX_NOTES]


def reading_alive(row):
    """원본 코드가 아직 남아 있어서 '다시 읽기'로 열 수 있는지"""
    ttl = row.get("readingTtl") or 0
    return ttl == 0 or ttl > now_ms() / 1000

