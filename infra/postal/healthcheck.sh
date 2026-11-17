#!/usr/bin/env bash
# Every 10 min (cron): restarts dead Postal services and checks the IP against
# the main DNS blocklists. Writes /opt/novamail/health.json for the status page.
set -uo pipefail
ROOT=/opt/novamail
set -a; . "$ROOT/.env"; set +a
cd "$ROOT/repo/infra/postal"
DC="docker compose --env-file $ROOT/.env"

down=()
for s in mariadb web worker smtp smtp-submission admin caddy; do
  state=$($DC ps --format '{{.Service}} {{.State}}' | awk -v s="$s" '$1==s{print $2}')
  if [ "$state" != "running" ]; then down+=("$s"); $DC up -d "$s" >/dev/null 2>&1; fi
done

ip=$(curl -4 -fsS --max-time 5 https://api.ipify.org || echo "")
listed=()
if [ -n "$ip" ]; then
  rev=$(echo "$ip" | awk -F. '{print $4"."$3"."$2"."$1}')
  for bl in zen.spamhaus.org b.barracudacentral.org bl.spamcop.net psbl.surriel.com; do
    ans=$(dig +short +time=3 +tries=1 "$rev.$bl" A 2>/dev/null | head -1)
    # 127.255.255.x means "query refused" (public resolver), not a listing.
    if [[ "$ans" =~ ^127\. ]] && [[ ! "$ans" =~ ^127\.255\.255\. ]]; then listed+=("$bl"); fi
  done
fi

queue=$(docker exec novamail-mariadb-1 mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM postal.queued_messages" 2>/dev/null || echo -1)

jq -n --arg t "$(date -u +%FT%TZ)" --arg ip "$ip" --argjson q "${queue:-0}" \
  --argjson down "$(printf '%s\n' "${down[@]:-}" | jq -R . | jq -s 'map(select(.!=""))')" \
  --argjson listed "$(printf '%s\n' "${listed[@]:-}" | jq -R . | jq -s 'map(select(.!=""))')" \
  '{checked_at:$t, ip:$ip, restarted:$down, blocklisted:$listed, queued_messages:$q}' > "$ROOT/health.json"
cat "$ROOT/health.json"
