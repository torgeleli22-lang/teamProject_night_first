# Lambda 구조

함수 3개, 함수마다 폴더 하나. 공통 코드는 `lambda/shared/` 한 벌만 두고 콘솔에 함께 붙여넣어요 ([`docs/DEPLOY_LAMBDA.md`](DEPLOY_LAMBDA.md)).

```
lambda/
  shared/           모든 함수에 함께 넣는 공통 코드
    core.py         설정 · 요청/응답(Powertools) · DynamoDB · 요청 수 제한 · 학습자(세션) · 연습 코드 저장(CODE#) · 관리자 확인 · id
    ai.py           Bedrock 호출(ask_ai) · 월 예산·사용량 · AI 답의 모양(AiAnswer)과 흔한 형식 실수 고치기
  jojo_auth/        로그인
    lambda_function.py   입구 (핸들러 lambda_function.lambda_handler)
    auth.py              GET /me · GET /auth/start · GET /auth/callback/google · POST /auth/logout
  jojo_practice/    코드 만들기 (docs/GENERATION_STANDARD.md)
    lambda_function.py
    generate.py          POST /practice — ① 생성 → 규칙 검사 1 → ② 검토 → 규칙 검사 2 → 저장
    levels.py            난이도 6요소·난이도별 기준·생성 규칙 (프롬프트에 그대로)
    rules.py             규칙 검사 (문법·정의 안 된 이름·함수/반복문 위치) — AI 없음
    samples.py           예시 코드 (언어 × 난이도 6개) · 랜덤 주제
    history.py           생성 기록 남기기 · 최근 기록으로 생성 지침 만들기 (AI 없음)
  jojo_review/      채점
    lambda_function.py
    grade.py             POST /review · GET /code — 기준은 검토 기록
  requirements.txt  레이어 라이브러리 (버전 고정)
  tests/            단위 테스트 (npm run test:lambda)
```

## 규칙
- **경로 추가**: 그 함수의 기능 파일 `ROUTES = {"POST /경로": 처리 함수}` 에 넣고, 화면 `src/lib/api-routes.ts` 의 `FUNCTION_PATHS` 에 경로 앞부분을 넣어요 (`tests/api-routes.test.ts` 가 맞는지 확인)
- **처리 함수**: 단계 번호 주석(`# 1. 요청 값 확인` …). 요청 본문은 `core.Body` 를 이은 모양 + `read_body` (틀리면 400), AI 답은 `ai.AiAnswer` 를 이은 모양 (Bedrock 도구 형식이 여기서 만들어져요)
- **AI 호출**은 `ai.ask_ai()` 로만. 새 AI 작업에는 목업 답(`mock=`)과 AI 없이 쓰는 대신할 길(예시 코드·규칙 채점)을 함께
- **오류**: 사용자에게 보여 줄 오류는 `core.ApiError(상태, "~해요")`, 나머지는 500 + 로그 (스택 전체)
- **로그**: `core.logger` (JSON, CloudWatch). `print` 쓰지 않기. 요청 본문·코드·메모·비밀 값은 남기지 않기
- **외부 라이브러리**: Powertools(경로·로그) · Pydantic(요청·AI 답 형식) · tree-sitter(JavaScript 문법 검사)만. 더 넣으려면 이 문서에 이유를 적고
- **함수 사이에서 import 하지 않기**: 함수 폴더끼리는 서로 모르고, 공통은 `shared/` 로

## DynamoDB 항목 (`jojo_table`, 키 이름표는 `lambda/shared/core.py` 4번)

| pk | sk | 무엇 | 읽는 곳 |
|---|---|---|---|
| `USER#<id>` | `PROFILE` | 학습자 (최근 주제·회원 정보·예전 탭 id) | 모두 |
| `CODE#<id>` | `INFO` | 연습 코드 + 설명할 곳 + **검토 기록(units: 넣은 값·과정·결과·횟수·멈춘 조건·모범 설명) = 채점 기준** + 출력 + 난이도 판정 | practice(저장) · review |
| `CODE#<id>` | `REVIEW#<시각>` | 채점 결과 | review |
| `LOGIN#<토큰>` · `ACCOUNT#google:<번호>` · `AUTH#<state>` | `USER` · `USER` · `STATE` | 로그인 | auth · 모두(토큰 확인) |
| `GENLOG#<언어>#<난이도>` | `<시각>` | 생성 기록 (결과 · 시도별 분류와 코드 특징 · 통과한 코드의 모양, 180일) — 다음 생성의 지침 | practice |
| `CASE#<언어>#<난이도>` | `<시각>#<시도>` | 버린 시도의 검토 사례 (코드 · 검토 의견 · 두 출력 · 코드 특징 · `label`, 180일) — 실행 전용 Lambda(계획)가 정답을 붙임 | practice(기록) |
| `EXPERIENCE#<언어>` | `<난이도>#<시각>` | 실제 실행으로 확인한 검토 경험 (`kind` · 검토 의견 · 실제 · 교훈 · 코드 특징) — 검토 프롬프트에 참고로 | practice(읽기) |
| `OPS#USAGE` | `<월>#<작업>#<모델>` | AI 사용량 (월 예산) | practice · review |
| `OPS#LIMIT` | `<종류>:<대상>#<칸>` | 요청 수 제한 | 모두 |

항목 모양을 바꾸면 읽는 기능 파일과 화면 `src/lib/api-types.ts` 를 함께 고치고 `npm run smoke` 로 확인해요.
