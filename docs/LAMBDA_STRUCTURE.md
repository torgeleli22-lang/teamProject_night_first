# Lambda 구조 기준

서버(Lambda)를 **어떻게 나누고, 공통 코드를 어떻게 나눠 쓰고, 오류를 어떻게 남기고, 어떻게 배포하는지** 정하는 문서예요.
AI 가 만드는 연습 문항의 생성·검토 기준은 **`docs/GENERATION_STANDARD.md`** 에 있고, 이 문서는 그 기준이 돌아가는 서버 구조를 다뤄요.

- 상태: **v1.3** (2026-11-03) — 전환 1~4단계(코드) 끝: 공통 코드 나누기 · 라이브러리 · 함수 6개 입구·묶기·배포 명령 · 화면 주소. 남은 것은 콘솔에서 함수를 만들고 화면을 옮기는 5·6단계예요 (`## 10`)
- 정한 것: 함수 6개 · 공통 코드를 `core`·`ai`·`code_store` 로 나누기 · 외부 라이브러리 3가지(Powertools·Pydantic·tree-sitter) · CloudShell 명령으로 배포 · 함수마다 함수 URL

## 0. 원칙
1. **기능별로 격리**: 로그·오류 수·실행 시간·제한 시간이 기능마다 따로예요. 한 기능의 문제가 다른 기능에 번지지 않아요
2. **각 함수에는 필요한 것만**: 로그인 함수에는 AI 코드가 없어요
3. **공통 코드는 저장소에 한 벌**: 함수마다 복사하지 않고, 배포할 때 필요한 조각만 골라 묶어요
4. **오류는 로그로 바로 찾기**: 모든 로그는 같은 모양(JSON)으로 남기고, 어느 함수·경로·요청에서 무엇이 났는지 검색할 수 있게
5. **비밀 값은 환경 변수에만**: 코드·문서·GitHub·채팅에 쓰지 않아요

---

## 1. 함수 6개

| 함수 | 하는 일 | 경로 | 기능 파일 | 공통 조각 | 제한 시간 · 메모리 |
|---|---|---|---|---|---|
| `jojo_auth` | 로그인·현재 학습자 | `GET /me` · `GET /auth/start` · `GET /auth/callback/google` · `POST /auth/logout` | `auth.py` | core | 15초 · 256MB |
| `jojo_practice` | 연습 코드 만들기·주제 | `POST /practice` · `POST /practice/adjust` · `GET /topic/random` · `POST /topic/check` | `practice.py` · `topics.py` · `samples.py` · `samples_js.py` | core · ai · code_store | 10분 · 512MB |
| `jojo_inspect` | 내 코드 점검 | `POST /inspect` · `POST /inspect/start` | `inspect_code.py` | core · ai · code_store | 2분 · 512MB |
| `jojo_review` | 첨삭·다시 쓰기·튜터·코드 다시 열기 | `POST /review` · `POST /review/retry` · `POST /tutor` · `GET /code` | `review.py` · `tutor_chat.py` · `study.py`(기록) | core · ai · code_store | 3분 · 512MB |
| `jojo_study` | 내 공부 (AI 없음) | `GET /study` | `study.py` | core | 30초 · 256MB |
| `jojo_admin` | 관리자·실험 | `GET /admin/overview` · `POST /admin/ai` · `POST /admin/code` · `POST /admin/migrate` · `POST /admin/experiment` | `admin.py` · `experiment.py` + `practice.py`·`samples*.py` 묶음 | core · ai · code_store | 10분 · 512MB |

- `GET /health`(연결 확인)는 **모든 함수**에 있어요 (`core.HEALTH`) — 배포 뒤 함수마다 확인하려고
- 실제 묶는 파일·라이브러리·환경 변수는 **`lambda/functions.json`** 이 정하고, 시험(`lambda/tests/test_functions.py`)이 import·환경 변수를 읽어 이 표와 맞는지 확인해요
- 실행 역할은 모두 지금의 SafeRole (학교 계정은 새 역할 만들기가 막혀 있어요)
- 아키텍처는 모두 arm64, 런타임 **Python 3.14** (지금 `jojo_api_py` 와 같게)
- `GET /code`(코드 다시 열기)는 첨삭·튜터 기록을 함께 돌려줘서 `jojo_review` 로 옮겨요. 그러면 `practice.py` 가 첨삭 파일을 부르지 않아도 돼요
- `POST /admin/migrate`(예전 데이터 옮기기)는 아직 실행 전이라 남겨요. 실행하고 확인한 뒤 지워요
- GitHub 로그인은 쓰지 않아서 지웠어요 (Google 만)

