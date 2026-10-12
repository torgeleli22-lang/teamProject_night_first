# 배포하기: GitHub Pages(화면) + AWS Lambda(API) + RDS PostgreSQL(DB)

학교 계정(권한 제한)에 맞춘 구성입니다.

```
브라우저 ──→ GitHub Pages                정적 화면 (HTML/JS) — 무료
   │
   └─fetch─→ Lambda 함수 URL             API: 채점·기록·추천·AI (src/api)
               │  (Default VPC 안, 보안 그룹 default)
               └─ PostgreSQL 직접 연결 ─→ RDS PostgreSQL (database-jojo / DB jojobase)
                                          퍼블릭 액세스 없음, 보안 그룹 default
```

- **DB 는 인터넷에서 보이지 않습니다.** Lambda 와 RDS 가 같은 `default` 보안 그룹에 있어서, 보안 그룹 규칙을 따로 추가하지 않아도 둘만 통신할 수 있습니다 (default 그룹은 "같은 그룹끼리 모두 허용"이 기본 규칙).
- 정답·해설·채점 기준은 Lambda 안에서만 다룹니다. 화면에는 문제만 내려갑니다.

### 학교 계정에서 막혀 있던 것 (그래서 이렇게 구성함)
| 시도 | 결과 |
|---|---|
| Aurora 클러스터 생성 | ❌ `Shingu-AdditionalRule-AuroraCluster` 정책으로 거부 → Aurora Data API 사용 불가 |
| 보안 그룹 인바운드 규칙 추가 | ❌ `ec2:AuthorizeSecurityGroupIngress` 거부 → 새 보안 그룹 대신 `default` 사용 |
| RDS PostgreSQL + default 보안 그룹 | ✅ |

> AWS 콘솔 메뉴 이름은 조금씩 바뀔 수 있어요. 막힌 단계가 있으면 그 화면의 메시지를 그대로 공유해 주세요.

---

## 1단계. RDS PostgreSQL (완료)

| 항목 | 값 |
|---|---|
| 엔진 | PostgreSQL 18 (일반 RDS, Aurora 아님) |
| 식별자 / 마스터 사용자 | `database-jojo` / `jojo` (암호는 따로 보관 — 문서·채팅·GitHub 에 쓰지 않기) |
| 인스턴스 / 스토리지 | db.t4g.micro / 20GiB |
| VPC / 퍼블릭 액세스 | Default VPC / **아니요** |
| 보안 그룹 | **default** |
| 초기 데이터베이스 이름 | `jojobase` |

**엔드포인트 확인**: RDS → `database-jojo` → **연결 및 보안** 탭 → 엔드포인트 (예: `database-jojo.xxxx.ap-northeast-2.rds.amazonaws.com`)

> 일반 RDS 는 켜져 있는 동안 계속 과금됩니다. 오래 안 쓰면 RDS → 작업 → **일시적으로 중지** (7일 뒤 자동으로 다시 켜짐).

---

## 2단계. Lambda 에 올릴 파일 (`lambda.zip`) 받기

- **GitHub Actions**: 저장소 → Actions → 최근 **CI** 실행(초록색) → 아래 **Artifacts** 의 `lambda-zip` 다운로드 → 한 번 압축을 풀면 `lambda.zip` (이 파일은 풀지 않고 그대로 업로드)
- 또는 내 컴퓨터에서 `npm install` → `npm run build:lambda` → `dist/lambda.zip`

---

## 3단계. Lambda 함수 만들기

Lambda → **함수 생성** → 새로 작성

| 항목 | 값 |
|---|---|
| 함수 이름 | `codereading-api` |
| 런타임 | **Node.js 22.x** |
| 아키텍처 | arm64 (x86_64 도 됨) |
| 실행 역할 | **기존 역할 사용** → 학교에서 제공하는 역할 (예: `LabRole`) |

함수가 만들어지면:
1. **코드** 탭 → 업로드 대상 → **.zip 파일** → `lambda.zip`
2. 코드 탭 아래 **런타임 설정** → 편집 → 핸들러 **`index.handler`**
3. **구성 → 일반 구성** → 편집 → 메모리 **1024 MB**, 제한 시간 **1분**

---

## 4단계. Lambda 를 DB 와 같은 VPC 에 연결

**구성 → VPC** → 편집

| 항목 | 값 |
|---|---|
| VPC | **Default VPC** (RDS 와 같은 것) |
| 서브넷 | 목록의 서브넷을 **2개 이상** 선택 (모두 선택해도 됨) |
| 보안 그룹 | **default** |

저장 후 1~2분 걸립니다 (Lambda 가 VPC 안에 네트워크 카드를 만듦).

> 권한 오류가 나면 (예: `ec2:CreateNetworkInterface`) 메시지를 그대로 공유해 주세요. 실행 역할 또는 학교 정책 문제입니다.

---

## 5단계. 환경 변수

**구성 → 환경 변수** → 편집

