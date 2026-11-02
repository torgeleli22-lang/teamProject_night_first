# Lambda 구조 기준

서버(Lambda)를 **어떻게 나누고, 공통 코드를 어떻게 나눠 쓰고, 오류를 어떻게 남기고, 어떻게 배포하는지** 정하는 문서예요.
AI 가 만드는 연습 문항의 생성·검토 기준은 **`docs/GENERATION_STANDARD.md`** 에 있고, 이 문서는 그 기준이 돌아가는 서버 구조를 다뤄요.

- 상태: **v1.0** (2026-11-02 확정) — 지금 코드는 아직 함수 하나(`jojo_api_py`)예요. `## 10. 전환 순서` 대로 옮겨요
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
| `jojo_auth` | 로그인·현재 학습자 | `GET /me` · `GET /auth/start` · `GET /auth/callback/google` · `POST /auth/logout` · `GET /health` | `auth.py` | core | 15초 · 256MB |
| `jojo_practice` | 연습 코드 만들기·주제 | `POST /practice` · `POST /practice/adjust` · `GET /topic/random` · `POST /topic/check` | `practice.py` · `topics.py` · `samples.py` · `samples_js.py` | core · ai · code_store | 10분 · 512MB |
| `jojo_inspect` | 내 코드 점검 | `POST /inspect` · `POST /inspect/start` | `inspect_code.py` | core · ai · code_store | 2분 · 512MB |
| `jojo_review` | 첨삭·다시 쓰기·튜터·코드 다시 열기 | `POST /review` · `POST /review/retry` · `POST /tutor` · `GET /code` | `review.py` · `tutor_chat.py` · `study.py`(기록) | core · ai · code_store | 3분 · 512MB |
| `jojo_study` | 내 공부 (AI 없음) | `GET /study` | `study.py` | core · code_store | 30초 · 256MB |
| `jojo_admin` | 관리자·실험 | `GET /admin/overview` · `POST /admin/ai` · `POST /admin/code` · `POST /admin/experiment` | `admin.py` · `experiment.py` + `practice.py` 묶음 | core · ai · code_store | 10분 · 512MB |

- 실행 역할은 모두 지금의 SafeRole (학교 계정은 새 역할 만들기가 막혀 있어요)
- 아키텍처는 모두 arm64, 런타임 Python 3.13
- `GET /code`(코드 다시 열기)는 첨삭·튜터 기록을 함께 돌려줘서 `jojo_review` 로 옮겨요. 그러면 `practice.py` 가 첨삭 파일을 부르지 않아도 돼요
- `POST /admin/migrate`(예전 데이터 옮기기)는 이전이 끝났으면 지워요 — 끝났는지 확인 필요
- GitHub 로그인(`/auth/callback/github`)은 화면에서 쓰지 않으면 지워요 — 확인 필요

---

## 2. 저장소 구조

```
lambda/
├─ shared/                공통 조각 (저장소에 한 벌)
│  ├─ core.py             설정 · AWS 연결 · 요청/응답·CORS · DynamoDB 도구 · 요청 수 제한 · 학습자 확인 · 설정 값 · id
│  ├─ ai.py               Bedrock 호출 · 월 예산 · 사용량 기록 · AI 응답 형식(Pydantic)
│  └─ code_store.py       읽을 코드 저장·꺼내기 · ※ 지점 정리 · 개념 추정
├─ features/              기능 파일 (지금 lambda/api 의 기능 파일)
│  └─ auth.py · practice.py · topics.py · samples*.py · inspect_code.py · review.py · tutor_chat.py · study.py · admin.py · experiment.py
├─ functions/             함수마다 입구 하나 (경로 → 처리 함수)
│  └─ auth.py · practice.py · inspect.py · review.py · study.py · admin.py
├─ functions.json         함수 목록: 이름 · 입구 · 넣을 기능 파일·공통 조각 · 제한 시간 · 메모리 · 환경 변수 이름
├─ requirements.txt       외부 라이브러리 (버전 고정)
└─ tests/
```

### 의존 규칙
- 기능 파일은 **공통 조각만** 불러요. 기능 파일끼리는 부르지 않아요
  - 예외: `review.py` → `study.py`(첨삭 기록 남기기), `experiment.py` → `practice.py`(같은 흐름으로 문항 만들기). `functions.json` 에 적어 둔 것만 허용
