"""공통 조각 core·ai: 숫자 변환·AI 답의 모양(Pydantic)·요청 본문·경로 처리(Powertools)·비용·화면용 코드·시간순 id·보관 기간"""
import json
import unittest
import unittest.mock
from decimal import Decimal
from typing import Literal

from pydantic import Field

from helpers import ai, core


class DynamoNumbers(unittest.TestCase):
    def test_decimal_round_trip(self):
        stored = core.to_db({"a": 0.5, "b": [1.25, {"c": 3}], "d": None})
        self.assertEqual(stored["a"], Decimal("0.5"))
        self.assertEqual(core.to_plain({"a": Decimal("2"), "b": [Decimal("1.5")]}), {"a": 2, "b": [1.5]})


class Kind(ai.AiAnswer):
    name: str


class Sample(ai.AiAnswer):
    items: list[str]
    n: int = Field(ge=1, le=5)
    maybe: str | None
    kind: Literal["a", "b"]
    parts: list[Kind] = []


class AiSchema(unittest.TestCase):
    def test_tool_schema_is_plain_json_schema(self):
        schema = ai.tool_schema(Sample)
        self.assertEqual(schema["properties"]["maybe"], {"type": ["string", "null"]})
        self.assertEqual(schema["properties"]["n"], {"type": "integer", "minimum": 1, "maximum": 5})
        self.assertEqual(schema["properties"]["parts"]["items"]["properties"], {"name": {"type": "string"}})   # $ref 를 펼침
        self.assertEqual(schema["required"], ["items", "n", "maybe", "kind"])
        self.assertNotIn("$defs", json.dumps(schema))
        self.assertNotIn("title", schema)

    def test_repair_common_mistakes(self):
        fixed, issues = ai.parse_answer({"items": '["x", "y"]', "n": "3", "kind": "a", "parts": ['{"name": "p"}'], "extra": 1}, Sample)
        self.assertEqual(issues, [])
        self.assertEqual(fixed, {"items": ["x", "y"], "n": 3, "maybe": None, "kind": "a", "parts": [{"name": "p"}], "extra": 1})

    def test_reject_wrong_shapes(self):
        self.assertTrue(ai.parse_answer({"items": [], "n": 9, "maybe": None, "kind": "a"}, Sample)[1])
        self.assertTrue(ai.parse_answer({"items": [], "n": 1, "maybe": None, "kind": "z"}, Sample)[1])
        self.assertTrue(ai.parse_answer({"n": 1, "maybe": None, "kind": "a"}, Sample)[1])
        self.assertTrue(ai.parse_answer({"items": [], "n": 1, "maybe": 3, "kind": "a"}, Sample)[1])


