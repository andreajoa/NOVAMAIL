#!/usr/bin/env bash
# Copies Caddy's certificate for POSTAL_HOST into Postal's config dir (owner uid 999, mode 600)
# and restarts the SMTP servers when it changed. Run by bootstrap and daily by cron.
set -euo pipefail
ROOT=/opt/novamail
set -a; . "$ROOT/.env"; set +a
SRC="$ROOT/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$POSTAL_HOST"
DST="$ROOT/postal/tls"
[ -f "$SRC/$POSTAL_HOST.crt" ] || { echo "no certificate yet"; exit 0; }
install -d -o 999 -g 999 -m 700 "$DST"
changed=0
for ext in crt key; do
  if ! cmp -s "$SRC/$POSTAL_HOST.$ext" "$DST/smtp.$ext"; then
    install -o 999 -g 999 -m 600 "$SRC/$POSTAL_HOST.$ext" "$DST/smtp.$ext"
    changed=1
  fi
done
if [ "$changed" = 1 ] && [ "${1:-}" != "--no-restart" ]; then
  cd "$ROOT/repo/infra/postal" && docker compose --env-file "$ROOT/.env" restart smtp smtp-submission >/dev/null
  echo "certificate updated, SMTP restarted"
else
  echo "certificate unchanged"
fi
