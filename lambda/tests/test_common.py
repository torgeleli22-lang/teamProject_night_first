"""common.py: 숫자 변환·AI 응답 형식 검사·비용·읽을 코드 정리"""
import unittest
from decimal import Decimal

from helpers import common


class DynamoNumbers(unittest.TestCase):
    def test_decimal_round_trip(self):
        stored = common.to_db({"a": 0.5, "b": [1.25, {"c": 3}], "d": None})
        self.assertEqual(stored["a"], Decimal("0.5"))
        self.assertEqual(common.to_plain({"a": Decimal("2"), "b": [Decimal("1.5")]}), {"a": 2, "b": [1.5]})


class AiSchema(unittest.TestCase):
    SCHEMA = {"type": "object", "properties": {
        "items": {"type": "array", "items": {"type": "string"}},
        "n": {"type": "integer", "minimum": 1, "maximum": 5},
        "maybe": {"type": ["string", "null"]},
        "kind": {"type": "string", "enum": ["a", "b"]},
    }, "required": ["items", "n", "maybe", "kind"]}

    def test_repair_common_mistakes(self):
        fixed = common.repair_for_schema({"items": '["x", "y"]', "n": "3", "kind": "a"}, self.SCHEMA)
        self.assertEqual(fixed, {"items": ["x", "y"], "n": 3, "maybe": None, "kind": "a"})
        self.assertEqual(common.check_schema(fixed, self.SCHEMA), [])

    def test_reject_wrong_shapes(self):
        self.assertTrue(common.check_schema({"items": [], "n": 9, "maybe": None, "kind": "a"}, self.SCHEMA))
        self.assertTrue(common.check_schema({"items": [], "n": 1, "maybe": None, "kind": "z"}, self.SCHEMA))
        self.assertTrue(common.check_schema({"items": [], "n": 1, "kind": "a"}, self.SCHEMA))

    def test_build_messages_starts_with_user_and_merges(self):
        msgs = common.build_messages([{"role": "assistant", "text": "앞"}, {"role": "user", "text": "질문1"}, {"role": "user", "text": "질문2"}], "이번")
        self.assertEqual([m["role"] for m in msgs], ["user"])
        self.assertIn("질문2", msgs[0]["content"][0]["text"])
        self.assertTrue(msgs[0]["content"][0]["text"].endswith("이번"))


class Cost(unittest.TestCase):
    def test_model_names_and_price(self):
        self.assertEqual(common.normalize_model("us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5")
        self.assertEqual(common.normalize_model("mock:us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5")
        cost = common.estimate_cost([{"model": "us.anthropic.claude-haiku-4-5-20251001-v1:0", "input": 1_000_000, "output": 100_000, "cacheRead": 0}])
        self.assertAlmostEqual(cost, 1.5)


class CodeItems(unittest.TestCase):
    CODE = "\n".join(f"line{i}" for i in range(1, 21))

    def test_clean_marks_sorts_clamps_and_drops_overlaps(self):
        marks = common.clean_marks(self.CODE, [{"start": 10, "end": 30, "why": "b"}, {"start": 2, "end": 4, "why": "a"},
                                               {"start": 3, "end": 6, "why": "겹침"}, {"start": 0, "end": 1}])
        self.assertEqual([(m["id"], m["start"], m["end"]) for m in marks], [("m1", 1, 1), ("m2", 2, 4), ("m3", 10, 20)])

    def test_public_code_hides_model_explanation(self):
        item = {"codeId": "x", "source": "practice", "language": "python", "level": 2, "code": self.CODE, "regenCount": 2,
                "marks": [{"id": "m1", "start": 1, "end": 2, "why": "w", "explanation": "모범 설명", "keywords": ["k"]}]}
        pub = common.public_code(item)
        self.assertEqual(pub["marks"], [{"id": "m1", "start": 1, "end": 2}])
        self.assertNotIn("모범 설명", str(pub))
        self.assertEqual(pub["regenLeft"], common.REGEN_LIMIT - 2)
        self.assertEqual(pub["levelName"], "초급")

    def test_day_key_is_korea_time(self):
        self.assertEqual(common.day_key(1_700_000_000_000), "2023-11-15")


if __name__ == "__main__":
    unittest.main()
