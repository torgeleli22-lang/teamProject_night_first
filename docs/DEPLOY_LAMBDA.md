# 배포하기: GitHub Pages(화면) + Lambda 3개 + DynamoDB + Bedrock

서버를 켜 두지 않는 구성이에요. 쓸 때만 Lambda 가 실행되고, 쓴 만큼만 요금이 나와요.
Lambda 는 CloudShell 에서 **`npm run deploy`** 로 올려요 (콘솔에 붙여넣어도 돼요) (구조: [`docs/LAMBDA_STRUCTURE.md`](LAMBDA_STRUCTURE.md)).

```
브라우저 ──→ GitHub Pages (정적 화면)
   │  JSON (x-session-id 헤더) — 경로로 함수를 골라요 (src/lib/api-routes.ts)
   ├─→ jojo_auth      /me · /auth · /health   로그인 (Google)
   ├─→ jojo_practice  /practice               코드 만들기: 생성 AI → 규칙 검사 → 검토 AI (최대 10분)
   └─→ jojo_review    /review · /code         채점 · 코드 다시 열기
         모두 ──→ DynamoDB jojo_table (서울) · practice·review ──→ Bedrock (us-east-1): Claude Haiku 4.5 · 검토는 GPT-5.6 Luna
```

> 비밀 값(`ADMIN_TOKEN`, `GOOGLE_CLIENT_SECRET`)은 Lambda 환경 변수에만 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.

---

## 1. DynamoDB 테이블 (이미 있으면 건너뛰기)
**`jojo_table`** — 파티션 키 `pk`(문자열), 정렬 키 `sk`(문자열), 용량 온디맨드, TTL 속성 `jojo_ttl`.

## 2. 레이어 `jojo_libs` (이미 있으면 건너뛰기)
라이브러리(Powertools · Pydantic · tree-sitter, `lambda/requirements.txt`)를 레이어 하나로 모든 함수가 같이 써요.
`npm run layer` → `dist/jojo_libs_layer.zip` → Lambda → 계층 → 계층 생성 (`jojo_libs`, 호환 런타임 Python 3.14, 아키텍처 arm64)

## 3. 함수 3개

### 코드 올리기 (기본: `npm run deploy`)
AWS CloudShell (리전 서울)에서:
```bash
cd ~/teamProject_night_first && git pull     # 처음이면: git clone https://github.com/torgeleli22-lang/teamProject_night_first.git
npm run deploy                               # 함수 3개 모두 (하나만: npm run deploy -- jojo_practice)
```
함수마다 `lambda/<함수>/*.py` + `lambda/shared/*.py` 를 **폴더 없이 zip 하나로** 묶어 코드를 통째로 바꾸고, 반영을 기다린 뒤 함수 URL 의 `/health` 를 확인해요.
같은 코드면 올리지 않아요. 환경 변수·설정은 건드리지 않아요. 결과 예:
```
jojo_auth: 코드 그대로 (올리지 않음) · /health ✓ (AI_MODE=live)
jojo_practice: 올림 (7개 파일: generate.py, lambda_function.py, levels.py, rules.py, samples.py, ai.py, core.py) · /health ✓ (AI_MODE=live)
```
`/health ✗` 이면 콘솔 테스트 탭(`{"path": "/health", "method": "GET"}`)에서 오류를 봐요. `AccessDenied` 면 콘솔에 붙여넣어요 (아래).

### 함수 설정

| 함수 | 붙여넣을 파일 | 제한 시간 · 메모리 | 이 함수에만 넣는 환경 변수 |
|---|---|---|---|
| `jojo_auth` | `lambda/jojo_auth/` 전부 + `lambda/shared/` 전부 | 15초 · 256MB | `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` |
| `jojo_practice` | `lambda/jojo_practice/` 전부 + `lambda/shared/` 전부 | 10분 · 512MB | `ADMIN_TOKEN` (실험용 관리자 코드) |
| `jojo_review` | `lambda/jojo_review/` 전부 + `lambda/shared/` 전부 | 3분 · 512MB | — |

함수마다 (새로 만들 때): Lambda → 함수 생성 → Python 3.14 · arm64 · 실행 역할 SafeRole → 코드 탭에 위 파일을 **같은 이름으로** 만들어 붙여넣기 → **Deploy**
→ 구성 → 일반 구성(제한 시간·메모리) → 계층 추가 `jojo_libs` → 환경 변수 → 함수 URL(인증 없음, CORS 는 코드가 처리) → 핸들러 `lambda_function.lambda_handler`

- 콘솔에 직접 붙여넣을 때는 **맨 위 폴더에(폴더 없이) 위 파일만** 두고 나머지 .py 는 지운 뒤 Deploy. `core.py`·`ai.py` 를 빠뜨리면 `No module named 'core'` 오류가 나요
- 시험: 테스트 탭 → 이벤트 `{"path": "/health", "method": "GET"}` → body 에 `"ok": true`

공통 환경 변수 (세 함수 모두 같게):

| 키 | 값 |
|---|---|
| `TABLE_NAME` | `jojo_table` |
| `TTL_ATTR` | `jojo_ttl` |
| `AI_MODE` | `live` (실제 AI) · `mock`(시험용, 비용 없음) · `off` |
| `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` |
| `AI_MONTHLY_BUDGET_USD` | `10` |
| 선택 | `HISTORY_HINTS` (`off` 면 생성 기록 지침을 쓰지 않음, 기본 켜짐) · `REVIEW_MODEL_ID` · `CHECK_MODEL_ID` · `CHECK_MODEL_ID_HIGH` · `MODEL_ID` (아래 'AI 모델') · `BEDROCK_REGION` · `DB_REGION` · `RATE_LIMIT_*` (요청 수 제한, `lambda/shared/core.py` 1번) · `POWERTOOLS_LOG_LEVEL` |

