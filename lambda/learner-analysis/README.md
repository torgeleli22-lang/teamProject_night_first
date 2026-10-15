# learner-analysis — 학습자 분석 Lambda (Python 3.13)

submit-answer 가 새로 푼 문제가 10개 쌓일 때마다 불러요 (학습자는 기다리지 않음).
학습 기록 통계를 Bedrock 에게 보여 주고 "무엇을 헷갈리는지" 분석을 받아 `S#<세션> / N#…` 에 저장해요. AI 를 쓸 수 없으면 규칙으로 만든 요약을 저장해요.
혼동이 보이고 복습할 문제가 부족하면 **generate-code** 를 불러 맞춤 복습 문제를 만들어요 (학습자당 하루 1번).

- 받는 값: `{"sessionId": "...", "level": 2}` (함수 URL 없음 — 다른 Lambda 만 불러요)

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 60초 · 메모리 256MB · 함수 URL 없음
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `AI_MODE`, `AI_MONTHLY_BUDGET_USD`, `GENERATE_CODE_FUNCTION` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
응답이 이 Lambda 의 실행 결과예요. CloudWatch 로그에서 단계별 기록을 볼 수 있어요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 분석 지시문 | `SYSTEM_PROMPT`, `build_prompt` |
| AI 에게 보여 주는 통계 | `build_data` |
| 맞춤 복습을 만들 기준 | `decide_personal` |
