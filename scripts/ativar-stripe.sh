#!/usr/bin/env bash
# Liga a cobrança do NovaMail no Stripe (conta CoreUnit, modo live). Idempotente.
# Cria (ou reaproveita) os produtos/preços Pro US$15/mês e Scale US$60/mês, o webhook
# https://api.novamail.nexaclouds.online/hooks/stripe e grava os segredos no Worker.
# Custo fixo: zero — o Stripe só cobra taxa por pagamento recebido.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
SK=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.config/nexacloud/stripe-live.json")))["STRIPE_SECRET_KEY"])')
CONF="$HOME/.config/novamail"
S() { curl -sS -u "$SK:" "https://api.stripe.com/v1$1" "${@:2}"; }
jqpy() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

price_for() { # lookup_key amount name
  local id; id=$(S "/prices?lookup_keys[]=$1&active=true" -G | jqpy 'd["data"][0]["id"] if d.get("data") else ""')
  if [ -z "$id" ]; then
    local prod; prod=$(S /products -d "name=$3" -d "metadata[app]=novamail" | jqpy 'd["id"]')
    id=$(S /prices -d product="$prod" -d unit_amount="$2" -d currency=usd -d "recurring[interval]=month" -d lookup_key="$1" | jqpy 'd["id"]')
  fi
  echo "$id"
}
PRO=$(price_for novamail_pro_monthly 1500 "NovaMail Pro")
SCALE=$(price_for novamail_scale_monthly 6000 "NovaMail Scale")
echo "pro=$PRO scale=$SCALE"

URL=https://api.novamail.nexaclouds.online/hooks/stripe
WH=$(S /webhook_endpoints -G -d limit=100 | python3 -c "import sys,json;print(next((w['id'] for w in json.load(sys.stdin)['data'] if w['url']=='$URL'),''))")
if [ -z "$WH" ] || [ ! -s "$CONF/stripe-webhook-secret" ]; then
  [ -n "$WH" ] && S "/webhook_endpoints/$WH" -X DELETE >/dev/null
  umask 077
  S /webhook_endpoints -d url="$URL" -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=customer.subscription.updated" -d "enabled_events[]=customer.subscription.deleted" -d "description=NovaMail plans" \
    | jqpy 'd["secret"]' > "$CONF/stripe-webhook-secret"
fi
echo "webhook ok"

python3 - "$SK" "$(cat "$CONF/stripe-webhook-secret")" "$PRO" "$SCALE" > "$CONF/.stripe-secrets.json" <<'PY'
import json, sys
print(json.dumps({"STRIPE_SECRET_KEY": sys.argv[1], "STRIPE_WEBHOOK_SECRET": sys.argv[2], "STRIPE_PRICE_PRO": sys.argv[3], "STRIPE_PRICE_SCALE": sys.argv[4]}))
PY
chmod 600 "$CONF/.stripe-secrets.json"
npx wrangler secret bulk "$CONF/.stripe-secrets.json" </dev/null | grep -E "created|error" || true
rm -f "$CONF/.stripe-secrets.json"
echo "✓ cobrança ligada: https://app.novamail.nexaclouds.online/plan"
