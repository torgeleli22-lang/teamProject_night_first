"""공통 조각 core·ai·code_store: 숫자 변환·AI 답의 모양(Pydantic)·요청 본문·경로 처리(Powertools)·비용·읽을 코드 정리"""
import json
import unittest
import unittest.mock
from decimal import Decimal
from typing import Literal

from pydantic import Field

from helpers import ai, code_store, core


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
    """core.make_app · core.handle (Powertools 경로). 관리자처럼 확인 함수가 있는 경로는 요청 수 제한(DynamoDB)을 거치지 않아 여기서 시험한다"""

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
        cls.app = core.make_app(routes, guards={"/x": lambda req: None})

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


    def test_build_messages_starts_with_user_and_merges(self):
        msgs = ai.build_messages([{"role": "assistant", "text": "앞"}, {"role": "user", "text": "질문1"}, {"role": "user", "text": "질문2"}], "이번")
        self.assertEqual([m["role"] for m in msgs], ["user"])
        self.assertIn("질문2", msgs[0]["content"][0]["text"])
        self.assertTrue(msgs[0]["content"][0]["text"].endswith("이번"))


class Cost(unittest.TestCase):
    def test_model_names_and_price(self):
        self.assertEqual(ai.normalize_model("us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5")
        self.assertEqual(ai.normalize_model("mock:us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5")
        cost = ai.estimate_cost([{"model": "us.anthropic.claude-haiku-4-5-20251001-v1:0", "input": 1_000_000, "output": 100_000, "cacheRead": 0}])
        self.assertAlmostEqual(cost, 1.5)


class CodeItems(unittest.TestCase):
    CODE = "\n".join(f"line{i}" for i in range(1, 21))

    def test_clean_marks_sorts_clamps_and_drops_overlaps(self):
        marks = code_store.clean_marks(self.CODE, [{"start": 10, "end": 30, "why": "b"}, {"start": 2, "end": 4, "why": "a"},
                                               {"start": 3, "end": 6, "why": "겹침"}, {"start": 0, "end": 1}])
        self.assertEqual([(m["id"], m["start"], m["end"]) for m in marks], [("m1", 1, 1), ("m2", 2, 4), ("m3", 10, 20)])

    def test_public_code_hides_model_explanation(self):
        item = {"codeId": "x", "source": "practice", "language": "python", "level": 2, "code": self.CODE, "regenCount": 2,
                "marks": [{"id": "m1", "start": 1, "end": 2, "why": "w", "explanation": "모범 설명", "keywords": ["k"]}]}
        pub = code_store.public_code(item)
        self.assertEqual(pub["marks"], [{"id": "m1", "start": 1, "end": 2}])
        self.assertNotIn("모범 설명", str(pub))
        self.assertEqual(pub["regenLeft"], core.REGEN_LIMIT - 2)
        self.assertEqual(pub["levelName"], "초급")

    def test_day_key_is_korea_time(self):
        self.assertEqual(core.day_key(1_700_000_000_000), "2023-11-15")


if __name__ == "__main__":
    unittest.main()
