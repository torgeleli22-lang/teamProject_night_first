"""jojo_api 기능 파일의 규칙 부분: 예시 코드(samples), 주제 판정(topics), 코드 검사(practice), 민감 정보·함수 찾기(inspect_code),
규칙 첨삭(review), 관리자 코드(admin), 경로 표(lambda_function)"""
import unittest

from helpers import common, load_lambda

samples = load_lambda("samples")
topics = load_lambda("topics")
practice = load_lambda("practice")
inspect_code = load_lambda("inspect_code")
review = load_lambda("review")
tutor = load_lambda("tutor_chat")
study = load_lambda("study")
admin = load_lambda("admin")


class Samples(unittest.TestCase):
    def test_every_level_has_samples_with_valid_marks(self):
        self.assertEqual({s["level"] for s in samples.SAMPLES}, {1, 2, 3, 4})
        for s in samples.SAMPLES:
            compile(s["code"], s["id"], "exec")
            marks = common.clean_marks(s["code"], s["marks"], limit=5)
            self.assertEqual(len(marks), len(s["marks"]), s["id"])   # 겹치거나 범위를 벗어난 ※ 지점이 없다
            for m in s["marks"]:
                self.assertTrue(m["explanation"] and m["keywords"], s["id"])

    def test_mock_ai_round_trip_finds_same_lines(self):
        # 목업 AI 응답(줄 글자) → check_generated 가 원래 줄 번호를 다시 찾는다
        for s in samples.SAMPLES:
            code, marks, problems = practice.check_generated(practice.sample_as_ai(s), s["level"])
            self.assertEqual(problems, [], s["id"])
            self.assertEqual([(m["start"], m["end"]) for m in marks], [(m["start"], m["end"]) for m in s["marks"]], s["id"])


class GeneratedCode(unittest.TestCase):
    def test_advanced_level_needs_length(self):
        short = next(s for s in samples.SAMPLES if s["level"] == 3)
        _, _, problems = practice.check_generated(practice.sample_as_ai(short), 4)
        self.assertTrue(any("고급으로는 너무 짧아요" in p for p in problems))
        long = next(s for s in samples.SAMPLES if s["level"] == 4)
        _, marks, problems = practice.check_generated(practice.sample_as_ai(long), 4)
        self.assertEqual((problems, len(marks)), ([], 5))

    def test_syntax_error_and_missing_marks(self):
        r = {"title": "t", "code": "if x\n    print(1)", "marks": [{"startLine": "없는 줄", "endLine": "없는 줄"}]}
        _, _, problems = practice.check_generated(r, 1)
        self.assertTrue(any("문법" in p for p in problems))
        self.assertTrue(any("※" in p for p in problems))

    def test_find_line_prefers_hint_for_repeated_lines(self):
        lines = ["a = 1", "print(a)", "a = 2", "print(a)"]
        self.assertEqual(practice.find_line(lines, "print(a)", 0), 2)
        self.assertEqual(practice.find_line(lines, "print(a)", 0, hint=4), 4)
        self.assertIsNone(practice.find_line(lines, "없음", 0))


class TopicRules(unittest.TestCase):
    def test_rule_verdicts(self):
        self.assertEqual(topics.rule_check("해킹 도구", 1)["verdict"], "inappropriate")
        self.assertEqual(topics.rule_check("아무거나", 1)["verdict"], "vague")
        self.assertEqual(len(topics.rule_check("아무거나", 1)["suggestions"]), 3)
        self.assertEqual(topics.rule_check("쇼핑몰 만들기", 1)["verdict"], "too_big")
        self.assertEqual(topics.rule_check("주차 요금 계산", 2), {"verdict": "ok", "topic": "주차 요금 계산", "suggestions": [],
                                                              "message": topics.rule_check("주차 요금 계산", 2)["message"]})


