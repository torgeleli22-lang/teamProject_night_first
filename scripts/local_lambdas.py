"""
내 컴퓨터에서 Lambda 를 실행하는 개발용 서버 (npm run api 가 실행한다. AWS 에는 올리지 않음).

- 화면의 요청을 실제 Lambda 와 같은 이벤트(함수 URL 형식)로 바꿔 lambda/api/lambda_function.py 의 lambda_handler 를 부른다.
- DynamoDB 는 npm run api 가 띄운 로컬 흉내 서버(dynalite)를 쓴다 (DYNAMODB_ENDPOINT).
"""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "lambda", "api")
sys.path.insert(0, API_DIR)

import lambda_function  # noqa: E402  (lambda/api 의 진입 파일)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("LOCAL_LOG") == "1":
            super().log_message(fmt, *args)

    def handle_any(self, method):
        url = urlsplit(self.path)
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""

        # 화면의 요청 → 함수 URL 과 같은 모양의 이벤트
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

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_OPTIONS(self):
        self.handle_any("OPTIONS")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Lambda 개발 서버: http://localhost:{port} (AI_MODE={os.environ.get('AI_MODE', 'live')})", flush=True)
    server.serve_forever()
