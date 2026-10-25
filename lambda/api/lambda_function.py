import admin
import auth
import inspect_code
import practice
import review
import study
import topics
import tutor_chat
from common import AI_MODE, LANGUAGES, MAX_CODE_LINES, REGEN_LIMIT, ApiError, ai_enabled, read_request, reply, run_route

# ─────────────────────────────────────────────────────────────
# 코드 리딩 노트 API — Lambda 함수 하나 (jojo_api, Python)
#
#   화면(GitHub Pages) ──JSON──▶ 함수 URL ──▶ 이 파일 ──▶ 기능 파일 ──▶ DynamoDB(저장) · Bedrock(AI)
#
#   기능 파일 (같은 함수 안의 파일들)
#     auth.py           GET /me, /auth/start, /auth/callback/…, POST /auth/logout   Google·GitHub 로그인
#     topics.py         GET /topic/random, POST /topic/check            주제 고르기 (랜덤 · 직접 적은 주제 AI 판정)
#     practice.py       POST /practice /practice/adjust, GET /code    연습 코드 만들기 · 더 쉽게/어렵게 · 다시 읽기
#     inspect_code.py   POST /inspect /inspect/start                     내 코드 점검 (민감 정보 가리기 · 함수 고르기 · 난이도 추정)
#     review.py         POST /review /review/retry                       빨간펜 첨삭 (○△✕ · 빈칸) · 힌트 보고 다시 써 보기
#     tutor_chat.py     POST /tutor                                      첨삭 뒤 메모마다 AI 튜터와 대화
#     study.py          GET /study                                       내 공부: 난이도 추천 · 개념별 약점 지도 · 내 설명 노트 (AI 없음)
#     admin.py          /admin/...                                       관리자 화면 (AI 사용량·비용·AI 끄기, 관리자 코드 필요)
#     samples.py        AI 를 쓸 수 없을 때의 예시 코드 · 랜덤 주제 목록
#     common.py         모든 기능이 함께 쓰는 도구 (요청·응답, 요청 수 제한, 학습자, DynamoDB, AI, 읽을 코드)
# ─────────────────────────────────────────────────────────────


def need(module, name):
    """기능 파일에서 name(ROUTES)을 꺼낸다. 없으면 콘솔에 붙여넣은 파일이 비었거나 잘못됐다고 알려 준다"""
    if not hasattr(module, name):
        raise RuntimeError(
            f"{module.__name__}.py 에 {name} 이(가) 없어요. 콘솔의 {module.__name__}.py 가 비어 있거나, 일부만 붙여넣어졌거나, "
            f"다른 파일 내용이 들어갔을 수 있어요. GitHub 의 lambda/api/{module.__name__}.py 전체를 다시 붙여넣고 Deploy 해 주세요."
        )
    return getattr(module, name)


def health(req):
    """연결 확인 (콘솔 테스트 이벤트: {"path": "/health", "method": "GET"})"""
    return {"ok": True, "mode": AI_MODE, "ai": ai_enabled(), "languages": list(LANGUAGES),
            "maxCodeLines": MAX_CODE_LINES, "regenLimit": REGEN_LIMIT}


# 경로 → 처리 함수 (기능 파일마다 있는 ROUTES 를 합친 표)
ROUTES = {"GET /health": health}
for feature in (auth, topics, practice, inspect_code, review, tutor_chat, study, admin):
    ROUTES.update(need(feature, "ROUTES"))


def lambda_handler(event, context):
    # 1. 화면에서 온 요청 꺼내기 (경로·학습자 헤더·본문·접속 IP)
    req = read_request(event)

    # 2. 관리자 경로는 관리자 코드부터 확인 (틀리면 401, 여러 번 틀리면 429)
    if req["path"].startswith("/admin") and req["method"] != "OPTIONS":
        try:
            admin.require_admin(req)
        except ApiError as e:
            return reply(e.status, {"error": e.message}, req)

    # 3. 경로에 맞는 기능 실행 → 응답 (요청 수 제한·오류 처리는 run_route 가 함께 한다)
    return run_route(req, ROUTES)
