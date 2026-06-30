#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER="${FLOWAPI_SERVER:-root@8.209.211.209}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"
SSH_ID="${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}"
DEPLOY_BRANCH="${FLOWAPI_DEPLOY_BRANCH:-$(git branch --show-current)}"
DEPLOY_COMMIT="${FLOWAPI_DEPLOY_COMMIT:-$(git rev-parse HEAD)}"
SSH_E=(ssh)
[[ -f "${SSH_ID}" ]] && SSH_E+=(-i "${SSH_ID}")

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
  echo "当前 commit 尚未存在于 origin/$DEPLOY_BRANCH。请先 push，再部署，避免服务器 git 状态与运行代码不一致。" >&2
  exit 1
fi

if ! "${SSH_E[@]}" ${SSH_OPTS} "${SERVER}" "echo ok" >/dev/null 2>/tmp/flowapi-ssh-test.log; then
  echo "SSH failed. Stop here and switch to Workbench." >&2
  cat /tmp/flowapi-ssh-test.log >&2
  echo "  FLOWAPI_DEPLOY_COMMIT=\"${DEPLOY_COMMIT}\" FLOWAPI_DEPLOY_BRANCH=\"${DEPLOY_BRANCH}\" npm run deploy:workbench" >&2
  exit 1
fi

rsync -az --delete \
  -e "${SSH_E[*]} ${SSH_OPTS}" \
  --exclude /node_modules \
  --exclude .git \
  --exclude .env.local \
  --exclude .env.production \
  --exclude .claude \
  --exclude .next/cache \
  ./ "${SERVER}:${APP_DIR}/"

"${SSH_E[@]}" ${SSH_OPTS} "${SERVER}" \
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

swapon /swapfile 2>/dev/null || true
cd "$APP_DIR"
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH" || git checkout -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
git reset --hard "$DEPLOY_COMMIT"
node scripts/verify-new-api-env.mjs .env.production
export NODE_OPTIONS=--max-old-space-size=512
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

echo DEPLOY_OK