---

## 2. 저장소 구조

```
lambda/
├─ api/                   공통 조각과 기능 파일 (저장소에 한 벌)
│  ├─ core.py · ai.py · code_store.py                       공통 조각 (§3)
│  ├─ auth.py · practice.py · topics.py · samples*.py · inspect_code.py · review.py · tutor_chat.py · study.py · admin.py · experiment.py
│  └─ lambda_function.py  모든 기능을 함께 담은 입구 — 예전 함수 jojo_api_py · 내 컴퓨터(npm run api)
├─ functions/             함수마다 입구 하나: jojo_auth.py · jojo_practice.py · jojo_inspect.py · jojo_review.py · jojo_study.py · jojo_admin.py
│                         (zip 안에서는 lambda_function.py 가 돼요 → 콘솔의 핸들러 설정 lambda_function.lambda_handler 그대로)
├─ functions.json         함수 목록: 이름 · 입구 · 넣을 파일 · 라이브러리 · 환경 변수 이름 · 화면이 고를 경로 앞부분 · 제한 시간 · 메모리
├─ console/               콘솔에 붙여넣을 파일을 함수 이름별 폴더로 (jojo_auth/ … + README) · 라이브러리 레이어 jojo_libs_layer.zip
│                         npm run package 가 functions.json 대로 복사해 만들어요 (직접 고치지 않음 — 다르면 test_console.py 가 실패)
├─ requirements.txt       외부 라이브러리 (버전 고정)
└─ tests/                 test_functions.py 가 functions.json·의존 규칙을 확인
scripts/package_lambdas.py · console_lambdas.py · deploy_lambdas.py      묶기 · 콘솔용 폴더 · 올리기 (표준 라이브러리 + AWS CLI 만 — CloudShell 에서 그대로)
```
- 처음 계획의 `shared/`·`features/` 폴더 나누기는 하지 않았어요: 파일을 옮기면 문서·도구의 경로 참조가 모두 바뀌는데 얻는 것이 없어서. 대신 공통 조각과 기능의 경계는 아래 의존 규칙 시험으로 지켜요

### 의존 규칙
- 기능 파일은 **공통 조각만** 불러요. 기능 파일끼리는 부르지 않아요
  - 예외 (같은 함수 안에 함께 묶이는 것만): `review.py` → `study.py`(첨삭 기록 남기기) · `tutor_chat.py`(코드 다시 열 때 튜터 대화), `experiment.py` → `practice.py`(같은 흐름으로 문항 만들기). `functions.json` 에 적어 둔 것만 허용
  - 예시 코드 `samples.py`(+ `samples_js.py`)는 기능이 아니라 자료라서 `practice.py`·`topics.py` 가 불러요
- 공통 조각끼리는 `ai` → `core`, `code_store` → `core` 만 (반대 방향 금지)
- 이 규칙은 테스트로 검사해요 (`lambda/tests/test_functions.py` 의 `DependencyRules`: import 를 읽어 허용 목록과 비교)

---

## 3. 공통 조각의 경계 (전환 1단계에서 예전 `common.py` 를 이렇게 나눴어요)

| 예전 `common.py` | → | 새 위치 |
|---|---|---|
| 1. 설정 · 2. AWS 연결 · 3. 요청/응답 · 4. DynamoDB · 5. 요청 수 제한 · 6. 학습자 · 8. 설정 값(+ AI 끄기 스위치) · 하루 사용 수 · 10. id | → | `core.py` |
| 7. AI 호출 (Bedrock·예산·사용량·형식 검사·고치기) | → | `ai.py` |
| 9. 읽을 코드 (저장·꺼내기·※ 정리·개념 추정) | → | `code_store.py` |

- 함수별로 쓰는 양: 로그인·내 공부는 `core` 만, 연습·점검·첨삭·관리자는 셋 모두 (`functions.json` 의 files)
- 난이도·개념 목록 같은 상수는 `core.py` 에 두고 화면(`src/lib/api-types.ts`)과 같게 유지

