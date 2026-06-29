#!/usr/bin/env bash
# Run inside Alibaba Cloud Workbench on the FlowAPI server.
# Purpose: deploy the exact GitHub commit, sync AICards backup models, and
# prove public FlowAPI branding before claiming production is ready.
set -euo pipefail

APP="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
BRANCH="${FLOWAPI_DEPLOY_BRANCH:-feature/model-access-cms-redesign-20260527}"
COMMIT="${FLOWAPI_DEPLOY_COMMIT:-}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
PORT="${FLOWAPI_PORT:-3000}"
SUDO=""
[ "$(id -u)" = "0" ] || SUDO="sudo"

mask_env() {
  local key="$1"
  if grep -q "^${key}=" .env.production 2>/dev/null; then
    echo "${key}=***MASKED***"
  else
    echo "${key}=MISSING"
  fi
}

require_env() {
  local key="$1"
  if ! grep -q "^${key}=.\+" .env.production 2>/dev/null; then
    echo "Missing required .env.production value: ${key}" >&2
    exit 2
  fi
}

echo "==> 0. Context"
whoami
hostname
echo "app=${APP}"
echo "branch=${BRANCH}"
echo "commit=${COMMIT:-origin/${BRANCH}}"
echo "public=${PUBLIC_BASE}"

if [ ! -d "$APP/.git" ]; then
  echo "FlowAPI app git directory not found: ${APP}" >&2
  exit 2
fi

cd "$APP"

echo "==> 1. Deploy exact GitHub commit"
git fetch origin "$BRANCH"
git checkout "$BRANCH" || git checkout -B "$BRANCH" "origin/$BRANCH"
if [ -n "$COMMIT" ]; then
  git reset --hard "$COMMIT"
else
  git reset --hard "origin/$BRANCH"
fi
DEPLOYED_COMMIT="$(git rev-parse HEAD)"
echo "deployed_commit=${DEPLOYED_COMMIT}"
if [ -n "$COMMIT" ] && [ "$DEPLOYED_COMMIT" != "$COMMIT" ]; then
  echo "Commit mismatch after reset." >&2
  exit 2
fi

echo "==> 2. Ensure production environment guardrails"
touch .env.production
if ! grep -q '^AICARDS_API_BASE_URL=' .env.production; then
  echo 'AICARDS_API_BASE_URL=https://aicards.shop' >> .env.production
fi
for line in \
  'FLOWAPI_AICARDS_ALLOW_ESTIMATED_COST=true' \
  'FLOWAPI_AICARDS_ESTIMATED_COST_MULTIPLIER=1.6' \
  'FLOWAPI_AICARDS_AUTO_PRICE=true' \
  'FLOWAPI_AICARDS_AUTO_HEALTH_CHECK=true' \
  'FLOWAPI_AICARDS_PER_MODEL_HEALTH_CHECK=false' \
  'FLOWAPI_AICARDS_INCLUDE_IMAGES=false' \
  'FLOWAPI_AICARDS_SYNC_MAX_COUNT=999'
do
  key="${line%%=*}"
  if grep -q "^${key}=" .env.production; then
    $SUDO sed -i "s|^${key}=.*|${line}|" .env.production
  else
    echo "$line" >> .env.production
  fi
done
require_env "AICARDS_API_BASE_URL"
require_env "AICARDS_API_KEY"
mask_env "AICARDS_API_BASE_URL"
mask_env "AICARDS_API_KEY"
mask_env "NEW_API_BASE_URL"
mask_env "NEW_API_KEY"
mask_env "NEW_API_ADMIN_TOKEN"

echo "==> 3. Install, migrate, build"
npm install --no-audit --no-fund
FLOWAPI_REQUIRE_DATABASE=true node scripts/run-production-migrations.mjs
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}" npm run build

echo "==> 4. Restart PM2 and nginx"
pm2 delete flowapi >/dev/null 2>&1 || true
PORT_PIDS="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
if [ -n "$PORT_PIDS" ]; then
  kill $PORT_PIDS 2>/dev/null || true
  sleep 1
fi
pm2 start node_modules/next/dist/bin/next --name flowapi -- start -p "$PORT"
pm2 save >/dev/null || true
$SUDO nginx -t
$SUDO systemctl reload nginx || $SUDO service nginx reload || true

echo "==> 5. Local runtime proof"
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/api/health" && echo
curl -fsS "http://127.0.0.1:${PORT}/api/deploy-info" && echo
curl -fsS "http://127.0.0.1:${PORT}/api/models/market" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s);const rows=j.models||j.data||[];console.log(JSON.stringify({count:rows.length,providers:[...new Set(rows.map(x=>x.provider||x.providerName).filter(Boolean))],imageCount:rows.filter(x=>String(x.category||x.primaryButtonHref||"").includes("image")||x.primaryButtonHref==="/images").length},null,2));})'

echo "==> 6. Sync and publish AICards backup models"
FLOWAPI_PUBLIC_BASE_URL="http://127.0.0.1:${PORT}" node scripts/aicards-sync-publish.mjs

echo "==> 7. Public FlowAPI branding proof"
FLOWAPI_PUBLIC_SCAN_ATTEMPTS=5 node scripts/scan-public-branding.mjs "$PUBLIC_BASE"

echo "==> 8. Final production proof"
echo "commit=$(git rev-parse HEAD)"
pm2 list
echo "FlowAPI production deploy and branding verification complete."
