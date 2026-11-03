# 배포하기: GitHub Pages(화면) + Lambda 함수 6개 + DynamoDB + Bedrock

서버를 켜 두지 않는 구성입니다. 사람이 쓸 때만 Lambda 가 실행되고, 쓴 만큼만 요금이 나옵니다.
Lambda 는 **기능별 함수 6개**예요 (구조 기준: [`docs/LAMBDA_STRUCTURE.md`](LAMBDA_STRUCTURE.md)). 함수마다 필요한 파일만 들어가고, 무엇을 넣는지는 [`lambda/functions.json`](../lambda/functions.json) 하나에 있어요.
올리는 방법은 둘 중 하나: **A. 콘솔에 붙여넣기** — 함수 이름별 폴더 [`lambda/console/`](../lambda/console) 의 파일을 붙여넣고, 라이브러리(Powertools·Pydantic·tree-sitter)는 레이어 하나로 · **B. CloudShell 에서 `npm run deploy`** — 파일과 라이브러리를 zip 으로 묶어 한 번에.

```
브라우저 ──→ GitHub Pages (정적 화면)
   │  JSON (x-session-id 헤더) — 경로 앞부분으로 함수를 골라요 (src/lib/api-routes.ts). 내 코드는 화면에서 민감 정보를 가린 뒤 보냄
   ├─→ jojo_auth      /me · /auth · /health         로그인
   ├─→ jojo_practice  /practice · /topic            연습 코드 만들기 (AI 3번 · 최대 10분)
   ├─→ jojo_inspect   /inspect                      내 코드 점검
   ├─→ jojo_review    /review · /tutor · /code      첨삭·다시 쓰기·튜터·코드 다시 열기
   ├─→ jojo_study     /study                        내 공부 (AI 없음)
   └─→ jojo_admin     /admin                        관리자·논문 실험
         모두 ──→ DynamoDB jojo_table (서울) · AI 를 쓰는 함수 ──→ Bedrock Claude Haiku 4.5 (us-east-1)
```

> 비밀 값(관리자 복구 코드 `ADMIN_TOKEN`, Google `GOOGLE_CLIENT_SECRET`)은 Lambda 환경 변수에만 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.
> `npm run deploy` 는 환경 변수의 **이름만** 보여 주고 값은 찍지 않아요. 비밀 값은 그 값을 쓰는 함수에만 들어가요 (Google → `jojo_auth`, 관리자 → `jojo_admin`).

---

## 1단계. DynamoDB 테이블 (이미 있으면 건너뛰기)

지금 쓰는 테이블 **`jojo_table`** (파티션 키 `pk` 문자열, 정렬 키 `sk` 문자열, TTL 속성 `jojo_ttl`)을 그대로 씁니다.
새로 만든다면: DynamoDB → 테이블 생성 → 위의 이름·키 → 용량 **온디맨드** → 만든 뒤 **추가 설정 → TTL 켜기** → 속성 이름 `jojo_ttl`.

## 2단계. 함수 6개 만들기 — 방법 A 또는 B

### 방법 A. 콘솔에 붙여넣기 → [`lambda/console/`](../lambda/console)
GitHub 에서 **함수 이름별 폴더**(`lambda/console/jojo_auth/` …)를 열면 그 함수에 붙여넣을 파일만 있고, 아래에 설정 안내(README)가 보여요.
1. **라이브러리 레이어 한 번**: `lambda/console/jojo_libs_layer.zip` 을 내려받아 Lambda → 계층 → 계층 생성 (`jojo_libs`, arm64, Python 3.14)
2. **함수마다**: 함수 만들기(Python 3.14 · arm64 · `SafeRole-sgu-202688`) → 폴더의 파일 붙여넣기 → Deploy → 제한 시간·메모리 → 계층 `jojo_libs` 추가 → 환경 변수 → 함수 URL → `/health` 확인
3. 순서와 표: [`lambda/console/README.md`](../lambda/console/README.md)

폴더의 `.py` 는 원본(`lambda/api` · `lambda/functions`)을 `npm run package` 가 복사한 것이에요. 원본과 다르면 `npm test` 가 알려 줘요.