---

## 4. 외부 라이브러리

| 라이브러리 | 쓰는 곳 | 대신하는 것 | 넣는 방법 |
|---|---|---|---|
| **Powertools for AWS Lambda (Python) v3** | 경로 나누기·CORS·사전 요청(`LambdaFunctionUrlResolver`, `core.make_app`) · JSON 로그(`Logger`, `core.logger`) | 직접 만든 경로 표 처리(`run_route`)·CORS 헤더, `print` 로그 | 아래 "넣는 방법" |
| **Pydantic v2** | 요청 본문(`core.Body`·`read_body`, 경로마다 `…In`) · AI 답의 모양(`ai.AiAnswer`, 작업마다 `…Answer`) — Bedrock 도구 형식은 모양에서 만들어요(`ai.tool_schema`) | `field()` · `check_schema()` · `repair_for_schema()` · 손으로 쓴 JSON Schema | 아래 "넣는 방법" |
| **tree-sitter + tree-sitter-javascript** | JavaScript 진짜 문법 검사 · 함수/클래스/재귀·배열 크기 세기 (`practice.js_check`) | `js_scan` · 정규식 `js_structure` (겉모양 검사) | 아래 "넣는 방법" (쓰는 함수는 `jojo_practice`·`jojo_admin`) |

- **넣는 방법**: 콘솔에 붙여넣을 때는 세 라이브러리를 담은 **레이어 `jojo_libs` 하나**(`lambda/console/jojo_libs_layer.zip`)를 모든 함수에 붙여요. CloudShell `npm run deploy` 는 함수 zip 에 그 함수가 쓰는 라이브러리만 함께 넣어요(레이어 불필요)
- 버전은 `lambda/requirements.txt` 에 고정하고, 배포할 때 Lambda(arm64·Python 3.14)용 배포판을 받아요 (확인함: 모두 있음, 합계 약 4.5MB). 내 컴퓨터·CI 는 `npm run setup:python` 으로 같은 버전을 `.venv` 에
- 이 셋 말고 새 라이브러리를 넣으려면 이 표에 이유를 적고 정해요
- 쓰지 않기로 한 것: FastAPI+Mangum(경로는 Powertools 로 충분, 더 무거움), authlib(지금 Google 로그인이 잘 돌아감), jsonschema(Pydantic 으로 충분),
  Powertools `Metrics`(CloudWatch 사용자 지표는 지표마다 요금이 붙어요. 함수별 오류 수·실행 시간은 Lambda 기본 지표로 무료로 나오고, AI 호출·실패는 이미 `OPS#USAGE`·관리자 화면에 있어요. 나머지는 JSON 로그를 Logs Insights 로 세요)
- AI 답의 모양을 Pydantic 으로 옮길 때, 모양에서 만든 도구 형식이 예전 JSON Schema 와 **똑같은지** 확인했어요 (8개 모두 같음 — AI 가 보는 형식은 바뀌지 않음)
- boto3 는 Lambda 런타임에 들어 있는 것을 써요 (zip 에 넣지 않음)

---

## 5. 로그·오류 기준

| 항목 | 기준 |
|---|---|
| 로그 모양 | Powertools `Logger` JSON. 모든 로그에 `function` · `route` · `request_id` · `cold_start` |
| 요청 로그 | 경로·상태 코드·걸린 시간·학습자 id 앞 8자리. **요청 본문·코드·메모·비밀 값은 남기지 않음** |
| 예상한 오류 (`ApiError`, 4xx) | 요청 로그(`요청`, `status`)에 상태 코드만. 요청 값 오류는 틀린 칸 이름만 (`요청 값 오류`, `fields`) |
| 예상하지 못한 오류 (5xx) | `logger.exception` — 파일·줄·스택 전체. 화면에는 지금처럼 한국어 메시지만 |
| AI 호출 | 작업 이름·모델·토큰·걸린 시간·성공 여부·실패 이유 (지금 `OPS#USAGE`·`OPS#AILOG` 기록은 그대로) |
| 지표 | 함수별 오류 수·실행 시간·호출 수 = Lambda 기본 지표 (함수를 나누면 저절로 함수별). 예시 코드로 대신한 수·다시 만든 수는 로그 메시지(`AI 대신 …`, `코드 다시 만듦`)를 Logs Insights 로 세요. 사용자 지표(요금)는 쓰지 않아요 |
| 찾는 법 | CloudWatch Logs Insights 에서 `filter level="ERROR" and route like "/practice"` 처럼 검색. 자주 쓰는 검색문은 `docs/DEPLOY_LAMBDA.md` 에 |

