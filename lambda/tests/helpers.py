"""
Python Lambda 단위 테스트 도우미 (npm run test:lambda). AWS 에 연결하지 않는다.
lambda/shared 와 함수 3개 폴더(lambda/jojo_*)를 불러온다. 기능 파일 이름은 겹치지 않는다 (auth · generate · grade …)
"""
import os
import sys

LAMBDA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCTIONS = ["jojo_auth", "jojo_practice", "jojo_review"]
sys.path[:0] = [os.path.join(LAMBDA_DIR, "shared")] + [os.path.join(LAMBDA_DIR, f) for f in FUNCTIONS]
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")
os.environ.setdefault("POWERTOOLS_LOG_LEVEL", "WARNING")   # 시험 중에는 경고 이상만

import ai  # noqa: E402
import core  # noqa: E402


class FakeDb:
    """core 의 DynamoDB 도구 대신 dict (get_item·put_item·update_item·query_all·delete_item)"""

    def __init__(self, *modules):
        self.rows, self.modules, self.saved = {}, (core, *modules), []

    def __enter__(self):
        fakes = {"get_item": lambda pk, sk: self.rows.get((pk, sk)),
                 "put_item": lambda item: self.rows.__setitem__((item["pk"], item["sk"]), dict(item)),
                 "delete_item": lambda pk, sk: self.rows.pop((pk, sk), None),
                 "query_all": lambda pk, prefix=None, **_: [v for (p, s), v in sorted(self.rows.items()) if p == pk and s.startswith(prefix or "")],
                 "update_item": self.update, "hit_limit": lambda *a: True}
        for m in self.modules:
            for name, fn in fakes.items():
                if hasattr(m, name):
                    self.saved.append((m, name, getattr(m, name)))
                    setattr(m, name, fn)
        return self

    def update(self, pk, sk, set_values=None, add_values=None, return_new=False, **_):
        row = self.rows.setdefault((pk, sk), {"pk": pk, "sk": sk})
        row.update(set_values or {})
        for k, v in (add_values or {}).items():
            row[k] = row.get(k, 0) + v
        return dict(row)

    def __exit__(self, *exc):
        for m, name, fn in reversed(self.saved):
            setattr(m, name, fn)


def request(body=None, headers=None, user=None, query=None):
    return {"body": body or {}, "headers": headers or {}, "ip": "test", "query": query or {}, **({"user": user} if user else {})}


__all__ = ["FUNCTIONS", "LAMBDA_DIR", "FakeDb", "ai", "core", "request"]
