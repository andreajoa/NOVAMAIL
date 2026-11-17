#!/usr/bin/env bash
# Adds (or releases) one sending IP for a NovaMail pool. Idempotent per pool.
#
#   bash scripts/ip-pool.sh shared                       # Free tier gets its own IP (do it at the 1st paying customer)
#   bash scripts/ip-pool.sh trusted                      # paying customers get their own IP
#   bash scripts/ip-pool.sh ded_xxxx acc_XXXX            # customer bought a dedicated IP (the e-mail you got has this line)
#   bash scripts/ip-pool.sh --release ded_xxxx           # customer cancelled: stop paying for the IP
#
# What it does: Elastic IP (~US$3.60/month while it exists) → second private IP on the node
# → DNS A record ip-<pool>.novamail… → reverse DNS (PTR) → SPF of spf.novamail… → binds the IP
# on the host → creates the Postal pool → moves the accounts (dedicated: starts the warm-up).
set -euo pipefail
CONF="$HOME/.config/novamail"
source "$CONF/node.env"   # INSTANCE_ID ALLOCATION_ID IP REGION
AWS="${AWS_BIN:-aws} --region $REGION"
MAIL_DOMAIN="novamail.nexaclouds.online"
CF_ZONE_ID="161ada99658a35b6ae5b1cff61e69503"
CF_TOKEN=$(cat "$CONF/cloudflare-dns-token")
API="https://api.novamail.nexaclouds.online"
OWN=$(cat "$CONF/owner-token")
SSH="ssh -i $CONF/node.pem -o StrictHostKeyChecking=accept-new ubuntu@$IP"
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
py() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
cf() { curl -sS -H "authorization: Bearer $CF_TOKEN" -H 'content-type: application/json' "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID$1" "${@:2}"; }

RELEASE=0
[ "${1:-}" = "--release" ] && { RELEASE=1; shift; }
POOL="${1:?pool name: shared | trusted | ded_xxx}"
ACCOUNT="${2:-}"
[[ "$POOL" =~ ^[a-z0-9_-]{2,60}$ ]] || { echo "invalid pool name"; exit 1; }
[ "$POOL" = "brands" ] && { echo "brands is the main IP ($IP); nothing to do"; exit 1; }
HOST="ip-${POOL//_/-}.$MAIL_DOMAIN"
ENI=$($AWS ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].NetworkInterfaces[0].NetworkInterfaceId' --output text)
ALLOC=$($AWS ec2 describe-addresses --filters "Name=tag:novamail-pool,Values=$POOL" --query 'Addresses[0].AllocationId' --output text)
[ "$ALLOC" = "None" ] && ALLOC=""

spf_set() { # add|remove <ip>
  local rec cur new
  rec=$(cf "/dns_records?type=TXT&name=spf.$MAIL_DOMAIN")
  cur=$(echo "$rec" | py 'd["result"][0]["content"].strip("\"")')
  new=$(python3 - "$cur" "$1" "$2" <<'PY'
import sys
cur, op, ip = sys.argv[1:]
parts = cur.split()
mech = f"ip4:{ip}"
if op == "add" and mech not in parts: parts.insert(len(parts) - 1, mech)
if op == "remove": parts = [p for p in parts if p != mech]
print(" ".join(parts))
PY
)
  [ "$new" = "$cur" ] && return
  cf "/dns_records/$(echo "$rec" | py 'd["result"][0]["id"]')" -X PATCH --data "{\"content\":\"\\\"$new\\\"\"}" | py '"   SPF: "+d["result"]["content"]' || true
}

