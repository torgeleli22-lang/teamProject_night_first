import re
import uuid

from common import (AI_MODE, POLICY, TTL_ATTR, AiUnavailable, ask_ai, bump_content_version, concept, concepts_of, curriculum,
                    generatable_levels, get_item, get_meta, jobs_since, level_info, load_content, month_cost_usd, now_ms, pad,
                    put_item, running_job, time_id, track_of, ttl_after, unit, update_item)

# ─────────────────────────────────────────────────────────────
# 개념 문제 만들기 Lambda (generate-theory)
#   관리자 화면의 'AI 문제 만들기'(개념 주제)가 admin Lambda 를 거쳐 부른다 (관리자는 기다리지 않음).
#   실행으로 정답을 확인할 수 없는 개념 문제라서 세 겹으로 확인한다.
#     ① AI 가 4지선다 5문제를 만든다
#     ② 규칙 검사 (보기 4개·중복 없음·정답 번호)
#     ③ 다른 AI 호출이 정답을 모르는 채로 풀어 본다 → 고른 답이 다르거나 문제가 있다고 하면 그 문제는 뺀다
#     → 3문제 이상 남으면 '승인 대기(pending)'로 저장 → ④ 관리자가 승인해야 학습자에게 나간다
#
#   받는 값 (이벤트): {"concept": "net-osi", "level": 2, "count": 1, "reason": "...", "instructions": "관리자 요청(선택)"}
#   기록: JOB / <번호> (진행 상황, 관리자 화면의 '생성 작업'),  CONTENT / ai-<개념>-<8자리> (만든 문제)
# ─────────────────────────────────────────────────────────────

QUESTIONS_PER_SET = 5   # 한 번에 만드는 문제 수
MIN_KEPT = 3            # 교차 풀이 뒤 최소한 남아야 하는 수
SKILLS = ["recall", "predict", "analyze", "infer", "synthesize"]

SYSTEM_PROMPT = """당신은 IT 입문자를 위한 자격증 대비 문제를 만드는 출제 위원입니다. 분야는 네트워크·개발·운영 및 유지보수·보안입니다.

출제 규칙:
- 4지선다 객관식. 정답은 정확히 하나이고, 표준 교과서·국가기술자격 출제 기준에 맞는 사실만 씁니다. 버전·연도에 따라 바뀌는 사실, 출처가 불분명한 수치는 피합니다.
- "모두 고르시오", "위의 것 모두", "옳지 않은 것을 모두" 같은 형식과 말장난 문제는 만들지 않습니다. "틀린 것은?" 형식은 세트에 1개까지만.
- 오답 보기는 그럴듯해야 하고, 그 보기를 고르는 사람의 오개념(misconception)을 적습니다 (예: 'TCP 와 UDP 의 특징을 반대로 생각').
- 해설은 왜 정답인지와 헷갈리는 다른 보기가 왜 아닌지를 짧게 설명합니다.
- 힌트는 정답을 직접 말하지 않습니다.
- 한국어 존댓말("~해요"·"~일까요?"), 초보자가 이해할 수 있게 짧게. 영어 용어는 한글 설명과 함께."""

REVIEWER_PROMPT = "당신은 IT 자격증 문제를 검토하는 꼼꼼한 검토자입니다. 각 문제를 직접 풀고, 사실 오류나 정답이 하나로 정해지지 않는 문제를 찾아냅니다."


def set_schema():
    cert_ids = [c["id"] for c in curriculum()["certSubjects"]]
    question = {
        "type": "object",
        "properties": {
            "skill": {"type": "string", "enum": SKILLS},
            "prompt": {"type": "string", "description": "문제 문장. '~은 무엇일까요?' 처럼 한국어 존댓말"},
            "choices": {"type": "array", "description": "보기 정확히 4개. 정답은 하나", "items": {
                "type": "object",
                "properties": {"text": {"type": "string"},
                               "misconception": {"type": ["string", "null"], "description": "이 오답을 고르는 사람의 오개념. 정답 보기는 null"}},
                "required": ["text", "misconception"]}},
            "answerIndex": {"type": "integer", "description": "정답 보기 번호 (0부터)"},
            "certs": {"type": "array", "items": {"type": "string", "enum": cert_ids}, "description": "관련 자격증 과목 id 1~2개 (주어진 목록에서만)"},
            "hints": {"type": "array", "items": {"type": "string"}, "description": "힌트 2개: 생각할 질문 → 핵심 짚기 (정답을 말하지 않음)"},
            "explanation": {"type": "string", "description": "왜 정답이고 다른 보기는 왜 아닌지 2~4문장 (줄바꿈으로 단계 구분)"},
            "keyPoint": {"type": "string", "description": "핵심 한 줄"},
        },
        "required": ["skill", "prompt", "choices", "answerIndex", "certs", "hints", "explanation", "keyPoint"],
    }
    return {"type": "object", "properties": {"questions": {"type": "array", "items": question}}, "required": ["questions"]}


