"""
공통 조각 — ai: AI 를 쓰는 함수(jojo_practice · jojo_review)에 들어가요.

ask_ai(): Bedrock 을 한 번 부르고, 정해진 모양(AiAnswer)으로 답을 받아요. 흔한 형식 실수는 고치고, 그래도 틀리면 빠진 칸을 알려 주고 1번 더 물어요.
AI 를 쓸 수 없으면(꺼짐·월 예산·형식 오류) AiUnavailable 을 던지고, 부른 쪽이 예시 코드·규칙 채점으로 대신해요.
"""
import json
import re
import threading
import time
from datetime import datetime, timezone
from functools import lru_cache
from types import UnionType
from typing import ClassVar, Literal, Union, get_args, get_origin

from pydantic import BaseModel, ConfigDict, ValidationError, model_validator

from core import AI_MODE, MOCK_DELAY_SEC, MODEL_ID, MONTHLY_BUDGET_USD, OPS_USAGE, PRICE, ai_enabled, bedrock, logger, now_ms, query_all, update_item


class AiUnavailable(Exception):
    """AI 를 쓸 수 없음 (꺼짐·예산·형식 오류) → 부른 쪽에서 대신할 결과를 쓴다"""


# ─────────────────────────────────────────────────────────────
# 1. 사용량·월 예산 (OPS#USAGE / <연-월>#<작업>#<모델>)
# ─────────────────────────────────────────────────────────────

# 실험(관리자)용 기록: recorder.calls 가 목록이면 호출마다 {task, input, output, sec, ok, error} 를 덧붙인다 (스레드마다)
recorder = threading.local()


def month_key(ms=None):
    return datetime.fromtimestamp((ms or now_ms()) / 1000, tz=timezone.utc).strftime("%Y-%m")


def normalize_model(model):
    """'us.anthropic.claude-haiku-4-5-20251001-v1:0' → 'claude-haiku-4-5' (가격표 이름)"""
    model = re.sub(r"^mock:", "", model)
    model = re.sub(r"^(?:[a-z]{2,6}\.)?anthropic\.", "", model)
    return re.sub(r"-\d{8}(?:-v\d+(?::\d+)?)?$", "", model)


def cost_usd(model, inp, out):
    p = PRICE.get(normalize_model(model)) or max(PRICE.values(), key=lambda x: x["output"])
    return (inp * p["input"] + out * p["output"]) / 1e6


def month_cost_usd():
    """이번 달 실제 AI 비용 (목업 제외)"""
    return sum(cost_usd(r.get("model", ""), r.get("input", 0), r.get("output", 0))
               for r in query_all(OPS_USAGE, prefix=month_key()) if not str(r.get("model", "")).startswith("mock:"))


def log_usage(task, model, inp, out, ok, error=None, sec=0.0):
    """AI 호출 한 번: 이번 달 합계에 더하고, 실험 중이면 기록에도 남긴다"""
    calls = getattr(recorder, "calls", None)
    if isinstance(calls, list):
        calls.append({"task": task, "input": inp, "output": out, "sec": round(sec, 2), "ok": ok, "error": error})
    try:
        update_item(OPS_USAGE, f"{month_key()}#{task}#{model}", set_values={"task": task, "model": model, "lastAt": now_ms()},
                    add_values={"calls": 1, "input": inp, "output": out, "failures": 0 if ok else 1})
    except Exception as e:  # 사용량 기록 실패가 학습을 막지 않도록
        logger.warning("AI 사용량 기록 실패", extra={"error": repr(e)})


def check_budget(input_chars, max_tokens):
    """이번 호출의 최대 비용까지 더해도 월 예산 안인지 (넘으면 AiUnavailable)"""
    if month_cost_usd() + cost_usd(MODEL_ID, input_chars, max_tokens) > MONTHLY_BUDGET_USD:
        raise AiUnavailable("monthly AI budget reached")


# ─────────────────────────────────────────────────────────────
# 2. AI 호출 (Bedrock Converse) — 'answer' 도구 하나를 주고 반드시 그 도구로 답하게 해서, 도구 입력(JSON)을 결과로 쓴다
# ─────────────────────────────────────────────────────────────


