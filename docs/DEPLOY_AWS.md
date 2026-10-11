# AWS EC2 에 처음 배포하기 (1단계: EC2 한 대 + Docker + 목업 AI)

목표: `http://<공인 IP>` 로 접속하면 코드리딩 서비스가 뜨는 것.
이 단계에서는 AI 를 **목업 모드(`AI_MODE=mock`)** 로 두어 비용 없이 동작부터 확인합니다. Bedrock·RDS·S3 는 다음 단계입니다.

```
브라우저 ──(80/443)──→ EC2 (Amazon Linux 2023)
                        ├─ caddy 컨테이너  : 웹 서버 (도메인 연결 시 HTTPS 자동)
                        └─ app 컨테이너    : Next.js + SQLite(Docker 볼륨에 저장)
```

> AWS 콘솔 화면의 메뉴 이름이나 위치는 조금씩 바뀔 수 있어요. 아래 이름과 비슷한 항목을 찾으면 됩니다.

---

## 0단계. 시작 전 확인 (5분)

- [ ] **루트 계정 MFA** 설정 (우측 상단 계정 이름 → 보안 자격 증명)
- [ ] **예산 알림**: Billing and Cost Management → Budgets → 월 $10, $30 알림
- [ ] 평소에는 루트 계정 대신 관리자 권한 사용자(IAM Identity Center 또는 IAM 사용자)로 로그인
- [ ] 우측 상단 리전을 **아시아 태평양(서울) ap-northeast-2** 로 선택 — 이후 모든 작업을 같은 리전에서
- [ ] **액세스 키를 코드나 GitHub 에 절대 넣지 않기.** EC2 는 아래의 "IAM 역할"로 권한을 받습니다.

---

## 1단계. EC2 용 IAM 역할 만들기

나중에 EC2 가 Bedrock 을 부를 권한을 이 역할에 붙입니다. (SSH 키로 접속하더라도 미리 만들어 두면 편해요.
`AmazonSSMManagedInstanceCore` 는 키를 잃어버렸을 때 Session Manager 로 들어갈 수 있게 해 주는 비상구예요.)

1. 콘솔 검색창에 **IAM** → 왼쪽 **역할(Roles)** → **역할 생성**
2. 신뢰할 수 있는 엔터티: **AWS 서비스** → 사용 사례 **EC2** → 다음
3. 권한 정책 검색: **`AmazonSSMManagedInstanceCore`** 체크 → 다음
4. 역할 이름: **`codereading-ec2-role`** → 역할 생성

✅ 확인: 역할 목록에 `codereading-ec2-role` 이 보이면 성공.

---

## 2단계. EC2 인스턴스 만들기

콘솔 검색창에 **EC2** → **인스턴스 시작(Launch instance)**

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 이름 | `codereading-server` | |
| AMI | **Amazon Linux 2023**, 아키텍처 **64비트(Arm)** | t4g 는 ARM(Graviton) |
| 인스턴스 유형 | **t4g.small** (2 vCPU, 2GB) | 빌드까지 하려면 최소 2GB 권장 |
| 키 페어 | **새 키 페어 생성** → 이름 `codereading-key`, 유형 **RSA**, 형식 **.pem**(권장) 또는 **.ppk**(PuTTY) | 생성 즉시 파일이 **한 번만** 다운로드됨 — 잃어버리면 다시 받을 수 없어요 |
| 네트워크 설정 → 편집 | VPC: 기본값, 퍼블릭 IP 자동 할당: **활성화** | |
| 보안 그룹 | **보안 그룹 생성**, 이름 `codereading-sg` | |
| 인바운드 규칙 | **SSH(22) 소스: 내 IP**, **HTTP(80) 0.0.0.0/0**, **HTTPS(443) 0.0.0.0/0** | SSH 를 `0.0.0.0/0`(전체 공개)로 열지 않기 |
| 스토리지 | **20 GiB, gp3** | Docker 이미지·빌드용 |
| 고급 세부 정보 → IAM 인스턴스 프로파일 | **`codereading-ec2-role`** | ← 꼭 선택! |

→ **인스턴스 시작**

✅ 확인: 인스턴스 목록에서 상태 **실행 중**, 상태 검사 **2/2 통과** (2~3분 걸림).

---

## 3단계. 고정 IP(Elastic IP) 붙이기

인스턴스를 껐다 켜면 공인 IP 가 바뀌므로 고정 IP 를 붙입니다.

1. EC2 왼쪽 메뉴 **탄력적 IP** → **탄력적 IP 주소 할당** → 할당
2. 방금 만든 IP 선택 → 작업 → **탄력적 IP 주소 연결** → 인스턴스 `codereading-server` 선택 → 연결

✅ 확인: 인스턴스 상세의 "퍼블릭 IPv4 주소"가 탄력적 IP 와 같으면 성공. 이 IP 를 메모해 두세요.

> 공인 IPv4 는 사용 중이든 아니든 시간당 요금이 붙어요(약 월 $3.6). 인스턴스를 완전히 정리할 때는 탄력적 IP 도 **릴리스**하세요.

