# 배포하기: GitHub Pages(화면) + Lambda 1개 + DynamoDB + Bedrock

서버를 켜 두지 않는 구성입니다. 사람이 쓸 때만 Lambda 가 실행되고, 쓴 만큼만 요금이 나옵니다.
Lambda 코드는 **콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스**예요 (zip·빌드 없음). 왜 함수가 하나인지: [`lambda/README.md`](../lambda/README.md)

```
브라우저 ──→ GitHub Pages (정적 화면)
   │  JSON (x-session-id 헤더) — 주소는 하나. 내 코드는 화면에서 민감 정보를 가린 뒤 보냄
   └─→ jojo_api 함수 URL (Python) ──→ DynamoDB jojo_table (서울)
                                  └─→ Bedrock Claude Haiku 4.5 (us-east-1)
```

> 비밀 값(관리자 복구 코드 `ADMIN_TOKEN`)은 Lambda 환경 변수에만 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.

---

## 1단계. DynamoDB 테이블 (이미 있으면 건너뛰기)

지금 쓰는 테이블 **`jojo_table`** (파티션 키 `pk` 문자열, 정렬 키 `sk` 문자열, TTL 속성 `jojo_ttl`)을 그대로 씁니다.
새로 만든다면: DynamoDB → 테이블 생성 → 위의 이름·키 → 용량 **온디맨드** → 만든 뒤 **추가 설정 → TTL 켜기** → 속성 이름 `jojo_ttl`.

예전 학습 기록(문제·풀이)은 새 서비스에서 읽지 않아요. 그대로 두어도 되고(관리자 코드·이번 달 AI 사용량은 이어서 씀), 지우고 싶으면 테이블을 비워도 됩니다.

## 2단계. `jojo_api` (Python) — 화면의 모든 요청

이미 만든 **`jojo_api_py`** 를 그대로 고쳐 씁니다 (새로 만든다면 아래 1번부터).

1. Lambda → **함수 생성 → 새로 작성**
   - 런타임 **Python 3.13 이상**(3.14 도 됨), 아키텍처 **arm64**
   - 기본 실행 역할 변경 → 기존 역할 사용 → **`SafeRole-sgu-202688`**
2. **코드 탭** — 파일 목록을 아래와 똑같이 맞춥니다.

   | 파일 | 하는 일 |
   |---|---|
   | `lambda_function.py` | 입구 (경로 → 기능 파일) |
   | `auth.py` | Google·GitHub 로그인 (선택, 5단계) |
   | `common.py` | 공통 도구 (요청·응답, 요청 수 제한, 학습자, DynamoDB, AI, 읽을 코드) |
   | `topics.py` | 주제 고르기 (랜덤 · 직접 적은 주제 판정) |
   | `practice.py` | 연습 코드 만들기 · 더 쉽게/어렵게 · 다시 읽기 |
   | `inspect_code.py` | 내 코드 점검 |
   | `review.py` | 빨간펜 첨삭 |
   | `tutor_chat.py` | 첨삭 뒤 AI 튜터 대화 |
   | `study.py` | 내 공부: 난이도 추천 · 개념별 약점 지도 · 내 설명 노트 (AI 없음) |
   | `admin.py` | 관리자 (AI 사용량·비용·AI 끄기) |
   | `experiment.py` | 논문 실험: 문항 하나 만들고 단계 기록 (관리자 코드 필요, `docs/EXPERIMENT.md`) |
   | `samples.py` | AI 를 쓸 수 없을 때의 예시 코드 |
   | `samples_js.py` | AI 를 쓸 수 없을 때의 JavaScript 예시 코드 |

   - **지울 파일** (예전 기능, 남아 있어도 불리지 않지만 헷갈리니 지우기): `questions.py`, `submit_answer.py`, `my_page.py`, `learner_analysis.py`, `generate_theory.py`, `load_content.py`, `content.json`, `test_events.json`
   - 각 파일은 GitHub 에서 열고 **Raw** → 전체 선택·복사 → 콘솔의 같은 이름 파일에 **전체를 바꿔** 붙여넣기 (없으면 **파일 → 새 파일**로 이름 그대로) → **Deploy**
   - 붙여넣기가 중간에 끊기면 `module 'xxx' has no attribute 'ROUTES'` 처럼 파일 이름을 알려 주는 오류가 나요. 그 파일만 다시 붙여넣으면 됩니다.