SOLVE_SCHEMA = {
    "type": "object",
    "properties": {"answers": {"type": "array", "items": {
        "type": "object",
        "properties": {"choice": {"type": "integer", "description": "고른 보기 번호 (1부터)"},
                       "issue": {"type": ["string", "null"], "description": "사실이 틀렸거나, 정답이 둘 이상이거나, 정답이 없다면 그 이유. 문제없으면 null"}},
        "required": ["choice", "issue"]}}},
    "required": ["answers"],
}


def lambda_handler(event, context):
    count = int(event.get("count") or 1)
    started_at = now_ms()
    results = []
    # 여러 세트를 요청했으면 차례로 만든다 ('전부 중지'를 누르면 남은 것은 만들지 않음)
    for i in range(count):
        if stop_requested_since(started_at):
            break
        reason = event.get("reason") or "관리자 수동 생성"
        if count > 1:
            reason = reason.replace("관리자 수동 생성", f"관리자 수동 생성 {i + 1}/{count}", 1)
        results.append(generate_set(event["concept"], int(event["level"]), event.get("trigger") or "manual", reason,
                                    event.get("instructions"), started_at))
    return {"results": results}


def generate_set(concept_id, level, trigger, reason, instructions, started_at):
    # 1. 만들어도 되는지 확인하고 작업 기록(JOB) 만들기
    skip = check_can_generate(concept_id, level, trigger)
    if skip:
        return {"jobId": 0, "status": "skipped", "error": skip}
    job_id = create_job(concept_id, level, trigger, reason)

    def cancelled():
        return (get_item("JOB", pad(job_id)) or {}).get("status") == "cancelled" or stop_requested_since(started_at)

    c = concept(concept_id)
    info = level_info(level)
    try:
        # 2. 이미 있는 문제 지문 (겹치지 않게 AI 에게 알려 준다)
        content = load_content()
        existing = [q["prompt"] for item in content["items"].values() if concept_id in item["concepts"]
                    for q in content["byItem"].get(item["id"], [])][:30]
        feedback, notes = "", []
        for round_no in range(2):
            if cancelled():
                return finish_cancelled(job_id)
            # 3. AI 가 문제 만들기
            prompt = "\n\n".join(p for p in [
                f"분야: {(unit(c['unitId']) or {}).get('title', '')} / 주제: {c['name']} — {c['keyIdea']}",
                f"주제 설명: {c['summary']}",
                f"난이도: Level {level} {info['name']} ({info['theoryDescription']}).",
                f"문제 수: {QUESTIONS_PER_SET}개. 문제마다 skill 은 {', '.join(SKILLS)} 중에서 난이도에 맞게.",
                "자격증 과목 id (certs 에는 이 중에서만, 관련 있는 것 1~2개):\n" + "\n".join(f"- {s['id']}: {s['cert']} {s['name']}" for s in curriculum()["certSubjects"]),
                ("이미 있는 문제 (겹치지 않게 다른 내용으로):\n" + "\n".join(f"- {p}" for p in existing)) if existing else "",
                f"관리자가 원하는 내용입니다. 출제 규칙을 지키는 범위에서 반영하세요:\n<admin_request>\n{instructions}\n</admin_request>" if instructions else "",
                feedback,
            ] if p)
            generated = ask_ai("content_generation", SYSTEM_PROMPT, prompt, set_schema(), max_tokens=8000,
                               mock=lambda: mock_theory(concept_id, QUESTIONS_PER_SET), mock_delay=1.2)

            # 4. 다른 AI 호출이 정답을 모르는 채로 풀어 보기 (교차 풀이)
            if cancelled():
                return finish_cancelled(job_id)
            solved = cross_solve(generated["questions"])

            # 5. 규칙 검사 + 교차 풀이가 같은 답을 고른 문제만 남기기
            item_id = f"ai-{concept_id}-{uuid.uuid4().hex[:8]}"
            kept, checks = [], list(notes)
            for n, g in enumerate(generated["questions"]):
                tag = f"[{n + 1}번 문제]"
                texts = [ch["text"].strip() for ch in g["choices"]]
                shape_ok = (len(g["choices"]) == 4 and len(set(texts)) == 4 and 0 <= g["answerIndex"] < 4
                            and not g["choices"][g["answerIndex"]].get("misconception"))
                s = solved[n]
                agree = s["choice"] == g["answerIndex"] and not s["issue"]
                checks.append({"name": f"{tag} 보기 4개·중복 없음·정답 번호", "pass": shape_ok})
                checks.append({"name": f"{tag} AI 교차 풀이 (정답을 모르는 채로 풀어 같은 답)", "pass": agree,
                               "detail": None if agree else (s["issue"] or f"교차 풀이는 {s['choice'] + 1}번, 출제 정답은 {g['answerIndex'] + 1}번")})
                if not shape_ok or not agree:
                    continue
                kept.append({
                    "id": f"{item_id}-q{n + 1}", "codeItemId": item_id, "type": "multiple_choice", "skill": g["skill"], "prompt": g["prompt"],
                    "choices": [{"text": ch["text"], **({"misconception": ch["misconception"]} if ch.get("misconception") else {})} for ch in g["choices"]],
                    "answerIndex": g["answerIndex"], "certs": list(dict.fromkeys(g["certs"]))[:2],
                    "hints": [h for h in g["hints"] if h.strip()][:4], "explanation": g["explanation"], "keyPoint": g["keyPoint"],
                })
            structure = structure_checks(concept_id, kept)
            checks += structure
            enough = len(kept) >= MIN_KEPT and all(ch["pass"] for ch in structure)
            checks.append({"name": f"교차 풀이를 통과한 문제 {MIN_KEPT}개 이상", "pass": len(kept) >= MIN_KEPT,
                           "detail": f"{len(kept)}/{len(generated['questions'])}개 통과"})
            failures = "\n".join(f"- {ch['name']}{' (' + ch['detail'] + ')' if ch.get('detail') else ''}" for ch in checks if not ch["pass"])

            # 6. 통과 못 하면 한 번 더 (빠진 이유를 알려 주고)
            if not enough and round_no == 0:
                notes.append({"name": "1차 생성물이 검수를 통과하지 못해 다시 만듦", "pass": True, "detail": f"{len(kept)}/{len(generated['questions'])}개 통과"})
                feedback = f"이전에 만든 문제 중 다음 문제가 검수에서 빠졌습니다. 같은 실수를 하지 말고 새로 만드세요:\n{failures}"
                continue
            if cancelled():
                return finish_cancelled(job_id)

            # 7. 저장: 통과하면 승인 대기(pending), 아니면 반려(rejected)
            status = "pending" if enough else "rejected"
            report = {"ok": enough, "checks": checks, "actualOutput": None,
                      "factors": {"lines": 0, "syntaxCount": 0, "conceptCount": 1, "logic": 0, "dataFlow": 0, "reasoning": 0}, "estimatedLevel": 1}
            now = now_ms()
            put_item({"pk": "CONTENT", "sk": item_id, "source": "ai", "status": status, "validation": report, "jobId": job_id, "createdAt": now,
                      "questions": kept,
                      "item": {"id": item_id, "track": "theory", "language": None, "title": f"{c['name']} (AI)", "code": "", "concepts": [concept_id],
                               "level": level, "factors": report["factors"], "output": None, "runnable": False, "status": status,
                               "source": "ai", "createdAt": now}})
            bump_content_version()
            finish_job(job_id, status, item_id, None if enough else failures)
            return {"jobId": job_id, "status": status, "itemId": item_id, "report": report}
    except Exception as e:
        if cancelled():
            return finish_cancelled(job_id)
        message = str(e) if isinstance(e, AiUnavailable) else f"{type(e).__name__}: {e}"
        finish_job(job_id, "failed", None, message)
        return {"jobId": job_id, "status": "failed", "error": message}