class AiRetry(unittest.TestCase):
    """형식이 어긋난 답: 다른 칸 안에 든 칸은 꺼내고, 그래도 틀리면 빠진 칸을 알려 주고 1번 더 묻는다"""

    class Check(ai.AiAnswer):
        trace: Kind
        codeProblems: list[str]

    def test_lifts_field_put_inside_another(self):
        fixed, issues = ai.parse_answer({"trace": {"name": "t", "codeProblems": ["x"]}}, self.Check)
        self.assertEqual((issues, fixed["codeProblems"]), ([], ["x"]))
        self.assertTrue(ai.parse_answer({"trace": {"codeProblems": []}}, Sample)[1])   # 꺼낼 게 없으면 그대로 오류

    def test_text_fields_take_numbers_and_objects(self):
        # v1.3.1: 실험에서 state·enter·branch 에 객체·숫자가 와서 답을 통째로 버렸어요 → 글자로 바꿔 받기
        class Step(ai.AiAnswer):
            fill_empty = ("enter",)
            state: str
            enter: str
            steps: list[str] = []
            count: int | None = None
        fixed, issues = ai.parse_answer({"state": {"total": 4500, "items": ["라떼", "우유"]}, "steps": [3, {"i": 1}], "count": 2}, Step)
        self.assertEqual(issues, [])
        self.assertEqual((fixed["state"], fixed["enter"], fixed["steps"], fixed["count"]), ("total=4500, items=라떼, 우유", "", ["3", "i=1"], 2))
        self.assertEqual(ai.parse_answer({"state": 7, "enter": True}, Step)[0]["enter"], "true")

    def test_asks_again_once_when_shape_is_wrong(self):
        answers = [{"trace": {"name": "t"}}, {"trace": {"name": "t"}, "codeProblems": []}]
        prompts = []

        class Client:
            def converse(self, **kw):
                prompts.append(kw["messages"][-1]["content"][0]["text"])
                return {"stopReason": "tool_use", "usage": {"inputTokens": 1, "outputTokens": 1},
                        "output": {"message": {"content": [{"toolUse": {"input": answers.pop(0)}}]}}}
        with unittest.mock.patch.object(ai, "AI_MODE", "live"), unittest.mock.patch.object(ai, "ai_enabled", lambda: True), \
                unittest.mock.patch.object(ai, "check_budget", lambda *a: None), unittest.mock.patch.object(ai, "log_usage", lambda *a, **k: None), \
                unittest.mock.patch.object(ai, "bedrock", lambda: Client()):
            got = ai.ask_ai("code_check", "s", "질문", self.Check)
        self.assertEqual(got["codeProblems"], [])
        self.assertEqual(len(prompts), 2)
        self.assertIn("codeProblems", prompts[1])   # 빠진 칸을 알려 준다

    def test_model_without_tool_choice_tool_is_asked_with_any(self):
        """검토 모델이 toolChoice.tool 을 받지 않으면 any 로 한 번 더, 출력 한도는 모델에 맞게"""
        from botocore.exceptions import ClientError
        sent = []

        class Client:
            def converse(self, **kw):
                sent.append((kw["modelId"], kw["toolConfig"]["toolChoice"], kw["inferenceConfig"]["maxTokens"]))
                if "tool" in kw["toolConfig"]["toolChoice"]:
                    raise ClientError({"Error": {"Code": "ValidationException", "Message": "This model doesn't support the toolConfig.toolChoice.tool field"}}, "Converse")
                return {"stopReason": "tool_use", "usage": {"inputTokens": 1, "outputTokens": 1},
                        "output": {"message": {"content": [{"toolUse": {"input": {"trace": {"name": "t"}, "codeProblems": []}}}]}}}
        with unittest.mock.patch.object(ai, "AI_MODE", "live"), unittest.mock.patch.object(ai, "ai_enabled", lambda: True), \
                unittest.mock.patch.object(ai, "check_budget", lambda *a: None), unittest.mock.patch.object(ai, "log_usage", lambda *a, **k: None), \
                unittest.mock.patch.object(ai, "bedrock", lambda: Client()):
            got = ai.ask_ai("code_review", "s", "질문", self.Check, max_tokens=12000, model="us.amazon.nova-pro-v1:0")
        self.assertEqual(got["codeProblems"], [])
        self.assertEqual(sent, [("us.amazon.nova-pro-v1:0", {"tool": {"name": "answer"}}, 12000), ("us.amazon.nova-pro-v1:0", {"any": {}}, 12000)])


