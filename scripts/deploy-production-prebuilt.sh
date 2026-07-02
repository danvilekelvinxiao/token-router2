#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SERVER="${FLOWAPI_SERVER:-root@8.209.211.209}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"
SSH_ID="${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}"
DEPLOY_BRANCH="${FLOWAPI_DEPLOY_BRANCH:-$(git branch --show-current)}"
DEPLOY_COMMIT="${FLOWAPI_DEPLOY_COMMIT:-$(git rev-parse HEAD)}"
SSH_CMD=(ssh)
if [[ -f "${SSH_ID}" ]]; then
  SSH_CMD+=(-i "${SSH_ID}")
fi

print_workbench_fallback() {
  echo "SSH unavailable. Stop here and switch to Alibaba Cloud Workbench." >&2
  echo "Run this locally to print the exact paste-ready command:" >&2
  echo "  FLOWAPI_DEPLOY_COMMIT=\"${DEPLOY_COMMIT}\" FLOWAPI_DEPLOY_BRANCH=\"${DEPLOY_BRANCH}\" npm run deploy:workbench" >&2
}

if [ -z "$DEPLOY_BRANCH" ] || [ "$DEPLOY_BRANCH" = "HEAD" ]; then
  echo "无法确定部署分支，请先切到目标分支，或显式设置 FLOWAPI_DEPLOY_BRANCH。" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区存在未提交改动。请先 commit / push，再部署，避免服务器 git 状态与运行代码不一致。" >&2
  exit 1
fi

git fetch origin "$DEPLOY_BRANCH" >/dev/null 2>&1 || true
if ! git merge-base --is-ancestor "$DEPLOY_COMMIT" "origin/$DEPLOY_BRANCH" 2>/dev/null; then
  echo "当前 commit 尚未存在于 origin/${DEPLOY_BRANCH}。请先 push，再部署，避免服务器 git 状态与运行代码不一致。" >&2
  exit 1
fi

echo "==> Testing SSH to ${SERVER} ..."
if ! "${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" "echo ok" >/dev/null 2>/tmp/flowapi-ssh-test.log; then
  echo "SSH failed. Log:" >&2
  cat /tmp/flowapi-ssh-test.log >&2
  print_workbench_fallback
  exit 1
fi

# 本地构建，避免在 1GB 服务器上 build 导致整机卡死、521
npm run lint -- --max-warnings 10
npm run build

rsync -az --delete \
  -e "${SSH_CMD[*]} ${SSH_OPTS}" \
  --exclude /node_modules \
  --exclude .git \
  --exclude .env.local \
  --exclude .env.production \
  --exclude .claude \
  --exclude .omx \
  --exclude .playwright-cli \
  --exclude backups \
  --exclude reports \
  --exclude outputs \
  --exclude services \
  --exclude .next/cache \
  --exclude public/generated-images \
  ./ "${SERVER}:${APP_DIR}/"

if [ "${FLOWAPI_SYNC_NODE_MODULES:-0}" = "1" ]; then
  rsync -az --delete \
    -e "${SSH_CMD[*]} ${SSH_OPTS}" \
    ./node_modules/ "${SERVER}:${APP_DIR}/node_modules/"
fi

"${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" \
  APP_DIR="${APP_DIR}" \
  DEPLOY_COMMIT="${DEPLOY_COMMIT}" \
  DEPLOY_BRANCH="${DEPLOY_BRANCH}" \
  PUBLIC_BASE="${PUBLIC_BASE}" \
  bash -s <<'REMOTE'
set -euo pipefail

if [ ! -d "$APP_DIR/.git" ]; then
  echo "FlowAPI app git directory not found: $APP_DIR" >&2
  exit 1
fi

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon /swapfile 2>/dev/null || true
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

cd "$APP_DIR"
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH" || git checkout -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
git reset --hard "$DEPLOY_COMMIT"

FLOWAPI_REQUIRE_DATABASE="${FLOWAPI_REQUIRE_DATABASE:-true}" node scripts/run-production-migrations.mjs
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
npm install --omit=dev --no-audit --no-fund
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
systemctl start nginx 2>/dev/null || true
nginx -t && systemctl reload nginx
sleep 3
node scripts/verify-flowapi-deploy.mjs "$DEPLOY_COMMIT" "$DEPLOY_BRANCH" "http://127.0.0.1:3000" "$PUBLIC_BASE"
REMOTE

echo "==> Public asset check"
node scripts/check-public-page-assets.mjs "$PUBLIC_BASE" /admin/model-market /admin/image-models
