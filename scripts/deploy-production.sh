#!/usr/bin/env bash
# 1GB 轻量服务器上远程 npm run build 会 OOM 并 pm2 stop，导致 521/522。
# 请始终使用本地构建再同步：npm run deploy:prebuilt
set -euo pipefail

echo "ERROR: 请勿在 1GB 轻量机上远程构建。" >&2
echo "请改用: npm run deploy:prebuilt" >&2
exit 1