class ModelQuirks(unittest.TestCase):
    """모델이 받지 않는 요청 설정이면 그 설정만 바꿔 다시 (Sonnet 5.5: toolChoice tool·any 를 받지 않음)"""

    def run_live(self, client, model, temperature=None):
        with unittest.mock.patch.object(ai, "AI_MODE", "live"), unittest.mock.patch.object(ai, "ai_enabled", lambda: True), \
                unittest.mock.patch.object(ai, "check_budget", lambda *a: None), unittest.mock.patch.object(ai, "log_usage", lambda *a, **k: None), \
                unittest.mock.patch.object(ai, "bedrock", lambda: client):
            return ai.ask_ai("code_generation", "시스템", "질문", AiRetry.Check, max_tokens=3000, model=model, temperature=temperature)

    def client(self, reject):
        from botocore.exceptions import ClientError
        sent = []
        class Client:
            def converse(self, **kw):
                choice = list(kw["toolConfig"]["toolChoice"])[0] if "toolConfig" in kw else "json"
                conf = kw["inferenceConfig"]
                sent.append((choice, "temperature" in conf, kw["system"][0]["text"]))
                for word, message in reject:
                    if (word == choice) or (word == "temperature" and "temperature" in conf):
                        raise ClientError({"Error": {"Code": "ValidationException", "Message": message}}, "Converse")
                answer = {"trace": {"name": "t"}, "codeProblems": []}
                if choice == "json":   # 도구 없이 글(JSON)로
                    return {"stopReason": "end_turn", "usage": {"inputTokens": 1, "outputTokens": 1}, "output": {"message": {"content": [{"text": json.dumps(answer)}]}}}
                return {"stopReason": "tool_use", "usage": {"inputTokens": 1, "outputTokens": 1},
                        "output": {"message": {"content": [{"toolUse": {"input": answer}}]}}}
        return Client(), sent

    def setUp(self):
        ai._quirks.clear()

    def test_tool_choice_falls_back_to_auto_and_is_remembered(self):
        msg = 'tool_choice: type "tool" and "any" are not supported for this model.'
        client, sent = self.client([("tool", msg), ("any", msg)])
        self.assertEqual(self.run_live(client, "us.anthropic.claude-sonnet-5-5")["codeProblems"], [])
        self.assertEqual([c for c, _, _ in sent], ["tool", "any", "auto"])
        self.assertIn("반드시 answer 도구", sent[-1][2])                      # auto 일 때는 도구로 답하라고 시스템에 덧붙임
        self.run_live(client, "us.anthropic.claude-sonnet-5-5")
        self.assertEqual([c for c, _, _ in sent[3:]], ["auto"])                # 다음부터는 바로 받아 준 설정으로

    def test_temperature_is_dropped_when_rejected(self):
        client, sent = self.client([("temperature", "temperature is not supported when thinking is enabled")])
        self.run_live(client, "m-temp", temperature=0.5)
        self.assertEqual([(c, t) for c, t, _ in sent], [("tool", True), ("tool", False)])

    def test_no_tool_at_all_falls_back_to_json_prompt(self):
        """도구 지정을 하나도 받지 않으면 마지막으로 도구 없이 프롬프트로 'JSON 모양으로만 답해'"""
        msg = "tool_choice is not supported for this model"
        client, sent = self.client([("tool", msg), ("any", msg), ("auto", msg)])
        self.assertEqual(self.run_live(client, "m-json")["codeProblems"], [])
        self.assertEqual([c for c, _, _ in sent], ["tool", "any", "auto", "json"])
        self.assertIn("JSON 스키마에 맞는 JSON 객체 하나로만", sent[-1][2])
        self.assertIn("codeProblems", sent[-1][2])                                # 답 모양(스키마)을 프롬프트에 넣음

    def test_auto_without_json_switches_to_json_prompt(self):
        """auto 로 글만 답하고 JSON 이 없으면, 다시 물을 때는 도구 없이 JSON 으로만 받기"""
        ai._quirks["m-auto"] = (ai.AUTO, False)
        replies = ["코드는 잘 동작해요.", '{"trace": {"name": "t"}, "codeProblems": []}']
        seen = []
        class Client:
            def converse(self, **kw):
                seen.append("toolConfig" in kw)
                return {"stopReason": "end_turn", "usage": {"inputTokens": 1, "outputTokens": 1}, "output": {"message": {"content": [{"text": replies.pop(0)}]}}}
        self.assertEqual(self.run_live(Client(), "m-auto")["codeProblems"], [])
        self.assertEqual(seen, [True, False])                                     # 첫 번째는 도구(auto), 두 번째는 도구 없이
        self.assertEqual(ai._quirks["m-auto"][0], ai.JSON_ONLY)

    def text_client(self, replies):
        """도구 없이 글로 답하는 모델 (replies 를 차례로)"""
        prompts = []
        class Client:
            def converse(self, **kw):
                prompts.append(kw["messages"][0]["content"][0]["text"])
                return {"stopReason": "end_turn", "usage": {"inputTokens": 1, "outputTokens": 1},
                        "output": {"message": {"content": [{"text": replies.pop(0)}]}}}
        return Client(), prompts

    def test_json_written_as_text_is_used(self):
        client, prompts = self.text_client(['결과예요.\n```json\n{"trace": {"name": "t"}, "codeProblems": []}\n```'])
        self.assertEqual(self.run_live(client, "m-text")["codeProblems"], [])
        self.assertEqual(len(prompts), 1)

    def test_text_without_json_is_asked_once_more(self):
        client, prompts = self.text_client(["코드는 잘 동작해요.", '{"trace": {"name": "t"}, "codeProblems": []}'])
        self.assertEqual(self.run_live(client, "m-text2")["codeProblems"], [])
        self.assertEqual(len(prompts), 2)
        self.assertIn("answer 도구를 호출해서 다시 제출", prompts[1])
        client, prompts = self.text_client(["글만", "또 글만"])
        with self.assertRaises(ai.AiUnavailable):
            self.run_live(client, "m-text3")
        self.assertEqual(len(prompts), 2)                                    # 다시 묻는 건 1번까지

    def test_other_validation_errors_are_not_retried(self):
        client, sent = self.client([("tool", "The provided model identifier is invalid.")] * 1)
        with self.assertRaises(ai.AiUnavailable):
            self.run_live(client, "bad-model")
        self.assertEqual(len(sent), 1)