3. **구성 → 일반 구성 → 편집**: 메모리 **512MB**, 제한 시간 **10분**
   (화면 요청은 0.1초 안팎, AI 를 부르는 요청은 5~20초, **중급(100~150줄)·고급(150~300줄) 코드 만들기는 1~2분**. AI 가 만든 코드가 검사를 통과하지 못하면 한 번 더 부르기 때문에 넉넉하게 10분)
4. **구성 → 환경 변수**

   | 키 | 값 |
   |---|---|
   | `TABLE_NAME` | `jojo_table` |
   | `TTL_ATTR` | `jojo_ttl` |
   | `AI_MODE` | `live` (실제 AI) · `mock`(시험용, 비용 없음) · `off` |
   | `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` |
   | `AI_MONTHLY_BUDGET_USD` | `10` |
   | `ADMIN_TOKEN` | 직접 정한 긴 값 (CloudShell `openssl rand -hex 24`) — **관리자 복구 코드** |

   - 예전 변수 `GENERATE_CODE_FUNCTION`, `AI_GENERATION_DAILY_LIMIT` 는 이제 쓰지 않아요 (지워도 됨)
   - 선택: `MODEL_ID`, `RATE_LIMIT_*`(요청 수 제한, `common.py` 1번 설정 참고)
   - 로그인을 쓰려면 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`GITHUB_CLIENT_ID`·`GITHUB_CLIENT_SECRET` (5단계)
5. **테스트 탭** → 이벤트 `{"path": "/health", "method": "GET"}` → **테스트** → body 에 `"ok": true, "maxCodeLines": 300, "regenLimit": 5`
   다른 시험 이벤트(주제 판정, 연습 코드, 내 코드 훑어보기, 관리자): [`lambda/api/test_events.json`](../lambda/api/test_events.json)
6. **함수 URL** (이미 있으면 건너뛰기): 구성 → 함수 URL → 생성 → 인증 유형 **NONE**, **CORS 는 설정하지 않음**(코드가 `ALLOWED_ORIGINS` 로 처리).
   학교 계정은 공개 허용이 빠질 수 있어서 CloudShell 에서 한 번 실행 (이미 있으면 `ResourceConflictException` 은 괜찮음):
   ```bash
   FN=jojo_api_py
   aws lambda update-function-url-config --region ap-northeast-2 --function-name $FN --auth-type NONE
   aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
   aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
   ```
   확인: 브라우저에서 `<함수 URL>health`

## 3단계. 화면에 연결

GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → `API_URL` = 2단계 함수 URL (**끝의 `/` 빼고**)
→ 화면 코드가 main 에 병합되면 자동 배포 (또는 **Actions → Deploy web (GitHub Pages) → Run workflow**)

## 4단계. 확인하고 정리

1. 화면에서 **연습 모드** → 난이도·주제 → 코드 받기 → 줄을 눌러 메모 → **첨삭 받기** → ○△✕ 결과
2. **내 코드 점검** → `.py` 파일 올리기 → 함수 고르기 → 메모하러 가기
3. 관리자 화면(`/admin/`)에서 이번 달 비용·작업별 사용량이 늘었는지, **AI 끄기** 뒤 연습 코드가 예시 코드로 바뀌는지
4. 예전 Node.js 함수 `jojo_generate_code` 와 예전 Node.js `jojo_api` 가 남아 있으면 삭제
5. **키·필드 이름을 바꾼 버전을 처음 올렸다면**: 관리자 화면 → **예전 데이터 옮기기** 를 한 번 누르기 (`POST /admin/migrate`). 예전 키 이름(`LEARNER`, `READ#…`, `STUDY#…`, `STATS` 등)의 항목을 새 이름(`USER#`·`CODE#`·`OPS#`)으로 옮기고, 예전 필드 이름(`learnerId`·`owner` → `userId`, `readingId`·`id` → `codeId` 등)을 고쳐요. 여러 번 눌러도 결과가 같아요 (두 번째부터는 0). 누르기 전까지는 예전 기록이 화면에 보이지 않아요.