class TopicLength(unittest.TestCase):
    def test_long_suggestions_cut_at_word(self):
        long = "날씨 관측소 네트워크에서 가장 빠른 정보 전달 경로 구하기 그리고 각 관측소의 기온 변화를 시간대별로 정리하기"
        short = topics.short_topic(long)
        self.assertLessEqual(len(short), topics.MAX_TOPIC_CHARS)
        self.assertTrue(short.endswith("…"))
        self.assertTrue(long.startswith(short[:-1]))
        self.assertEqual(topics.short_topic("  시간대별   기온 변화 "), "시간대별 기온 변화")


class Inspect(unittest.TestCase):
    def test_mask_secrets_keeps_code_shape(self):
        code = 'API_KEY = "abcd1234efgh"\nkey = "AKIA' + "A" * 16 + '"\nname = "민지"'
        masked, found = inspect_code.mask_secrets(code)
        self.assertEqual(masked.split("\n")[0], 'API_KEY = "********"')
        self.assertNotIn("AKIA", masked)
        self.assertIn('name = "민지"', masked)
        self.assertEqual([f["line"] for f in found], [1, 2])

    def test_find_functions_with_methods(self):
        code = "class Shop:\n    def sell(self, n):\n        return n\n\n    def stock(self):\n        pass\n\ndef main():\n    s = Shop()\n    s.sell(1)\nmain()"
        found = inspect_code.find_functions(code)
        self.assertEqual([(f["name"], f["start"], f["end"]) for f in found], [("Shop.sell", 2, 3), ("Shop.stock", 5, 6), ("main", 8, 10)])

    def test_read_code_limits(self):
        with self.assertRaises(common.ApiError):
            inspect_code.read_code({"code": "print(1)", "filename": "app.js"})
        with self.assertRaises(common.ApiError):
            inspect_code.read_code({"code": "x = 1\n" * (common.MAX_CODE_LINES + 1), "filename": "a.py"})
        self.assertEqual(inspect_code.read_code({"code": "x = 1", "filename": "a.py"}), ("x = 1", "python"))


class RuleReview(unittest.TestCase):
    ITEM = {"id": "r1", "code": "\n".join(f"line{i}" for i in range(1, 21)), "marks": [
        {"id": "m1", "start": 2, "end": 4, "why": "w", "explanation": "모범1", "keywords": ["하나씩", "더해"]},
        {"id": "m2", "start": 10, "end": 12, "why": "w", "explanation": "모범2", "keywords": ["할인"]},
    ]}

    def test_counts_and_missing(self):
        memos = [{"start": 2, "end": 3, "text": "메뉴를 하나씩 꺼내서 가격을 더해요"}, {"start": 15, "end": 16, "text": "몰라"}]
        missing = [m for m in self.ITEM["marks"] if not any(review.overlaps(x, m) for x in memos)]
        graded = review.rule_review(self.ITEM, memos, missing)
        result = review.build_result(self.ITEM, memos, missing, graded, False)
        self.assertEqual(result["counts"], {"correct": 1, "partial": 0, "wrong": 1, "missing": 1})
        self.assertEqual([e["kind"] for e in result["items"]], ["memo", "missing", "memo"])   # 코드 위치 순서
        self.assertEqual(result["items"][1]["model"], "모범2")

    def test_retry_uses_same_rules_on_one_memo(self):
        better = review.rule_retry(self.ITEM, {"start": 10, "end": 12, "text": "할인을 적용해요"})
        self.assertEqual(better["mark"], "correct")
        self.assertEqual(review.rule_retry(self.ITEM, {"start": 10, "end": 12, "text": "몰라"})["mark"], "wrong")
        prompt = review.build_retry_prompt(self.ITEM, {"start": 10, "end": 12, "marked": True, "memo": "", "mark": "missing",
                                                       "comment": "조건을 봐요", "model": "모범2"}, [], "할인을 적용해요")
        self.assertIn("(처음에는 메모가 없었음)", prompt)
        self.assertIn("<memo>할인을 적용해요</memo>", prompt)

    def test_review_keys(self):
        rv = {"sk": "REVIEW#0000000001"}
        self.assertEqual(common.review_key(rv, "RETRY", 2), "RETRY#0000000001#002")

    def test_read_memos_drops_empty_and_sorts(self):
        memos = review.read_memos({"memos": [{"start": 9, "end": 5, "text": " 뒤 "}, {"start": 1, "end": 1, "text": "  "}]}, self.ITEM["code"])
        self.assertEqual(memos, [{"start": 5, "end": 9, "text": "뒤"}])


