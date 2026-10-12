# 배포하기: GitHub Pages(화면) + EC2(API) + RDS PostgreSQL(DB) + Bedrock(AI)

학교 계정(권한 제한)에 맞춘 구성입니다.

```
브라우저 ──→ GitHub Pages                         정적 화면 (HTML/JS) — 무료
   │
   └─ HTTPS ─→ EC2 (Docker)                       API: 채점·기록·추천·AI (src/api/server.ts)
                ├─ caddy : HTTPS 인증서 자동 발급 (sslip.io 무료 주소)
                └─ api   : Node.js API 서버
                     │ 보안 그룹 default (RDS 와 같은 그룹 → 규칙 추가 없이 통신)
                     └──→ RDS PostgreSQL (database-jojo / DB jojobase, 퍼블릭 액세스 없음)
```

- **DB 는 인터넷에서 보이지 않습니다.** EC2 와 RDS 가 같은 `default` 보안 그룹에 있어서 둘만 통신할 수 있습니다.
- 정답·해설·채점 기준은 API(EC2) 안에서만 다룹니다. 화면에는 문제만 내려갑니다.
- 실제 AI 는 EC2 에서 **Bedrock(us-east-1, Claude Haiku 4.5)** 을 부릅니다 (8단계).

### 학교 계정에서 막혀 있던 것 (그래서 이렇게 구성함)
| 시도 | 결과 |
|---|---|
| Aurora 클러스터 생성 | ❌ `Shingu-AdditionalRule-AuroraCluster` 정책으로 거부 |
| RDS 생성 화면에서 보안 그룹 새로 만들기 (인바운드 규칙 자동 추가) | ❌ `ec2:AuthorizeSecurityGroupIngress` 거부 → `default` 보안 그룹 사용 |
| Lambda 실행 역할 만들기 / 기존 역할로 VPC 연결 | ❌ `iam:CreateRole` 거부, 기존 역할에 `ec2:CreateNetworkInterface` 없음 → **Lambda 대신 EC2** |

> AWS 콘솔 메뉴 이름은 조금씩 바뀔 수 있어요. 막힌 단계가 있으면 그 화면의 메시지를 그대로 공유해 주세요.

---

## 1단계. RDS PostgreSQL (완료)

| 항목 | 값 |
|---|---|
| 식별자 / 마스터 사용자 | `database-jojo` / `jojo` (암호는 따로 보관 — 문서·채팅·GitHub 에 쓰지 않기) |
| VPC / 퍼블릭 액세스 / 보안 그룹 | Default VPC / **아니요** / **default** |
| 초기 데이터베이스 이름 | `jojobase` |

**엔드포인트**: RDS → `database-jojo` → **연결 및 보안** 탭 → 엔드포인트 (예: `database-jojo.xxxx.ap-northeast-2.rds.amazonaws.com`)

---

## 2단계. EC2 만들기

EC2 → **인스턴스 시작**

| 항목 | 값 |
|---|---|
| 이름 | `codereading-api` |
| AMI | **Amazon Linux 2023**, 64비트(Arm) |
| 인스턴스 유형 | **t4g.small** (막히면 t3.small + 64비트(x86)) |
| 키 페어 | 전에 쓰던 키(.ppk) 또는 새로 만들기 |
| 네트워크 설정 → 편집 | VPC: **Default VPC** (RDS 와 같은 것), 퍼블릭 IP 자동 할당: **활성화** |
| 방화벽(보안 그룹) | ⭐ **기존 보안 그룹 선택** → 80·443(전체)과 22(내 IP)가 열린 그룹 **과 `default` 를 함께** 선택 |
| 스토리지 | 20 GiB |

→ 인스턴스 시작

> 학교 계정에서는 **만든 뒤에 보안 그룹을 바꾸는 것(보안 그룹 변경)이 막혀 있어요.** 반드시 **인스턴스를 만들 때** 두 그룹을 함께 고르세요. 빠뜨렸다면 인스턴스를 새로 만들어야 해요.
> 80·443 이 열린 그룹이 아직 없다면 "보안 그룹 생성"으로 먼저 만들고(SSH 내 IP, HTTP·HTTPS 0.0.0.0/0), 인스턴스를 다시 시작할 때 그 그룹과 `default` 를 함께 고르세요.