# ───────────────────────── 도움 함수 ─────────────────────────


def cross_solve(questions):
    """정답을 모르는 채로 풀어 보기. 문제마다 고른 번호(0부터)와 지적 사항"""
    prompt = "아래 문제들을 순서대로 직접 풀어서 정답 보기 번호를 고르세요. 정답이 명확하지 않거나 사실이 틀린 문제는 issue 에 이유를 적으세요.\n\n" + "\n\n".join(
        f"문제 {i + 1}. {q['prompt']}\n" + "\n".join(f"  {k + 1}) {ch['text']}" for k, ch in enumerate(q["choices"])) for i, q in enumerate(questions))

    def mock():
        # 목업: 마지막 문제는 일부러 다른 답을 골라, 교차 검수에서 빠지는 흐름을 확인할 수 있게 한다
        return {"answers": [{"choice": (q["answerIndex"] + 1) % 4 + 1, "issue": "(목업) 정답이 하나로 정해지지 않아요"}
                            if i == len(questions) - 1 and len(questions) > MIN_KEPT else {"choice": q["answerIndex"] + 1, "issue": None}
                            for i, q in enumerate(questions)]}

    r = ask_ai("content_review", REVIEWER_PROMPT, prompt, SOLVE_SCHEMA, max_tokens=3000, mock=mock)
    out = []
    for i in range(len(questions)):
        a = r["answers"][i] if i < len(r["answers"]) else None
        out.append({"choice": a["choice"] - 1, "issue": a["issue"]} if a else {"choice": -1, "issue": "교차 풀이 결과가 없어요"})
    return out


