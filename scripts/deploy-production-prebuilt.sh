#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@47.238.81.210}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"

# 本地构建，避免在 1GB 服务器上 build 导致整机卡死、521
npm run lint -- --max-warnings 10
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

if [ "${FLOWAPI_SYNC_NODE_MODULES:-1}" = "1" ]; then
  rsync -az --delete \
    -e "ssh $SSH_OPTS" \
    ./node_modules/ "$SERVER:$APP_DIR/node_modules/"
fi

ssh $SSH_OPTS "$SERVER" "
  set -e
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  cd '$APP_DIR'
  export NODE_OPTIONS=--max-old-space-size=512
  if [ ! -x node_modules/.bin/next ]; then
    npm install --omit=dev --no-audit --no-fund
  fi
  if pm2 describe flowapi >/dev/null 2>&1; then
    pm2 restart flowapi --update-env
  else
    pm2 start npm --name flowapi -- start -- -p 3000
  fi
  pm2 save >/dev/null
  systemctl start nginx 2>/dev/null || true
  nginx -t && systemctl reload nginx
  sleep 2
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null || curl -fsS http://127.0.0.1:3000 >/dev/null
"

echo "==> Public health check"
curl -fsS -m 20 "https://flowapi.fun/api/health" && echo
