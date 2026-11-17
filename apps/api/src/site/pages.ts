import { API_DOCS, esc, type Page } from "./layout";

const code = (s: string) => `<pre><code>${esc(s)}</code></pre>`;
const steps = (items: [string, string][]) =>
  `<div class="grid">${items.map(([h, p], i) => `<div class="card"><h3>${i + 1}. ${h}</h3><p>${p}</p></div>`).join("")}</div>`;
const cards = (items: [string, string][]) => `<div class="grid">${items.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>`;

const PLANS_TABLE = `<table><thead><tr><th>Plan</th><th>Price</th><th>Emails / month</th><th>Emails / day</th><th>Sending domains</th></tr></thead><tbody>
<tr><td><strong>Free</strong></td><td>$0</td><td>3,000</td><td>100</td><td>1</td></tr>
<tr><td><strong>Pro</strong></td><td>$15 / month</td><td>50,000</td><td>10,000</td><td>10</td></tr>
<tr><td><strong>Scale</strong></td><td>$60 / month</td><td>250,000</td><td>50,000</td><td>100</td></tr></tbody></table>
<p>Every plan includes campaigns, contact lists, the email API, SMTP, webhooks and unlimited contacts. Upgrade or cancel any time from your dashboard.</p>`;

const CURL = `curl https://api.novamail.nexaclouds.online/emails \\
  -H "Authorization: Bearer nm_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Your Store <hello@mail.yourstore.com>",
    "to": "customer@example.com",
    "subject": "Your order is confirmed",
    "html": "<p>Thanks for your order!</p>"
  }'`;

const NODE = `import { Resend } from "resend";

// Same SDK, different base URL.
const nova = new Resend(process.env.NOVAMAIL_API_KEY, {
  baseUrl: "https://api.novamail.nexaclouds.online",
});

await nova.emails.send({
  from: "Your Store <hello@mail.yourstore.com>",
  to: "customer@example.com",
  subject: "Your order is confirmed",
  html: "<p>Thanks for your order!</p>",
});`;

const PY = `import requests

r = requests.post(
    "https://api.novamail.nexaclouds.online/emails",
    headers={"Authorization": "Bearer nm_your_api_key"},
    json={
        "from": "Your Store <hello@mail.yourstore.com>",
        "to": "customer@example.com",
        "subject": "Your order is confirmed",
        "html": "<p>Thanks for your order!</p>",
    },
    timeout=10,
)
print(r.json())  # {"id": "..."}`;

const WHAT_YOU_GET = cards([
  ["Campaigns & newsletters", "Write your email, pick a contact list and send. Personalise with <code>{{first_name}}</code>. Sending happens in safe batches and pauses automatically if you reach your plan limit."],
  ["Contact lists", "Create lists for customers, leads or newsletter subscribers. Paste or import a CSV (email, first name, last name). Duplicates are merged automatically."],
  ["One-click unsubscribe", "Every campaign carries the RFC 8058 unsubscribe headers Gmail and Yahoo require, plus a link you can place in the footer. Unsubscribed people are never emailed again."],
  ["Works with Claude Code & Codex", "Connect your AI coding agent over MCP to build templates, lists and funnels for you — with a restricted key that can't send or activate anything without you."],
  ["Your own domain", "Send from <code>hello@yourbrand.com</code>, not from a shared address. We give you the SPF, DKIM and DMARC records and check them live."],
  ["Drag-and-drop templates", "8 ready-made designs. Drag blocks, drop new images or GIFs, turn videos into looping GIFs, or paste your own HTML."],
  ["Funnels", "Automated sequences: welcome series, onboarding, abandoned cart — with waits between emails."],
  ["Transactional email API", "Order confirmations, password resets and receipts from your app or store, through a REST API compatible with the Resend SDKs, or plain SMTP."],
  ["Bounce & complaint protection", "Hard bounces and spam complaints are suppressed automatically, which protects your sender reputation and keeps your emails out of spam."],
]);

const HOW = steps([
  ["Create your free account", "Sign in with your email — no password and no credit card. You get 3,000 emails a month for free."],
  ["Add your domain", "Add <code>mail.yourbrand.com</code>, copy the DNS records we show into your DNS provider and click Verify."],
  ["Import your contacts", "Create a list and paste your customers' emails (or a CSV with names)."],
  ["Send your first campaign", "Write the subject and content, choose the list and press Send. Track sent, bounced and unsubscribed in the dashboard."],
]);