def ask_ai(task, system, prompt, schema, max_tokens=4000, mock=None):
    """AI 에게 정해진 모양(schema)의 답을 받는다. mock: AI_MODE=mock 일 때 대신 돌려줄 답을 만드는 함수 (같은 모양인지 검사)"""
    if not ai_enabled():
        raise AiUnavailable("AI is off")
    if AI_MODE == "mock":
        if not mock:
            raise AiUnavailable("no mock for this task")
        time.sleep(MOCK_DELAY_SEC)
        result, issues = parse_answer(mock(), schema)
        if issues:   # 목업이 모양과 다르면 코드 실수 — 시험에서 바로 드러나게
            raise ValueError(f"mock for {task} does not fit {schema.__name__}: {issues[:3]}")
        log_usage(task, f"mock:{MODEL_ID}", (len(system) + len(prompt)) // 2, len(json.dumps(result, ensure_ascii=False)) // 2, True)
        return result
    # 형식이 어긋난 답이면 빠진 칸을 알려 주고 1번 더 묻는다 (잘림·연결 실패는 다시 묻지 않음)
    try:
        return _ask_live(task, system, prompt, schema, max_tokens)
    except AiUnavailable as e:
        if not str(e).startswith("could not parse response:") or "결과(JSON)가 없음" in str(e):
            raise
        hint = (f"{prompt}\n\n(앞선 답의 형식이 맞지 않았어요: {str(e)[len('could not parse response: '):][:300]}. "
                f"정해진 모든 칸을 최상위에 빠짐없이 채워 answer 로 다시 제출해 주세요.)")
        logger.info("AI 답 형식을 다시 물음", extra={"task": task, "reason": str(e)[:200]})
        return _ask_live(task, system, hint, schema, max_tokens)


def _shape(value):
    """받은 답의 칸 이름만 (값은 남기지 않음) — 형식 오류를 로그로 찾을 때"""
    if isinstance(value, dict):
        return {k: (sorted(v) if isinstance(v, dict) else type(v).__name__) for k, v in value.items()}
    return type(value).__name__


def _ask_live(task, system, prompt, schema, max_tokens):
    """Bedrock 을 한 번 부른다 (사용량은 부를 때마다 기록)"""
    started = time.time()
    check_budget(len(system) + len(prompt), max_tokens)
    ok, usage, error = False, {}, None
    try:
        try:
            response = bedrock().converse(
                modelId=MODEL_ID,
                system=[{"text": system}],
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"maxTokens": max_tokens},
                toolConfig={
                    "tools": [{"toolSpec": {
                        "name": "answer",
                        "description": "결과를 이 형식(JSON)으로 제출한다. 모든 칸을 빠짐없이 쓰고, 해당 없는 칸은 null 로 쓴다. 배열·객체를 문자열로 감싸지 않는다.",
                        "inputSchema": {"json": tool_schema(schema)},
                    }}],
                    "toolChoice": {"tool": {"name": "answer"}},
                },
            )
        except Exception as e:
            # AWS 가 거절한 요청(권한·모델·한도)은 비용이 없고, 연결이 끊긴 요청은 답을 만들었을 수 있어 최대 사용량으로 기록한다
            if not getattr(e, "response", None):
                usage = {"inputTokens": len(system) + len(prompt), "outputTokens": max_tokens}
            raise AiUnavailable(f"bedrock: {type(e).__name__}")
        usage = response.get("usage", {})
        if response.get("stopReason") == "max_tokens":
            raise AiUnavailable("response was truncated")
        tool = next((c["toolUse"] for c in response["output"]["message"]["content"] if "toolUse" in c), None)
        if not tool:
            raise AiUnavailable("could not parse response: 응답에 결과(JSON)가 없음")
        value, issues = parse_answer(tool["input"], schema)
        if issues:
            logger.warning("AI 응답 형식 불일치", extra={"task": task, "issues": issues[:3], "shape": _shape(tool["input"])})
            raise AiUnavailable("could not parse response: " + "; ".join(issues[:3]))
        ok = True
        return value
    except AiUnavailable as e:
        error = str(e)
        raise
    finally:
        log_usage(task, MODEL_ID, usage.get("inputTokens", 0), usage.get("outputTokens", 0), ok, error=error, sec=time.time() - started)


# ─────────────────────────────────────────────────────────────
# 3. AI 답의 모양 (Pydantic). 작업마다 기능 파일에서 AiAnswer 를 이어 모양을 만든다.
#   tool_schema(모양) → Bedrock 도구 형식(JSON Schema) · parse_answer(받은 답, 모양) → (고친 dict, 문제 목록)
# ─────────────────────────────────────────────────────────────


def _kinds(annotation):
    """칸의 타입 → 들어갈 수 있는 종류들 (str · int · list · NoneType · 모양 클래스 …)"""
    if get_origin(annotation) in (Union, UnionType):
        return {k for a in get_args(annotation) for k in _kinds(a)}
    if get_origin(annotation) is Literal:
        return {type(v) for v in get_args(annotation)}
    return {get_origin(annotation) or annotation}


