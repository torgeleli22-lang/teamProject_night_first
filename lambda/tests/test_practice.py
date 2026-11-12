"""jojo_practice: 규칙 검사 · 생성 → 검토 흐름 · 부분 수정 · 다시 만들기 · 예시 코드 · 저장하는 채점 기준 (docs/GENERATION_STANDARD.md)"""
import unittest
import unittest.mock

from helpers import FakeDb, core, request

import generate
import experience
import history
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

    def test_names_defined_only_in_another_function(self):
        """함수·내포마다 정의하지 않은 이름 (v3.2): 다른 함수에서만 만든 이름은 실행하면 NameError"""
        bug = ("def a():\n    for room_id in range(3):\n        print(room_id)\n\n"
               "def b(rooms):\n    return [r for r in rooms if r == room_id]\n\na()\nprint(b([1]))")
        problems = rules.code_problems(bug, "python")
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("6번째 줄: room_id"))      # 올바르게 쓴 3번 줄이 아니라 잘못 쓴 줄
        ok = [
            "def show():\n    print(TOTAL, helper(2))\n\ndef helper(x):\n    return x * 2\n\nTOTAL = 5\nshow()",   # 나중에 정의한 전역
            "def outer(n):\n    base = 10\n    def inner(x):\n        return [base + x + k for k in range(n)]\n    return inner(1)\nprint(outer(2))",
            "def setup():\n    global count\n    count = 3\ndef use():\n    return count + 1\nsetup()\nprint(use())",
            "class Room:\n    LIMIT = 3\n    def __init__(self, name):\n        self.name = name\n        self.items = [i for i in range(Room.LIMIT)]\n"
            "    def show(self):\n        print(self.name, len(self.items), __name__)\nRoom('A').show()",
            "data = [('a', 2)]\nprint(sorted(data, key=lambda p: (p[1], p[0])))\nprint({k: v for k, v in data})",
            "def f():\n    try:\n        return 1 / 0\n    except ZeroDivisionError as e:\n        return str(e)\nprint(f())",
        ]
        for code in ok:
            self.assertEqual(rules.code_problems(code, "python"), [], code)
        for sample in samples.SAMPLES:
            if sample["language"] == "python":
                self.assertEqual(rules.code_problems(sample["code"], "python"), [], sample["title"])

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

    def run_with(self, codes, reviews, fixes=None, level=1, checks=None, expected=None):
        """checks: 검토 2 가 차례로 돌려줄 답 (없으면 바로 앞 검토 1 의 출력을 그대로 — 같음)
        expected: 생성 AI 가 차례로 돌려줄 예상 출력 (없으면 빈 목록 — 의견 없음)"""
        codes, reviews, fixes, checks, expected = list(codes), list(reviews), list(fixes or []), list(checks or []), list(expected or [])
        last = {}
        self.calls, self.prompts = [], {}

        self.models = {}

        def fake(task, system, prompt, schema, **kw):
            self.calls.append(task)
            self.models.setdefault(task, kw.get("model"))
            self.prompts.setdefault(task, []).append(system + "\n" + prompt)
            answer = {"code_generation": lambda: {"title": "가격 합계", "code": codes.pop(0), "expectedOutput": expected.pop(0) if expected else []},
                      "code_review": lambda: reviews.pop(0),
                      "code_fix": lambda: {"edits": fixes.pop(0) if fixes else []},
                      "trace_check": lambda: checks.pop(0) if checks else {"output": list(last["review"]["output"]), "counts": []}}[task]()
            if task == "code_review" and isinstance(answer, dict):
                last["review"] = answer
            if isinstance(answer, Exception):
                raise answer
            return answer
        saved, saved_hints, saved_exp = generate.ask_ai, generate.history_hints, generate.review_experiences
        generate.ask_ai = fake
        generate.history_hints = getattr(self, "hints", lambda language, level: ("", {}))   # 생성 기록 지침 (기본: 없음)
        generate.review_experiences = getattr(self, "experiences", lambda code, language, level: ("", []))   # 검토 경험 (기본: 없음)
        try:
            self.log = {"attempts": []}
            return generate.make_code(level, "python", "카페 주문", self.log)
        finally:
            generate.ask_ai, generate.history_hints, generate.review_experiences = saved, saved_hints, saved_exp

    def test_generate_then_review_saves_record_as_grading_standard(self):
        made = self.run_with([CODE], [review()])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "trace_check"]))
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

    def test_second_review_model_by_level(self):
        """검토 2: 초급은 Haiku(CHECK_MODEL_ID), 중급·고급은 Luna 를 한 번 더 (CHECK_MODEL_ID_HIGH) — 생성 기준 4.1"""
        self.run_with([CODE], [review()])
        self.assertEqual(self.models["trace_check"], generate.CHECK_MODEL_ID)
        self.assertEqual(self.log["attempts"][0]["check"]["checkModel"], generate.CHECK_MODEL_ID)
        made = self.run_with([CODE], [review(overall=3)], level=3)
        self.assertEqual((made["origin"], self.models["trace_check"]), ("ai", generate.CHECK_MODEL_ID_HIGH))
        self.assertEqual(generate.CHECK_MODEL_ID_HIGH, generate.REVIEW_MODEL_ID)   # 기본값: 검토 1 과 같은 Luna 를 따로 한 번 더
        self.assertEqual(generate.check_model(2), generate.CHECK_MODEL_ID_HIGH)
        self.assertEqual(generate.norm_lines(["점수: 10.333333333333334"]), generate.norm_lines(["점수: 10.333333333333332"]))   # 실수 오차
        self.assertNotEqual(generate.norm_lines(["점수: 10.33"]), generate.norm_lines(["점수: 10.34"]))

    def test_prompts_carry_the_level_standard(self):
        self.run_with([CODE], [review()], level=2)
        gen, rev = self.prompts["code_generation"][0], self.prompts["code_review"][0]
        self.assertIn("두 가지 이상의 프로그래밍 개념을 연계", gen)         # 중급 기준
        self.assertIn("코드 길이는 난이도 기준이 아니다", gen)
        for factor in levels.FACTORS:
            self.assertIn(factor, rev)                                       # 검토는 6요소로 판단
        self.assertIn("매개변수에 값을 정해 넣고", rev)
        self.assertIn("요청한 난이도: 중급", rev)
        self.assertIn("problems 는 코드의 문제만", rev)                     # 자기 기록 실수는 문제로 적지 않고 기록을 고침 (v2.9)
        self.assertIn("그 기록을 바로 고쳐서 내", rev)

    def test_high_level_asks_for_structure_not_size(self):
        """고급: 구조 중 두 가지 이상을 반드시, 크기는 작게 (생성 기준 2.1) — 생성·검토 둘 다 같은 기준을 받음"""
        self.run_with([CODE], [review(overall=3)], level=3)
        gen, rev = self.prompts["code_generation"][0], self.prompts["code_review"][0]
        for text in (gen, rev):
            self.assertIn("고급은 크기가 아니라 구조로", text)
            self.assertIn("중첩 반복문", text)
            self.assertIn("함수 사이의 데이터 전달", text)
        self.assertNotIn("고급은 크기가 아니라 구조로", levels.level_text(2))
        self.assertEqual(generate.REVIEW_TOKENS[3], 12000)   # 고급 검토: 정상 답(약 3,000)의 4배에서 끊음 (v3.2)

    def test_experiences_go_into_both_reviews_and_code_is_logged(self):
        self.experiences = lambda code, language, level: ("참고 — 실제 실행으로 확인한 지난 검토 사례예요.\n- [판정 오류] 교훈: 경험", ["1#01"])
        try:
            self.run_with([CODE], [review()])
        finally:
            del self.experiences
        self.assertIn("[판정 오류] 교훈: 경험", self.prompts["code_review"][0])
        self.assertIn("[판정 오류] 교훈: 경험", self.prompts["trace_check"][0])
        step = self.log["attempts"][0]
        self.assertEqual((step["code"], step["experiences"]), (CODE, ["1#01"]))
        self.assertIn("의도와 실제 동작이 다르면 그것도 문제야", self.prompts["code_review"][0])   # 의도와 다른 동작도 문제 (v3.3)

    def test_syntax_error_is_fixed_in_place(self):
        broken = CODE.replace("total = total + price", "total = totl + price")
        made = self.run_with([broken], [review()], fixes=[[{"startNo": 4, "endNo": 4, "code": "        total = total + price"}]])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_fix", "code_review", "trace_check"]))
        self.assertNotIn("totl", made["code"])

    def test_not_runnable_is_fixed_then_reviewed_again(self):
        made = self.run_with([CODE], [review(runnable=False, problems=["4번째 줄: 문자열과 숫자를 더해요"]), review()],
                             fixes=[[{"startNo": 7, "endNo": 7, "code": "items = [3000, 3500, 5000]"}]])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_fix", "code_review", "trace_check"]))
        self.assertIn("문자열과 숫자", self.prompts["code_fix"][0])

    def test_level_mismatch_makes_it_again_with_advice(self):
        made = self.run_with([CODE, CODE], [review(match=False, overall=2, advice="함수를 빼고 반복 하나로"), review()])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_generation", "code_review", "trace_check"]))
        self.assertIn("함수를 빼고 반복 하나로", self.prompts["code_generation"][1])
        self.assertIn("검토 판단: 중급", self.prompts["code_generation"][1])

    def test_missing_loop_asks_review_once_more(self):
        made = self.run_with([CODE], [review(units=[unit(7, 8, key=True)]), review()])
        self.assertEqual(self.calls, ["code_generation", "code_review", "code_review", "trace_check"])
        self.assertIn("1~5번 줄", self.prompts["code_review"][1])
        self.assertEqual(made["origin"], "ai")

    def test_too_big_to_trace_is_shrunk_then_reviewed_again(self):
        # v2.2: 검토 기록의 반복 횟수·출력 줄이 손으로 따라갈 크기(초급: 반복 10번·출력 15줄 초과)를 넘으면 줄이도록 부분 수정 → 다시 검토
        big = review(units=[unit(1, 5, "function", key=True), unit(3, 4, "loop", count=12)])
        big["output"] = [f"줄 {i}" for i in range(20)]
        made = self.run_with([CODE], [big, review()], fixes=[[{"startNo": 7, "endNo": 7, "code": "items = [3000, 3500]"}]])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_fix", "code_review", "trace_check"]))
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
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_review", "code_review", "trace_check"]))   # 코드를 다시 만들지 않음

    def out(self, line):
        r = review()
        r["output"] = [line]
        return r

    def test_two_reviews_agree_ships(self):
        made = self.run_with([CODE], [review()], checks=[{"output": ["합계:   11500"], "counts": [{"id": "u2", "count": 9}]}])
        self.assertEqual((made["origin"], made["output"]), ("ai", ["합계: 11500"]))
        check = self.log["attempts"][0]["check"]
        self.assertEqual((check["vote"], check["passed"]), ("agree", True))   # 띄어쓰기 차이는 같다고 봄, 반복 횟수는 판정에 쓰지 않음
        self.assertNotIn("11500", self.prompts["trace_check"][0].split("</code>")[1])   # 검토 2 에게 검토 1 의 기록(값)을 주지 않음

    def test_generation_temperature_and_expected_output_prompt(self):
        temps = {}
        saved = generate.call_ai
        generate.call_ai = lambda task, *a, **k: (temps.setdefault(task, k.get("temperature")), saved(task, *a, **k))[1]
        try:
            self.run_with([CODE], [review()])
        finally:
            generate.call_ai = saved
        self.assertEqual((temps["code_generation"], temps["code_review"]), (generate.GEN_TEMPERATURE, None))
        self.assertIn("expectedOutput", self.prompts["code_generation"][0])

    def test_disagree_is_not_shipped_even_if_expected_output_sides_with_first(self):
        # 검토 1 = 예상 출력 ≠ 검토 2 → 다수결 없이 버리고 다시 만듦 (v3.0 — 검토 1 과 예상 출력이 같이 틀릴 수 있음)
        made = self.run_with([CODE, CODE], [review(), review()], checks=[{"output": ["합계: 9999"], "counts": []}], expected=[["합계: 11500"], []])
        self.assertEqual(made["origin"], "ai")
        self.assertEqual(self.calls, ["code_generation", "code_review", "trace_check"] * 2)   # 두 번째 시도에서 두 검토가 같아 통과
        self.assertEqual((self.log["attempts"][0]["check"]["vote"], self.log["attempts"][0]["check"]["passed"]), ("disagree", False))
        self.assertIn("두 검토의 실행 결과가 서로 달라", self.prompts["code_generation"][1])
        self.assertIn("구조는 그대로 두고", self.prompts["code_generation"][1])

    def test_disagree_is_not_shipped_even_if_expected_output_sides_with_second(self):
        # 검토 2 = 예상 출력 ≠ 검토 1 → 검토 1 에게 다시 쓰게 하지 않고 다시 만듦
        made = self.run_with([CODE, CODE], [self.out("합계: 12000"), review()], checks=[{"output": ["합계: 11500"], "counts": []}], expected=[["합계: 11500"], []])
        self.assertEqual((made["origin"], made["output"]), ("ai", ["합계: 11500"]))
        self.assertEqual(self.calls, ["code_generation", "code_review", "trace_check"] * 2)
        self.assertEqual(self.log["attempts"][0]["check"]["vote"], "disagree")

    def test_disagree_twice_gives_sample(self):
        made = self.run_with([CODE, CODE], [self.out("합계: 1"), self.out("합계: 1")], checks=[{"output": ["합계: 2"], "counts": []}] * 2, expected=[["합계: 1"], ["합계: 1"]])
        self.assertEqual(made["origin"], "sample")
        self.assertEqual([a["check"]["vote"] for a in self.log["attempts"]], ["disagree", "disagree"])
        self.assertLessEqual(len(self.calls), generate.MAX_CALLS)

    def test_fixed_code_drops_expected_output(self):
        broken = CODE.replace("total = total + price", "total = totl + price")
        made = self.run_with([broken, CODE], [self.out("합계: 1"), review()], fixes=[[{"startNo": 4, "endNo": 4, "code": "        total = total + price"}]],
                             checks=[{"output": ["합계: 2"], "counts": []}], expected=[["합계: 1"]])
        self.assertEqual(self.log["attempts"][0]["check"]["genOutput"], [])      # 코드가 바뀌면 예상 출력은 기록하지 않음
        self.assertEqual(self.log["attempts"][0]["check"]["vote"], "disagree")
        self.assertEqual(made["origin"], "ai")                                    # 다시 만든 코드로

    def test_assumed_values_are_given_to_checker(self):
        self.run_with([CODE], [review(units=[unit(1, 5, "function", key=True, inputs="prices=[3000, 4500] (가정: 랜덤)")])])
        self.assertIn("가정 값 (그대로 써)", self.prompts["trace_check"][0])
        self.assertIn("(가정: 랜덤)", self.prompts["trace_check"][0])

    def test_display_differences_are_the_same_output(self):
        self.assertEqual(generate.norm_lines(["현재 대기줄: ['이영희', '박민준']", "평균: 4.0점"]), generate.norm_lines(["현재 대기줄: 이영희,박민준", "평균: 4점"]))
        self.assertEqual(generate.output_diff(["1위: 데이터과학"], ["1위: 파이썬"]), ["출력 1번째 줄: 검토 1 '1위:데이터과학' · 검토 2 '1위:파이썬'"])

    def test_disagreement_keeps_code_and_outputs_for_judging(self):
        self.run_with([CODE, CODE], [self.out("합계: 12000"), review()], checks=[{"output": ["합계: 11500"], "counts": []}], expected=[["합계: 3"]])
        check = self.log["attempts"][0]["check"]
        self.assertEqual((check["code"], check["reviewOutput"], check["checkOutput"], check["genOutput"]), (CODE, ["합계: 12000"], ["합계: 11500"], ["합계: 3"]))

    def test_cross_check_unavailable_is_not_shipped(self):
        made = self.run_with([CODE, CODE], [review(), review()], checks=[generate.AiUnavailable("x"), generate.AiUnavailable("x")])
        self.assertEqual(made["origin"], "sample")

    def test_assumed_values_are_given_to_checker(self):
        self.run_with([CODE], [review(units=[unit(1, 5, "function", key=True, inputs="prices=[3000, 4500] (가정: 랜덤)")])])
        self.assertIn("가정 값 (그대로 써)", self.prompts["trace_check"][0])
        self.assertIn("(가정: 랜덤)", self.prompts["trace_check"][0])

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
        with FakeDb(generate, history) as db, unittest.mock.patch.object(generate, "make_code", lambda *a, **k: {
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


class Experience(unittest.TestCase):
    """검토 경험으로 배우기 1단계 (docs/GENERATION_STANDARD.md 8.1 · docs/REVIEW_LEARNING_PLAN.md)"""

    def test_code_features(self):
        py = "def grade(xs):\n    for a in xs:\n        for b in xs:\n            if a >= b and a / 2 == 1:  # x / y\n                pass\n    return sorted(xs)\nprint('a/b if')"
        f = experience.code_features(py, "python")
        self.assertEqual((f["functions"], f["loops"], f["nestedLoop"], f["sort"], f["eqCompare"], f["division"], f["branches"]), (1, 2, True, True, 2, 1, 1))
        js = "const xs = [3, 1];\nxs.sort((a, b) => a - b); // a / b\nif (xs[0] === 1) { console.log('ok'); }"
        f = experience.code_features(js, "javascript")
        self.assertEqual((f["sort"], f["eqCompare"], f["division"], f["nestedLoop"]), (True, 1, 0, False))

    def test_record_cases_keeps_rejected_attempts_with_code(self):
        review_ok = {"runnable": True, "problems": [], "size": [], "level": {"match": True, "overall": 1}}
        log = {"attempts": [
            {"rule": [], "code": CODE, "review": {**review_ok, "runnable": False, "problems": ["5번째 줄: 의도와 다르게 rejected 가 기록돼요"]}},
            {"rule": [], "code": CODE, "review": review_ok, "check": {"vote": "disagree", "passed": False, "diff": ["출력 1번째 줄 다름"],
                                                                      "reviewOutput": ["합계: 1"], "checkOutput": ["합계: 2"], "checkModel": "m"}},
            {"rule": [], "code": CODE, "review": review_ok, "check": {"vote": "agree", "passed": True}},
            {"rule": [], "review": {**review_ok, "level": {"match": False, "overall": 2, "advice": ""}}, "code": CODE}]}
        with FakeDb(experience) as db:
            experience.record_cases("python", 1, "카페", log)
            rows = sorted((v for (pk, _), v in db.rows.items() if pk == "CASE#python#1"), key=lambda r: r["sk"])
        self.assertEqual([r["outcome"] for r in rows], ["not_runnable", "disagree"])          # 통과·난이도 불일치는 사례로 남기지 않음
        self.assertTrue(all(r["label"] == "pending" and r["code"] == CODE and r["features"]["loops"] == 1 for r in rows))
        self.assertEqual((rows[0]["problems"], rows[1]["reviewOutput"], rows[1]["checkOutput"]), (["5번째 줄: 의도와 다르게 rejected 가 기록돼요"], ["합계: 1"], ["합계: 2"]))
        self.assertTrue(rows[0]["sk"].endswith("#1") and rows[1]["sk"].endswith("#2"))

    def test_review_experiences_pick_verified_similar_balanced(self):
        rows = [("1#01", "trace_slip", 1, {"sort": True}), ("1#02", "trace_slip", 1, {"sort": True}), ("1#03", "trace_slip", 1, {"sort": True}),
                ("3#04", "false_alarm", 3, {}), ("1#05", "real_error", 1, {}), ("1#06", "pending", 1, {"sort": True})]
        with FakeDb(experience) as db, unittest.mock.patch.dict("os.environ", {"REVIEW_EXPERIENCE": "on"}):
            self.assertEqual(experience.review_experiences(CODE, "python", 1), ("", []))       # 경험이 없으면 아무것도 넣지 않음
            for sk, kind, level, feats in rows:
                db.rows[("EXPERIENCE#python", sk)] = {"pk": "EXPERIENCE#python", "sk": sk, "kind": kind, "level": level, "features": feats,
                                                     "claim": f"주장 {sk}", "truth": "실제", "lesson": f"교훈 {sk}"}
            text, used = experience.review_experiences("xs = sorted([2, 1])\nprint(xs)", "python", 1)
        self.assertEqual(len(used), 3)
        self.assertNotIn("1#06", used)                                                        # 정답이 없는 사례(pending)는 쓰지 않음
        self.assertEqual(sum(u in ("1#01", "1#02", "1#03") for u in used), 2)                  # 같은 종류는 2개까지
        self.assertIn("1#05", used)                                                           # 같은 난이도 우선
        self.assertIn("실제 실행으로 확인한 지난 검토 사례", text)
        self.assertIn("[진짜 오류]", text)
        with unittest.mock.patch.dict("os.environ", {"REVIEW_EXPERIENCE": "off"}):
            self.assertEqual(experience.review_experiences(CODE, "python", 1), ("", []))

    def test_genlog_keeps_code_features_not_code(self):
        step = {"rule": [], "code": CODE, "review": {"runnable": True, "problems": [], "size": [], "level": {"match": True, "overall": 1}},
                "check": {"vote": "agree", "passed": True}}
        with FakeDb(history) as db:
            history.record_generation("python", 1, "카페", {"origin": "sample", "title": "s"}, {"attempts": [step]})
            row = next(v for (pk, _), v in db.rows.items() if pk == "GENLOG#python#1")
        self.assertEqual(row["attempts"][0]["features"]["loops"], 1)
        self.assertNotIn("code", row["attempts"][0])


class History(unittest.TestCase):
    """생성 기록으로 배우기 (docs/GENERATION_STANDARD.md 8장)"""

    def step(self, outcome):
        review = {"runnable": True, "problems": [], "size": [], "level": {"match": True, "overall": 1}}
        steps = {
            "ok": {"rule": [], "review": review, "check": {"vote": "agree", "passed": True}},
            "rule": {"rule": ["3번째 줄: 오타"], "ruleAfterFix": ["3번째 줄: 오타"], "review": None},
            "level_up": {"rule": [], "review": {**review, "level": {"match": False, "overall": 2, "advice": "함수를 줄여"}}},
            "disagree": {"rule": [], "review": review, "check": {"vote": "disagree", "passed": False, "diff": ["출력 1번째 줄 다름"]}},
            "too_big": {"rule": [], "review": {**review, "size": ["출력이 20줄이라"]}},
            "review_error": {"rule": [], "review": {"error": "bedrock: AccessDeniedException"}},
        }
        return steps[outcome]

    def test_attempt_outcome(self):
        for outcome in ("ok", "rule", "level_up", "disagree", "too_big", "review_error"):
            self.assertEqual(history.attempt_outcome(self.step(outcome), 1)[0], outcome)
        self.assertEqual(history.attempt_outcome({"review": {"runnable": True, "problems": [], "size": [], "level": {"match": False, "overall": 1}}}, 2)[0],
                         "level_down")

    def test_record_and_hints(self):
        made_ok = {"origin": "ai", "title": "t", "code": CODE, "units": generate.clean_units(CODE, review()["units"]), "output": ["합계: 11500"],
                   "levelCheck": {"overall": 1}}
        made_fail = {"origin": "sample", "title": "s"}
        with FakeDb(history) as db, unittest.mock.patch.dict("os.environ", {"HISTORY_HINTS": "on"}):
            self.assertEqual(history.history_hints("python", 1), ("", {}))                       # 기록이 없으면 지침 없음
            for _ in range(4):
                history.record_generation("python", 1, "카페", made_ok, {"attempts": [self.step("ok")]})
            for _ in range(3):
                history.record_generation("python", 1, "카페", made_fail, {"attempts": [self.step("level_up"), self.step("disagree")]})
            history.record_generation("python", 1, "카페", made_fail, {"attempts": [self.step("review_error")]})
            rows = [v for (pk, _), v in db.rows.items() if pk == "GENLOG#python#1"]
            text, used = history.history_hints("python", 1)
        self.assertEqual(len(rows), 8)
        self.assertNotIn("code", rows[0])                                                    # 코드 원문은 저장하지 않음
        shape = next(r["shape"] for r in rows if r["origin"] == "ai")
        self.assertEqual((shape["functions"], shape["loops"], shape["outputLines"], shape["maxCount"]), (1, 1, 1, 3))
        self.assertIn("어렵다고 판정된 경우가 잦았어요", text)
        self.assertIn("두 AI 가 실행 결과를 서로 다르게", text)
        self.assertIn("약 8줄 · 함수 1개 · 반복문 1개 · 출력 1줄", text)
        self.assertNotIn("total_price", text)                                                 # 코드 원문은 지침에 넣지 않음 (다양성)
        self.assertEqual((used["records"], set(used["frequent"])), (8, {"level_up", "disagree"}))   # AI 를 못 쓴 기록(review_error)은 이유로 쓰지 않음

    def test_hints_off(self):
        with unittest.mock.patch.dict("os.environ", {"HISTORY_HINTS": "off"}):
            self.assertEqual(history.history_hints("python", 1), ("", {}))

    def test_hints_go_into_generation_prompt(self):
        pipe = Pipeline("test_generate_then_review_saves_record_as_grading_standard")
        pipe.hints = lambda language, level: ("참고 — 최근 기록: 너무 큰 코드가 잦았어요", {"records": 9})
        pipe.run_with([CODE], [review()])
        self.assertIn("참고 — 최근 기록: 너무 큰 코드가 잦았어요", pipe.prompts["code_generation"][0])
        self.assertEqual(pipe.log["hints"], {"records": 9})


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
