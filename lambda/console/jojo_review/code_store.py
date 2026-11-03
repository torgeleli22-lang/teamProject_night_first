"""
공통 조각 — code_store: 읽을 코드(CODE#<id>)를 다루는 함수에 들어가요 (연습·내 코드 점검·첨삭·내 공부·관리자)

코드 저장·꺼내기, 화면용 모양(public_code — 모범 설명·실행 추적표는 빼고), ※ 지점 정리, 개념 추정, 첨삭 기록 키.
"""
import re

from core import (CONCEPTS, INFO, LANGUAGES, LEVELS, REGEN_LIMIT, TTL_ATTR, alive, ApiError, code_pk, get_item, keep_seconds, new_id, now_ms,
                  put_item, query_all, ttl_after)


# ─────────────────────────────────────────────────────────────
# 읽을 코드 (CODE#<id> / INFO) — 연습 모드·내 코드 점검이 함께 쓴다
#    코드, 언어, 난이도, 주제, ※ 꼭 설명할 곳(marks: 줄 범위 + 모범 설명 + 핵심 표현)
#    화면에는 public_code() 만 보낸다 (모범 설명·핵심 표현은 첨삭 뒤에만)
# ─────────────────────────────────────────────────────────────


def numbered(code):
    """AI 에게 보여 줄 줄 번호 붙인 코드"""
    return "\n".join(f"{i + 1:3}| {line}" for i, line in enumerate(code.split("\n")))


def code_for_ai(item):
    """첨삭·튜터 프롬프트의 <code> 블록: 언어 이름 + 줄 번호 붙인 코드"""
    return f"<code language=\"{LANGUAGES.get(item.get('language') or 'python', 'Python')}\">\n{numbered(item['code'])}\n</code>"


def clean_marks(code, marks, limit=4):
    """※ 지점 정리: 코드 줄 범위 안으로, 시작 순서대로, 겹치면 빼고, 최대 limit 곳. id 는 m1, m2 …"""
    total = len(code.split("\n"))
    out = []
    for m in sorted(marks, key=lambda m: m["start"]):
        start, end = max(1, int(m["start"])), min(total, int(m["end"]))
        if start > end or (out and start <= out[-1]["end"]):
            continue
        concept = m.get("concept") if m.get("concept") in CONCEPTS else guess_concept(code, start, end)
        out.append({"id": f"m{len(out) + 1}", "start": start, "end": end, "why": str(m.get("why", ""))[:80], "concept": concept,
                    "explanation": str(m.get("explanation", ""))[:600], "keywords": [str(k)[:30] for k in m.get("keywords", [])][:8]})
        if len(out) >= limit:
            break
    return out


# 개념 추정 규칙 (AI 가 꼬리표를 빠뜨렸을 때, 예전 코드, 메모 범위). 위에서부터 먼저 맞는 것. Python·JavaScript 를 함께 본다
_CONCEPT_RULES = [
    ("exception", r"\b(raise|try|except|throw|catch)\b"),
    ("algorithm", r"\b(heapq|heappush|heappop|bisect\w*|deque)\b|\bbest\[|\bdp\[|\bmemo\["),
    ("class_state", r"\b(self|this)\.\w+\s*([-+*/]?=(?!=)|\+\+|--)"),
    ("loop_update", r"^\s*(for|while|do)\b|\.(forEach|map|filter|reduce)\("),
    ("branch", r"^\s*(\}\s*)?(if|elif|else|switch|case)\b"),
    ("data_update", r"\w\[[^\]]+\]\s*(\+|-)?=(?!=)|\.(append|pop|setdefault|update|remove|extend|insert|push|shift|unshift|splice|set|delete)\("),
]


# 함수를 만드는 줄: Python def · JS function · const name = (...) => · 클래스 메서드 name(...) {
_DEF_LINE = re.compile(r"^(\s*)(?:(?:async\s+)?def\s+(\w+)|(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)"
                       r"|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)"
                       r"|(?:static\s+|async\s+)*(?!(?:if|for|while|switch|catch|return|function)\b)(\w+)\s*\([^)]*\)\s*\{)")


def _def_name(line):
    m = _DEF_LINE.match(line)
    return (m.group(1), next(g for g in m.groups()[1:] if g)) if m else None


