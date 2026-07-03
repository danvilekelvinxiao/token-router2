#!/usr/bin/env bash
# Run this inside Alibaba Cloud Workbench when local SSH is unavailable.
set -euo pipefail

APP="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
BRANCH="${FLOWAPI_DEPLOY_BRANCH:-feature/model-access-cms-redesign-20260527}"
COMMIT="${FLOWAPI_DEPLOY_COMMIT:-}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
SUDO=""
[ "$(id -u)" = "0" ] || SUDO="sudo"

load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 1

  local tmp
  tmp="$(mktemp)"
  node - "$file" <<'NODE' > "$tmp"
const fs = require("fs");
const file = process.argv[2];

function quote(value) {
  return JSON.stringify(String(value));
}

for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  if (!key) continue;
  let value = line.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.stdout.write(`export ${key}=${quote(value)}\n`);
}
NODE
  # shellcheck disable=SC1090
  . "$tmp"
  rm -f "$tmp"
}

if [ -f "$APP/.env.production" ]; then
  load_env_file "$APP/.env.production"
elif [ -f "$APP/.env.local" ]; then
  load_env_file "$APP/.env.local"
fi

echo "==> FlowAPI Workbench deploy"
echo "app=$APP"
echo "branch=$BRANCH"
echo "commit=${COMMIT:-origin/$BRANCH}"
echo "public=$PUBLIC_BASE"

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
git fetch origin "$BRANCH"
git checkout "$BRANCH" || git checkout -B "$BRANCH" "origin/$BRANCH"
if [ -n "$COMMIT" ]; then
  git reset --hard "$COMMIT"
else
  git reset --hard "origin/$BRANCH"
fi

echo "==> 4. Install dependencies and migrate database"
npm install --no-audit --no-fund
if [ -f .env.production ]; then
  node scripts/verify-new-api-env.mjs .env.production
elif [ -f .env.local ]; then
  node scripts/verify-new-api-env.mjs .env.local
else
  echo "WARN: missing .env.production and .env.local, skipping env verification and database migrations for now."
fi
FLOWAPI_REQUIRE_DATABASE=true node scripts/run-production-migrations.mjs

echo "==> 5. Build production bundle"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
npm run build

echo "==> 6. Restart app"
PORT_PIDS="$(ss -ltnp 'sport = :3000' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill $PORT_PIDS 2>/dev/null || true
  sleep 2
fi
pm2 delete flowapi >/dev/null 2>&1 || true
PORT_PIDS="$(ss -ltnp 'sport = :3000' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill -9 $PORT_PIDS 2>/dev/null || true
  sleep 1
fi
pm2 start scripts/flowapi-pm2-ecosystem.cjs --only flowapi
pm2 save >/dev/null || true

echo "==> 7. Reload nginx"
$SUDO nginx -t
$SUDO systemctl reload nginx

echo "==> 8. Local health"
sleep 2
curl -fsS http://127.0.0.1:3000/api/health && echo

if [ "${FLOWAPI_SYNC_AICARDS_ON_DEPLOY:-false}" = "true" ]; then
  echo "==> 9. Sync and publish AICards backup models"
  FLOWAPI_PUBLIC_BASE_URL="http://127.0.0.1:3000" node scripts/aicards-sync-publish.mjs
else
  echo "==> 9. Skip AICards auto-sync (set FLOWAPI_SYNC_AICARDS_ON_DEPLOY=true to enable)"
fi

echo "==> 10. FlowAPI public branding scan"
node scripts/scan-public-branding.mjs "$PUBLIC_BASE"

echo "==> 11. Deployed commit"
git rev-parse HEAD
echo "FlowAPI deploy complete: $PUBLIC_BASE"
