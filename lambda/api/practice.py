import random

from common import (LEVELS, MODEL_ID, REGEN_LIMIT, AiUnavailable, ApiError, ai_allowed, ask_ai, clean_marks, count_event, field,
                    get_learner, latest_review, load_reading, log_ai_event, public_reading, remember_topic, save_reading)
from samples import SAMPLES
from review import retries_for
from tutor_chat import chats_for

# ─────────────────────────────────────────────────────────────
# 연습 모드 (practice.py) — jojo_api 의 기능 파일
#
#   POST /practice          코드 받기          {"level": 2, "topic": "편의점 재고"}
#   POST /practice/adjust   더 쉽게·더 어렵게   {"readingId": "...", "direction": "easier" | "harder",
#                                                "reasons": ["too_long", "unknown_concept", "complex_flow"]}
#   GET  /reading?id=...    코드 다시 열기 (같은 코드 다시 읽기, 첨삭 결과 다시 보기)
#
#   AI(Bedrock)가 Python 코드와 ※ 꼭 설명할 곳(2~3곳)을 만든다. ※ 의 모범 설명은 저장만 하고 화면에는 보내지 않는다.
#   AI 를 쓸 수 없으면 samples.py 의 예시 코드를 대신 준다.
# ─────────────────────────────────────────────────────────────

LEVEL_GUIDE = {
    1: "10~20줄. 변수·조건문·반복문·리스트가 위에서 아래로 흘러가는 코드. 함수는 없거나 1개.",
    2: "25~45줄. 함수 2~4개가 서로를 불러요. 리스트·딕셔너리를 써요.",
    3: "35~60줄. 클래스, 재귀, 예외 처리 중 1~2가지가 흐름의 중심이에요.",
    4: ("120~190줄. 실제 문제를 푸는 작은 프로그램. 클래스 1~2개와 함수 6개 이상이 서로를 부르고, "
        "자료구조(딕셔너리·리스트·힙·큐·스택·그래프 중 2개 이상)와 알고리즘 1~2개(최단 경로·동적 계획법·정렬·이진 탐색·재귀·백트래킹·그리디 등)가 흐름의 중심이에요. "
        "입력 검증과 예외 처리, 알고리즘끼리 비교하거나 결과를 요약하는 부분, 마지막에 실행 예시와 print 결과가 있어요. "
        "줄 수를 채우려고 같은 코드를 반복하거나 주석·빈 줄로 늘리지 마세요."),
}
MIN_LINES = {1: 0, 2: 0, 3: 0, 4: 100}       # 고급은 너무 짧으면 다시 만든다
MAX_LINES = {1: 30, 2: 60, 3: 80, 4: 200}
MARK_COUNT = {1: 2, 2: 3, 3: 3, 4: 5}        # ※ 꼭 설명할 곳 수
OUTPUT_TOKENS = {1: 3000, 2: 3000, 3: 3500, 4: 12000}   # AI 답(코드 + ※ 설명) 최대 길이
REASONS = {"too_long": "코드가 너무 길었어요", "unknown_concept": "모르는 개념이 있었어요", "complex_flow": "흐름이 복잡했어요"}

SYSTEM_PROMPT = """너는 프로그래밍 입문자와 비개발자가 '코드를 읽고 흐름을 설명하는 연습'을 하도록 Python 코드를 만드는 출제자야.
학습자는 코드를 작성하지 않고, 형광펜으로 범위를 골라 메모로 흐름을 설명해. 그 뒤 AI 가 메모를 첨삭해.

코드 규칙:
- Python 3 표준 기능만. input(), 파일·네트워크, random·time 처럼 실행할 때마다 결과가 달라지는 것은 쓰지 않아.
- 주어진 생활 속 주제를 실제로 보여 주는 코드. 마지막에 print 로 결과가 나와야 해.
- 변수·함수 이름은 영어, 문자열 값과 주석은 한국어. 주석은 첫 줄 제목 정도로 아주 적게 (주석이 흐름을 대신 설명하면 안 돼).
- 난이도에 맞는 길이와 문법만.

※ 꼭 설명할 곳 (marks):
- 흐름을 이해해야만 설명할 수 있는 곳을 고른다 (조건 분기, 반복이 값을 바꾸는 곳, 함수가 다른 함수를 부르는 곳, 예외·재귀가 흐름을 바꾸는 곳).
- startLine·endLine 에는 그 범위의 첫 줄과 끝 줄을 코드에 있는 그대로(들여쓰기 빼고) 적고, startNo·endNo 에 그 줄 번호(1부터)를 적어. 범위끼리 겹치면 안 돼.
- why: 왜 꼭 설명해야 하는지 한 줄.
- explanation: 이 부분의 흐름을 실제 값과 함께 2~3문장으로 설명한 모범 설명 (첨삭할 때 기준이 됨).
- keywords: 모범 설명의 핵심 표현 3~5개 (짧게).
모든 문장은 한국어 존댓말("~해요")."""

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "코드 제목 (20자 이내)"},
        "code": {"type": "string", "description": "Python 코드 전체"},
        "marks": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "startLine": {"type": "string"}, "endLine": {"type": "string"},
                "startNo": {"type": "integer", "description": "첫 줄 번호 (1부터)"}, "endNo": {"type": "integer", "description": "끝 줄 번호"},
                "why": {"type": "string"},
                "explanation": {"type": "string"}, "keywords": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["startLine", "endLine", "startNo", "endNo", "why", "explanation", "keywords"],
        }},
    },
    "required": ["title", "code", "marks"],
}


