#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@8.209.211.209}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"
SSH_ID="${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}"
SSH_CMD=(ssh)
if [[ -f "${SSH_ID}" ]]; then
  SSH_CMD+=(-i "${SSH_ID}")
fi

echo "==> Testing SSH to ${SERVER} ..."
if ! "${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" "echo ok" 2>/tmp/flowapi-ssh-test.log; then
  echo "SSH failed. Log:"
  cat /tmp/flowapi-ssh-test.log
  echo ""
  echo "522 常见原因：阿里云 ECS 已关机、安全组未放行 22/80/443、或 IP 已变。"
  echo "请登录阿里云控制台确认实例 8.209.211.209 为「运行中」，安全组放行 TCP 22/80/443。"
  exit 1
fi

echo "==> Connecting to ${SERVER} for repair ..."

"${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" bash -s <<'REMOTE'
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
cd /var/www/flowapi

if [ ! -d .next ]; then
  echo "ERROR: missing .next build. Run on Mac: cd token-router2 && npm run deploy"
  exit 1
fi

pm2 delete flowapi >/dev/null 2>&1 || true
pm2 start npm --name flowapi --cwd /var/www/flowapi -- start -- -p 3000
pm2 save >/dev/null || true
sleep 5

echo "=== Local app health ==="
if ! curl -fsS -m 15 http://127.0.0.1:3000/api/health && echo; then
  echo "WARN: app health failed, pm2 logs:"
  pm2 logs flowapi --lines 60 --nostream || true
  exit 1
fi

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

echo "=== Done on server ==="
REMOTE

echo "==> Public check https://flowapi.fun/api/health"
sleep 2
curl -fsS -m 20 "https://flowapi.fun/api/health" && echo
echo "==> Public admin asset check"
node scripts/check-public-page-assets.mjs "${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}" /admin/model-market /admin/image-models
echo "==> Fix script finished OK"
