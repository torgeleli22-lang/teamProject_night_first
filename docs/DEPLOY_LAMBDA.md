# 배포하기: GitHub Pages(화면) + Lambda(API) + DynamoDB(DB) + Bedrock(AI)

EC2·RDS 없이 **서버를 켜 두지 않는** 구성입니다. 사람이 쓸 때만 실행되고, 쓴 만큼만 요금이 나옵니다.

```
브라우저 ──→ GitHub Pages (정적 화면, 무료)
   │
   └─ HTTPS ─→ Lambda 함수 URL (API: 채점·기록·추천·AI)      실행 역할 SafeRole-<계정>
                 ├──→ DynamoDB 테이블 codereading (서울)     VPC 없이 역할 권한으로 접속
                 └──→ Bedrock Claude Haiku 4.5 (us-east-1)    중계 Lambda 없이 직접 호출
```

| | EC2 + RDS (`DEPLOY_AWS.md`) | Lambda + DynamoDB (이 문서) |
|---|---|---|
| 켜 두는 서버 | EC2, RDS (시간당 요금) | 없음 (요청이 올 때만 실행) |
| 주소 | DuckDNS + Caddy(HTTPS) | Lambda 함수 URL (HTTPS 기본, 고정) |
| AI | EC2 → 중계 Lambda → Bedrock | API Lambda → Bedrock 직접 |
| 업데이트 | main 병합 → EC2 자동 배포 | main 병합 → Actions 에서 파일 받아 **콘솔에 올리기** |
| 첫 요청 | 항상 빠름 | 한동안 안 쓰면 첫 요청이 1~2초 느림 |

같은 코드가 두 방식 모두 지원합니다 (`DB_DRIVER`, `AI_PROVIDER` 설정으로 선택).

> 비밀 값(관리자 코드 등)은 Lambda 환경 변수에만 넣고, 문서·채팅·GitHub 에는 쓰지 마세요.

---

## 1단계. DynamoDB 테이블 만들기 (서울 리전)

DynamoDB → **테이블 생성**

| 항목 | 값 |
|---|---|
| 테이블 이름 | `codereading` |
| 파티션 키 | `pk` · **문자열** |
| 정렬 키 | `sk` · **문자열** |
| 테이블 설정 | **설정 사용자 지정** → 용량 모드 **온디맨드** |

→ 테이블 생성. 만들어지면 테이블 → **추가 설정** 탭 → **TTL(Time to Live) 켜기** → TTL 속성 이름 `ttl` → 켜기.

- 보조 인덱스(GSI)는 만들지 않습니다 (코드가 테이블 하나로 처리).
- TTL 은 오래된 학습 기록·요청 횟수를 DynamoDB 가 자동으로 지우게 합니다.
- 실행 역할에 테이블 만들기 권한이 있으면 앱이 처음 실행될 때 직접 만들기도 하지만, 콘솔에서 만드는 것을 권장합니다.

## 2단계. API 파일 받기 (GitHub)

저장소 → **Actions** → main 의 최신 **CI** 실행(초록 체크) → 아래쪽 **Artifacts** → **`lambda-upload`** 를 내려받습니다.
받은 `lambda-upload.zip` 안에는 `index.js`, `api/`, `lib/`, `README.md` 가 들어 있고, **이 zip 을 그대로 Lambda 에 올립니다** (풀지 마세요).
파일마다 TypeScript 를 JavaScript 로만 바꾼 읽을 수 있는 소스라서, 올린 뒤 Lambda 콘솔 코드 탭에서 폴더별로 열어 볼 수 있어요 (구성은 `README.md`).

## 3단계. Lambda 함수 만들기 (서울 리전)

Lambda → **함수 생성** → 새로 작성

| 항목 | 값 |
|---|---|
| 함수 이름 | `sgu-202688-codereading-api` (예시) |
| 런타임 | **Node.js 22.x** |
| 아키텍처 | arm64 (x86_64 도 됨) |
| 추가 설정 → 사용자 지정 실행 역할 | **`SafeRole-sgu-202688`** |

만든 뒤:
1. **코드** 탭 → **업로드 대상 → .zip 파일** → 2단계의 `lambda-upload.zip` → 저장
2. **코드** 탭 아래 **런타임 설정 → 편집** → 핸들러 `index.handler` 확인 (다르면 고치기)
3. **구성 → 일반 구성 → 편집**: 메모리 **1024 MB**, 제한 시간 **5분** → 저장
   (문제 생성은 1~2분 걸립니다. 메모리가 크면 첫 요청도 빨라집니다)
4. **구성 → 환경 변수 → 편집**:

| 키 | 값 |
|---|---|
| `DB_DRIVER` | `dynamodb` |
| `DYNAMODB_TABLE` | `codereading` (1단계에서 만든 테이블 이름) |
| `DYNAMODB_TTL_ATTR` | 1단계 TTL 속성 이름이 `ttl` 이 아닐 때만 (예: `jojo_ttl`) |
| `AI_MODE` | `live` |
| `AI_PROVIDER` | `converse` |
| `AI_MONTHLY_BUDGET_USD` | `10` |
| `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` |
| `ADMIN_TOKEN` | 새 **복구 코드** (긴 임의 문자열, 아래처럼 만들기) |

