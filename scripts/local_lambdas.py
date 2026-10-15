"""
내 컴퓨터에서 Lambda 들을 한 번에 실행하는 개발용 서버 (npm run api 가 실행한다. AWS 에는 올리지 않음).

- 화면이 부르는 경로(/session, /attempts, /me ...)를 실제 Lambda 와 같은 이벤트(함수 URL 형식)로 바꿔
  lambda/<기능>/lambda_function.py 의 lambda_handler 를 부른다.
- Lambda 가 다른 Lambda 를 '기다리지 않고' 부르는 요청(boto3 lambda.invoke)도 받아서 뒤에서 실행한다
  (generate-code 는 Node.js 라서 node 로 실행).
- DynamoDB 는 npm run api 가 띄운 로컬 흉내 서버(dynalite)를 쓴다 (DYNAMODB_ENDPOINT).
"""
import importlib.util
import json
import os
import subprocess
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMBDA_DIR = os.path.join(ROOT, "lambda")
sys.path.insert(0, os.path.join(LAMBDA_DIR, "common"))

# 경로 → 그 경로를 처리하는 Lambda 폴더 (src/lib/api.ts 의 ROUTES 와 같게)
ROUTES = {
    "/session": "questions", "/hint": "questions", "/concepts": "questions",
    "/attempts": "submit-answer", "/explain": "submit-answer",
    "/ask": "tutor-chat",
    "/health": "my-page", "/me": "my-page", "/learn": "my-page", "/review": "my-page", "/dashboard": "my-page", "/ranking": "my-page",
}

_modules = {}
_lock = threading.Lock()


def load(folder):
    """lambda/<folder>/lambda_function.py 를 불러온다 (폴더마다 이름이 같아서 따로 등록)"""
    with _lock:
        if folder not in _modules:
            path = os.path.join(LAMBDA_DIR, folder, "lambda_function.py")
            spec = importlib.util.spec_from_file_location(f"lambda_{folder.replace('-', '_')}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            _modules[folder] = module
        return _modules[folder]


def function_folder(name):
    """Lambda 함수 이름(common.FUNCTIONS 의 값) → 폴더"""
    import common
    for folder, fn in common.FUNCTIONS.items():
        if fn == name:
            return folder
    return None


# 뒤에서 실행 중인 작업 수 (스모크 테스트가 끝날 때까지 기다릴 수 있게)
pending = {"n": 0}


def run_background(folder, payload):
    pending["n"] += 1
    try:
        if folder == "generate-code":
            script = "import(process.argv[1]).then((m) => m.handler(JSON.parse(process.argv[2]))).then((r) => console.log(JSON.stringify(r)))"
            entry = "file://" + os.path.join(LAMBDA_DIR, "generate-code", "index.mjs")
            done = subprocess.run(["node", "-e", script, entry, json.dumps(payload)], capture_output=True, text=True)
            if done.returncode != 0:
                print(f"[{folder}] 실패:\n{done.stderr}", flush=True)
            else:
                print(f"[{folder}] {done.stdout.strip()[:300]}", flush=True)
        else:
            result = load(folder).lambda_handler(payload, None)
            print(f"[{folder}] {json.dumps(result, ensure_ascii=False)[:300]}", flush=True)
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

        # 1. Lambda 가 다른 Lambda 를 부르는 요청 (boto3 → LAMBDA_ENDPOINT)
        if url.path.startswith("/2015-03-31/functions/"):
            name = url.path.split("/")[3]
            folder = function_folder(name)
            if not folder:
                return self.send(404, {"error": f"없는 함수: {name}"})
            threading.Thread(target=run_background, args=(folder, json.loads(raw or "{}")), daemon=True).start()
            return self.send(202, None)

        # 2. 개발용: 뒤에서 실행 중인 작업 수
        if url.path == "/__local/pending":
            return self.send(200, {"pending": pending["n"]})

        # 3. 화면의 요청 → 경로에 맞는 Lambda
        path = url.path.rstrip("/") or "/"
        folder = "admin" if path.startswith("/admin") else ROUTES.get(path)
        if not folder:
            return self.send(404, {"error": "없는 API 예요."})
        event = {
            "rawPath": path,
            "rawQueryString": url.query,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": raw,
            "isBase64Encoded": False,
            "requestContext": {"http": {"method": method, "sourceIp": self.client_address[0]}},
        }
        res = load(folder).lambda_handler(event, None)
        body = res.get("body") or ""
        self.send_response(res["statusCode"])
        for k, v in (res.get("headers") or {}).items():
            self.send_header(k, v)
        data = body.encode("utf-8")
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
    # 문제 데이터 넣기 (load-content Lambda 를 한 번 실행)
    print("[load-content]", load("load-content").lambda_handler({}, None), flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Lambda 개발 서버: http://localhost:{port} (AI_MODE={os.environ.get('AI_MODE', 'live')})", flush=True)
    server.serve_forever()