## 5단계. Google·GitHub 로그인 (선택)

로그인하면 기록이 탭을 닫아도 남아요 (학습자·'내 공부' 1년, 연습 코드 30일). 설정하지 않은 쪽 버튼은 화면에 나오지 않아요.
**클라이언트 보안 비밀(secret)은 Lambda 환경 변수에만** 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.

콜백 주소는 함수 URL 뒤에 `/auth/callback/<google 또는 github>` 를 붙인 값입니다 (함수 URL 끝의 `/` 는 하나만):
- Google: `https://<함수 URL 도메인>/auth/callback/google`
- GitHub: `https://<함수 URL 도메인>/auth/callback/github`

**Google**
1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 만들기(또는 고르기)
2. **API 및 서비스 → OAuth 동의 화면**: 사용자 유형 **외부**, 앱 이름·지원 이메일 입력, 범위는 `openid`·`profile` 만 (추가하지 않아도 됨). 테스트 중이면 **테스트 사용자**에 쓸 계정을 넣거나 **앱 게시**
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 유형 **웹 애플리케이션**
   - 승인된 리디렉션 URI: 위 Google 콜백 주소
4. 만들어진 **클라이언트 ID** → 환경 변수 `GOOGLE_CLIENT_ID`, **클라이언트 보안 비밀번호** → `GOOGLE_CLIENT_SECRET`

**GitHub**
1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**
   - Homepage URL: `https://torgeleli22-lang.github.io/teamProject_night_first/`
   - Authorization callback URL: 위 GitHub 콜백 주소
2. **Client ID** → `GITHUB_CLIENT_ID`, **Generate a new client secret** → `GITHUB_CLIENT_SECRET`

**Lambda**
1. 코드 탭에 `auth.py` 를 새 파일로 추가하고, `common.py`·`lambda_function.py` 를 바꿔 붙여넣기 → **Deploy**
2. 구성 → 환경 변수에 위 네 값 추가 (`ALLOWED_ORIGINS` 는 그대로 — 로그인 뒤 돌아갈 화면도 이 주소만 허용)
3. 확인: `<함수 URL>/me` → `"providers": {"google": true, "github": true}`, 화면 오른쪽 위 **로그인** → 계정 고르기 → 이름이 보이면 끝

- 받는 정보는 계정 번호와 이름뿐이에요 (이메일·저장소 권한은 요청하지 않음).
- 로그인하면 지금 탭에서 한 공부('내 공부', 연습 코드)가 계정으로 옮겨져요.
- 함수 URL 이 아닌 다른 주소로 콜백을 받아야 하면 `AUTH_CALLBACK_BASE` 에 그 앞부분을 넣어요 (보통은 비워 둠).

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 | main 에 병합 → Pages 자동 배포 |
| Lambda 코드 | GitHub 에서 바뀐 파일만 콘솔 코드 탭에 붙여넣고 **Deploy** |
| 예시 코드·랜덤 주제 | `samples.py`·`samples_js.py` 를 바꾸고 `npm run verify` 통과 → 콘솔에 붙여넣기 |
| 설정 (예산 등) | **구성 → 환경 변수** (다음 요청부터 반영) |
| 급하게 AI 를 멈추기 | 관리자 화면 **AI 끄기** (30초 안에 반영) 또는 환경 변수 `AI_MODE=off` |

콘솔에서 직접 고쳤다면 GitHub 의 같은 파일에도 반영해 주세요. 그래야 팀원과 공유되고 자동 검사(`npm run smoke`)가 확인합니다.
내 컴퓨터에서는 `npm run api` 가 같은 코드를 `http://localhost:8787` 로 실행해요 (DynamoDB 흉내 서버 + 목업 AI).

