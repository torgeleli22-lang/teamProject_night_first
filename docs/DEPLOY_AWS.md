# 배포하기: GitHub Pages(화면) + AWS Lambda(API) + Aurora PostgreSQL(DB)

```
브라우저 ──→ GitHub Pages             정적 화면 (HTML/JS) — 무료
   │
   └─fetch─→ Lambda 함수 URL          API: 채점·기록·추천·AI (src/api)
                └─ Data API(HTTPS) ─→ Aurora PostgreSQL (jobase)
```

- 서버를 계속 켜 두지 않습니다. 요청이 올 때만 Lambda 가 실행됩니다.
- Lambda 는 VPC 에 넣지 않고 **Aurora Data API**(HTTPS)로 DB 에 접근합니다. 그래서 DB 연결 수 걱정이 없고, 나중에 AI API 를 부를 인터넷 연결도 그대로 쓸 수 있습니다.
- 정답·해설·채점 기준은 Lambda 안에서만 다룹니다. 화면에는 문제만 내려갑니다.

> AWS 콘솔 메뉴 이름은 조금씩 바뀔 수 있어요. 비슷한 이름을 찾으면 됩니다. 학교 계정에서 막힌 단계가 있으면 그 화면의 메시지를 그대로 공유해 주세요.

---

## 0단계. 정리: 쓰지 않는 EC2 끄기

EC2 방식에서 바꿨으므로 EC2 는 필요 없습니다 (크레딧 절약).

1. EC2 → 인스턴스 → `codereading-server` → 인스턴스 상태 → **종료(삭제)**
2. 탄력적 IP 를 만들었다면 → **릴리스**
3. Aurora 를 만들 때 "EC2 연결"로 생긴 보안 그룹은 그대로 둬도 괜찮습니다 (Data API 는 보안 그룹을 거치지 않음)

---

## 1단계. Aurora: Data API 켜기 + 암호를 Secrets Manager 에 저장

### 1-1. Data API 켜기
1. RDS → 데이터베이스 → `codereading-db` (**클러스터**) 선택 → **수정**
2. 연결 항목에서 **RDS Data API** 체크 → 계속 → **즉시 적용** → 클러스터 수정
3. 클러스터 → **구성** 탭의 **ARN** 을 복사해 둡니다 → `DB_CLUSTER_ARN`
   (예: `arn:aws:rds:ap-northeast-2:123456789012:cluster:codereading-db`)

### 1-2. DB 암호를 Secrets Manager 에 저장
Data API 는 암호를 Secrets Manager 에서 읽습니다.

1. Secrets Manager → **새 보안 암호 저장**
2. 유형: **Amazon RDS 데이터베이스에 대한 자격 증명**
3. 사용자 이름 `codereading`, 암호: Aurora 를 만들 때 정한 마스터 암호
4. 데이터베이스: `codereading-db` 선택 → 다음
5. 이름: `codereading-db-credentials` → (교체는 끈 채로) 저장
6. 만든 비밀을 열어 **보안 암호 ARN** 복사 → `DB_SECRET_ARN`

> 비용: 비밀 1개 월 약 $0.40. Aurora 를 만들 때 자격 증명을 "Secrets Manager 에서 관리"로 했다면 이미 비밀이 있으니 그 ARN 을 쓰면 됩니다.

---

## 2단계. Lambda 함수 만들기

### 2-1. 배포 파일 준비 (`lambda.zip`)
둘 중 하나:
- **GitHub Actions**: 저장소 → Actions → 최근 **CI** 실행 → 아래 **Artifacts** 의 `lambda-zip` 다운로드 → 압축을 한 번 풀면 `lambda.zip` 이 나옵니다
- **내 컴퓨터**: `npm install` 후 `npm run build:lambda` → `dist/lambda.zip`

### 2-2. 함수 생성
Lambda → **함수 생성** → 새로 작성

| 항목 | 값 |
| --- | --- |
| 함수 이름 | `codereading-api` |
| 런타임 | **Node.js 22.x** |
| 아키텍처 | arm64 (또는 x86_64, 둘 다 동작) |
| 실행 역할 | 학교 계정: **기존 역할 사용** → `LabRole` 등 제공된 역할 / 개인 계정: 새 역할 생성 후 아래 권한 추가 |

함수가 만들어지면:
1. **코드** 탭 → 업로드 대상 → **.zip 파일** → `lambda.zip` 업로드
2. **런타임 설정** → 편집 → 핸들러: `index.handler`
3. **구성 → 일반 구성** → 편집 → 메모리 **1024 MB**, 제한 시간 **5분** (AI 생성·관리자 작업용)
4. **구성 → 환경 변수** → 편집:

| 키 | 값 |
| --- | --- |
| `DB_DRIVER` | `data-api` |
| `DB_CLUSTER_ARN` | 1-1 에서 복사한 클러스터 ARN |
| `DB_SECRET_ARN` | 1-2 에서 복사한 비밀 ARN |
| `DB_NAME` | `jobase` |
| `AI_MODE` | `mock` (실제 AI 연결 전까지) |
| `ADMIN_TOKEN` | 긴 무작위 문자열 (관리자 화면 비밀번호) |
| `ALLOWED_ORIGINS` | 3단계 후에 `https://torgeleli22-lang.github.io` (처음엔 비워 둬도 됨) |

5. **구성 → 함수 URL** → 함수 URL 생성 → 인증 유형 **NONE** → **CORS 는 체크하지 않음** (CORS 는 코드가 처리합니다. 둘 다 켜면 헤더가 겹쳐서 오류가 납니다) → 저장
6. 생긴 **함수 URL** 을 복사합니다 (예: `https://abcd1234.lambda-url.ap-northeast-2.on.aws/`)

