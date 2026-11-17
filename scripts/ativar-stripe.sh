#!/usr/bin/env bash
# Liga a cobrança do NovaMail no Stripe (conta CoreUnit, modo live). Idempotente.
# Cria (ou reaproveita) Pro US$15/mês·US$150/ano, Scale US$60/mês·US$600/ano, pacote +50k e-mails
# US$10/mês·US$100/ano (oferecido dentro do Checkout), o webhook
# https://api.novamail.nexaclouds.online/hooks/stripe e grava os segredos no Worker.
# Custo fixo: zero — o Stripe só cobra taxa por pagamento recebido.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
SK=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.config/nexacloud/stripe-live.json")))["STRIPE_SECRET_KEY"])')
CONF="$HOME/.config/novamail"
S() { curl -sS -u "$SK:" "https://api.stripe.com/v1$1" "${@:2}"; }
jqpy() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

product_for() { # name -> product id (reuses the product of an existing price when possible)
  local id; id=$(S "/products/search" -G --data-urlencode "query=name:'$1' AND metadata['app']:'novamail'" | jqpy 'd["data"][0]["id"] if d.get("data") else ""')
  [ -n "$id" ] || id=$(S /products -d "name=$1" -d "metadata[app]=novamail" | jqpy 'd["id"]')
  echo "$id"
}
price_for() { # lookup_key amount product_name interval
  local id; id=$(S "/prices?lookup_keys[]=$1&active=true" -G | jqpy 'd["data"][0]["id"] if d.get("data") else ""')
  if [ -z "$id" ]; then
    id=$(S /prices -d product="$(product_for "$3")" -d unit_amount="$2" -d currency=usd -d "recurring[interval]=$4" -d lookup_key="$1" | jqpy 'd["id"]')
  fi
  echo "$id"
}
PRO=$(price_for novamail_pro_monthly 1500 "NovaMail Pro" month)
SCALE=$(price_for novamail_scale_monthly 6000 "NovaMail Scale" month)
PRO_Y=$(price_for novamail_pro_yearly 15000 "NovaMail Pro" year)        # 2 months free
SCALE_Y=$(price_for novamail_scale_yearly 60000 "NovaMail Scale" year)  # 2 months free
EXTRA=$(price_for novamail_extra_monthly 1000 "NovaMail +50,000 emails/month" month)
EXTRA_Y=$(price_for novamail_extra_yearly 10000 "NovaMail +50,000 emails/month" year)
echo "pro=$PRO scale=$SCALE pro_y=$PRO_Y scale_y=$SCALE_Y extra=$EXTRA extra_y=$EXTRA_Y"

URL=https://api.novamail.nexaclouds.online/hooks/stripe
WH=$(S /webhook_endpoints -G -d limit=100 | python3 -c "import sys,json;print(next((w['id'] for w in json.load(sys.stdin)['data'] if w['url']=='$URL'),''))")
if [ -z "$WH" ] || [ ! -s "$CONF/stripe-webhook-secret" ]; then
  [ -n "$WH" ] && S "/webhook_endpoints/$WH" -X DELETE >/dev/null
  umask 077
  S /webhook_endpoints -d url="$URL" -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=customer.subscription.updated" -d "enabled_events[]=customer.subscription.deleted" -d "description=NovaMail plans" \
    | jqpy 'd["secret"]' > "$CONF/stripe-webhook-secret"
fi
echo "webhook ok"

python3 - "$SK" "$(cat "$CONF/stripe-webhook-secret")" "$PRO" "$SCALE" "$PRO_Y" "$SCALE_Y" "$EXTRA" "$EXTRA_Y" > "$CONF/.stripe-secrets.json" <<'PY'
import json, sys
k = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_SCALE", "STRIPE_PRICE_PRO_YEAR", "STRIPE_PRICE_SCALE_YEAR", "STRIPE_PRICE_EXTRA", "STRIPE_PRICE_EXTRA_YEAR"]
print(json.dumps(dict(zip(k, sys.argv[1:]))))
PY
chmod 600 "$CONF/.stripe-secrets.json"
npx wrangler secret bulk "$CONF/.stripe-secrets.json" </dev/null | grep -E "created|error" || true
rm -f "$CONF/.stripe-secrets.json"
echo "✓ cobrança ligada: https://app.novamail.nexaclouds.online/plan"
