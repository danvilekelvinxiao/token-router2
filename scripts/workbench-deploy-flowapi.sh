#!/usr/bin/env bash
# Run this inside Alibaba Cloud Workbench when local SSH is unavailable.
set -euo pipefail

APP="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
BRANCH="${FLOWAPI_DEPLOY_BRANCH:-feature/model-access-cms-redesign-20260527}"
COMMIT="${FLOWAPI_DEPLOY_COMMIT:-}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
PORT="${FLOWAPI_PORT:-3000}"
SUDO=""
[ "$(id -u)" = "0" ] || SUDO="sudo"

TARGET_BRANCH="$BRANCH"
TARGET_COMMIT="$COMMIT"

echo "==> FlowAPI Workbench deploy"
echo "app=$APP"
echo "branch=$TARGET_BRANCH"
echo "commit=${TARGET_COMMIT:-origin/$TARGET_BRANCH}"
echo "public=$PUBLIC_BASE"

if [ ! -d "$APP/.git" ]; then
  echo "FlowAPI app git directory not found: $APP" >&2
  exit 1
fi

echo "==> 1. Prepare swap"
if ! swapon --show | grep -q "/swapfile"; then
  if [ ! -f /swapfile ]; then
    $SUDO fallocate -l 2G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile
  fi
  $SUDO swapon /swapfile || true
fi

echo "==> 2. Backup current app"
mkdir -p "$HOME/flowapi-backups"
if [ -d "$APP" ]; then
  tar --exclude node_modules --exclude .next/cache --exclude public/generated-images \
    -czf "$HOME/flowapi-backups/flowapi-pre-deploy-$(date +%Y%m%d%H%M%S).tgz" \
    -C "$APP" .
else
  echo "Missing app directory: $APP" >&2
  exit 1
fi

echo "==> 3. Pull GitHub branch"
cd "$APP"
git stash push -u -m "pre-workbench-deploy-$(date -Iseconds)" || true
git fetch origin "$TARGET_BRANCH"
git checkout "$TARGET_BRANCH" || git checkout -B "$TARGET_BRANCH" "origin/$TARGET_BRANCH"
if [ -n "$TARGET_COMMIT" ]; then
  git reset --hard "$TARGET_COMMIT"
else
  git reset --hard "origin/$TARGET_BRANCH"
fi
TARGET_COMMIT="$(git rev-parse HEAD)"
TARGET_BRANCH="$(git branch --show-current || true)"
if [ -z "$TARGET_BRANCH" ] || [ "$TARGET_BRANCH" = "HEAD" ]; then
  TARGET_BRANCH="$BRANCH"
fi

echo "==> 4. Install dependencies and migrate database"
npm install --no-audit --no-fund
node scripts/verify-new-api-env.mjs .env.production
FLOWAPI_REQUIRE_DATABASE=true node scripts/run-production-migrations.mjs

echo "==> 5. Build production bundle"
$SUDO rm -rf .next .turbo node_modules/.cache 2>/dev/null || true
$SUDO mkdir -p .next node_modules/.cache
$SUDO chown -R "$(id -un):$(id -gn)" .next node_modules/.cache
FLOWAPI_DEPLOY_COMMIT="$TARGET_COMMIT" \
FLOWAPI_DEPLOY_BRANCH="$TARGET_BRANCH" \
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}" \
npx next build --webpack

echo "==> 6. Restart app"
pm2 delete flowapi >/dev/null 2>&1 || true
PORT_PIDS="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill $PORT_PIDS 2>/dev/null || true
  sleep 1
fi
FLOWAPI_DEPLOY_COMMIT="$TARGET_COMMIT" \
FLOWAPI_DEPLOY_BRANCH="$TARGET_BRANCH" \
pm2 start node_modules/next/dist/bin/next --cwd "$APP" --name flowapi -- start -p "$PORT"
pm2 save >/dev/null || true

echo "==> 7. Reload nginx"
$SUDO nginx -t
$SUDO systemctl reload nginx

echo "==> 8. Verify deployed runtime"
sleep 3
node scripts/verify-flowapi-deploy.mjs "$TARGET_COMMIT" "$TARGET_BRANCH" "http://127.0.0.1:${PORT}" "$PUBLIC_BASE"

if [ "${FLOWAPI_SYNC_AICARDS_ON_DEPLOY:-false}" = "true" ]; then
  echo "==> 9. Sync and publish AICards backup models"
  FLOWAPI_PUBLIC_BASE_URL="http://127.0.0.1:${PORT}" node scripts/aicards-sync-publish.mjs
else
  echo "==> 9. Skip AICards auto-sync (set FLOWAPI_SYNC_AICARDS_ON_DEPLOY=true to enable)"
fi

echo "==> 10. FlowAPI public branding scan"
node scripts/scan-public-branding.mjs "$PUBLIC_BASE"

echo "==> 11. Deployed commit"
echo "$TARGET_COMMIT"
echo "FlowAPI deploy complete: $PUBLIC_BASE"
