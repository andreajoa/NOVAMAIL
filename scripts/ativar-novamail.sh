#!/usr/bin/env bash
# Ativa o NovaMail de ponta a ponta. Rodar UMA vez (é idempotente: pode repetir).
#
#   bash scripts/ativar-novamail.sh
#
# O que faz:
#   1. cria (ou reaproveita) a VM de envio na AWS: t3.small Ubuntu 24.04, IP fixo, firewall 22/25/80/443/587
#   2. gera ENCRYPTION_KEY e OWNER_TOKEN (guardados em ~/.config/novamail, modo 600)
#   3. pede o token da Cloudflare (colar; não aparece na tela) e grava tudo nos segredos do GitHub
#   4. dispara "Deploy API" e depois "Deploy sending node" no GitHub Actions e espera terminar
#   5. aponta o DNS reverso (PTR) do IP para postal.<MAIL_DOMAIN>
#   6. mostra o texto para pedir a liberação da porta 25 na AWS
set -euo pipefail

REPO="andreajoa/NOVAMAIL"
REGION="us-east-2"
MAIL_DOMAIN="novamail.nexaclouds.online"
CF_ACCOUNT_ID="7ef2450965811249288bc35188f7cbf9"   # conta Cloudflare (Proton) dona de nexaclouds.online
CF_ZONE_ID="161ada99658a35b6ae5b1cff61e69503"      # zona nexaclouds.online
CONF="$HOME/.config/novamail"
AWS="${AWS_BIN:-$HOME/.venvs/awscli/bin/aws} --region $REGION"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
mkdir -p "$CONF" && chmod 700 "$CONF"

# ---------------------------------------------------------------- 1. VM
say "1/6 VM de envio na AWS ($REGION)"
IID=$($AWS ec2 describe-instances --filters Name=tag:Name,Values=novamail-node Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$IID" = "None" ] || [ -z "$IID" ]; then
  AMI=$($AWS ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)
  if [ ! -f "$CONF/node.pem" ]; then
    $AWS ec2 create-key-pair --key-name novamail-node --key-type ed25519 --query KeyMaterial --output text > "$CONF/node.pem"
    chmod 600 "$CONF/node.pem"
  fi
  SG=$($AWS ec2 describe-security-groups --filters Name=group-name,Values=novamail-node --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
  if [ "$SG" = "None" ] || [ -z "$SG" ]; then
    SG=$($AWS ec2 create-security-group --group-name novamail-node --description "NovaMail sending node" --query GroupId --output text)
    for p in 22 25 80 443 587; do
      $AWS ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
        "IpProtocol=tcp,FromPort=$p,ToPort=$p,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]" >/dev/null
    done
  fi
  IID=$($AWS ec2 run-instances --image-id "$AMI" --instance-type t3.small --key-name novamail-node --security-group-ids "$SG" \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,Encrypted=true}' \
    --metadata-options HttpTokens=required --credit-specification CpuCredits=standard \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=novamail-node},{Key=project,Value=novamail}]' \
    --query 'Instances[0].InstanceId' --output text)
  echo "   instância criada: $IID"
fi
$AWS ec2 wait instance-running --instance-ids "$IID"
ALLOC=$($AWS ec2 describe-addresses --filters Name=tag:Name,Values=novamail-node --query 'Addresses[0].AllocationId' --output text)
if [ "$ALLOC" = "None" ] || [ -z "$ALLOC" ]; then
  ALLOC=$($AWS ec2 allocate-address --domain vpc --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=novamail-node}]' --query AllocationId --output text)
fi
$AWS ec2 associate-address --instance-id "$IID" --allocation-id "$ALLOC" --allow-reassociation >/dev/null
IP=$($AWS ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
printf 'INSTANCE_ID=%s\nALLOCATION_ID=%s\nIP=%s\nREGION=%s\n' "$IID" "$ALLOC" "$IP" "$REGION" > "$CONF/node.env"
echo "   VM $IID no IP $IP"
for _ in $(seq 1 40); do ssh -i "$CONF/node.pem" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 "ubuntu@$IP" true 2>/dev/null && break; sleep 5; done

# ---------------------------------------------------------------- 2. chaves da plataforma
say "2/6 chaves da plataforma"
[ -f "$CONF/encryption-key" ] || { openssl rand -hex 32 > "$CONF/encryption-key"; chmod 600 "$CONF/encryption-key"; }
[ -f "$CONF/owner-token" ] || { openssl rand -hex 32 > "$CONF/owner-token"; chmod 600 "$CONF/owner-token"; }
echo "   guardadas em $CONF (encryption-key NUNCA pode mudar)"

# ---------------------------------------------------------------- 3. token Cloudflare + segredos GitHub
say "3/6 token da Cloudflare"
if [ ! -s "$CONF/cloudflare-token" ]; then
  cat <<EOF
   Abra https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom token:
     Nome: NovaMail CI
     Permissões (Account):  Workers Scripts: Edit · D1: Edit · Queues: Edit · Account Settings: Read
     Permissões (Zone):     DNS: Edit · Workers Routes: Edit · Zone: Read
     Account Resources: Andrealmeidashop@proton.me's Account · Zone Resources: nexaclouds.online
EOF
  if [ -t 0 ]; then
    read -r -s -p "   Cole o token aqui e Enter: " CFT; echo
    printf '%s' "$CFT" > "$CONF/cloudflare-token"; chmod 600 "$CONF/cloudflare-token"
  else
    # Non-interactive (Claude Code `!`): wait for the token to be copied to the clipboard.
    bash "$(dirname "$0")/pegar-token-cloudflare.sh"
  fi
fi
CFT=$(cat "$CONF/cloudflare-token")
ok=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database?per_page=1" -H "Authorization: Bearer $CFT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("success"))')
[ "$ok" = "True" ] || { echo "   ✗ token sem acesso ao D1 da conta. Apague $CONF/cloudflare-token e rode de novo."; exit 1; }
echo "   token ok"

