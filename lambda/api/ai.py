"""
공통 조각 — ai: AI 를 쓰는 함수에만 들어가요 (연습·내 코드 점검·첨삭·관리자)

Bedrock 호출(ask_ai) · 월 예산 확인 · 사용량 기록(OPS#USAGE·OPS#AILOG) · AI 답의 모양(Pydantic AiAnswer)과 흔한 실수 고치기.
AI 를 쓸 수 없으면 AiUnavailable 을 던지고, 부른 쪽이 규칙 기반 결과(예시 코드·규칙 첨삭)로 대신해요.
"""
import json
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from types import UnionType
from typing import Literal, Union, get_args, get_origin

from pydantic import BaseModel, ConfigDict, ValidationError, model_validator

from core import (AI_MODE, MOCK_DELAY_SEC, MODEL_ID, MONTHLY_BUDGET_USD, OPS_AILOG, OPS_USAGE, PRICE, TTL_ATTR, ai_enabled, bedrock, logger, now_ms,
                  pad, put_item, query_all, time_id, ttl_after, update_item)


# ─────────────────────────────────────────────────────────────
# AI 호출 (Bedrock Converse)
#     - 구조화 응답(ask_ai): 'answer' 도구 하나를 주고 반드시 그 도구로 답하게 해서, 도구 입력(JSON)을 결과로 쓴다
#     - 이번 달 추정 비용 + 이번 호출의 최대 비용이 예산을 넘으면 부르지 않는다 (AiUnavailable → 규칙 기반 대체)
#     - 호출마다 USAGE / <연-월>#<작업>#<모델> 에 토큰 수를 더한다 (관리자 화면의 비용)
#     - AI_MODE=mock 이면 mock 함수의 결과를 돌려준다 (비용 없음, 화면 확인용)
# ─────────────────────────────────────────────────────────────


class AiUnavailable(Exception):
    """AI 를 쓸 수 없음 (꺼짐·예산·형식 오류) → 부른 쪽에서 규칙 기반 결과를 쓴다"""


def month_key(ms=None):
    return datetime.fromtimestamp((ms or now_ms()) / 1000, tz=timezone.utc).strftime("%Y-%m")


def normalize_model(model):
    """'us.anthropic.claude-haiku-4-5-20251001-v1:0' → 'claude-haiku-4-5' (가격표 이름)"""
    model = re.sub(r"^mock:", "", model)
    model = re.sub(r"^(?:[a-z]{2,6}\.)?anthropic\.", "", model)
    return re.sub(r"-\d{8}(?:-v\d+(?::\d+)?)?$", "", model)


def usage_summary(since_month=""):
    """작업·모델별 사용량 합계 (since_month 부터)"""
    by = {}
    for r in query_all(OPS_USAGE, start=since_month or None):
        key = (r.get("task"), r.get("model"))
        cur = by.setdefault(key, {"task": r.get("task"), "model": r.get("model"), "calls": 0, "input": 0, "output": 0, "cacheRead": 0, "failures": 0})
        for k in ("calls", "input", "output", "cacheRead", "failures"):
            cur[k] += r.get(k, 0)
    return sorted(by.values(), key=lambda u: -u["calls"])


def estimate_cost(rows):
    total = 0.0
    for u in rows:
        p = PRICE.get(normalize_model(u["model"]))
        if p:
            total += (u["input"] * p["input"] + u["output"] * p["output"] + u["cacheRead"] * p["cacheRead"]) / 1e6
    return total


def month_cost_usd(include_mock=False):
    return estimate_cost([u for u in usage_summary(month_key()) if include_mock or not u["model"].startswith("mock:")])


AI_LOG_DAYS = 14   # 관리자 화면의 'AI 호출 기록' 보관 기간


def log_usage(task, model, inp, out, cache_read, ok, error=None, ms=0):
    """AI 호출 한 번을 기록한다: USAGE(이번 달 합계) + AILOG(호출 하나하나, 14일 보관)"""
    month = month_key()
    now = now_ms()
    try:
        latest = {"task": task, "model": model, "month": month, "lastAt": now}
        if error:
            latest.update(lastError=error[:200], lastErrorAt=now)
        update_item(OPS_USAGE, f"{month}#{task}#{model}", set_values=latest,
                    add_values={"calls": 1, "input": inp, "output": out, "cacheRead": cache_read, "failures": 0 if ok else 1})
        log_ai_event(task, model, ok, inp, out, ms, error)
    except Exception as e:  # 사용량 기록 실패가 학습을 막지 않도록
        logger.warning("AI 사용량 기록 실패", extra={"error": repr(e)})


def log_ai_event(task, model, ok, inp=0, out=0, ms=0, error=None, stage="ai"):
    """OPS#AILOG / <시각>: 관리자 화면에서 어떤 작업이 언제 성공·실패했는지 보여 준다.
    stage: ai(AI 호출 자체) · check(AI 는 답했지만 서버 검사에서 걸림 — 예: 만든 코드의 문법 오류)"""
    try:
        put_item({"pk": OPS_AILOG, "sk": pad(time_id()), "task": task, "model": model, "ok": ok, "stage": stage,
                  "input": inp, "output": out, "ms": int(ms), "error": (error or "")[:300], "createdAt": now_ms(),
                  TTL_ATTR: ttl_after(AI_LOG_DAYS * 86400)})
    except Exception as e:
        logger.warning("AI 호출 기록 실패", extra={"error": repr(e)})