---

## 4단계. 서버에 접속하기 (SSH 키: .pem / .ppk)

### 키 파일 보관
- 다운로드한 키를 안전한 폴더로 옮기세요. 예: Windows `C:\Users\<내이름>\.ssh\codereading-key.pem`
- **GitHub·프로젝트 폴더에 절대 넣지 마세요.** 키가 있으면 누구나 서버에 들어올 수 있어요.
- 접속 계정 이름은 Amazon Linux 기준 **`ec2-user`** 예요.

### 방법 A. Windows PowerShell + .pem (권장, 설치 불필요)
1. 키 파일 권한 좁히기 (안 하면 `UNPROTECTED PRIVATE KEY FILE` 오류):
   ```powershell
   cd $HOME\.ssh
   icacls .\codereading-key.pem /inheritance:r
   icacls .\codereading-key.pem /grant:r "$($env:USERNAME):(R)"
   ```
2. 접속:
   ```powershell
   ssh -i $HOME\.ssh\codereading-key.pem ec2-user@<탄력적 IP>
   ```
3. 처음에 `Are you sure you want to continue connecting (yes/no)?` → `yes`

macOS / Linux 라면: `chmod 400 ~/.ssh/codereading-key.pem` 후 같은 `ssh` 명령.

### 방법 B. PuTTY + .ppk
1. (키를 .pem 으로 받았다면) **PuTTYgen** → Load → .pem 선택(파일 형식 All Files) → **Save private key** → `.ppk` 저장
2. **PuTTY** 실행
   - Session → Host Name: `ec2-user@<탄력적 IP>`, Port `22`
   - Connection → SSH → Auth → Credentials → Private key file: `.ppk` 선택
   - Session 으로 돌아와 Saved Sessions 에 `codereading` 입력 → **Save** (다음부터 더블클릭)
3. **Open** → 경고 창에서 **Accept**

### 방법 C. VS Code 로 접속 (파일 편집이 편함)
1. 확장 **Remote - SSH** 설치
2. `F1` → `Remote-SSH: Open SSH Configuration File` → `C:\Users\<내이름>\.ssh\config` 에 추가:
   ```
   Host codereading
     HostName <탄력적 IP>
     User ec2-user
     IdentityFile C:\Users\<내이름>\.ssh\codereading-key.pem
   ```
3. `F1` → `Remote-SSH: Connect to Host` → `codereading` (방법 A 의 권한 설정이 먼저 되어 있어야 해요)

✅ 확인: 프롬프트가 `[ec2-user@ip-... ~]$` 로 바뀌면 성공.

> **내 IP 가 바뀌면**(집 ↔ 학교, 와이파이 변경) 접속이 안 될 수 있어요. 보안 그룹 → 인바운드 규칙 편집 → SSH 소스를 다시 **내 IP** 로 저장하세요.

---

## 5단계. Docker · Git 설치 (한 번만)

터미널에 한 줄씩 붙여 넣으세요.

```bash
# 1) 패키지 업데이트 + docker, git 설치
sudo dnf update -y
sudo dnf install -y docker git

# 2) Docker 켜기 (재부팅해도 자동 시작)
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # 다음 접속부터는 sudo 없이 docker 사용 가능 (지금은 sudo 그대로 사용)

# 3) docker compose 플러그인 설치
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 4) 메모리 부족 방지용 스왑 2GB (t4g.small 은 RAM 2GB 라 빌드 중 멈출 수 있음)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

✅ 확인:

```bash
sudo docker --version
sudo docker compose version
free -h            # Swap 2.0Gi 가 보이면 성공
```

---

## 6단계. 코드 받기

```bash
cd ~
git clone -b claude/ai-code-learning-service-s0rp6l https://github.com/torgeleli22-lang/teamProject_night_first.git
cd teamProject_night_first
```

- 저장소가 **비공개(private)** 라면 비밀번호 대신 GitHub **Personal Access Token** 을 입력해야 해요.
  GitHub → Settings → Developer settings → Fine-grained tokens → 이 저장소만, **Contents: Read-only** 로 발급.
- main 에 병합한 뒤에는 `-b claude/...` 부분을 빼고 받으면 됩니다.

---

## 7단계. 환경 변수(.env) 만들기

```bash
cp .env.example .env
echo "ADMIN_TOKEN=$(openssl rand -hex 16)" >> .env
nano .env
```

`nano` 편집기에서 확인할 것:

```env
AI_MODE=mock          # 지금은 목업. Bedrock 연결 후 live 로 바꿈
ADMIN_TOKEN=...       # 방금 자동으로 들어간 값. /admin 접속에 사용 — 따로 메모
```

저장: `Ctrl + O` → `Enter`, 나가기: `Ctrl + X`

> `.env` 는 `.gitignore` 에 들어 있어 GitHub 에 올라가지 않아요. 서버에서만 관리합니다.

---

## 8단계. 빌드하고 실행하기

```bash
# 1) 앱 이미지 만들기 (처음 5~10분). 이미지 안에서 콘텐츠 실행 검증 → 빌드까지 해요.
sudo docker build -t codereading-app .

