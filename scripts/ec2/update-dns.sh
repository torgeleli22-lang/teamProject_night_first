#!/usr/bin/env bash
# EC2 의 지금 공인 IP 를 DuckDNS 주소(예: codereading.duckdns.org)에 연결한다.
# EC2 를 껐다 켜서 IP 가 바뀌어도 주소는 그대로라서, .env 의 SITE_ADDRESS 와 GitHub 의 API_URL 을 바꿀 필요가 없다.
# .env 에 DUCKDNS_DOMAIN, DUCKDNS_TOKEN 이 있어야 한다. 설치: bash scripts/ec2/install-dns.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
log() { echo "[dns] $*"; }
# "KEY=값", "KEY = 값", "export KEY=값" 모두 읽는다 (따옴표·공백·Windows 줄바꿈 제거)
env_value() { grep -E "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r\t' || true; }

DOMAIN="$(env_value DUCKDNS_DOMAIN)"
TOKEN="$(env_value DUCKDNS_TOKEN)"
DOMAIN="${DOMAIN%.duckdns.org}"
if [ ! -f .env ]; then
  log "❌ $(pwd)/.env 파일이 없어요."
  exit 1
fi
[ -z "$DOMAIN" ] && log "❌ $(pwd)/.env 에 DUCKDNS_DOMAIN=<이름> 줄이 없거나 값이 비어 있어요."
[ -z "$TOKEN" ] && log "❌ $(pwd)/.env 에 DUCKDNS_TOKEN=<토큰> 줄이 없거나 값이 비어 있어요."
[ -z "$DOMAIN" ] || [ -z "$TOKEN" ] && exit 1

# EC2 안에서만 열리는 메타데이터 주소에서 지금 공인 IP 를 읽는다 (IMDSv2)
META_TOKEN="$(curl -sf -m 5 -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")"
IP="$(curl -sf -m 5 -H "X-aws-ec2-metadata-token: $META_TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)"
if [ -z "$IP" ]; then
  log "❌ 공인 IP 를 읽지 못했어요 (인스턴스에 퍼블릭 IP 가 있는지 확인)."
  exit 1
fi

# 토큰이 로그에 남지 않도록 결과만 출력한다
RESULT="$(curl -sf -m 10 "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=${IP}" || true)"
if [ "$RESULT" = "OK" ]; then
  log "✅ ${DOMAIN}.duckdns.org → ${IP}"
else
  log "❌ DuckDNS 갱신 실패 (도메인 이름·토큰 확인). 응답: ${RESULT:-없음}"
  exit 1
fi