if [ "$RELEASE" = 1 ]; then
  [ -n "$ALLOC" ] || { echo "no IP for pool $POOL"; exit 0; }
  PUB=$($AWS ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
  PRIV=$($AWS ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PrivateIpAddress' --output text)
  say "1/4 Postal: removing pool $POOL (its accounts fall back to their tier)"
  curl -sS -X DELETE "$API/admin/ips/pools/$POOL" -H "authorization: Bearer $OWN"; echo
  curl -sS -X POST "$API/admin/ips/resync" -H "authorization: Bearer $OWN" | py '"   resync: "+str(d["synced"])+" accounts"'
  say "2/4 host + SPF"
  $SSH "sudo rm -f /etc/netplan/61-novamail-$POOL.yaml && sudo ip addr del $PRIV/32 dev \$(ip -o route get 1.1.1.1 | awk '{print \$5}') 2>/dev/null; sudo netplan apply" || true
  spf_set remove "$PUB"
  say "3/4 DNS"
  for id in $(cf "/dns_records?type=A&name=$HOST" | py '" ".join(r["id"] for r in d["result"])'); do cf "/dns_records/$id" -X DELETE >/dev/null; done
  say "4/4 AWS: releasing $PUB (cost stops now)"
  $AWS ec2 reset-address-attribute --allocation-id "$ALLOC" --attribute domain-name >/dev/null 2>&1 || true
  $AWS ec2 disassociate-address --association-id "$($AWS ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].AssociationId' --output text)" || true
  [ "$PRIV" != "None" ] && $AWS ec2 unassign-private-ip-addresses --network-interface-id "$ENI" --private-ip-addresses "$PRIV" || true
  $AWS ec2 release-address --allocation-id "$ALLOC"
  echo "✓ $POOL released"
  exit 0
fi

say "1/7 Elastic IP for $POOL"
if [ -z "$ALLOC" ]; then
  ALLOC=$($AWS ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=novamail-$POOL},{Key=novamail-pool,Value=$POOL}]" --query AllocationId --output text)
fi
PUB=$($AWS ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
PRIV=$($AWS ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PrivateIpAddress' --output text)
echo "   $PUB"

say "2/7 second private IP on the node"
if [ "$PRIV" = "None" ]; then
  BEFORE=$($AWS ec2 describe-network-interfaces --network-interface-ids "$ENI" --query 'NetworkInterfaces[0].PrivateIpAddresses[].PrivateIpAddress' --output text)
  $AWS ec2 assign-private-ip-addresses --network-interface-id "$ENI" --secondary-private-ip-address-count 1
  AFTER=$($AWS ec2 describe-network-interfaces --network-interface-ids "$ENI" --query 'NetworkInterfaces[0].PrivateIpAddresses[].PrivateIpAddress' --output text)
  PRIV=$(comm -13 <(tr '\t' '\n' <<<"$BEFORE" | sort) <(tr '\t' '\n' <<<"$AFTER" | sort) | head -1)
  $AWS ec2 associate-address --allocation-id "$ALLOC" --network-interface-id "$ENI" --private-ip-address "$PRIV" --allow-reassociation >/dev/null
fi
echo "   $PRIV → $PUB"

say "3/7 host binds $PRIV (persists across reboots)"
$SSH "set -e; DEV=\$(ip -o route get 1.1.1.1 | awk '{print \$5}'); PFX=\$(ip -o -4 addr show dev \$DEV | awk 'NR==1{print \$4}' | cut -d/ -f2)
printf 'network:\n  version: 2\n  ethernets:\n    %s:\n      addresses: [%s/%s]\n' \$DEV $PRIV \$PFX | sudo tee /etc/netplan/61-novamail-$POOL.yaml >/dev/null
sudo chmod 600 /etc/netplan/61-novamail-$POOL.yaml; sudo netplan apply; ip -o -4 addr show dev \$DEV | grep -q '$PRIV/' && echo '   bound'"

say "4/7 DNS A $HOST → $PUB"
EXIST=$(cf "/dns_records?type=A&name=$HOST" | py 'd["result"][0]["id"] if d["result"] else ""')
BODY="{\"type\":\"A\",\"name\":\"$HOST\",\"content\":\"$PUB\",\"ttl\":300,\"proxied\":false}"
if [ -n "$EXIST" ]; then cf "/dns_records/$EXIST" -X PUT --data "$BODY" >/dev/null; else cf "/dns_records" -X POST --data "$BODY" >/dev/null; fi
spf_set add "$PUB"

say "5/7 reverse DNS (PTR) $PUB → $HOST"
for i in $(seq 1 12); do
  $AWS ec2 modify-address-attribute --allocation-id "$ALLOC" --domain-name "$HOST" >/dev/null 2>&1 && { echo "   requested"; break; }
  sleep 20
done

say "6/7 Postal pool $POOL"
curl -sS -X POST "$API/admin/ips/pools" -H "authorization: Bearer $OWN" -H 'content-type: application/json' \
  -d "{\"name\":\"$POOL\",\"ipv4\":\"$PRIV\",\"hostname\":\"$HOST\"}" | py '"   "+json.dumps(d.get("addresses", d))'

say "7/7 accounts"
if [ -n "$ACCOUNT" ]; then
  curl -sS -X POST "$API/admin/ips/dedicated/$ACCOUNT/assign" -H "authorization: Bearer $OWN" -H 'content-type: application/json' \
    -d "{\"pool\":\"$POOL\",\"ip\":\"$PUB\"}" | py '"   warm-up: "+str(d.get("hourly"))+" emails/hour today"'
else
  curl -sS -X POST "$API/admin/ips/resync" -H "authorization: Bearer $OWN" | py '"   "+str(d["synced"])+" accounts re-applied"'
fi
echo "✓ $POOL sends from $PUB ($HOST)"