- 화면의 오류 응답 모양은 그대로: `{"error": "한국어 메시지"}` + 상태 코드

---

## 6. 요청·응답 기준
- 경로마다 Pydantic 모델로 요청 본문을 검사해요 (글자 수·범위·선택지). 틀리면 400 + 한국어 메시지
- 학습자 확인(`x-session-id`)·CORS(허용한 화면 주소만, `ALLOWED_ORIGINS`)·요청 수 제한은 `core.py` 가 모든 함수에서 똑같이
- 응답 모양은 `src/lib/api-types.ts` 와 같게 유지 (바꾸면 둘 다 고치고 smoke 로 확인)
- 모범 설명·실행 추적표는 첨삭 결과 말고는 화면으로 보내지 않음 (`code_store.public_code`)

---

## 7. 환경 변수 (이름만 — 값은 콘솔에만)

| 이름 | 넣는 함수 |
|---|---|
| `TABLE_NAME` · `DB_REGION` · `TTL_ATTR` · `ALLOWED_ORIGINS` · `RATE_LIMIT_*` · `AI_MODE` · `MODEL_ID` · `BEDROCK_REGION` · `AI_MONTHLY_BUDGET_USD` | 전부 (`functions.json` 의 `sharedEnv` — `core.py` 가 모두 읽어요. `/health` 의 AI 상태도 함수마다 같게) |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `AUTH_CALLBACK_BASE` | `jojo_auth` |
| `ADMIN_TOKEN` | `jojo_admin` |
| (선택) `POWERTOOLS_LOG_LEVEL` — 기본 `INFO`, 로그를 줄이려면 `WARNING` | 전부 |

- `npm run deploy -- setup` 이 `jojo_api_py` 의 환경 변수에서 함수마다 필요한 이름만 옮겨요 (값은 찍지 않음)
- Google 콜백은 로그인을 시작한 함수(`jojo_auth`) 주소로 와요 (`AUTH_CALLBACK_BASE` 는 보통 비워 둠). Google Cloud Console 의 "승인된 리디렉션 URI"에 `jojo_auth` 주소를 더해요

---

## 8. 화면 연결
- 함수마다 함수 URL (인증 없음, CORS 는 코드에서)
- 화면 `src/lib/api-routes.ts` 가 경로 앞부분으로 함수를 골라요: `/me`·`/auth`·`/health` → auth, `/practice`·`/topic` → practice, `/inspect` → inspect, `/review`·`/tutor`·`/code` → review, `/study` → study, `/admin` → admin (`functions.json` 의 `paths` 와 같은지 `tests/api-routes.test.ts` 가 확인)
- 주소는 빌드 때 환경 변수로: `NEXT_PUBLIC_API_URLS` = `{"auth": "...", "practice": "...", …}` (GitHub 저장소 변수 `API_URLS`). 없는 함수는 `NEXT_PUBLIC_API_URL`(주소 하나, 예전 `jojo_api_py`)로 — 그래서 `API_URLS` 를 지우면 바로 예전 함수로 돌아가요
- 내 컴퓨터(`npm run api`)는 지금처럼 주소 하나에서 모든 함수를 함께 띄워요

---

## 9. 배포

**방법 A. 콘솔에 붙여넣기** — `lambda/console/README.md`: 레이어 `jojo_libs` 한 번 → 함수 이름별 폴더의 파일을 그 함수에 붙여넣기 → 폴더 README 의 설정. 코드가 바뀌면 커밋에서 그 폴더의 바뀐 파일만 다시

