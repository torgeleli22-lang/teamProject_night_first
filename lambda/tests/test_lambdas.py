"""jojo_api 기능 파일의 규칙 부분: 예시 코드(samples), 주제 판정(topics), 코드 검사(practice), 민감 정보·함수 찾기(inspect_code),
규칙 첨삭(review), 관리자 코드(admin)"""
import os
import unittest

from helpers import ai, code_store, core, load_lambda

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
        for language in core.LANGUAGES:
            self.assertEqual({s["level"] for s in samples.SAMPLES if s.get("language", "python") == language}, {1, 2, 3, 4}, language)
        for s in samples.SAMPLES:
            if s.get("language", "python") == "python":
                compile(s["code"], s["id"], "exec")
            else:
                self.assertEqual(practice.js_shape_problems(s["code"]), [], s["id"])
            marks = code_store.clean_marks(s["code"], s["marks"], limit=5)
            self.assertEqual(len(marks), len(s["marks"]), s["id"])   # 겹치거나 범위를 벗어난 ※ 지점이 없다
            for m in s["marks"]:
                self.assertTrue(m["explanation"] and m["keywords"], s["id"])

    def test_mock_ai_round_trip_finds_same_lines(self):
        # 목업 AI 응답(줄 글자) → check_generated 가 원래 줄 번호를 다시 찾는다
        for s in samples.SAMPLES:
            code, marks, problems = practice.check_generated(practice.sample_as_ai(s), s["level"], s.get("language", "python"))
            self.assertEqual(problems, [], s["id"])
            self.assertEqual([(m["start"], m["end"]) for m in marks], [(m["start"], m["end"]) for m in s["marks"]], s["id"])


