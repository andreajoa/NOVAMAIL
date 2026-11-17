#!/usr/bin/env bash
# Integration test: real Postal image + MariaDB + NovaMail admin sidecar.
# Proves provisioning, domains, limits, suspension and the Postal send API work
# exactly as the control plane expects. Runs in GitHub Actions (Docker available).
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=$(mktemp -d)
VERSION=${POSTAL_VERSION:-3.4.0}
IMG=ghcr.io/postalserver/postal:$VERSION
TOKEN=$(openssl rand -hex 32)
PW=ci-root-pw

mkdir -p "$WORK/config"
openssl genrsa -out "$WORK/config/signing.key" 2048 2>/dev/null
cat > "$WORK/config/postal.yml" <<YML
version: 2
postal:
  web_hostname: postal.ci.test
  web_protocol: http
  smtp_hostname: postal.ci.test
  use_ip_pools: true
  signing_key_path: /config/signing.key
main_db: { host: 127.0.0.1, username: root, password: $PW, database: postal }
message_db: { host: 127.0.0.1, username: root, password: $PW, database_name_prefix: postal }
dns: { spf_include: spf.ci.test, return_path_domain: rp.ci.test, route_domain: routes.ci.test, track_domain: track.ci.test, dkim_identifier: nm, domain_verify_prefix: novamail-verification, custom_return_path_prefix: nmrp }
rails: { environment: production, secret_key: $(openssl rand -hex 32) }
YML
chmod -R a+rX "$WORK/config"

