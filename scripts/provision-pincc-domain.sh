#!/usr/bin/env bash
set -euo pipefail

SERVER="${FLOWAPI_SERVER:-root@47.238.81.210}"
SSH_OPTS="${FLOWAPI_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no}"
SSH_ID="${FLOWAPI_SSH_ID:-$HOME/.ssh/id_ed25519}"
SSH_CMD=(ssh)
if [[ -f "${SSH_ID}" ]]; then
  SSH_CMD+=(-i "${SSH_ID}")
fi

DOMAIN="${PINCC_DOMAIN:-pincc.flowapi.fun}"
UPSTREAM="${PINCC_UPSTREAM:-http://127.0.0.1:8080}"
WEBROOT="${PINCC_WEBROOT:-/var/www/certbot}"
EMAIL="${PINCC_EMAIL:-${FLOWAPI_ADMIN_EMAIL:-xiaoyijie@flowapi.fun}}"

echo "==> Provision ${DOMAIN} on ${SERVER}"

"${SSH_CMD[@]}" ${SSH_OPTS} "${SERVER}" bash -s -- "${DOMAIN}" "${UPSTREAM}" "${WEBROOT}" "${EMAIL}" <<'REMOTE'
set -euo pipefail

DOMAIN="$1"
UPSTREAM="$2"
WEBROOT="$3"
EMAIL="$4"
CONF="/etc/nginx/conf.d/${DOMAIN}.conf"

mkdir -p "$WEBROOT"

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx not installed" >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  apt update
  apt install -y certbot python3-certbot-nginx
fi

write_http_only_conf() {
  cat > "$CONF" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  location ^~ /.well-known/acme-challenge/ {
    root ${WEBROOT};
    default_type "text/plain";
    allow all;
  }

  location / {
    proxy_pass ${UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto http;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port 80;
    proxy_read_timeout 300;
    proxy_send_timeout 300;
  }
}
EOF
}

write_full_conf() {
  cat > "$CONF" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  location ^~ /.well-known/acme-challenge/ {
    root ${WEBROOT};
    default_type "text/plain";
    allow all;
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${DOMAIN};

  ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;

  location / {
    proxy_pass ${UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port 443;
    proxy_read_timeout 300;
    proxy_send_timeout 300;
  }
}
EOF
}

write_http_only_conf
nginx -t
systemctl reload nginx

certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect

write_full_conf
nginx -t
systemctl reload nginx

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable certbot.timer >/dev/null 2>&1 || true
fi

echo "==> Verify HTTP redirect"
curl -I --max-time 15 "http://${DOMAIN}" | sed -n '1,8p'

echo "==> Verify HTTPS cert"
curl -I --max-time 15 "https://${DOMAIN}" | sed -n '1,8p'
printf '' | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates -ext subjectAltName

echo "OK: https://${DOMAIN}"
REMOTE
