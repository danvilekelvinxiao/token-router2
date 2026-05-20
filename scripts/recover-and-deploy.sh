#!/usr/bin/env bash
# 先远程拉起 nginx/pm2，再本地构建并同步（避免 1GB 机上 build 导致 521）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Step 1/2: remote recover"
bash scripts/fix-flowapi-remote.sh

echo "==> Step 2/2: local build + deploy"
bash scripts/deploy-production-prebuilt.sh

echo "==> Done. Open https://flowapi.fun/guide"
