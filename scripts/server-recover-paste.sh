#!/usr/bin/env bash
# 在阿里云 Workbench 网页终端里粘贴运行（Mac 无法 SSH 时的应急）
set -euo pipefail

APP="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
PORT="${FLOWAPI_PORT:-3000}"

swapon /swapfile 2>/dev/null || (fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile)
cd "$APP"

if [ ! -d .git ]; then
  echo "缺少 .git checkout！请先在 Workbench 执行标准部署脚本恢复服务器 git 状态。" >&2
  exit 1
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "缺少 .next 构建！请在 Workbench 执行标准部署脚本重新构建。" >&2
  exit 1
fi

DEPLOY_COMMIT="$(git rev-parse HEAD)"
DEPLOY_BRANCH="$(git branch --show-current || true)"
if [ -z "$DEPLOY_BRANCH" ] || [ "$DEPLOY_BRANCH" = "HEAD" ]; then
  DEPLOY_BRANCH="${FLOWAPI_DEPLOY_BRANCH:-}"
fi

export NODE_OPTIONS=--max-old-space-size=512
npm install --omit=dev --no-audit --no-fund
pm2 delete flowapi >/dev/null 2>&1 || true
PORT_PIDS="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill $PORT_PIDS 2>/dev/null || true
  sleep 1
fi
FLOWAPI_DEPLOY_COMMIT="$DEPLOY_COMMIT" \
FLOWAPI_DEPLOY_BRANCH="$DEPLOY_BRANCH" \
pm2 start node_modules/next/dist/bin/next --cwd "$APP" --name flowapi -- start -p "$PORT"
pm2 save >/dev/null || true
systemctl restart nginx
sleep 5
node scripts/verify-flowapi-deploy.mjs "$DEPLOY_COMMIT" "$DEPLOY_BRANCH" "http://127.0.0.1:${PORT}" "$PUBLIC_BASE"
pm2 list
node scripts/check-public-page-assets.mjs "$PUBLIC_BASE" /admin/model-market /admin/image-models