class GeneratedCode(unittest.TestCase):
    """규칙 검사 A (코드·※ 위치) — docs/GENERATION_STANDARD.md 2·3"""

    def test_length_limits(self):
        short = next(s for s in samples.SAMPLES if s["level"] == 2)
        _, _, problems = practice.check_generated(practice.sample_as_ai(short), 4)
        self.assertTrue(any("고급으로는 너무 짧아요" in p for p in problems))
        _, _, problems = practice.check_generated(practice.sample_as_ai(short), 3)
        self.assertTrue(any("중급으로는 너무 짧아요" in p for p in problems))
        long_js = {"title": "t", "code": "\n".join(["let a = 1;"] * 160 + ["console.log(a);"]), "marks": []}
        _, _, problems = practice.check_generated(long_js, 3, "javascript")
        self.assertTrue(any("161줄이라 너무 길어요" in p and "71줄 이상 줄여 90줄 안쪽" in p for p in problems), problems)
        advanced = next(s for s in samples.SAMPLES if s["level"] == 4)
        _, marks, problems = practice.check_generated(practice.sample_as_ai(advanced), 4)
        self.assertEqual((problems, len(marks)), ([], 5))

    def test_mark_without_why_or_explanation_is_kept(self):
        # ① 출제 답에는 모범 설명이 없다 (② 에서 쓴다). why 가 빠져도 답 전체를 버리지 않는다
        r = practice.sample_as_ai(next(s for s in samples.SAMPLES if s["level"] == 1))
        for m in r["marks"]:
            for k in ("why", "explanation", "keywords"):
                m.pop(k)
        r.pop("_mock")
        self.assertEqual(ai.parse_answer(r, practice.CodeAnswer)[1], [])
        _, marks, problems = practice.check_generated(r, 1)
        self.assertEqual((problems, marks[0]["why"], marks[0]["explanation"]), ([], "", ""))

    def test_syntax_error_and_missing_marks(self):
        r = {"title": "t", "code": "if x\n    print(1)", "marks": [{"startLine": "없는 줄", "endLine": "없는 줄"}]}
        _, _, problems = practice.check_generated(r, 1)
        self.assertTrue(any("문법" in p for p in problems))
        self.assertTrue(any("※" in p for p in problems))

    def test_mark_problems_say_why(self):
        code = "total = 0\nfor x in [1, 2, 3]:\n    if x > 1:\n        total += x\nprint(total)"
        mk = lambda s, e, sn, en: {"startLine": s, "endLine": e, "startNo": sn, "endNo": en, "why": "w"}
        # 겹침: for 범위(2~4) 안에 if 범위(3~4) → 하나만 남아 실패(초급은 2곳), 이유는 '겹쳐요'
        _, marks, problems = practice.check_generated({"title": "t", "code": code, "marks": [mk("for x in [1, 2, 3]:", "total += x", 2, 4),
                                                                                             mk("if x > 1:", "total += x", 3, 4)]}, 2)
        self.assertEqual(len(marks), 1)
        self.assertTrue(any("겹쳐요" in p and "2~4번 줄" in p for p in problems), problems)
        self.assertFalse(any("찾지 못했어요" in p for p in problems))
        # 못 찾은 줄: 어떤 줄인지 알려 줌
        _, _, problems = practice.check_generated({"title": "t", "code": code, "marks": [mk("for x in [1, 2, 3]:", "total += x", 2, 4),
                                                                                         mk("print(total + 1)", "print(total + 1)", 5, 5)]}, 2)
        self.assertTrue(any("찾지 못했어요" in p and "print(total + 1)" in p for p in problems), problems)
        # 수가 부족: 한 곳만 줌
        _, _, problems = practice.check_generated({"title": "t", "code": code, "marks": [mk("print(total)", "print(total)", 5, 5)]}, 2)
        self.assertTrue(any("1곳뿐" in p for p in problems), problems)
        # 입문은 1곳이면 통과 (중심 개념: 반복)
        _, marks, problems = practice.check_generated({"title": "t", "code": code, "marks": [mk("for x in [1, 2, 3]:", "total += x", 2, 4)]}, 1)
        self.assertEqual((len(marks), marks[0]["concept"], problems), (1, "loop_update", []))
        # 중심 개념이 없음: 출력 줄만 고름
        _, _, problems = practice.check_generated({"title": "t", "code": code, "marks": [mk("print(total)", "print(total)", 5, 5)]}, 1)
        self.assertTrue(any("중심 개념" in p for p in problems), problems)
        # 범위가 너무 넓음 (입문 6줄)
        wide = "total = 0\n" + "\n".join(f"total += {i}" for i in range(7)) + "\nfor x in [1]:\n    if x:\n        print(total)"
        _, _, problems = practice.check_generated({"title": "t", "code": wide, "marks": [mk("total = 0", "total += 6", 1, 8)]}, 1)
        self.assertTrue(any("너무 넓어요" in p and "6줄 이하" in p for p in problems), problems)

    def test_level_requirements(self):
        import ast
        check = lambda code, level: practice.level_problems(practice.py_structure(ast.parse(code)), level)
        # 입문: 클래스·예외·재귀는 쓰지 않음, 반복·조건은 꼭
        self.assertTrue(any("쓰지 않는 것" in p and "클래스" in p for p in check("class A:\n    pass\nfor i in range(2):\n    if i:\n        print(i)", 1)))
        self.assertTrue(any("반복문" in p for p in check("x = 1\nif x:\n    print(x)", 1)))
        # 초급: 다른 함수를 부르는 함수가 꼭
        self.assertTrue(any("다른 함수를 부르는 함수" in p for p in check("def a():\n    return [1]\ndef b():\n    return 2\nprint(a(), b())", 2)))
        self.assertEqual(check("def a():\n    return [1]\ndef b():\n    return a()\nprint(b())", 2), [])
        # 중급: 클래스·예외·재귀 중 2가지 (super().__init__ 은 재귀가 아님)
        cls = "class E(Exception):\n    def __init__(self):\n        super().__init__('x')\n" + "".join(f"def f{i}():\n    return {i}\n" for i in range(4))
        self.assertTrue(any("2가지 이상" in p for p in check(cls.replace("(Exception)", ""), 3)))
        self.assertFalse(practice.py_structure(ast.parse(cls))["recursion"])
        self.assertEqual(check(cls + "def g(n):\n    return g(n - 1) if n else 0\n", 3), [])
        # 손으로 따라갈 크기: 입문 반복 10번 · 목록 6개
        self.assertTrue(any("반복이 50번" in p for p in check("t = 0\nfor i in range(50):\n    if i:\n        t += i\nprint(t)", 1)))
        self.assertTrue(any("항목이 7개" in p for p in check("a = [1, 2, 3, 4, 5, 6, 7]\nfor x in a:\n    if x:\n        print(x)", 1)))
        # JavaScript: 함수·메서드·재귀 세기 (this.f(…) 는 재귀, obj.f(…) 는 아님)
        js = lambda code: practice.js_check(code)[1]
        info = js("class A {\n  constructor() {\n    this.n = 0;\n  }\n  get size() {\n    return 1;\n  }\n  push(x) {\n    other.push(x);\n  }\n}\n"
                  "function walk(n) {\n  return n ? walk(n - 1) : 0;\n}\nconst twice = (x) => walk(x) * 2;\nfor (let i = 0; i < 30; i++) {}\nconsole.log(twice(2));")
        self.assertEqual((info["funcs"], info["classes"], info["recursion"], info["calls_between"], info["big_loop"]), (5, 1, True, True, 30))
        self.assertFalse(js("class A {\n  push(x) {\n    other.push(x);\n  }\n}\nconsole.log(1);")["recursion"])
        self.assertTrue(js("class A {\n  down(n) {\n    return n ? this.down(n - 1) : 0;\n  }\n}\nconsole.log(new A().down(2));")["recursion"])
        # JavaScript 손으로 따라갈 크기: 배열 원소 · 객체 속성 수 (Python 의 목록·사전과 같게)
        info = js("const a = [1, 2, 3, 4, 5, 6, 7];\nconst o = { x: 1, y, z: 3 };\nconsole.log(a, o);")
        self.assertEqual((info["big_list"], info["data"]), (7, True))
        self.assertTrue(any("항목이 7개" in p for p in practice.level_problems(js("const a = [1, 2, 3, 4, 5, 6, 7];\nfor (const x of a) {\n  if (x) {\n    console.log(x);\n  }\n}"), 1)))

    def test_focus_level_raises_when_concept_needs_higher_level(self):
        self.assertEqual(practice.focus_level(1, "exception")[0], 3)
        self.assertIn("중급", practice.focus_level(1, "exception")[1])
        self.assertEqual(practice.focus_level(2, "loop_update"), (2, None))
        self.assertEqual(practice.focus_level(2, None), (2, None))

    def test_javascript_shape(self):
        js = practice.js_shape_problems
        ok = 'const re = /[}]+/g;\nconst s = `합계 ${[1, 2].map((x) => { return x * 2; }).join(",")}개`;\nconst d = 10 / 2;\n// } 주석\nconsole.log(s, d, "}", re);'
        self.assertEqual(js(ok), [])
        self.assertIn("닫히지 않았어요", js("function f() {\n  if (x) {\n    return 1;\n}\nconsole.log(f());")[0])
        self.assertIn("여는 괄호가 없어요", js("const a = 1;\n}\nconsole.log(a);")[0])
        self.assertIn("따옴표", js('const a = "abc;\nconsole.log(a);')[0])
        self.assertIn("템플릿", js("const a = `abc ${b}\nconsole.log(a);")[0])
        for bad in ("console.log(Math.random());", "console.log(Date.now());", "console.log(new Date());"):   # 실행마다 결과가 달라짐
            self.assertTrue(any("Math.random" in p for p in js(bad)), bad)
        self.assertEqual(js("console.log(new Date(2026, 2, 2));"), [])   # 정해진 날짜는 됨
        self.assertTrue(any("fetch" in p for p in js('fetch("https://example.com");\nconsole.log(1);')))
        self.assertTrue(any("console.log" in p for p in js("const a = 1;")))
        self.assertTrue(any("Python" in p for p in js("def f():\n  return 1\nconsole.log(f());")))
        self.assertEqual(js('console.log("document.title 과 Math.random 은 글자일 뿐이에요");'), [])   # 문자열 안은 보지 않음
        self.assertTrue(any("document" in p for p in js("const t = `${document.title}`;\nconsole.log(t);")))   # 템플릿의 ${ } 안은 코드
        # 괄호·따옴표 짝은 맞지만 문법이 틀린 코드도 찾는다 (tree-sitter)
        for bad in ("const = 5;\nconsole.log(1);", "if x > 1 {\n  console.log(x);\n}"):
            self.assertIn("문법 오류", js(bad)[0], bad)
        self.assertIn("1번째 줄에서 연 '{'", js("function f() {\n  if (x) {\n    return 1;\n}\nconsole.log(f());")[0])

    def test_javascript_samples_are_picked_for_javascript(self):
        user = {"recentTopics": []}
        for level in (1, 2, 3, 4):
            self.assertEqual(practice.pick_sample(level, "아무 주제", user, language="javascript")["language"], "javascript")
            self.assertEqual(practice.pick_sample(level, "아무 주제", user).get("language", "python"), "python")

    def test_python_ast_checks(self):
        import ast
        ok = "import heapq\nfrom collections import deque\nfrom datetime import datetime\ndef f(a, *args, **kw):\n    try:\n        return [y for y in a if (z := y)]\n    except ValueError as e:\n        print(e, args, kw, z)\nprint(f([1]), heapq, deque, datetime(2026, 3, 2))"
        self.assertEqual(practice.py_ast_problems(ast.parse(ok)), [])
        problems = practice.py_ast_problems(ast.parse("import random\nimport time\nfrom datetime import datetime\nprint(random.randint(1, 6), time, datetime.now())"))
        self.assertTrue(any("random 모듈" in p for p in problems) and any("time 모듈" in p for p in problems) and any("now()" in p for p in problems), problems)
        bad = "import os\nimport numpy\nname = input()\ntotal = 0\nfor i in range(3):\n    totl += i\nprint(total, prise)"
        problems = practice.py_ast_problems(ast.parse(bad))
        self.assertTrue(any("os 모듈" in p for p in problems) and any("numpy 모듈" in p for p in problems))   # 운영체제 · 표준 라이브러리가 아닌 모듈
        self.assertTrue(any("input()" in p for p in problems))
        self.assertTrue(any("totl" in p for p in problems) and any("prise" in p for p in problems))   # 오타
        self.assertIn("print", practice.py_ast_problems(ast.parse("x = 1"))[0])
        _, _, problems = practice.check_generated({"title": "t", "code": "if x\n    print(1)", "marks": []}, 1)
        self.assertTrue(any("문법 오류" in p for p in problems))

    def test_find_line_prefers_hint_for_repeated_lines(self):
        lines = ["a = 1", "print(a)", "a = 2", "print(a)"]
        self.assertEqual(practice.find_line(lines, "print(a)", 0), 2)
        self.assertEqual(practice.find_line(lines, "print(a)", 0, hint=4), 4)
        self.assertIsNone(practice.find_line(lines, "없음", 0))