class Tutor(unittest.TestCase):
    ENTRY = {"start": 6, "end": 8, "marked": True, "memo": "재고를 봐요", "mark": "partial", "comment": "조건을 다시 봐요.",
             "lookAt": [6], "model": "먼저 책이 있는지 확인해요."}

    def test_rule_answers_go_deeper_each_turn(self):
        first, second, third = (tutor.rule_answer(self.ENTRY, "왜요?", n)["reply"] for n in range(3))
        self.assertIn("6번", first)
        self.assertIn("예시 값", second)
        self.assertIn("먼저 책이 있는지", third)

    def test_system_prompt_has_code_and_item(self):
        text = tutor.build_system({"code": "a = 1\nprint(a)"}, self.ENTRY)
        self.assertIn("  1| a = 1", text)
        self.assertIn("6~8번 줄 (※ 꼭 설명할 곳)", text)
        self.assertIn("△ 부분", text)

    def test_chat_key_follows_review(self):
        self.assertEqual(tutor.chat_key({"sk": "REVIEW#0000000001"}, 3), "CHAT#0000000001#003")


class Concepts(unittest.TestCase):
    CODE = "\n".join([
        "def total(xs):",            # 1
        "    s = 0",                 # 2
        "    for x in xs:",          # 3
        "        s += x",            # 4
        "    return s",              # 5
        "def fact(n):",              # 6
        "    if n <= 1:",            # 7
        "        return 1",          # 8
        "    return n * fact(n - 1)",  # 9
        "print(total([1, 2]))",      # 10
        "try:",                      # 11
        "    raise ValueError()",    # 12
        "except ValueError:",        # 13
        "    pass",                  # 14
    ])

    def test_guess_concept_rules(self):
        self.assertEqual(common.guess_concept(self.CODE, 3, 4), "loop_update")
        self.assertEqual(common.guess_concept(self.CODE, 9, 9), "recursion")
        self.assertEqual(common.guess_concept(self.CODE, 7, 8), "branch")
        self.assertEqual(common.guess_concept(self.CODE, 10, 10), "call_flow")   # 맨 바깥에서 부르면 재귀가 아님
        self.assertEqual(common.guess_concept(self.CODE, 11, 14), "exception")

    def test_every_sample_mark_has_valid_concept(self):
        for s in samples.SAMPLES:
            for m in s["marks"]:
                self.assertIn(m["concept"], common.CONCEPTS, s["id"])

    def test_clean_marks_keeps_or_guesses_concept(self):
        marks = common.clean_marks(self.CODE, [{"start": 3, "end": 4, "concept": "algorithm"}, {"start": 7, "end": 8, "concept": "모름"}])
        self.assertEqual([m["concept"] for m in marks], ["algorithm", "branch"])


def study_row(level, marks, source="practice", at=0):
    items = [{"concept": c, "first": f, "best": b, "marked": True, "start": 1, "end": 2, "memo": "설명", "bestText": "설명", "snippet": None}
             for c, f, b in marks]
    return {"readingId": f"r{at}", "source": source, "level": level, "title": "t", "counts": {}, "items": items, "reviewedAt": at}


