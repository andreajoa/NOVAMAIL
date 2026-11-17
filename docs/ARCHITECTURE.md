# Arquitetura

```
 clientes / projetos do André                     Cloudflare (conta NexaCloud)
 ─────────────────────────────                    ─────────────────────────────────────────────
 SDK Resend / HTTP ──────────────────────────────▶ Worker novamail-api  ──── D1 "novamail"
                                                    │  auth nm_…, cotas, supressão, idempotência
                                                    │  Queue "novamail-webhooks" ──▶ webhooks do cliente
                                                    │                                (Standard Webhooks, retry 8x)
                                                    ▼ HTTPS (X-Server-API-Key / Bearer admin)
 SMTP 587/25 ─────────────────────────────────────▶ Nó de envio (VM, porta 25 liberada, PTR)
                                                    Caddy :443 ─┬─ Postal web/API  :5000
                                                                └─ /_novamail/* ▶ sidecar admin :5050
                                                    Postal smtp :25/:587 · worker · MariaDB
                                                    │
                                                    ├─▶ Gmail / Outlook / Yahoo … (entrega)
                                                    └─▶ webhooks assinados (RSA) ▶ /hooks/postal/:conta
```

## Decisões

| Decisão | Motivo |
|---|---|
| **Postal (MIT)** como MTA | multi-organização, IP pools, limite por servidor, API + SMTP + webhooks assinados; MIT permite SaaS fechado. BillionMail/Plunk/listmonk/Mautic auditados em 16/11/2026 e descartados como motor (AGPL/single-tenant/dependência de SES). |
| **Sidecar admin** dentro da imagem oficial do Postal | o Postal não tem API de gestão; o sidecar usa os próprios models (DKIM, bancos de mensagem, validações iguais à UI) sem fork. |
| **Control plane na Cloudflare** | sem servidor para manter, escala global, D1 + Queues; mesmo lugar do NexaCloud. |
| **API compatível com Resend** | qualquer projeto troca de provedor mudando só a URL base; facilita vender. |
| **Cota mensal/diária na API** e **limite por hora no Postal** | o `send_limit` do Postal é por 60 min; a cota de plano precisa existir acima dele. |
| **Guarda de reputação** | ≥200 envios em 7 dias e bounce > 5% ou reclamação > 0,3% ⇒ conta suspensa no D1 e no Postal (regras Gmail/Yahoo). Plano `internal` nunca é suspenso automaticamente. |
| **IP pools** `shared` (free), `trusted` (pagos e marcas do André), `cold` (prospecção) | um cliente ruim não derruba a entrega de quem paga; e-mail frio nunca divide IP com transacional. |
| **Segredos** | chave do servidor Postal selada com AES-GCM no D1; chaves de API só como SHA-256; senha SMTP mostrada uma vez. |

## Por que ainda não existe "sem limite"
O limite deixa de ser o plano de um fornecedor e passa a ser a **reputação do IP**. Um IP novo precisa de aquecimento
(algumas centenas/dia por provedor no início, subindo ao longo de 4–6 semanas). O plano `internal` tem teto alto,
mas o envio real deve seguir a rampa de aquecimento em `docs/OPERATIONS.md`.