복구 코드 만들기: CloudShell 에서 `openssl rand -hex 24` → 나온 값을 `ADMIN_TOKEN` 에 넣고 따로 보관.

5. **구성 → 함수 URL → 함수 URL 생성**: 인증 유형 **NONE**, CORS 는 설정하지 않음(코드가 처리) → 저장 → 주소 메모

### 3-1. 함수 URL 공개 허용 (CloudShell)
학교 계정에서는 인증 유형이 AWS_IAM 으로 만들어지거나 허용이 빠질 수 있습니다. CloudShell 에서 함수 이름을 넣어 실행하세요 (이미 있으면 `ResourceConflictException` 이 나와도 괜찮음):
```bash
FN=sgu-202688-codereading-api
aws lambda update-function-url-config --region ap-northeast-2 --function-name $FN --auth-type NONE
aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
```

### 3-2. 확인
브라우저에서 `<함수 URL>health` → `{"ok":true,"db":"dynamodb","ai":"live"}`
그다음 `<함수 URL>concepts` → 문제 목록 JSON (처음 한 번은 기본 문제 64개를 테이블에 넣느라 몇 초 걸림)

## 4단계. 데이터 옮기기 (EC2·RDS 를 쓰던 경우)

**순서가 중요합니다** — 화면이 아직 예전 API 를 가리킬 때 먼저 내보냅니다.
0. 이 기능이 들어간 코드가 main 에 병합되고, EC2 자동 배포가 끝났는지 확인 (관리자 페이지에 **데이터 옮기기** 칸이 보이면 됨)
1. 지금 화면의 관리자 페이지 → **데이터 옮기기 → 내보내기** → JSON 파일 저장
   (AI 생성 콘텐츠, 관리자 코드, 자동 생성 설정, 이번 달 AI 사용량. 학습 기록은 옮기지 않음)
2. 5단계로 화면을 새 API 에 연결
3. 새 관리자 페이지에 **3단계의 복구 코드(`ADMIN_TOKEN`)** 로 들어가서 **데이터 옮기기 → 가져오기** → 1의 파일
   - "이번 달 AI 사용량도 더하기" 를 켜 두면 월 10달러 예산 계산이 이어집니다 (같은 파일을 두 번 가져오지 마세요)
4. 그 뒤로는 예전 관리자 코드로도 들어갈 수 있습니다

## 5단계. 화면을 새 API 에 연결

저장소 → Settings → Secrets and variables → Actions → **Variables** → `API_URL` = 함수 URL (**끝의 `/` 를 빼고**, 예: `https://abcd1234.lambda-url.ap-northeast-2.on.aws`)
→ **Actions → Deploy web (GitHub Pages) → Run workflow**

## 6단계. 예전 서버 정리 (옮긴 뒤 며칠 써 보고)

| 무엇 | 할 일 |
|---|---|
| EC2 | 중지 → 문제 없으면 종료 (DuckDNS·자동 배포 타이머도 함께 사라짐) |
| RDS | 중지(7일 뒤 자동 재시작) 또는 스냅샷 남기고 삭제 |
| 중계 Lambda (jojo-ai) | 새 API 는 Bedrock 을 직접 부르므로 필요 없음 → 삭제 가능 |
| 탄력적 IP·DuckDNS | 쓰지 않으면 정리 |

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 | main 에 병합 → Pages 자동 배포 |
| API·채점·콘텐츠 | main 에 병합 → CI 가 끝나면 Actions 에서 `lambda-upload` 받기 → Lambda **코드 → 업로드 대상 → .zip 파일** |
| 설정 (예산 등) | Lambda **구성 → 환경 변수** 수정 → 저장 (다음 요청부터 반영) |

학교 계정은 GitHub 에서 AWS 로 바로 올릴 권한(키·역할)을 만들 수 없어서, API 업데이트는 콘솔에서 파일을 올리는 방식입니다.

> **학습 구조 전환(개념 / 코드) 버전을 처음 올릴 때**: 새 API 가 처음 실행되면서 예전 문제·학습 기록·랭킹을 **한 번** 지우고 새 문제로 채웁니다 (팀 결정: 전부 지우고 새로 시작). 이번 달 AI 사용량(월 예산), 관리자 코드, 자동 생성 설정은 그대로 남습니다. 예전 버전에서 내보낸 데이터 파일을 가져오면 AI 콘텐츠는 건너뛰고 설정·사용량만 가져옵니다.

## 요금 (서울·us-east-1, 대략)

- Lambda: 매달 요청 100만 건 · 40만 GB-초 무료 → 학교 규모에서는 0원에 가까움
- DynamoDB 온디맨드: 쓰기 100만 건 약 1.4달러, 읽기 100만 건 약 0.3달러, 저장 25GB 무료 → 수십 센트 이하
- Bedrock: 쓴 토큰만큼 (월 예산 `AI_MONTHLY_BUDGET_USD` 를 넘지 않게 코드가 막음)

