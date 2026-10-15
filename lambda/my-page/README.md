# my-page — 내 학습 정보 Lambda (Python 3.13)

화면마다 필요한 데이터를 한 번에 돌려줘요 (AI 호출 없음).

| 요청 | 하는 일 |
|---|---|
| `GET /health` | 연결 확인 `{ok, db, ai}` |
| `GET /me`, `POST /me` | 헤더(이름·XP·연속 학습) / 난이도·이름 바꾸기, 기록 초기화 |
| `GET /learn` | 학습 탭: 추천 개념·난이도, 오늘 푼 수, 최근 AI 분석 |
| `GET /review` | 복습 탭: 오답 노트, 다질 개념, 자주 하는 착각 |
| `GET /dashboard` | 내 학습: 통계·캘린더·배지·최근 풀이 |
| `GET /ranking` | 랭킹 (지금 참여 중인 학습자) |

- 학습자는 `x-session-id` 헤더로 구분해요. 없거나 만료됐으면 새로 만들어 응답 헤더로 알려 줘요 (`LEARNER / <세션 id>`, 12시간 뒤 자동 삭제)

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 15초 · 메모리 256MB · 함수 URL 필요 (`MY_PAGE_URL`)
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `ALLOWED_ORIGINS`, `AI_MODE` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
`path`·`method` 로 경로를 고르고, 나머지 값은 요청 본문으로 쓰여요. 응답의 `body` 가 화면이 받는 JSON 이에요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 배지 | `badges` |
| 랭킹 순서 | `ranking` |
| 연속 학습 계산 | `streak` |
