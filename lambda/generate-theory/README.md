# generate-theory — 개념 문제 만들기 Lambda (Python 3.13)

관리자 화면의 'AI 문제 만들기'(개념 주제: 네트워크·개발·운영·보안)가 admin 을 거쳐 불러요.
실행으로 정답을 확인할 수 없는 문제라서 세 겹으로 확인해요.

1. AI 가 4지선다 5문제를 만들어요
2. 규칙 검사 (보기 4개·중복 없음·정답 번호)
3. **다른 AI 호출이 정답을 모르는 채로 풀어 봐요** → 고른 답이 다르거나 문제가 있다고 하면 그 문제는 빼요
4. 3문제 이상 남으면 **승인 대기(pending)** 로 저장 → 관리자가 승인해야 학습자에게 나가요

- 받는 값: `{"concept": "net-dns", "level": 2, "count": 1, "reason": "...", "instructions": "관리자 요청(선택)"}`
- 기록: `JOB / <번호>` (관리자 화면의 '생성 작업'), `CONTENT / ai-<주제>-<8자리>`

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 **5분** · 메모리 256MB · 함수 URL 없음
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `AI_MODE`, `AI_MONTHLY_BUDGET_USD`, `AI_GENERATION_DAILY_LIMIT` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
응답이 이 Lambda 의 실행 결과예요. CloudWatch 로그에서 단계별 기록을 볼 수 있어요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 출제 규칙 | `SYSTEM_PROMPT` |
| 한 번에 만드는 수 / 최소 통과 수 | `QUESTIONS_PER_SET`, `MIN_KEPT` |