- 공통 조각끼리는 `ai` → `core`, `code_store` → `core` 만 (반대 방향 금지)
- 이 규칙은 테스트로 검사해요 (import 를 읽어 허용 목록과 비교)

---

## 3. 공통 조각의 경계 (지금 `common.py` 를 나누는 기준)

| 지금 `common.py` | → | 새 위치 |
|---|---|---|
| 1. 설정 · 2. AWS 연결 · 3. 요청/응답 · 4. DynamoDB · 5. 요청 수 제한 · 6. 학습자 · 8. 설정 값 · 10. id | → | `core.py` |
| 7. AI 호출 (Bedrock·예산·사용량·형식 검사·고치기) | → | `ai.py` |
| 9. 읽을 코드 (저장·꺼내기·※ 정리·개념 추정) | → | `code_store.py` |

- 함수별로 쓰는 양 (지금 기준): 로그인·내 공부·관리자는 `common.py` 의 약 3분의 1, 연습·점검·첨삭은 대부분
- 난이도·개념 목록 같은 상수는 `core.py` 에 두고 화면(`src/lib/api-types.ts`)과 같게 유지

---

## 4. 외부 라이브러리

| 라이브러리 | 쓰는 곳 | 대신하는 것 | 넣는 방법 |
|---|---|---|---|
| **Powertools for AWS Lambda (Python) v3** | 경로 나누기(`LambdaFunctionUrlResolver`) · JSON 로그(`Logger`) · 오류 지표(`Metrics`) | `run_route`·`read_request`·`reply` 일부, `print` 로그 | AWS 공개 레이어 (`AWSLambdaPowertoolsPythonV3-python313-arm64`, 서울 리전 ARN 은 배포할 때 공식 문서에서 확인) |
| **Pydantic v2** | 요청 본문 · AI 응답 형식 (Bedrock 도구 스키마를 모델에서 자동 생성) | `field()` · `check_schema()` · `repair_for_schema()` | 함수 zip 에 포함 |
| **tree-sitter + tree-sitter-javascript** | JavaScript 진짜 문법 검사 · 함수/클래스/재귀 세기 | `js_scan` · `js_structure` (겉모양 검사) | 함수 zip 에 포함 (`jojo_practice`·`jojo_admin`) |

- 버전은 `requirements.txt` 에 고정하고, 배포할 때 Lambda(arm64·Python 3.13)용 배포판을 받아요 (확인함: 모두 있음, 합계 약 4.5MB)
- 이 셋 말고 새 라이브러리를 넣으려면 이 표에 이유를 적고 정해요
- 쓰지 않기로 한 것: FastAPI+Mangum(경로는 Powertools 로 충분, 더 무거움), authlib(지금 Google 로그인이 잘 돌아감), jsonschema(Pydantic 으로 충분)
- boto3 는 Lambda 런타임에 들어 있는 것을 써요 (zip 에 넣지 않음)

---

## 5. 로그·오류 기준

| 항목 | 기준 |
|---|---|
| 로그 모양 | Powertools `Logger` JSON. 모든 로그에 `function` · `route` · `request_id` · `cold_start` |
| 요청 로그 | 경로·상태 코드·걸린 시간·학습자 id 앞 8자리. **요청 본문·코드·메모·비밀 값은 남기지 않음** |
| 예상한 오류 (`ApiError`, 4xx) | `info` 로 짧게 (사용자 잘못·한도) |
| 예상하지 못한 오류 (5xx) | `logger.exception` — 파일·줄·스택 전체. 화면에는 지금처럼 한국어 메시지만 |
| AI 호출 | 작업 이름·모델·토큰·걸린 시간·성공 여부·실패 이유 (지금 `OPS#USAGE`·`OPS#AILOG` 기록은 그대로) |
| 지표 (CloudWatch, EMF) | 이름공간 `CodeReadingNote`, 함수·경로별 `Errors` · `AiCalls` · `AiFailures` · `SampleFallbacks` · `Regenerations` |
| 찾는 법 | CloudWatch Logs Insights 에서 `filter level="ERROR" and route="/practice"` 처럼 검색. 자주 쓰는 검색문은 `docs/DEPLOY_LAMBDA.md` 에 |

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
| `TABLE_NAME` · `DB_REGION` · `TTL_ATTR` · `ALLOWED_ORIGINS` · `RATE_LIMIT_*` | 전부 |
| `AI_MODE` · `MODEL_ID` · `BEDROCK_REGION` · `AI_MONTHLY_BUDGET_USD` | AI 를 쓰는 함수 (practice · inspect · review · admin) + `jojo_auth`(`/health` 표시용 `AI_MODE`) |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `AUTH_CALLBACK_BASE` | `jojo_auth` |
| `ADMIN_TOKEN` | `jojo_admin` |
| `POWERTOOLS_SERVICE_NAME` (함수 이름) · `POWERTOOLS_METRICS_NAMESPACE`=`CodeReadingNote` | 전부 |

