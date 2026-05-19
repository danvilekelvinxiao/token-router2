#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@47.238.81.210}"
APP_DIR="${FLOWAPI_APP_DIR:-/var/www/flowapi}"

npm run build

rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .env.local \
  --exclude .env.production \
  --exclude .claude \
  ./ "$SERVER:$APP_DIR/"

ssh -o BatchMode=yes -o StrictHostKeyChecking=no "$SERVER" "
  set -e
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  cd '$APP_DIR'
  export NODE_OPTIONS=--max-old-space-size=768
  npm install

  if [ -d .next ]; then
    rm -rf .next.previous
    cp -a .next .next.previous
  fi

  if pm2 describe flowapi >/dev/null 2>&1; then
    pm2 stop flowapi >/dev/null || true
  fi

  if ! npm run build; then
    if [ -d .next.previous ]; then
      rm -rf .next
      mv .next.previous .next
    fi
    if pm2 describe flowapi >/dev/null 2>&1; then
      pm2 restart flowapi --update-env || true
    else
      pm2 start npm --name flowapi -- start -- -p 3000 || true
    fi
    echo 'Remote build failed; restored previous production build.'
    exit 1
  fi

  rm -rf .next.previous

  if pm2 describe flowapi >/dev/null 2>&1; then
    pm2 restart flowapi --update-env
  else
    pm2 start npm --name flowapi -- start -- -p 3000
  fi
  pm2 save >/dev/null
"
