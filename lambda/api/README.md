# api — 코드리딩 API (`jojo_api`, Python 3.13)

화면의 모든 요청을 받는 함수예요. 입구 `lambda_function.py` 가 경로를 보고 기능 파일로 보내요.

| 파일 | 하는 일 | 경로 / 실행 |
|---|---|---|
| `lambda_function.py` | **입구**: 경로 → 기능 파일, 관리자 코드 확인, 뒤에서 할 일 실행 | |
| `common.py` | 모든 기능이 함께 쓰는 도구: 요청·응답(CORS), 요청 수 제한, 학습자, DynamoDB, AI 호출(월 예산), 통계 | |
| `questions.py` | 문제 고르기·힌트·탐색 목록 (AI 없음) | `POST /session` `/hint`, `GET /concepts` |
| `submit_answer.py` | 채점·기록 (주관식이 애매할 때만 AI) | `POST /attempts` `/explain` |
| `tutor_chat.py` | 튜터 대화 | `POST /ask` |
| `my_page.py` | 내 정보·학습 탭·복습·내 학습·랭킹 | `GET /me` `/learn` `/review` `/dashboard` `/ranking` `/health`, `POST /me` |
| `admin.py` | 관리자 화면 (`x-admin-token` 필요) | `/admin/...` |
| `learner_analysis.py` | 학습자 분석 (10문제마다) | 뒤에서 `{"task": "learner-analysis"}` |
| `generate_theory.py` | 개념 문제 AI 생성 + 교차 검수 → 승인 대기 | 뒤에서 `{"task": "generate-theory"}` |
| `load_content.py` | 기본 문제를 DynamoDB 에 넣기 | 콘솔 테스트 `{"task": "load-content"}` |
| `content.json` | 커리큘럼 + 기본 문제 (`npm run export:content` 가 만듦, 직접 고치지 않기) | |

'뒤에서' 하는 일은 이 함수가 자기 자신을 `InvocationType=Event`(기다리지 않음)로 다시 불러서 실행해요. 화면은 기다리지 않아요.
코드 문제 생성만 Node.js 함수 `jojo_generate_code` 를 불러요.

## 콘솔에 넣는 법
코드 탭에서 `lambda_function.py` 를 이 폴더 내용으로 바꾸고, **파일 → 새 파일**로 나머지 파일(이름 그대로)을 만들어 붙여넣은 뒤 **Deploy**.
GitHub 에서 파일을 열고 **Raw** 를 누르면 복사하기 쉬워요. 한 파일만 고쳤으면 그 파일만 바꾸면 돼요.

## 설정
- 런타임 Python 3.13 · 아키텍처 **arm64** · 메모리 **1024MB** · 제한 시간 **5분** (화면 요청은 1초 안팎, 개념 문제 생성만 오래 걸림)
- 실행 역할 `SafeRole-sgu-202688` · 함수 URL 인증 NONE
- 환경 변수: [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표

## 콘솔에서 시험하기
[`test_events.json`](test_events.json) 의 예시 하나를 **테스트 탭 → 새 이벤트**에 붙여넣고 **테스트**. 응답의 `body` 가 화면이 받는 JSON 이에요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 위치 |
|---|---|
| 한 세트의 문제 수, 문제 고르는 순서 | `questions.py` 의 `THEORY_SIZE`·`CODE_LESSONS`, `plan_session` |
| 새 문제를 만드는 기준 | `common.py` 의 `POLICY`, `questions.py` 의 `decide_on_session` |
| 주관식 규칙 평가 (언제 AI 를 부를지) | `submit_answer.py` 의 `evaluate_short_answer` |
| 튜터 말투·규칙, 문제당 질문 횟수 | `tutor_chat.py` 의 `SYSTEM_PROMPT`, `MAX_TURNS` |
| 요청 수 제한, 월 예산 | `common.py` 1번 설정 (`LIMITS`, `POLICY`) 또는 환경 변수 |
| 배지, 랭킹 | `my_page.py` 의 `badges`, `ranking` |