## 요금 (대략)

- Lambda: 매달 요청 100만 건 · 40만 GB-초 무료 → 512MB 면 AI 를 기다리는 요청(10초)도 한 달 8만 번까지 무료
- DynamoDB 온디맨드: 쓰기 100만 건 약 1.4달러, 읽기 100만 건 약 0.3달러 → 수십 센트 이하
- Bedrock (Haiku 4.5): 연습 코드 1개·첨삭 1번이 각각 1센트 안팎, 주제 판정 0.1센트 정도 (월 예산을 넘지 않게 코드가 막음)
- 함수 URL: 무료 (API Gateway 를 쓰지 않음)

## 악성 사용자·요금 폭탄 막기

### 코드에 들어 있는 것 (`common.py`, 설정 없이 동작)
| 막는 것 | 방법 |
|---|---|
| AI 요금 | 월 예산을 넘으면 AI 를 부르지 않고 예시 코드·규칙 판정·규칙 첨삭으로 (이번 호출의 최대 비용까지 미리 계산) |
| 같은 코드를 계속 다시 만들기 | '더 쉽게·더 어렵게'는 처음 코드부터 **5번까지** |
| 한 사람이 AI 를 많이 부름 | 학습자 1명 1시간 30번, IP 1개 1시간 300번, 서비스 전체 1시간 400번 (넘으면 AI 없이) |
| 요청 폭주 | IP 1개 1분 600번, 새 학습자 IP 1개 1시간 120명, 요청 크기 256KB, 코드 300줄, 메모 20장·500자 |
| 비밀 값 유출 | 올린 코드의 API 키·토큰·비밀번호는 **화면에서 먼저 가리고** 서버에서 한 번 더 가림. 올린 코드는 하루 뒤 자동 삭제 |
| 남의 코드 보기 | 읽을 코드·첨삭은 만든 학습자만 열 수 있음 |
| 관리자 코드 맞히기 | 10번 틀리면 15분 잠김 |
| 다른 사이트에서 부르기 | `ALLOWED_ORIGINS` 의 화면 주소만 브라우저가 응답을 읽을 수 있음 |

### AWS 콘솔에서 해 두면 좋은 것
1. **동시 실행 제한** — jojo_api → 구성 → 동시성 → **예약된 동시성 20**
2. **AWS Budgets 알림** — Billing → Budgets → 월 예산(예: 15달러) → 80%·100% 에 이메일 알림
3. **CloudWatch 로그 보관 기간** — 로그 그룹 `/aws/lambda/<함수 이름>` → 보존 기간 **2주**

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `{"Message":"Forbidden"}` | 2단계 6번 함수 URL 공개 허용 |
| `No module named 'xxx'` | 그 파일을 코드 탭에 새 파일로 만들었는지, 이름이 정확한지 (`inspect.py` 가 아니라 `inspect_code.py`) |
| `xxx.py 에 ROUTES 이(가) 없어요` | 그 파일이 비었거나 일부만 붙여넣어졌어요 → 전체를 다시 붙여넣고 Deploy |
| 화면에 "서버에 연결하지 못했어요" / CORS 오류 | `ALLOWED_ORIGINS`(경로 없이), GitHub `API_URL` 끝의 `/` 제거, 화면 다시 배포 |
| 연습 코드가 늘 예시 코드("준비된 예시 코드를 드려요") | 관리자 화면 AI 스위치, `AI_MODE`, CloudWatch 로그의 `[ai]` 줄 (`AccessDeniedException` → 역할의 Bedrock 권한, `monthly AI budget reached` → 월 예산) |
| "AI 가 만든 코드가 검사를 통과하지 못해…" | 로그의 `[generate] 다시 만듦:` 줄에 이유가 있어요 (문법 오류, 너무 긺, ※ 줄을 못 찾음) |
| `Task timed out` | 제한 시간을 10분으로 (중급·고급 코드 만들기가 오래 걸려요) |
| 오랜만에 열면 첫 요청이 느림 | 정상 (콜드 스타트 약 1초) |
