# 배포하기: GitHub Pages(화면) + 기능별 Lambda + DynamoDB + Bedrock

서버를 켜 두지 않는 구성입니다. 사람이 쓸 때만 Lambda 가 실행되고, 쓴 만큼만 요금이 나옵니다.
Lambda 코드는 **콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스**예요 (zip·빌드 없음). 폴더별 설명: [`lambda/README.md`](../lambda/README.md)

```
브라우저 ──→ GitHub Pages (정적 화면)
   │  기능마다 다른 함수 URL 로 JSON (x-session-id 헤더)
   ├─→ questions      ─┐
   ├─→ submit-answer  ─┼─→ DynamoDB jojo_table (서울)          실행 역할 SafeRole-sgu-202688
   ├─→ tutor-chat     ─┤   Bedrock Claude Haiku 4.5 (us-east-1)
   ├─→ my-page        ─┤
   └─→ admin          ─┘
         다른 Lambda 가 기다리지 않고 부르는 함수: learner-analysis · generate-theory · generate-code
         처음 한 번 콘솔에서 실행: load-content (기본 문제 넣기)
```

> 비밀 값(관리자 복구 코드 `ADMIN_TOKEN`)은 Lambda 환경 변수에만 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.

---

## 1단계. DynamoDB 테이블 (이미 있으면 건너뛰기)

지금 쓰는 테이블 **`jojo_table`** (파티션 키 `pk` 문자열, 정렬 키 `sk` 문자열, TTL 속성 `jojo_ttl`)을 그대로 씁니다.
새로 만든다면: DynamoDB → 테이블 생성 → 위의 이름·키 → 용량 **온디맨드** → 만든 뒤 **추가 설정 → TTL 켜기** → 속성 이름 `jojo_ttl`.

예전 API Lambda(`jojo_api`)와 **같은 테이블·같은 항목 모양**이라서 학습 기록·관리자 코드·AI 콘텐츠·이번 달 AI 사용량이 그대로 이어집니다 (옮길 것 없음).

## 2단계. 함수 9개 만들기 (서울 리전)

Lambda → **함수 생성 → 새로 작성** 을 아래 표대로 반복합니다. 함수 이름은 예시이고, 바꾸면 3단계의 함수 이름 환경 변수도 같이 바꿔 주세요.

| 함수 이름 (예) | 폴더 | 런타임 | 제한 시간 | 메모리 | 함수 URL |
|---|---|---|---|---|---|
| `jojo_load_content` | `lambda/load-content` | Python 3.13 | 1분 | 256MB | 없음 |
| `jojo_my_page` | `lambda/my-page` | Python 3.13 | 15초 | 256MB | **만들기** |
| `jojo_questions` | `lambda/questions` | Python 3.13 | 15초 | 256MB | **만들기** |
| `jojo_submit_answer` | `lambda/submit-answer` | Python 3.13 | 30초 | 256MB | **만들기** |
| `jojo_tutor_chat` | `lambda/tutor-chat` | Python 3.13 | 30초 | 256MB | **만들기** |
| `jojo_admin` | `lambda/admin` | Python 3.13 | 15초 | 256MB | **만들기** |
| `jojo_learner_analysis` | `lambda/learner-analysis` | Python 3.13 | 1분 | 256MB | 없음 |
| `jojo_generate_theory` | `lambda/generate-theory` | Python 3.13 | 5분 | 256MB | 없음 |
| `jojo_generate_code` | `lambda/generate-code` | **Node.js 22.x** | 5분 | 1024MB | 없음 |

함수마다:
1. **함수 생성** 화면: 이름, 런타임, **기본 실행 역할 변경 → 기존 역할 사용 → `SafeRole-sgu-202688`**
2. **코드 탭**
   - Python: `lambda_function.py` 내용을 그 폴더의 파일로 통째로 바꾸고, **파일 → 새 파일 → `common.py`** 에 [`lambda/common/common.py`](../lambda/common/common.py) 를 붙여넣기
     (load-content 는 **`content.json`** 도 새 파일로 추가)
   - Node.js(generate-code): `index.mjs` 를 바꾸고, 새 파일 `checks.mjs`, `mock-content.json` 추가
   - **Deploy**
3. **구성 → 일반 구성 → 편집**: 제한 시간·메모리 (표)
4. **구성 → 환경 변수** (3단계 표)

