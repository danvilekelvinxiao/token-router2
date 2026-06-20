#!/usr/bin/env bash
# 在阿里云 Workbench 网页终端里粘贴运行（Mac 无法 SSH 时的应急）
set -euo pipefail
swapon /swapfile 2>/dev/null || (fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile)
APP=/var/www/flowapi
cd "$APP"
if [ ! -f .next/BUILD_ID ]; then
  echo "缺少 .next 构建！请在 Mac 终端运行: cd ~/token-router2 && bash scripts/一键部署.sh"
  exit 1
fi
export NODE_OPTIONS=--max-old-space-size=512
npm install --omit=dev
pm2 delete flowapi >/dev/null 2>&1 || true
NODE_OPTIONS="--dns-result-order=ipv4first ${NODE_OPTIONS:-}" pm2 start npm --name flowapi --cwd "$APP" -- start -- -p 3000
pm2 save >/dev/null || true
systemctl restart nginx
sleep 5
curl -sS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:8787/healthz >/dev/null || true
pm2 list
node scripts/check-public-page-assets.mjs "${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}" /admin/model-market /admin/image-models
