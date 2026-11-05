"""jojo_practice: 규칙 검사 · 생성 → 검토 흐름 · 부분 수정 · 다시 만들기 · 예시 코드 · 저장하는 채점 기준 (docs/GENERATION_STANDARD.md)"""
import unittest
import unittest.mock

from helpers import FakeDb, core, request

import generate
import levels
import rules
import samples

CODE = """def total_price(prices):
    total = 0
    for price in prices:
        total = total + price
    return total

items = [3000, 3500, 5000]
print("합계:", total_price(items))"""


def unit(start, end, kind="block", key=False, line=None, **kw):
    lines = CODE.split("\n")
    return {"kind": kind, "startNo": start, "endNo": end, "startLine": line or lines[start - 1].strip(), "inputs": "prices=[3000, 3500, 5000]",
            "steps": ["4번 줄 total=3000"], "result": "11500 반환", "count": 3 if kind == "loop" else None, "stop": "prices 를 다 돌면" if kind == "loop" else "",
            "explanation": "가격 목록을 받아 하나씩 total 에 더하고, 다 더한 11500 을 돌려줘요.", "keywords": ["하나씩", "11500", "없는 말"], "key": key, **kw}


def review(units=None, runnable=True, problems=None, match=True, overall=1, advice=""):
    factors = [{"factor": f, "level": overall, "reason": "이유"} for f in levels.FACTORS]
    return {"units": units if units is not None else [unit(1, 5, "function", key=True), unit(3, 4, "loop")], "output": ["합계: 11500"],
            "runnable": runnable, "problems": problems or [], "level": {"factors": factors, "overall": overall, "match": match, "advice": advice}}


class Rules(unittest.TestCase):
    def test_no_bans_on_modules_random_time_input(self):
        code = "import random, os, time\nfrom datetime import datetime\nname = input()\nprint(random.randint(1, 6), datetime.now(), os.getcwd(), name)"
        self.assertEqual(rules.code_problems(code, "python"), [])
        self.assertEqual(rules.code_problems("const n = Math.floor(Math.random() * 6);\nconsole.log(n, Date.now());", "javascript"), [])

    def test_syntax_and_typos(self):
        self.assertIn("문법 오류", rules.code_problems("def f(:\n  pass", "python")[0])
        self.assertIn("totl", rules.code_problems("total = 0\nfor i in range(3):\n    total = totl + i\nprint(total)", "python")[0])
        self.assertIn("닫히지", rules.code_problems("function f() {\n  return 1;\n", "javascript")[0])
        self.assertEqual(rules.code_problems("", "python"), ["코드가 비어 있어요"])
        self.assertIn("너무 길어요", rules.code_problems("x = 1\n" * 301, "python")[0])

    def test_flow_points_and_coverage(self):
        points = rules.flow_points(CODE, "python")
        self.assertEqual([(p["kind"], p["start"], p["end"]) for p in points], [("function", 1, 5), ("loop", 3, 4)])
        js = rules.flow_points("function f(xs) {\n  for (const x of xs) {\n    console.log(x);\n  }\n}\nconst g = (n) => n * 2;\nf([1]);", "javascript")
        self.assertEqual([(p["kind"], p["start"]) for p in js], [("function", 1), ("loop", 2), ("function", 6)])
        self.assertEqual(rules.uncovered(points, [{"start": 1, "end": 2}]), [points[1]])   # 반복문 첫 줄(3)이 어느 단위에도 없음
        self.assertEqual(rules.uncovered(points, [{"start": 2, "end": 5}]), [])


class Units(unittest.TestCase):
    def test_clean_units_finds_lines_by_text_and_keeps_record(self):
        units = generate.clean_units(CODE, [unit(3, 4, "loop", startNo=9, endNo=10), unit(1, 5, "function", key=True), {**unit(7, 7), "explanation": ""}])
        self.assertEqual([(u["id"], u["start"], u["end"], u["kind"]) for u in units], [("u1", 1, 5, "function"), ("u2", 3, 4, "loop")])  # 번호를 잘못 세도 줄 글자로
        self.assertEqual(units[1]["count"], 3)
        self.assertEqual(units[0]["keywords"], ["하나씩", "11500"])   # 설명 안에 없는 핵심 표현은 뺀다
        self.assertEqual(units[0]["inputs"], "prices=[3000, 3500, 5000]")

    def test_pick_keys_no_overlap_and_fallback(self):
        units = generate.clean_units(CODE, [unit(1, 5, "function", key=True), unit(3, 4, "loop", key=True)])
        self.assertEqual([u["key"] for u in generate.pick_keys(units)], [True, False])   # 겹치면 바깥 것
        units = generate.clean_units(CODE, [unit(1, 5, "function"), unit(7, 8, "block")])
        self.assertEqual([u["key"] for u in generate.pick_keys(units)], [True, False])   # AI 가 고르지 않으면 함수·반복 단위

    def test_apply_edits(self):
        code = "a = 1\nb = 2\nc = 3\nprint(a + b + c)"
        self.assertEqual(generate.apply_edits(code, [{"startNo": 2, "endNo": 2, "code": "b = 20\nd = 4"}, {"startNo": 4, "endNo": 4, "code": "print(a)"}]),
                         "a = 1\nb = 20\nd = 4\nc = 3\nprint(a)")
        self.assertIsNone(generate.apply_edits(code, [{"startNo": 1, "endNo": 2, "code": "x"}, {"startNo": 2, "endNo": 3, "code": "y"}]))
        self.assertIsNone(generate.apply_edits(code, [{"startNo": 4, "endNo": 9, "code": "x"}]))

    def test_strip_fence(self):
        self.assertEqual(generate.strip_fence("```python\nprint(1)\n```"), "print(1)")


