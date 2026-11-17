# Placar NovaMail

Atualizado a cada etapa. ✅ feito e provado · 🟡 código pronto, falta implantar/provar · ⏳ a fazer · 🔒 depende do André

**Progresso geral: 65 / 71 itens (92%)** — atualizado 17/11/2026 (BRT)

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
- ✅ mail.flownex.online e mail.atenza.online VERIFICADOS (17/11)
- 🔒 DNS de gilberto, amb, trilha: `CF_TOKEN=… bash scripts/publicar-dns-marcas.sh gilberto amb trilha` (outras contas Cloudflare)
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

## F8 — Editor, funis, IA e vendas (11/12)
- ✅ Editor visual arrasta-e-solta (título, texto, imagem/GIF, vídeo→GIF, botão, imagem+texto, divisor, espaço, HTML, rodapé), soltar arquivo troca a imagem, prévia desktop/celular, envio de teste, Ctrl/Cmd+S
- ✅ 8 modelos prontos + colar HTML; mesmo renderizador no painel e na API (@novamail/email), HTML compatível com Outlook
- ✅ Upload de mídia em KV (grátis) com checagem do tipo real; SVG recusado; cota por plano
- ✅ Funis (sequências com espera, gatilho por lista ou API, saída automática no descadastro)
- ✅ MCP para Claude Code/Codex com chave de agente restrita (sem enviar/ativar/apagar), 120 req/min, auditoria
- ✅ Plano interno SEM limite para as marcas do André
- ✅ Checkout Stripe embutido no painel + plano anual (2 meses grátis) + pacote +50k e-mails dentro do checkout
- ✅ Preços anuais (Pro US$150, Scale US$600) e pacote +50k (US$10/mês, US$100/ano) criados no Stripe live e testados (17/11)
- ✅ Site SEO/GEO em inglês (24 páginas server-side, JSON-LD, hreflang, llms.txt, IndexNow 200)
- ✅ Página /ai-agents e comparativos Mailchimp/Brevo/MailerLite/Resend/SendGrid/Mailgun/Postmark/SES
- ✅ Acesso de suporte do dono (sessão de 1 h por conta) + capturas reais do painel validadas
- ✅ 39 testes automáticos (inclui ataques de agente e XSS)

## F9 — Funis em nós e rastreamento (4/4)
- ✅ Construtor visual (React Flow 13): gatilho (lista/etiqueta/API), e-mail, espera, condição Sim/Não (abriu, clicou, tem etiqueta, está na lista), etiqueta, fim; 3 receitas; contagem ao vivo por nó; validação (sem ciclos)
- ✅ Motor de grafo no cron + migração dos funis lineares
- ✅ Rastreamento próprio de abertura/clique (links assinados + pixel; sem open redirect)
- ✅ API de etiquetas (POST /contacts/tags) para lojas marcarem "comprou" etc.; MCP aceita grafos

## F10 — CRM, ciclo de vida e assinatura fácil (6/6)
- ✅ CRM: ficha única por pessoa (todas as listas), telefone/empresa/campos próprios, notas, linha do tempo (enviado/abriu/clicou/etiquetas/listas/funis/notas), ações em massa, CSV importar/exportar (à prova de injeção), apagar LGPD
- ✅ Pontuação de engajamento 0–100 (quente/morno/frio) e segmentos dinâmicos com contagem ao vivo → "Enviar campanha" congela em lista
- ✅ E-mails automáticos: boas-vindas no cadastro, confirmação no pagamento, funil próprio free→pago (4 e-mails, para quando vira "paid"); cadastrados antigos incluídos
- ✅ Mensal/anual fácil: botão do site leva direto ao checkout embutido do plano/intervalo escolhido; seletor grande P&B; faixa de upgrade no painel Free
- ✅ Site: seção CRM na home, página /crm, llms.txt e schema atualizados; IndexNow enviado
- ✅ 42 testes passando (inclui CRM e ciclo de vida)

## F11 — IPs por nível de risco (2/3)
- ✅ Grupos no Postal: brands (suas marcas) · trusted (pagantes) · shared (Free) · ded_<conta> (dedicado); grupo inexistente cai no IP principal; testado no Postal real (CI) e em produção (8 contas reaplicadas)
- ✅ IP dedicado US$29/mês · US$290/ano: oferecido no checkout do Scale e no painel; aviso por e-mail ao dono; aquecimento automático (~3 semanas, limite por hora dobrando); cancelou → volta ao grupo do plano
- 🔒 Ligar o IP do Free (`bash scripts/ip-pool.sh shared`) quando a porta 25 abrir e entrar o 1º pagante (~US$3,60/mês)

## F12 — Melhor que os concorrentes (6/12)
- ✅ 1. Formulários: no site, pop-up (tempo/rolagem/saída; centro/canto/barra) e página própria; Shadow DOM; confirmação dupla; anti-robô (campo isca, tempo mínimo, limite por IP e por formulário); prova de consentimento (IP, navegador, página, hora); 5 modelos; editor com prévia desktop/celular; conversão
- ✅ 2. Central de preferências: escolher listas, voltar a assinar, descadastro total; inglês/português pelo navegador; botão do Gmail continua 1 clique
- ✅ 3. Teste A/B (até 4 assuntos, % do teste, vencedor por abertura ou clique, espera; vencedor vai sozinho ao resto) + reenvio para quem não abriu + agendamento
- ✅ 4. Relatórios: mapa de cliques sobre o próprio e-mail, provedores, dispositivos, 48 h, comparação com a média, receita; filtra cliques de robôs de segurança e separa aberturas automáticas da Apple (também fora dos funis, CRM, A/B e melhor horário)
- ✅ 5. Equipe: Dono/Admin/Editor/Leitor, convite por e-mail (convidado entra direto no espaço), vários espaços por pessoa com troca rápida, proteção do último dono; menu agrupado
- ⏳ 6. Shopify/WooCommerce: carrinho abandonado, produtos, receita por campanha
- ⏳ 7. IA no editor (Workers AI, cota grátis)
- ✅ 8. Melhor horário: cada contato recebe na hora em que costuma abrir (histórico de 180 dias), dentro de 24 h; sem histórico → melhor hora da lista
- ⏳ 9. Checagem de spam e prévia por cliente de e-mail
- ⏳ 10. Funil de vendas no CRM (negócios, etapas, tarefas)
- ⏳ 11. Zapier/Make
- ⏳ 12. SMS e WhatsApp (conta Twilio/Meta do próprio cliente)

## Lançamento (1/2)
- ✅ Landing com preços + cadastro, Termos, Política de Uso Aceitável e Privacidade (LGPD) em app.novamail.nexaclouds.online (revisar com advogado antes de escala)
- 🔒 Domínio próprio da marca (hoje *.novamail.nexaclouds.online)