### 방법 B. CloudShell 명령 한 번에
AWS 콘솔 → 리전 **서울(ap-northeast-2)** → 위쪽 막대의 **CloudShell** 아이콘(`>_`).
```bash
git clone https://github.com/torgeleli22-lang/teamProject_night_first.git
cd teamProject_night_first
python3 -m pip --version && node --version   # 둘 다 버전이 나오면 준비 끝 (CloudShell 에 들어 있어요)
npm run deploy -- check     # 확인만 — 아무것도 바꾸지 않아요 (함수가 있는지 · 코드 올리기 권한 · 환경 변수 개수(이름만) · 함수 URL)
npm run deploy -- setup     # 없는 함수 만들기 · 환경 변수 옮기기 · 함수 URL
npm run deploy              # 코드 올리기 (바뀐 함수만) · /health 확인
```
`setup` 이 하는 일 (함수마다):
1. **없으면 만들기** — 이름·런타임(Python 3.14)·arm64·제한 시간·메모리는 `functions.json`, 실행 역할은 이미 있는 다른 함수와 같은 SafeRole
2. **공통 환경 변수 채우기** — 이미 있는 다른 함수에서 공통 이름만 (이미 있는 값은 그대로). 그 함수에만 넣는 비밀 값(`ADMIN_TOKEN`·Google)은 옮기지 않고 이름만 알려 줘요. 화면에는 이름만 나와요
3. **함수 URL** — 인증 없음 + 공개 호출 허용
4. 마지막에 **화면에 넣을 주소(JSON)** 와 **Google 리디렉션 URI** 를 알려 줘요

- 방법 B 는 라이브러리가 함수 zip 에 함께 들어가서 레이어가 필요 없어요. 대신 콘솔 코드 탭에서는 고칠 수 없어요 ("배포 패키지가 너무 커서 편집기에 표시할 수 없음")
- `pip` 가 없다고 나오면 `python3 -m ensurepip --user`. 학교 계정에서 함수 만들기가 거절되면 방법 A 로 만들고 `npm run deploy -- setup` 으로 환경 변수·URL 만 채워도 돼요

### 함수 표 (두 방법 같음)
| 함수 | 제한 시간 · 메모리 | 환경 변수 (공통 + ) |
|---|---|---|
| `jojo_auth` | 15초 · 256MB | `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` (· `AUTH_CALLBACK_BASE`) |
| `jojo_practice` | 10분 · 512MB | — |
| `jojo_inspect` | 2분 · 512MB | — |
| `jojo_review` | 3분 · 512MB | — |
| `jojo_study` | 30초 · 256MB | — |
| `jojo_admin` | 10분 · 512MB | `ADMIN_TOKEN` |

공통 환경 변수 (값은 6개 함수 모두 같게):

| 키 | 값 |
|---|---|
| `TABLE_NAME` | `jojo_table` |
| `TTL_ATTR` | `jojo_ttl` |
| `AI_MODE` | `live` (실제 AI) · `mock`(시험용, 비용 없음) · `off` |
| `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` |
| `AI_MONTHLY_BUDGET_USD` | `10` |
| 선택 | `MODEL_ID` · `BEDROCK_REGION` · `DB_REGION` · `RATE_LIMIT_*`(요청 수 제한, `core.py` 1번 설정) · `POWERTOOLS_LOG_LEVEL`(기본 `INFO`) |

- `ADMIN_TOKEN`(관리자 복구 코드, CloudShell `openssl rand -hex 24` 처럼 직접 정한 긴 값)은 `jojo_admin` 에만, Google 비밀 값은 `jojo_auth` 에만
- 예전 변수 `GENERATE_CODE_FUNCTION`, `AI_GENERATION_DAILY_LIMIT`, `GITHUB_CLIENT_ID`·`GITHUB_CLIENT_SECRET` 는 옮기지 않아요
- 제한 시간: 연습 코드 만들기는 AI 를 세 번(출제·실행 추적표·교차 검토) 부르고, 검사를 통과하지 못하면 다시 만들어서 중급·고급은 1~3분, 넉넉하게 10분
- 콘솔 시험: **테스트 탭** → 이벤트 `{"path": "/health", "method": "GET"}` → body 에 `"ok": true, "maxCodeLines": 300, "regenLimit": 5`. 다른 시험 이벤트: [`lambda/api/test_events.json`](../lambda/api/test_events.json)

