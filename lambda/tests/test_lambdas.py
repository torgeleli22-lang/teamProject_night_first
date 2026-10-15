"""각 Lambda 의 규칙 부분: 채점(submit-answer), 문제 내기(questions), 관리자 코드(admin), 튜터 질문(tutor-chat)"""
import unittest

from helpers import SEED_ITEMS, SEED_QUESTIONS, common, load_lambda, seed_content

answers = load_lambda("submit-answer")
questions = load_lambda("questions")
admin = load_lambda("admin")
tutor = load_lambda("tutor-chat")

PRIVATE = {"answerIndex", "explanation", "keyPoint", "hints", "rows", "output", "accepted", "modelAnswer", "rubric", "misconceptions", "blankedCode", "watch"}


class Grading(unittest.TestCase):
    def test_output_compare(self):
        self.assertTrue(answers.same_output("[1, 2, 3]", "[1,2,3]"))
        self.assertTrue(answers.same_output('["a", "b"]', "['a', 'b']"))
        self.assertTrue(answers.same_output("합계: 3000;\n\n", "합계: 3000"))
        self.assertFalse(answers.same_output("3000", "300"))
        self.assertTrue(answers.same_value("민지님은 21살", "'민지님은 21살'"))
        self.assertTrue(answers.same_value('"민지님은 21살"', "'민지님은 21살'"))
        self.assertTrue(answers.same_value("[77,100,93,69]", "[77, 100, 93, 69]"))

    def test_trace_cells(self):
        q = SEED_QUESTIONS["cart-trace"]
        right = [r["value"] for r in q["rows"]]
        self.assertEqual(answers.grade_trace(q, right), [True] * len(right))
        self.assertFalse(all(answers.grade_trace(q, right[:-1] + ["틀림"])))

    def test_every_seed_model_answer_passes_its_rubric(self):
        for q in SEED_QUESTIONS.values():
            if q["type"] == "short_answer":
                self.assertEqual(answers.evaluate_short_answer(q, q["modelAnswer"])["verdict"], "correct", q["id"])

    def test_short_answer_rules(self):
        q = next(q for q in SEED_QUESTIONS.values() if q["type"] == "short_answer")
        self.assertEqual(answers.evaluate_short_answer(q, "몰라")["verdict"], "incorrect")
        self.assertEqual(answers.evaluate_short_answer(q, "몰라")["aiReasons"], [])
        self.assertIn("규칙으로 판단 어려움", answers.evaluate_short_answer(q, "이건 잘 모르겠는데 그냥 동작하는 것 같아요")["aiReasons"])

    def test_objective_grading_uses_original_index(self):
        for q in SEED_QUESTIONS.values():
            if q["type"] in ("multiple_choice", "fill_blank"):
                shown = common.display_choice_index(q, q["answerIndex"])
                answer = common.unshuffle_answer(q, {"type": q["type"], "index": shown})
                self.assertTrue(answers.grade_objective(q, answer), q["id"])
            if q["type"] == "predict_output":
                self.assertTrue(answers.grade_objective(q, {"type": "predict_output", "text": q["output"]}), q["id"])

    def test_rule_grade_objects(self):
        q = SEED_QUESTIONS["cart-trace"]
        item = SEED_ITEMS[q["codeItemId"]]
        r = answers.grade(q, item, None, 0, True)
        self.assertFalse(r["correct"])
        self.assertEqual(r["tutor"]["headline"], "정답과 해설")
        self.assertIn("실행 후", answers.describe_correct(q))


class PublicQuestions(unittest.TestCase):
    def test_answers_never_go_to_the_browser(self):
        for q in SEED_QUESTIONS.values():
            pub = questions.to_public(q, SEED_ITEMS[q["codeItemId"]])
            self.assertFalse(PRIVATE & set(pub), q["id"])
            if q["type"] == "trace":
                self.assertTrue(all("value" not in cell for cell in pub["trace"]))
            if q["type"] == "fill_blank":
                self.assertIn("____", pub["code"])

    def test_plan_code_lesson_in_stage_order(self):
        content = seed_content()
        opts = {"level": 2, "track": "code", "concept": "filter", "unit": None, "cert": None, "size": None, "exclude": [], "mode": "learn", "ids": []}
        plan = questions.plan_session(content, [], opts)
        order = ["overview", "trace", "key", "wrapup"]
        stages = [q["stage"] for q in plan["questions"] if q["codeItemId"] == plan["questions"][0]["codeItemId"]]
        self.assertEqual(stages, sorted(stages, key=order.index))
        self.assertEqual(plan["questions"][0]["stage"], "overview")

    def test_plan_theory_by_cert(self):
        content = seed_content()
        opts = {"level": 3, "track": "theory", "concept": "all", "unit": None, "cert": "SQLD", "size": None, "exclude": [], "mode": "learn", "ids": []}
        plan = questions.plan_session(content, [], opts)
        self.assertTrue(plan["questions"])
        self.assertTrue(all("sqld" in q["certs"] for q in plan["questions"]))

    def test_generation_decision(self):
        self.assertTrue(questions.decide_on_session("map", 3, 0, 0, 0)["generate"])
        self.assertFalse(questions.decide_on_session("map", 1, 0, 0, 0)["generate"])        # 범위 밖 난이도
        self.assertFalse(questions.decide_on_session("map", 3, 10, 5, 0)["generate"])       # 안 푼 문제 충분
        self.assertTrue(questions.decide_on_session("map", 3, 10, 1, 1).get("recordDemand"))  # 한 명만 소진 → 수요 기록
        self.assertEqual(questions.decide_on_session("map", 3, 10, 1, 2)["trigger"], "demand")


class AdminCode(unittest.TestCase):
    def test_reads_hash_made_by_previous_node_server(self):
        stored = "scrypt$00112233445566778899aabbccddeeff$7d106806dfc148cf6cbc2772538748d24d280b37abc41b9db230c56df36c0b9e"
        self.assertTrue(admin.code_matches("smoke-code-1234", stored))
        self.assertFalse(admin.code_matches("wrong", stored))

    def test_new_hash_round_trip(self):
        h = admin.hash_code("새 관리자 코드 123")
        self.assertTrue(h.startswith("scrypt$"))
        self.assertTrue(admin.code_matches("새 관리자 코드 123", h))

    def test_manual_reason(self):
        self.assertEqual(admin.manual_reason(None), "관리자 수동 생성")
        self.assertTrue(admin.manual_reason("가" * 80, "1/2").endswith("…"))


class TutorPrompt(unittest.TestCase):
    def test_first_message_has_problem_but_hides_answer_rule(self):
        q = SEED_QUESTIONS["cart-overview"]
        prompt = tutor.build_prompt(q, SEED_ITEMS[q["codeItemId"]], False, "2번 보기", "어디부터 봐요?", first=True)
        self.assertIn("<problem>", prompt)
        self.assertIn("정답을 직접 말하지 말고", prompt)
        self.assertIn("1) " + common.displayed_choices(q)[0], prompt)
        later = tutor.build_prompt(q, SEED_ITEMS[q["codeItemId"]], True, "", "그럼요?", first=False)
        self.assertNotIn("<problem>", later)


if __name__ == "__main__":
    unittest.main()