class RequestBody(unittest.TestCase):
    class In(core.Body):
        level: int = Field(ge=1, le=4)
        topic: str = Field(max_length=5)
        tags: list[str] = []

    def test_strict_types_and_limits(self):
        read = lambda body: core.read_body({"body": body}, self.In)
        self.assertEqual(read({"level": 2, "topic": "abc", "other": 1}).model_dump(), {"level": 2, "topic": "abc", "tags": []})
        for bad in ({"level": "2", "topic": "a"}, {"level": True, "topic": "a"}, {"level": 5, "topic": "a"},
                    {"level": 1, "topic": "abcdef"}, {"level": 1}, {"level": 1, "topic": "a", "tags": [1]}):
            with self.assertRaises(core.ApiError) as e:
                read(bad)
            self.assertEqual(e.exception.status, 400, bad)


class Router(unittest.TestCase):
    """core.make_app · core.handle (Powertools 경로). 요청 수 제한(DynamoDB)은 늘 통과로 바꿔 둔다"""

    @classmethod
    def setUpClass(cls):
        def ok(req):
            return {"path": req["path"], "body": req["body"], "q": req["query"]}

        def boom(req):
            raise RuntimeError("bug")

        def refuse(req):
            raise core.ApiError(409, "안 돼요.")

        routes = {"GET /x/ok": ok, "POST /x/ok": ok, "GET /x/boom": boom, "GET /x/refuse": refuse,
                  "GET /x/go": lambda req: {"_redirect": "https://example.com/"}}
        cls.app = core.make_app(routes)
        cls.saved = core.hit_limit
        core.hit_limit = lambda *a: True

    @classmethod
    def tearDownClass(cls):
        core.hit_limit = cls.saved

    def call(self, event):
        res = core.handle(self.app, event, None)
        return res["statusCode"], {k.lower(): v for k, v in (res.get("headers") or {}).items()}, json.loads(res["body"]) if res.get("body") else None

    def url_event(self, method, path, body=None, headers=None, query=""):
        return {"rawPath": path, "rawQueryString": query, "headers": headers or {}, "body": body, "isBase64Encoded": False,
                "requestContext": {"http": {"method": method, "sourceIp": "1.2.3.4"}}}

    def test_routes_and_errors(self):
        self.assertEqual(self.call(self.url_event("GET", "/x/ok/", query="a=1%202")), (200, unittest.mock.ANY, {"path": "/x/ok", "body": {}, "q": {"a": "1 2"}}))
        self.assertEqual(self.call(self.url_event("POST", "/x/ok", body='{"n": 1}'))[2]["body"], {"n": 1})
        self.assertEqual(self.call(self.url_event("POST", "/x/ok", body="{깨짐"))[::2], (400, {"error": "잘못된 요청 형식이에요."}))
        self.assertEqual(self.call(self.url_event("GET", "/x/none"))[::2], (404, {"error": "없는 API 예요."}))
        self.assertEqual(self.call(self.url_event("GET", "/x/refuse"))[::2], (409, {"error": "안 돼요."}))
        with unittest.mock.patch.object(core.logger, "exception") as logged:   # 예상하지 못한 오류는 스택 전체를 로그에
            self.assertEqual(self.call(self.url_event("GET", "/x/boom"))[::2], (500, {"error": "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요."}))
        logged.assert_called_once()
        status, headers, _ = self.call(self.url_event("GET", "/x/go"))
        self.assertEqual((status, headers["location"]), (302, "https://example.com/"))

    def test_console_test_event(self):
        self.assertEqual(self.call({"path": "/x/ok", "method": "POST", "n": 1})[2]["body"], {"n": 1})
        self.assertEqual(self.call({"path": "/x/ok", "method": "GET"})[0], 200)

    def test_cors_preflight(self):
        status, headers, _ = self.call(self.url_event("OPTIONS", "/x/ok", headers={"origin": "http://localhost:3000"}))
        self.assertEqual(status, 204)
        self.assertIn("x-session-id", headers["access-control-allow-headers"])
        self.assertEqual(headers["access-control-expose-headers"], "x-session-id")