### 2-1. 확인: 보안 그룹 2개 + DB 포트 연결
- 인스턴스 **보안** 탭에 보안 그룹이 2개(웹용 그룹 + `default`) 보이면 정상
- 접속 후 (3단계 다음) DB 포트 확인:
  ```bash
  timeout 5 bash -c "</dev/tcp/<RDS 엔드포인트>/5432" && echo "5432 연결 OK" || echo "5432 연결 안 됨"
  ```

### 2-2. (권장) 탄력적 IP
EC2 → 탄력적 IP → 할당 → 인스턴스에 연결. 공인 IP 가 고정되어 API 주소가 바뀌지 않습니다. 막히면 건너뛰어도 되지만, 인스턴스를 껐다 켜면 주소가 바뀔 수 있습니다 (→ 7단계 다시).

### 2-3. 내 API 주소 정하기 (sslip.io)
공인 IP 의 점(.)을 대시(-)로 바꾸고 뒤에 `.sslip.io` 를 붙이면 무료 도메인이 됩니다. 이 주소로 HTTPS 인증서를 자동으로 받습니다.
```
공인 IP 43.201.12.34  →  43-201-12-34.sslip.io
```

---

## 3단계. 접속 + Docker 설치 (한 번만)

PuTTY 로 `ec2-user@<공인 IP>` 접속 (키 .ppk) 후:

```bash
sudo dnf update -y && sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
# 메모리 여유 (빌드 중 멈춤 방지)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

---

## 4단계. 코드 받기 + 설정 파일(.env)

```bash
cd ~
git clone https://github.com/torgeleli22-lang/teamProject_night_first.git
cd teamProject_night_first
echo "ADMIN_TOKEN=$(openssl rand -hex 24)" > .env
nano .env
```

nano 에서 아래 내용을 **추가**합니다 (`<...>` 는 실제 값으로, `<` `>` 는 지우기):

```env
DB_DRIVER=postgres
DATABASE_URL=postgres://jojo:<암호>@<RDS 엔드포인트>:5432/jojobase
AI_MODE=mock
ALLOWED_ORIGINS=https://torgeleli22-lang.github.io
SITE_ADDRESS=<IP-대시>.sslip.io
```
저장 `Ctrl+O` → `Enter`, 나가기 `Ctrl+X`

- `<암호>` 에 `@ : / ? # %` 가 있으면 주소가 깨집니다.
- `.env` 는 GitHub 에 올라가지 않습니다 (`.gitignore`). 이 서버에만 있습니다.
- `ADMIN_TOKEN` 값은 관리자 화면(`/admin`) 비밀번호입니다. `cat .env` 로 보고 따로 메모하세요.

---

## 5단계. 실행

```bash
sudo docker build -t codereading-api .    # 처음 3~5분 (콘텐츠 실행 검증 포함)
sudo docker compose up -d
sudo docker compose ps                     # api, caddy 둘 다 Up 이면 정상
sudo docker compose logs --tail 20 api     # "코드리딩 API: ... (DB: postgres, AI: mock)"
```

---

## 6단계. 확인

브라우저에서:
```
https://<IP-대시>.sslip.io/health     → {"ok":true,"db":"postgres","ai":"mock"}
https://<IP-대시>.sslip.io/concepts   → 문제 목록 JSON (DB 연결까지 성공)
```
- 처음 몇 초는 Caddy 가 인증서를 받는 중이라 접속이 안 될 수 있어요. 30초 뒤 다시 시도.
- 처음 `/concepts` 는 테이블과 시드 문제 90개를 만드느라 조금 더 걸립니다.

---

## 7단계. GitHub Pages 에 API 주소 연결

1. 저장소 → **Settings → Pages** → Source: **GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables** → `API_URL` = `https://<IP-대시>.sslip.io`
3. 작업 브랜치를 **main 에 병합** (이미 병합했다면 Actions → `Deploy web (GitHub Pages)` → **Run workflow**)
4. 화면: **https://torgeleli22-lang.github.io/teamProject_night_first/**

