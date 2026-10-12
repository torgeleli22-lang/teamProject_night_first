# 배포하기: GitHub Pages(화면) + EC2(API) + RDS PostgreSQL(DB)

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
- EC2 는 인터넷에 나갈 수 있으므로, 나중에 실제 AI(Bedrock 등)도 바로 연결할 수 있습니다.

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
| 방화벽(보안 그룹) | **보안 그룹 생성**: SSH(22) 소스 **내 IP**, HTTP(80) **0.0.0.0/0**, HTTPS(443) **0.0.0.0/0** (IPv4 로) |
| 스토리지 | 20 GiB |

→ 인스턴스 시작

> 보안 그룹을 만들다 권한 오류가 나면: "기존 보안 그룹 선택"에서 예전에 80·443 이 열려 있던 보안 그룹을 고르세요.

### 2-1. EC2 에 `default` 보안 그룹 추가 (DB 연결용) ⭐
EC2 → 인스턴스 `codereading-api` 선택 → **작업 → 보안 → 보안 그룹 변경** → `default` 를 찾아 **보안 그룹 추가** → 저장
(기존 그룹은 그대로 두고 `default` 를 하나 더 붙이는 것)

✅ 인스턴스 **보안** 탭에 보안 그룹이 2개(새 그룹 + `default`) 보이면 성공

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
git checkout claude/ai-code-learning-service-s0rp6l   # main 에 병합했다면 이 줄은 생략
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

## 나중에: 실제 AI 연결 (아직 하지 않음)

- 이 계정에서 쓸 수 있는 Bedrock 모델: **미국 동부(us-east-1)** 의 Claude Haiku 4.5, Amazon Nova Micro / Lite 등. 코드가 Claude 용 구조화 출력을 쓰므로 **Claude Haiku 4.5** 가 맞습니다.
- EC2 는 인터넷이 되므로 경로 문제는 없습니다. 권한(EC2 가 Bedrock 을 부를 IAM 역할 또는 키)과 코드의 Bedrock 연결을 추가할 때 진행합니다.

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `/health` 는 되는데 `/concepts` 가 오래 걸리다 오류 | EC2 에 `default` 보안 그룹이 붙어 있는지 (2-1), `.env` 의 엔드포인트·DB 이름(`jojobase`) 확인. `sudo docker compose logs --tail 50 api` |
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
