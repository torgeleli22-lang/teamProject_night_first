"""
내 컴퓨터에서 Lambda 를 실행하는 개발용 서버 (npm run api 가 실행한다. AWS 에는 올리지 않음).

- 화면의 요청을 실제 Lambda 와 같은 이벤트(함수 URL 형식)로 바꿔 lambda/api/lambda_function.py 의 lambda_handler 를 부른다.
- Lambda 가 '기다리지 않고' 부르는 요청(boto3 lambda.invoke)도 받아서 뒤에서 실행한다
  (jojo_api 자기 자신 → 같은 lambda_handler, jojo_generate_code → node 로 lambda/generate-code/index.mjs).
- DynamoDB 는 npm run api 가 띄운 로컬 흉내 서버(dynalite)를 쓴다 (DYNAMODB_ENDPOINT).
"""
import json
import os
import subprocess
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "lambda", "api")
sys.path.insert(0, API_DIR)

import lambda_function  # noqa: E402  (lambda/api 의 진입 파일)
from common import GENERATE_CODE_FUNCTION  # noqa: E402

SELF = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "jojo_api")
pending = {"n": 0}   # 뒤에서 실행 중인 일 수 (스모크 테스트가 끝날 때까지 기다릴 수 있게)


def run_background(name, payload):
    pending["n"] += 1
    try:
        if name == GENERATE_CODE_FUNCTION:
            script = "import(process.argv[1]).then((m) => m.handler(JSON.parse(process.argv[2]))).then((r) => console.log(JSON.stringify(r)))"
            entry = "file://" + os.path.join(ROOT, "lambda", "generate-code", "index.mjs")
            done = subprocess.run(["node", "-e", script, entry, json.dumps(payload)], capture_output=True, text=True)
            print(f"[generate-code] {done.stdout.strip()[:300] if done.returncode == 0 else '실패:' + chr(10) + done.stderr}", flush=True)
        else:
            result = lambda_function.lambda_handler(payload, None)
            print(f"[{payload.get('task')}] {json.dumps(result, ensure_ascii=False)[:300]}", flush=True)
    except Exception:
        traceback.print_exc()
    finally:
        pending["n"] -= 1


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("LOCAL_LOG") == "1":
            super().log_message(fmt, *args)

    def handle_any(self, method):
        url = urlsplit(self.path)
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""

        # 1. Lambda 가 다른 Lambda(또는 자기 자신)를 부르는 요청 (boto3 → LAMBDA_ENDPOINT)
        if url.path.startswith("/2015-03-31/functions/"):
            name = url.path.split("/")[3]
            if name not in (SELF, GENERATE_CODE_FUNCTION):
                return self.send(404, {"error": f"없는 함수: {name}"})
            threading.Thread(target=run_background, args=(name, json.loads(raw or "{}")), daemon=True).start()
            return self.send(202, None)

        # 2. 개발용: 뒤에서 실행 중인 일 수
        if url.path == "/__local/pending":
            return self.send(200, {"pending": pending["n"]})

        # 3. 화면의 요청 → 함수 URL 과 같은 모양의 이벤트
        event = {
            "rawPath": url.path,
            "rawQueryString": url.query,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": raw,
            "isBase64Encoded": False,
            "requestContext": {"http": {"method": method, "sourceIp": self.client_address[0]}},
        }
        res = lambda_function.lambda_handler(event, None)
        data = (res.get("body") or "").encode("utf-8")
        self.send_response(res["statusCode"])
        for k, v in (res.get("headers") or {}).items():
            self.send_header(k, v)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send(self, status, data):
        body = b"" if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_OPTIONS(self):
        self.handle_any("OPTIONS")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    # 기본 문제 넣기 (콘솔의 {"task": "load-content"} 테스트와 같음)
    print("[load-content]", lambda_function.lambda_handler({"task": "load-content"}, None), flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Lambda 개발 서버: http://localhost:{port} (AI_MODE={os.environ.get('AI_MODE', 'live')})", flush=True)
    server.serve_forever()