def structure_checks(concept_id, questions):
    """저장 전 기본 검사 (문제 수·id 중복·힌트·해설·보기)"""
    checks = [{"name": "개념이 커리큘럼에 존재", "pass": concept(concept_id) is not None},
              {"name": "문제가 1개 이상", "pass": len(questions) > 0}]
    ids = set()
    for q in questions:
        tag = f"[{q['id']}]"
        checks.append({"name": f"{tag} id 중복 없음", "pass": q["id"] not in ids})
        ids.add(q["id"])
        checks.append({"name": f"{tag} 힌트 1~4개·해설·핵심 개념",
                       "pass": 1 <= len(q["hints"]) <= 4 and bool(q["explanation"].strip()) and bool(q["keyPoint"].strip())})
        texts = [re.sub(r"\s+", "", ch["text"]) for ch in q["choices"]]
        checks.append({"name": f"{tag} 보기 3개 이상, 정답 인덱스 유효", "pass": len(q["choices"]) >= 3 and 0 <= q["answerIndex"] < len(q["choices"])})
        checks.append({"name": f"{tag} 중복 보기 없음", "pass": len(set(texts)) == len(texts)})
    return checks


def mock_theory(concept_id, count):
    """목업: 같은 분야의 다른 주제 핵심 문장을 오답으로 쓰는 문제 (형식은 실제와 같다)"""
    c = concept(concept_id)
    others = [o for o in concepts_of("theory") if o["id"] != concept_id and o["unitId"] == c["unitId"]]
    pool = others if len(others) >= 3 else [o for o in concepts_of("theory") if o["id"] != concept_id]
    cert = curriculum()["certSubjects"][0]["id"]
    questions = []
    for i in range(count):
        wrongs = [pool[(i + k) % len(pool)] for k in range(3)]
        questions.append({
            "skill": "recall",
            "prompt": f"({i + 1}) 다음 중 '{c['name']}'에 대한 설명으로 옳은 것은 무엇일까요?",
            "choices": [{"text": c["keyIdea"], "misconception": None}] + [{"text": w["keyIdea"], "misconception": f"{c['name']}와(과) {w['name']}을(를) 혼동"} for w in wrongs],
            "answerIndex": 0,
            "certs": [cert],
            "hints": [f"'{c['name']}'이(가) 어떤 문제를 해결하려고 생겼는지 떠올려 보세요.", "다른 보기는 같은 분야의 다른 개념 설명이에요."],
            "explanation": f"{c['summary']}\n다른 보기는 {', '.join(w['name'] for w in wrongs)}에 대한 설명이에요.",
            "keyPoint": c["keyIdea"],
        })
    return {"questions": questions}


def check_can_generate(concept_id, level, trigger):
    """만들면 안 되는 이유 (없으면 None)"""
    if AI_MODE not in ("live", "mock"):
        return "AI 가 설정되어 있지 않습니다."
    if not concept(concept_id) or track_of(concept_id) != "theory":
        return "개념 주제가 아닙니다."
    if not generatable_levels(concept_id):
        return "AI 생성 대상이 아닌 주제입니다."
    if trigger != "manual":
        return "개념 문제는 관리자가 직접 만들 때만 생성합니다."
    if running_job(concept_id, level):
        return "같은 개념·난이도로 생성 중입니다."
    if len(jobs_since(now_ms() - 86400_000)) >= POLICY["dailyLimit"]:
        return "오늘의 생성 한도에 도달했습니다."
    if AI_MODE == "live" and month_cost_usd() >= POLICY["monthlyBudgetUsd"]:
        return "이번 달 AI 예산에 도달했습니다."
    return None


def create_job(concept_id, level, trigger, reason, session_id=None):
    now = now_ms()
    job_id = time_id(now)
    put_item({"pk": "JOB", "sk": pad(job_id), "id": job_id, "concept": concept_id, "level": level, "trigger": trigger,
              "sessionId": session_id, "mock": AI_MODE == "mock", "status": "running", "reason": reason, "itemId": None,
              "error": None, "createdAt": now, "finishedAt": None, TTL_ATTR: ttl_after(90 * 86400)})
    return job_id


def finish_job(job_id, status, item_id, error):
    """진행 중인 작업만 끝낸다 (관리자가 이미 중지한 작업은 그대로)"""
    update_item("JOB", pad(job_id), set_values={"status": status, "itemId": item_id, "error": error, "finishedAt": now_ms()},
                condition="#st = :running", names={"#st": "status"}, values={":running": "running"})


def finish_cancelled(job_id):
    finish_job(job_id, "cancelled", None, "관리자가 중지했어요")
    return {"jobId": job_id, "status": "cancelled", "error": "관리자가 중지했어요"}


def stop_requested_since(since_ms):
    return int(get_meta("generation_stop_at") or 0) >= since_ms
