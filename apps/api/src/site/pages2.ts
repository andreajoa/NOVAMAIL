import { EXPLAIN_CSS, costChart, howItWorks } from "./explainers";
import { API_DOCS, esc, type Page } from "./layout";
import { EXTRA_PACK, PAID_PLANS, PLANS } from "../lib/plans";

const code = (s: string) => `<pre><code>${esc(s)}</code></pre>`;

// (kept for other pages)
const NOVAMAIL_ROWS: [string, string][] = [
  ["Plans", "Starter $12/mo (10,000 emails) · Pro $25/mo (30,000) · Scale $79/mo (100,000); yearly: pay 10 months, get 12"],
  ["Free plan", "None — paid-only, which keeps spammers off the platform"],
  ["Contacts", "Unlimited on every plan — priced by emails sent"],
  ["Campaigns & lists", "Yes — lists, CSV import, personalization, one-click unsubscribe"],
  ["Email API", "REST, compatible with the Resend SDKs; OpenAPI 3.1"],
  ["Domain authentication", "SPF, DKIM 2048-bit, DMARC guidance, live verification"],
  ["Webhooks", "Standard Webhooks (signed)"],
  ["Editor & templates", "Drag-and-drop editor, 30 ready-made templates (US holidays + everyday), GIFs, video-to-GIF, or paste HTML"],
  ["AI writing", "Draft a whole email from a brief, rewrite or translate any block, subject-line ideas → one-click A/B test"],
  ["Campaigns", "A/B subject tests with automatic winner, scheduling, smart send time per contact, resend to non-openers"],
  ["Signup forms", "Inline, popup (time, scroll, exit-intent) and hosted pages with double opt-in, bot protection and consent records"],
  ["Automations", "Visual node builder: triggers (list, tag, API), waits, Yes/No conditions, tags, email and SMS/WhatsApp steps"],
  ["CRM & sales", "Contact profiles with timeline, engagement scoring, smart segments, deals pipeline, tasks and forecast"],
  ["E-commerce", "Shopify, WooCommerce and API: abandoned-cart recovery, products in emails, revenue per campaign and funnel"],
  ["Reports", "Click map, mailbox providers, devices; security-scanner clicks filtered and Apple privacy opens separated"],
  ["Deliverability", "Pre-send check (spam, Gmail clipping, links, images, DMARC), automatic bounce and complaint suppression"],
  ["SMS & WhatsApp", "With your own Twilio or Meta account — opt-in enforced, STOP handled automatically"],
  ["Teams & integrations", "Owner/Admin/Editor/Viewer roles, Zapier/Make/n8n instant triggers, MCP for Claude Code and Codex"],
];

// Everything below is true of NovaMail on every plan; volumes are the only difference between plans.
const INCLUDED: [string, string][] = [
  ["Drag-and-drop editor + 30 templates", "US holidays and everyday designs; paste HTML; video → looping GIF"],
  ["AI email writer", "Full draft from a brief, rewrite/translate blocks, subject ideas"],
  ["A/B subject tests", "Automatic winner sent to the rest of the list"],
  ["Smart send time", "Each contact gets the email at the hour they usually open"],
  ["Resend to non-openers", "One click, new subject, only people who didn't open"],
  ["Signup forms, popups & landing pages", "Exit-intent, scroll and timed popups; double opt-in; consent records"],
  ["Visual automations", "Branching funnels with waits, conditions, tags, email and SMS/WhatsApp steps"],
  ["CRM", "Contact timeline, engagement score, smart segments, custom fields"],
  ["Sales pipeline", "Deals, stages, tasks, weighted forecast; won deals trigger emails"],
  ["Shopify & WooCommerce", "Abandoned-cart recovery, products in emails, revenue per campaign"],
  ["Honest reports", "Click map, providers, devices; bot clicks filtered, Apple privacy opens separated"],
  ["Pre-send check", "Spam signals, Gmail clipping, broken links, missing alt text, DMARC"],
  ["SMS & WhatsApp", "Your own Twilio or Meta account — opt-in and STOP handled"],
  ["Team seats with roles", "Owner, Admin, Editor, Viewer"],
  ["Zapier, Make, n8n", "Instant triggers for contacts, orders, carts, deals and email events"],
  ["Email API", "Resend-compatible REST API, signed webhooks"],
  ["Claude Code & Codex (MCP)", "Let AI agents build funnels with least-privilege keys"],
  ["Unlimited contacts", "You pay for emails sent, never for the size of your list"],
];