export const PAGES: Page[] = [
  {
    path: "/",
    title: "NovaMail — Email marketing & email API, free to start",
    description: "Send email campaigns and newsletters to your customers from your own domain. Contact lists, one-click unsubscribe, email API and SMTP. 3,000 emails/month free.",
    h1: "Email marketing for your customers. Simple, fast and free to start.",
    lead: "Send newsletters, promotions and announcements to your customers from your own domain — and order confirmations from your store or app. 3,000 emails a month free, paid plans from $15.",
    alternates: { en: "/", pt: "/pt/" },
    priority: 1,
    body: `<section><h2>Everything you need to email your customers</h2>${WHAT_YOU_GET}</section>
<section><h2>Start sending in four steps</h2>${HOW}</section>
<section><h2>Simple pricing</h2>${PLANS_TABLE}</section>
<section class="prose"><h2>Built for deliverability</h2><p>NovaMail runs its own mail servers. Every sending domain is authenticated with SPF, DKIM (2048-bit keys) and DMARC; every marketing email carries one-click unsubscribe; hard bounces and complaints are suppressed automatically; and accounts that send to bad lists are paused before they can hurt anyone else's delivery. That is exactly what Gmail, Yahoo and Outlook check in 2026.</p>
<h2>For developers too</h2><p>Use the REST API (compatible with the Resend SDKs — change only the base URL) or SMTP on port 587. Signed webhooks tell your app when an email is delivered, delayed, bounced or marked as spam. <a href="${API_DOCS}">Read the API reference</a>.</p>${code(CURL)}</section>`,
    faq: [
      ["What is NovaMail?", "NovaMail is an email marketing and transactional email platform. You can send campaigns and newsletters to your contact lists from your own domain, and send automatic emails (order confirmations, password resets) from your website or app through an API or SMTP."],
      ["Is there a free plan?", "Yes. The Free plan includes 3,000 emails per month (100 per day) and one sending domain, with no credit card required. Pro is $15/month for 50,000 emails and Scale is $60/month for 250,000 emails."],
      ["Can I send newsletters and promotions?", "Yes. Create a contact list, import your customers and send a campaign. Every campaign includes one-click unsubscribe, which Gmail and Yahoo require for bulk senders."],
      ["Do I need my own domain?", "Yes. You send from your own domain (for example hello@yourbrand.com). NovaMail shows the SPF, DKIM and DMARC records to add and verifies them for you. Using your own domain is what keeps your emails out of spam."],
      ["Can I import contacts from Mailchimp or a spreadsheet?", "Yes. Export your list as CSV (email, first name, last name) and paste or upload it into a NovaMail list. Only import people who agreed to receive your emails."],
      ["Is NovaMail compatible with the Resend API?", "Yes. The /emails and /emails/batch endpoints accept the same payloads as Resend, so the official Resend SDKs work by changing only the base URL to https://api.novamail.nexaclouds.online."],
      ["Do you allow purchased lists or cold email?", "No. NovaMail is for people who opted in to hear from you. Purchased, rented or scraped lists are forbidden by our Acceptable Use Policy, and accounts with high bounce or complaint rates are paused automatically."],
    ],
  },
  {
    path: "/pt/",
    lang: "pt-BR",
    title: "NovaMail — E-mail marketing e API de e-mail, grátis para começar",
    description: "Envie campanhas e newsletters para seus clientes com o seu domínio. Listas de contatos, descadastro em 1 clique, API e SMTP. 3.000 e-mails/mês grátis.",
    h1: "E-mail marketing para os seus clientes. Simples, rápido e grátis para começar.",
    lead: "Envie newsletters, promoções e novidades para seus clientes com o seu próprio domínio — e confirmações de pedido da sua loja ou app. 3.000 e-mails por mês grátis, planos a partir de US$15.",
    alternates: { en: "/", pt: "/pt/" },
    priority: 0.9,
    body: `<section><h2>Tudo para mandar e-mail aos seus clientes</h2>${cards([
      ["Campanhas e newsletters", "Escreva, escolha a lista e envie. Personalize com <code>{{first_name}}</code>. O envio é feito em lotes seguros e pausa sozinho se o limite do plano acabar."],
      ["Listas de contatos", "Crie listas de clientes, leads ou assinantes. Cole ou importe um CSV (e-mail, nome, sobrenome). Duplicados são unidos automaticamente."],
      ["Descadastro em 1 clique", "Toda campanha leva o descadastro exigido por Gmail e Yahoo. Quem sai nunca mais recebe."],
      ["Seu próprio domínio", "Envie como <code>contato@suamarca.com</code>. Mostramos os registros SPF, DKIM e DMARC e verificamos na hora."],
      ["API e SMTP", "Confirmações de pedido, senhas e recibos do seu site ou app pela API (compatível com Resend) ou por SMTP."],
      ["Proteção de reputação", "Devoluções e reclamações viram supressão automática — seus e-mails continuam chegando na caixa de entrada."],
    ])}</section>
<section><h2>Comece em quatro passos</h2>${steps([
      ["Crie sua conta grátis", "Entre com seu e-mail — sem senha e sem cartão."],
      ["Adicione seu domínio", "Copie os registros DNS que mostramos e clique em Verificar."],
      ["Importe seus contatos", "Crie uma lista e cole os e-mails dos seus clientes."],
      ["Envie sua campanha", "Assunto, conteúdo, lista e Enviar. Acompanhe no painel."],
    ])}</section>
<section><h2>Preços</h2><table><thead><tr><th>Plano</th><th>Preço</th><th>E-mails/mês</th><th>Domínios</th></tr></thead><tbody><tr><td><strong>Free</strong></td><td>US$0</td><td>3.000</td><td>1</td></tr><tr><td><strong>Pro</strong></td><td>US$15/mês</td><td>50.000</td><td>10</td></tr><tr><td><strong>Scale</strong></td><td>US$60/mês</td><td>250.000</td><td>100</td></tr></tbody></table></section>`,
    faq: [
      ["O que é o NovaMail?", "Uma plataforma de e-mail marketing e e-mail transacional: você envia campanhas e newsletters para suas listas com o seu domínio e e-mails automáticos (pedidos, senhas) do seu site ou app por API ou SMTP."],
      ["Tem plano grátis?", "Sim: 3.000 e-mails por mês, 100 por dia e 1 domínio, sem cartão. Pro custa US$15/mês (50.000 e-mails) e Scale US$60/mês (250.000)."],
      ["Posso usar listas compradas?", "Não. Só envie para quem aceitou receber seus e-mails. Contas com muitas devoluções ou reclamações são pausadas automaticamente."],
    ],
  },
  {
    path: "/email-marketing",
    title: "Email Marketing Platform — Campaigns & Newsletters | NovaMail",
    description: "Send email campaigns and newsletters to your customers from your own domain. Contact lists, CSV import, personalization and one-click unsubscribe. Free plan.",
    h1: "Email marketing: campaigns and newsletters to your customers",
    lead: "Import your customers, write your email and send it from your own domain — with the one-click unsubscribe and authentication Gmail and Yahoo require. Free for up to 3,000 emails a month.",
    priority: 0.95,
    body: `<section><h2>How a campaign works</h2>${HOW}</section>
<section><h2>What you can send</h2>${cards([
      ["Newsletters", "Weekly or monthly updates to your subscribers."],
      ["Promotions & launches", "New products, seasonal sales, coupons and announcements."],
      ["Customer updates", "Policy changes, new features, store hours, events."],
      ["Re-engagement", "Win back customers who haven't bought in a while (only people who opted in)."],
    ])}</section>
<section class="prose"><h2>Personalization</h2><p>Use <code>{{first_name}}</code>, <code>{{last_name}}</code> and <code>{{email}}</code> in the subject and body. Place <code>{{unsubscribe_url}}</code> in your footer — the one-click unsubscribe header is added automatically either way.</p>
<h2>What happens when someone unsubscribes</h2><p>They are marked as unsubscribed in the list and added to your account's suppression list, so no future campaign or API email reaches them. Gmail and Yahoo show their own "Unsubscribe" button because of the RFC 8058 headers we add, which reduces spam complaints.</p>
<h2>Drag-and-drop editor and ready-made templates</h2><p>Start from 8 ready-made templates (newsletter, sale, product launch, welcome, event invitation, abandoned cart, simple text, order confirmation) or a blank canvas. Drag blocks — heading, text, image, GIF, video, button, image + text, divider, HTML — reorder them with your mouse, drop a new image onto any picture to replace it, and preview on desktop and mobile. Prefer code? Paste your own HTML.</p>
<h2>Video in email</h2><p>Gmail and Outlook don't play video inside an email. NovaMail turns your video into a looping, silent animated GIF right in your browser, which plays in every inbox and links to the full video.</p>
<h2>Funnels (automated sequences)</h2><p>Build a welcome series, onboarding or abandoned-cart sequence: when someone joins a list they get email 1, wait any number of days, get email 2, and so on. People who unsubscribe leave the funnel automatically.</p>
<h2>Do it by API</h2><p>Lists, contacts and campaigns are also available through the API (<code>/audiences</code>, <code>/audiences/{id}/contacts</code>, <code>/broadcasts</code>), so you can sync customers from your store automatically.</p></section>`,
    faq: [
      ["How many contacts can I have?", "Contacts are unlimited on every plan; you pay for emails sent. The Free plan sends 3,000 emails per month."],
      ["Can I schedule a campaign?", "Campaigns go out in batches as soon as you press Send. For timed sequences, use a funnel: each email waits the number of days or hours you choose."],
      ["Is there a drag-and-drop editor?", "Yes. Pick a ready-made template or start blank, drag blocks into place, replace images by dropping a file on them, and preview on desktop and mobile. You can also paste your own HTML."],
      ["Can I build automated email sequences?", "Yes. Funnels send a series of emails automatically when someone joins a list or when your app enrolls them through the API, with waits between emails."],
      ["Will my emails go to spam?", "Deliverability depends on your domain authentication, list quality and content. NovaMail handles SPF, DKIM, DMARC, one-click unsubscribe and bounce suppression; you should only email people who opted in."],
    ],
  },
  {
    path: "/pricing",
    title: "Pricing — Free, Pro $15 and Scale $60 | NovaMail",
    description: "NovaMail pricing: Free 3,000 emails/month, Pro $15/month for 50,000 emails, Scale $60/month for 250,000 emails. Campaigns, API and SMTP on every plan.",
    h1: "Pricing: start free, pay only when you grow",
    lead: "Every plan includes campaigns, contact lists, the email API, SMTP and webhooks. No setup fees, no contact limits, cancel any time.",
    priority: 0.9,
    body: `<section>${PLANS_TABLE}</section>
<section class="prose"><h2>What counts as an email?</h2><p>Each recipient of each message is one email. A campaign to 2,000 contacts uses 2,000 emails; an order confirmation to one customer uses one.</p>
<h2>What happens if I hit my limit?</h2><p>API requests return HTTP 429 with a clear message and running campaigns pause automatically. Upgrade in the dashboard and sending resumes immediately.</p></section>`,
    faq: [
      ["Do I need a credit card for the Free plan?", "No. You only add a card when you upgrade to Pro or Scale, through Stripe Checkout."],
      ["Can I cancel at any time?", "Yes, from the billing portal in your dashboard. Paid access lasts until the end of the period you paid for."],
      ["Are contacts limited?", "No. Plans are priced by emails sent, not by contacts stored."],
    ],
  },
  {
    path: "/transactional-email-api",
    title: "Transactional Email API — Resend-compatible | NovaMail",
    description: "Send order confirmations, password resets and receipts with a REST email API compatible with the Resend SDKs. Idempotency keys, signed webhooks, OpenAPI 3.1.",
    h1: "Transactional email API for your app or store",
    lead: "Order confirmations, password resets, receipts and alerts — sent from your domain through a clean REST API that speaks the Resend format.",
    priority: 0.8,
    body: `<section><h2>Send your first email</h2>${code(CURL)}<h3>Node.js (official Resend SDK)</h3>${code(NODE)}</section>
<section>${cards([
      ["Idempotency keys", "Send <code>Idempotency-Key</code> and retries never create duplicates."],
      ["Batch sending", "<code>POST /emails/batch</code> sends up to 100 different emails in one call."],
      ["Signed webhooks", "Standard Webhooks signatures for delivered, delayed, bounced and complained events."],
      ["Scoped API keys", "Full-access keys for your backend, sending-only keys locked to one domain for your app."],
      ["Suppression list", "Bounced and unsubscribed addresses are skipped automatically, with an API to manage them."],
      ["OpenAPI 3.1", `Machine-readable spec and an interactive reference at <a href="${API_DOCS}">the API docs</a>.`],
    ])}</section>`,
    faq: [
      ["Which SDKs can I use?", "Any Resend SDK (Node.js, Python, PHP, Go, Ruby…) by setting the base URL to https://api.novamail.nexaclouds.online, or plain HTTP from any language."],
      ["What are the rate limits?", "Limits follow your plan: 100 emails/day on Free, 10,000/day on Pro and 50,000/day on Scale."],
    ],
  },
  {
    path: "/smtp-relay",
    title: "SMTP Relay with TLS 1.3 — Free tier | NovaMail",
    description: "Reliable SMTP relay for WordPress, Shopify apps, CRMs and legacy systems. Port 587 with STARTTLS (TLS 1.3), your own domain, DKIM signing. Free 3,000 emails/month.",
    h1: "SMTP relay for WordPress, CRMs and any system that speaks SMTP",
    lead: "Point your website, plugin or software at NovaMail's SMTP server and your emails go out from your own authenticated domain.",
    priority: 0.7,
    body: `<section><table><tbody><tr><th>Host</th><td><code>postal.novamail.nexaclouds.online</code></td></tr><tr><th>Port</th><td><code>587</code> (STARTTLS, TLS 1.3) — port 25 also available</td></tr><tr><th>Username / password</th><td>Shown once when you create your account</td></tr><tr><th>Authentication</th><td>PLAIN, LOGIN or CRAM-MD5</td></tr></tbody></table></section>
<section class="prose"><h2>Works with</h2><p>WordPress (WP Mail SMTP and similar plugins), WooCommerce, Magento, Odoo, Laravel, Django, Rails, Nodemailer, PHPMailer and any device or app with SMTP settings.</p>
<h2>Same protections as the API</h2><p>Messages sent over SMTP are DKIM-signed with your domain, counted against your plan and protected by the same bounce and complaint suppression.</p></section>`,
  },
];
