import { EXPLAIN_CSS, costChart, howItWorks } from "./explainers";
import { home, HOME_CSS } from "./home";
import { pricingCards } from "./pricing";
import { API_DOCS, esc, type Page } from "./layout";

const HOME_EN = home("en");
const HOME_PT = home("pt-BR");

const code = (s: string) => `<pre><code>${esc(s)}</code></pre>`;
const steps = (items: [string, string][]) =>
  `<div class="grid">${items.map(([h, p], i) => `<div class="card"><h3>${i + 1}. ${h}</h3><p>${p}</p></div>`).join("")}</div>`;
const cards = (items: [string, string][]) => `<div class="grid">${items.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>`;

const PLANS_TABLE = `<table><thead><tr><th>Plan</th><th>Price</th><th>Emails / month</th><th>Emails / day</th><th>Sending domains</th></tr></thead><tbody>
<tr><td><strong>Starter</strong></td><td>$12 / month</td><td>10,000</td><td>2,000</td><td>3</td></tr>
<tr><td><strong>Pro</strong></td><td>$25 / month</td><td>30,000</td><td>10,000</td><td>10</td></tr>
<tr><td><strong>Scale</strong></td><td>$79 / month</td><td>100,000</td><td>30,000</td><td>100</td></tr></tbody></table>
<p>Yearly billing: pay 10 months, get 12. Every plan includes campaigns, contact lists, the email API, webhooks and unlimited contacts. Extra +10,000 emails/month for $10/month. There is no free plan: you can create an account and set everything up, and sending starts with a subscription. Upgrade or cancel any time from your dashboard.</p>`;

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
  ["Drag-and-drop templates", "30 ready-made designs. Drag blocks, drop new images or GIFs, turn videos into looping GIFs, or paste your own HTML."],
  ["Visual funnels", "Drag-and-connect automation builder with waits, Yes/No conditions on opens, clicks and tags, and ready-made recipes."],
  ["Transactional email API", "Order confirmations, password resets and receipts from your app or store, through a REST API compatible with the Resend SDKs."],
  ["Bounce & complaint protection", "Hard bounces and spam complaints are suppressed automatically, which protects your sender reputation and keeps your emails out of spam."],
]);

const HOW = steps([
  ["Create your account and pick a plan", "Sign in with your email — no password. Plans start at $12/month for 10,000 emails."],
  ["Add your domain", "Add <code>mail.yourbrand.com</code>, copy the DNS records we show into your DNS provider and click Verify."],
  ["Import your contacts", "Create a list and paste your customers' emails (or a CSV with names)."],
  ["Send your first campaign", "Write the subject and content, choose the list and press Send. Track sent, bounced and unsubscribed in the dashboard."],
]);

