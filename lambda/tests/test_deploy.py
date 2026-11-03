"""배포 명령 (scripts/deploy_lambdas.py) — AWS 없이 가짜 aws 로 흐름만 시험
- setup: 없는 함수를 만들고, 환경 변수는 함수마다 필요한 이름만 옮기고(비밀 값은 쓰는 함수에만), 함수 URL·공개 허용
- 화면(표준 출력)에 환경 변수 값·계정 번호를 찍지 않는다
- deploy: 같은 zip 이면 올리지 않고, 설정(제한 시간 등)을 맞춘다
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

from helpers import LAMBDA_DIR

sys.path.insert(0, os.path.join(os.path.dirname(LAMBDA_DIR), "scripts"))
import deploy_lambdas as deploy  # noqa: E402

SECRETS = {"ADMIN_TOKEN": "admin-secret-value", "GOOGLE_CLIENT_SECRET": "google-secret-value"}
ACCOUNT = "123456789012"


class FakeLambda:
    """aws CLI 대신: 함수 설정을 dict 로 기억한다"""

    def __init__(self):
        self.functions = {"jojo_api_py": {
            "Role": f"arn:aws:iam::{ACCOUNT}:role/SafeRole", "Runtime": "python3.14", "Handler": "lambda_function.lambda_handler",
            "Timeout": 600, "MemorySize": 512, "Architectures": ["arm64"], "CodeSha256": "old", "url": "https://legacy.example/",
            "Environment": {"Variables": {"TABLE_NAME": "jojo_table", "AI_MODE": "live", "ALLOWED_ORIGINS": "https://x.github.io",
                                          "RATE_LIMIT_PER_MINUTE": "600", "GOOGLE_CLIENT_ID": "gid", "GENERATE_CODE_FUNCTION": "old", **SECRETS}}}}
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args[:2])
        opt = lambda name: args[args.index(name) + 1] if name in args else None
        name, cmd = opt("--function-name"), args[1]
        env = lambda: json.load(open(opt("--environment")[7:]))["Variables"]
        if args[0] == "sts" or cmd == "wait":
            return {}
        if cmd == "create-function":
            self.functions[name] = {"Role": opt("--role"), "Runtime": opt("--runtime"), "Handler": opt("--handler"), "Timeout": int(opt("--timeout")),
                                    "MemorySize": int(opt("--memory-size")), "Architectures": [opt("--architectures")], "CodeSha256": "uploaded",
                                    "Environment": {"Variables": env()}, "url": None, "perms": set()}
            return {}
        f = self.functions.get(name)
        if f is None:
            raise deploy.AwsError(f"An error occurred (ResourceNotFoundException) when calling the Op operation: {name}")
        if cmd == "get-function-configuration":
            return {k: v for k, v in f.items() if k not in ("url", "perms")}
        if cmd == "get-function-url-config":
            if not f["url"]:
                raise deploy.AwsError("An error occurred (ResourceNotFoundException)")
            return {"FunctionUrl": f["url"]}
        if cmd == "create-function-url-config":
            f["url"] = f"https://{name}.example/"
            return {"FunctionUrl": f["url"]}
        if cmd == "add-permission":
            f.setdefault("perms", set()).add(opt("--statement-id"))
            return {}
        if cmd == "update-function-code":
            f["CodeSha256"] = "uploaded"
            return {}
        if cmd == "update-function-configuration":
            if opt("--environment"):
                f["Environment"] = {"Variables": env()}
            for o, k in (("--timeout", "Timeout"), ("--memory-size", "MemorySize")):
                if opt(o):
                    f[k] = int(opt(o))
            return {}
        raise AssertionError(args)


class Deploy(unittest.TestCase):
    def run_command(self, fake, argv):
        zip_file = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        zip_file.close()
        out = io.StringIO()
        with mock.patch.object(deploy, "aws", fake), mock.patch.object(deploy.pkg, "build", lambda f: (zip_file.name, "uploaded")), \
                mock.patch.object(deploy, "health", lambda url: "/health ✓"), contextlib.redirect_stdout(out):
            deploy.main(argv)
        os.remove(zip_file.name)
        return out.getvalue()

    def test_setup_then_deploy(self):
        fake = FakeLambda()
        printed = self.run_command(fake, ["setup"])
        made = fake.functions
        self.assertEqual(set(made), {"jojo_api_py", "jojo_auth", "jojo_practice", "jojo_inspect", "jojo_review", "jojo_study", "jojo_admin"})
        env = lambda n: made[n]["Environment"]["Variables"]
        # 비밀 값은 쓰는 함수에만, 예전 변수는 옮기지 않음, 공통 이름(RATE_LIMIT_* 포함)은 모두에
        self.assertEqual({n for n in made if "GOOGLE_CLIENT_SECRET" in env(n)}, {"jojo_api_py", "jojo_auth"})
        self.assertEqual({n for n in made if "ADMIN_TOKEN" in env(n)}, {"jojo_api_py", "jojo_admin"})
        self.assertFalse(any("GENERATE_CODE_FUNCTION" in env(n) for n in made if n != "jojo_api_py"))
        self.assertTrue(all(env(n)["RATE_LIMIT_PER_MINUTE"] == "600" and env(n)["TABLE_NAME"] == "jojo_table" for n in made))
        self.assertEqual((made["jojo_practice"]["Timeout"], made["jojo_auth"]["MemorySize"], made["jojo_study"]["Role"]),
                         (600, 256, made["jojo_api_py"]["Role"]))
        self.assertEqual(made["jojo_review"]["perms"], {"FunctionURLAllowPublicAccess", "FunctionURLAllowInvokeAction"})
        # 화면에는 이름만: 비밀 값·계정 번호가 찍히지 않음. 화면에 넣을 주소(JSON)와 Google 리디렉션 URI 를 알려 줌
        for secret in SECRETS.values():
            self.assertNotIn(secret, printed)
        self.assertNotIn(ACCOUNT, printed)
        urls = json.loads(next(line for line in printed.split("\n") if line.startswith("{")))
        self.assertEqual(urls["review"], "https://jojo_review.example")
        self.assertIn("https://jojo_auth.example/auth/callback/google", printed)

        # deploy: 같은 zip(CodeSha256 같음)은 올리지 않고, 다른 설정은 맞춘다
        made["jojo_study"]["Timeout"] = 3
        fake.calls.clear()
        printed = self.run_command(fake, ["deploy", "jojo_study", "jojo_api_py"])
        self.assertEqual(sum(c == ("lambda", "update-function-code") for c in fake.calls), 1)   # jojo_study 는 이미 같은 코드
        self.assertEqual(made["jojo_study"]["Timeout"], 30)
        self.assertIn("코드 그대로", printed)

    def test_setup_keeps_existing_values(self):
        fake = FakeLambda()
        self.run_command(fake, ["setup", "jojo_admin"])
        fake.functions["jojo_admin"]["Environment"]["Variables"]["AI_MODE"] = "off"   # 콘솔에서 바꾼 값
        self.run_command(fake, ["setup", "jojo_admin"])
        self.assertEqual(fake.functions["jojo_admin"]["Environment"]["Variables"]["AI_MODE"], "off")

    def test_errors_hide_account(self):
        self.assertEqual(deploy.hide(f"arn:aws:lambda:ap-northeast-2:{ACCOUNT}:function:x"), "arn:aws:lambda:ap-northeast-2:<계정>:function:x")
        self.assertEqual(deploy.AwsError("An error occurred (AccessDeniedException) when calling").code, "AccessDeniedException")


if __name__ == "__main__":
    unittest.main()