class Pipeline(unittest.TestCase):
    """생성 1번 + 검토 1번이 기본. ask_ai 를 가짜로 바꿔 차례로 답을 준다"""

    def run_with(self, codes, reviews, fixes=None, level=1):
        codes, reviews, fixes = list(codes), list(reviews), list(fixes or [])
        self.calls, self.prompts = [], {}

        self.models = {}

        def fake(task, system, prompt, schema, **kw):
            self.calls.append(task)
            self.models.setdefault(task, kw.get("model"))
            self.prompts.setdefault(task, []).append(system + "\n" + prompt)
            answer = {"code_generation": lambda: {"title": "가격 합계", "code": codes.pop(0)}, "code_review": lambda: reviews.pop(0),
                      "code_fix": lambda: {"edits": fixes.pop(0) if fixes else []}}[task]()
            if isinstance(answer, Exception):
                raise answer
            return answer
        saved = generate.ask_ai
        generate.ask_ai = fake
        try:
            self.log = {"attempts": []}
            return generate.make_code(level, "python", "카페 주문", self.log)
        finally:
            generate.ask_ai = saved

    def test_generate_then_review_saves_record_as_grading_standard(self):
        made = self.run_with([CODE], [review()])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review"]))
        loop = next(u for u in made["units"] if u["kind"] == "loop")
        self.assertEqual((loop["count"], loop["stop"], loop["steps"]), (3, "prices 를 다 돌면", ["4번 줄 total=3000"]))   # 검토의 실행 기록을 버리지 않음
        self.assertEqual(made["output"], ["합계: 11500"])
        self.assertTrue(made["levelCheck"]["match"])

    def test_review_uses_its_own_model(self):
        saved = generate.REVIEW_MODEL_ID
        generate.REVIEW_MODEL_ID = "us.amazon.nova-pro-v1:0"
        try:
            self.run_with([CODE], [review()])
        finally:
            generate.REVIEW_MODEL_ID = saved
        self.assertEqual(self.models["code_review"], "us.amazon.nova-pro-v1:0")   # 검토만 다른 모델
        self.assertIsNone(self.models["code_generation"])                        # 생성은 기본 모델(MODEL_ID)

    def test_prompts_carry_the_level_standard(self):
        self.run_with([CODE], [review()], level=2)
        gen, rev = self.prompts["code_generation"][0], self.prompts["code_review"][0]
        self.assertIn("두 가지 이상의 프로그래밍 개념을 연계", gen)         # 중급 기준
        self.assertIn("코드 길이는 난이도 기준이 아니다", gen)
        for factor in levels.FACTORS:
            self.assertIn(factor, rev)                                       # 검토는 6요소로 판단
        self.assertIn("매개변수에 값을 정해 넣고", rev)
        self.assertIn("요청한 난이도: 중급", rev)

    def test_syntax_error_is_fixed_in_place(self):
        broken = CODE.replace("total = total + price", "total = totl + price")
        made = self.run_with([broken], [review()], fixes=[[{"startNo": 4, "endNo": 4, "code": "        total = total + price"}]])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_fix", "code_review"]))
        self.assertNotIn("totl", made["code"])

    def test_not_runnable_is_fixed_then_reviewed_again(self):
        made = self.run_with([CODE], [review(runnable=False, problems=["4번째 줄: 문자열과 숫자를 더해요"]), review()],
                             fixes=[[{"startNo": 7, "endNo": 7, "code": "items = [3000, 3500, 5000]"}]])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_fix", "code_review"]))
        self.assertIn("문자열과 숫자", self.prompts["code_fix"][0])

    def test_level_mismatch_makes_it_again_with_advice(self):
        made = self.run_with([CODE, CODE], [review(match=False, overall=2, advice="함수를 빼고 반복 하나로"), review()])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_generation", "code_review"]))
        self.assertIn("함수를 빼고 반복 하나로", self.prompts["code_generation"][1])
        self.assertIn("검토 판단: 중급", self.prompts["code_generation"][1])

    def test_missing_loop_asks_review_once_more(self):
        made = self.run_with([CODE], [review(units=[unit(7, 8, key=True)]), review()])
        self.assertEqual(self.calls, ["code_generation", "code_review", "code_review"])
        self.assertIn("1~5번 줄", self.prompts["code_review"][1])
        self.assertEqual(made["origin"], "ai")

    def test_too_big_to_trace_is_shrunk_then_reviewed_again(self):
        # v2.2: 검토 기록의 반복 횟수·출력 줄이 손으로 따라갈 크기(초급: 반복 10번·출력 15줄 초과)를 넘으면 줄이도록 부분 수정 → 다시 검토
        big = review(units=[unit(1, 5, "function", key=True), unit(3, 4, "loop", count=12)])
        big["output"] = [f"줄 {i}" for i in range(20)]
        made = self.run_with([CODE], [big, review()], fixes=[[{"startNo": 7, "endNo": 7, "code": "items = [3000, 3500]"}]])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_fix", "code_review"]))
        fix_prompt = self.prompts["code_fix"][0]
        self.assertIn("반복이 12번이라", fix_prompt)
        self.assertIn("출력이 20줄이라", fix_prompt)
        self.assertEqual(self.log["attempts"][0]["review"]["size"], [])   # 다시 검토한 뒤에는 크기 문제 없음

    def test_size_limits_follow_the_level(self):
        loop = lambda n: {"units": generate.clean_units(CODE, [unit(3, 4, "loop", count=n)]), "output": []}
        self.assertEqual(generate.size_issues(loop(9), 1), [])                # 기준(5번)을 살짝 넘어도 선(10번) 안이면 통과
        self.assertEqual(len(generate.size_issues(loop(11), 1)), 1)           # 초급 10번 초과
        self.assertEqual(generate.size_issues(loop(30), 3), [])               # 고급은 30번까지
        self.assertEqual(generate.size_issues({"units": [], "output": ["x"] * 12}, 1), [])   # 출력 12줄 (선 15줄 안)
        self.assertEqual(len(generate.size_issues({"units": [], "output": ["x"] * 46}, 3)), 1)
        self.assertIn("반복문 하나가 도는 횟수 5번 이하", generate.level_text(1))   # 생성 AI 에게 주는 기준
        self.assertIn("출력 30줄 이하", generate.level_text(3))

    def test_review_access_denied_is_asked_once_more(self):
        made = self.run_with([CODE], [generate.AiUnavailable("bedrock: AccessDeniedException"), review()])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_review"]))   # 코드를 다시 만들지 않음

    def test_review_failure_is_never_shipped(self):
        made = self.run_with([CODE, CODE], [generate.AiUnavailable("could not parse response: x")] * 2)
        self.assertEqual((made["origin"], self.calls), ("sample", ["code_generation", "code_review"] * 2))

    def test_gives_sample_within_call_limit(self):
        bad = review(match=False, advice="더 어렵게")
        made = self.run_with([CODE] * 5, [bad] * 5)
        self.assertEqual(made["origin"], "sample")
        self.assertLessEqual(len(self.calls), generate.MAX_CALLS)
        self.assertEqual(len(self.log["attempts"]), generate.ATTEMPTS)


