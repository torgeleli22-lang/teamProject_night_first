# api — 코드 리딩 노트 API (Python)

공통 조각과 기능 파일이 모두 이 폴더에 한 벌씩 있어요. 기능별 함수 6개의 입구는 [`../functions/`](../functions), 함수마다 묶을 파일은 [`../functions.json`](../functions.json) 이 정해요 (구조 기준: [`docs/LAMBDA_STRUCTURE.md`](../../docs/LAMBDA_STRUCTURE.md)).
여기의 `lambda_function.py` 는 모든 기능을 함께 담은 입구예요 — 예전 함수 `jojo_api_py` 와 내 컴퓨터(`npm run api`)가 써요.

| 파일 | 하는 일 | 경로 |
|---|---|---|
| `lambda_function.py` | **모든 기능을 담은 입구** (예전 함수 `jojo_api_py` · `npm run api`): 기능 파일의 경로 표를 합침, 관리자 코드 확인 | 전부 |
| `core.py` | 공통 조각 (모든 함수): 설정, 요청·응답(Powertools 경로·CORS·JSON 로그, 요청 본문 모양), 연결 확인, DynamoDB, 요청 수 제한, 학습자, 설정 값·AI 끄기 스위치, 하루 사용 수, id | `GET /health` |
| `ai.py` | 공통 조각 (AI 를 쓰는 함수): Bedrock 호출(`ask_ai`), 월 예산, 사용량 기록, AI 답의 모양(Pydantic `AiAnswer`) | |
| `code_store.py` | 공통 조각: 읽을 코드 저장·꺼내기, 화면용 모양(`public_code`), ※ 정리, 개념 추정 | |
| `topics.py` | 주제 고르기: 랜덤(AI 없음) · 직접 적은 주제 판정(AI) | `GET /topic/random`, `POST /topic/check` |
| `practice.py` | 연습 코드(Python·JavaScript) + ※ 지점 만들기(AI, 문법 검사: Python `ast`·JavaScript tree-sitter) · 더 쉽게/어렵게(5번까지) · 다시 읽기 | `POST /practice` `/practice/adjust` |
| `inspect_code.py` | 내 코드 점검: 민감 정보 가리기·함수 찾기(AI 없음) → 난이도·※ 지점(AI) | `POST /inspect` `/inspect/start` |
| `review.py` | 빨간펜 첨삭: 누락(규칙) + ○△✕·코멘트·모범 설명(AI), 힌트 보고 다시 쓴 설명 다시 채점(3번까지), 코드 다시 열기 | `POST /review` `/review/retry`, `GET /code` |
| `tutor_chat.py` | 첨삭 뒤 AI 튜터 대화: 메모별 첨삭 하나에 대해 묻고 답하기(10번까지), 대화 저장 | `POST /tutor` |
| `study.py` | 내 공부 (AI 없음): 첨삭 기록 → 난이도 추천 · 개념별 약점 지도 · 내 설명 노트 | `GET /study` |
| `auth.py` | Google 로그인 (선택, 환경 변수 `GOOGLE_*`): 로그인 토큰 발급, 익명 기록을 계정으로 옮기기 | `GET /me`, `/auth/...` |
| `admin.py` | 관리자 화면 (`x-admin-token` 필요): AI 사용량·비용·AI 끄기·관리자 코드·예전 데이터 옮기기 | `/admin/...` |
| `experiment.py` | 논문 실험 (`x-admin-token` 필요): 문항 하나를 만들고 단계 기록 (`docs/EXPERIMENT.md`) | `POST /admin/experiment` |
| `samples.py` | AI 를 쓸 수 없을 때의 예시 코드(Python, 난이도마다 2개)와 랜덤 주제 목록 | |
| `samples_js.py` | JavaScript 예시 코드 (난이도마다 1~2개, `samples.py` 가 합침) | |
| `test_events.json` | 콘솔 테스트 이벤트 예시 (콘솔에 넣지 않아도 됨) | |

## 올리는 법
CloudShell 에서 `npm run deploy` (함수마다 필요한 파일·라이브러리만 zip 으로 묶어 바뀐 함수만 올려요). 라이브러리가 함께 들어 있어서 콘솔 코드 탭에 붙여넣는 방식은 쓰지 않아요.
처음 한 번·자세한 순서: [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md)

## 설정
- 런타임 **Python 3.14** · 아키텍처 **arm64** · 제한 시간·메모리는 함수마다 (`functions.json`, `npm run deploy` 가 맞춰요)
- 실행 역할 `SafeRole-sgu-202688` · 함수 URL 인증 NONE
- 환경 변수: [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표 (함수마다 필요한 이름은 `functions.json`)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 `{"path": "/health", "method": "GET"}` 를 붙여넣고 **테스트**. 응답의 `body` 가 화면이 받는 JSON 이에요.
다른 예시: [`test_events.json`](test_events.json)

## 고칠 만한 곳
| 바꾸고 싶은 것 | 위치 |
|---|---|
| 최대 줄 수, 다시 만들기 횟수, 보관 기간, 메모 수 | `core.py` 1번 설정 (`MAX_CODE_LINES`, `REGEN_LIMIT`, `CODE_KEEP_DAYS`, `UPLOAD_KEEP_DAYS`, `MAX_MEMOS`) |
| 난이도별 코드 길이·문법·※ 수 | `practice.py` 의 `LEVEL_GUIDE`, `MIN_LINES`·`MAX_LINES`, `MARK_COUNT`, `OUTPUT_TOKENS` |
| 코드 만들기·첨삭·주제 판정·튜터 말투와 규칙 | 각 파일의 `SYSTEM_PROMPT` |
| 튜터 질문 횟수·글자 수 | `core.py` 의 `MAX_TUTOR_TURNS`, `MAX_TUTOR_CHARS` |
| AI 없을 때의 판정·첨삭 | `topics.rule_check`, `inspect_code.rule_analysis`, `review.rule_review` |
| 가리는 민감 정보 모양 | `inspect_code.py` 의 `SECRET_PATTERNS` (화면 `src/lib/secrets.ts` 도 같이) |
| 예시 코드·랜덤 주제 | `samples.py`·`samples_js.py` (`npm run verify` 로 확인) |
| 요청 수 제한, 월 예산 | `core.py` 1번 설정 (`LIMITS`) 또는 환경 변수 |
