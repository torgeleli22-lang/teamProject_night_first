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
- 실제 AI 는 EC2 → **Lambda 중계(SafeRole)** → **Bedrock(us-east-1, Claude Haiku 4.5)** 순서로 부릅니다 (8단계). EC2 에 AWS 키가 없습니다.

### 학교 계정에서 막혀 있던 것 (그래서 이렇게 구성함)
| 시도 | 결과 |
|---|---|
| Aurora 클러스터 생성 | ❌ `Shingu-AdditionalRule-AuroraCluster` 정책으로 거부 |
| RDS 생성 화면에서 보안 그룹 새로 만들기 (인바운드 규칙 자동 추가) | ❌ `ec2:AuthorizeSecurityGroupIngress` 거부 → `default` 보안 그룹 사용 |
| Lambda 실행 역할 만들기 / 기존 역할로 VPC 연결 | ❌ `iam:CreateRole` 거부, 기존 역할에 `ec2:CreateNetworkInterface` 없음 → **API 는 EC2**, AI 만 VPC 밖 Lambda(SafeRole) 로 중계 |

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

## 8단계. 실제 AI 연결 (Lambda 중계 → Bedrock · Claude Haiku 4.5)

학교 계정은 액세스 키·역할 만들기가 막혀 있어서, 수업에서 한 것처럼 **Lambda 가 `SafeRole-<계정>` 역할로 Bedrock 을 부르고**, EC2 는 그 Lambda 의 주소(함수 URL)로 요청만 보냅니다. EC2 에는 AWS 키가 없습니다.

```
EC2 (API) ──HTTPS + 중계 토큰──→ Lambda 함수 URL ──SafeRole 권한──→ Bedrock (us-east-1, Claude Haiku 4.5)
```
- 이 Lambda 는 VPC 에 넣지 않습니다 (예전에 막혔던 `CreateNetworkInterface` 가 필요 없음).
- 모델은 Lambda 코드에 고정되어 있어서, 중계 토큰이 새어도 다른(비싼) 모델은 쓸 수 없습니다.

### 8-1. 중계 토큰 만들기 (EC2 에서)
```bash
openssl rand -hex 24
```
나온 값을 메모해 두세요. Lambda(8-2) 와 EC2 `.env`(8-4) 두 곳에 **같은 값**을 넣습니다. GitHub·채팅에는 쓰지 마세요.

### 8-2. Lambda 함수 만들기
AWS 콘솔 리전을 **서울** 로 두고 Lambda → **함수 생성** (수업과 같은 방법)

| 항목 | 값 |
|---|---|
| 함수 이름 | `sgu-202688-codereading-ai` |
| 런타임 | Python 3.14 (없으면 3.13) |
| 추가 설정 → 사용자 지정 실행 역할 | **`SafeRole-sgu-202688`** |

만든 뒤:
1. **코드** 탭: `lambda_function.py` 내용을 지우고, 저장소의 [`infra/bedrock-relay/lambda_function.py`](../infra/bedrock-relay/lambda_function.py) 내용을 통째로 붙여 넣기 → **Deploy**
2. **구성 → 일반 구성 → 편집**: 제한 시간 **3분** (기본 3초면 AI 답을 기다리지 못해요) → 저장
3. **구성 → 환경 변수 → 편집**: 키 `RELAY_TOKEN`, 값 = 8-1 의 토큰 → 저장
4. **구성 → 함수 URL → 함수 URL 생성**: 인증 유형 **NONE** → 저장. 생성된 주소(`https://xxxx.lambda-url.ap-northeast-2.on.aws/`)를 메모

### 8-3. Lambda 테스트 (콘솔)
**테스트** 탭 → 이벤트 JSON:
```json
{"system": "너는 친절한 코딩 선생님이야. 한국어 존댓말로 답해.", "prompt": "변수가 뭐예요?"}
```
→ 응답 `body` 에 `"output": {"answer": "..."}` 가 보이면 Bedrock 연결 성공.

