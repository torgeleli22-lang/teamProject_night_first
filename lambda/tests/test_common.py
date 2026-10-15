"""common.py: 보기 섞기·숫자 변환·AI 응답 형식 검사·통계 공식"""
import unittest
from decimal import Decimal

from helpers import common


def attempt(**kw):
    base = {"questionId": "q", "concepts": ["map"], "level": 2, "correct": True, "partial": False, "hintsUsed": 0,
            "timeMs": 1000, "misconception": None, "createdAt": 0, "questionType": "multiple_choice", "gradedBy": "rule"}
    return {**base, **kw}


class SeededPermutation(unittest.TestCase):
    def test_same_as_previous_node_server(self):
        # 예전 Node 서버(seededPermutation)가 만든 순서와 같아야 저장된 오답 노트·튜터의 보기 번호가 그대로 맞는다
        self.assertEqual(common.seeded_permutation(4, "cart-overview:choices"), [1, 3, 0, 2])
        self.assertEqual(common.seeded_permutation(4, "osi-routing:choices"), [3, 2, 0, 1])
        self.assertEqual(common.seeded_permutation(5, "x"), [0, 2, 4, 1, 3])
        self.assertEqual(common.seeded_permutation(3, "한글:choices"), [1, 0, 2])
        self.assertEqual(common.seeded_permutation(2, "a"), [1, 0])

    def test_unshuffle_round_trip(self):
        q = {"id": "t", "type": "multiple_choice", "choices": [{"text": c} for c in "abcd"], "answerIndex": 2}
        shown = common.displayed_choices(q)
        picked = shown.index("c")
        self.assertEqual(common.unshuffle_answer(q, {"type": "multiple_choice", "index": picked})["index"], 2)
        self.assertEqual(common.display_choice_index(q, 2), picked)
        self.assertEqual(common.unshuffle_answer(q, {"type": "multiple_choice", "index": 9})["index"], -1)


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


class Stats(unittest.TestCase):
    def test_xp_and_quality(self):
        self.assertEqual(common.xp_for_attempt(attempt(level=3)), 19)
        self.assertEqual(common.xp_for_attempt(attempt(hintsUsed=2, level=1)), 10)
        self.assertEqual(common.xp_for_attempt(attempt(correct=False, partial=True)), 6)
        self.assertEqual(common.xp_for_attempt(attempt(correct=False)), 2)
        self.assertEqual(common.attempt_quality(attempt(hintsUsed=4)), 0.4)

    def test_mastery_needs_three_attempts(self):
        stats = common.concept_stats([attempt(), attempt()])
        self.assertEqual(stats["map"]["mastery"], 67)
        stats = common.concept_stats([attempt(), attempt(), attempt(correct=False)])
        self.assertEqual(stats["map"]["mastery"], 67)
        self.assertEqual(stats["map"]["recentWrong"], 1)

    def test_levels_and_days(self):
        self.assertEqual(common.learner_level(0)["level"], 1)
        self.assertEqual(common.learner_level(100), {"level": 2, "current": 0, "needed": 200})
        self.assertEqual(common.day_key(1_700_000_000_000), "2023-11-15")   # 한국 시간 기준

    def test_suggest_level(self):
        self.assertEqual(common.suggest_level([attempt(level=2)] * 8, 2)["direction"], "up")
        self.assertEqual(common.suggest_level([attempt(level=2, correct=False)] * 8, 2)["direction"], "down")
        self.assertEqual(common.suggest_level([attempt(level=2)] * 3, 2)["direction"], "stay")

    def test_wrong_questions(self):
        rows = common.wrong_questions([attempt(questionId="a", correct=False, createdAt=1), attempt(questionId="a", createdAt=2),
                                       attempt(questionId="b", correct=False, createdAt=3, misconception="헷갈림")])
        self.assertEqual([r["questionId"] for r in rows], ["b"])
        self.assertEqual(rows[0]["misconception"], "헷갈림")


if __name__ == "__main__":
    unittest.main()
