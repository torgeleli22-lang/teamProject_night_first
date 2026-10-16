import hashlib
import json
import os

from common import (batch_delete, batch_put, bump_content_version, get_item, now_ms, put_item, query_all, update_item)

# ─────────────────────────────────────────────────────────────
# 문제 데이터 넣기 (load_content.py) — jojo_api 가 하는 일
#   같은 폴더의 content.json(커리큘럼 + 시드 문제)을 DynamoDB 에 넣는다.
#   처음 배포할 때, 그리고 content.json 을 새로 받았을 때 콘솔 '테스트' 버튼으로 한 번 실행하면 된다.
#
#   넣는 항목:
#     META / curriculum      단원·개념·난이도·자격증 (generate-code 함수가 읽음)
#     CONTENT / <코드 id>     시드 코드와 문제 (source = seed). AI 가 만든 콘텐츠(source = ai)는 건드리지 않는다
#     META / seed_hash       넣은 내용의 지문 (같으면 다시 넣지 않음)
#
#   콘솔 테스트 이벤트: {"task": "load-content"}  (내용이 같아도 다시 넣으려면 {"task": "load-content", "force": true})
# ─────────────────────────────────────────────────────────────

CONTENT_FILE = os.path.join(os.path.dirname(__file__), "content.json")
CONTENT_MODEL = "2"   # 학습 구조 번호 ("개념 / 코드" 두 갈래). 구조가 바뀔 때만 올린다


def run(event):
    force = bool((event or {}).get("force"))

    # 1. content.json 읽기
    with open(CONTENT_FILE, encoding="utf-8") as f:
        content = json.load(f)
    seed = content["seed"]

    # 2. 학습 구조가 바뀌었으면 예전 문제·학습 기록을 한 번 지운다 (AI 사용량·설정은 남김)
    reset = reset_for_content_model()

    # 3. 커리큘럼 저장 (항상)
    put_item({"pk": "META", "sk": "curriculum", "data": content["curriculum"]})

    # 4. 시드가 지난번과 같으면 여기서 끝
    fingerprint = hashlib.sha256(json.dumps(seed, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    if not force and (get_item("META", "seed_hash") or {}).get("value") == fingerprint:
        bump_content_version()   # 커리큘럼은 새로 읽게 한다
        return {"ok": True, "changed": False, "reset": reset, "items": len(seed)}

    # 5. content.json 에서 빠진 시드는 지운다 (AI 콘텐츠는 그대로)
    seed_ids = {s["item"]["id"] for s in seed}
    stale = [r for r in query_all("CONTENT") if r.get("source") == "seed" and r["sk"] not in seed_ids]
    batch_delete(stale)

    # 6. 시드 코드·문제 넣기 (코드 하나 = 항목 하나, 문제는 그 안에)
    now = now_ms()
    batch_put([{
        "pk": "CONTENT",
        "sk": s["item"]["id"],
        "item": {**s["item"], "source": "seed", "status": "published", "createdAt": now},
        "questions": s["questions"],
        "source": "seed",
        "status": "published",
        "createdAt": now,
    } for s in seed])

    # 7. 지문 저장 + 문제 목록을 다시 읽도록 버전 올리기
    put_item({"pk": "META", "sk": "seed_hash", "value": fingerprint})
    bump_content_version()
    return {"ok": True, "changed": True, "reset": reset, "items": len(seed), "removed": len(stale),
            "questions": sum(len(s["questions"]) for s in seed)}


def reset_for_content_model():
    """META / content_model 이 지금 구조 번호와 다르면 예전 문제·학습 기록·랭킹을 지운다 (한 번만)"""
    claimed = update_item("META", "content_model", set_values={"value": CONTENT_MODEL},
                          condition="attribute_not_exists(pk) OR #cv <> :cv", names={"#cv": "value"}, values={":cv": CONTENT_MODEL})
    if claimed is None:
        return False
    for learner in query_all("LEARNER"):
        batch_delete(query_all(f"S#{learner['sk']}"))
    for pk in ("LEARNER", "CONTENT", "DEMAND", "STATS", "JOB"):
        batch_delete(query_all(pk))
    batch_delete([{"pk": "META", "sk": "seed_hash"}])
    print("[load-content] 새 학습 구조로 바꾸며 예전 문제·학습 기록을 지웠어요 (AI 사용량·설정은 유지)")
    return True