## 3단계. 화면에 연결

GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables**
- **`API_URLS`** = 함수 6개의 함수 URL 을 담은 JSON (`{"auth": "https://…", "practice": "https://…", …}` — 방법 A 는 `lambda/console/README.md` 의 모양대로, 방법 B 는 `setup` 이 알려 준 그대로)
- 함수 URL 앞뒤에 `< >` 를 붙이지 않아요 (주소는 `https://` 로 시작). 화면은 알아보지 못한 주소를 버려요

→ **Actions → Deploy web (GitHub Pages) → Run workflow** (또는 main 에 병합하면 자동). 확인:
1. 화면에서 **연습 모드** → 난이도·주제 → 코드 받기 → 줄을 눌러 메모 → **첨삭 받기** → ○△✕ 결과 → 다시 써 보기 · 튜터
2. **내 코드 점검** → `.py` 파일 올리기 → 함수 고르기 → 메모하러 가기
3. **내 공부**, 관리자 화면(`/admin/`)의 이번 달 비용·작업별 사용량, **AI 끄기** 뒤 연습 코드가 예시 코드로 바뀌는지
4. 브라우저 F12 → Network 에서 요청을 눌러 **Headers → Request URL** 이 기능마다 다른 `lambda-url` 주소인지 (또는 열 제목을 오른쪽 클릭 → **Domain** 열 켜기)

## 4단계. Google 로그인 (선택)

로그인하면 기록이 탭을 닫아도 남아요 (학습자·'내 공부' 1년, 연습 코드 30일). 설정하지 않으면 로그인 버튼이 화면에 나오지 않아요.

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 만들기(또는 고르기)
2. **API 및 서비스 → OAuth 동의 화면**: 사용자 유형 **외부**, 앱 이름·지원 이메일 입력, 범위는 `openid`·`profile` 만 (추가하지 않아도 됨). 테스트 중이면 **테스트 사용자**에 쓸 계정을 넣거나 **앱 게시**
3. **사용자 인증 정보 → OAuth 클라이언트 ID** (유형 **웹 애플리케이션**) → **승인된 리디렉션 URI** 에 추가:
   `https://<jojo_auth 함수 URL 도메인>/auth/callback/google`
4. **클라이언트 ID** → `GOOGLE_CLIENT_ID`, **클라이언트 보안 비밀번호** → `GOOGLE_CLIENT_SECRET` — `jojo_auth` 의 구성 → 환경 변수에
5. 확인: `<jojo_auth 함수 URL>/me` → `"providers": {"google": true}`, 화면 오른쪽 위 **로그인** → 계정 고르기 → 이름이 보이면 끝

- 받는 정보는 계정 번호와 이름뿐이에요 (이메일은 요청하지 않음). 로그인하면 지금 탭에서 한 공부('내 공부', 연습 코드)가 계정으로 옮겨져요
- 콜백은 로그인을 시작한 함수 주소로 와요. 다른 주소로 받아야 할 때만 `AUTH_CALLBACK_BASE` 에 그 앞부분을 넣어요 (보통은 비워 둠)

## 5단계. 정리

