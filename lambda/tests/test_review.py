"""jojo_review: 채점 기준 = 검토 기록 · 빈칸 · 규칙 채점 / jojo_auth: 로그인"""
import os
import unittest
import unittest.mock

from helpers import FakeDb, core, request

import auth
import grade

ITEM = {"codeId": "0" * 8 + "-0000-7000-8000-" + "0" * 12, "userId": "me", "language": "python", "level": 1,
        "code": "total = 0\nfor p in [1, 2, 3]:\n    total += p\nprint(total)",
        "units": [{"id": "u1", "start": 2, "end": 3, "kind": "loop", "key": True, "inputs": "목록 [1, 2, 3]", "steps": ["3번 줄 total=1", "3번 줄 total=3"],
                   "result": "total=6", "count": 3, "stop": "목록을 다 돌면", "explanation": "목록의 수를 하나씩 total 에 더해 6이 돼요.", "keywords": ["하나씩", "더해"]},
                  {"id": "u2", "start": 4, "end": 4, "kind": "block", "key": True, "inputs": "", "steps": [], "result": "6 출력", "count": None, "stop": "",
                   "explanation": "합계를 출력해요.", "keywords": ["출력"]}]}


class Grading(unittest.TestCase):
    def test_prompt_uses_review_record_as_standard(self):
        prompt = grade.build_prompt(ITEM, [{"start": 2, "end": 3, "text": "반복하며 더해요"}], [ITEM["units"][1]])
        for text in ("넣은 값: 목록 [1, 2, 3]", "3번 줄 total=3", "반복·재귀 횟수: 3", "멈춘 조건: 목록을 다 돌면", "모범 설명: 목록의 수를"):
            self.assertIn(text, prompt)
        self.assertIn("u2 (4~4번 줄)", prompt)   # 메모가 없는 설명할 곳
        self.assertIn("흐름을 이해했는지", grade.SYSTEM_PROMPT)

    def test_review_marks_missing_and_returns_record(self):
        user = {"userId": "me", "member": False, "recentTopics": []}
        with FakeDb(grade) as db:
            db.rows[(core.code_pk(ITEM["codeId"]), core.INFO)] = ITEM
            with unittest.mock.patch.object(grade, "ai_allowed", lambda req: False):   # AI 없이 규칙 채점
                out = grade.review(request({"codeId": ITEM["codeId"], "memos": [{"start": 2, "end": 3, "text": "하나씩 더해요"}]}, user=user))
            again = grade.get_code(request(query={"codeId": ITEM["codeId"]}, user=user))
        self.assertEqual(out["counts"], {"correct": 1, "partial": 0, "wrong": 0, "missing": 1})
        memo = out["items"][0]
        self.assertEqual((memo["model"], memo["marked"]), (ITEM["units"][0]["explanation"], True))
        self.assertIn("반복·재귀 횟수: 3", memo["trace"])
        self.assertEqual(again["review"]["counts"], out["counts"])
        self.assertNotIn("explanation", str(again["codeItem"]))

    def test_memo_outside_code_is_400(self):
        with self.assertRaises(core.ApiError):
            grade.read_memos([grade.MemoIn(start=9, end=9, text="x")], ITEM["code"])


class Login(unittest.TestCase):
    def test_return_address_must_be_allowed(self):
        allowed = auth.ALLOWED_ORIGINS[:]
        auth.ALLOWED_ORIGINS[:] = ["https://example.github.io"]
        try:
            self.assertEqual(auth.safe_return("https://example.github.io/app/#x"), "https://example.github.io/app/")
            for bad in ("https://evil.example.com/", "javascript:alert(1)"):
                with self.assertRaises(core.ApiError):
                    auth.safe_return(bad)
        finally:
            auth.ALLOWED_ORIGINS[:] = allowed

    def test_callback_address_uses_function_url(self):
        req = {"host": "abc.lambda-url.ap-northeast-2.on.aws", "domain": "abc.lambda-url.ap-northeast-2.on.aws"}
        if not auth.LOCAL_DEV and not os.environ.get("AUTH_CALLBACK_BASE"):
            self.assertEqual(auth.callback_url(req, "google"), "https://abc.lambda-url.ap-northeast-2.on.aws/auth/callback/google")

    def test_same_name_is_still_a_different_account(self):
        with FakeDb(auth) as db:
            kim1 = auth.account_user("google", {"id": "1001", "name": "김철수"})
            kim2 = auth.account_user("google", {"id": "2002", "name": "김철수"})
            again = auth.account_user("google", {"id": "1001", "name": "김철수(새 이름)"})
            self.assertEqual(db.rows[(core.user_pk(kim1), core.PROFILE)]["name"], "김철수(새 이름)")
        self.assertNotEqual(kim1, kim2)
        self.assertEqual(kim1, again)

    def test_unknown_provider_is_refused(self):
        with self.assertRaises(core.ApiError):
            auth.provider_of("kakao")


if __name__ == "__main__":
    unittest.main()