const WINS: [string, string][] = [
  ["Pay for emails, not contacts", "Your list can grow without your bill growing. Send less in a quiet month, pay less."],
  ["Everything on every plan", "Automations, CRM, forms, A/B tests, AI and reports aren't locked behind a higher tier."],
  ["Money you can see", "Shopify/WooCommerce revenue is attributed to the exact campaign or funnel that earned it."],
  ["Numbers you can trust", "Security-scanner clicks are filtered and Apple's automatic opens are shown separately."],
  ["Inbox first", "Your own domain, SPF/DKIM/DMARC checked live, a pre-send check and automatic bounce and complaint suppression."],
  ["One tool instead of five", "Email, CRM, pipeline, forms, SMS/WhatsApp and transactional email share one contact record."],
];

/** Cheapest plan (+ extra packs) that covers a monthly volume, from the real plan table. */
function cheapestPlan(emails: number): string {
  const options = PAID_PLANS.map((id) => {
    const p = PLANS[id];
    const packs = Math.max(0, Math.ceil((emails - p.monthly) / EXTRA_PACK.monthly));
    return { label: p.label, packs, price: p.priceUsd + packs * EXTRA_PACK.priceUsd, yearly: packs ? null : (p.priceUsd * 10) / 12 };
  }).sort((a, b) => a.price - b.price);
  const o = options[0]!;
  const yearly = o.yearly ? ` ($${o.yearly.toFixed(2).replace(/\.00$/, "")}/mo yearly)` : "";
  return `${o.label}${o.packs ? ` + ${o.packs} extra pack${o.packs > 1 ? "s" : ""}` : ""} — $${o.price}/mo${yearly}`;
}

/** Rough monthly cost on NovaMail for a list emailed `sends` times a month. */
function costRows(): [string, string, string][] {
  const sizes = [500, 2_500, 10_000, 25_000, 60_000];
  return sizes.map((n) => {
    const emails = n * 4;
    return [n.toLocaleString("en-US"), emails.toLocaleString("en-US"), cheapestPlan(emails)];
  });
}

function compare(o: { slug: string; name: string; kind: "marketing" | "api"; byContacts?: boolean; what: string; why: [string, string][]; switchHow: string; faq: [string, string][] }): Page {
  const n = esc(o.name);
  return {
    path: `/${o.slug}`,
    type: "compare",
    priority: 0.8,
    title: `${o.name} Alternative — All Features, From $12/mo | NovaMail`,
    description: `Switching from ${o.name}? NovaMail includes automations, CRM, forms, A/B tests, AI and Shopify revenue on every plan, unlimited contacts. Starter $12/mo; Pro $25/mo.`,
    h1: `The ${o.name} alternative that includes everything`,
    lead: `${o.what} NovaMail puts campaigns, automations, CRM, a sales pipeline, signup forms, A/B tests, an AI writer and e-commerce revenue tracking on every plan — and you pay for emails sent, not for the size of your list.`,
    extraCss: EXPLAIN_CSS,
    body: `${howItWorks()}${o.byContacts ? costChart(o.name) : ""}<section><h2>Why businesses switch from ${n} to NovaMail</h2><div class="grid">${[...o.why, ...WINS.filter((w) => !(o.why.some(([h]) => /contacts/i.test(h)) && /contacts/i.test(w[0])))].slice(0, 9).map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></section>
<section><h2>Everything included — on every plan</h2><p>Plans only differ in how many emails you send. Every feature below is on Starter, Pro and Scale.</p>
<table><thead><tr><th>Feature</th><th>What you get</th><th>Starter</th><th>Pro</th><th>Scale</th></tr></thead><tbody>${INCLUDED.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td><td>✓</td><td>✓</td><td>✓</td></tr>`).join("")}</tbody></table></section>
<section><h2>What it would cost on NovaMail</h2><p>Example: you email your whole list 4 times a month.</p>
<table><thead><tr><th>Contacts</th><th>Emails / month</th><th>NovaMail plan</th></tr></thead><tbody>${costRows().map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><th>${c}</th></tr>`).join("")}</tbody></table>
<p>Many platforms price by number of contacts, so the bill rises as your list grows even when you send less. Compare with ${n}'s current pricing page — prices and plans change often.</p></section>
<section class="hero" style="text-align:center"><h2>Try it with your own list</h2><p class="lead">Create your account, connect your domain and import your contacts in minutes. Plans from $12/month for 10,000 emails, every feature included.</p><div class="cta" style="justify-content:center"><a class="btn" href="/login">Get started</a><a class="btn g" href="/pricing">See plans</a></div></section>
<section class="prose"><h2>How to switch from ${n}</h2>${o.switchHow}</section>`,
    faq: [
      [`Is NovaMail cheaper than ${o.name}?`, `NovaMail charges by emails sent, with unlimited contacts on every plan: Starter $12/month for 10,000, Pro $25/month for 30,000, Scale $79/month for 100,000 (yearly: pay 10 months, get 12). For lists that grow faster than they're emailed this is usually cheaper — check ${o.name}'s current pricing to compare your exact case.`],
      ["Which features are on the cheapest plan?", "All of them: editor and templates, AI writer, A/B tests, automations, CRM and pipeline, forms and popups, reports, Shopify/WooCommerce, Zapier, SMS/WhatsApp with your own account, team seats and the API. Only the email volume changes between plans."],
      ...o.faq,
    ],
  };
}

