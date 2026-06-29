#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${CHECK_CX_DOMAIN:-check-cx.flowapi.fun}"
FLOWAPI_HOST="${FLOWAPI_HOST:-127.0.0.1}"
FLOWAPI_PORT="${FLOWAPI_PORT:-3000}"
NGINX_AVAILABLE="${NGINX_AVAILABLE:-/etc/nginx/sites-available}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}"
SITE_FILE="${NGINX_AVAILABLE}/${DOMAIN}.conf"
TLS_CERT="${CHECK_CX_TLS_CERT:-/etc/letsencrypt/live/${DOMAIN}/fullchain.pem}"
TLS_KEY="${CHECK_CX_TLS_KEY:-/etc/letsencrypt/live/${DOMAIN}/privkey.pem}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 运行：sudo CHECK_CX_DOMAIN=${DOMAIN} FLOWAPI_PORT=${FLOWAPI_PORT} bash $0" >&2
  exit 1
fi

mkdir -p "${NGINX_AVAILABLE}" "${NGINX_ENABLED}" "${ACME_ROOT}"

cat > "${SITE_FILE}" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};
  client_max_body_size 50m;

  location /.well-known/acme-challenge/ {
    root ${ACME_ROOT};
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}
NGINX

if [[ -f "${TLS_CERT}" && -f "${TLS_KEY}" ]]; then
  cat >> "${SITE_FILE}" <<NGINX

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${DOMAIN};
  client_max_body_size 50m;

  ssl_certificate ${TLS_CERT};
  ssl_certificate_key ${TLS_KEY};

  location = / {
    proxy_pass http://${FLOWAPI_HOST}:${FLOWAPI_PORT}/pool-status;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
    add_header X-Accel-Buffering no always;
  }

  location / {
    proxy_pass http://${FLOWAPI_HOST}:${FLOWAPI_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
    add_header X-Accel-Buffering no always;
  }
}
NGINX
else
  echo "未找到 ${DOMAIN} 证书，仅写入 HTTP/ACME 配置。签发证书后重新运行本脚本即可启用 HTTPS。"
fi

ln -sfn "${SITE_FILE}" "${NGINX_ENABLED}/${DOMAIN}.conf"
nginx -t
systemctl reload nginx

echo "check-cx Nginx 配置完成：${SITE_FILE}"
echo "注意：DNS 必须指向真实公网入口，不能指向 198.18.0.0/15 保留测试网段。"