class ExplanationRules(unittest.TestCase):
    """규칙 검사 B (모범 설명) · 추적표 비교 — docs/GENERATION_STANDARD.md 4·5"""
    code = "total = 0\nfor p in [3000, 3500]:\n    total += p\nprint(total)"
    trace = {"flow": [], "output": ["6500"], "marks": {"m1": {"enter": "total=0", "steps": ["3번 줄 total=3000"], "exit": "total=6500", "branch": "", "count": 2}}}

    def issues(self, explanation, keywords):
        mark = {"id": "m1", "start": 2, "end": 3, "explanation": explanation, "keywords": keywords}
        return practice.explanation_issues(self.code, [mark], self.trace)

    def test_hard_and_soft_issues(self):
        fixed, issues = self.issues("가격을 하나씩 total 에 더해서 반복이 끝나면 6500이 돼요.", ["하나씩", "더해", "없는 말"])
        self.assertEqual((issues, fixed[0]["keywords"]), ({}, ["하나씩", "더해"]))   # 설명에 없는 핵심 표현은 뺀다
        _, issues = self.issues("", ["하나씩"])
        self.assertTrue(any("비어 있어요" in h for h in issues["m1"]["hard"]))
        _, issues = self.issues("예를 들어 가격을 하나씩 더해요.", ["하나씩", "더해"])
        self.assertTrue(any("가정 표현" in h for h in issues["m1"]["hard"]))
        _, issues = self.issues("가격을 하나씩 더해요." * 40, ["하나씩", "더해"])
        self.assertTrue(any("너무 길어요" in h for h in issues["m1"]["hard"]))
        _, issues = self.issues("가격을 하나씩 더해요.", ["하나씩"])
        self.assertTrue(any("핵심 표현" in h for h in issues["m1"]["hard"]))   # 채울 코드 이름·값도 없으면 꼭 지킬 것
        # v1.2: 핵심 표현이 설명과 글자가 달라도, 설명 속의 코드 이름·값으로 채워 다시 만들지 않는다
        fixed, issues = self.issues("가격을 차례로 total 에 더해서 반복이 끝나면 6500이 돼요.", ["누적 합계", "반복 더하기"])
        self.assertEqual((issues, fixed[0]["keywords"]), ({}, ["total", "6500"]))
        fixed, issues = self.issues("가격을 하나씩 total 에 더해요.", ["하나씩", "for"])   # 이미 있는 말 + 코드 이름 (문법 낱말은 빼고)
        self.assertEqual((issues, fixed[0]["keywords"]), ({}, ["하나씩", "total"]))
        # 근거 없는 숫자는 확인할 것(soft): 교차 검토가 확인한다. 줄 번호·천 단위 쉼표는 숫자로 보지 않음
        _, issues = self.issues("2~3번 줄에서 하나씩 더해 6,500이 되고 2번 돌아요. 그다음 9999가 돼요.", ["하나씩", "더해"])
        self.assertEqual((issues["m1"]["hard"], issues["m1"]["soft"]), ([], ["※ 2~3번 줄의 모범 설명 속 값 9999 이(가) 실행 추적표·출력·코드에 없어요"]))

    def test_compare_traces(self):
        marks = [{"id": "m1"}]
        same = {"output": ["6500"], "marks": [{"id": "m1", "exit": "total = 6500", "count": 2}]}
        self.assertEqual(practice.compare_traces(self.trace, same, marks), {"reviewed": True, "traceAgree": {"m1": True}, "outputAgree": True})
        other = {"output": ["6000"], "marks": [{"id": "m1", "exit": "total=6000", "count": 2}]}
        self.assertEqual(practice.compare_traces(self.trace, other, marks)["traceAgree"], {"m1": False})
        self.assertFalse(practice.compare_traces(self.trace, None, marks)["reviewed"])
        self.assertEqual(practice.parse_state("a=1, items=['x', 'y'], b = {k: 1, j: 2}"), {"a": "1", "items": "[x,y]", "b": "{k:1,j:2}"})