화면이 6개 함수로 가는지 확인했으면 (3단계 4번), 예전 함수를 지워요 (2026-11-03: 예전 데이터 옮기기를 마치고 옮기기 코드·예전 함수 코드는 저장소에서 지웠어요)
1. Lambda → 함수 → **`jojo_api_py`** 선택 → **작업 → 삭제** (예전 Node.js `jojo_api`·`jojo_generate_code` 가 남아 있으면 같이)
2. CloudWatch → 로그 그룹 `/aws/lambda/jojo_api_py` 삭제 (선택)
3. GitHub 저장소 변수 **`API_URL`** 삭제 (화면은 `API_URLS` 만 써요)
4. 지우기 전에 비밀 값이 새 함수에 있는지: 관리자 화면에 관리자 코드로 들어가지면 `jojo_admin` 은 됨, Google 로그인을 쓰면 `jojo_auth` 의 `GOOGLE_*`

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 | main 에 병합 → Pages 자동 배포 |
| Lambda 코드 (방법 A) | main 에 병합 → 커밋에서 **`lambda/console/<함수 이름>/` 안의 바뀐 파일**만 그 함수에 다시 붙여넣고 Deploy (공통 조각이 바뀌면 그 파일이 있는 함수 모두). `jojo_libs_layer.zip` 이 바뀌면 레이어 새 버전 |
| Lambda 코드 (방법 B) | main 에 병합 → CloudShell 에서 `cd teamProject_night_first && git pull && npm run deploy` (바뀐 함수만 올라가요. 같은 내용이면 zip 도 똑같아서 "코드 그대로"). 함수 하나만: `npm run deploy -- jojo_review` |
| 예시 코드·랜덤 주제 | `samples.py`·`samples_js.py` 를 바꾸고 `npm run verify` · `npm run package` 통과 → 병합 → 위처럼 (`jojo_practice`·`jojo_admin`) |
| 제한 시간·메모리 | `lambda/functions.json` 을 고치고 `npm run package` → 방법 A 는 콘솔 일반 구성, 방법 B 는 `npm run deploy` 가 맞춰요 |
| 설정 (예산 등) | 함수마다 **구성 → 환경 변수** (다음 요청부터 반영). 모든 함수에 같은 값을 넣어야 하는 것(`AI_MODE`, `AI_MONTHLY_BUDGET_USD` 등)은 함수 6개 모두에 |
| 급하게 AI 를 멈추기 | 관리자 화면 **AI 끄기** (모든 함수가 30초 안에 따라와요 — DynamoDB 의 스위치를 함께 읽어요) |

내 컴퓨터에서는 `npm run api` 가 모든 기능을 `http://localhost:8787` 하나로 실행해요 (DynamoDB 흉내 서버 + 목업 AI). `npm run package` 로 zip 만 만들어 볼 수도 있어요 (`dist/lambda/`).

## 로그 보기 (CloudWatch)

함수마다 로그 그룹이 따로예요: `/aws/lambda/jojo_practice` 처럼. 한 줄이 JSON 하나이고 `route`(경로)·`request_id`·`level` 이 붙어 있어요.
CloudWatch → **Logs Insights** → 로그 그룹 고르기 → 검색문:
```
fields @timestamp, route, message, status, ms | filter level = "ERROR" | sort @timestamp desc        # 예상하지 못한 오류 (스택은 exception 칸)
filter message like "AI 대신" | stats count() by message, reason                                     # AI 대신 예시 코드·규칙을 쓴 횟수와 이유
filter message = "코드 다시 만듦" | fields @timestamp, problems                                         # 생성 코드가 규칙 검사에 걸린 이유
filter message = "요청" and ms > 10000 | fields @timestamp, route, ms                                  # 10초 넘게 걸린 요청
```
함수별 오류 수·실행 시간·호출 수는 Lambda → 함수 → **모니터링** 탭에 저절로 나와요 (따로 지표를 만들지 않아요).

## 요금 (대략)

- Lambda: 매달 요청 100만 건 · 40만 GB-초 무료 (함수가 6개여도 합쳐서 계산) → AI 를 기다리는 요청(10초, 512MB)도 한 달 8만 번까지 무료
- DynamoDB 온디맨드: 쓰기 100만 건 약 1.4달러, 읽기 100만 건 약 0.3달러 → 수십 센트 이하
- Bedrock (Haiku 4.5): 연습 코드 1개가 AI 세 번(출제·추적표·검토)이라 몇 센트, 첨삭 1번 1센트 안팎, 주제 판정 0.1센트 정도 (월 예산을 넘지 않게 코드가 막음)
- 함수 URL: 무료 (API Gateway 를 쓰지 않음) · CloudWatch 로그: 적은 양은 무료 (보관 기간을 2주로)

## 악성 사용자·요금 폭탄 막기

