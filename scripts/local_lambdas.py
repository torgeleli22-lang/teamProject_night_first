"""
내 컴퓨터에서 Lambda 를 실행하는 개발용 서버 (npm run api 가 실행한다. AWS 에는 올리지 않음).

- AWS 와 같은 함수 6개(lambda/functions/ 의 입구, 표는 lambda/functions.json)를 주소 하나에서 함께 띄운다.
  화면(src/lib/api-routes.ts)처럼 경로 앞부분으로 함수를 골라, 실제 Lambda 와 같은 이벤트(함수 URL 형식)로 lambda_handler 를 부른다.
- DynamoDB 는 npm run api 가 띄운 로컬 흉내 서버(dynalite)를 쓴다 (DYNAMODB_ENDPOINT).
"""
import importlib
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMBDA_DIR = os.path.join(ROOT, "lambda")
sys.path[:0] = [os.path.join(LAMBDA_DIR, "api"), os.path.join(LAMBDA_DIR, "functions")]

# 함수마다 (맡은 경로 앞부분, 입구 모듈)
FUNCTIONS = [(f["paths"], importlib.import_module(f["name"]))
             for f in json.load(open(os.path.join(LAMBDA_DIR, "functions.json"), encoding="utf-8"))["functions"]]
NOT_FOUND = {"statusCode": 404, "headers": {"content-type": "application/json; charset=utf-8"}, "body": json.dumps({"error": "없는 API 예요."}, ensure_ascii=False)}

# Lambda 는 한 실행 환경이 요청을 하나씩 처리한다 (Powertools 경로 처리기도 지금 요청을 기억한다). 여기서도 하나씩
LOCK = threading.Lock()


def function_for(path):
    path = path.rstrip("/") or "/"
    return next((module for paths, module in FUNCTIONS if any(path == p or path.startswith(p + "/") for p in paths)), None)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("LOCAL_LOG") == "1":
            super().log_message(fmt, *args)

    def handle_any(self, method):
        url = urlsplit(self.path)
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""

        # 화면의 요청 → 함수 URL 과 같은 모양의 이벤트 → 그 경로를 맡은 함수
        event = {
            "rawPath": url.path,
            "rawQueryString": url.query,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": raw,
            "isBase64Encoded": False,
            "requestContext": {"http": {"method": method, "sourceIp": self.client_address[0]}},
        }
        module = function_for(url.path)
        with LOCK:
            res = module.lambda_handler(event, None) if module else NOT_FOUND
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
    names = ", ".join(m.__name__ for _, m in FUNCTIONS)
    print(f"Lambda 개발 서버: http://localhost:{port} (함수 {len(FUNCTIONS)}개: {names} · AI_MODE={os.environ.get('AI_MODE', 'live')})", flush=True)
    server.serve_forever()
