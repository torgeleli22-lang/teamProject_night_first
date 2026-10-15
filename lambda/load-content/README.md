# load-content — 문제 데이터 넣기 Lambda (Python 3.13)

같은 폴더의 `content.json`(커리큘럼 + 기본 문제)을 DynamoDB 에 넣어요.
**처음 배포할 때 한 번**, 그리고 GitHub 의 `content.json` 이 바뀌었을 때 콘솔 **테스트** 버튼으로 실행하면 돼요.

- 넣는 것: `META / curriculum`(단원·개념·난이도·자격증), `CONTENT / <코드 id>`(기본 문제, source = seed). AI 가 만든 문제는 건드리지 않아요
- 내용이 지난번과 같으면 다시 넣지 않아요 (`{"force": true}` 로 강제)
- `content.json` 은 `npm run export:content` 가 `src/lib/curriculum.ts`·`src/lib/content/seed` 로 만들어요 (직접 고치지 않기)

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `content.json` | 이 폴더 (**파일 → 새 파일** `content.json`) |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 1분 · 메모리 256MB · 함수 URL 없음
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
응답이 이 Lambda 의 실행 결과예요. CloudWatch 로그에서 단계별 기록을 볼 수 있어요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 학습 구조 번호 (바뀌면 예전 기록을 한 번 지움) | `CONTENT_MODEL` |
