# Placar NovaMail

Atualizado a cada etapa. ✅ feito e provado · 🟡 código pronto, falta implantar/provar · ⏳ a fazer · 🔒 depende do André

**Progresso geral: 39 / 47 itens (83%)** — atualizado 17/11/2026 03h (BRT)

## F0 — Auditoria (100%)
- ✅ 5 repositórios auditados (Postal, listmonk, Plunk, BillionMail, Mautic) → Postal MIT escolhido

## F1 — API / control plane (11/11)
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
- ✅ OpenAPI 3.1 em /openapi.json + referência interativa em https://api.novamail.nexaclouds.online/docs

## F2 — Nó de envio (8/9)
- ✅ Sidecar admin do Postal (provisiona org/servidor/credenciais/webhook, domínios, limites, suspensão)
- ✅ Docker Compose (Postal 3.4 web/smtp/587/worker + MariaDB + Caddy TLS) + bootstrap idempotente
- ✅ Healthcheck (auto-restart, blocklists Spamhaus/Barracuda/SpamCop, fila)
- ✅ DNS da plataforma automatizado na Cloudflare
- ✅ Teste de integração com Postal 3.4 real no GitHub Actions (provisão, idempotência, domínio, envio, limites, suspensão)
- ✅ VM AWS `novamail-node` (t3.small, IP fixo 18.218.5.60) com Postal 3.4 no ar: HTTPS válido em postal.novamail.nexaclouds.online, SMTP 25/587 com STARTTLS, sidecar admin respondendo
- ✅ DNS da plataforma publicado (SPF, DKIM do return-path, MX de bounce, tracking, DMARC, TLS-RPT)
- ✅ PTR pedido à AWS (postal.novamail.nexaclouds.online)
- ⏳ Porta 25 de SAÍDA: pedido ENVIADO à AWS em 17/11 01h45 (BRT); o servidor checa sozinho a cada 10 min (`outbound_25` em /opt/novamail/health.json)
- ⏳ Primeiro e-mail real entregue em caixa de entrada do Gmail (prova)

## F2.5 — Prova em produção (2/3)
- ✅ Conta interna criada pela API → organização/servidor/credenciais/webhook criados no Postal
- ✅ Domínio `envio.novamail.nexaclouds.online`: DNS publicado sozinho na Cloudflare e verificado (SPF/DKIM/return-path OK)
- 🔒 1º e-mail (para o Gmail do André) aceito e na fila do Postal; sai quando a AWS liberar a porta 25

## F3 — Marcas do André no NovaMail (2/4)
- ✅ 6 contas internas criadas (Gilberto, AMB, Atenza, Trilha, FlowNexa, NexaCloud) com subdomínio `mail.<marca>` — chaves em ~/.config/novamail/marcas (600)
- ✅ mail.nexaclouds.online publicado e VERIFICADO
- 🔒 DNS das outras 5: `bash scripts/publicar-dns-marcas.sh flownexa atenza` (+ `CF_TOKEN=… … gilberto amb trilha` nas outras contas Cloudflare) — bloqueado para mim
- ⏳ Trocar Resend/Brevo pelo NovaMail em cada projeto, seguindo a rampa de aquecimento (depois da porta 25)

## F4 — Painel do cliente (5/5) — https://app.novamail.nexaclouds.online
- ✅ Login sem senha (código de 6 dígitos enviado pelo próprio NovaMail; ponte temporária só para e-mails do sistema até a porta 25 abrir), cadastro automático no Free, sessão HttpOnly + proteção CSRF, limite de tentativas, bloqueio de e-mail descartável
- ✅ Domínios: registros DNS com copiar, verificação ao vivo (SPF/DKIM/return-path)
- ✅ E-mails (histórico com status), chaves de API (mostradas 1x), webhooks (segredo 1x), supressões
- ✅ Visão geral: uso dia/mês vs plano, gráfico de 30 dias, quickstart com SDK do Resend
- ✅ PT-BR/EN automático, claro/escuro, CSP estrita, mobile

## F5 — Cobrança (3/4)
- ✅ Stripe Checkout (Pro US$15 · Scale US$60), Portal do cliente, webhook assinado que muda plano + limites no Postal (sem SDK)
- ✅ Tela de planos no painel
- ✅ Sem Stripe configurado = tudo grátis, custo fixo zero
- 🔒 `bash scripts/ativar-stripe.sh` (cria produtos/webhook no Stripe live; bloqueado para mim)

## F6 — Marketing (5/5)
- ✅ Públicos + contatos (importação em massa até 1000/requisição, CSV colado no painel)
- ✅ Campanhas com {{first_name}}/{{unsubscribe_url}}, rascunho → enviar → pausar/cancelar
- ✅ Descadastro em 1 clique RFC 8058 (List-Unsubscribe + List-Unsubscribe-Post); GET só confirma (scanner não descadastra)
- ✅ Disparo em lotes por cron (1/min), pausa automática quando a cota acaba
- ✅ Telas Públicos e Campanhas no painel

## F7 — Entregabilidade avançada (3/4)
- ✅ Reclamações ARF: caixa fbl@envio.novamail.nexaclouds.online → Postal → API assinada → supressão + guarda (provado ponta a ponta 17/11)
- ✅ Cabeçalho Feedback-ID em todo envio (Gmail Postmaster por categoria/conta)
- ✅ Página de status pública https://api.novamail.nexaclouds.online/status
- 🔒 Cadastrar o endereço FBL no Yahoo CFL e Microsoft JMRP/SNDS + domínio no Google Postmaster Tools

## Lançamento (1/2)
- ✅ Landing com preços + cadastro, Termos, Política de Uso Aceitável e Privacidade (LGPD) em app.novamail.nexaclouds.online (revisar com advogado antes de escala)
- 🔒 Domínio próprio da marca (hoje *.novamail.nexaclouds.online)