class CodeCheckPipeline(unittest.TestCase):
    """① 출제 → 규칙 검사 A → ② 실행 추적표 → 규칙 검사 B → ③ 교차 검토 → 걸리면 다시 (최대 2번) → 예시 코드 (AI 는 가짜로 바꿔 끼운다)"""

    def setUp(self):
        self.saved = practice.ask_ai, practice.ai_allowed, practice.log_ai_event
        practice.ai_allowed = lambda req: True
        practice.log_ai_event = lambda *a, **k: None
        self.sample = next(s for s in samples.SAMPLES if s["id"] == "sample-cafe")
        self.calls, self.prompts = [], {}

    def tearDown(self):
        practice.ask_ai, practice.ai_allowed, practice.log_ai_event = self.saved

    def trace(self, explanation=None):
        m = self.sample["marks"][0]
        return {"flow": [{"line": 8, "event": "loop", "detail": "3번 반복", "state": "total=10000"}], "output": ["결제할 금액: 9000"],
                "marks": [{"id": "m1", "enter": "total=0", "steps": ["8번 줄 total=3000", "8번 줄 total=6500", "8번 줄 total=10000"],
                           "exit": "total=10000", "branch": "", "count": 3, "explanation": explanation or m["explanation"], "keywords": m["keywords"]}]}

    ok = {"trace": {"output": ["결제할 금액: 9000"], "marks": [{"id": "m1", "enter": "total=0", "exit": "total=10000", "count": 3}]},
          "codeProblems": [], "marks": [{"id": "m1", "ok": True}]}

    def run_with(self, checks, traces=None, bad_first=False, level=1, wide_first=False, reselects=None, grade="standard", fix_works=True):
        """checks: 교차 검토가 차례로 돌려줄 답 / traces: 실행 추적표가 차례로 돌려줄 답 (예외면 그 예외를 던짐)
        wide_first: 첫 출제의 ※ 를 코드 전체로 (※ 위치만 문제) / reselects: ※ 다시 고르기가 차례로 돌려줄 ※ (없으면 예시 코드의 ※)"""
        checks, traces, reselects = list(checks), list(traces or []), list(reselects or [])
        good_marks = practice.sample_as_ai(self.sample)["marks"]

        def fake(task, system, prompt, schema, **kw):
            self.calls.append(task)
            self.prompts.setdefault(task, []).append(prompt)
            if task == "code_generation":
                r = practice.sample_as_ai(self.sample)
                if bad_first and self.calls.count("code_generation") == 1:
                    r = {**r, "code": r["code"].replace("total = total + price", "total = totl + price")}   # 오타 → 규칙 검사 A 에서 걸림
                if wide_first and self.calls.count("code_generation") == 1:
                    lines = r["code"].split("\n")
                    r = {**r, "marks": [{**r["marks"][0], "startLine": lines[0], "endLine": lines[-1], "startNo": 1, "endNo": len(lines)}]}
                return {k: v for k, v in r.items() if k != "_mock"}
            if task == "mark_reselect":
                return {"marks": reselects.pop(0) if reselects else good_marks}
            if task == "code_fix":   # 오타 줄만 고쳐 돌려준다 (fix_works=False 면 고치지 못함)
                body = prompt.split("<code>")[1].split("</code>")[0].strip("\n").split("\n")
                bad = [(int(line.split("| ", 1)[0]), line.split("| ", 1)[1]) for line in body if "totl" in line]
                if not fix_works or not bad:
                    return {"edits": []}
                return {"edits": [{"startNo": bad[0][0], "endNo": bad[0][0], "code": bad[0][1].replace("totl", "total")}]}
            answer = (traces.pop(0) if traces else self.trace()) if task == "code_trace" else checks.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return answer
        practice.ask_ai = fake
        return practice.make_code({}, level, "카페 주문", {"recentTopics": []}, prompt_extra="", language="python", grade=grade)

    def test_passes_with_trace_and_records_checks(self):
        made = self.run_with([self.ok])
        self.assertEqual((made["origin"], made["verification"], self.calls), ("ai", "ai_reviewed", ["code_generation", "code_trace", "code_check"]))
        self.assertEqual(made["marks"][0]["explanation"], self.sample["marks"][0]["explanation"])   # 모범 설명은 ② 에서 온다
        self.assertEqual(made["trace"]["marks"]["m1"]["exit"], "total=10000")
        self.assertEqual((made["checks"]["traceAgree"], made["checks"]["outputAgree"]), ({"m1": True}, True))
        self.assertNotIn("10000", self.prompts["code_check"][0].split("<code")[0].split("모범 설명")[0])   # 검토에는 생성 쪽 추적표를 주지 않는다

    def test_fixes_wrong_explanation(self):
        fixed = {**self.ok, "marks": [{"id": "m1", "ok": False, "problem": "합계가 틀림", "explanation": "고친 설명이에요.", "keywords": ["고친", "설명"]}]}
        made = self.run_with([fixed])
        self.assertEqual((made["origin"], made["marks"][0]["explanation"], made["marks"][0]["keywords"]), ("ai", "고친 설명이에요.", ["고친", "설명"]))

    def test_check_code_problem_is_fixed_in_place_then_traced_again(self):
        # v1.3: 교차 검토가 찾은 코드 문제는 부분 수정 → ②·③ 다시 (① 부터 다시 만들지 않음)
        made = self.run_with([{**self.ok, "codeProblems": ["7번째 줄: 없는 메뉴를 찾아 오류"]}, self.ok])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_trace", "code_check", "code_fix", "code_trace", "code_check"]))
        self.assertIn("없는 메뉴", self.prompts["code_fix"][0])

    def test_rule_problem_is_fixed_by_editing_lines(self):
        made = self.run_with([self.ok], bad_first=True)
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_fix", "code_trace", "code_check"]))
        self.assertIn("total = total + price", made["code"])
        self.assertNotIn("totl", made["code"])

    def test_fix_that_does_not_fix_makes_code_again(self):
        made = self.run_with([self.ok], bad_first=True, fix_works=False)
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_fix", "code_generation", "code_trace", "code_check"]))

    def test_apply_edits(self):
        code = "a = 1\nb = 2\nc = 3\nprint(a + b + c)"
        self.assertEqual(practice.apply_edits(code, [{"startNo": 2, "endNo": 2, "code": "b = 20\nd = 4"}, {"startNo": 4, "endNo": 4, "code": "print(a + b + c + d)"}]),
                         "a = 1\nb = 20\nd = 4\nc = 3\nprint(a + b + c + d)")
        self.assertEqual(practice.apply_edits(code, [{"startNo": 3, "endNo": 3, "code": ""}]), "a = 1\nb = 2\nprint(a + b + c)")
        self.assertIsNone(practice.apply_edits(code, [{"startNo": 1, "endNo": 2, "code": "x"}, {"startNo": 2, "endNo": 3, "code": "y"}]))   # 겹침
        self.assertIsNone(practice.apply_edits(code, [{"startNo": 4, "endNo": 9, "code": "x"}]))   # 범위 밖

    def test_size_problem_is_not_patched(self):
        called = []
        saved = practice.fix_code
        practice.fix_code = lambda *a, **k: called.append(1)
        try:
            _, _, _, problems, used = practice.repair({}, "x", [], ["코드가 200줄이라 너무 길어요 (180줄 이하)"], 4, "python", ("algorithm",), "standard", used_fix=False)
        finally:
            practice.fix_code = saved
        self.assertEqual((called, used, len(problems)), ([], False, 1))

    def test_grade_changes_mark_and_explanation_guidance_but_not_review(self):
        self.run_with([self.ok], grade="basic")
        self.assertIn("학습자 등급: 기초", self.prompts["code_generation"][0])
        self.assertIn("학습자 등급 '기초'", self.prompts["code_trace"][0])
        self.assertNotIn("등급", self.prompts["code_check"][0])   # 교차 검토는 정확성만 (등급을 주지 않음)
        self.calls.clear(); self.prompts.clear()
        self.run_with([self.ok])
        self.assertNotIn("학습자 등급", self.prompts["code_generation"][0])   # 보통(기본)은 지금 그대로

    def test_explanation_only_issue_redoes_trace_and_check_not_code(self):
        # v1.2: 모범 설명만 문제면 코드는 그대로 ②·③ 만 한 번 더
        made = self.run_with([self.ok, self.ok], traces=[self.trace("예를 들어 가격을 하나씩 더해 10000원이 돼요.")])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_trace", "code_check", "code_trace", "code_check"]))

    def test_explanation_issue_twice_makes_code_again(self):
        bad = self.trace("예를 들어 가격을 하나씩 더해 10000원이 돼요.")
        made = self.run_with([self.ok] * 3, traces=[bad, bad])
        self.assertEqual((made["origin"], self.calls),
                         ("ai", ["code_generation", "code_trace", "code_check", "code_trace", "code_check", "code_generation", "code_trace", "code_check"]))

    def test_mark_only_problem_reselects_marks_and_keeps_code(self):
        # v1.2: ※ 범위만 문제면 코드는 그대로 두고 ※ 만 다시 고른다 (① 부터 다시 만들지 않음)
        made = self.run_with([self.ok], wide_first=True)
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "mark_reselect", "code_trace", "code_check"]))
        self.assertIn("너무 넓어요", self.prompts["mark_reselect"][0])
        self.assertIn(" 1| ", self.prompts["mark_reselect"][0])   # 줄 번호를 붙인 코드

    def test_reselect_that_still_fails_makes_code_again(self):
        lines = self.sample["code"].split("\n")
        wide = [{"startLine": lines[0], "endLine": lines[-1], "startNo": 1, "endNo": len(lines)}]
        made = self.run_with([self.ok], wide_first=True, reselects=[wide])
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "mark_reselect", "code_generation", "code_trace", "code_check"]))

    def test_code_and_mark_problems_fix_code_then_reselect(self):
        made = self.run_with([self.ok], bad_first=True, wide_first=True)
        self.assertEqual((made["origin"], self.calls), ("ai", ["code_generation", "code_fix", "mark_reselect", "code_trace", "code_check"]))

    def test_unsupported_number_goes_to_check(self):
        m = self.sample["marks"][0]
        made = self.run_with([self.ok], traces=[self.trace(m["explanation"] + " 마지막에는 77777원이에요.")])
        self.assertEqual(made["origin"], "ai")   # soft: 검토가 맞다고 하면 통과, 기록은 남김
        self.assertIn("규칙 검사:", self.prompts["code_check"][0])
        self.assertIn("77777", made["checks"]["unsupported"]["m1"][0])

    def test_gives_sample_when_problems_remain(self):
        problem = {**self.ok, "codeProblems": ["무한 반복"]}
        made = self.run_with([problem] * practice.GEN_ATTEMPTS * 2)   # 시도마다: 검토 → 부분 수정 → 다시 검토
        self.assertEqual((made["origin"], made["verification"], self.calls.count("code_generation")), ("sample", "sample_verified", 3))

    def test_check_unavailable_trusts_rule_checks(self):
        made = self.run_with([ai.AiUnavailable("budget")])
        self.assertEqual((made["origin"], made["verification"]), ("ai", "rule_checked"))

    def test_trace_unavailable_gives_sample(self):
        made = self.run_with([], traces=[ai.AiUnavailable("budget")])
        self.assertEqual((made["origin"], self.calls), ("sample", ["code_generation", "code_trace"]))


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
        read = lambda body: inspect_code.read_code(core.read_body({"body": body}, inspect_code.CodeIn))
        with self.assertRaises(core.ApiError):
            read({"code": "print(1)", "filename": "app.js"})
        with self.assertRaises(core.ApiError):
            read({"code": "x = 1\n" * (core.MAX_CODE_LINES + 1), "filename": "a.py"})
        with self.assertRaises(core.ApiError):
            read({"filename": "a.py"})   # 코드가 없으면 400
        self.assertEqual(read({"code": "x = 1", "filename": "a.py"}), ("x = 1", "python"))