class KeepTime(unittest.TestCase):
    def test_anonymous_is_short_member_is_long(self):
        anon, member = {"member": False}, {"member": True}
        self.assertEqual(common.keep_seconds(anon, "learner"), common.ANON_HOURS * 3600)
        self.assertEqual(common.keep_seconds(anon, "study"), common.ANON_READING_HOURS * 3600)
        self.assertEqual(common.keep_seconds(member, "study"), common.MEMBER_DAYS * 86400)
        self.assertEqual(common.keep_seconds(member, "upload"), common.UPLOAD_KEEP_DAYS * 86400)   # 올린 코드는 로그인해도 짧게


class Study(unittest.TestCase):
    def test_level_up_down_and_waiting(self):
        good = [study_row(2, [("branch", "correct", "correct")] * 5, at=i) for i in range(3)]
        self.assertEqual(study.recommend_levels(good, 2)["advice"], "up")
        self.assertEqual(study.recommend_levels(good, 2)["suggested"], 3)
        bad = [study_row(3, [("branch", "wrong", "wrong")] * 4, at=i) for i in range(3)]
        self.assertEqual(study.recommend_levels(bad, 3)["advice"], "down")
        self.assertEqual(study.recommend_levels(good[:2], 2)["advice"], "none")
        top = [study_row(4, [("algorithm", "correct", "correct")] * 4, at=i) for i in range(3)]
        self.assertEqual(study.recommend_levels(top, 4)["suggested"], 4)   # 고급보다 위는 없음

    def test_concept_map_finds_weakest_and_improvement(self):
        rows = [study_row(2, [("loop_update", "wrong", "correct"), ("loop_update", "partial", "partial"), ("branch", "correct", "correct"),
                              ("branch", "correct", "correct"), ("recursion", "wrong", "wrong")])]
        m = study.concept_map(rows)
        loop = next(c for c in m["items"] if c["concept"] == "loop_update")
        self.assertEqual((loop["count"], loop["correctRate"], loop["improved"]), (2, 0, 1))
        self.assertEqual(m["weakest"], "loop_update")   # recursion 은 한 번뿐이라 아직 판단하지 않음

    def test_notes_only_correct_explanations(self):
        rows = [study_row(1, [("branch", "wrong", "correct"), ("loop_update", "partial", "partial")])]
        notes = study.explanation_notes(rows)
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0]["improved"])
        self.assertEqual(notes[0]["conceptName"], "조건 분기")


class AdminCode(unittest.TestCase):
    def test_scrypt_round_trip(self):
        h = admin.hash_code("새 관리자 코드 123")
        self.assertTrue(h.startswith("scrypt$"))
        self.assertTrue(admin.code_matches("새 관리자 코드 123", h))
        self.assertFalse(admin.code_matches("틀린 코드 12345", h))


class AdminUsage(unittest.TestCase):
    def test_error_reasons_and_names(self):
        self.assertIn("권한", admin.reason("bedrock: AccessDeniedException"))
        self.assertIn("형식", admin.reason("could not parse response: x"))
        self.assertEqual(admin.reason("Python 문법 오류 (3번째 줄)"), "Python 문법 오류 (3번째 줄)")
        self.assertEqual(admin.task_name("review"), "빨간펜 첨삭")
        self.assertEqual(admin.task_name("tutor_chat"), "AI 튜터 대화")
        self.assertEqual(admin.task_name("learner_analysis"), "학습자 분석")
        self.assertEqual(admin.short_model("mock:us.anthropic.claude-haiku-4-5-20251001-v1:0"), "목업 · claude-haiku-4-5")


class Entry(unittest.TestCase):
    def test_every_path_has_a_feature(self):
        entry = load_lambda("lambda_function")
        self.assertEqual(set(entry.ROUTES), {
            "GET /health", "GET /topic/random", "POST /topic/check", "POST /practice", "POST /practice/adjust", "GET /reading",
            "POST /inspect", "POST /inspect/start", "POST /review", "POST /review/retry", "POST /tutor", "GET /study", "GET /admin/overview", "POST /admin/ai", "POST /admin/code"})


if __name__ == "__main__":
    unittest.main()