def guess_concept(code, start, end):
    """줄 범위 안의 문법으로 개념을 추정 (AI 없음). 자기 함수를 다시 부르면 재귀, 다른 함수를 부르면 함수 호출"""
    lines = code.split("\n")
    chunk = "\n".join(lines[max(0, start - 1):end])
    # 이 범위의 함수: 범위가 def·function 줄로 시작하면 그 함수, 아니면 범위 첫 줄보다 덜 들여 쓴 가장 가까운 def·function. 맨 바깥 코드면 없음
    first = next((l for l in lines[max(0, start - 1):end] if l.strip()), "")
    indent = len(first) - len(first.lstrip())
    owner = (_def_name(first) or (None, None))[1]   # 범위가 함수 첫 줄부터면 그 함수
    for i in range(min(start, len(lines)) - 1 if not owner else -1, -1, -1):
        found = _def_name(lines[i])
        if found and len(found[0]) < indent:
            owner = found[1]
            break
    if owner and re.search(rf"\b{owner}\(", "\n".join(l for l in chunk.split("\n") if not _def_name(l))):
        return "recursion"
    for concept, pattern in _CONCEPT_RULES:
        if re.search(pattern, chunk, re.M):
            return concept
    defined = {found[1] for found in map(_def_name, lines) if found}
    if any(re.search(rf"\b{name}\(", chunk) for name in defined):
        return "call_flow"
    return "data_update"


def save_code(user, **fields):
    """읽을 코드 하나를 저장하고 돌려준다. fields: source, level, topic, title, code, marks, rootCodeId, regenCount, origin, keep(upload 면 짧게)"""
    code_id = new_id()   # 시간순 UUID: id 앞부분만 봐도 언제 만든 코드인지 알 수 있다
    keep = min(keep_seconds(user, fields.pop("keep", "code")), keep_seconds(user, "code"))
    item = {"pk": code_pk(code_id), "sk": INFO, "codeId": code_id, "userId": user["userId"], "language": fields.pop("language", None) or "python",
            "createdAt": now_ms(), "rootCodeId": fields.pop("rootCodeId", None) or code_id, "regenCount": fields.pop("regenCount", 0),
            TTL_ATTR: ttl_after(keep), **fields}
    put_item(item)
    return item


def load_code(code_id, user):
    """내 코드만 꺼낼 수 있다 (다른 사람의 id 를 알아도 못 봄)"""
    if not isinstance(code_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", code_id):
        raise ApiError(400, "요청 값을 확인해 주세요.")
    item = get_item(code_pk(code_id), INFO)
    if not item or not alive(item) or item.get("userId") not in [user["userId"], *user.get("formerUserIds", [])]:
        raise ApiError(404, "코드를 찾을 수 없어요. 시간이 지나 지워졌을 수 있어요.")
    return item


def review_rows(code_id):
    """코드 하나의 첨삭과 거기 딸린 다시 쓰기·튜터 대화를 한 번에 (CODE#<id> 에서 sk 가 REVIEW# 로 시작하는 것, 시간순)"""
    return query_all(code_pk(code_id), prefix="REVIEW#")


def latest_review(code_id, rows=None):
    """가장 최근 첨삭 (CODE#<id> / REVIEW#<시각>). 튜터 대화·다시 써 보기가 이 첨삭의 항목 번호에 붙는다
    rows 에는 다시 쓰기·대화(REVIEW#<시각>#RETRY#…)도 섞여 있어서 sk 에 # 가 하나뿐인 첨삭만 고른다"""
    reviews = [r for r in (review_rows(code_id) if rows is None else rows) if r["sk"].count("#") == 1]
    return reviews[-1] if reviews else None


def review_key(review, kind, index):
    """첨삭 항목에 붙는 기록의 sk: REVIEW#<첨삭 시각>#CHAT#003 · REVIEW#<첨삭 시각>#RETRY#003"""
    return f"{review['sk']}#{kind}#{index:03d}"


def review_children(review, kind, rows):
    """첨삭 하나에 딸린 다시 쓰기(RETRY)·튜터 대화(CHAT): {항목 번호: 항목}"""
    prefix = f"{review['sk']}#{kind}#"
    return {int(r["sk"][len(prefix):]): r for r in rows if r["sk"].startswith(prefix)}


def public_code(item):
    """화면으로 보낼 모양 (※ 지점은 줄 범위만)"""
    level = item.get("level") or 1
    return {
        "codeId": item["codeId"], "source": item["source"], "language": item.get("language") or "python", "level": level, "levelName": LEVELS[level]["name"],
        "topic": item.get("topic", ""), "title": item.get("title", ""), "code": item["code"],
        "marks": [{"id": m["id"], "start": m["start"], "end": m["end"]} for m in item.get("marks", [])],
        "regenLeft": max(0, REGEN_LIMIT - item.get("regenCount", 0)), "note": item.get("note"),
        "functions": item.get("functions"), "levelReason": item.get("levelReason"), "focus": item.get("focus"),
    }
