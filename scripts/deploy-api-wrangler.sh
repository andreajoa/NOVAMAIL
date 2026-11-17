#!/usr/bin/env bash
# Publica a API usando o login OAuth do wrangler deste Mac (até existir um token de CI com D1).
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
CONF="$HOME/.config/novamail"
NODE="ubuntu@18.218.5.60"

# Database = SQLite Durable Object (free plan); it migrates itself on first request.

echo "▶ segredos"
TOK=$(ssh -i "$CONF/node.pem" "$NODE" "sudo grep ^NOVAMAIL_ADMIN_TOKEN= /opt/novamail/.env | cut -d= -f2" </dev/null)
python3 - "$CONF" "$TOK" > "$CONF/.worker-secrets.json" <<'PY'
import json, sys, pathlib
c = pathlib.Path(sys.argv[1])
print(json.dumps({
  "ENCRYPTION_KEY": (c / "encryption-key").read_text().strip(),
  "OWNER_TOKEN": (c / "owner-token").read_text().strip(),
  "POSTAL_ADMIN_TOKEN": sys.argv[2].strip(),
  "POSTAL_WEBHOOK_PUBLIC_KEY": (c / "signing.pub").read_text(),
  # Stripe publishable key (public by design) for the embedded Checkout.
  **({"STRIPE_PUBLISHABLE_KEY": json.load(open(sp))["STRIPE_PUBLISHABLE_KEY"]} if (sp := pathlib.Path.home() / ".config/nexacloud/stripe-live.json").exists() else {}),
  # Temporary platform-mail bridge until outbound port 25 opens (delete the file to stop using it).
  **({"SYSTEM_RESEND_KEY": p.read_text().strip()} if (p := pathlib.Path.home() / ".config/nexacloud/resend-key").exists() and not (c / "port25-open").exists() else {}),
}))
PY
chmod 600 "$CONF/.worker-secrets.json"

echo "▶ build do painel"
(cd ../web && pnpm run build >/dev/null)

echo "▶ deploy"
npx wrangler deploy </dev/null
npx wrangler secret bulk "$CONF/.worker-secrets.json" </dev/null
rm -f "$CONF/.worker-secrets.json"

echo "▶ saúde"
for _ in $(seq 1 30); do
  code=$(curl -s -o /tmp/nm-health -w '%{http_code}' https://api.novamail.nexaclouds.online/health || true)
  [ "$code" = 200 ] && grep -q "\"version\"" /tmp/nm-health && { cat /tmp/nm-health; echo; echo "✓ API no ar"; exit 0; }
  sleep 5
done
echo "✗ /health não respondeu 200"; exit 1
