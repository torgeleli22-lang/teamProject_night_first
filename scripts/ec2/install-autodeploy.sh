#!/usr/bin/env bash
# EC2 에서 한 번만 실행: 자동 배포 타이머를 설치한다.
#   bash scripts/ec2/install-autodeploy.sh        # 5분마다 확인
#   INTERVAL=10min bash scripts/ec2/install-autodeploy.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_USER="$(id -un)"
INTERVAL="${INTERVAL:-5min}"

sudo tee /etc/systemd/system/codereading-deploy.service >/dev/null <<UNIT
[Unit]
Description=코드리딩 API 자동 배포 (GitHub main 확인 → 바뀌었으면 다시 빌드)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO}
ExecStart=/usr/bin/bash ${REPO}/scripts/ec2/autodeploy.sh
TimeoutStartSec=30min
UNIT

sudo tee /etc/systemd/system/codereading-deploy.timer >/dev/null <<UNIT
[Unit]
Description=코드리딩 API 자동 배포 (${INTERVAL}마다)

[Timer]
OnBootSec=2min
OnUnitActiveSec=${INTERVAL}

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now codereading-deploy.timer
echo "자동 배포를 켰어요 (${INTERVAL}마다 GitHub main 확인)."
echo "  상태:  systemctl list-timers codereading-deploy.timer"
echo "  기록:  journalctl -u codereading-deploy -n 30 --no-pager"
echo "  끄기:  sudo systemctl disable --now codereading-deploy.timer"
