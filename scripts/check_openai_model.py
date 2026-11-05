"""
OpenAI 모델을 검토 AI 로 쓸 수 있는지 확인 (Lambda 를 바꾸기 전에, CloudShell 에서):

  python3 scripts/check_openai_model.py                 # 쓸 수 있는 모델 이름 목록 (gpt 가 들어간 것)
  python3 scripts/check_openai_model.py <모델 이름>       # 그 모델로 검토와 같은 모양의 요청을 한 번

API 키는 숨김 입력(또는 환경 변수 OPENAI_API_KEY)으로 받고, 화면·파일에 남기지 않아요.
요청 모양은 lambda/shared/ai.py 의 _ask_openai 와 같아요: Chat Completions + 'answer' 함수를 꼭 쓰게(tool_choice) + max_completion_tokens.
짧은 코드 하나를 따라가 보게 해서, 이 모델이 (1) 있는지 (2) 함수 형식으로 답하는지 (3) 값을 맞게 따라가는지 (4) 시간·토큰을 보여 줘요. 표준 라이브러리만 써요.
"""
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.openai.com/v1"
CODE = """def total_price(prices):
    total = 0
    for price in prices:
        if price > 4000:
            total = total + price
    return total

print(total_price([3000, 4500, 5000]))"""
EXPECTED = "9500"
SCHEMA = {"type": "object", "required": ["loopCount", "output", "runnable", "explanation"], "properties": {
    "loopCount": {"type": "integer", "description": "for 반복이 실제로 돈 횟수"},
    "output": {"type": "array", "items": {"type": "string"}, "description": "출력되는 줄"},
    "runnable": {"type": "boolean", "description": "실제로 동작하는 코드면 true"},
    "explanation": {"type": "string", "description": "흐름을 2문장으로, 한국어 존댓말"}}}


def call(method, path, key, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except ValueError:
            return e.code, {}


def why(status, data):
    message = ((data or {}).get("error") or {}).get("message", "")[:200]
    hint = {401: "API 키가 틀렸어요", 403: "이 키(프로젝트)로는 이 모델을 쓸 수 없어요", 404: "그런 모델 이름이 없거나 이 계정에서 쓸 수 없어요",
            429: "사용 한도·결제(크레딧)를 확인해 주세요", 400: "요청 형식을 이 모델이 받지 않아요 (아래 메시지)"}.get(status, "")
    return f"HTTP {status} {hint} — {message}"


def main():
    key = os.environ.get("OPENAI_API_KEY") or getpass.getpass("OpenAI API 키 (입력해도 화면에 보이지 않아요): ")
    key = key.strip()
    if not key or not key.isascii():
        sys.exit("✗ API 키를 확인해 주세요 (한/영 키가 영문인지)")
    if len(sys.argv) < 2:
        status, data = call("GET", "/models", key)
        if status != 200:
            sys.exit("✗ 모델 목록을 받지 못했어요: " + why(status, data))
        names = sorted(m["id"] for m in data.get("data", []) if "gpt" in m["id"] or "luna" in m["id"])
        print("이 키로 쓸 수 있는 모델 (gpt·luna 가 들어간 것):\n  " + "\n  ".join(names or ["(없음)"]))
        print("\n다음: python3 scripts/check_openai_model.py <위 이름 중 하나>")
        return
    model = sys.argv[1].removeprefix("openai:")

    # 1. 모델이 있는지
    status, data = call("GET", f"/models/{model}", key)
    print(f"1. 모델 '{model}': " + ("✓ 있어요" if status == 200 else "✗ " + why(status, data)))
    if status != 200:
        sys.exit(1)

    # 2~4. 검토와 같은 모양의 요청 한 번
    body = {"model": model, "max_completion_tokens": 4000,
            "messages": [{"role": "system", "content": "너는 코드를 실행하지 않고 실행하듯 따라가 검토하는 검토자야."},
                         {"role": "user", "content": f"<code>\n{CODE}\n</code>"}],
            "tools": [{"type": "function", "function": {"name": "answer", "description": "결과를 이 형식(JSON)으로 제출한다.", "parameters": SCHEMA}}],
            "tool_choice": {"type": "function", "function": {"name": "answer"}}}
    started = time.time()
    status, data = call("POST", "/chat/completions", key, body)
    sec = time.time() - started
    if status != 200:
        sys.exit("2. 검토 요청: ✗ " + why(status, data))
    choice = (data.get("choices") or [{}])[0]
    calls = (choice.get("message") or {}).get("tool_calls") or []
    if not calls:
        sys.exit(f"2. 검토 요청: ✗ 함수(answer) 형식으로 답하지 않았어요 (finish_reason={choice.get('finish_reason')})")
    try:
        answer = json.loads(calls[0]["function"]["arguments"])
    except (KeyError, ValueError):
        sys.exit("2. 검토 요청: ✗ 답의 JSON 을 읽지 못했어요")
    print("2. 함수 형식으로 답함: ✓")
    right = answer.get("loopCount") == 3 and [str(x).strip() for x in answer.get("output", [])] == [EXPECTED] and answer.get("runnable") is True
    print(f"3. 값 따라가기: {'✓ 맞음' if right else '✗ 다름'} (반복 {answer.get('loopCount')}번 · 출력 {answer.get('output')} · 동작 {answer.get('runnable')} — 정답: 3번 · ['9500'] · True)")
    print(f"   설명: {answer.get('explanation', '')}")
    usage = data.get("usage") or {}
    print(f"4. 시간 {sec:.1f}초 · 입력 {usage.get('prompt_tokens')} · 출력 {usage.get('completion_tokens')} 토큰"
          + (f" (그중 추론 {usage['completion_tokens_details'].get('reasoning_tokens')})" if usage.get("completion_tokens_details") else ""))
    print(f"\n✓ 검토 AI 로 쓸 수 있어요 → jojo_practice 환경 변수 REVIEW_MODEL_ID=openai:{model} (docs/DEPLOY_LAMBDA.md 3)")


if __name__ == "__main__":
    main()