- `AUTH_CALLBACK_BASE` 는 `jojo_auth` 의 함수 URL 이에요. Google Cloud Console 의 "승인된 리디렉션 URI"도 이 주소로 바꿔요

---

## 8. 화면 연결
- 함수마다 함수 URL (인증 없음, CORS 는 코드에서)
- 화면 `src/lib/api.ts` 가 경로 앞부분으로 함수를 골라요: `/me`·`/auth`·`/health` → auth, `/practice`·`/topic` → practice, `/inspect` → inspect, `/review`·`/tutor`·`/code` → review, `/study` → study, `/admin` → admin
- 주소는 빌드 때 환경 변수 하나로: `NEXT_PUBLIC_API_URLS` = `{"auth": "...", "practice": "...", …}` (GitHub 저장소 변수 `API_URLS`)
- 내 컴퓨터(`npm run api`)는 지금처럼 주소 하나에서 모든 함수를 함께 띄워요

---

## 9. 배포

### 처음 한 번 (콘솔)
1. 함수 6개 만들기 (이름·런타임·arm64·SafeRole) → 제한 시간·메모리 (`## 1` 표)
2. 환경 변수 넣기 (`## 7`, 값은 지금 `jojo_api_py` 에서 옮기기)
3. Powertools 레이어 연결
4. 함수 URL 만들기 (인증 없음)
5. Google 리디렉션 URI 를 `jojo_auth` 주소로, GitHub 저장소 변수 `API_URLS` 에 주소 6개
6. 단계별 안내는 `docs/DEPLOY_LAMBDA.md` 에

### 매번 (CloudShell 명령 한 번)
```bash
git pull
npm run deploy        # 함수마다 필요한 파일·라이브러리만 묶어 zip 을 만들고 6개 함수를 업데이트
```
- 묶는 규칙은 `functions.json` 하나에서 읽어요 (사람이 파일을 고르지 않음)
- 먼저 확인할 것: 학교 계정 CloudShell 에서 `aws lambda update-function-code` 권한이 되는지. 안 되면 같은 명령이 만든 zip 을 콘솔에서 올려요
- 배포 뒤 `npm run smoke -- --remote` 로 6개 함수의 `/health`·기본 흐름 확인

---

## 10. 전환 순서
1. 공통 코드 나누기 (`common.py` → `core`·`ai`·`code_store`), 기능 파일 정리 (`GET /code` 이동, 끝난 코드 정리) — 동작은 그대로, 테스트로 확인
2. 라이브러리 적용 (Powertools 경로·로그 → Pydantic 형식 → tree-sitter JavaScript 검사)
3. 함수 6개 입구 + `functions.json` + 묶기·배포 명령 + 의존 규칙 테스트
4. 화면 주소 나누기 (`api.ts`, `API_URLS`)
5. 콘솔에서 함수 6개 준비 → 배포 → smoke → 화면 전환
6. 문제없으면 `jojo_api_py` 정지 (일주일 뒤 삭제). 문제가 있으면 화면 주소만 되돌리면 돼요

- 단계마다 typecheck · test · verify · build · smoke 통과 후 커밋

---

## 결정 기록
| 날짜 | 내용 |
|---|---|
| 2026-11-02 | 함수 6개 · `core`·`ai`·`code_store` · Powertools·Pydantic·tree-sitter · CloudShell 배포 · 함수마다 URL 로 확정 (함수 URL 은 선호 없음 → 추천안). 그전의 "Lambda 하나 · boto3 만 · zip 없음"은 정한 원칙이 아니었고 이 문서로 바뀜 |