say "   gravando segredos no GitHub ($REPO, ambiente production)"
gh api -X PUT "repos/$REPO/environments/production" >/dev/null
sec() { gh secret set "$1" -R "$REPO" -e production --body "$2" >/dev/null && echo "   secret $1"; }
var() { gh variable set "$1" -R "$REPO" -e production --body "$2" >/dev/null 2>&1 || gh variable set "$1" -R "$REPO" --body "$2" >/dev/null; echo "   var    $1=$2"; }
sec CLOUDFLARE_API_TOKEN "$CFT"
sec CLOUDFLARE_ACCOUNT_ID "$CF_ACCOUNT_ID"
sec NOVAMAIL_ENCRYPTION_KEY "$(cat "$CONF/encryption-key")"
sec NOVAMAIL_OWNER_TOKEN "$(cat "$CONF/owner-token")"
sec NODE_HOST "$IP"
sec NODE_SSH_KEY "$(cat "$CONF/node.pem")"
# Repository-level variables gate the workflows (job-level `if` cannot read environment vars).
gh variable set MAIL_DOMAIN -R "$REPO" --body "$MAIL_DOMAIN" >/dev/null && echo "   var    MAIL_DOMAIN"
gh variable set CLOUDFLARE_ZONE_ID -R "$REPO" --body "$CF_ZONE_ID" >/dev/null && echo "   var    CLOUDFLARE_ZONE_ID"
gh variable set NODE_READY -R "$REPO" --body "true" >/dev/null && echo "   var    NODE_READY"

# ---------------------------------------------------------------- 4. deploys
run_wf() {
  local wf="$1"; shift
  gh workflow run "$wf" -R "$REPO" --ref main "$@"
  sleep 8
  local id; id=$(gh run list -R "$REPO" --workflow "$wf" --limit 1 --json databaseId --jq '.[0].databaseId')
  echo "   acompanhando run $id (https://github.com/$REPO/actions/runs/$id)"
  gh run watch "$id" -R "$REPO" --exit-status >/dev/null || { gh run view "$id" -R "$REPO" --log-failed | tail -40; exit 1; }
  echo "   ✓ $wf"
}
say "4/6 deploy da API na Cloudflare"
run_wf deploy-api.yml
say "    deploy do nó de envio (Postal) + DNS"
run_wf deploy-node.yml -f dns=true

# ---------------------------------------------------------------- 5. PTR
say "5/6 DNS reverso (PTR) $IP → postal.$MAIL_DOMAIN"
for _ in $(seq 1 30); do [ "$(dig +short "postal.$MAIL_DOMAIN" A @1.1.1.1)" = "$IP" ] && break; sleep 10; done
$AWS ec2 modify-address-attribute --allocation-id "$ALLOC" --domain-name "postal.$MAIL_DOMAIN" >/dev/null && echo "   PTR solicitado (a AWS confirma em alguns minutos)"

# ---------------------------------------------------------------- 6. porta 25
say "6/6 liberar a porta 25 na AWS (só você consegue: login root no console)"
cat <<EOF
   Formulário: https://support.console.aws.amazon.com/support/contacts#/rdns-limits
   Elastic IP: $IP   ·   Reverse DNS: postal.$MAIL_DOMAIN
   Caso de uso (cole):
     NovaMail is our own transactional email platform (Postal MTA) for our brands' order
     confirmations, password resets and opt-in newsletters. All recipients are customers who
     signed up. We enforce SPF, DKIM and DMARC, one-click unsubscribe (RFC 8058), automatic
     suppression of hard bounces and complaints, per-account rate limits and automatic
     suspension above 5% bounce or 0.3% complaint rate. No purchased or scraped lists.

✓ Pronto. API: https://api.novamail.nexaclouds.online/health · Postal: https://postal.$MAIL_DOMAIN
EOF