def _as_text(value):
    """글자 칸에 온 숫자·참거짓·객체·배열 → 글자 (예: {"total": 4500} → "total=4500", ["a", "b"] → "a, b")"""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, dict):
        return ", ".join(f"{k}={_as_text(v)}" for k, v in value.items())
    if isinstance(value, (list, tuple)):
        return ", ".join(_as_text(v) for v in value)
    return str(value)


def _own_fields(model, name):
    """model 의 name 칸이 모양(AiAnswer)이면 그 모양의 칸 이름들"""
    f = model.model_fields.get(name)
    kinds = _kinds(f.annotation) if f else set()
    return {n for k in kinds if isinstance(k, type) and issubclass(k, BaseModel) for n in k.model_fields}


class AiAnswer(BaseModel):
    """AI 답의 모양. 받은 답에서 자주 어긋나는 것만 고쳐서 받는다:
    빠진 칸 중 null 이 될 수 있는 칸 → null · 문자열로 감싼 배열·객체 → 풀기 · "3" → 3 (Pydantic 기본)
    · 글자만 받는 칸(목록 안 글자 포함)에 온 숫자·객체·배열 → 글자 (_as_text). 모양에 없는 칸은 그대로 둔다"""
    model_config = ConfigDict(extra="allow")
    fill_empty: ClassVar[tuple] = ()   # 빠지면 빈 값([] · "")으로 받는 칸 (서버가 채우거나 비어도 되는 것만)

    @model_validator(mode="before")
    @classmethod
    def _repair(cls, data):
        if isinstance(data, str) and data.strip()[:1] == "{":
            try:
                data = json.loads(data)
            except ValueError:
                return data
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for name, f in cls.model_fields.items():
            kinds = _kinds(f.annotation)
            if name not in out:   # 다른 칸 안에 잘못 들어간 칸은 바깥으로 꺼낸다 (예: trace 안에 codeProblems) — 그 칸 자신의 칸이면 두고
                holder = next((v for k, v in out.items() if isinstance(v, dict) and name in v and name not in _own_fields(cls, k)), None)
                if holder is not None:
                    out[name] = holder.pop(name)
            if name not in out:
                if type(None) in kinds:
                    out[name] = None
                elif name in getattr(cls, "fill_empty", ()):   # 빠져도 서버가 채우거나 비어도 되는 칸
                    out[name] = "" if str in kinds else []
            elif isinstance(out[name], str) and str not in kinds and out[name].strip()[:1] in ("[", "{"):
                try:
                    out[name] = json.loads(out[name].strip())
                except ValueError:
                    pass
            if name in out and kinds == {str} and not isinstance(out[name], str):   # 글자 칸에 온 숫자·객체 → 글자
                out[name] = _as_text(out[name])
            elif name in out and get_origin(f.annotation) is list and get_args(f.annotation) == (str,) and isinstance(out[name], list):
                out[name] = [v if isinstance(v, str) else _as_text(v) for v in out[name]]
        return out


@lru_cache(maxsize=None)
def tool_schema(model):
    """모양 → Bedrock 도구 형식 (JSON Schema). $ref 는 펼치고, AI 에게 필요 없는 title·default·클래스 설명은 뺀다. null 이 되는 칸은 type: [타입, "null"]"""
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})
    for node in (raw, *defs.values()):   # 클래스 설명(docstring)은 코드를 읽는 사람용 — AI 에게는 칸 설명(Field description)만
        node.pop("description", None)

    def clean(node):
        if "$ref" in node:
            node = {**defs[node["$ref"].split("/")[-1]], **{k: v for k, v in node.items() if k != "$ref"}}
        out = {}
        for key, value in node.items():
            if key in ("title", "default", "additionalProperties"):
                continue
            out[key] = ({name: clean(sub) for name, sub in value.items()} if key == "properties"
                        else clean(value) if key == "items" else [clean(v) for v in value] if key == "anyOf" else value)
        options = out.get("anyOf") or []
        if len(options) == 2 and {"type": "null"} in options:
            other = next(o for o in options if o != {"type": "null"})
            if isinstance(other.get("type"), str):
                out = {**{k: v for k, v in out.items() if k != "anyOf"}, **other, "type": [other["type"], "null"]}
        return out
    return clean(raw)


def parse_answer(value, model):
    """받은 답 → (모양에 맞춘 dict, 문제 목록). 문제가 없으면 목록이 비어 있다 (AI 가 쓰지 않은 칸은 dict 에 넣지 않는다)"""
    try:
        return model.model_validate(value).model_dump(exclude_unset=True), []
    except ValidationError as e:
        return value, [f"{'.'.join(map(str, x['loc'])) or '(전체)'}: {x['msg']}" for x in e.errors()]