---

## 업데이트하는 방법

| 바뀐 것 | 할 일 |
|---|---|
| 화면 (src/app, src/components) | main 에 push → Pages 자동 배포 |
| API·채점·콘텐츠 (src/api, src/lib) | EC2 에서 `git pull && sudo docker build -t codereading-api . && sudo docker compose up -d` |
| 설정 (AI 모드 등) | EC2 의 `.env` 수정 → `sudo docker compose up -d` |

**비용 아끼기**: 안 쓸 때 EC2 와 RDS 를 **중지**하세요 (RDS 는 7일 뒤 자동 재시작). 탄력적 IP 가 없으면 다시 켤 때 공인 IP 가 바뀌므로 `SITE_ADDRESS` 와 GitHub `API_URL` 을 새 주소로 바꾸고 Pages 워크플로를 다시 실행하세요.

---

## 8단계. 실제 AI 연결 (Bedrock · Claude Haiku 4.5)

이 계정에서 쓸 수 있는 Claude 모델은 **미국 동부(버지니아 북부, us-east-1)** 의 **Claude Haiku 4.5** 입니다. EC2(서울)에서 us-east-1 의 Bedrock 을 부르는 데 문제는 없습니다.

### 8-1. 모델 사용 확인
AWS 콘솔 오른쪽 위 리전을 **미국 동부(버지니아 북부)** 로 바꾸고 → **Amazon Bedrock** → 왼쪽 **모델 액세스**(또는 Model catalog) → **Claude Haiku 4.5** 가 "액세스 권한 부여됨 / Available" 인지 확인. 아니면 요청(또는 담당 교수님께 문의).

### 8-2. 액세스 키 만들기
IAM → **사용자** → 내 사용자(`sgu-...`) → **보안 자격 증명** 탭 → **액세스 키 만들기** → 사용 사례 "AWS 외부에서 실행되는 애플리케이션"(또는 "기타") → 만들기.

- **비밀 액세스 키는 이 화면에서 한 번만 보여요.** `.csv 다운로드` 로 보관하세요.
- 키는 **EC2 의 `.env` 에만** 넣습니다. 코드·문서·GitHub·채팅에는 절대 붙여 넣지 마세요 (유출되면 내 계정으로 요금이 나갑니다). 유출이 의심되면 같은 화면에서 **비활성화 → 삭제** 후 새로 만드세요.
- 키 만들기가 막혀 있으면(권한 거부), 그 메시지를 그대로 공유해 주세요.

### 8-2 대신: 액세스 키 없이 (EC2 IAM 역할)
키를 만들지 않고 **EC2 에 IAM 역할을 붙이면**, 코드가 그 역할의 임시 자격 증명을 자동으로 씁니다 (코드 수정 필요 없음).
1. IAM → **역할** 에서 Bedrock 호출 권한(`bedrock:InvokeModel`)이 있고, 신뢰 대상이 `ec2.amazonaws.com` 인 역할이 이미 있는지 확인 (학교 계정은 새 역할 만들기가 막혀 있음)
2. EC2 → 인스턴스 → **작업 → 보안 → IAM 역할 수정** 에서 그 역할 선택. 막히면 인스턴스를 새로 만들 때 **고급 세부 정보 → IAM 인스턴스 프로필** 에서 선택 (보안 그룹 2개도 함께)
3. EC2 에서 확인: `aws sts get-caller-identity` → `assumed-role/<역할 이름>/...` 이 보이면 연결됨
4. 8-3 에서 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 두 줄만 빼고 나머지(`AI_MODE=live`, `AI_PROVIDER=bedrock`, `AWS_REGION=us-east-1`, 예산)는 그대로 넣기

> Docker 안에서 역할 자격 증명을 못 읽으면(로그에 `Could not load credentials`): EC2 → 인스턴스 → 작업 → 인스턴스 설정 → **인스턴스 메타데이터 옵션 수정** → 응답 홉 제한 **2**.

