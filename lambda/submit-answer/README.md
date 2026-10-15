# submit-answer — 답 제출 Lambda (Python 3.13)

답을 채점하고 기록해요. 채점은 이 Lambda 에서만 해요.

| 요청 | 하는 일 |
|---|---|
| `POST /attempts` | 채점 + 기록. 객관식·빈칸·실행 결과 예측·흐름 따라가기는 규칙으로, 주관식은 규칙으로 먼저 보고 애매할 때만 AI(Bedrock) |
| `POST /explain` | 주관식 답을 AI 에게 자세히 분석 받기 (학습자가 버튼을 누를 때만) |

- 쓰는 것: `S#<세션> / A#…`(풀이) · `D#날짜`(하루 요약) · `C#개념`(개념 요약), `LEARNER`(총 XP·랭킹), `STATS / GRADED`, `USAGE`(AI 사용량)
- 새로 푼 문제가 10개 쌓이면 **learner-analysis** 를 기다리지 않고 불러요 → `lambda:InvokeFunction` 권한 필요

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 30초 · 메모리 256MB · 함수 URL 필요 (`SUBMIT_ANSWER_URL`)
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `ALLOWED_ORIGINS`, `AI_MODE`, `AI_MONTHLY_BUDGET_USD`, `LEARNER_ANALYSIS_FUNCTION` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
`path`·`method` 로 경로를 고르고, 나머지 값은 요청 본문으로 쓰여요. 응답의 `body` 가 화면이 받는 JSON 이에요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 주관식 규칙 평가 (언제 AI 를 부를지) | `evaluate_short_answer` |
| AI 평가 지시문 | `TUTOR_SYSTEM`, `evaluate_with_ai` |
| 채점 결과 문구 | `grade` |
