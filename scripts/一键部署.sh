#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> lint + build"
npm run lint -- --max-warnings 10
npm run build
echo "==> pack"
tar czf /tmp/flowapi-deploy.tgz --exclude node_modules --exclude .git --exclude .claude .
echo "==> upload + install on server"
scp -o ConnectTimeout=30 -i "${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}" /tmp/flowapi-deploy.tgz root@8.209.211.209:/tmp/
ssh -o ConnectTimeout=30 -i "${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}" root@8.209.211.209 bash -s <<'REMOTE'
set -e
swapon /swapfile 2>/dev/null || true
APP=/var/www/flowapi
mkdir -p "$APP"
tar xzf /tmp/flowapi-deploy.tgz -C "$APP"
cd "$APP"
export NODE_OPTIONS=--max-old-space-size=512
npm install --omit=dev
pm2 delete flowapi >/dev/null 2>&1 || true
pm2 start npm --name flowapi --cwd "$APP" -- start -- -p 3000
pm2 save >/dev/null || true
systemctl restart nginx
sleep 5
curl -fsS http://127.0.0.1:3000/api/health
REMOTE
curl -fsS https://flowapi.fun/api/health && echo
echo "部署完成: https://flowapi.fun/guide"
