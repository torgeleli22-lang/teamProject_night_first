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
받은 `lambda-upload.zip` 안에 `index.js` 하나가 들어 있고, **이 zip 을 그대로 Lambda 에 올립니다** (풀지 마세요).

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

## 요금 (서울·us-east-1, 대략)

- Lambda: 매달 요청 100만 건 · 40만 GB-초 무료 → 학교 규모에서는 0원에 가까움
- DynamoDB 온디맨드: 쓰기 100만 건 약 1.4달러, 읽기 100만 건 약 0.3달러, 저장 25GB 무료 → 수십 센트 이하
- Bedrock: 쓴 토큰만큼 (월 예산 `AI_MONTHLY_BUDGET_USD` 를 넘지 않게 코드가 막음)

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
