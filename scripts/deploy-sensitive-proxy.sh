#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_DIR="$ROOT/services/sensitive-proxy"
SERVER="${SENSITIVE_PROXY_SERVER:-${FLOWAPI_SERVER:-root@198.18.0.76}}"
APP_DIR="${SENSITIVE_PROXY_APP_DIR:-/opt/sensitive-proxy}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"

echo "==> sensitive-proxy deploy"
echo "service=$SERVICE_DIR"
echo "server=$SERVER"
echo "remote_app=$APP_DIR"

cd "$SERVICE_DIR"
npm test

ssh $SSH_OPTS "$SERVER" "mkdir -p '$APP_DIR'"
rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude .env.local \
  --exclude .env.production \
  --exclude coverage \
  ./ "$SERVER:$APP_DIR/"

ssh $SSH_OPTS "$SERVER" "
  set -e
  cd '$APP_DIR'
  npm install --omit=dev --no-audit --no-fund
  pm2 delete sensitive-proxy >/dev/null 2>&1 || true
  pm2 start src/index.js --name sensitive-proxy --cwd '$APP_DIR'
  pm2 save >/dev/null || true
  sleep 2
  curl -fsS http://127.0.0.1:8787/healthz >/dev/null
  curl -fsS http://127.0.0.1:8787/__upstream_health >/dev/null || true
"

echo "==> sensitive-proxy deploy complete"