export const PAGES: Page[] = [
  {
    path: "/",
    title: "NovaMail — Email Marketing + CRM that reaches the inbox | From $12/mo",
    description: "Email marketing with a built-in CRM: campaigns, automated funnels, contact profiles, engagement scoring and smart segments — from your own domain. Plans from $12/month.",
    h1: "Turn your customer list into sales — with emails that reach the inbox.",
    lead: "Send newsletters, promotions and announcements to your customers from your own domain — and order confirmations from your store or app. Plans from $12/month for 10,000 emails, unlimited contacts.",
    alternates: { en: "/", pt: "/pt/" },
    priority: 1,
    ...HOME_EN,
    extraCss: HOME_CSS,
    faq: [
      ["What is NovaMail?", "NovaMail is an email marketing and transactional email platform. You can send campaigns and newsletters to your contact lists from your own domain, and send automatic emails (order confirmations, password resets) from your website or app through an API."],
      ["Is there a free plan?", "No. NovaMail is paid-only, which keeps spammers off the platform and protects everyone's delivery. You can create an account and set up domains, lists, templates and funnels before subscribing. Starter is $12/month for 10,000 emails, Pro $25/month for 30,000 and Scale $79/month for 100,000."],
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
    title: "NovaMail — E-mail marketing + CRM, a partir de US$12/mês",
    description: "E-mail marketing com CRM embutido: campanhas, funis automáticos, ficha de cada contato, pontuação de engajamento e segmentos — com o seu domínio. Planos a partir de US$12/mês.",
    h1: "Transforme sua lista de clientes em vendas — com e-mails que chegam na caixa de entrada.",
    lead: "Envie newsletters, promoções e novidades para seus clientes com o seu próprio domínio — e confirmações de pedido da sua loja ou app. Planos a partir de US$12/mês para 10.000 e-mails, contatos ilimitados.",
    alternates: { en: "/", pt: "/pt/" },
    priority: 0.9,
    ...HOME_PT,
    extraCss: HOME_CSS,
    faq: [
      ["O que é o NovaMail?", "Uma plataforma de e-mail marketing e e-mail transacional: você envia campanhas e newsletters para suas listas com o seu domínio e e-mails automáticos (pedidos, senhas) do seu site ou app por API."],
      ["Tem plano grátis?", "Não. O NovaMail é só pago, o que mantém spammers fora e protege a entrega de todos. Você pode criar a conta e configurar domínios, listas, modelos e funis antes de assinar. Starter custa US$12/mês (10.000 e-mails), Pro US$25/mês (30.000) e Scale US$79/mês (100.000)."],
      ["Posso usar listas compradas?", "Não. Só envie para quem aceitou receber seus e-mails. Contas com muitas devoluções ou reclamações são pausadas automaticamente."],
    ],
  },
  {
    path: "/email-marketing",
    title: "Email Marketing Platform — Campaigns & Newsletters | NovaMail",
    description: "Send email campaigns and newsletters to your customers from your own domain. Contact lists, CSV import, personalization and one-click unsubscribe. From $12/month.",
    h1: "Email marketing: campaigns and newsletters to your customers",
    lead: "Import your customers, write your email and send it from your own domain — with the one-click unsubscribe and authentication Gmail and Yahoo require. Plans from $12/month for 10,000 emails.",
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
<h2>Drag-and-drop editor and ready-made templates</h2><p>Start from 30 ready-made templates (holidays and sales, newsletter, product launch, welcome, event invitation, abandoned cart, order confirmation and everyday designs) or a blank canvas. Drag blocks — heading, text, image, GIF, video, button, image + text, divider, HTML — reorder them with your mouse, drop a new image onto any picture to replace it, and preview on desktop and mobile. Prefer code? Paste your own HTML.</p>
<h2>Video in email</h2><p>Gmail and Outlook don't play video inside an email. NovaMail turns your video into a looping, silent animated GIF right in your browser, which plays in every inbox and links to the full video.</p>
<h2>Funnels with a visual node builder</h2><p>Drag steps onto a canvas and connect them with your mouse: a trigger (joined a list, got a tag, or your app's API), emails, waits, conditions with Yes/No paths (opened or clicked the previous email, has a tag, is on a list) and tag actions. Start from ready-made recipes — welcome series, abandoned cart, re-engagement — and see how many people are at each step. People who unsubscribe leave automatically.</p>
<h2>Opens and clicks</h2><p>Campaigns and funnels track opens and clicks with first-party, signed links, so your funnels can react ("didn't click? send a reminder"). Apple Mail Privacy Protection can inflate opens, so clicks are the stronger signal.</p>
<h2>Do it by API</h2><p>Lists, contacts and campaigns are also available through the API (<code>/audiences</code>, <code>/audiences/{id}/contacts</code>, <code>/broadcasts</code>), so you can sync customers from your store automatically.</p></section>`,
    faq: [
      ["How many contacts can I have?", "Contacts are unlimited on every plan; you pay for emails sent. Starter includes 10,000 emails per month."],
      ["Can I schedule a campaign?", "Campaigns go out in batches as soon as you press Send. For timed sequences, use a funnel: each email waits the number of days or hours you choose."],
      ["Is there a drag-and-drop editor?", "Yes. Pick a ready-made template or start blank, drag blocks into place, replace images by dropping a file on them, and preview on desktop and mobile. You can also paste your own HTML."],
      ["Can I build automated email sequences?", "Yes. Funnels send a series of emails automatically when someone joins a list or when your app enrolls them through the API, with waits between emails."],
      ["Will my emails go to spam?", "Deliverability depends on your domain authentication, list quality and content. NovaMail handles SPF, DKIM, DMARC, one-click unsubscribe and bounce suppression; you should only email people who opted in."],
    ],
  },
  {
    path: "/pricing",
    title: "Pricing — Starter $12, Pro $25, Scale $79 per month | NovaMail",
    description: "NovaMail pricing: Starter $12/month (10,000 emails), Pro $25/month (30,000), Scale $79/month (100,000). Yearly: pay 10 months, get 12. Campaigns, funnels, CRM and API, unlimited contacts.",
    h1: "Pricing: priced by emails sent, never by contacts",
    lead: "Every plan includes every feature — automations, CRM and sales pipeline, forms, A/B tests, AI writer, Shopify revenue, SMS/WhatsApp and the API. Unlimited contacts, cancel any time.",
    priority: 0.9,
    extraCss: EXPLAIN_CSS,
    body: `<section>${pricingCards("en")}</section>${costChart()}${howItWorks()}
<section style="margin-top:28px">${PLANS_TABLE}</section>
<section class="prose"><h2>What counts as an email?</h2><p>Each recipient of each message is one email. A campaign to 2,000 contacts uses 2,000 emails; an order confirmation to one customer uses one.</p>
<h2>What happens if I hit my limit?</h2><p>API requests return HTTP 429 with a clear message and running campaigns pause automatically. Upgrade in the dashboard and sending resumes immediately.</p></section>`,
    faq: [
      ["Do I need a card to create an account?", "No. You can create an account and set everything up first; you add a card when you subscribe to a plan, through Stripe Checkout. Sending starts with a subscription."],
      ["Can I cancel at any time?", "Yes, from the billing portal in your dashboard. Paid access lasts until the end of the period you paid for."],
      ["Are contacts limited?", "No. Plans are priced by emails sent, not by contacts stored."],
    ],
  },
  {
    path: "/crm",
    title: "Email Marketing CRM with Engagement Scoring | NovaMail",
    description: "A CRM built for email marketing: contact profiles with opens, clicks and funnels, automatic engagement scoring, smart segments, custom fields and CSV import. Included in every plan.",
    h1: "The CRM built for email marketing",
    lead: "Every contact gets a living profile — opens, clicks, tags, lists, funnels, notes and your own fields — with automatic engagement scoring and segments that update themselves.",
    priority: 0.85,
    body: `<section>${cards([
      ["Engagement scoring", "Each contact is scored 0–100 and labeled hot, warm or cold from recent opens and clicks (clicks weigh more, because Apple Mail Privacy inflates opens)."],
      ["Smart segments", "Combine rules — tag, list, score, clicked or opened in the last N days, join date, company or any custom field — with a live count. Segments update themselves."],
      ["Complete timeline", "Every email sent, open, click, bounce, tag change, list join, funnel step and note — in order, on one screen."],
      ["Custom fields", "Create fields like City, Last order value or Birthday and import them from any CSV. Use them in segments."],
      ["Bulk actions", "Select contacts to tag, untag or add to a list in one click. Export everything to CSV (spreadsheet-safe)."],
      ["Privacy built in", "Delete a person everywhere with one click (GDPR/LGPD right to erasure). Unsubscribes are honoured across every list."],
    ])}</section>
<section class="prose"><h2>From segment to campaign in one click</h2><p>Build a segment like “clicked in the last 7 days <em>and</em> tagged <code>vip</code>”, watch the count update live, and press <strong>Send campaign</strong> — NovaMail freezes the segment into a list and opens the campaign composer with it selected.</p>
<h2>Feeds your funnels</h2><p>Tags written by your store (<code>POST /contacts/tags</code>) or by funnel steps start other funnels, and funnel conditions can branch on tags and engagement. The CRM and automations share one source of truth.</p></section>`,
    faq: [
      ["Is the CRM included in every plan?", "Yes. Contacts are unlimited on every plan, and the CRM, segments and scoring are included at no extra cost."],
      ["How is the engagement score calculated?", "From opens and clicks in the last 30 days plus recency. Clicks weigh more than opens. Unsubscribed contacts score 0."],
      ["Can I import my existing contacts?", "Yes — paste or upload a CSV. Known columns (email, first_name, last_name, phone, company, tags) map automatically; any other column becomes a custom field."],
    ],
  },
  {
    path: "/integrations",
    title: "NovaMail Integrations: Zapier, Make, n8n, Shopify, WooCommerce | NovaMail",
    description: "Connect NovaMail to Shopify, WooCommerce, Zapier, Make and n8n. Instant triggers for new contacts, orders, abandoned carts, deals and email events; actions to add contacts, tag, send email and create deals.",
    h1: "Connect NovaMail to everything you use",
    lead: "Native Shopify and WooCommerce sync for abandoned carts and revenue, plus instant triggers and actions for Zapier, Make and n8n — and Claude Code or Codex through MCP.",
    priority: 0.8,
    body: `<section>${cards([
      ["Shopify", "Orders, checkouts and products sync through signed webhooks. Abandoned carts start your recovery funnel; revenue is attributed to the campaign or funnel that drove it."],
      ["WooCommerce", "Orders and products sync through signed WooCommerce webhooks; carts can be sent through the API."],
      ["Zapier", "Instant triggers (REST hooks): new contact, tagged, unsubscribed, form submitted, new order, cart abandoned, deal won, email opened/clicked/bounced. Actions: add contact, tag, send email, create deal, create task, record order."],
      ["Make & n8n", "Use any webhook module: subscribe with one API call, receive signed JSON events, map fields from sample payloads."],
      ["Claude Code & Codex", "A least-privilege MCP server lets AI agents build funnels and templates without touching billing, keys or sending."],
      ["REST API", "Resend-compatible email API, contacts, segments, campaigns, funnels, deals, tasks and commerce — documented with OpenAPI."],
    ])}</section>
<section class="prose"><h2>Instant triggers in one call</h2><p><code>POST /integrations/subscriptions {"target_url": "https://your-hook", "event": "order.created"}</code> — NovaMail then POSTs every matching event, signed with Standard Webhooks headers. Remove it with <code>DELETE /integrations/subscriptions/{id}</code>. Sample payloads: <code>GET /integrations/samples/{event}</code>.</p></section>`,
    faq: [
      ["Does NovaMail work with Shopify?", "Yes. Add three kinds of webhooks in Shopify (orders, checkouts, products) and paste the signing key. NovaMail recovers abandoned carts, shows products in emails and attributes revenue."],
      ["Can I use NovaMail with Zapier or Make?", "Yes — instant triggers via REST hooks and actions over the REST API. Any automation tool that can receive a webhook works."],
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
      ["What are the rate limits?", "Limits follow your plan: up to 2,000 emails/day on Starter, 10,000/day on Pro and 30,000/day on Scale."],
    ],
  },
];
