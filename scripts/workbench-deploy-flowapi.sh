#!/usr/bin/env bash
# Run this inside Alibaba Cloud Workbench when local SSH is unavailable.
set -euo pipefail

APP="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
BRANCH="${FLOWAPI_DEPLOY_BRANCH:-feature/model-access-cms-redesign-20260527}"
COMMIT="${FLOWAPI_DEPLOY_COMMIT:-}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
SUDO=""
[ "$(id -u)" = "0" ] || SUDO="sudo"

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
FLOWAPI_REQUIRE_DATABASE=true node scripts/run-production-migrations.mjs

echo "==> 5. Build production bundle"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
npm run build

echo "==> 6. Restart app"
pm2 delete flowapi >/dev/null 2>&1 || true
PORT_PIDS="$(ss -ltnp 'sport = :3000' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill $PORT_PIDS 2>/dev/null || true
  sleep 1
fi
pm2 start node_modules/next/dist/bin/next --name flowapi -- start -p 3000
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

echo "==> 10. Public FlowAPI branding scan"
node - <<'NODE'
const base = process.env.FLOWAPI_PUBLIC_BASE_URL || "https://flowapi.fun";
const paths = [
  "/api/health",
  "/api/models/market",
  "/api/models/api-key-options",
  "/api/image/models",
  "/api/market-models",
  "/api/analytics/openrouter-top-models",
  "/api/market/model-rank",
];
const leakRe = /(aicards|aicards\.shop|uniapi|aheapi|new api|new-api|newapi|sub2api|actual_model|provider_key|base_url|api_key|bearer|authorization|sk-|cr_|上游|供应商|供货商)/i;
const badProviderRe = /^(?!FlowAPI$).+/;
let failed = false;
for (const path of paths) {
  const response = await fetch(base + path, { headers: { accept: "application/json" } });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  const rows = Array.isArray(payload.models) ? payload.models : Array.isArray(payload.data) ? payload.data : [];
  const providers = [...new Set(rows.map((item) => item.provider || item.providerName).filter(Boolean))];
  const imageCount = rows.filter((item) => String(item.category || item.primaryButtonHref || "").includes("image") || item.primaryButtonHref === "/images").length;
  const leaked = leakRe.test(text);
  const badProviders = providers.filter((provider) => badProviderRe.test(provider));
  const result = { path, status: response.status, count: rows.length, imageCount, providers, leaked, badProviders };
  console.log(JSON.stringify(result));
  if (!response.ok || leaked || badProviders.length) failed = true;
  if (path === "/api/models/market" && imageCount < 1) failed = true;
}
if (failed) {
  console.error("FlowAPI public branding scan failed.");
  process.exit(1);
}
NODE

echo "==> 11. Deployed commit"
git rev-parse HEAD
echo "FlowAPI deploy complete: $PUBLIC_BASE"