### 2-3. 실행 역할 권한 (개인 계정이거나 권한 오류가 날 때)
IAM → 역할 → (Lambda 실행 역할) → 권한 추가 → 인라인 정책(JSON):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["rds-data:ExecuteStatement", "rds-data:BeginTransaction", "rds-data:CommitTransaction", "rds-data:RollbackTransaction"], "Resource": "<DB_CLUSTER_ARN>" },
    { "Effect": "Allow", "Action": "secretsmanager:GetSecretValue", "Resource": "<DB_SECRET_ARN>" },
    { "Effect": "Allow", "Action": "lambda:InvokeFunction", "Resource": "arn:aws:lambda:ap-northeast-2:<계정>:function:codereading-api" }
  ]
}
```
- `lambda:InvokeFunction` 은 AI 생성·학습자 분석을 **응답 뒤에** 실행하기 위한 권한입니다. 없어도 동작하지만 해당 요청이 조금 느려집니다.

### 2-4. 확인
브라우저에서 `<함수 URL>/health` 를 엽니다.

```json
{"ok":true,"db":"data-api","ai":"mock"}
```
- 처음 한 번은 Aurora 가 깨어나고 테이블·시드 문제를 만드느라 **20~40초** 걸릴 수 있어요. 그다음부터는 빠릅니다.
- `<함수 URL>/concepts` 를 열었을 때 문제 목록 JSON 이 나오면 DB 연결까지 성공입니다.

---

## 3단계. GitHub Pages 로 화면 배포

1. 저장소 → **Settings → Pages** → Build and deployment → Source: **GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables** 탭 → New repository variable
   - 이름 `API_URL`, 값: 함수 URL (끝의 `/` 는 빼도 되고 있어도 됩니다)
3. 작업 브랜치를 **main 에 병합**하면 `Deploy web (GitHub Pages)` 워크플로가 자동으로 실행됩니다 (Actions 탭에서 확인).
   - Pages 배포는 기본 설정상 main 에서만 허용됩니다.
4. 완료되면 화면 주소: **https://torgeleli22-lang.github.io/teamProject_night_first/**
5. Lambda 환경 변수 `ALLOWED_ORIGINS` 에 `https://torgeleli22-lang.github.io` 를 넣어 다른 사이트에서 API 를 못 쓰게 막습니다.

---

## 4단계. 업데이트하는 방법

| 바뀐 것 | 할 일 |
| --- | --- |
| 화면 (src/app, src/components) | main 에 push → Pages 자동 배포 |
| API·채점·콘텐츠 (src/api, src/lib) | CI 의 `lambda-zip` 다운로드 → Lambda → 코드 → .zip 업로드 |
| 환경 변수 (AI 모드 등) | Lambda → 구성 → 환경 변수 (코드 재배포 필요 없음) |

> 학교 계정은 임시 자격 증명이라 GitHub Actions 에서 Lambda 로 자동 배포하기 어렵습니다. 개인 계정으로 옮기면 Actions 에서 바로 업데이트하도록 바꿀 수 있습니다.

---

## 로컬에서 PostgreSQL 로 확인하고 싶을 때 (선택)

```bash
# .env
DB_DRIVER=postgres
DATABASE_URL=postgres://postgres@localhost:5432/jobase
npm run smoke   # API 전체 흐름 점검
```

---

## 문제 해결

| 증상 | 원인 / 해결 |
| --- | --- |
| 화면에 "아직 서버(API)가 연결되지 않았어요" | 저장소 변수 `API_URL` 없이 배포된 미리보기예요. 3단계 2번 후 Pages 워크플로 다시 실행 |
| 화면에 "서버에 연결하지 못했어요" | 저장소 변수 `API_URL` 이 맞는지, 함수 URL 인증 유형이 NONE 인지 확인. 변수를 바꿨다면 Pages 워크플로를 다시 실행 |
| 브라우저 콘솔에 CORS 오류 | 함수 URL 의 CORS 설정을 **끄기** (코드가 처리). `ALLOWED_ORIGINS` 에 화면 주소(`https://아이디.github.io`, 경로 없이)가 정확한지 확인 |
| `/health` 가 500 | Lambda → 모니터링 → CloudWatch 로그에서 `[api]` 줄 확인. `BadRequestException ... Data API` → 1-1 의 Data API 가 꺼져 있음 |
| `AccessDeniedException` | 실행 역할에 2-3 의 권한이 없음. 학교 계정이면 제공된 역할(LabRole)을 골랐는지 확인 |
| `Task timed out after 3.00 seconds` | 2-2 의 제한 시간을 5분으로 |
| 첫 화면이 10~20초 걸림 | Aurora 최소 용량 0 ACU 에서 깨어나는 중. 화면에 "서버를 깨우는 중" 안내가 나와요. 발표 때는 최소 용량을 0.5 로 |
| `/admin` 이 401 | Lambda 환경 변수 `ADMIN_TOKEN` 값을 관리자 화면에 입력 |

---

## 비용 (대략, 서울 리전 기준 추정)

| 항목 | 비용 |
| --- | --- |
| GitHub Pages | 무료 |
| Lambda | 월 100만 요청까지 무료 범위 안 (학습 서비스 규모에서는 거의 0) |
| Aurora Serverless v2 | 쉬는 동안(0 ACU)은 저장 공간 비용만. 사용 중에는 ACU 사용 시간만큼 |
| Secrets Manager | 비밀 1개 월 약 $0.40 |
| Data API | 요청 100만 건당 약 $0.35 |
