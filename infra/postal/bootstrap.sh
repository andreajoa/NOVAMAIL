#!/usr/bin/env bash
# Bootstraps a NovaMail sending node on a fresh Ubuntu 24.04 VM.
# Idempotent: safe to re-run. Used as cloud-init user-data or over SSH by CI.
#
#   curl -fsSL https://raw.githubusercontent.com/andreajoa/NOVAMAIL/main/infra/postal/bootstrap.sh \
#     | sudo MAIL_DOMAIN=novamail.nexaclouds.online bash
#
# Requirements on the provider side (cannot be done from inside the VM):
#   * outbound TCP 25 allowed, and a reverse DNS (PTR) of the public IP = postal.$MAIL_DOMAIN
#   * inbound 25, 80, 443, 587 open
set -euo pipefail

: "${MAIL_DOMAIN:?MAIL_DOMAIN is required (e.g. novamail.nexaclouds.online)}"
REPO_URL="${REPO_URL:-https://github.com/andreajoa/NOVAMAIL.git}"
REPO_REF="${REPO_REF:-main}"
ROOT=/opt/novamail
POSTAL_HOST="postal.${MAIL_DOMAIN}"

log() { printf '\033[1;34m[novamail]\033[0m %s\n' "$*"; }

log "packages"
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git gettext-base ufw fail2ban unattended-upgrades jq openssl
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

log "swap (Postal + MariaDB on small VMs)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "hostname ${POSTAL_HOST}"
hostnamectl set-hostname "${POSTAL_HOST}"

log "firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in 22 25 80 443 587; do ufw allow "${p}/tcp" >/dev/null; done
ufw --force enable >/dev/null

log "repository"
mkdir -p "$ROOT"/{postal,mariadb,caddy}
if [ -d "$ROOT/repo/.git" ]; then
  git -C "$ROOT/repo" fetch -q origin "$REPO_REF" && git -C "$ROOT/repo" reset -q --hard "origin/$REPO_REF"
else
  git clone -q --branch "$REPO_REF" "$REPO_URL" "$ROOT/repo"
fi

log "secrets (generated once, kept in $ROOT/.env, mode 600)"
if [ ! -f "$ROOT/.env" ]; then
  umask 077
  cat > "$ROOT/.env" <<EOF
MAIL_DOMAIN=${MAIL_DOMAIN}
POSTAL_HOST=${POSTAL_HOST}
POSTAL_VERSION=3.4.0
MARIADB_ROOT_PASSWORD=$(openssl rand -hex 24)
RAILS_SECRET_KEY=$(openssl rand -hex 64)
NOVAMAIL_ADMIN_TOKEN=$(openssl rand -hex 32)
EOF
fi
set -a; . "$ROOT/.env"; set +a

log "postal config"
envsubst < "$ROOT/repo/infra/postal/postal.yml.tmpl" > "$ROOT/postal/postal.yml"
chmod 640 "$ROOT/postal/postal.yml"
[ -f "$ROOT/postal/signing.key" ] || openssl genrsa -out "$ROOT/postal/signing.key" 2048 2>/dev/null
openssl rsa -in "$ROOT/postal/signing.key" -pubout -out "$ROOT/postal/signing.pub" 2>/dev/null
# Postal runs as uid 999 inside the image.
chown -R 999:999 "$ROOT/postal"

cd "$ROOT/repo/infra/postal"
DC="docker compose --env-file $ROOT/.env"

log "database"
$DC up -d mariadb
$DC run --rm runner postal initialize
$DC run --rm runner postal upgrade 2>/dev/null || true

log "caddy first (obtains the TLS certificate Postal's SMTP reuses)"
$DC up -d caddy
for _ in $(seq 1 60); do
  [ -f "$ROOT/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${POSTAL_HOST}/${POSTAL_HOST}.crt" ] && break
  sleep 5
done
chmod -R o+rX "$ROOT/caddy/caddy/certificates" 2>/dev/null || true

log "postal"
$DC up -d web worker smtp smtp-submission admin
$DC ps

# Restart SMTP weekly so renewed certificates are picked up.
cat > /etc/cron.d/novamail <<EOF
17 4 * * 1 root cd $ROOT/repo/infra/postal && $DC restart smtp smtp-submission >/dev/null 2>&1
*/10 * * * * root $ROOT/repo/infra/postal/healthcheck.sh >> /var/log/novamail-health.log 2>&1
EOF

log "done"
PUBLIC_IP=$(curl -4 -fsS https://api.ipify.org || true)
cat <<EOF

==========================================================================
 NovaMail node is up on ${PUBLIC_IP:-<public ip>}.
 Values the control plane needs (store them as GitHub/Cloudflare secrets):
   POSTAL_ADMIN_TOKEN        -> sudo grep NOVAMAIL_ADMIN_TOKEN $ROOT/.env
   POSTAL_WEBHOOK_PUBLIC_KEY -> sudo cat $ROOT/postal/signing.pub
 DNS records for ${MAIL_DOMAIN}: run the "DNS" GitHub workflow with SERVER_IP=${PUBLIC_IP}
 Reverse DNS (PTR) of ${PUBLIC_IP} must be ${POSTAL_HOST} (set at the provider).
==========================================================================
EOF