### 코드에 들어 있는 것 (`core.py`·`ai.py`, 설정 없이 동작 — 모든 함수가 DynamoDB 의 같은 카운터를 써요)
| 막는 것 | 방법 |
|---|---|
| AI 요금 | 월 예산을 넘으면 AI 를 부르지 않고 예시 코드·규칙 판정·규칙 첨삭으로 (이번 호출의 최대 비용까지 미리 계산) |
| 같은 코드를 계속 다시 만들기 | '더 쉽게·더 어렵게'는 처음 코드부터 **5번까지** |
| 한 사람이 AI 를 많이 부름 | 학습자 1명 1시간 30번, IP 1개 1시간 300번, 서비스 전체 1시간 400번 (넘으면 AI 없이) |
| 요청 폭주 | IP 1개 1분 600번, 새 학습자 IP 1개 1시간 120명, 요청 크기 256KB, 코드 300줄, 메모 20장·500자 |
| 이상한 요청 값 | 경로마다 정한 모양(Pydantic)으로 검사 — 형식·길이·범위가 틀리면 400 |
| 비밀 값 유출 | 올린 코드의 API 키·토큰·비밀번호는 **화면에서 먼저 가리고** 서버에서 한 번 더 가림. 올린 코드는 하루 뒤 자동 삭제. 로그에는 본문·코드·메모를 남기지 않음 |
| 남의 코드 보기 | 읽을 코드·첨삭은 만든 학습자만 열 수 있음 |
| 관리자 코드 맞히기 | 10번 틀리면 15분 잠김 |
| 다른 사이트에서 부르기 | `ALLOWED_ORIGINS` 의 화면 주소만 브라우저가 응답을 읽을 수 있음 (CORS) |

### AWS 콘솔에서 해 두면 좋은 것
1. **AWS Budgets 알림** — Billing → Budgets → 월 예산(예: 15달러) → 80%·100% 에 이메일 알림
2. **CloudWatch 로그 보관 기간** — 로그 그룹 `/aws/lambda/jojo_*` 마다 → 보존 기간 **2주**
3. (계정의 동시 실행 한도가 넉넉하면) **예약된 동시성** — AI 비용이 큰 `jojo_practice` 에 10 정도

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `{"Message":"Forbidden"}` | 함수 URL 공개 허용이 빠짐 → 함수 폴더 README 4번의 `add-permission` 두 줄 (방법 B 는 `npm run deploy -- setup` 다시) |
| `No module named 'aws_lambda_powertools'`·`'pydantic'` | 계층 `jojo_libs` 를 붙이지 않았어요 (방법 A) |
| `No module named 'core'` 처럼 파일 이름 | 폴더의 파일을 다 붙여넣지 않았거나 이름이 달라요 (`inspect.py` 가 아니라 `inspect_code.py`) |
| `Runtime.ImportModuleError` · `No module named 'pydantic_core._pydantic_core'` | 함수가 arm64·Python 3.14 가 아니에요 (**런타임 설정**·아키텍처 확인, 레이어도 arm64·3.14 로 만들었는지) |
| `npm run deploy` 가 `AccessDeniedException` | `npm run deploy -- check` 로 어느 권한인지 확인 → 막히면 방법 A (콘솔) |
| 화면에 "서버에 연결하지 못했어요" / CORS 오류 | 그 함수의 `ALLOWED_ORIGINS`(경로 없이), GitHub `API_URLS` 의 주소, 화면 다시 배포 |
| 연습 코드가 늘 예시 코드("준비된 예시 코드를 드려요") | 관리자 화면 AI 스위치, `jojo_practice` 의 `AI_MODE`, 로그의 `AI 대신 …` 줄 `reason` (`AccessDeniedException` → 역할의 Bedrock 권한, `monthly AI budget reached` → 월 예산) |
| "AI 가 만든 코드가 검사를 통과하지 못해…" | `jojo_practice` 로그의 `코드 다시 만듦` 줄 `problems` 에 이유가 있어요 (문법 오류, 너무 긺, ※ 줄을 못 찾음) |
| `Task timed out` | 그 함수의 제한 시간을 함수 표대로 (연습 코드 10분) |
| 오랜만에 열면 첫 요청이 느림 | 정상 (콜드 스타트 약 1~2초, 함수마다 따로) |
