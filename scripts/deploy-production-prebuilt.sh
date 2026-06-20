#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@198.18.0.76}"
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
  --exclude public/generated-images \
  ./ "$SERVER:$APP_DIR/"

if [ "${FLOWAPI_SYNC_NODE_MODULES:-0}" = "1" ]; then
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
  FLOWAPI_REQUIRE_DATABASE=\"\${FLOWAPI_REQUIRE_DATABASE:-true}\" node scripts/verify-new-api-env.mjs .env.production
  if [ \"${FLOWAPI_SKIP_REMOTE_MIGRATIONS:-0}\" != \"1\" ]; then
    FLOWAPI_REQUIRE_DATABASE=\"\${FLOWAPI_REQUIRE_DATABASE:-true}\" node scripts/run-production-migrations.mjs
  else
    echo \"==> 4b. Skip remote migrations (pre-applied locally)\"
  fi
  export NODE_OPTIONS=--max-old-space-size=512
  npm install --omit=dev --no-audit --no-fund
  pm2 delete flowapi >/dev/null 2>&1 || true
  PORT_PIDS=\"\$(ss -ltnp 'sport = :3000' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)\"
  if [ -n \"\$PORT_PIDS\" ]; then
    kill \$PORT_PIDS 2>/dev/null || true
    sleep 1
  fi
  NODE_OPTIONS="--dns-result-order=ipv4first ${NODE_OPTIONS:-}" pm2 start npm --name flowapi --cwd "$APP_DIR" -- start -- -p 3000
  pm2 save >/dev/null
  systemctl start nginx 2>/dev/null || true
  nginx -t && systemctl reload nginx
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -fsS -m 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1 || curl -fsS -m 5 http://127.0.0.1:3000 >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
"

echo "==> Public health check"
curl -fsS -m 20 "https://flowapi.fun/api/health" && echo

echo "==> Public asset check"
node scripts/check-public-page-assets.mjs "${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}" /admin/model-market /admin/image-models