const MARKETING_SWITCH = `<ol><li>Create a NovaMail account and add a sending subdomain such as <code>mail.yourbrand.com</code>.</li><li>Publish the SPF, DKIM and DMARC records we show and click Verify.</li><li>Export your <strong>subscribed</strong> contacts as CSV (email, first name, last name) and import them into a NovaMail list. Leave unsubscribed and bounced contacts behind.</li><li>Paste your newsletter HTML into a new campaign and send a test to yourself first.</li><li>Start with your most engaged contacts and grow volume over a couple of weeks.</li></ol>`;
const API_SWITCH = (sdk: string) =>
  `<ol><li>Create a NovaMail account and verify your sending domain.</li><li>Create an API key (sending-only if it lives in your app).</li><li>${sdk}</li><li>Point your webhook endpoint at NovaMail events (Standard Webhooks signature).</li><li>Move traffic gradually: transactional first, then bulk.</li></ol>`;

export const PAGES2: Page[] = [
  compare({
    slug: "mailchimp-alternative",
    byContacts: true,
    name: "Mailchimp",
    kind: "marketing",
    what: "Mailchimp is one of the best-known email marketing platforms, with a large feature set for marketing teams.",
    why: [
      ["Priced by emails, not contacts", "Keep your whole list — including people who rarely open — and only pay for what you send."],
      ["Your own domain from day one", "SPF, DKIM and DMARC checked live in the dashboard."],
      ["Campaigns + transactional in one place", "Newsletters and order confirmations share one account, one domain and one suppression list."],
      ["Developer-friendly", "Resend-compatible API and signed webhooks when you want to automate."],
    ],
    switchHow: MARKETING_SWITCH,
    faq: [
      ["Can I import my Mailchimp audience?", "Yes. Export your subscribed contacts from Mailchimp as CSV and import them into a NovaMail list (email, first name, last name)."],
      ["Does NovaMail have a drag-and-drop editor like Mailchimp?", "Yes: ready-made templates, drag-and-drop blocks, image and GIF uploads, video-to-GIF, desktop/mobile preview, or paste your own HTML."],
    ],
  }),
  compare({
    slug: "brevo-alternative",
    name: "Brevo",
    kind: "marketing",
    what: "Brevo (formerly Sendinblue) combines email marketing, SMS and a CRM in one suite.",
    why: [
      ["Email, CRM, SMS & WhatsApp together", "Same all-in-one idea — with SMS and WhatsApp through your own Twilio or Meta account, so you pay the carrier directly, no message credits."],
      ["Clear limits", "Daily and monthly limits shown in your dashboard, with a 429 and a clear message — never surprise overages."],
      ["Resend-compatible API", "Modern REST API with idempotency keys and signed webhooks."],
      ["Plans from $12/month", "10,000 emails a month with your own domain and every feature."],
    ],
    switchHow: MARKETING_SWITCH,
    faq: [["Can I use NovaMail for both newsletters and transactional email?", "Yes. Campaigns and the API share the same account, domains and suppression list."]],
  }),
  compare({
    slug: "mailerlite-alternative",
    byContacts: true,
    name: "MailerLite",
    kind: "marketing",
    what: "MailerLite is a popular email marketing tool for creators and small businesses.",
    why: [
      ["Unlimited contacts", "Pay by emails sent on every plan."],
      ["Transactional included", "Order and account emails through the API on the same plan."],
      ["Protection built in", "Automatic bounce and complaint suppression and one-click unsubscribe."],
      ["Fast setup", "Sign in with your email, add a domain, import contacts, send."],
    ],
    switchHow: MARKETING_SWITCH,
    faq: [["How do I move my subscribers?", "Export subscribed contacts as CSV from MailerLite and import them into a NovaMail list."]],
  }),
  compare({
    slug: "resend-alternative",
    name: "Resend",
    kind: "api",
    what: "Resend is a modern developer email API with official SDKs for many languages.",
    why: [
      ["Same API shape", "NovaMail implements the Resend /emails and /emails/batch format, so the official SDKs work unchanged."],
      ["Campaigns included", "Lists, contacts and broadcasts with one-click unsubscribe on every plan."],
      ["Plans from $12/month", "10,000 emails a month with your own domain."],
      ["Open standards", "Standard Webhooks signatures and an OpenAPI 3.1 spec."],
    ],
    switchHow: API_SWITCH("Keep the Resend SDK and set <code>baseUrl</code> to <code>https://api.novamail.nexaclouds.online</code>; swap the API key for your <code>nm_</code> key.") + code(`const nova = new Resend(process.env.NOVAMAIL_API_KEY, {\n  baseUrl: "https://api.novamail.nexaclouds.online",\n});`),
    faq: [["Do I need to change my code?", "Only the base URL and the API key. Request and response shapes for sending emails are the same."]],
  }),
  compare({
    slug: "sendgrid-alternative",
    name: "SendGrid",
    kind: "api",
    what: "SendGrid (Twilio) is a long-established email API and marketing platform.",
    why: [
      ["Simple REST API", "One endpoint to send, JSON in and out, Resend-compatible."],
      ["Safe retries", "Idempotency keys make retries safe — no duplicate emails."],
      ["Transparent limits", "Plan limits visible in the dashboard and in /usage."],
      ["Plans from $12/month", "10,000 emails per month, campaigns included."],
    ],
    switchHow: API_SWITCH("Replace the SendGrid client with a single HTTP call to <code>POST /emails</code>."),
    faq: [["Can I keep using SMTP?", "Not at the moment: NovaMail sends through its REST API. Most SMTP setups can be replaced by one HTTP call — see the guides."]],
  }),
  compare({
    slug: "mailgun-alternative",
    name: "Mailgun",
    kind: "api",
    what: "Mailgun (Sinch) is a developer-focused email API with SMTP and validation tools.",
    why: [
      ["Resend-compatible API", "Clean JSON payloads, idempotency keys, batch sending."],
      ["Campaigns built in", "Contact lists and newsletters without another tool."],
      ["Deliverability defaults", "DKIM 2048-bit, one-click unsubscribe, automatic suppression."],
      ["Plans from $12/month", "10,000 emails per month, campaigns included."],
    ],
    switchHow: API_SWITCH("Replace Mailgun's messages endpoint with <code>POST /emails</code>."),
    faq: [["Do you support SMTP?", "Not at the moment — sending is through the REST API (Resend-compatible)."]],
  }),
  compare({
    slug: "postmark-alternative",
    name: "Postmark",
    kind: "api",
    what: "Postmark is known for fast transactional email delivery with separate message streams.",
    why: [
      ["Transactional + marketing", "Both on one plan, with one suppression list."],
      ["Resend-compatible", "Use the Resend SDKs with NovaMail's base URL."],
      ["Signed webhooks", "Standard Webhooks format for delivery events."],
      ["Plans from $12/month", "10,000 emails per month, campaigns included."],
    ],
    switchHow: API_SWITCH("Map Postmark's send call to <code>POST /emails</code> (from, to, subject, html, text)."),
    faq: [["Can I separate transactional and marketing traffic?", "Yes: use different sending subdomains and API keys locked to each domain."]],
  }),
  compare({
    slug: "amazon-ses-alternative",
    name: "Amazon SES",
    kind: "api",
    what: "Amazon SES is AWS's low-level email sending service, configured through the AWS console and IAM.",
    why: [
      ["No AWS setup", "No IAM, no sandbox exit request, no SNS topics for bounces."],
      ["Dashboard included", "Domains, logs, keys, webhooks, lists and campaigns in one place."],
      ["Bounces handled for you", "Automatic suppression and reputation guard."],
      ["Simple pricing", "Starter $12/mo for 10,000 emails; Pro $25/mo for 30,000."],
    ],
    switchHow: API_SWITCH("Replace the SES SDK call with <code>POST /emails</code>."),
    faq: [["Do I need an AWS account?", "No. NovaMail delivers through Amazon SES on its own account and handles domains, bounces, complaints and suppression for you."]],
  }),

  // ---------------- guides ----------------
  {
    path: "/ai-agents",
    title: "Email Marketing with Claude Code & Codex (MCP) | NovaMail",
    description: "Connect Claude Code or Codex to NovaMail over MCP to build email templates, lists and automated funnels — with a restricted agent key that can't send without you.",
    h1: "Let Claude Code or Codex set up your email marketing",
    lead: "NovaMail ships an MCP server. Connect your AI coding agent and ask it to create templates, import contacts and build funnels — while sending and activation stay in your hands.",
    priority: 0.7,
    body: `<section class="prose"><h2>Connect in one line</h2>${code('claude mcp add --transport http novamail https://api.novamail.nexaclouds.online/mcp --header "Authorization: Bearer nm_your_agent_key"')}<p>Codex (<code>~/.codex/config.toml</code>):</p>${code('[mcp_servers.novamail]\nurl = "https://api.novamail.nexaclouds.online/mcp"\nbearer_token_env_var = "NOVAMAIL_AGENT_KEY"')}
<h2>Safe by design</h2><ul><li>Agent keys can create and edit templates, lists and draft funnels/campaigns, and send a test to the owner's inbox.</li><li>They cannot email arbitrary people, send campaigns, activate funnels, delete anything or touch keys, webhooks, domains or billing.</li><li>120 actions per minute per key, every action logged, and the server tells the model to treat contact data and HTML as data, never as instructions.</li></ul>
<h2>Example prompt</h2><p>“Create a 3-email welcome funnel for my store using the Welcome template, waiting 2 days between emails, for the Newsletter list. Send me a test.” Then review it in the dashboard and press Activate.</p></section>`,
    faq: [["Can the AI send emails on its own?", "No. Agent keys can only build drafts and send tests to the account owner. A person activates funnels and sends campaigns in the dashboard."]],
  },
  {
    path: "/guides",
    title: "Email Deliverability & Sending Guides | NovaMail",
    description: "Practical guides: set up SPF, DKIM and DMARC, meet Gmail and Yahoo bulk sender rules, add one-click unsubscribe, and send email from Node.js and Python.",
    h1: "Guides: get your emails into the inbox",
    lead: "Short, practical guides for business owners and developers.",
    priority: 0.6,
    body: `<section><div class="grid">${[
      ["/guides/spf-dkim-dmarc", "SPF, DKIM and DMARC setup", "The three DNS records every sender needs, explained simply."],
      ["/guides/gmail-yahoo-bulk-sender-requirements", "Gmail & Yahoo bulk sender rules", "What changed in 2024 and what you must do in 2026."],
      ["/guides/one-click-unsubscribe", "One-click unsubscribe (RFC 8058)", "The two headers that keep marketing email out of spam."],
      ["/guides/send-email-nodejs", "Send email with Node.js", "From zero to a delivered email in five minutes."],
      ["/guides/send-email-python", "Send email with Python", "The REST API with requests, for scripts, Django and Flask."],
    ].map(([h, t, d]) => `<a class="card" href="${h}" style="text-decoration:none"><h3>${t}</h3><p>${d}</p></a>`).join("")}</div></section>`,
  },
  {
    path: "/guides/spf-dkim-dmarc",
    type: "guide",
    title: "SPF, DKIM and DMARC Setup Guide (2026) | NovaMail",
    description: "What SPF, DKIM and DMARC are, the exact DNS records to add, how to check them and the mistakes that send email to spam. Step by step, with examples.",
    h1: "SPF, DKIM and DMARC: a plain-English setup guide",
    lead: "Three DNS records decide whether Gmail, Outlook and Yahoo trust your emails. Here is what each one does and exactly how to add them.",
    body: `<section class="prose"><h2>SPF — who may send for your domain</h2><p>SPF is a TXT record listing the servers allowed to send email for a domain. Receivers check it against the <em>bounce</em> (envelope) domain, so NovaMail gives you a small bounce subdomain with its own SPF and MX records:</p>${code("nmb.mail.yourbrand.com.  TXT  \"v=spf1 include:amazonses.com ~all\"\nnmb.mail.yourbrand.com.  MX   10 feedback-smtp.us-east-2.amazonses.com.")}<p>Rules: only <strong>one</strong> SPF record per name, and no more than 10 DNS lookups in total. Use a sending subdomain (like <code>mail.</code>) so your main domain's records stay untouched.</p>
<h2>DKIM — a signature on every email</h2><p>DKIM adds a cryptographic signature to each message. The public key lives in DNS under a selector; receivers use it to prove the email was not altered and really came from your domain. Use 2048-bit keys. With NovaMail you publish three CNAME records and the keys are managed and rotated for you:</p>${code("abc123._domainkey.mail.yourbrand.com.  CNAME  abc123.dkim.amazonses.com.")}
<h2>DMARC — the policy that ties them together</h2><p>DMARC tells receivers what to do when SPF or DKIM fail <em>and</em> don't align with the visible From domain, and where to send reports.</p>${code("_dmarc.mail.yourbrand.com.  TXT  \"v=DMARC1; p=none; adkim=r; aspf=r;\"")}<p>Start with <code>p=none</code> to monitor, then move to <code>p=quarantine</code> and eventually <code>p=reject</code> once all your legitimate senders pass.</p>
<h2>How to check</h2><p>Run <code>dig TXT mail.yourbrand.com</code> and <code>dig TXT _dmarc.mail.yourbrand.com</code>, or open your domain in the NovaMail dashboard and click <strong>Verify DNS</strong> — the DKIM and bounce-domain checks show OK or Pending.</p>
<h2>Common mistakes</h2><ul><li>Two SPF records on the same name (both become invalid).</li><li>Copying a record value with quotes, spaces or line breaks inside.</li><li>Proxying mail records through a CDN (keep them DNS-only).</li><li>Publishing <code>p=reject</code> before every service that sends for you passes.</li></ul></section>`,
    faq: [
      ["Do I need all three?", "Yes. Since 2024 Gmail and Yahoo require SPF and DKIM for everyone and DMARC for anyone sending more than 5,000 messages a day to their users."],
      ["How long does DNS take?", "Usually a few minutes; up to the record's TTL (often 5 minutes to 1 hour)."],
    ],
  },
  {
    path: "/guides/gmail-yahoo-bulk-sender-requirements",
    type: "guide",
    title: "Gmail & Yahoo Bulk Sender Requirements (2026) | NovaMail",
    description: "The sender rules Gmail and Yahoo enforce since 2024: SPF, DKIM, DMARC, one-click unsubscribe, spam rate under 0.3%, valid PTR and TLS. A practical checklist.",
    h1: "Gmail and Yahoo bulk sender requirements: the checklist",
    lead: "Since February 2024 Gmail and Yahoo reject or spam-folder mail from senders that skip these basics. Here is the checklist, and how NovaMail covers each item.",
    body: `<section><table><thead><tr><th>Requirement</th><th>Who</th><th>How NovaMail handles it</th></tr></thead><tbody>
<tr><td>SPF and DKIM authentication</td><td>All senders</td><td>Records generated per domain, DKIM 2048-bit, live verification</td></tr>
<tr><td>DMARC record (at least p=none)</td><td>Bulk senders (5,000+/day to Gmail)</td><td>DMARC record suggested for every domain</td></tr>
<tr><td>From domain aligned with SPF or DKIM</td><td>Bulk senders</td><td>Messages are DKIM-signed with your own domain</td></tr>
<tr><td>One-click unsubscribe (RFC 8058) in marketing mail</td><td>Bulk senders</td><td>Added automatically to every campaign</td></tr>
<tr><td>Process unsubscribes within 2 days</td><td>Bulk senders</td><td>Instant suppression</td></tr>
<tr><td>Spam complaint rate below 0.3% (aim for under 0.1%)</td><td>All senders</td><td>Complaints suppressed; accounts above 0.3% paused automatically</td></tr>
<tr><td>Valid forward and reverse DNS (PTR) on sending IPs</td><td>All senders</td><td>Handled by NovaMail's delivery provider (Amazon SES)</td></tr>
<tr><td>TLS for transmission</td><td>All senders</td><td>Encrypted with TLS whenever the receiving server supports it</td></tr></tbody></table></section>
<section class="prose"><h2>Watch your numbers</h2><p>Register your sending domain in Google Postmaster Tools to see Gmail's view of your spam rate and reputation. NovaMail adds a <code>Feedback-ID</code> header to every message so Postmaster can break the data down by category.</p></section>`,
    faq: [
      ["Does this apply to small senders?", "Authentication, low spam rates and TLS apply to everyone. DMARC, alignment and one-click unsubscribe are mandatory above 5,000 messages a day, but best practice for all."],
      ["What spam rate is too high?", "Gmail asks senders to stay below 0.3% and recommends under 0.1%."],
    ],
  },
  {
    path: "/guides/one-click-unsubscribe",
    type: "guide",
    title: "One-Click Unsubscribe (RFC 8058) Explained | NovaMail",
    description: "How the List-Unsubscribe and List-Unsubscribe-Post headers work, why Gmail and Yahoo require them, and how to implement one-click unsubscribe correctly.",
    h1: "One-click unsubscribe (RFC 8058), explained",
    lead: "Two email headers let Gmail and Yahoo show their own Unsubscribe button. Done right, they cut spam complaints; done wrong, they unsubscribe people by accident.",
    body: `<section class="prose"><h2>The two headers</h2>${code("List-Unsubscribe: <https://example.com/u/TOKEN>\nList-Unsubscribe-Post: List-Unsubscribe=One-Click")}<p>When a user clicks the mailbox's Unsubscribe button, the provider sends an HTTP <strong>POST</strong> to that URL with the body <code>List-Unsubscribe=One-Click</code>. Your server must unsubscribe them without asking anything else.</p>
<h2>The common bug: unsubscribing on GET</h2><p>Security scanners and link previews open (GET) every URL in an email. If a GET unsubscribes, people get removed without clicking. The correct pattern: <strong>POST unsubscribes; GET shows a confirmation button.</strong> That is how NovaMail implements it.</p>
<h2>Requirements</h2><ul><li>HTTPS URL, with a token that identifies the recipient and can't be guessed (signed).</li><li>Both headers present, and the message DKIM-signed so they can't be tampered with.</li><li>Honour the request immediately (Gmail allows up to two days).</li><li>Keep a visible unsubscribe link in the email body too.</li></ul>
<p>NovaMail adds both headers and a signed token to every campaign automatically; you can also place <code>{{unsubscribe_url}}</code> in your footer.</p></section>`,
  },
  {
    path: "/guides/send-email-nodejs",
    type: "guide",
    title: "How to Send Email with Node.js (REST API) | NovaMail",
    description: "Send email from Node.js using the Resend SDK with NovaMail or plain fetch. Copy-paste examples with idempotency and error handling.",
    h1: "How to send email with Node.js",
    lead: "Two ways — the Resend SDK or plain fetch — both sending from your own domain.",
    body: `<section class="prose"><h2>1. Resend SDK</h2>${code(`npm install resend`)}${code(`import { Resend } from "resend";\n\nconst nova = new Resend(process.env.NOVAMAIL_API_KEY, {\n  baseUrl: "https://api.novamail.nexaclouds.online",\n});\n\nconst { data, error } = await nova.emails.send({\n  from: "Your Store <hello@mail.yourstore.com>",\n  to: "customer@example.com",\n  subject: "Welcome!",\n  html: "<p>Thanks for signing up.</p>",\n});`)}
<h2>2. Plain fetch (no dependencies)</h2>${code(`const res = await fetch("https://api.novamail.nexaclouds.online/emails", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.NOVAMAIL_API_KEY}\`,\n    "Content-Type": "application/json",\n    "Idempotency-Key": \`welcome-\${userId}\`, // retries never send twice\n  },\n  body: JSON.stringify({ from: "hello@mail.yourstore.com", to: email, subject: "Welcome!", html }),\n});\nif (!res.ok) throw new Error((await res.json()).message);`)}
<p>Errors come back as JSON with <code>statusCode</code>, <code>name</code> and <code>message</code> — for example <code>invalid_from_address</code> when the domain isn't verified yet, or <code>quota_exceeded</code> (HTTP 429). Full reference: <a href="${API_DOCS}">API docs</a>.</p></section>`,
  },
  {
    path: "/guides/send-email-python",
    type: "guide",
    title: "How to Send Email with Python (REST API) | NovaMail",
    description: "Send email from Python with requests and the NovaMail REST API. Copy-paste examples for scripts, Django and Flask, sending from your own domain.",
    h1: "How to send email with Python",
    lead: "Use the REST API with requests — it sends from your verified domain.",
    body: `<section class="prose"><h2>REST API with requests</h2>${code(`import os, requests\n\nr = requests.post(\n    "https://api.novamail.nexaclouds.online/emails",\n    headers={\n        "Authorization": f"Bearer {os.environ['NOVAMAIL_API_KEY']}",\n        "Idempotency-Key": "order-1042",\n    },\n    json={\n        "from": "Your Store <hello@mail.yourstore.com>",\n        "to": ["customer@example.com"],\n        "subject": "Order #1042 confirmed",\n        "html": "<p>Thanks for your order!</p>",\n    },\n    timeout=10,\n)\nr.raise_for_status()\nprint(r.json()["id"])`)}
<h2>Django and Flask</h2><p>Call the same function from a view, a signal or a background task (Celery, RQ). Keep the API key in an environment variable and use an <code>Idempotency-Key</code> so retries never send twice.</p></section>`,
  },

  // ---------------- legal (server-rendered for crawlers; same text as the dashboard) ----------------
  {
    path: "/terms",
    title: "Terms of Service | NovaMail",
    description: "NovaMail Terms of Service: accounts, plans and billing, limits and suspension, availability, liability and termination.",
    h1: "Terms of Service",
    lead: "The rules for using NovaMail. Updated 26 November 2026.",
    priority: 0.3,
    body: `<section class="prose"><h3>1. Service</h3><p>NovaMail provides email campaigns, contact lists, an email API, domain verification and delivery reporting. By creating an account you accept these Terms and the Acceptable Use Policy.</p><h3>2. Account</h3><p>You are responsible for your API keys and everything sent with them.</p><h3>3. Plans and billing</h3><p>There is no free plan. Creating an account costs nothing, and sending requires a paid plan. Plans are billed monthly or yearly through Stripe, renew automatically and can be cancelled anytime; paid access lasts until the end of the paid period. No prorated refunds unless required by law.</p><h3>4. Limits and suspension</h3><p>Accounts above a 5% bounce rate or 0.3% spam-complaint rate are suspended automatically to protect every customer's deliverability. We may suspend accounts that violate the Acceptable Use Policy.</p><h3>5. Availability</h3><p>The service is provided "as is". Final delivery depends on receiving providers we do not control.</p><h3>6. Liability</h3><p>Our total liability is limited to the amount you paid in the 3 months before the event.</p><h3>7. Governing law</h3><p>These Terms are governed by the laws of Brazil.</p></section>`,
  },
  {
    path: "/aup",
    title: "Acceptable Use Policy (Anti-Spam) | NovaMail",
    description: "What you can and cannot send with NovaMail: opt-in only, no purchased or scraped lists, authentication and one-click unsubscribe required.",
    h1: "Acceptable Use Policy",
    lead: "NovaMail is for email people asked for. Updated 17 November 2026.",
    priority: 0.3,
    body: `<section class="prose"><h3>Allowed</h3><p>Transactional email and marketing to people who clearly opted in and can leave anytime.</p><h3>Forbidden</h3><p>Purchased, rented, scraped or generated lists; bulk cold email; phishing, malware, scams and illegal content; forged senders; hidden unsubscribe; sending from domains you do not control.</p><h3>Required</h3><p>Verified domain with SPF, DKIM and DMARC; a working unsubscribe in every marketing email; honour unsubscribes immediately; keep complaints below 0.1%.</p><h3>Enforcement</h3><p>We monitor bounces, complaints and blocklists. Violations lead to immediate suspension and may lead to termination.</p><h3>Reporting abuse</h3><p>Write to novamail@nexaclouds.online with the email you received (headers included if possible).</p></section>`,
  },
  {
    path: "/privacy",
    title: "Privacy Policy (GDPR & LGPD) | NovaMail",
    description: "How NovaMail handles account data and the emails and contacts you send: what we collect, why, for how long, sub-processors and your rights.",
    h1: "Privacy Policy",
    lead: "How we handle your data and your contacts' data. Updated 26 November 2026.",
    priority: 0.3,
    body: `<section class="prose"><h3>Roles</h3><p>NovaMail is the controller of your account data. For the emails you send and your contact lists, you are the controller and NovaMail is a processor acting on your instructions.</p><h3>What we collect</h3><p>Login email, access logs, API keys (stored only as hashes), sending metadata and payment data processed by Stripe (we never store card numbers). Campaign and funnel emails include first-party open and click tracking (a pixel and signed links) so senders can measure engagement and branch automations; tracking data is tied to the email, not used for advertising, and kept for up to 90 days.</p><h3>Retention</h3><p>Sending metadata up to 90 days; bodies of API-sent emails are not kept after sending (campaign and template content stays in your account until you delete it); suppression lists while the account exists; account data until closure plus legal retention.</p><h3>Sub-processors</h3><p>Cloudflare (API and dashboard hosting), Amazon Web Services (email delivery through Amazon SES), Stripe (payments). We do not sell data.</p><h3>Your rights</h3><p>Access, correction, portability, deletion and objection under GDPR and Brazil's LGPD. Write to novamail@nexaclouds.online; we reply within 15 days.</p></section>`,
  },
];
