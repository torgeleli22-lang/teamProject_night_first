# tutor-chat — 튜터 대화 Lambda (Python 3.13)

학습자가 **"튜터에게 질문"** 을 누르면 문제 정보와 이전 대화를 Bedrock(Claude Haiku 4.5)에게 보여 주고 답을 받아요.

| 요청 | 하는 일 |
|---|---|
| `POST /ask` | `{chatId?, questionId, question, solved, answerText?}` → `{chatId, answer, source}` |

- 대화 기록: `CHAT#<chatId> / <시각>#<role>` (하루 뒤 자동 삭제). 처음에는 chatId 없이 보내고, 받은 chatId 를 다음 질문에 그대로 보내면 이어서 답해요
- 아직 안 푼 문제(`solved: false`)면 정답을 직접 말하지 않고 실마리만 줘요

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 30초 · 메모리 256MB · 함수 URL 필요 (`TUTOR_CHAT_URL`)
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `ALLOWED_ORIGINS`, `AI_MODE`, `AI_MONTHLY_BUDGET_USD` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
`path`·`method` 로 경로를 고르고, 나머지 값은 요청 본문으로 쓰여요. 응답의 `body` 가 화면이 받는 JSON 이에요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 튜터 말투·규칙 | `SYSTEM_PROMPT` |
| 한 문제에서 물을 수 있는 횟수 (비용 보호) | `MAX_TURNS` |
| AI 에게 주는 문제 정보 | `build_prompt` |
| 대화 기록 보관 기간 | `KEEP_DAYS` |