class Cost(unittest.TestCase):
    def test_model_names_and_price(self):
        self.assertEqual(ai.normalize_model("us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5")
        self.assertEqual(ai.normalize_model("mock:us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5")
        self.assertAlmostEqual(ai.cost_usd("us.anthropic.claude-haiku-4-5-20251001-v1:0", 1_000_000, 100_000), 1.5)
        self.assertEqual(ai.normalize_model("us.openai.gpt-5.6-luna"), "gpt-5.6-luna")
        self.assertAlmostEqual(ai.cost_usd("us.openai.gpt-5.6-luna", 1_000_000, 0), 5.0)   # 가격표에 없는 모델은 PRICE_UNKNOWN 으로 넉넉하게
        sonnet, haiku = "us.anthropic.claude-sonnet-5-5", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        self.assertEqual(ai.normalize_model(sonnet), "claude-sonnet-5-5")
        # 기본 모델: 생성 Sonnet 5.5 · 검토 1 Luna · 검토 2 초급 Haiku / 중급·고급 Sonnet 5.5 · 채점 Sonnet 5.5 (모두 환경 변수로 바꿀 수 있음)
        self.assertEqual((core.MODEL_ID, core.REVIEW_MODEL_ID, core.CHECK_MODEL_ID, core.CHECK_MODEL_ID_HIGH, core.GRADE_MODEL_ID),
                         (sonnet, "us.openai.gpt-5.6-luna", haiku, sonnet, sonnet))

    def test_models_come_from_environment(self):
        """환경 변수가 있으면 그 모델, 비어 있으면 기본값 (core 를 새 프로세스에서 읽어 확인)"""
        import os, subprocess, sys
        env = {**os.environ, "MODEL_ID": "m1", "REVIEW_MODEL_ID": "m2", "CHECK_MODEL_ID": "m3", "CHECK_MODEL_ID_HIGH": " ", "GRADE_MODEL_ID": "m5"}
        code = "import core; print(core.MODEL_ID, core.REVIEW_MODEL_ID, core.CHECK_MODEL_ID, core.CHECK_MODEL_ID_HIGH, core.GRADE_MODEL_ID)"
        out = subprocess.run([sys.executable, "-c", code], env=env, cwd=os.path.dirname(core.__file__), capture_output=True, text=True, check=True)
        self.assertEqual(out.stdout.split(), ["m1", "m2", "m3", "us.anthropic.claude-sonnet-5-5", "m5"])   # 빈 값은 기본값


class CodeItems(unittest.TestCase):
    def test_public_code_hides_review_record(self):
        item = {"codeId": "x", "language": "python", "level": 2, "code": "a = 1\nprint(a)", "title": "t", "topic": "주제",
                "units": [{"id": "u1", "start": 1, "end": 2, "key": True, "explanation": "모범 설명", "keywords": ["k"], "steps": ["1번 줄 a=1"]},
                          {"id": "u2", "start": 2, "end": 2, "key": False, "explanation": "다른 설명"}]}
        pub = core.public_code(item)
        self.assertEqual(pub["marks"], [{"id": "u1", "start": 1, "end": 2}])   # 설명할 곳(key)만, 줄 범위만
        self.assertNotIn("모범 설명", str(pub))
        self.assertNotIn("1번 줄 a=1", str(pub))
        self.assertEqual(pub["levelName"], "중급")
        self.assertEqual(core.public_code({**item, "level": 4})["levelName"], "고급")   # 예전 판(4단계) 코드도 열림


class TimeOrderedId(unittest.TestCase):
    def test_new_id_is_uuid7_sorted_by_time(self):
        import re
        import uuid
        early, late = core.new_id(ms=1_700_000_000_000), core.new_id(ms=1_800_000_000_000)
        for i in (early, late):
            self.assertEqual(uuid.UUID(i).version, 7)
            self.assertTrue(core.SESSION_ID.match(i))
            self.assertTrue(re.fullmatch(r"[0-9a-f-]{36}", i))
        self.assertLess(early, late)
        self.assertNotEqual(core.new_id(ms=1), core.new_id(ms=1))


class KeepTime(unittest.TestCase):
    def test_anonymous_is_short_member_is_long(self):
        self.assertEqual(core.keep_seconds({"member": False}, "user"), core.ANON_HOURS * 3600)
        self.assertEqual(core.keep_seconds({"member": False}, "code"), core.ANON_CODE_HOURS * 3600)
        self.assertEqual(core.keep_seconds({"member": True}, "code"), core.CODE_KEEP_DAYS * 86400)


class Admin(unittest.TestCase):
    def test_admin_token(self):
        req = lambda token: {"headers": {"x-admin-token": token} if token else {}, "ip": "t"}
        saved = core.hit_limit
        core.hit_limit = lambda *a: True
        try:
            with unittest.mock.patch.dict("os.environ", {"ADMIN_TOKEN": "right-code"}):
                self.assertTrue(core.is_admin(req("right-code")))
                self.assertFalse(core.is_admin(req(None)))          # 보내지 않으면 일반 요청
                with self.assertRaises(core.ApiError) as e:
                    core.is_admin(req("wrong"))
                self.assertEqual(e.exception.status, 403)
            with unittest.mock.patch.dict("os.environ", {"ADMIN_TOKEN": ""}), self.assertRaises(core.ApiError):
                core.is_admin(req("anything"))                      # 환경 변수가 없으면 아무 코드도 통과하지 않음
        finally:
            core.hit_limit = saved


if __name__ == "__main__":
    unittest.main()