def start_practice(req):
    # 1. 요청 값 확인
    level = field(req["body"], "level", "int", required=True, low=1, high=4)
    topic = field(req["body"], "topic", "str", required=True, max_len=50).strip()
    if not topic:
        raise ApiError(400, "주제를 골라 주세요.")
    learner = get_learner(req)

    # 2. 코드 만들기 (AI → 안 되면 예시 코드)
    made = make_code(req, level, topic, learner, prompt_extra="")

    # 3. 저장하고, 최근 주제·난이도 기억
    item = save_reading(learner, source="practice", level=level, topic=topic, **made)
    remember_topic(learner, topic, level)
    count_event("practices")
    return public_reading(item)


def adjust(req):
    # 1. 요청 값 확인
    body = req["body"]
    direction = field(body, "direction", "str", required=True, choices=["easier", "harder"])
    reasons = [r for r in field(body, "reasons", "list", default=[], max_len=3) if r in REASONS]
    learner = get_learner(req)
    old = load_reading(field(body, "readingId", "str", required=True, max_len=60), learner)
    if old["source"] != "practice":
        raise ApiError(400, "내 코드 점검에서는 난이도를 바꿀 수 없어요.")

    # 2. 같은 코드에서 다시 만들기는 REGEN_LIMIT 번까지 (비용 보호)
    if old.get("regenCount", 0) >= REGEN_LIMIT:
        raise ApiError(429, f"같은 코드에서 다시 만들기는 {REGEN_LIMIT}번까지예요. '새 문제 받기'로 새 코드를 받아 주세요.")

    # 3. 지금 코드를 기준으로 더 쉽게·더 어렵게
    level = max(1, old["level"] - 1) if direction == "easier" else min(4, old["level"] + 1)
    why = ", ".join(REASONS[r] for r in reasons) or "이유는 고르지 않았어요"
    extra = "\n".join([
        f"지금 코드보다 {'쉽게' if direction == 'easier' else '어렵게'} 다시 만들어 주세요. 주제는 그대로 유지해요.",
        f"학습자가 어려웠던 이유: {why}" if direction == "easier" else "흐름을 한 단계 더 따라가야 하는 코드로 만들어 주세요.",
        f"<current_code>\n{old['code']}\n</current_code>",
    ])
    made = make_code(req, level, old["topic"], learner, prompt_extra=extra)

    # 4. 새 코드로 저장 (처음 코드를 기준으로 몇 번째 다시 만들기인지 이어서 센다)
    item = save_reading(learner, source="practice", level=level, topic=old["topic"], rootId=old["rootId"],
                        regenCount=old.get("regenCount", 0) + 1, **made)
    count_event("adjusts")
    return public_reading(item)


def get_reading(req):
    learner = get_learner(req)
    item = load_reading(req["query"].get("id", ""), learner)
    review = latest_review(item["id"])
    return {"reading": public_reading(item), "review": review["result"] if review else None,
            "chats": chats_for(item["id"], review),       # 첨삭 항목마다 AI 튜터와 나눈 대화 (tutor_chat.py)
            "retries": retries_for(item["id"], review)}   # 첨삭 항목마다 힌트를 보고 다시 써 본 기록 (review.py)


ROUTES = {
    "POST /practice": start_practice,
    "POST /practice/adjust": adjust,
    "GET /reading": get_reading,
}

# ───────────────────────── 코드 만들기 ─────────────────────────


