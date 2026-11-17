#!/usr/bin/env bash
# Publica os registros DNS do subdomínio de envio (mail.<marca>) de cada marca e verifica no NovaMail.
# Só ADICIONA registros em mail.<marca> e _dmarc.mail.<marca>: o SPF/DKIM do domínio principal
# (Resend/Brevo atuais) não é tocado.
#
#   bash scripts/publicar-dns-marcas.sh flownexa atenza      # zonas que os tokens locais alcançam
#   CF_TOKEN=… bash scripts/publicar-dns-marcas.sh amb        # outra conta Cloudflare: passe um token com DNS:Edit
set -euo pipefail
cd "$(dirname "$0")/.."
M="$HOME/.config/novamail/marcas"
API=https://api.novamail.nexaclouds.online
zone_of() {
  case "$1" in
    gilberto) echo gilberto-souza.com ;; amb) echo ambboutique.online ;; atenza) echo atenza.online ;;
    trilha) echo concursotrilhaaprova.online ;; flownexa) echo flownex.online ;; nexacloud) echo nexaclouds.online ;;
    *) echo "" ;;
  esac
}

for slug in "$@"; do
  zone=$(zone_of "$slug"); [ -n "$zone" ] || { echo "marca desconhecida: $slug"; continue; }
  tok=${CF_TOKEN:-$(tr -d '[:space:]' < "$HOME/.config/nexacloud/domains-flownex-token")}
  [ "$slug" = nexacloud ] && tok=$(cat "$HOME/.config/novamail/cloudflare-dns-token")
  zid=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=$zone" -H "Authorization: Bearer $tok" | python3 -c 'import sys,json;r=json.load(sys.stdin).get("result") or [];print(r[0]["id"] if r else "")')
  [ -n "$zid" ] || { echo "✗ $slug: token não enxerga a zona $zone (passe CF_TOKEN=… com DNS:Edit)"; continue; }
  echo "== $slug ($zone)"
  CLOUDFLARE_API_TOKEN=$tok CLOUDFLARE_ZONE_ID=$zid node scripts/publish-domain-dns.mjs "$M/$slug-domain.json"
  key=$(python3 -c "import json;print(json.load(open('$M/$slug.json'))['api_key'])")
  did=$(python3 -c "import json;print(json.load(open('$M/$slug-domain.json'))['id'])")
  for _ in $(seq 1 12); do
    st=$(curl -s -X POST "$API/domains/$did/verify" -H "authorization: Bearer $key" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status"))')
    [ "$st" = verified ] && break; sleep 10
  done
  echo "   mail.$zone: $st"
done