GitHub 에서 파일을 열고 **Raw** 를 누르면 복사하기 쉬워요.

## 3단계. 환경 변수

| 키 | 값 | 넣을 함수 |
|---|---|---|
| `TABLE_NAME` | `jojo_table` | 전부 |
| `TTL_ATTR` | `jojo_ttl` | 전부 |
| `AI_MODE` | `live` (실제 AI) · `mock`(시험용, 비용 없음) · `off` | load-content 빼고 전부 |
| `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` | 함수 URL 이 있는 5개 |
| `AI_MONTHLY_BUDGET_USD` | `10` | AI 를 부르는 함수 (submit-answer, tutor-chat, learner-analysis, generate-theory, generate-code) |
| `ADMIN_TOKEN` | 직접 정한 긴 값 (CloudShell `openssl rand -hex 24`) — **관리자 복구 코드** | admin |
| `GENERATE_CODE_FUNCTION` | `jojo_generate_code` | questions, admin, learner-analysis |
| `GENERATE_THEORY_FUNCTION` | `jojo_generate_theory` | admin |
| `LEARNER_ANALYSIS_FUNCTION` | `jojo_learner_analysis` | submit-answer |

선택: `AI_GENERATION_DAILY_LIMIT`(하루 생성 상한, 기본 30), `MODEL_ID`(기본 `us.anthropic.claude-haiku-4-5-20251001-v1:0`), `RATE_LIMIT_*`(요청 수 제한, `common.py` 1번 설정 참고).

## 4단계. 기본 문제 넣기 (load-content)

`jojo_load_content` → **테스트** 탭 → 이벤트 `{}` → **테스트** → `"ok": true, "items": 24` 가 나오면 성공.
문제·커리큘럼을 바꿔 `content.json` 이 새로 나오면 코드 탭의 `content.json` 을 바꾸고 다시 **테스트** 를 누르면 됩니다.

## 5단계. 함수 URL 공개 (화면이 부르는 5개)

함수마다 **구성 → 함수 URL → 함수 URL 생성** → 인증 유형 **NONE**, **CORS 는 설정하지 않음** (코드가 `ALLOWED_ORIGINS` 로 처리) → 저장.
학교 계정은 공개 허용이 빠질 수 있어서 CloudShell 에서 한 번 실행합니다 (이미 있으면 `ResourceConflictException` 은 괜찮음):
```bash
for FN in jojo_my_page jojo_questions jojo_submit_answer jojo_tutor_chat jojo_admin; do
  aws lambda update-function-url-config --region ap-northeast-2 --function-name $FN --auth-type NONE
  aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
  aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
done
```
확인: 브라우저에서 `<my-page 함수 URL>health` → `{"ok": true, "db": "dynamodb", "ai": "live"}`

## 6단계. 화면에 연결

GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** 에 함수 URL 5개 (**끝의 `/` 빼고**):

| 변수 | 함수 |
|---|---|
| `QUESTIONS_URL` | jojo_questions |
| `SUBMIT_ANSWER_URL` | jojo_submit_answer |
| `TUTOR_CHAT_URL` | jojo_tutor_chat |
| `MY_PAGE_URL` | jojo_my_page |
| `ADMIN_URL` | jojo_admin |

→ **Actions → Deploy web (GitHub Pages) → Run workflow**. 예전 `API_URL` 변수는 5개를 모두 넣은 뒤 지워도 됩니다.

## 7단계. 확인하고 예전 함수 정리

1. 화면에서 개념·코드 문제를 풀고, 튜터에게 질문하고, 관리자 화면(`/admin`)에 들어가 봅니다 (예전 관리자 코드 또는 `ADMIN_TOKEN`)
2. 관리자 화면에서 개념 주제 하나를 **AI 문제 만들기** → '생성 작업' 기록이 `pending` 이 되면 generate-theory 까지 동작
3. 며칠 써 보고 문제가 없으면 예전 `jojo_api` 함수를 삭제 (EC2·RDS·중계 Lambda 를 아직 켜 두었다면 함께 정리)

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 | main 에 병합 → Pages 자동 배포 |
| Lambda 코드 | GitHub 의 그 폴더 파일을 콘솔 코드 탭에 붙여넣고 **Deploy** (`common.py` 가 바뀌면 Python 함수 8개 모두) |
| 기본 문제·커리큘럼 | `content.json` 을 load-content 에 붙여넣고 **테스트** |
| 설정 (예산 등) | 그 함수의 **구성 → 환경 변수** (다음 요청부터 반영) |