### 8-3. EC2 `.env` 수정
```bash
cd ~/teamProject_night_first
nano .env
```
`AI_MODE=mock` 줄을 **지우고** 아래를 추가합니다 (`<...>` 는 실제 값으로, `<` `>` 는 지우기):
```env
AI_MODE=live
AI_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<액세스 키 ID>
AWS_SECRET_ACCESS_KEY=<비밀 액세스 키>
AI_MONTHLY_BUDGET_USD=10
```
- `AI_MONTHLY_BUDGET_USD` : 이번 달 AI 예상 비용이 이 금액(달러)을 넘으면 AI 를 자동으로 멈추고 규칙 기반으로 바뀝니다. API 주소가 공개되어 있으니 꼭 넣으세요.

### 8-4. 새 코드 받고 다시 실행
```bash
git pull
sudo docker build -t codereading-api .
sudo docker compose up -d
sudo docker compose logs --tail 20 api     # "(DB: postgres, AI: live)"
```
`https://<IP-대시>.sslip.io/health` → `"ai":"live"`

### 8-5. 동작 확인
화면에서 **주관식 문제 답 제출**(AI 평가)이나 **AI 튜터에게 질문하기** 를 해 보세요. 관리자 화면(`/admin`)의 사용량에 `anthropic.claude-haiku-4-5` 가 보이면 실제 AI 가 응답한 것입니다.
실패하면 `sudo docker compose logs --tail 50 api` 에서 `[ai] 호출 실패` 줄을 확인하세요 (화면은 실패해도 규칙 기반으로 계속 동작합니다).

| 로그 메시지 | 원인 / 해결 |
|---|---|
| `security token included in the request is invalid` / 401 | 키를 잘못 복사함 (앞뒤 공백, 꺾쇠 `< >`) |
| `not authorized to perform: bedrock:InvokeModel` / 403 | 이 사용자에게 Bedrock 호출 권한이 없음 → 담당 교수님께 권한 요청 |
| `You don't have access to the model` / `model ... not found` | 8-1 모델 액세스 확인, `AWS_REGION=us-east-1` 인지 확인 |
| `monthly AI budget reached` | 이번 달 예산 도달 → `AI_MONTHLY_BUDGET_USD` 를 올리거나 다음 달까지 대기 |

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `/health` 는 되는데 `/concepts` 가 오류 | EC2 에 `default` 보안 그룹이 붙어 있는지 (2-1, 없으면 인스턴스를 두 그룹으로 다시 생성), `.env` 의 `DATABASE_URL` 에 꺾쇠 `< >` 가 남아 있지 않은지, 엔드포인트·DB 이름(`jojobase`) 확인. `sudo docker compose logs --tail 50 api` |
| `password authentication failed` | `.env` 의 사용자 이름(`jojo`) 또는 암호가 다름 |
| `https://...sslip.io` 가 안 열림 | 보안 그룹에 80·443(IPv4 0.0.0.0/0) 이 있는지, `SITE_ADDRESS` 가 지금 공인 IP 와 맞는지. `sudo docker compose logs caddy` |
| 화면에 "아직 서버(API)가 연결되지 않았어요" | GitHub `API_URL` 없이 배포됨 → 7단계 2·3번 |
| 화면에 "서버에 연결하지 못했어요" / CORS 오류 | `API_URL` 이 `https://` 로 시작하는지, `.env` 의 `ALLOWED_ORIGINS=https://torgeleli22-lang.github.io` (경로 없이) 확인 |
| 빌드 중 `Killed` | 메모리 부족 → 3단계 스왑 확인 (`free -h`) |
| `/admin` 이 401 | `.env` 의 `ADMIN_TOKEN` 값을 관리자 화면에 입력 |

---

## 참고: 다른 배포 방식 (코드는 모두 지원)

- **Lambda** (`src/api/lambda.ts`, `npm run build:lambda`): 실행 역할을 만들 수 있거나 VPC 권한이 있는 계정에서. VPC 안이면 `DB_DRIVER=postgres` + `BACKGROUND_MODE=inline`.
- **Aurora Data API** (`DB_DRIVER=data-api`): Aurora 가 허용되는 계정에서 Lambda 를 VPC 없이 연결.
