"""
내 컴퓨터에서 Lambda 3개를 실행하는 개발용 서버 (npm run api 가 실행한다. AWS 에는 올리지 않음).

- lambda/<함수>/lambda_function.py 를 주소 하나(http://localhost:8787)에서 함께 띄운다.
  요청 경로가 어느 함수의 ROUTES 에 있는지 보고, 실제 Lambda 와 같은 이벤트(함수 URL 형식)로 그 함수의 lambda_handler 를 부른다.
- DynamoDB 는 npm run api 가 띄운 로컬 흉내 서버(dynalite)를 쓴다 (DYNAMODB_ENDPOINT).
"""
import importlib.util
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMBDA_DIR = os.path.join(ROOT, "lambda")
FUNCTIONS = ["jojo_auth", "jojo_practice", "jojo_review"]
sys.path[:0] = [os.path.join(LAMBDA_DIR, "shared")] + [os.path.join(LAMBDA_DIR, f) for f in FUNCTIONS]


def load(name):
    """lambda/<name>/lambda_function.py (함수마다 파일 이름이 같아서 모듈 이름을 따로 준다)"""
    spec = importlib.util.spec_from_file_location(f"{name}_entry", os.path.join(LAMBDA_DIR, name, "lambda_function.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ENTRIES = {name: load(name) for name in FUNCTIONS}
# 경로 → 함수 (ROUTES 의 "POST /practice" 처럼). /health 는 모든 함수에 있어서 jojo_auth 로
PATHS = {key.split(" ", 1)[1]: name for name, m in ENTRIES.items() for key in m.ROUTES}
PATHS["/health"] = "jojo_auth"
NOT_FOUND = {"statusCode": 404, "headers": {"content-type": "application/json; charset=utf-8"}, "body": json.dumps({"error": "없는 API 예요."}, ensure_ascii=False)}
LOCK = threading.Lock()   # Lambda 처럼 요청을 하나씩


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("LOCAL_LOG") == "1":
            super().log_message(fmt, *args)

    def handle_any(self, method):
        url = urlsplit(self.path)
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        event = {"rawPath": url.path, "rawQueryString": url.query, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": raw,
                 "isBase64Encoded": False, "requestContext": {"http": {"method": method, "sourceIp": self.client_address[0]}}}
        name = PATHS.get(url.path.rstrip("/") or "/")
        with LOCK:
            res = ENTRIES[name].lambda_handler(event, None) if name else NOT_FOUND
        data = (res.get("body") or "").encode("utf-8")
        self.send_response(res["statusCode"])
        for k, v in (res.get("headers") or {}).items():
            self.send_header(k, v)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_OPTIONS(self):
        self.handle_any("OPTIONS")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Lambda 개발 서버: http://localhost:{port} (함수 {len(FUNCTIONS)}개: {', '.join(FUNCTIONS)} · AI_MODE={os.environ.get('AI_MODE', 'live')})", flush=True)
    server.serve_forever()
