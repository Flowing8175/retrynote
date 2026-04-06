#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$SCRIPT_DIR/frontend}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { printf '%b\n' "${GREEN}[deploy]${NC} $1"; }
die() { printf '%b\n' "${RED}[error]${NC} $1" >&2; exit 1; }

DEPLOY_SERVER="${DEPLOY_SERVER:-}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-}"
SSH_PRIVATE_KEY="${SSH_PRIVATE_KEY:-${DEPLOY_SSH_KEY:-$HOME/.ssh/deploy_key}}"

if [[ -n "$DEPLOY_SERVER" && "$DEPLOY_SERVER" == *"@"* ]]; then
  DEPLOY_USER="${DEPLOY_USER:-${DEPLOY_SERVER%@*}}"
  DEPLOY_HOST="${DEPLOY_HOST:-${DEPLOY_SERVER#*@}}"
fi

[[ -n "$DEPLOY_HOST" ]] || die "Set DEPLOY_HOST (or legacy DEPLOY_SERVER=user@host)"
[[ -n "$DEPLOY_USER" ]] || die "Set DEPLOY_USER (or use DEPLOY_SERVER=user@host)"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/retrynote/app}"
REMOTE_FRONTEND_DIST_DIR="${REMOTE_FRONTEND_DIST_DIR:-/home/retrynote/frontend/dist}"
REMOTE_NGINX_SOURCE="${REMOTE_NGINX_SOURCE:-$SCRIPT_DIR/nginx/retrynote.conf}"
REMOTE_NGINX_TARGET="${REMOTE_NGINX_TARGET:-/tmp/retrynote.nginx.conf}"
BACKEND_HEALTHCHECK_URL="${BACKEND_HEALTHCHECK_URL:-http://127.0.0.1:8001/docs}"
FRONTEND_API_URL="${FRONTEND_API_URL:-https://retrynote.cloud/api}"
RETRIES="${DEPLOY_RETRIES:-15}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD)}"

SSH_TARGET="$DEPLOY_USER@$DEPLOY_HOST"

require_file() {
  [[ -f "$1" ]] || die "Missing file: $1"
}

ssh_run() {
  ssh -i "$SSH_PRIVATE_KEY" "$SSH_TARGET" "$1"
}

require_file "$REMOTE_NGINX_SOURCE"
require_file "$FRONTEND_DIR/package-lock.json"

log "Installing npm 11"
npm install -g npm@11

log "Building frontend"
(
  cd "$FRONTEND_DIR"
  npm ci
  VITE_API_URL="$FRONTEND_API_URL" npm run build
)

log "Setting up SSH"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keyscan -H "$DEPLOY_HOST" >> "$HOME/.ssh/known_hosts"

log "Deploying nginx config"
scp -i "$SSH_PRIVATE_KEY" "$REMOTE_NGINX_SOURCE" "$SSH_TARGET:$REMOTE_NGINX_TARGET"
ssh -i "$SSH_PRIVATE_KEY" "$SSH_TARGET" "sudo cp $REMOTE_NGINX_TARGET /etc/nginx/sites-enabled/retrynote && sudo nginx -t"

log "Deploying frontend"
ssh -i "$SSH_PRIVATE_KEY" "$SSH_TARGET" "sudo rm -rf $REMOTE_FRONTEND_DIST_DIR/* && sudo mkdir -p $REMOTE_FRONTEND_DIST_DIR"
rsync -az --delete -e "ssh -i $SSH_PRIVATE_KEY" --rsync-path="sudo rsync" "$FRONTEND_DIR/dist/" "$SSH_TARGET:$REMOTE_FRONTEND_DIST_DIR/"
ssh -i "$SSH_PRIVATE_KEY" "$SSH_TARGET" "sudo chown -R retrynote:retrynote $REMOTE_FRONTEND_DIST_DIR"

log "Deploying backend"
ssh -i "$SSH_PRIVATE_KEY" "$SSH_TARGET" <<EOF
set -e
APP_DIR=$REMOTE_APP_DIR

sudo -u retrynote git -C "\$APP_DIR" fetch origin
sudo -u retrynote git -C "\$APP_DIR" reset --hard origin/$DEPLOY_BRANCH
sudo -u retrynote "\$APP_DIR/backend/.venv/bin/pip" install -q -r "\$APP_DIR/backend/requirements.txt"
cd "\$APP_DIR/backend"
sudo -u retrynote PYTHONPATH="\$APP_DIR/backend" "\$APP_DIR/backend/.venv/bin/alembic" upgrade head
sudo systemctl restart retrynote-api retrynote-worker

count=$RETRIES
until curl -sf --max-time 5 "$BACKEND_HEALTHCHECK_URL" > /dev/null 2>&1; do
  count=$((count - 1))
  [ "$count" -eq 0 ] && echo "API start failed" && exit 1
  sleep 2
done

sudo systemctl reload nginx
EOF

log "Done"
