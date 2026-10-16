# 배포하기: GitHub Pages(화면) + Lambda 2개 + DynamoDB + Bedrock

서버를 켜 두지 않는 구성입니다. 사람이 쓸 때만 Lambda 가 실행되고, 쓴 만큼만 요금이 나옵니다.
Lambda 코드는 **콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스**예요 (zip·빌드 없음). 왜 2개인지: [`lambda/README.md`](../lambda/README.md)

```
브라우저 ──→ GitHub Pages (정적 화면)
   │  JSON (x-session-id 헤더) — 주소는 하나
   └─→ jojo_api 함수 URL (Python) ──→ DynamoDB jojo_table (서울)
          │                          └→ Bedrock Claude Haiku 4.5 (us-east-1)
          ├─ 뒤에서: 학습자 분석·개념 문제 생성 (자기 자신을 다시 부름)
          └─→ jojo_generate_code (Node.js): 코드 문제 생성 + 실행 검증
```

> 비밀 값(관리자 복구 코드 `ADMIN_TOKEN`)은 Lambda 환경 변수에만 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.

---

## 1단계. DynamoDB 테이블 (이미 있으면 건너뛰기)

지금 쓰는 테이블 **`jojo_table`** (파티션 키 `pk` 문자열, 정렬 키 `sk` 문자열, TTL 속성 `jojo_ttl`)을 그대로 씁니다.
새로 만든다면: DynamoDB → 테이블 생성 → 위의 이름·키 → 용량 **온디맨드** → 만든 뒤 **추가 설정 → TTL 켜기** → 속성 이름 `jojo_ttl`.

예전 API(Node.js `jojo_api`)와 **같은 테이블·같은 항목 모양**이라서 학습 기록·관리자 코드·AI 콘텐츠·이번 달 AI 사용량이 그대로 이어집니다.

## 2단계. `jojo_api` (Python) — 화면의 모든 요청

예전 Node.js `jojo_api` 는 런타임을 바꿀 수 없어서, **새 함수**를 만듭니다 (이름 예: `jojo_api_py`. 예전 함수를 지운 뒤라면 `jojo_api`).

1. Lambda → **함수 생성 → 새로 작성**
   - 런타임 **Python 3.13**, 아키텍처 **arm64**
   - 기본 실행 역할 변경 → 기존 역할 사용 → **`SafeRole-sgu-202688`**
2. **코드 탭**: `lambda_function.py` 를 [`lambda/api/lambda_function.py`](../lambda/api/lambda_function.py) 로 바꾸고,
   **파일 → 새 파일**로 `lambda/api/` 의 나머지 파일을 이름 그대로 만들어 붙여넣기
   (`common.py`, `questions.py`, `submit_answer.py`, `tutor_chat.py`, `my_page.py`, `admin.py`, `learner_analysis.py`, `generate_theory.py`, `load_content.py`, `content.json`) → **Deploy**
   GitHub 에서 파일을 열고 **Raw** 를 누르면 복사하기 쉬워요.
3. **구성 → 일반 구성 → 편집**: 메모리 **1024MB**, 제한 시간 **5분**
   (메모리가 크면 CPU 도 빨라져서 응답이 빨라져요. 화면 요청은 1초 안팎이라 무료 사용량 안에서 0원에 가까워요. 5분은 개념 문제 생성용)
4. **구성 → 환경 변수**

   | 키 | 값 |
   |---|---|
   | `TABLE_NAME` | `jojo_table` |
   | `TTL_ATTR` | `jojo_ttl` |
   | `AI_MODE` | `live` (실제 AI) · `mock`(시험용, 비용 없음) · `off` |
   | `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` |
   | `AI_MONTHLY_BUDGET_USD` | `10` |
   | `ADMIN_TOKEN` | 직접 정한 긴 값 (CloudShell `openssl rand -hex 24`) — **관리자 복구 코드** |
   | `GENERATE_CODE_FUNCTION` | `jojo_generate_code` (3단계 함수 이름) |

   선택: `AI_GENERATION_DAILY_LIMIT`(하루 생성 상한, 기본 30), `MODEL_ID`, `RATE_LIMIT_*`(요청 수 제한, `common.py` 1번 설정 참고)
5. **기본 문제 넣기**: **테스트** 탭 → 이벤트 `{"task": "load-content"}` → **테스트** → `"ok": true, "items": 24`
   (`content.json` 이 바뀌면 파일을 바꾸고 다시 이 테스트)
6. **구성 → 함수 URL → 함수 URL 생성** → 인증 유형 **NONE**, **CORS 는 설정하지 않음**(코드가 `ALLOWED_ORIGINS` 로 처리) → 저장.
   학교 계정은 공개 허용이 빠질 수 있어서 CloudShell 에서 한 번 실행 (이미 있으면 `ResourceConflictException` 은 괜찮음):
   ```bash
   FN=jojo_api_py
   aws lambda update-function-url-config --region ap-northeast-2 --function-name $FN --auth-type NONE
   aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
   aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
   ```
   확인: 브라우저에서 `<함수 URL>health` → `{"ok": true, "db": "dynamodb", "ai": "live"}`