- `ADMIN_TOKEN`: 실험 스크립트가 단계별 기록을 받을 때 쓰는 관리자 코드. CloudShell `openssl rand -hex 24` 처럼 직접 정한 긴 값을 `jojo_practice` 에만
- 제한 시간: 코드 만들기는 AI 를 보통 2번(생성·검토), 많으면 6번 불러서 고급은 1~3분 걸릴 수 있어 넉넉하게 10분

### AI 모델 (Bedrock, us-east-1)
| 단계 | 모델 | 정하는 곳 (기본값은 `lambda/shared/core.py`, 바꾸려면 환경 변수) |
|---|---|---|
| 생성 · 부분 수정 · 채점 | Claude Haiku 4.5 `us.anthropic.claude-haiku-4-5-20251001-v1:0` | `MODEL_ID` |
| 검토 (교차 검증) | **GPT-5.6 Luna** `us.openai.gpt-5.6-luna` | `REVIEW_MODEL_ID` (`jojo_practice`) |
| 검토 2 (초급·중급) | Claude Haiku 4.5 (검토 1 과 다른 모델) | `CHECK_MODEL_ID` (비우면 `MODEL_ID`) |
| 검토 2 (고급) | GPT-5.6 Luna 를 한 번 더 따로 | `CHECK_MODEL_ID_HIGH` (비우면 `REVIEW_MODEL_ID`) |

- 두 모델 모두 Bedrock 콘솔(버지니아 북부) → **모델 액세스**에서 '액세스 권한 부여됨'이어야 해요. 키는 필요 없어요 (실행 역할 SafeRole 권한)
- 다른 모델을 써 보기: `python3 scripts/check_review_model.py` 로 모델·추론 프로필 ID 를 찾고 `python3 scripts/check_review_model.py <ID>` 로 시험 → `REVIEW_MODEL_ID` 에 넣기
- 확인: `curl -s <jojo_practice 함수 URL>/health` → `"models": {"generate": "…haiku…", "review": "us.openai.gpt-5.6-luna"}`. 실험 `--reps 1` 에서 `bedrock: AccessDeniedException` 이면 실행 역할이 그 모델을 막고 있어요
- 가격(월 예산 계산)은 `core.py` 의 `PRICE`. 표에 없는 모델(지금 GPT-5.6 Luna)은 가장 비싼 값으로 넉넉하게 계산해요

## 4. 화면에 연결
GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → **`API_URLS`**
```json
{"auth": "https://<jojo_auth 함수 URL>", "practice": "https://<jojo_practice 함수 URL>", "review": "https://<jojo_review 함수 URL>"}
```
(`< >` 는 빼고 `https://` 로 시작하는 주소 그대로) → main 에 병합하면 Pages 가 자동 배포돼요.
확인: 연습 → 언어·난이도·주제 → 코드 받기 → 줄을 눌러 메모 → **채점 받기** → ○△✕⬚ 와 모범 설명·실행 기록

## 5. Google 로그인 (선택)
1. Google Cloud Console → OAuth 동의 화면(외부, 범위 `openid`·`profile`) → OAuth 클라이언트 ID(웹 애플리케이션)
2. 승인된 리디렉션 URI: `https://<jojo_auth 함수 URL 도메인>/auth/callback/google`
3. 클라이언트 ID·보안 비밀번호 → `jojo_auth` 의 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`
4. 확인: `<jojo_auth 함수 URL>/me` → `"providers": {"google": true}`

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 | main 에 병합 → Pages 자동 배포 |
| Lambda 코드 | main 에 병합 → CloudShell 에서 `git pull && npm run deploy` |
| 예시 코드·랜덤 주제 | `lambda/jojo_practice/samples.py` → `npm run verify` 통과 → 병합 → `npm run deploy -- jojo_practice` |
| 라이브러리 | `lambda/requirements.txt` → `npm run layer` → 계층 새 버전 → 세 함수의 계층 버전 바꾸기 |
| 설정 (예산 등) | 함수마다 구성 → 환경 변수 (다음 요청부터 반영) |
| 급하게 AI 를 멈추기 | `jojo_practice`·`jojo_review` 의 `AI_MODE` 를 `off` (예시 코드·규칙 채점으로) |

## 로그 (CloudWatch)
로그 그룹은 함수마다 `/aws/lambda/jojo_practice` 처럼. 한 줄이 JSON 하나이고 `route`·`request_id`·`level` 이 붙어요. Logs Insights 검색문:
```
fields @timestamp, route, message, status, ms | filter level = "ERROR" | sort @timestamp desc     # 예상하지 못한 오류
filter message like "AI 대신" or message = "검토를 못 함" | stats count() by message, reason      # 예시 코드·규칙 채점을 쓴 이유
filter message = "AI 응답 형식 불일치" | fields @timestamp, task, issues, shape                    # AI 답 형식 오류
```

## 요금 (대략)
- Lambda·함수 URL·DynamoDB: 이 규모면 무료 한도 안이거나 수십 센트
- Bedrock (Haiku 4.5): 코드 하나 몇 센트(생성·검토), 채점 1번 1센트 안팎. 월 예산(`AI_MONTHLY_BUDGET_USD`)을 넘을 호출은 코드가 하지 않아요
- 요청 수 제한: IP·학습자·서비스 전체의 1시간 AI 요청 수 (`lambda/shared/core.py` 1번 `LIMITS`)
