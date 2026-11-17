# Placar NovaMail

Atualizado a cada etapa. ✅ feito e provado · 🟡 código pronto, falta implantar/provar · ⏳ a fazer · 🔒 depende do André

**Progresso geral: 21 / 44 itens (48%)** — atualizado 17/11/2026 01h30 (BRT)

## F0 — Auditoria (100%)
- ✅ 5 repositórios auditados (Postal, listmonk, Plunk, BillionMail, Mautic) → Postal MIT escolhido

## F1 — API / control plane (10/11)
- ✅ Esquema D1 (contas, chaves, domínios, e-mails, eventos, uso, supressão, webhooks, auditoria)
- ✅ `POST /emails` e `/emails/batch` compatíveis com Resend + `Idempotency-Key`
- ✅ Domínios: criar, registros DNS (verificação, SPF, DKIM, return-path, DMARC), verificar, remover
- ✅ Chaves `nm_…` (SHA-256), `full_access`/`sending_access`, presa a domínio
- ✅ Cotas por plano (dia/mês) + limite por hora empurrado ao Postal
- ✅ Webhooks do Postal com assinatura RSA verificada, dedupe por uuid, estado sem regressão
- ✅ Supressão automática de bounce + guarda de reputação (suspende conta)
- ✅ Webhooks do cliente no padrão Standard Webhooks + fila com 8 tentativas
- ✅ 16 testes no runtime real da Cloudflare (workerd) passando, local e no GitHub Actions
- ✅ NO AR em `https://api.novamail.nexaclouds.online` — banco em SQLite Durable Object (plano grátis; a conta já tinha 10/10 D1), custo zero
- ⏳ Documentação OpenAPI + página /docs

## F2 — Nó de envio (8/9)
- ✅ Sidecar admin do Postal (provisiona org/servidor/credenciais/webhook, domínios, limites, suspensão)
- ✅ Docker Compose (Postal 3.4 web/smtp/587/worker + MariaDB + Caddy TLS) + bootstrap idempotente
- ✅ Healthcheck (auto-restart, blocklists Spamhaus/Barracuda/SpamCop, fila)
- ✅ DNS da plataforma automatizado na Cloudflare
- ✅ Teste de integração com Postal 3.4 real no GitHub Actions (provisão, idempotência, domínio, envio, limites, suspensão)
- ✅ VM AWS `novamail-node` (t3.small, IP fixo 18.218.5.60) com Postal 3.4 no ar: HTTPS válido em postal.novamail.nexaclouds.online, SMTP 25/587 com STARTTLS, sidecar admin respondendo
- ✅ DNS da plataforma publicado (SPF, DKIM do return-path, MX de bounce, tracking, DMARC, TLS-RPT)
- ✅ PTR pedido à AWS (postal.novamail.nexaclouds.online)
- 🔒 Porta 25 de SAÍDA liberada pela AWS (testado: bloqueada) — formulário no console root
- ⏳ Primeiro e-mail real entregue em caixa de entrada do Gmail (prova)

## F2.5 — Prova em produção (2/3)
- ✅ Conta interna criada pela API → organização/servidor/credenciais/webhook criados no Postal
- ✅ Domínio `envio.novamail.nexaclouds.online`: DNS publicado sozinho na Cloudflare e verificado (SPF/DKIM/return-path OK)
- 🔒 1º e-mail (para o Gmail do André) aceito e na fila do Postal; sai quando a AWS liberar a porta 25

## F3 — Marcas do André no NovaMail (0/6)
- ⏳ Gilberto · ⏳ AMB · ⏳ Atenza · ⏳ Trilha Aprova · ⏳ FlowNexa · ⏳ NexaCloud (troca do Resend/Brevo, seguindo a rampa de aquecimento)

## F4 — Painel do cliente (0/5)
- ⏳ Cadastro/login (e-mail + Google/GitHub, como no NexaCloud)
- ⏳ Domínios com DNS em 1 clique (Cloudflare) e verificação ao vivo
- ⏳ Logs de e-mail, eventos, chaves, webhooks
- ⏳ Uso e reputação em gráfico
- ⏳ Integração no painel do NexaCloud (aba "E-mail")

## F5 — Cobrança (0/4)
- ⏳ Stripe: Free → Pro → Scale (assinatura mensal + excedente por uso)
- ⏳ Webhook do Stripe muda plano/limites automaticamente
- ⏳ Verificação anti-abuso no cadastro (domínio, e-mail descartável, captcha)
- 🔒 Preços finais (sugestão: Conselho)

## F6 — Marketing (0/5)
- ⏳ Contatos e audiências · ⏳ Broadcasts/campanhas · ⏳ Descadastro em 1 clique (RFC 8058) · ⏳ Templates · ⏳ Automações simples

## F7 — Entregabilidade avançada (0/3)
- ⏳ Feedback loops (reclamações Yahoo/Microsoft) → supressão
- ⏳ Relatórios DMARC/TLS-RPT
- ⏳ Página de status pública

## Lançamento (0/1)
- 🔒 Domínio próprio da marca + Termos, Política de Uso Aceitável e LGPD