# 2) 실행 (앱 + 웹 서버)
sudo docker compose up -d

# 3) 상태 확인
sudo docker compose ps          # app, caddy 둘 다 running(Up) 이면 성공
sudo docker compose logs -f app # "Ready" 가 보이면 Ctrl + C 로 빠져나오기
```

✅ 확인: 내 컴퓨터 브라우저에서 **`http://<탄력적 IP>`** 접속 → 코드리딩 첫 화면.
`/learn` 에서 문제를 풀어 보고, `/admin` 에서 ADMIN_TOKEN 을 넣어 보세요.

> 주소는 반드시 `http://` 로 입력하세요. 도메인 없이 `https://IP` 로는 접속되지 않아요(10단계에서 해결).

---

## 9단계. 운영할 때 자주 쓰는 명령

```bash
cd ~/teamProject_night_first

# 코드가 바뀌었을 때 (새 버전 배포)
git pull
sudo docker build -t codereading-app .
sudo docker compose up -d       # 새 이미지로 교체. 학습 기록(DB)은 볼륨에 남아 있어요

# 로그 보기 / 재시작 / 끄기
sudo docker compose logs --tail 100 app
sudo docker compose restart app
sudo docker compose down        # 끄기 (데이터는 유지)

# 디스크 정리 (오래된 이미지)
sudo docker image prune -f
```

**비용 아끼기**: 쓰지 않는 동안 EC2 콘솔에서 인스턴스를 **중지**하면 인스턴스 요금이 멈춰요.
(디스크와 탄력적 IP 요금은 계속 나와요.) 다시 **시작**하면 Docker 가 자동으로 서비스를 다시 띄웁니다.

대략 비용(서울, 온디맨드 기준 추정): t4g.small 약 월 $15 + 디스크 20GB 약 $2 + 공인 IP 약 $3.6.

---

## 10단계. (선택) 도메인 + HTTPS

1. 도메인을 구입(Route 53 또는 다른 업체)하고 **A 레코드**를 탄력적 IP 로 지정
2. 서버에서:

```bash
echo "SITE_ADDRESS=내도메인.com" >> .env
sudo docker compose up -d
```

Caddy 가 Let's Encrypt 인증서를 자동으로 받아 `https://내도메인.com` 으로 연결해요 (보안 그룹 80·443 이 열려 있어야 함).

---

## 문제 해결

| 증상 | 원인 / 해결 |
| --- | --- |
| `ssh: connect ... timed out` | 보안 그룹 SSH(22) 소스가 지금 내 IP 가 아님 → **내 IP** 로 다시 저장. 학교·회사 망이 22번 포트를 막는 경우도 있어요 (그때는 Session Manager 사용) |
| `Permission denied (publickey)` | 사용자 이름이 `ec2-user` 인지, 이 인스턴스를 만들 때 고른 키 파일인지 확인 |
| `UNPROTECTED PRIVATE KEY FILE` / `bad permissions` | 4단계 방법 A 의 `icacls`(Windows) 또는 `chmod 400`(macOS) 실행 |
| PuTTY `Unable to use key file` | .pem 을 그대로 넣은 경우 → PuTTYgen 으로 .ppk 변환 |
| 키 파일을 잃어버림 | 1단계 역할이 붙어 있으면 인스턴스 → 연결 → **Session Manager** 로 들어갈 수 있어요 |
| 브라우저에서 접속이 안 됨(시간 초과) | 보안 그룹 인바운드에 HTTP 80 이 있는지, 주소를 `http://` 로 입력했는지 확인 |
| `502 Bad Gateway` | 앱이 아직 시작 중이거나 멈춤 → `sudo docker compose logs app` 확인 |
| 빌드 중 멈추거나 `Killed` | 메모리 부족 → 5단계 스왑 설정 확인 (`free -h`) |
| `permission denied ... docker.sock` | 명령 앞에 `sudo` 를 붙이기 |
| `git clone` 에서 인증 실패 | 비공개 저장소 → 비밀번호 자리에 Personal Access Token 입력 |
| 이미지 빌드 중 `verify` 실패 | 시드 콘텐츠 문제 → 로컬에서 `npm run verify` 로 먼저 고치고 push |

---

## 다음 단계 (이 문서 이후)

1. **Bedrock 연결**: IAM 역할에 `bedrock:InvokeModel` 권한 추가 → 코드에 Bedrock 클라이언트 추가 → `AI_MODE=live`
2. **CI/CD**: GitHub Actions 로 검사(typecheck·test·verify·build) → 이미지(ECR) → EC2 자동 배포
3. **RDS(PostgreSQL)**, **S3**: 사용자가 늘어나거나 로그인 기능을 붙일 때 (`docs/PROJECT_BRIEF.md` §11)
