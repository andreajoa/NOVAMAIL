# Operação

## Segredos e variáveis do GitHub (Settings → Environments → production)

| Nome | Tipo | Origem |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | token com Workers Scripts:Edit, D1:Edit, Queues:Edit, Workers Routes/Custom Domains na conta do NexaCloud |
| `CLOUDFLARE_ACCOUNT_ID` | secret | conta Cloudflare do NexaCloud |
| `CLOUDFLARE_DNS_TOKEN` | secret (opcional) | DNS:Edit na zona `nexaclouds.online` (se o token acima não tiver) |
| `NOVAMAIL_ENCRYPTION_KEY` | secret | `openssl rand -hex 32` — **nunca trocar** (abre as chaves do Postal no D1) |
| `NOVAMAIL_OWNER_TOKEN` | secret | `openssl rand -hex 32` — acesso a `/admin/*` |
| `NODE_HOST` / `NODE_SSH_KEY` | secret | IP e chave SSH da VM de envio |
| `MAIL_DOMAIN` | variable | `novamail.nexaclouds.online` (trocar quando houver domínio próprio) |
| `ACME_EMAIL` | variable | e-mail para o Let's Encrypt |
| `CLOUDFLARE_ZONE_ID` | variable | zona `nexaclouds.online` |

`POSTAL_ADMIN_TOKEN` e `POSTAL_WEBHOOK_PUBLIC_KEY` **não** são cadastrados à mão: o workflow *Deploy sending node*
lê do servidor e grava direto no Worker.

## Ordem de subida
1. VM Ubuntu 24.04 (≥2 GB) com **porta 25 de saída liberada** e IP fixo.
2. Workflow **Deploy API (Cloudflare)** → cria D1/Queue, migra, publica `api.novamail.nexaclouds.online`.
3. Workflow **Deploy sending node** → instala Postal, grava segredos no Worker, cria DNS.
4. No provedor: **PTR/rDNS** do IP = `postal.novamail.nexaclouds.online`.
5. `POST /admin/accounts` com `plan: internal` para cada marca; `POST /domains` + DNS do domínio da marca; `POST /domains/:id/verify`.

## Aquecimento do IP (por provedor de destino: Gmail, Outlook, Yahoo)
| Semana | Envios/dia por provedor | Conteúdo |
|---|---|---|
| 1 | 50 → 200 | só transacional (pedidos, login, recibos) das marcas próprias |
| 2 | 200 → 1 000 | + newsletters para quem abriu nos últimos 90 dias |
| 3 | 1 000 → 5 000 | + base completa engajada |
| 4–6 | dobra a cada 2–3 dias se bounce < 2% e spam < 0,1% | liberar clientes pagos |

Cadastrar o domínio de envio no **Google Postmaster Tools** e no **Microsoft SNDS** no 1º dia.

## Rotina
- `/opt/novamail/health.json` (a cada 10 min): serviços reiniciados, IP em blocklist, fila.
- Conta suspensa automaticamente: ver `audit_log`, falar com o cliente, `POST /admin/accounts/:id/unsuspend`.
