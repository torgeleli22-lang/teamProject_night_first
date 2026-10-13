#!/usr/bin/env bash
# EC2 에서 한 번만 실행: 부팅할 때(와 30분마다) DuckDNS 주소를 지금 IP 로 맞추는 타이머를 설치한다.
#   bash scripts/ec2/install-dns.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_USER="$(id -un)"

bash "$REPO/scripts/ec2/update-dns.sh"   # 설정이 맞는지 먼저 한 번 실행

sudo tee /etc/systemd/system/codereading-dns.service >/dev/null <<UNIT
[Unit]
Description=코드리딩 DuckDNS 주소를 지금 공인 IP 로 맞추기
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO}
ExecStart=/usr/bin/bash ${REPO}/scripts/ec2/update-dns.sh
UNIT

sudo tee /etc/systemd/system/codereading-dns.timer >/dev/null <<UNIT
[Unit]
Description=코드리딩 DuckDNS 갱신 (부팅 직후와 30분마다)

[Timer]
OnBootSec=20s
OnUnitActiveSec=30min

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now codereading-dns.timer
echo "DuckDNS 자동 갱신을 켰어요 (부팅 직후와 30분마다)."
echo "  기록:  journalctl -u codereading-dns -n 10 --no-pager"
echo "  끄기:  sudo systemctl disable --now codereading-dns.timer"
