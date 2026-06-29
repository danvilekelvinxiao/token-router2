#!/usr/bin/env bash
set -euo pipefail

PINCC_DOMAIN="${PINCC_DOMAIN:-pincc.flowapi.fun}"
SUB2API_HOST="${SUB2API_HOST:-127.0.0.1}"
SUB2API_PORT="${SUB2API_PORT:-8787}"
CERT_DIR="${CERT_DIR:-/etc/letsencrypt/live/${PINCC_DOMAIN}}"
NGINX_AVAILABLE="${NGINX_AVAILABLE:-/etc/nginx/sites-available/${PINCC_DOMAIN}}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled/${PINCC_DOMAIN}}"
BACKUP_SUFFIX="$(date +%Y%m%d%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[pincc-nginx] 请在服务器上以 root 执行。" >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "[pincc-nginx] nginx 未安装或不在 PATH。" >&2
  exit 1
fi

if ! ss -ltn | grep -q ":${SUB2API_PORT}\\b"; then
  echo "[pincc-nginx] 未检测到 ${SUB2API_HOST}:${SUB2API_PORT} 正在监听。" >&2
  echo "[pincc-nginx] 请先确认 sub2api 实际端口；如不是 8787，可用 SUB2API_PORT=xxxx 重新执行。" >&2
  exit 1
fi

if [[ ! -f "${CERT_DIR}/fullchain.pem" || ! -f "${CERT_DIR}/privkey.pem" ]]; then
  echo "[pincc-nginx] 未找到 ${PINCC_DOMAIN} 证书：${CERT_DIR}" >&2
  exit 1
fi

if [[ -e "${NGINX_AVAILABLE}" ]]; then
  cp -a "${NGINX_AVAILABLE}" "${NGINX_AVAILABLE}.bak.${BACKUP_SUFFIX}"
fi
if [[ -L "${NGINX_ENABLED}" || -f "${NGINX_ENABLED}" ]]; then
  cp -aL "${NGINX_ENABLED}" "${NGINX_ENABLED}.bak.${BACKUP_SUFFIX}" || true
fi

cat > "${NGINX_AVAILABLE}" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${PINCC_DOMAIN};

  location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    default_type 'text/plain';
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${PINCC_DOMAIN};
  client_max_body_size 100m;

  ssl_certificate ${CERT_DIR}/fullchain.pem;
  ssl_certificate_key ${CERT_DIR}/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  location / {
    proxy_pass http://${SUB2API_HOST}:${SUB2API_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    add_header X-Accel-Buffering no always;
  }
}
NGINX

ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
nginx -t
systemctl reload nginx

echo "[pincc-nginx] 已恢复 ${PINCC_DOMAIN} -> http://${SUB2API_HOST}:${SUB2API_PORT}"
echo "[pincc-nginx] 旧配置备份后缀：.bak.${BACKUP_SUFFIX}"