**방법 B. CloudShell 명령** (`docs/DEPLOY_LAMBDA.md` 에 단계별로):
```bash
npm run deploy -- check     # 확인만: 함수가 있는지 · 런타임·제한 시간 · 코드 올리기 권한(--dry-run) · 함수 URL
npm run deploy -- setup     # 처음 한 번: 없는 함수 만들기(SafeRole) · 환경 변수 옮기기 · 함수 URL → 화면에 넣을 API_URLS 를 알려 줌
npm run deploy              # 매번: 함수마다 묶어(npm run package) 바뀐 것만 올리고 · 설정 맞추고 · /health 확인
```
- 묶는 규칙은 `functions.json` 하나에서 읽어요 (사람이 파일을 고르지 않음). 라이브러리는 Lambda(Python 3.14 · arm64)용 배포판을 받아요
- 같은 내용이면 zip 이 똑같이 만들어져서(파일 순서·시각 고정) 바뀌지 않은 함수는 올리지 않아요 (Lambda 의 `CodeSha256` 과 비교)
- 환경 변수는 `setup` 만 건드리고(빠진 이름만 채움), `deploy` 는 코드와 설정(런타임·입구·제한 시간·메모리·아키텍처)만
- 코드 올리기 권한이 막히면 `dist/lambda/<함수>.zip` 을 콘솔에서 업로드해도 돼요

---

## 10. 전환 순서
1. ✅ 공통 코드 나누기 (`common.py` → `core`·`ai`·`code_store`), `GET /code` 를 `review.py` 로, GitHub 로그인 제거, 개발 도구(`.venv`·`requirements.txt`·CI Python 3.14) — 동작은 그대로
2. ✅ 라이브러리 적용 (Powertools 경로·CORS·JSON 로그 → Pydantic 요청 본문·AI 답의 모양 → tree-sitter JavaScript 검사) — 이제 라이브러리를 함께 묶어 올려야 해서 콘솔에 파일을 붙여넣는 배포는 쓸 수 없어요 (3단계의 묶기 명령으로)
3. ✅ 함수 6개 입구(`lambda/functions/`) + `functions.json` + 묶기·배포 명령(`npm run package`·`deploy`) + 의존 규칙·표 시험
4. ✅ 화면 주소 나누기 (`src/lib/api-routes.ts`, GitHub 변수 `API_URLS`)
5. 함수 6개 만들기 (콘솔에 붙여넣기 `lambda/console/` + 레이어, 또는 CloudShell `setup`·`deploy`) → 화면에 `API_URLS` → 확인 (`docs/DEPLOY_LAMBDA.md` 2~3단계)
6. 문제없으면 `jojo_api_py` 정지 (일주일 뒤 삭제, `functions.json` 에서도). 문제가 있으면 `API_URLS` 만 지우면 돼요

- 단계마다 typecheck · test · verify · build · smoke 통과 후 커밋

---

## 결정 기록
| 날짜 | 내용 |
|---|---|
| 2026-11-03 | v1.3: 콘솔에 붙여넣는 방법을 함께 — 함수 이름별 폴더 `lambda/console/`(자동 복사본, 시험으로 원본과 같은지 확인) + 라이브러리 레이어 `jojo_libs` 하나. CloudShell 명령도 그대로 |
| 2026-11-03 | v1.2: 3·4단계 적용. 폴더는 `lambda/api` 그대로 두고 입구만 `lambda/functions/` 에 (경로 참조를 바꾸지 않으려고). `/health` 는 모든 함수에. 배포 명령은 표준 라이브러리 + AWS CLI 만 (CloudShell 에 설치할 것 없음), 함수 만들기·환경 변수 옮기기·URL 까지 `setup` 하나로 |
| 2026-11-03 | v1.1: 2단계 적용. Powertools `Metrics` 는 쓰지 않기로 (요금 · 기본 지표로 충분). 로그의 서비스 이름은 Lambda 가 넣어 주는 함수 이름(`AWS_LAMBDA_FUNCTION_NAME`)이라 `POWERTOOLS_SERVICE_NAME` 을 따로 넣지 않아요 |
| 2026-11-02 | 함수 6개 · `core`·`ai`·`code_store` · Powertools·Pydantic·tree-sitter · CloudShell 배포 · 함수마다 URL 로 확정 (함수 URL 은 선호 없음 → 추천안). 그전의 "Lambda 하나 · boto3 만 · zip 없음"은 정한 원칙이 아니었고 이 문서로 바뀜 |
