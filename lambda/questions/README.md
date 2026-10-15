# questions — 문제 내기 Lambda (Python 3.13)

저장된 문제 중에서 학습자에게 낼 문제를 골라요 (AI 호출 없음). 정답·해설은 화면으로 보내지 않아요.

| 요청 | 하는 일 |
|---|---|
| `POST /session` | 문제 세트. 개념: 고른 분야·주제·자격증에서 안 푼 객관식 10문제 / 코드: 안 읽은 코드 2개를 읽기 단계 순서로 / 복습: 틀린 문제 → 다질 개념 |
| `POST /hint` | 미리 저장된 힌트 한 단계 |
| `GET /concepts` | 탐색 화면: 코드·문제 목록 (문제 글만) |

- 읽는 것: `CONTENT`(문제), `META / curriculum`, 학습자의 풀이 기록 `S#<세션> / A#…`
- 문제가 부족한 칸(생성 기준: `common.py` 의 `POLICY`)이면 **generate-code** 를 기다리지 않고 불러요 → 실행 역할에 `lambda:InvokeFunction` 권한 필요

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 15초 · 메모리 256MB · 함수 URL 필요 (`QUESTIONS_URL`)
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `ALLOWED_ORIGINS`, `AI_MODE`, `GENERATE_CODE_FUNCTION`(generate-code 함수 이름) (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
`path`·`method` 로 경로를 고르고, 나머지 값은 요청 본문으로 쓰여요. 응답의 `body` 가 화면이 받는 JSON 이에요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 한 세트의 문제 수 | `THEORY_SIZE`, `CODE_LESSONS`, `REVIEW_SIZE` |
| 문제 고르는 순서 | `plan_session` |
| 새 문제를 만드는 기준 | `decide_on_session`, `common.py` 의 `POLICY` |