다른 시험 이벤트(문제 세트, 답 제출, 튜터 질문, 관리자 현황): [`lambda/api/test_events.json`](../lambda/api/test_events.json)

## 3단계. `jojo_generate_code` (Node.js) — 코드 문제 생성

1. **함수 생성**: 이름 `jojo_generate_code`, 런타임 **Node.js 22.x**, arm64, 역할 `SafeRole-sgu-202688`
2. **코드 탭**: `index.mjs` 를 [`lambda/generate-code/index.mjs`](../lambda/generate-code/index.mjs) 로 바꾸고, 새 파일 `checks.mjs`, `mock-content.json` 추가 → **Deploy**
3. 메모리 **1024MB**, 제한 시간 **5분**
4. 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `AI_MODE`, `AI_MONTHLY_BUDGET_USD` (2단계와 같은 값)
5. 함수 URL 은 만들지 않아요 (jojo_api 만 불러요)

## 4단계. 화면에 연결

GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → `API_URL` = 2단계 함수 URL (**끝의 `/` 빼고**)
→ **Actions → Deploy web (GitHub Pages) → Run workflow**

## 5단계. 확인하고 예전 함수 정리

1. 화면에서 개념·코드 문제를 풀고, 튜터에게 질문하고, 관리자 화면(`/admin`)에 들어가 봅니다 (예전 관리자 코드 또는 `ADMIN_TOKEN`)
2. 관리자 화면에서 **AI 문제 만들기** — 개념 주제는 '승인 대기', 코드 주제는 '공개/반려'가 생성 작업 기록에 나오면 끝까지 동작한 거예요
3. 며칠 써 보고 문제가 없으면 예전 Node.js `jojo_api` 함수를 삭제 (EC2·RDS·중계 Lambda 가 남아 있다면 함께 정리)

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 | main 에 병합 → Pages 자동 배포 |
| Lambda 코드 | GitHub 에서 바뀐 파일만 콘솔 코드 탭에 붙여넣고 **Deploy** |
| 기본 문제·커리큘럼 | `content.json` 을 바꾸고 **테스트** `{"task": "load-content"}` |
| 설정 (예산 등) | **구성 → 환경 변수** (다음 요청부터 반영) |

콘솔에서 직접 고쳤다면 GitHub 의 같은 파일에도 반영해 주세요. 그래야 팀원과 공유되고 자동 검사(`npm run smoke`)가 확인합니다.
내 컴퓨터에서는 `npm run api` 가 같은 코드를 `http://localhost:8787` 로 실행해요 (DynamoDB 흉내 서버 + 목업 AI).

## 요금 (대략)

- Lambda: 매달 요청 100만 건 · 40만 GB-초 무료 → 1024MB × 평균 0.2초면 한 달 약 200만 요청까지 무료. arm64 는 x86 보다 20% 쌈
- DynamoDB 온디맨드: 쓰기 100만 건 약 1.4달러, 읽기 100만 건 약 0.3달러 → 수십 센트 이하
- Bedrock: 쓴 토큰만큼 (월 예산 `AI_MONTHLY_BUDGET_USD` 를 넘지 않게 코드가 막음)
- 함수 URL: 무료 (API Gateway 를 쓰지 않음)

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

### AWS 콘솔에서 해 두면 좋은 것
1. **동시 실행 제한** — jojo_api → 구성 → 동시성 → **예약된 동시성 20**. 공격이 와도 요금이 일정 이상 커지지 않습니다.
2. **AWS Budgets 알림** — Billing → Budgets → 월 예산(예: 15달러) → 80%·100% 에 이메일 알림.
3. **CloudWatch 로그 보관 기간** — 로그 그룹 `/aws/lambda/<함수 이름>` → 보존 기간 **2주**.

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `{"Message":"Forbidden"}` | 2단계 6번 함수 URL 공개 허용 |
| `No module named 'common'` (또는 다른 파일 이름) | 그 파일을 코드 탭에 새 파일로 만들었는지, 이름이 정확한지 |
| 화면에 "서버에 연결하지 못했어요" / CORS 오류 | `ALLOWED_ORIGINS`(경로 없이), GitHub `API_URL` 끝의 `/` 제거, 4단계 다시 배포 |
| AI 대신 기본 안내만 나옴 | CloudWatch 로그의 `[ai]` 줄 (예: `bedrock: AccessDeniedException` → 역할의 Bedrock 권한, `monthly AI budget reached` → 월 예산) |
| 학습자 분석·문제 생성이 시작되지 않음 | 로그의 `[invoke]` 줄 → 실행 역할의 `lambda:InvokeFunction` 권한, `GENERATE_CODE_FUNCTION` 이름 |
| 생성 작업이 `running` 에서 멈춤 | 제한 시간(5분) 확인. 관리자 화면 **생성 중지** 로 정리 |
| 오랜만에 열면 첫 화면이 느림 | 정상 (콜드 스타트 약 1초). 한 함수가 모든 요청을 받아서 자주 쓰면 거의 생기지 않아요 |
