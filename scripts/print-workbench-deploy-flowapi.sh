#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"
PUBLIC_BASE="${FLOWAPI_PUBLIC_BASE_URL:-https://flowapi.fun}"
DEPLOY_BRANCH="${FLOWAPI_DEPLOY_BRANCH:-$(git branch --show-current)}"
DEPLOY_COMMIT="${FLOWAPI_DEPLOY_COMMIT:-$(git rev-parse HEAD)}"

if [ -z "$DEPLOY_BRANCH" ] || [ "$DEPLOY_BRANCH" = "HEAD" ]; then
  echo "无法确定部署分支，请先切到目标分支，或显式设置 FLOWAPI_DEPLOY_BRANCH。" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区存在未提交改动。请先 commit / push，再走 Workbench 部署，避免服务器 git 状态与运行代码不一致。" >&2
  exit 1
fi

git fetch origin "$DEPLOY_BRANCH" >/dev/null 2>&1 || true
if ! git merge-base --is-ancestor "$DEPLOY_COMMIT" "origin/$DEPLOY_BRANCH" 2>/dev/null; then
  echo "当前 commit 尚未存在于 origin/$DEPLOY_BRANCH。请先 push，再走 Workbench 部署，避免服务器 git 状态与运行代码不一致。" >&2
  exit 1
fi

cat <<EOF
# Open Alibaba Cloud Workbench on the FlowAPI server, then run:
FLOWAPI_DEPLOY_COMMIT="$DEPLOY_COMMIT" \\
FLOWAPI_DEPLOY_BRANCH="$DEPLOY_BRANCH" \\
FLOWAPI_APP_DIR="$APP_DIR" \\
FLOWAPI_PUBLIC_BASE_URL="$PUBLIC_BASE" \\
bash "$APP_DIR/scripts/workbench-deploy-flowapi.sh"
EOF