def make_code(req, level, topic, learner, prompt_extra):
    """AI 로 코드 + ※ 지점을 만든다. 형식이 틀리면 이유를 알려 주고 한 번 더, 그래도 안 되면 예시 코드"""
    sample = pick_sample(level, topic, learner)
    if not ai_allowed(req):
        return from_sample(sample, "AI 를 잠깐 많이 써서 준비된 예시 코드를 드려요.")
    feedback = ""
    for attempt in range(2):
        prompt = "\n\n".join(p for p in [
            f"주제: {topic}",
            f"난이도: {LEVELS[level]['name']} — {LEVEL_GUIDE[level]}",
            f"※ 꼭 설명할 곳: {MARK_COUNT[level]}곳" + (" — 알고리즘의 핵심(반복이 값을 바꾸는 곳, 비교·선택, 되돌아가며 결과를 만드는 곳)을 고르세요" if level == 4 else ""),
            prompt_extra, feedback,
        ] if p)
        try:
            r = ask_ai("code_generation", SYSTEM_PROMPT, prompt, SCHEMA, max_tokens=OUTPUT_TOKENS[level], mock=lambda: sample_as_ai(sample))
        except AiUnavailable as e:
            print("[ai] 예시 코드 사용:", e)
            return from_sample(sample, "지금은 AI 대신 준비된 예시 코드를 드려요.")
        code, marks, problems = check_generated(r, level)
        if not problems:
            return {"title": r["title"].strip()[:40] or topic, "code": code, "marks": marks, "origin": "ai",
                    "note": "(목업) 고른 주제와 다른 예시 코드일 수 있어요." if r.get("_mock") else None}
        feedback = "방금 만든 코드에 문제가 있었어요. 고쳐서 다시 만들어 주세요:\n" + "\n".join(f"- {p}" for p in problems)
        print("[generate] 다시 만듦:", problems)
        # AI 는 답했지만 서버 검사에서 걸린 것도 관리자 화면 'AI 호출 기록'에 남긴다
        log_ai_event("code_generation", f"mock:{MODEL_ID}" if r.get("_mock") else MODEL_ID, False, error="; ".join(problems), stage="check")
    return from_sample(sample, "AI 가 만든 코드가 검사를 통과하지 못해 준비된 예시 코드를 드려요.")


def check_generated(r, level):
    """문법 검사(실행은 하지 않음)·길이·※ 지점 찾기. 문제 목록이 비어 있으면 통과"""
    code = r["code"].replace("\r", "").replace("\t", "    ").strip("\n")
    problems = []
    try:
        compile(code, "<ai>", "exec")
    except SyntaxError as e:
        problems.append(f"Python 문법 오류 ({e.lineno}번째 줄: {e.msg})")
    lines = code.split("\n")
    if len(lines) > MAX_LINES[level]:
        problems.append(f"코드가 {len(lines)}줄이라 너무 길어요 ({MAX_LINES[level]}줄 이하)")
    if len(lines) < MIN_LINES[level]:
        problems.append(f"코드가 {len(lines)}줄이라 고급으로는 너무 짧아요 ({MIN_LINES[level]}줄 이상, 알고리즘과 자료구조를 갖춘 프로그램으로)")
    found = []
    for m in r["marks"]:
        start = find_line(lines, m["startLine"], 0, m.get("startNo"))
        end = find_line(lines, m["endLine"], start - 1, m.get("endNo")) if start else None
        if start and end and end >= start:
            found.append({**m, "start": start, "end": end})
    marks = clean_marks(code, found, limit=MARK_COUNT[level])
    if len(marks) < 2:
        problems.append("※ 꼭 설명할 곳의 startLine·endLine 이 코드의 줄과 같지 않아요 (그대로 옮겨 적어 주세요)")
    return code, marks, problems


def find_line(lines, text, from_index, hint=None):
    """text 와 같은 줄 번호(1부터, from_index 이후). 같은 줄이 여러 개면 AI 가 적은 번호(hint)에 가장 가까운 줄.
    AI 는 줄 번호를 자주 잘못 세서, 번호보다 줄의 글자를 먼저 믿는다"""
    target = text.strip()
    hits = [i + 1 for i in range(max(0, from_index), len(lines)) if target and lines[i].strip() == target]
    if not hits:
        hits = [i + 1 for i in range(max(0, from_index), len(lines)) if target and lines[i].strip().startswith(target[:20])]
    if not hits:
        return None
    return min(hits, key=lambda n: abs(n - hint)) if isinstance(hint, int) else hits[0]


def pick_sample(level, topic, learner):
    """예시 코드 고르기: 같은 난이도에서 같은 주제 → 최근에 안 푼 주제 → 아무거나"""
    same = [s for s in SAMPLES if s["level"] == level]
    for s in same:
        if s["topic"] in topic or topic in s["topic"]:
            return s
    fresh = [s for s in same if s["topic"] not in learner["recentTopics"]]
    return random.choice(fresh or same)


def from_sample(sample, note):
    return {"title": sample["title"], "code": sample["code"], "marks": clean_marks(sample["code"], sample["marks"], limit=5),
            "origin": "sample", "note": note}


def sample_as_ai(sample):
    """목업: 예시 코드를 AI 응답과 같은 모양으로 (startLine·endLine 은 그 줄의 글자)"""
    lines = sample["code"].split("\n")
    return {"_mock": True, "title": sample["title"], "code": sample["code"],
            "marks": [{"startLine": lines[m["start"] - 1].strip(), "endLine": lines[m["end"] - 1].strip(),
                       "startNo": m["start"], "endNo": m["end"], "why": m["why"],
                       "explanation": m["explanation"], "keywords": m["keywords"]} for m in sample["marks"]]}
