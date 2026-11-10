#!/usr/bin/env bash
# One-time setup of Tajweed Flashcards on the Vultr server (nginx + Let's Encrypt).
# Run with:  sudo bash setup-server.sh [domain]
# Safe to re-run. It only adds its own nginx site and leaves the other sites alone.
set -euo pipefail

DOMAIN="${1:-tajweed.hifzapp.link}"
REPO="https://github.com/erina-digitables/tajweed-flashcards.git"
DIR="/var/www/tajweed-flashcards"
SITE="/etc/nginx/sites-available/tajweed-flashcards"
OWNER="${SUDO_USER:-dawr}"
SERVER_IP="$(curl -4 -s --max-time 5 https://api.ipify.org || true)"

[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo."; exit 1; }

echo "==> Getting the app from GitHub into $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$DIR"
fi
# Owned by the deploy user so updates (git pull) don't need sudo.
chown -R "$OWNER:$OWNER" "$DIR"

echo "==> Writing nginx site for $DOMAIN"
if [ ! -f "$SITE" ]; then
  cat > "$SITE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    root $DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Don't serve repo internals or the import tooling.
    location ~ /\.(git|github) { deny all; }
    location ^~ /tools/  { deny all; }
    location ^~ /deploy/ { deny all; }

    location ~* \.(css|js)$ {
        expires 1h;
    }
}
EOF
else
  echo "    (site file already exists; leaving it as is)"
fi
ln -sf "$SITE" /etc/nginx/sites-enabled/tajweed-flashcards

nginx -t
systemctl reload nginx
echo "    nginx reloaded."

echo "==> HTTPS certificate"
RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ "$RESOLVED" != "$SERVER_IP" ]; then
  echo "    $DOMAIN points to '${RESOLVED:-nothing}', not this server ($SERVER_IP)."
  echo "    Add the Cloudflare A record (DNS only), wait a minute, then re-run this script."
  exit 2
fi
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --keep-until-expiring

echo
echo "Done: https://$DOMAIN"