| 키 | 값 |
|---|---|
| `DB_DRIVER` | `postgres` |
| `DATABASE_URL` | `postgres://jojo:<암호>@<엔드포인트>:5432/jojobase` |
| `AI_MODE` | `mock` |
| `ADMIN_TOKEN` | 긴 무작위 문자열 (관리자 화면 비밀번호) |
| `BACKGROUND_MODE` | `inline` (VPC 안에서는 인터넷이 없어 '응답 뒤 비동기 호출'을 쓰지 않음) |
| `ALLOWED_ORIGINS` | 7단계 후에 `https://torgeleli22-lang.github.io` |

- `<암호>` 에 `@ : / ? # %` 가 있으면 접속 주소가 깨집니다. 그런 문자가 없는 암호를 쓰세요.
- 환경 변수는 AWS 안에 암호화되어 저장됩니다. 이 값을 GitHub 나 채팅에 올리지 마세요.

---

## 6단계. 함수 URL 만들기 + 확인

**구성 → 함수 URL** → 함수 URL 생성
- 인증 유형: **NONE**
- **CORS 는 체크하지 않음** (코드가 처리합니다. 둘 다 켜면 헤더가 겹쳐 오류)

생긴 주소 뒤에 `health` 를 붙여 브라우저로 엽니다:

```
https://xxxx.lambda-url.ap-northeast-2.on.aws/health
→ {"ok":true,"db":"postgres","ai":"mock"}
```

이어서 `/concepts` 를 열어 문제 목록 JSON 이 나오면 **DB 연결까지 성공**입니다.
처음 한 번은 테이블과 시드 문제 90개를 만드느라 몇 초 더 걸립니다.

---

## 7단계. GitHub Pages 로 화면 배포

1. 저장소 → **Settings → Pages** → Source: **GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables** → New repository variable → `API_URL` = 함수 URL
3. 작업 브랜치를 **main 에 병합** (이미 병합했다면 Actions → `Deploy web (GitHub Pages)` → **Run workflow**)
4. 화면: **https://torgeleli22-lang.github.io/teamProject_night_first/**
5. Lambda 환경 변수 `ALLOWED_ORIGINS` = `https://torgeleli22-lang.github.io` (경로 없이)

> `API_URL` 없이 배포하면 화면만 보이는 미리보기가 됩니다 ("아직 서버(API)가 연결되지 않았어요").

---

## 8단계. 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 (src/app, src/components) | main 에 push → Pages 자동 배포 |
| API·채점·콘텐츠 (src/api, src/lib) | CI 의 `lambda-zip` 다운로드 → Lambda → 코드 → .zip 업로드 |
| 설정 (AI 모드 등) | Lambda → 구성 → 환경 변수 |

---

## 나중에: 실제 AI 연결 (아직 하지 않음)

- 이 계정에서 쓸 수 있는 Bedrock 모델은 **미국 동부(버지니아 북부, us-east-1)** 의 Claude Haiku 4.5, Amazon Nova Micro / Lite 등입니다. 코드가 Claude 용 구조화 출력을 쓰므로 **Claude Haiku 4.5** 가 맞습니다.
- 문제: Lambda 가 VPC 안에 있으면 **인터넷(=다른 리전의 Bedrock)으로 나갈 수 없습니다.** NAT 게이트웨이(월 수십 달러, 학교 정책상 막혀 있을 수도 있음) 등 별도 구성이 필요해서, AI 를 붙일 때 다시 정합니다.
- 그때까지는 `AI_MODE=mock` (흉내 낸 AI 응답) 으로 운영합니다.

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 화면에 "아직 서버(API)가 연결되지 않았어요" | `API_URL` 없이 배포됨 → 7단계 2·3번 |
| 화면에 "서버에 연결하지 못했어요" | `API_URL` 값, 함수 URL 인증 유형(NONE) 확인 |
| 브라우저 콘솔에 CORS 오류 | 함수 URL 의 CORS 를 끄기. `ALLOWED_ORIGINS` 가 `https://torgeleli22-lang.github.io` 인지 확인 |
| `/health` 는 되는데 `/concepts` 가 오래 걸리다 500 | Lambda 와 RDS 의 VPC·보안 그룹(`default`)이 같은지, `DATABASE_URL` 의 엔드포인트·DB 이름(`jojobase`)·암호 확인. CloudWatch 로그의 `[api]` 줄 확인 |
| `password authentication failed` | `DATABASE_URL` 의 사용자 이름(`jojo`) 또는 암호가 다름 |
| `Task timed out` | 일반 구성의 제한 시간을 1분으로. 그래도 나면 4단계 VPC 연결 확인 |
| `/admin` 이 401 | Lambda 환경 변수 `ADMIN_TOKEN` 값을 관리자 화면에 입력 |

---

## 참고: Aurora 를 쓸 수 있는 계정이라면

개인 계정처럼 Aurora 가 허용되면 VPC 없이 **Aurora Data API** 로 연결할 수 있습니다 (`DB_DRIVER=data-api`, `DB_CLUSTER_ARN`, `DB_SECRET_ARN`, `DB_NAME`). 이 경우 Lambda 가 VPC 밖이라 실제 AI 연결도 바로 됩니다. 코드는 두 방식을 모두 지원합니다 (`src/lib/server/db/`).
