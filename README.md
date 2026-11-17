# NovaMail

Plataforma de e-mail própria: **API transacional compatível com Resend, SMTP, domínios com DKIM/SPF/DMARC,
webhooks e cotas por plano**, pronta para os projetos do André e para revenda (plano grátis + mensal).

| Camada | Onde roda | O quê |
|---|---|---|
| **API / control plane** (`apps/api`) | Cloudflare Workers + D1 + Queues | contas, chaves `nm_…`, `/emails`, `/domains`, webhooks assinados (Standard Webhooks), cotas, guarda de reputação |
| **Nó de envio** (`infra/postal`) | VM na nuvem com porta 25 liberada | [Postal](https://github.com/postalserver/postal) 3.4 (MIT) + sidecar de administração + MariaDB + Caddy (TLS) |
| **DNS** (`infra/dns`) | Cloudflare | registros da plataforma (SPF, DKIM do return-path, MX de bounce, tracking, DMARC, TLS-RPT) |

Tudo é implantado pelo GitHub Actions — nada roda na máquina local.

## Usar (qualquer SDK do Resend funciona)

```ts
import { Resend } from "resend";
const nova = new Resend("nm_...", { baseUrl: "https://api.novamail.nexaclouds.online" });
await nova.emails.send({ from: "Loja <oi@mail.sualoja.com>", to: "cliente@gmail.com", subject: "Pedido confirmado", html: "<b>Obrigado!</b>" });
```

```bash
curl https://api.novamail.nexaclouds.online/emails \
  -H "Authorization: Bearer nm_..." -H "Content-Type: application/json" -H "Idempotency-Key: pedido-123" \
  -d '{"from":"oi@mail.sualoja.com","to":"cliente@gmail.com","subject":"Oi","html":"<p>Oi</p>"}'
```

SMTP: `postal.novamail.nexaclouds.online`, porta 587 (STARTTLS) ou 25, usuário/senha entregues na criação da conta.

## Endpoints

| Método | Caminho | |
|---|---|---|
| POST | `/emails` · `/emails/batch` | enviar (até 50 destinatários; `Idempotency-Key`) |
| GET | `/emails` · `/emails/:id` | histórico e último evento |
| POST/GET/DELETE | `/domains` · `/domains/:id` · `POST /domains/:id/verify` | domínio + registros DNS + verificação |
| POST/GET/DELETE | `/api-keys` | chaves `full_access` / `sending_access` (opcionalmente presa a 1 domínio) |
| POST/GET/DELETE | `/webhooks` | `email.delivered`, `email.bounced`, `email.opened`, `email.clicked`, … |
| GET/POST/DELETE | `/suppressions` | lista de supressão (bounce/reclamação/descadastro) |
| GET | `/usage` | plano, uso do dia/mês, taxas de bounce/reclamação |
| — | `/admin/*` | dono da plataforma (`OWNER_TOKEN`): criar conta, plano, suspender |

Veja [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md) e o placar em [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Licenças
Código do NovaMail: todos os direitos reservados. Postal é MIT (usado como imagem oficial, sem modificações).
