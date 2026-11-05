"""
검토 AI 로 쓸 모델을 Bedrock 에서 찾고 시험하기 (Lambda 를 바꾸기 전에, CloudShell 에서):

  python3 scripts/check_review_model.py                 # Bedrock(us-east-1)에서 OpenAI·GPT 모델 찾기 (모델 ID · 추론 프로필 ID)
  python3 scripts/check_review_model.py --all           # 텍스트 모델 전부
  python3 scripts/check_review_model.py <모델 ID>        # 그 모델로 검토와 같은 모양의 요청 한 번

요청 모양은 lambda/shared/ai.py 와 같아요: Converse + 'answer' 도구를 꼭 쓰게(toolChoice, 안 되면 any).
짧은 코드를 따라가 보게 해서 (1) 부를 수 있는지 (2) 도구 형식으로 답하는지 (3) 값을 맞게 따라가는지 (4) 시간·토큰을 보여 줘요.
CloudShell 의 boto3 를 써요 (키 필요 없음). 주의: CloudShell 은 내 IAM 권한, Lambda 는 실행 역할 SafeRole 권한이라 결과가 다를 수 있어요.
"""
import json
import os
import sys
import time

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
CODE = """def total_price(prices):
    total = 0
    for price in prices:
        if price > 4000:
            total = total + price
    return total

print(total_price([3000, 4500, 5000]))"""
SCHEMA = {"type": "object", "required": ["loopCount", "output", "runnable", "explanation"], "properties": {
    "loopCount": {"type": "integer", "description": "for 반복이 실제로 돈 횟수"},
    "output": {"type": "array", "items": {"type": "string"}, "description": "출력되는 줄"},
    "runnable": {"type": "boolean", "description": "실제로 동작하는 코드면 true"},
    "explanation": {"type": "string", "description": "흐름을 2문장으로, 한국어 존댓말"}}}
WORDS = ("openai", "gpt", "luna")


def find(show_all):
    bedrock = boto3.client("bedrock", region_name=REGION)
    models = bedrock.list_foundation_models(byOutputModality="TEXT")["modelSummaries"]
    pick = lambda text: show_all or any(w in text.lower() for w in WORDS)
    rows = [(m["modelId"], m.get("modelName", ""), ",".join(m.get("inferenceTypesSupported", []))) for m in models
            if pick(m["modelId"] + " " + m.get("modelName", "") + " " + m.get("providerName", ""))]
    print(f"Bedrock {REGION} 모델{'' if show_all else ' (openai·gpt·luna)'}:")
    for mid, name, kinds in sorted(rows):
        print(f"  {mid:55} {name:30} {kinds}")
    if not rows:
        print("  (없음 — --all 로 전체를 보거나 리전을 확인해 주세요: BEDROCK_REGION=us-west-2 python3 …)")
    try:
        profiles = bedrock.list_inference_profiles()["inferenceProfileSummaries"]
        rows = [(p["inferenceProfileId"], p.get("inferenceProfileName", "")) for p in profiles
                if show_all or any(w in (p["inferenceProfileId"] + p.get("inferenceProfileName", "")).lower() for w in WORDS)]
        if rows:
            print("\n추론 프로필 (모델 ID 대신 이것을 써야 하는 모델이 많아요 — 위에 INFERENCE_PROFILE 만 있으면 이쪽 ID):")
            for pid, name in sorted(rows):
                print(f"  {pid:55} {name}")
    except ClientError:
        pass
    print("\n다음: python3 scripts/check_review_model.py <모델 ID 또는 추론 프로필 ID>")


def test(model):
    client = boto3.client("bedrock-runtime", region_name=REGION)
    request = {"modelId": model, "system": [{"text": "너는 코드를 실행하지 않고 실행하듯 따라가 검토하는 검토자야."}],
               "messages": [{"role": "user", "content": [{"text": f"<code>\n{CODE}\n</code>"}]}],
               "inferenceConfig": {"maxTokens": 4000},
               "toolConfig": {"tools": [{"toolSpec": {"name": "answer", "description": "결과를 이 형식(JSON)으로 제출한다.", "inputSchema": {"json": SCHEMA}}}],
                              "toolChoice": {"tool": {"name": "answer"}}}}
    started = time.time()
    try:
        try:
            res = client.converse(**request)
            how = "toolChoice.tool"
        except ClientError as e:
            if e.response["Error"]["Code"] != "ValidationException" or "tool" not in str(e).lower():
                raise
            request["toolConfig"]["toolChoice"] = {"any": {}}
            res = client.converse(**request)
            how = "toolChoice.any (이 모델은 도구 하나 지정을 받지 않아 any 로 — 코드가 자동으로 이렇게 해요)"
    except ClientError as e:
        code, message = e.response["Error"]["Code"], e.response["Error"].get("Message", "")[:200]
        hint = {"AccessDeniedException": "모델 액세스가 없거나 권한이 없어요 — Bedrock 콘솔 → 모델 액세스에서 요청",
                "ValidationException": "모델 ID 가 틀렸거나, 추론 프로필 ID 로 불러야 하는 모델이에요 (목록의 추론 프로필 ID 로 다시)",
                "ResourceNotFoundException": "이 리전에 없는 모델이에요",
                "ThrottlingException": "요청 한도 — 잠시 뒤 다시"}.get(code, "")
        sys.exit(f"1. 부르기: ✗ {code} {hint}\n   {message}")
    sec = time.time() - started
    print(f"1. 부르기: ✓ ({how})")
    tool = next((c["toolUse"] for c in res["output"]["message"]["content"] if "toolUse" in c), None)
    if not tool:
        sys.exit(f"2. 도구 형식으로 답함: ✗ (stopReason={res.get('stopReason')})")
    answer = tool["input"]
    print("2. 도구 형식으로 답함: ✓")
    right = answer.get("loopCount") == 3 and [str(x).strip() for x in answer.get("output", [])] == ["9500"] and answer.get("runnable") is True
    print(f"3. 값 따라가기: {'✓ 맞음' if right else '✗ 다름'} (반복 {answer.get('loopCount')}번 · 출력 {answer.get('output')} · 동작 {answer.get('runnable')} — 정답: 3번 · ['9500'] · True)")
    print(f"   설명: {answer.get('explanation', '')}")
    usage = res.get("usage", {})
    print(f"4. 시간 {sec:.1f}초 · 입력 {usage.get('inputTokens')} · 출력 {usage.get('outputTokens')} 토큰")
    print(f"\n✓ 검토 AI 로 쓸 수 있어요 → jojo_practice 환경 변수 REVIEW_MODEL_ID={model} (docs/DEPLOY_LAMBDA.md 3)")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args == ["--all"]:
        find(show_all=bool(args))
    else:
        test(args[0])