콘솔에서 직접 고쳤다면 GitHub 의 같은 파일에도 반영해 주세요. 그래야 팀원과 공유되고 자동 검사(`npm run smoke`)가 확인합니다.
내 컴퓨터에서는 `npm run api` 가 9개 함수를 한 주소(`http://localhost:8787`)로 실행해요 (DynamoDB 흉내 서버 + 목업 AI).

## 요금 (대략)

- Lambda: 매달 요청 100만 건 · 40만 GB-초 무료 → 학교 규모에서는 0원에 가까움
- DynamoDB 온디맨드: 쓰기 100만 건 약 1.4달러, 읽기 100만 건 약 0.3달러 → 수십 센트 이하
- Bedrock: 쓴 토큰만큼 (월 예산 `AI_MONTHLY_BUDGET_USD` 를 넘지 않게 코드가 막음)

## 악성 사용자·요금 폭탄 막기

### 코드에 들어 있는 것 (`common.py`, 설정 없이 동작)
| 막는 것 | 방법 |
|---|---|
| AI 요금 | 월 예산을 넘으면 AI 를 부르지 않음 (이번 호출의 최대 비용까지 미리 계산) |
| 한 사람이 AI 를 많이 부름 | 학습자 1명 1시간 30번, IP 1개 1시간 300번 |
| IP 를 바꿔 가며 AI 를 부름 | 서비스 전체 1시간 400번 |
| 요청 폭주 | IP 1개 1분 600번, 새 학습자 IP 1개 1시간 120명, 요청 크기 256KB, 튜터 질문 문제당 20번 |
| IP 속이기 | 요청 헤더는 무시하고 **함수 URL 이 확인한 실제 접속 IP** 로 셈 |
| 관리자 코드 맞히기 | 10번 틀리면 15분 잠김 |
| AI 문제 생성 | 하루 30번, 같은 칸 동시 생성 금지, 자동 생성 끄기 스위치 |
| 다른 사이트에서 부르기 | `ALLOWED_ORIGINS` 의 화면 주소만 브라우저가 응답을 읽을 수 있음 |

횟수는 DynamoDB(`RL` 항목)에 세므로 Lambda 가 여러 개 떠도 한도가 늘어나지 않습니다.

### AWS 콘솔에서 해 두면 좋은 것
1. **동시 실행 제한** — 함수 URL 이 있는 함수마다 구성 → 동시성 → **예약된 동시성 5~10**. 공격이 와도 요금이 일정 이상 커지지 않습니다.
2. **AWS Budgets 알림** — Billing → Budgets → 월 예산(예: 15달러) → 80%·100% 에 이메일 알림.
3. **CloudWatch 로그 보관 기간** — 로그 그룹 `/aws/lambda/<함수 이름>` → 보존 기간 **2주**.

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `{"Message":"Forbidden"}` | 5단계 함수 URL 공개 허용 |
| `문제 데이터가 아직 준비되지 않았어요` (503) | 4단계 load-content 실행 |
| `No module named 'common'` | 그 함수에 `common.py` 파일을 새로 만들어 붙여넣기 (이름 정확히) |
| 화면에 "서버에 연결하지 못했어요" / CORS 오류 | `ALLOWED_ORIGINS`(경로 없이), GitHub 변수 끝의 `/` 제거, 6단계 다시 배포 |
| AI 대신 기본 안내만 나옴 | CloudWatch 로그의 `[ai]` 줄 (예: `bedrock: AccessDeniedException` → 역할의 Bedrock 권한, `monthly AI budget reached` → 월 예산) |
| 문제 생성·학습 분석이 시작되지 않음 | 부르는 함수의 로그에 `[invoke]` → 함수 이름 환경 변수(`GENERATE_CODE_FUNCTION` 등)와 실행 역할의 `lambda:InvokeFunction` 권한 확인 |
| 생성 작업이 `running` 에서 멈춤 | 생성 함수의 제한 시간(5분) 확인. 관리자 화면 **생성 중지** 로 정리 |
| 오랜만에 열면 느림 | 정상 (콜드 스타트 1~2초) |