class RuleReview(unittest.TestCase):
    ITEM = {"codeId": "r1", "code": "\n".join(f"line{i}" for i in range(1, 21)), "marks": [
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
        self.assertEqual(code_store.review_key(rv, "RETRY", 2), "REVIEW#0000000001#RETRY#002")

    def test_read_memos_drops_empty_and_sorts(self):
        body = lambda memos: core.read_body({"body": {"codeId": "r1", "memos": memos}}, review.ReviewIn).memos
        memos = review.read_memos(body([{"start": 9, "end": 5, "text": " 뒤 "}, {"start": 1, "end": 1, "text": "  "}]), self.ITEM["code"])
        self.assertEqual(memos, [{"start": 5, "end": 9, "text": "뒤"}])
        with self.assertRaises(core.ApiError):   # 코드 밖의 줄
            review.read_memos(body([{"start": 1, "end": 21, "text": "x"}]), self.ITEM["code"])
        with self.assertRaises(core.ApiError):   # 메모가 너무 많음
            body([{"start": 1, "end": 1, "text": "x"}] * (core.MAX_MEMOS + 1))


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
        self.assertEqual(tutor.chat_key({"sk": "REVIEW#0000000001"}, 3), "REVIEW#0000000001#CHAT#003")


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
        self.assertEqual(code_store.guess_concept(self.CODE, 3, 4), "loop_update")
        self.assertEqual(code_store.guess_concept(self.CODE, 9, 9), "recursion")
        self.assertEqual(code_store.guess_concept(self.CODE, 7, 8), "branch")
        self.assertEqual(code_store.guess_concept(self.CODE, 10, 10), "call_flow")   # 맨 바깥에서 부르면 재귀가 아님
        self.assertEqual(code_store.guess_concept(self.CODE, 11, 14), "exception")

    JS = "\n".join([
        "function count(group) {",             # 1
        "  let total = group.size;",           # 2
        "  for (const t of group.teams) {",    # 3
        "    total += count(t);",              # 4
        "  }",                                 # 5
        "  return total;",                     # 6
        "}",                                   # 7
        "class Card {",                        # 8
        "  use(n) {",                          # 9
        "    this.points -= n;",               # 10
        "  }",                                 # 11
        "}",                                   # 12
        "try {",                               # 13
        "  throw new Error('x');",             # 14
        "} catch (e) {}",                      # 15
        "} else if (a) {",                     # 16
        "console.log(count(root));",           # 17
    ])

    def test_guess_concept_javascript(self):
        self.assertEqual(code_store.guess_concept(self.JS, 1, 7), "recursion")     # 범위가 함수 첫 줄부터: 자기 자신을 부름
        self.assertEqual(code_store.guess_concept(self.JS, 4, 4), "recursion")
        self.assertEqual(code_store.guess_concept(self.JS, 10, 10), "class_state")
        self.assertEqual(code_store.guess_concept(self.JS, 13, 15), "exception")
        self.assertEqual(code_store.guess_concept(self.JS, 16, 16), "branch")
        self.assertEqual(code_store.guess_concept(self.JS, 17, 17), "call_flow")

    def test_every_sample_mark_has_valid_concept(self):
        for s in samples.SAMPLES:
            for m in s["marks"]:
                self.assertIn(m["concept"], core.CONCEPTS, s["id"])

    def test_clean_marks_keeps_or_guesses_concept(self):
        marks = code_store.clean_marks(self.CODE, [{"start": 3, "end": 4, "concept": "algorithm"}, {"start": 7, "end": 8, "concept": "모름"}])
        self.assertEqual([m["concept"] for m in marks], ["algorithm", "branch"])


def study_row(level, marks, source="practice", at=0):
    items = [{"concept": c, "first": f, "best": b, "marked": True, "start": 1, "end": 2, "memo": "설명", "bestText": "설명", "snippet": None}
             for c, f, b in marks]
    return {"codeId": f"r{at}", "source": source, "level": level, "title": "t", "counts": {}, "items": items, "reviewedAt": at}


class TimeOrderedId(unittest.TestCase):
    def test_new_id_is_uuid7_sorted_by_time(self):
        import re
        import uuid
        early, late = core.new_id(ms=1_700_000_000_000), core.new_id(ms=1_800_000_000_000)
        for i in (early, late):
            self.assertEqual(uuid.UUID(i).version, 7)
            self.assertTrue(core.SESSION_ID.match(i))                # 학습자 id 헤더 검사를 그대로 통과
            self.assertTrue(re.fullmatch(r"[0-9a-f-]{36}", i))         # load_code 의 코드 id 검사도
        self.assertLess(early, late)                                   # 문자열 정렬 = 만든 순서
        self.assertEqual(int(late.replace("-", "")[:12], 16), 1_800_000_000_000)   # 앞 12글자 = 밀리초 시각
        self.assertNotEqual(core.new_id(ms=1), core.new_id(ms=1))  # 같은 밀리초여도 무작위 부분이 다름


class KeepTime(unittest.TestCase):
    def test_anonymous_is_short_member_is_long(self):
        anon, member = {"member": False}, {"member": True}
        self.assertEqual(core.keep_seconds(anon, "user"), core.ANON_HOURS * 3600)
        self.assertEqual(core.keep_seconds(anon, "study"), core.ANON_CODE_HOURS * 3600)
        self.assertEqual(core.keep_seconds(member, "study"), core.MEMBER_DAYS * 86400)
        self.assertEqual(core.keep_seconds(member, "upload"), core.UPLOAD_KEEP_DAYS * 86400)   # 올린 코드는 로그인해도 짧게


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


class Login(unittest.TestCase):
    def test_return_address_must_be_allowed(self):
        auth = load_lambda("auth")
        allowed = auth.ALLOWED_ORIGINS[:]
        auth.ALLOWED_ORIGINS[:] = ["https://example.github.io"]
        try:
            self.assertEqual(auth.safe_return("https://example.github.io/app/study/#x"), "https://example.github.io/app/study/")
            with self.assertRaises(core.ApiError):
                auth.safe_return("https://evil.example.com/")
            with self.assertRaises(core.ApiError):
                auth.safe_return("javascript:alert(1)")
        finally:
            auth.ALLOWED_ORIGINS[:] = allowed

    def test_callback_address_uses_function_url(self):
        auth = load_lambda("auth")
        req = {"host": "abc.lambda-url.ap-northeast-2.on.aws", "domain": "abc.lambda-url.ap-northeast-2.on.aws"}
        if not auth.LOCAL_DEV and not os.environ.get("AUTH_CALLBACK_BASE"):
            self.assertEqual(auth.callback_url(req, "google"), "https://abc.lambda-url.ap-northeast-2.on.aws/auth/callback/google")

    def test_same_name_is_still_a_different_account(self):
        auth = load_lambda("auth")
        db = {}
        saved = auth.get_item, auth.put_item, auth.update_item
        auth.get_item = lambda pk, sk: db.get((pk, sk))
        auth.put_item = lambda item: db.__setitem__((item["pk"], item["sk"]), dict(item))
        auth.update_item = lambda pk, sk, set_values=None, **_: db[(pk, sk)].update(set_values or {})
        try:
            kim1 = auth.account_user("google", {"id": "1001", "name": "김철수"})
            kim2 = auth.account_user("google", {"id": "2002", "name": "김철수"})   # 동명이인
            again = auth.account_user("google", {"id": "1001", "name": "김철수(새 이름)"})   # 이름만 바뀜
            self.assertNotEqual(kim1, kim2)
            self.assertEqual(kim1, again)
            self.assertEqual(db[(core.user_pk(kim1), core.PROFILE)]["name"], "김철수(새 이름)")
        finally:
            auth.get_item, auth.put_item, auth.update_item = saved

    def test_unknown_provider_is_refused(self):
        with self.assertRaises(core.ApiError):
            load_lambda("auth").provider_of("kakao")


class KeyNames(unittest.TestCase):
    """키 이름표 (core.py 4번 구역) · 첨삭과 딸린 다시 쓰기·대화"""

    def test_review_children_live_under_their_review(self):
        rv1 = {"sk": "REVIEW#0000000000000100", "result": {}}
        rv2 = {"sk": "REVIEW#0000000000000200", "result": {}}
        rows = [rv1, {"sk": code_store.review_key(rv1, "CHAT", 0)}, {"sk": code_store.review_key(rv1, "RETRY", 2), "attempts": [1]},
                rv2, {"sk": code_store.review_key(rv2, "CHAT", 3), "turns": []}]
        self.assertEqual(code_store.review_key(rv2, "CHAT", 3), "REVIEW#0000000000000200#CHAT#003")
        self.assertIs(code_store.latest_review("x", rows), rv2)                      # 대화·다시 쓰기는 첨삭으로 치지 않음
        self.assertEqual(list(code_store.review_children(rv2, "CHAT", rows)), [3])  # 최신 첨삭에 딸린 것만
        self.assertEqual(list(code_store.review_children(rv1, "RETRY", rows)), [2])


if __name__ == "__main__":
    unittest.main()