def check_budget(input_chars, max_tokens):
    """이번 호출이 쓸 수 있는 최대 비용까지 더해도 월 예산 안인지 (넘으면 AiUnavailable)"""
    p = PRICE.get(normalize_model(MODEL_ID)) or max(PRICE.values(), key=lambda x: x["output"])
    worst = (input_chars * p["input"] + max_tokens * p["output"]) / 1e6
    if month_cost_usd() + worst > MONTHLY_BUDGET_USD:
        raise AiUnavailable("monthly AI budget reached")


def build_messages(history, prompt):
    """이전 대화 + 이번 질문 → Converse messages (user 로 시작, 같은 역할이 이어지면 합침)"""
    out = []
    for turn in list(history or []) + [{"role": "user", "text": prompt}]:
        text = (turn.get("text") or "").strip()
        if not text or (not out and turn["role"] != "user"):
            continue
        if out and out[-1]["role"] == turn["role"]:
            out[-1]["content"][0]["text"] += "\n\n" + text
        else:
            out.append({"role": turn["role"], "content": [{"text": text}]})
    return out


def ask_ai(task, system, prompt, schema, max_tokens=4000, mock=None, history=None, mock_delay=None):
    """AI 에게 정해진 모양(schema: AiAnswer 를 이은 모양)의 답을 받는다. 흔한 실수는 고치고, 그래도 틀리면 AiUnavailable.
    mock: 목업 모드(AI_MODE=mock)에서 대신 돌려줄 답을 만드는 함수 (이것도 같은 모양인지 검사한다)"""
    if not ai_enabled():
        raise AiUnavailable("AI is off")
    started = time.time()
    if AI_MODE == "mock":
        if not mock:
            raise AiUnavailable("no mock for this task")
        time.sleep(MOCK_DELAY_SEC if mock_delay is None else mock_delay)
        result, issues = parse_answer(mock(), schema)
        if issues:   # 목업이 모양과 다르면 코드 실수 — 시험에서 바로 드러나게
            raise ValueError(f"mock for {task} does not fit {schema.__name__}: {issues[:3]}")
        log_usage(task, f"mock:{MODEL_ID}", (len(system) + len(prompt)) // 2, len(json.dumps(result, ensure_ascii=False)) // 2, 0, True,
                  ms=(time.time() - started) * 1000)
        return result
    if AI_MODE != "live":
        raise AiUnavailable("AI is off")
    messages = build_messages(history, prompt)
    input_chars = len(system) + sum(len(m["content"][0]["text"]) for m in messages)
    check_budget(input_chars, max_tokens)
    ok, usage, error = False, {}, None
    try:
        try:
            response = bedrock().converse(
                modelId=MODEL_ID,
                system=[{"text": system}],
                messages=messages,
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
                usage = {"inputTokens": input_chars, "outputTokens": max_tokens}
            raise AiUnavailable(f"bedrock: {type(e).__name__}")
        usage = response.get("usage", {})
        if response.get("stopReason") == "max_tokens":
            raise AiUnavailable("response was truncated")
        tool = next((c["toolUse"] for c in response["output"]["message"]["content"] if "toolUse" in c), None)
        if not tool:
            raise AiUnavailable("could not parse response: 응답에 결과(JSON)가 없음")
        value, issues = parse_answer(tool["input"], schema)
        if issues:
            logger.warning("AI 응답 형식 불일치", extra={"task": task, "issues": issues[:3]})
            raise AiUnavailable("could not parse response: " + "; ".join(issues[:3]))
        ok = True
        return value
    except AiUnavailable as e:
        error = str(e)
        raise
    finally:
        log_usage(task, MODEL_ID, usage.get("inputTokens", 0), usage.get("outputTokens", 0), usage.get("cacheReadInputTokens", 0), ok,
                  error=error, ms=(time.time() - started) * 1000)


# ─────────────────────────────────────────────────────────────
# AI 답의 모양 (Pydantic). 작업마다 기능 파일에서 AiAnswer 를 이어 모양을 만든다.
#   tool_schema(모양) → Bedrock 도구 형식(JSON Schema) · parse_answer(받은 답, 모양) → (고친 dict, 문제 목록)
# ─────────────────────────────────────────────────────────────


def _kinds(annotation):
    """칸의 타입 → 들어갈 수 있는 종류들 (str · int · list · NoneType · 모양 클래스 …)"""
    if get_origin(annotation) in (Union, UnionType):
        return {k for a in get_args(annotation) for k in _kinds(a)}
    if get_origin(annotation) is Literal:
        return {type(v) for v in get_args(annotation)}
    return {get_origin(annotation) or annotation}


class AiAnswer(BaseModel):
    """AI 답의 모양. 받은 답에서 자주 어긋나는 것만 고쳐서 받는다:
    빠진 칸 중 null 이 될 수 있는 칸 → null · 문자열로 감싼 배열·객체 → 풀기 · "3" → 3 (Pydantic 기본). 모양에 없는 칸은 그대로 둔다"""
    model_config = ConfigDict(extra="allow")

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
            if name not in out:
                if type(None) in kinds:
                    out[name] = None
            elif isinstance(out[name], str) and str not in kinds and out[name].strip()[:1] in ("[", "{"):
                try:
                    out[name] = json.loads(out[name].strip())
                except ValueError:
                    pass
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
