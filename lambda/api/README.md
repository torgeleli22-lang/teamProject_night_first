# api — 코드 리딩 노트 API (`jojo_api`, Python)

화면의 모든 요청을 받는 함수예요. 입구 `lambda_function.py` 가 경로를 보고 기능 파일로 보내요.

| 파일 | 하는 일 | 경로 |
|---|---|---|
| `lambda_function.py` | **입구**: 경로 → 기능 파일, 관리자 코드 확인, 연결 확인 | `GET /health` |
| `common.py` | 모든 기능이 함께 쓰는 도구: 설정, 요청·응답(CORS), 요청 수 제한, 학습자, DynamoDB, AI 호출(월 예산·AI 끄기), 읽을 코드 저장·꺼내기 | |
| `topics.py` | 주제 고르기: 랜덤(AI 없음) · 직접 적은 주제 판정(AI) | `GET /topic/random`, `POST /topic/check` |
| `practice.py` | 연습 코드(Python·JavaScript) + ※ 지점 만들기(AI, 문법·겉모양 검사) · 더 쉽게/어렵게(5번까지) · 다시 읽기 | `POST /practice` `/practice/adjust`, `GET /reading` |
| `inspect_code.py` | 내 코드 점검: 민감 정보 가리기·함수 찾기(AI 없음) → 난이도·※ 지점(AI) | `POST /inspect` `/inspect/start` |
| `review.py` | 빨간펜 첨삭: 누락(규칙) + ○△✕·코멘트·모범 설명(AI), 힌트 보고 다시 쓴 설명 다시 채점(3번까지) | `POST /review` `/review/retry` |
| `tutor_chat.py` | 첨삭 뒤 AI 튜터 대화: 메모별 첨삭 하나에 대해 묻고 답하기(10번까지), 대화 저장 | `POST /tutor` |
| `study.py` | 내 공부 (AI 없음): 첨삭 기록 → 난이도 추천 · 개념별 약점 지도 · 내 설명 노트 | `GET /study` |
| `auth.py` | Google·GitHub 로그인 (선택, 환경 변수 `GOOGLE_*`·`GITHUB_*`): 로그인 토큰 발급, 익명 기록을 계정으로 옮기기 | `GET /me`, `/auth/...` |
| `admin.py` | 관리자 화면 (`x-admin-token` 필요): AI 사용량·비용·AI 끄기·관리자 코드 | `/admin/...` |
| `samples.py` | AI 를 쓸 수 없을 때의 예시 코드(Python, 난이도마다 2개)와 랜덤 주제 목록 | |
| `samples_js.py` | JavaScript 예시 코드 (난이도마다 1~2개, `samples.py` 가 합침) | |
| `test_events.json` | 콘솔 테스트 이벤트 예시 (콘솔에 넣지 않아도 됨) | |

## 콘솔에 넣는 법
코드 탭에서 `lambda_function.py` 를 이 폴더 내용으로 바꾸고, **파일 → 새 파일**로 나머지 `.py` 파일(이름 그대로)을 만들어 붙여넣은 뒤 **Deploy**.
GitHub 에서 파일을 열고 **Raw** 를 누르면 복사하기 쉬워요. 한 파일만 고쳤으면 그 파일만 바꾸면 돼요.

## 설정
- 런타임 Python 3.13 이상 · 아키텍처 **arm64** · 메모리 **512MB** · 제한 시간 **5분** (AI 를 부르는 요청은 5~20초, 고급 코드 만들기는 1~2분)
- 실행 역할 `SafeRole-sgu-202688` · 함수 URL 인증 NONE
- 환경 변수: [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 `{"path": "/health", "method": "GET"}` 를 붙여넣고 **테스트**. 응답의 `body` 가 화면이 받는 JSON 이에요.
다른 예시: [`test_events.json`](test_events.json)

## 고칠 만한 곳
| 바꾸고 싶은 것 | 위치 |
|---|---|
| 최대 줄 수, 다시 만들기 횟수, 보관 기간, 메모 수 | `common.py` 1번 설정 (`MAX_CODE_LINES`, `REGEN_LIMIT`, `READING_KEEP_DAYS`, `UPLOAD_KEEP_DAYS`, `MAX_MEMOS`) |
| 난이도별 코드 길이·문법·※ 수 | `practice.py` 의 `LEVEL_GUIDE`, `MIN_LINES`·`MAX_LINES`, `MARK_COUNT`, `OUTPUT_TOKENS` |
| 코드 만들기·첨삭·주제 판정·튜터 말투와 규칙 | 각 파일의 `SYSTEM_PROMPT` |
| 튜터 질문 횟수·글자 수 | `common.py` 의 `MAX_TUTOR_TURNS`, `MAX_TUTOR_CHARS` |
| AI 없을 때의 판정·첨삭 | `topics.rule_check`, `inspect_code.rule_analysis`, `review.rule_review` |
| 가리는 민감 정보 모양 | `inspect_code.py` 의 `SECRET_PATTERNS` (화면 `src/lib/secrets.ts` 도 같이) |
| 예시 코드·랜덤 주제 | `samples.py`·`samples_js.py` (`npm run verify` 로 확인) |
| 요청 수 제한, 월 예산 | `common.py` 1번 설정 (`LIMITS`) 또는 환경 변수 |
