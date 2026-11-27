#!/usr/bin/env bash
# Liga a cobrança do NovaMail no Stripe (conta CoreUnit, modo live). Idempotente.
# Planos só pagos (aprovados por André em 26/11/2026; anual = pague 10, leve 12):
#   Starter US$12/mês·US$120/ano (10.000 e-mails) · Pro US$25/mês·US$250/ano (30.000)
#   Scale US$79/mês·US$790/ano (100.000) · pacote +10.000 e-mails US$10/mês·US$100/ano.
# Arquiva os preços antigos (Pro 15 / Scale 60 / +50k / IP dedicado), cria o webhook
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
  [ -n "$id" ] || id=$(S /products --data-urlencode "name=$1" -d "metadata[app]=novamail" | jqpy 'd["id"]')
  echo "$id"
}
price_for() { # lookup_key amount product_name interval
  local id; id=$(S "/prices?lookup_keys[]=$1&active=true" -G | jqpy 'd["data"][0]["id"] if d.get("data") else ""')
  if [ -z "$id" ]; then
    id=$(S /prices -d product="$(product_for "$3")" -d unit_amount="$2" -d currency=usd -d "recurring[interval]=$4" -d lookup_key="$1" | jqpy 'd["id"]')
  fi
  echo "$id"
}
STARTER=$(price_for novamail_starter_monthly_v2 1200 "NovaMail Starter" month)
STARTER_Y=$(price_for novamail_starter_yearly_v2 12000 "NovaMail Starter" year)
PRO=$(price_for novamail_pro_monthly_v2 2500 "NovaMail Pro" month)
PRO_Y=$(price_for novamail_pro_yearly_v2 25000 "NovaMail Pro" year)
SCALE=$(price_for novamail_scale_monthly_v2 7900 "NovaMail Scale" month)
SCALE_Y=$(price_for novamail_scale_yearly_v2 79000 "NovaMail Scale" year)
EXTRA=$(price_for novamail_extra_monthly_v2 1000 "NovaMail +10,000 emails/month" month)
EXTRA_Y=$(price_for novamail_extra_yearly_v2 10000 "NovaMail +10,000 emails/month" year)
echo "starter=$STARTER/$STARTER_Y pro=$PRO/$PRO_Y scale=$SCALE/$SCALE_Y extra=$EXTRA/$EXTRA_Y"

# Old prices: archived (reversible in the Stripe dashboard). Checked 26/11/2026: no subscriptions use them.
for k in novamail_pro_monthly novamail_scale_monthly novamail_pro_yearly novamail_scale_yearly novamail_extra_monthly novamail_extra_yearly novamail_dedicated_ip_monthly novamail_dedicated_ip_yearly; do
  old=$(S "/prices?lookup_keys[]=$k&active=true" -G | jqpy 'd["data"][0]["id"] if d.get("data") else ""')
  [ -n "$old" ] && S "/prices/$old" -d active=false >/dev/null && echo "archived $k"
done

URL=https://api.novamail.nexaclouds.online/hooks/stripe
WH=$(S /webhook_endpoints -G -d limit=100 | python3 -c "import sys,json;print(next((w['id'] for w in json.load(sys.stdin)['data'] if w['url']=='$URL'),''))")
if [ -z "$WH" ] || [ ! -s "$CONF/stripe-webhook-secret" ]; then
  [ -n "$WH" ] && S "/webhook_endpoints/$WH" -X DELETE >/dev/null
  umask 077
  S /webhook_endpoints -d url="$URL" -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=customer.subscription.updated" -d "enabled_events[]=customer.subscription.deleted" -d "description=NovaMail plans" \
    | jqpy 'd["secret"]' > "$CONF/stripe-webhook-secret"
fi
echo "webhook ok"

python3 - "$SK" "$(cat "$CONF/stripe-webhook-secret")" "$STARTER" "$STARTER_Y" "$PRO" "$PRO_Y" "$SCALE" "$SCALE_Y" "$EXTRA" "$EXTRA_Y" > "$CONF/.stripe-secrets.json" <<'PY'
import json, sys
k = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_STARTER_YEAR", "STRIPE_PRICE_PRO", "STRIPE_PRICE_PRO_YEAR", "STRIPE_PRICE_SCALE", "STRIPE_PRICE_SCALE_YEAR", "STRIPE_PRICE_EXTRA", "STRIPE_PRICE_EXTRA_YEAR"]
print(json.dumps(dict(zip(k, sys.argv[1:]))))
PY
chmod 600 "$CONF/.stripe-secrets.json"
npx wrangler secret bulk "$CONF/.stripe-secrets.json" </dev/null | grep -E "created|error" || true
# The dedicated IP add-on is not offered on Amazon SES: drop its price secrets.
for k in STRIPE_PRICE_DEDICATED_IP STRIPE_PRICE_DEDICATED_IP_YEAR; do echo y | npx wrangler secret delete "$k" >/dev/null 2>&1 || true; done
rm -f "$CONF/.stripe-secrets.json"
echo "✓ cobrança ligada: https://app.novamail.nexaclouds.online/plan"
