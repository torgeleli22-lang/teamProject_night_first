"""
코드리딩 AI 중계 Lambda (Bedrock Converse API · Claude Haiku 4.5)

EC2 의 API 서버가 이 함수의 '함수 URL'로 AI 요청을 보내면, 이 함수가 실행 역할(SafeRole-계정)의
권한으로 Bedrock 을 호출하고 결과(JSON)를 돌려준다. EC2 에는 AWS 액세스 키가 필요 없다.

설정 (Lambda → 구성):
  - 일반 구성 → 제한 시간: 3분
  - 환경 변수 → RELAY_TOKEN: EC2 .env 의 AI_RELAY_TOKEN 과 같은 긴 임의 문자열 (GitHub·채팅에 쓰지 않기)
  - 함수 URL → 인증 유형 NONE (대신 RELAY_TOKEN 으로 막는다)

요청 (POST, 헤더 x-relay-token):
  {"system": "...", "messages": [{"role": "user"|"assistant", "text": "..."}, ...],
   "schema": {JSON Schema}, "maxTokens": 4000}
  - messages: 이전 대화 + 이번 질문 (마지막은 user). 콘솔 테스트처럼 질문 하나면 "prompt": "..." 만 보내도 된다
응답:
  {"output": {...스키마에 맞는 JSON}, "stopReason": "...", "model": "...",
   "usage": {"input": 0, "output": 0, "cacheRead": 0}}
"""

import base64
import hmac
import json
import os

import boto3
from botocore.config import Config

# 모델은 요청으로 바꿀 수 없게 고정한다 (토큰이 새어도 비싼 모델을 쓰지 못하도록)
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
MAX_TOKENS_LIMIT = 16000
TOOL_NAME = "answer"
MAX_MESSAGES = 30

# 긴 답변(문제 생성)은 1분 넘게 걸릴 수 있어 읽기 제한 시간을 늘린다 (기본 60초)
bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("BEDROCK_REGION", "us-east-1"),
    config=Config(read_timeout=170, connect_timeout=10, retries={"max_attempts": 2}),
)


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def read_request(event):
    """함수 URL 로 들어온 요청이면 토큰을 확인하고 본문을 꺼낸다. 콘솔 테스트(직접 호출)는 event 자체가 요청."""
    if "requestContext" not in event:
        return event  # 콘솔 '테스트' 또는 IAM 권한으로 직접 호출 — 이미 AWS 가 권한을 확인함
    expected = os.environ.get("RELAY_TOKEN", "")
    got = (event.get("headers") or {}).get("x-relay-token", "")
    if len(expected) < 16 or not hmac.compare_digest(expected, got):
        raise PermissionError()
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    return json.loads(body)


def to_converse_messages(req):
    """[{"role", "text"}] → Converse API 형식. user 로 시작해 user/assistant 가 번갈아 오도록 정리한다."""
    raw = req.get("messages")
    if raw is None and isinstance(req.get("prompt"), str):
        raw = [{"role": "user", "text": req["prompt"]}]
    if not isinstance(raw, list):
        return None
    out = []
    for m in raw[-MAX_MESSAGES:]:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant") or not isinstance(m.get("text"), str):
            return None
        text = m["text"].strip()
        if not text or (not out and m["role"] != "user"):
            continue
        if out and out[-1]["role"] == m["role"]:
            out[-1]["content"][0]["text"] += "\n\n" + text
        else:
            out.append({"role": m["role"], "content": [{"text": text}]})
    if not out or out[-1]["role"] != "user":
        return None
    return out


def lambda_handler(event, context):
    try:
        req = read_request(event)
    except PermissionError:
        return respond(401, {"error": "unauthorized"})
    except (ValueError, TypeError):
        return respond(400, {"error": "invalid json"})

    system = req.get("system")
    messages = to_converse_messages(req)
    schema = req.get("schema") or {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}
    if not isinstance(system, str) or messages is None or not isinstance(schema, dict):
        return respond(400, {"error": "system(문자열), messages(마지막은 user) 또는 prompt, schema(객체) 가 필요해요"})
    max_tokens = max(256, min(int(req.get("maxTokens") or 4000), MAX_TOKENS_LIMIT))

    # 구조화 응답: 도구 하나(answer)를 만들고 반드시 그 도구로 답하게 해서, 입력값(JSON)을 결과로 쓴다
    try:
        response = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": system}],
            messages=messages,
            inferenceConfig={"maxTokens": max_tokens},
            toolConfig={
                "tools": [{"toolSpec": {
                    "name": TOOL_NAME,
                    "description": "결과를 이 형식(JSON)으로 제출한다. 모든 칸을 빠짐없이 쓰고, 해당 없는 칸은 null 로 쓴다. 배열·객체를 문자열로 감싸지 않는다.",
                    "inputSchema": {"json": schema},
                }}],
                "toolChoice": {"tool": {"name": TOOL_NAME}},
            },
        )
    except Exception as err:  # Bedrock 오류 (권한, 모델 접근, 한도 등)
        print("[bedrock] 호출 실패:", type(err).__name__, str(err)[:500])
        return respond(502, {"error": f"bedrock: {type(err).__name__}"})

    output = None
    for block in response["output"]["message"]["content"]:
        if "toolUse" in block:
            output = block["toolUse"]["input"]
            break
    usage = response.get("usage", {})
    return respond(200, {
        "output": output,
        "stopReason": response.get("stopReason"),
        "model": MODEL_ID,
        "usage": {
            "input": usage.get("inputTokens", 0),
            "output": usage.get("outputTokens", 0),
            "cacheRead": usage.get("cacheReadInputTokens", 0),
        },
    })
