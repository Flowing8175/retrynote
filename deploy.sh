#!/bin/bash
set -e

SERVER="ubuntu@DEPLOY_HOST_PLACEHOLDER"
SSH_KEY="$HOME/.ssh/oracle.key"
APP_DIR="/home/retrynote/app"
DIST_DIR="/home/retrynote/frontend/dist"
BRANCH="main"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
die() { echo -e "${RED}[error]${NC} $1"; exit 1; }

ssh_run() { ssh -i "$SSH_KEY" "$SERVER" "$@"; }

# ── 1. 코드 동기화 ─────────────────────────────────────────
log "코드 동기화 중..."
ssh_run "sudo -u retrynote git -C $APP_DIR fetch origin && sudo -u retrynote git -C $APP_DIR reset --hard origin/$BRANCH"

# ── 2. .env 확인 ───────────────────────────────────────────
ssh_run "[ -f $APP_DIR/.env ]" || die ".env 파일이 없습니다."

# ── 3. Python 의존성 업데이트 ──────────────────────────────
log "Python 의존성 업데이트 중..."
ssh_run "sudo -u retrynote $APP_DIR/backend/.venv/bin/pip install -q -r $APP_DIR/backend/requirements.txt"

# ── 4. DB 마이그레이션 ─────────────────────────────────────
log "마이그레이션 실행 중..."
ssh_run "cd $APP_DIR/backend && sudo -u retrynote PYTHONPATH=$APP_DIR/backend $APP_DIR/backend/.venv/bin/alembic upgrade head"

# ── 5. 백엔드 재시작 ───────────────────────────────────────
log "백엔드 재시작 중..."
ssh_run "sudo systemctl restart retrynote-api retrynote-worker"

# ── 6. 백엔드 헬스 체크 ────────────────────────────────────
log "백엔드 헬스 체크 중..."
RETRIES=15
until ssh_run "curl -sf --max-time 5 http://127.0.0.1:8001/docs > /dev/null 2>&1"; do
    RETRIES=$((RETRIES - 1))
    [ "$RETRIES" -eq 0 ] && die "API가 시작되지 않았습니다."
    sleep 2
done
log "API 정상 작동 확인"

# ── 7. 프론트엔드 빌드 (로컬) ──────────────────────────────
log "프론트엔드 빌드 중 (로컬)..."
cd "$(dirname "$0")/frontend"
npm ci --silent
VITE_API_URL=https://retrynote.cloud/api npm run build

# ── 8. 프론트엔드 전송 ─────────────────────────────────────
log "프론트엔드 전송 중..."
ssh_run "sudo rm -rf ${DIST_DIR:?}/* && sudo mkdir -p $DIST_DIR"
rsync -az --delete -e "ssh -i $SSH_KEY" --rsync-path="sudo rsync" dist/ "$SERVER:$DIST_DIR/"
ssh_run "sudo chown -R retrynote:retrynote $DIST_DIR"

# ── 9. nginx 리로드 ────────────────────────────────────────
ssh_run "sudo systemctl reload nginx"

# ── 10. 상태 확인 ──────────────────────────────────────────
log "서비스 상태:"
ssh_run "systemctl is-active retrynote-api retrynote-worker postgresql redis-server"

log "배포 완료: https://retrynote.cloud"
