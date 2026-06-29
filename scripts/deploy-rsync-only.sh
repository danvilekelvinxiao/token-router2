#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER="${FLOWAPI_SERVER:-root@8.209.211.209}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"
SSH_ID="${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}"
SSH_E=(ssh)
[[ -f "${SSH_ID}" ]] && SSH_E+=(-i "${SSH_ID}")

rsync -az --delete \
  -e "${SSH_E[*]} ${SSH_OPTS}" \
  --exclude /node_modules \
  --exclude .git \
  --exclude .env.local \
  --exclude .env.production \
  --exclude .claude \
  --exclude .next/cache \
  ./ "${SERVER}:${APP_DIR}/"

"${SSH_E[@]}" ${SSH_OPTS} "${SERVER}" "
  set -e
  swapon /swapfile 2>/dev/null || true
  cd '${APP_DIR}'
  node scripts/verify-new-api-env.mjs .env.production
  export NODE_OPTIONS=--max-old-space-size=512
  npm install --omit=dev
  pm2 delete flowapi >/dev/null 2>&1 || true
  pm2 start npm --name flowapi --cwd '${APP_DIR}' -- start -- -p 3000
  pm2 save >/dev/null || true
  systemctl start nginx 2>/dev/null || true
  nginx -t && systemctl reload nginx
  sleep 5
  curl -fsS http://127.0.0.1:3000/api/health
"

curl -fsS -m 25 "https://flowapi.fun/api/health" && echo
echo DEPLOY_OK
