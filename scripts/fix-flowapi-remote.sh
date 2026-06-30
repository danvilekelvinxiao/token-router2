#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@8.209.211.209}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"
SSH_ID="${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}"
SSH_CMD=(ssh)
if [[ -f "${SSH_ID}" ]]; then
  SSH_CMD+=(-i "${SSH_ID}")
fi

print_workbench_fallback() {
  echo "SSH unavailable. Do not keep debugging over SSH." >&2
  echo "Switch to Alibaba Cloud Workbench and print the exact command with:" >&2
  echo "  npm run deploy:workbench" >&2
}

echo "==> Testing SSH to ${SERVER} ..."
if ! "${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" "echo ok" 2>/tmp/flowapi-ssh-test.log; then
  echo "SSH failed. Log:" >&2
  cat /tmp/flowapi-ssh-test.log >&2
  print_workbench_fallback
  exit 1
fi

echo "==> Connecting to ${SERVER} for repair ..."

"${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" APP_DIR="${APP_DIR}" PUBLIC_BASE="${PUBLIC_BASE}" bash -s <<'REMOTE'
set -euo pipefail

echo "=== System ==="
uptime
df -h / | tail -1
free -h | head -2

echo "=== Listen ports (80/443/3000) ==="
ss -lntp 2>/dev/null | grep -E ':80|:443|:3000' || netstat -lntp 2>/dev/null | grep -E ':80|:443|:3000' || true

echo "=== Ensure swap ==="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon /swapfile 2>/dev/null || true
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

echo "=== Restart flowapi (pm2) ==="
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "ERROR: missing .git checkout in $APP_DIR. Use Workbench deploy to restore the repo state." >&2
  exit 1
fi

if [ ! -d .next ]; then
  echo "ERROR: missing .next build. Use Workbench deploy to rebuild FlowAPI." >&2
  exit 1
fi

DEPLOY_COMMIT="$(git rev-parse HEAD)"
DEPLOY_BRANCH="$(git branch --show-current || true)"
if [ -z "$DEPLOY_BRANCH" ] || [ "$DEPLOY_BRANCH" = "HEAD" ]; then
  DEPLOY_BRANCH="${FLOWAPI_DEPLOY_BRANCH:-}"
fi

pm2 delete flowapi >/dev/null 2>&1 || true
PORT_PIDS="$(ss -ltnp 'sport = :3000' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill $PORT_PIDS 2>/dev/null || true
  sleep 1
fi
FLOWAPI_DEPLOY_COMMIT="$DEPLOY_COMMIT" \
FLOWAPI_DEPLOY_BRANCH="$DEPLOY_BRANCH" \
pm2 start node_modules/next/dist/bin/next --cwd "$APP_DIR" --name flowapi -- start -p 3000
pm2 save >/dev/null || true
sleep 5

echo "=== Nginx ==="
if ! systemctl is-active --quiet nginx; then
  systemctl start nginx || systemctl restart nginx
fi
nginx -t
systemctl enable nginx 2>/dev/null || true
systemctl reload nginx

echo "=== Firewall (ufw) ==="
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw status || true
fi

echo "=== SSL renew (if needed) ==="
if command -v certbot >/dev/null 2>&1; then
  certbot renew --quiet || certbot renew || true
  systemctl reload nginx || true
fi

echo "=== Origin HTTPS probe ==="
curl -kfsS -m 10 https://127.0.0.1/api/health -H "Host: flowapi.fun" && echo || echo "WARN: local HTTPS probe failed"

echo "=== Runtime verification ==="
node scripts/verify-flowapi-deploy.mjs "$DEPLOY_COMMIT" "$DEPLOY_BRANCH" "http://127.0.0.1:3000" "$PUBLIC_BASE"
REMOTE

echo "==> Public admin asset check"
node scripts/check-public-page-assets.mjs "$PUBLIC_BASE" /admin/model-market /admin/image-models
echo "==> Fix script finished OK"