이어지는 대화(멀티 턴) 테스트:
```json
{"system": "너는 친절한 코딩 선생님이야. 한국어 존댓말로 답해.",
 "messages": [
  {"role": "user", "text": "내 이름은 민수예요. 변수가 뭐예요?"},
  {"role": "assistant", "text": "변수는 값을 담아 두는 이름 붙은 상자예요."},
  {"role": "user", "text": "내 이름이 뭐라고 했죠? 그리고 예시도 하나 보여 주세요."}
 ]}
```
→ 답에 "민수" 가 나오면 앞의 대화를 기억하는 것. (콘솔 테스트는 토큰 없이 됩니다. 함수 URL 로 오는 요청만 토큰을 확인해요.)

EC2 에서 함수 URL 확인 (토큰이 틀리면 `unauthorized` 가 정상):
```bash
curl -s -X POST <함수 URL> -H "x-relay-token: <토큰>" -H "content-type: application/json" -d '{"system":"짧게 답해","prompt":"안녕"}'
```

### 8-4. EC2 `.env` 수정
```bash
cd ~/teamProject_night_first
nano .env
```
`AI_MODE=mock` 줄을 **지우고** 아래를 추가 (`<...>` 는 실제 값, `<` `>` 는 지우기):
```env
AI_MODE=live
AI_PROVIDER=relay
AI_RELAY_URL=<함수 URL>
AI_RELAY_TOKEN=<8-1 의 토큰>
AI_MONTHLY_BUDGET_USD=10
```
- `AI_MONTHLY_BUDGET_USD` : 이번 달 AI 예상 비용(달러)이 이 금액을 넘으면 AI 를 자동으로 멈추고 규칙 기반으로 바뀝니다.

### 8-5. 새 코드 받고 다시 실행
```bash
git pull
sudo docker build -t codereading-api .
sudo docker compose up -d --force-recreate
sudo docker compose logs --tail 20 api     # "(DB: postgres, AI: live)"
```

### 8-6. 동작 확인
화면에서 **주관식 문제 답 제출**(AI 평가)이나 **AI 튜터에게 질문하기** 를 해 보세요. 관리자 화면(`/admin`) 사용량에 `us.anthropic.claude-haiku-4-5-...` 가 보이면 실제 AI 가 응답한 것입니다.
실패해도 화면은 규칙 기반으로 계속 동작합니다. 원인은 EC2 의 `sudo docker compose logs --tail 50 api` (`[ai] 호출 실패` 줄) 와 Lambda 의 **모니터링 → CloudWatch 로그** (`[bedrock] 호출 실패` 줄) 에서 봅니다.

| 메시지 | 원인 / 해결 |
|---|---|
| `relay 401: unauthorized` | `.env` 의 `AI_RELAY_TOKEN` 과 Lambda 의 `RELAY_TOKEN` 이 다름 (앞뒤 공백 확인) |
| `relay 502: bedrock: AccessDeniedException` | 역할이 `SafeRole-...` 인지, 모델 ID 확인 (Lambda 로그) |
| `relay 502: bedrock: ReadTimeoutError` / Lambda `Task timed out` | 8-2 의 제한 시간 3분 확인 |
| `fetch failed` / `TimeoutError` | `AI_RELAY_URL` 오타 (함수 URL 전체, `https://` 포함) |
| `monthly AI budget reached` | 이번 달 예산 도달 → `AI_MONTHLY_BUDGET_USD` 를 올리거나 다음 달까지 대기 |

### (참고) 다른 연결 방법
권한이 있는 계정이라면 Lambda 없이 EC2 가 Bedrock 을 직접 부를 수도 있습니다: `.env` 에 `AI_PROVIDER=bedrock`, `AWS_REGION=us-east-1` 과 함께 IAM 사용자 액세스 키(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)를 넣거나, Bedrock 권한이 있는 IAM 역할을 EC2 에 붙입니다 (Docker 안에서 역할을 못 읽으면 인스턴스 메타데이터 옵션의 응답 홉 제한을 2로).

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
