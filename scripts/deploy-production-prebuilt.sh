#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@47.238.81.210}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"

npm run lint
npm run build

rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  --exclude /node_modules \
  --exclude .git \
  --exclude .env.local \
  --exclude .env.production \
  --exclude .claude \
  --exclude .next/cache \
  ./ "$SERVER:$APP_DIR/"

ssh $SSH_OPTS "$SERVER" "
  set -e
  cd '$APP_DIR'
  npm install --omit=dev
  if pm2 describe flowapi >/dev/null 2>&1; then
    pm2 restart flowapi --update-env
  else
    pm2 start npm --name flowapi -- start -- -p 3000
  fi
  pm2 save >/dev/null
  sleep 2
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null || curl -fsS http://127.0.0.1:3000 >/dev/null
"