class Endpoint(unittest.TestCase):
    def test_saves_record_and_shows_only_ranges(self):
        with FakeDb(generate) as db, unittest.mock.patch.object(generate, "make_code", lambda *a, **k: {
                "title": "t", "code": CODE, "units": generate.pick_keys(generate.clean_units(CODE, review()["units"])), "output": ["합계: 11500"],
                "levelCheck": review()["level"], "origin": "ai", "note": None}), unittest.mock.patch.object(generate, "ai_allowed", lambda req: True):
            out = generate.start_practice(request({"language": "python", "level": 1, "topic": ""}))
            saved = db.rows[(core.code_pk(out["codeId"]), core.INFO)]
        self.assertIn(out["topic"], samples.TOPIC_POOL)                       # 주제를 비우면 랜덤
        self.assertEqual(out["marks"], [{"id": "u1", "start": 1, "end": 5}])
        self.assertNotIn("explanation", str(out))
        self.assertEqual(saved["units"][1]["count"], 3)                       # 채점 기준은 저장

    def test_bad_topic(self):
        for topic in ("해킹 도구", "가" * 51):
            with self.assertRaises(core.ApiError):
                generate.clean_topic(topic)


class Samples(unittest.TestCase):
    def test_one_sample_per_language_and_level(self):
        have = {(s["language"], s["level"]) for s in samples.SAMPLES}
        self.assertEqual(have, {(lang, lv) for lang in core.LANGUAGES for lv in core.LEVELS})
        for s in samples.SAMPLES:
            self.assertEqual(rules.code_problems(s["code"], s["language"]), [], s["id"])
            self.assertTrue(any(u["key"] for u in s["units"]), s["id"])

    def test_mock_review_round_trip(self):
        s = samples.SAMPLES[1]
        units = generate.pick_keys(generate.clean_units(s["code"], generate.sample_review(s, s["level"])["units"]))
        self.assertEqual([(u["start"], u["end"]) for u in units], [(u["start"], u["end"]) for u in s["units"]])


if __name__ == "__main__":
    unittest.main()
