import admin
import generate_theory
import learner_analysis
import load_content
import my_page
import questions
import submit_answer
import tutor_chat
from common import ApiError, read_request, reply, run_route

# ─────────────────────────────────────────────────────────────
# 코드리딩 API — Lambda 함수 하나 (jojo_api, Python 3.13)
#
#   화면(GitHub Pages) ──JSON──▶ 함수 URL ──▶ 이 파일 ──▶ 기능 파일 ──▶ DynamoDB(저장) · Bedrock(AI)
#
#   기능 파일 (같은 함수 안의 파일들)
#     questions.py         POST /session  /hint,  GET /concepts          문제 고르기·힌트·탐색
#     submit_answer.py     POST /attempts /explain                        채점·기록
#     tutor_chat.py        POST /ask                                      튜터 대화
#     my_page.py           GET /me /learn /review /dashboard /ranking /health, POST /me
#     admin.py             /admin/...                                     관리자 화면 (관리자 코드 필요)
#     learner_analysis.py  뒤에서: 학습자 분석 (10문제마다)
#     generate_theory.py   뒤에서: 개념 문제 AI 생성
#     load_content.py      콘솔에서: 기본 문제 넣기
#     common.py            모든 기능이 함께 쓰는 도구 (요청·응답, 요청 수 제한, 학습자, DynamoDB, AI)
#     content.json         커리큘럼 + 기본 문제
#
#   코드 문제 AI 생성만 따로 있는 Node.js 함수(jojo_generate_code)가 한다 (코드를 실제로 실행해서 확인)
# ─────────────────────────────────────────────────────────────

# 경로 → 처리 함수 (기능 파일마다 있는 ROUTES 를 합친 표)
ROUTES = {**questions.ROUTES, **submit_answer.ROUTES, **tutor_chat.ROUTES, **my_page.ROUTES, **admin.ROUTES}

# 뒤에서 할 일: 이 함수가 자기 자신을 {"task": "..."} 로 다시 불러 실행한다 (화면은 기다리지 않음)
TASKS = {
    "learner-analysis": learner_analysis.run,
    "generate-theory": generate_theory.run,
    "load-content": load_content.run,
}


def lambda_handler(event, context):
    # 1. 뒤에서 할 일이면 그 일만 하고 끝 (콘솔 테스트: {"task": "load-content"})
    if event.get("task"):
        return TASKS[event["task"]](event)

    # 2. 화면에서 온 요청 꺼내기 (경로·학습자 헤더·본문·접속 IP)
    req = read_request(event)

    # 3. 관리자 경로는 관리자 코드부터 확인 (틀리면 401, 여러 번 틀리면 429)
    if req["path"].startswith("/admin") and req["method"] != "OPTIONS":
        try:
            admin.require_admin(req)
        except ApiError as e:
            return reply(e.status, {"error": e.message}, req)

    # 4. 경로에 맞는 기능 실행 → 응답 (요청 수 제한·오류 처리는 run_route 가 함께 한다)
    return run_route(req, ROUTES)