## 악성 사용자·요금 폭탄 막기

화면(GitHub Pages)과 함수 URL 은 누구나 열 수 있습니다. 그래서 **요금이 나가는 곳마다 코드와 AWS 설정 두 겹으로** 막아 둡니다.

### 코드에 이미 들어 있는 것 (설정 없이 동작)
| 막는 것 | 방법 |
|---|---|
| AI 요금 | 월 예산 `AI_MONTHLY_BUDGET_USD` 를 넘으면 AI 를 부르지 않음 (진행 중인 호출의 최대 비용까지 미리 계산) |
| 한 사람이 AI 를 많이 부름 | 학습자 1명 1시간 30번, IP 1개 1시간 300번 (`RATE_LIMIT_AI_*`) |
| IP 를 바꿔 가며 AI 를 부름 | 서비스 전체 1시간 400번 (`RATE_LIMIT_AI_TOTAL_HOUR`) |
| 요청 폭주 | IP 1개 1분 600번, 새 학습자 IP 1개 1시간 120명, 요청 크기 256KB |
| IP 속이기 | 요청 헤더(`x-forwarded-for`)는 무시하고 **함수 URL 이 확인한 실제 접속 IP** 로 셈 |
| 관리자 코드 맞히기 | 10번 틀리면 15분 잠김 (모든 Lambda 인스턴스가 함께 셈) |
| AI 문제 생성 | 관리자 생성 + 자동 생성 합쳐 하루 30번 (`AI_GENERATION_DAILY_LIMIT`), 같은 칸 동시 생성 금지 |
| 다른 사이트에서 부르기 | `ALLOWED_ORIGINS` 의 화면 주소만 브라우저가 응답을 읽을 수 있음 |

횟수는 DynamoDB 에 세므로 Lambda 가 여러 개 떠도 한도가 늘어나지 않습니다.

### AWS 콘솔에서 해 두면 좋은 것 (권장 순서)
1. **Lambda 동시 실행 제한** — Lambda → 함수 → 구성 → 동시성 → 편집 → **예약된 동시성 10** (학교 규모에 충분).
   동시에 실행되는 수가 10을 넘으면 AWS 가 바로 거절해서, 공격이 와도 Lambda·DynamoDB 요금이 일정 이상 커지지 않습니다.
   (계정의 동시성 여유가 적어 저장이 안 되면 5 로)
2. **AWS Budgets 알림** — Billing → Budgets → 월 예산(예: 15달러) → 80%·100% 에 이메일 알림. 예상 밖의 요금을 바로 알 수 있습니다.
3. **DynamoDB 용량 상한(선택)** — 테이블 → 추가 설정 → 읽기/쓰기 용량 → **온디맨드 최대 처리량** 에 읽기 100·쓰기 100 을 넣으면 초당 처리량이 그 이상 늘지 않습니다.
4. **CloudWatch 로그 보관 기간** — CloudWatch → 로그 그룹 `/aws/lambda/<함수 이름>` → 보존 기간 **2주** (로그 저장 요금 방지).
5. **비밀 값 관리** — `ADMIN_TOKEN`·관리자 코드는 Lambda 환경 변수에만. 새어 나간 것 같으면 값을 바꾸고 저장하면 바로 바뀝니다.

이보다 강하게 막아야 할 때(실제 서비스 규모)는 함수 URL 앞에 API Gateway + AWS WAF(IP별 요청 제한·봇 차단)를 두는 방법이 있지만, 요금이 추가되고 학교 계정 권한이 필요할 수 있어 지금 구성에는 넣지 않았습니다.

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `/health` 가 `{"Message":"Forbidden"}` | 3-1 의 함수 URL 설정 (인증 유형 NONE + 허용 2개) |
| `/concepts` 가 오류, 로그에 `AccessDeniedException` (DynamoDB) | 실행 역할이 SafeRole 인지, 테이블 이름 `DYNAMODB_TABLE` 확인 |
| 로그에 `테이블 'codereading' 이 없고 자동으로 만들지 못했어요` | 1단계 테이블 만들기 (이름·키 이름 `pk`/`sk` 확인) |
| 화면에 "서버에 연결하지 못했어요" / CORS 오류 | `ALLOWED_ORIGINS` (경로 없이), GitHub `API_URL` 끝의 `/` 제거 |
| AI 대신 기본 안내만 나옴 | Lambda 모니터링 → CloudWatch 로그의 `[ai] 호출 실패` 줄 (예: `bedrock: AccessDeniedException` → 역할의 Bedrock 권한) |
| 문제 생성이 끝나지 않음 | 제한 시간 5분 확인. 로그에 `비동기 호출 실패` → 역할에 `lambda:InvokeFunction` 이 없으면 요청 안에서 끝까지 실행됨 |
| 오랜만에 열면 느림 | 정상 (콜드 스타트 1~2초). 메모리를 1024MB 이상으로 |
