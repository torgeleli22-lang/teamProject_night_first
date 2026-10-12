#!/usr/bin/env bash
# EC2 자동 배포: GitHub 의 main 이 바뀌었으면 코드를 받고 API 이미지를 다시 빌드해서 띄운다.
# systemd 타이머가 몇 분마다 실행한다 (설치: bash scripts/ec2/install-autodeploy.sh).
# 직접 실행해도 된다:  bash scripts/ec2/autodeploy.sh
# 빌드가 실패했던 커밋을 고친 뒤 다시 시도:  FORCE=1 bash scripts/ec2/autodeploy.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
BRANCH="${DEPLOY_BRANCH:-main}"
log() { echo "[autodeploy] $*"; }

# 이전 실행(빌드 중)이 아직 끝나지 않았으면 이번에는 건너뛴다
exec 9>/tmp/codereading-autodeploy.lock
flock -n 9 || { log "이전 배포가 진행 중이라 건너뜀"; exit 0; }

# 마지막으로 배포(성공)한 커밋과 마지막으로 시도한 커밋 — git 이 관리하지 않는 .git 폴더 안에 둔다
DEPLOYED_FILE=.git/autodeploy-deployed
ATTEMPTED_FILE=.git/autodeploy-attempted

git fetch -q origin "$BRANCH"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || git checkout -q "$BRANCH"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
  # 서버에서 직접 고친 파일이 있으면 덮어쓰지 않고 멈춘다 (.env 는 git 이 관리하지 않아서 괜찮음)
  if ! git merge -q --ff-only "origin/$BRANCH"; then
    log "❌ 서버의 코드가 GitHub 과 달라서 자동으로 받지 못했어요. 'git status' 로 확인하세요."
    exit 1
  fi
fi

TARGET="$(git rev-parse HEAD)"
DEPLOYED="$(cat "$DEPLOYED_FILE" 2>/dev/null || true)"
# 이미 배포했거나, 같은 커밋으로 빌드를 시도했다가 실패했으면 새 커밋이 올 때까지 기다린다
if [ -z "${FORCE:-}" ]; then
  [ "$TARGET" = "$DEPLOYED" ] && exit 0
  [ "$TARGET" = "$(cat "$ATTEMPTED_FILE" 2>/dev/null || true)" ] && exit 0
fi
log "새 코드: ${DEPLOYED:0:7} → ${TARGET:0:7}"

# 화면·문서만 바뀌었으면 API 는 다시 빌드할 필요가 없다 (화면은 GitHub Pages 가 배포)
if [ -z "${FORCE:-}" ] && [ -n "$DEPLOYED" ] && git cat-file -e "$DEPLOYED" 2>/dev/null; then
  NEEDS_BUILD="$(git diff --name-only "$DEPLOYED" "$TARGET" | grep -vE '^(docs/|\.github/|src/app/|src/components/|public/|infra/)|\.md$' || true)"
  if [ -z "$NEEDS_BUILD" ]; then
    echo "$TARGET" >"$DEPLOYED_FILE"
    log "화면·문서만 바뀌어서 API 는 그대로 둠"
    exit 0
  fi
fi

echo "$TARGET" >"$ATTEMPTED_FILE"
log "API 이미지 빌드 중 (3~5분)…"
# 빌드(콘텐츠 실행 검증 포함)가 실패하면 지금 돌고 있는 API 를 그대로 둔다
if ! sudo docker build -q -t codereading-api . >/dev/null; then
  log "❌ 빌드 실패 — 기존 API 를 계속 사용해요. 'sudo docker build -t codereading-api .' 로 원인을 확인하고, 고친 뒤 'FORCE=1 bash scripts/ec2/autodeploy.sh'."
  exit 1
fi
sudo docker compose up -d --force-recreate api
sudo docker compose up -d
# 빌드할 때마다 쌓이는 예전 이미지 정리 (디스크 절약)
sudo docker image prune -f >/dev/null
sudo docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
echo "$TARGET" >"$DEPLOYED_FILE"
log "✅ 배포 완료: $(git log --oneline -1)"
