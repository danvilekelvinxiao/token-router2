#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${NEWAPI_DOMAIN:-newapi.flowapi.fun}"
NEWAPI_HOST="${NEWAPI_HOST:-127.0.0.1}"
NEWAPI_PORT="${NEWAPI_PORT:-3001}"
CONF="${NGINX_AVAILABLE:-/etc/nginx/sites-available/${DOMAIN}}"
ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled/${DOMAIN}}"
BACKUP_SUFFIX="$(date +%Y%m%d%H%M%S)"
PRIMARY_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
PRIMARY_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
FALLBACK_CERT="/etc/letsencrypt/live/flowapi.fun/fullchain.pem"
FALLBACK_KEY="/etc/letsencrypt/live/flowapi.fun/privkey.pem"
TLS_CERT="${NEWAPI_TLS_CERT:-}"
TLS_KEY="${NEWAPI_TLS_KEY:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[newapi-nginx] 请在服务器上以 root 执行。" >&2
  exit 1
fi

if ! ss -ltn | grep -q ":${NEWAPI_PORT}\\b"; then
  echo "[newapi-nginx] 未检测到 ${NEWAPI_HOST}:${NEWAPI_PORT} 正在监听。" >&2
  exit 1
fi

if [[ -z "${TLS_CERT}" || -z "${TLS_KEY}" ]]; then
  if [[ -f "${PRIMARY_CERT}" && -f "${PRIMARY_KEY}" ]]; then
    TLS_CERT="${PRIMARY_CERT}"
    TLS_KEY="${PRIMARY_KEY}"
  elif [[ -f "${FALLBACK_CERT}" && -f "${FALLBACK_KEY}" ]]; then
    TLS_CERT="${FALLBACK_CERT}"
    TLS_KEY="${FALLBACK_KEY}"
  fi
fi

if [[ -e "${CONF}" ]]; then
  cp -a "${CONF}" "${CONF}.bak.${BACKUP_SUFFIX}"
fi

cat > "${CONF}" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};
  client_max_body_size 100m;

  location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    default_type 'text/plain';
  }

  location / {
    proxy_pass http://${NEWAPI_HOST}:${NEWAPI_PORT};
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

if [[ -n "${TLS_CERT}" && -n "${TLS_KEY}" ]]; then
  cat >> "${CONF}" <<NGINX

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${DOMAIN};
  client_max_body_size 100m;

  ssl_certificate ${TLS_CERT};
  ssl_certificate_key ${TLS_KEY};

  location / {
    proxy_pass http://${NEWAPI_HOST}:${NEWAPI_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    add_header X-Accel-Buffering no always;
  }
}
NGINX
fi

ln -sfn "${CONF}" "${ENABLED}"
nginx -t
systemctl reload nginx

echo "[newapi-nginx] HTTP 已配置：${DOMAIN} -> http://${NEWAPI_HOST}:${NEWAPI_PORT}"
if [[ -n "${TLS_CERT}" && -n "${TLS_KEY}" ]]; then
  echo "[newapi-nginx] HTTPS 已配置：${DOMAIN} -> http://${NEWAPI_HOST}:${NEWAPI_PORT}，证书：${TLS_CERT}"
else
  echo "[newapi-nginx] 未找到 TLS 证书，仅配置 HTTP。DNS 指向本机后，可执行：certbot --nginx -d ${DOMAIN}"
fi