cleanup() { docker rm -f nm-db nm-web nm-admin >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name nm-db --network host -e MARIADB_ROOT_PASSWORD=$PW -e MARIADB_DATABASE=postal mariadb:11.8 >/dev/null
for _ in $(seq 1 60); do docker exec nm-db healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1 && break; sleep 2; done

docker run --rm --network host -v "$WORK/config:/config" $IMG postal initialize
docker run -d --name nm-web --network host -v "$WORK/config:/config" $IMG postal web-server >/dev/null
docker run -d --name nm-admin --network host -v "$WORK/config:/config" -v "$PWD/infra/postal/admin:/novamail-admin:ro" \
  -e NOVAMAIL_ADMIN_TOKEN=$TOKEN $IMG bundle exec rails runner /novamail-admin/server.rb >/dev/null

A=http://127.0.0.1:5050
for _ in $(seq 1 60); do curl -fs $A/health >/dev/null && break; sleep 2; done
# Postal web (send API) boots separately; wait for it too.
for _ in $(seq 1 90); do curl -s -o /dev/null -H "host: postal.ci.test" http://127.0.0.1:5000/ && break; sleep 2; done
curl -fsS $A/health; echo

post() { curl -sS -X POST "$A$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$2"; }
check() { echo "$1" | jq -e "$2" >/dev/null || { echo "FAILED: $2 on $1"; docker logs nm-admin 2>&1 | tail -40; docker logs nm-web 2>&1 | tail -40; exit 1; }; }

echo "== unauthorized"
r=$(curl -sS -X POST $A/v1/provision -H 'authorization: Bearer wrong' -d '{}'); check "$r" '.ok == false'

echo "== provision"
r=$(post /v1/provision '{"account_id":"acc_CI123","name":"CI Account","hourly_limit":100,"ip_pool":"shared","webhook_url":"https://api.example.com/hooks/postal/acc_CI123"}')
check "$r" '.ok and .org == "acc-ci123" and .server == "main" and (.api_key|length) == 24 and (.smtp_password|length) == 24'
KEY=$(echo "$r" | jq -r .api_key)

echo "== provision is idempotent (same org, same API key)"
r2=$(post /v1/provision '{"account_id":"acc_CI123","name":"CI Account","hourly_limit":100}')
check "$r2" ".api_key == \"$KEY\""

echo "== domain add / check"
r=$(post /v1/domains/add '{"org":"acc-ci123","server":"main","name":"example.com"}')
check "$r" '.ok and (.records|map(.record)) == ["verification","spf","dkim","return_path"]'
check "$r" '.records[] | select(.record=="dkim") | .name | startswith("nm-")'
UUID=$(echo "$r" | jq -r .uuid)
r=$(post /v1/domains/check "{\"org\":\"acc-ci123\",\"server\":\"main\",\"uuid\":\"$UUID\"}")
check "$r" '.ok and .verified == false'

echo "== send API accepts mail once the domain is verified"
docker exec nm-admin bundle exec rails runner "Domain.find_by(uuid: '$UUID').update!(verified_at: Time.now)" >/dev/null
r=$(curl -sS -X POST http://127.0.0.1:5000/api/v1/send/message -H "host: postal.ci.test" -H "x-server-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"from":"oi@example.com","to":["cliente@example.org"],"subject":"CI","plain_body":"hello"}')
check "$r" '.status == "success" and (.data.messages["cliente@example.org"].id > 0)'

echo "== limits / suspend / unsuspend"
check "$(post /v1/limits '{"org":"acc-ci123","server":"main","hourly_limit":5}')" '.ok'
check "$(post /v1/suspend '{"org":"acc-ci123","reason":"ci"}')" '.ok'
r=$(curl -sS -X POST http://127.0.0.1:5000/api/v1/send/message -H "host: postal.ci.test" -H "x-server-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"from":"oi@example.com","to":["c@example.org"],"subject":"CI","plain_body":"x"}')
check "$r" '.status != "success"'
check "$(post /v1/unsuspend '{"org":"acc-ci123"}')" '.ok'

echo "== feedback-loop route"
r=$(post /v1/fbl '{"org":"acc-ci123","server":"main","domain":"example.com","url":"https://api.example.com/hooks/fbl"}')
check "$r" '.ok and .address == "fbl@example.com" and (.forward_address | endswith("@routes.ci.test"))'
r2=$(post /v1/fbl '{"org":"acc-ci123","server":"main","domain":"example.com","url":"https://api.example.com/hooks/fbl"}')
check "$r2" ".address == $(echo "$r" | jq .address)"

echo "== domain remove / 404s"
check "$(post /v1/domains/remove "{\"org\":\"acc-ci123\",\"server\":\"main\",\"uuid\":\"$UUID\"}")" '.ok'
check "$(post /v1/limits '{"org":"nope","server":"main"}')" '.ok == false'

echo "== IP pools (tiers + dedicated)"
check "$(post /v1/pools/upsert '{"name":"Bad Name!","ipv4":"127.0.0.2","hostname":"x.ci.test"}')" '.ok == false'
check "$(post /v1/pools/upsert '{"name":"brands","ipv4":"127.0.0.1","hostname":"postal.ci.test"}')" '.ok and .addresses[0].ipv4 == "127.0.0.1"'
check "$(post /v1/pools/upsert '{"name":"ded_ci","ipv4":"127.0.0.3","hostname":"ip3.ci.test"}')" '.ok'
check "$(post /v1/pools/upsert '{"name":"ded_ci","ipv4":"127.0.0.3","hostname":"ip3b.ci.test"}')" '.ok and (.addresses | length) == 1 and .addresses[0].hostname == "ip3b.ci.test"'
# "shared" doesn't exist yet → falls back to brands; then the dedicated pool is applied.
check "$(post /v1/limits '{"org":"acc-ci123","server":"main","ip_pool":"shared"}')" '.ok'
check "$(post /v1/limits '{"org":"acc-ci123","server":"main","ip_pool":"ded_ci"}')" '.ok'
r=$(post /v1/pools/list '{}')
check "$r" '.ok and ([.pools[] | select(.name == "ded_ci")][0].servers) >= 0'
check "$(post /v1/pools/remove '{"name":"ded_ci"}')" '.ok'
check "$(post /v1/pools/list '{}')" '[.pools[].name] | index("ded_ci") == null'
check "$(post /v1/pools/remove '{"name":"ded_ci"}')" '.ok == false'

echo "ALL POSTAL ADMIN CHECKS PASSED"
