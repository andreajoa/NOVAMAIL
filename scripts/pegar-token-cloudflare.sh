#!/usr/bin/env bash
# Espera você copiar (Cmd+C) o token da Cloudflare e salva em ~/.config/novamail/cloudflare-token.
# O token nunca aparece na tela nem no chat.
set -euo pipefail
OUT="$HOME/.config/novamail/cloudflare-token"
before=$(pbpaste 2>/dev/null | shasum | cut -c1-12)
echo "Agora copie o token na página da Cloudflare (botão Copy). Esperando até 5 minutos…"
for _ in $(seq 1 150); do
  v=$(pbpaste 2>/dev/null | tr -d '[:space:]')
  if [ "$(printf '%s' "$v" | shasum | cut -c1-12)" != "$before" ] && [[ "$v" =~ ^[A-Za-z0-9_-]{40,}$ ]]; then
    umask 077; printf '%s' "$v" > "$OUT"
    ok=$(curl -s https://api.cloudflare.com/client/v4/user/tokens/verify -H "Authorization: Bearer $v" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("success"))')
    printf '' | pbcopy
    if [ "$ok" = "True" ]; then echo "✓ token válido salvo (área de transferência limpa)"; exit 0; fi
    echo "✗ copiei algo com cara de token, mas a Cloudflare recusou. Confira e rode de novo."; rm -f "$OUT"; exit 1
  fi
  sleep 2
done
echo "✗ nada copiado em 5 minutos"; exit 1
