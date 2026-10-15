# Lambda 함수들

화면(GitHub Pages)은 기능마다 다른 **Lambda 함수 URL** 로 JSON 을 보내고, Lambda 가 DynamoDB(저장)와 Bedrock(AI)을 이어 줍니다.
폴더 하나 = Lambda 함수 하나예요. 콘솔 **코드 탭에 붙여넣어** 쓰는 읽을 수 있는 코드이고, zip·빌드가 필요 없어요.

```
화면 ──JSON──▶ questions        문제 고르기·힌트·탐색 목록          ──▶ DynamoDB
     ──JSON──▶ submit-answer    채점·기록 (주관식만 필요할 때 AI)    ──▶ DynamoDB, Bedrock ──▶ learner-analysis (10문제마다)
     ──JSON──▶ tutor-chat       튜터에게 질문                       ──▶ DynamoDB, Bedrock
     ──JSON──▶ my-page          내 정보·학습 탭·복습·내 학습·랭킹    ──▶ DynamoDB
     ──JSON──▶ admin            관리자 화면                         ──▶ DynamoDB ──▶ generate-code / generate-theory
                questions ──(문제가 부족한 칸)──▶ generate-code
```

| 폴더 | 언어 | 하는 일 | 함수 URL | 화면 설정 변수 |
|---|---|---|---|---|
| [`questions/`](questions) | Python | `POST /session` 문제 세트, `POST /hint` 힌트, `GET /concepts` 탐색 | 필요 | `QUESTIONS_URL` |
| [`submit-answer/`](submit-answer) | Python | `POST /attempts` 채점·기록, `POST /explain` 주관식 AI 분석 | 필요 | `SUBMIT_ANSWER_URL` |
| [`tutor-chat/`](tutor-chat) | Python | `POST /ask` 튜터 대화 | 필요 | `TUTOR_CHAT_URL` |
| [`my-page/`](my-page) | Python | `/me` `/learn` `/review` `/dashboard` `/ranking` `/health` | 필요 | `MY_PAGE_URL` |
| [`admin/`](admin) | Python | `/admin/...` 관리자 화면 전부 | 필요 | `ADMIN_URL` |
| [`learner-analysis/`](learner-analysis) | Python | 학습자 분석 (submit-answer 가 부름) | 없음 | — |
| [`generate-theory/`](generate-theory) | Python | 개념 문제 AI 생성 + 교차 검수 (admin 이 부름) | 없음 | — |
| [`generate-code/`](generate-code) | **Node.js** | 코드 문제 AI 생성 + **코드 실제 실행 검증** (questions·admin·learner-analysis 가 부름) | 없음 | — |
| [`load-content/`](load-content) | Python | `content.json`(커리큘럼 + 기본 문제)을 DynamoDB 에 넣기 (처음 한 번, 문제를 바꿨을 때) | 없음 | — |

- **Python 함수는 `lambda_function.py` + `common.py` 두 파일**이에요. `common.py`(요청 읽기·CORS·요청 수 제한·학습자·DynamoDB·AI 호출 같은 공통 도구)는 [`common/common.py`](common/common.py) 하나를 모든 Python 함수에 똑같이 넣어요.
- 외부 라이브러리 없이 Lambda 에 들어 있는 `boto3`(Python)·AWS SDK(Node.js)만 써요.
- `lambda_function.py` 는 `lambda_handler` → 경로별 처리 함수 순서로, 단계마다 번호 주석(1, 2, 3…)이 있어서 위에서부터 읽으면 흐름이 보여요.
- 만드는 방법(콘솔 단계): [`docs/DEPLOY_LAMBDA.md`](../docs/DEPLOY_LAMBDA.md)
- 내 컴퓨터에서 전부 실행: `npm run api` (DynamoDB 흉내 서버 + 목업 AI, AWS 계정 필요 없음)

**원본은 이 폴더예요.** 콘솔에서 고쳤다면 같은 내용을 이 폴더에도 반영해 주세요 (팀원과 공유, 변경 기록, 자동 검사 `npm run smoke`).
