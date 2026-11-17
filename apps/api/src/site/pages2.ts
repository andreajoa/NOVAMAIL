import { API_DOCS, esc, type Page } from "./layout";

const code = (s: string) => `<pre><code>${esc(s)}</code></pre>`;

const NOVAMAIL_ROWS: [string, string][] = [
  ["Free plan", "3,000 emails/month, 100/day, 1 domain, no card"],
  ["Paid plans", "Pro $15/mo (50,000 emails) · Scale $60/mo (250,000 emails)"],
  ["Contacts", "Unlimited on every plan — priced by emails sent"],
  ["Campaigns & lists", "Yes — lists, CSV import, personalization, one-click unsubscribe"],
  ["Email API", "REST, compatible with the Resend SDKs; OpenAPI 3.1"],
  ["SMTP", "Port 587 STARTTLS (TLS 1.3) and 25"],
  ["Domain authentication", "SPF, DKIM 2048-bit, DMARC guidance, live verification"],
  ["Webhooks", "Standard Webhooks (signed)"],
  ["Drag-and-drop editor / automations", "Not yet — HTML or plain-text campaigns"],
];

function compare(o: { slug: string; name: string; kind: "marketing" | "api"; what: string; why: [string, string][]; switchHow: string; faq: [string, string][] }): Page {
  return {
    path: `/${o.slug}`,
    type: "compare",
    priority: 0.75,
    title: `${o.name} Alternative — Free Plan, from $15/mo | NovaMail`,
    description: `Looking for a ${o.name} alternative? NovaMail sends ${o.kind === "marketing" ? "email campaigns and newsletters" : "transactional email via API and SMTP"} from your own domain. Free 3,000 emails/month; Pro $15/mo.`,
    h1: `A simpler ${o.name} alternative`,
    lead: `${o.what} If you want something smaller, faster to set up and priced by emails sent, NovaMail is worth a look.`,
    body: `<section><h2>NovaMail at a glance</h2><table><tbody>${NOVAMAIL_ROWS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</tbody></table>
<p>Features and prices of other providers change often — check ${esc(o.name)}'s own pricing page for current details.</p></section>
<section><h2>Why teams switch to NovaMail</h2><div class="grid">${o.why.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join("")}</div></section>
<section class="prose"><h2>How to switch from ${esc(o.name)}</h2>${o.switchHow}</section>`,
    faq: o.faq,
  };
}

const MARKETING_SWITCH = `<ol><li>Create a free NovaMail account and add a sending subdomain such as <code>mail.yourbrand.com</code>.</li><li>Publish the SPF, DKIM and DMARC records we show and click Verify.</li><li>Export your <strong>subscribed</strong> contacts as CSV (email, first name, last name) and import them into a NovaMail list. Leave unsubscribed and bounced contacts behind.</li><li>Paste your newsletter HTML into a new campaign and send a test to yourself first.</li><li>Start with your most engaged contacts and grow volume over a couple of weeks.</li></ol>`;
const API_SWITCH = (sdk: string) =>
  `<ol><li>Create a NovaMail account and verify your sending domain.</li><li>Create an API key (sending-only if it lives in your app).</li><li>${sdk}</li><li>Point your webhook endpoint at NovaMail events (Standard Webhooks signature).</li><li>Move traffic gradually: transactional first, then bulk.</li></ol>`;

export const PAGES2: Page[] = [
  compare({
    slug: "mailchimp-alternative",
    name: "Mailchimp",
    kind: "marketing",
    what: "Mailchimp is one of the best-known email marketing platforms, with a large feature set for marketing teams.",
    why: [
      ["Priced by emails, not contacts", "Keep your whole list; you only pay for what you send."],
      ["Your own domain from day one", "SPF, DKIM and DMARC checked live in the dashboard."],
      ["Campaigns + transactional in one place", "Newsletters and order confirmations share one account, one domain and one suppression list."],
      ["Developer-friendly", "Resend-compatible API and SMTP when you want to automate."],
    ],
    switchHow: MARKETING_SWITCH,
    faq: [
      ["Can I import my Mailchimp audience?", "Yes. Export your subscribed contacts from Mailchimp as CSV and import them into a NovaMail list (email, first name, last name)."],
      ["Does NovaMail have a drag-and-drop editor like Mailchimp?", "Not yet. You can paste HTML from any email editor or write plain text."],
    ],
  }),
  compare({
    slug: "brevo-alternative",
    name: "Brevo",
    kind: "marketing",
    what: "Brevo (formerly Sendinblue) combines email marketing, SMS and a CRM in one suite.",
    why: [
      ["Focused on email", "One job done well: campaigns and transactional email that reach the inbox."],
      ["Clear limits", "Daily and monthly limits shown in your dashboard, with a 429 and a clear message — never surprise overages."],
      ["Resend-compatible API", "Modern REST API with idempotency keys and signed webhooks."],
      ["Free plan", "3,000 emails a month free with your own domain."],
    ],
    switchHow: MARKETING_SWITCH,
    faq: [["Can I use NovaMail for both newsletters and transactional email?", "Yes. Campaigns and the API share the same account, domains and suppression list."]],
  }),
  compare({
    slug: "mailerlite-alternative",
    name: "MailerLite",
    kind: "marketing",
    what: "MailerLite is a popular email marketing tool for creators and small businesses.",
    why: [
      ["Unlimited contacts", "Pay by emails sent on every plan."],
      ["Transactional included", "Order and account emails through API or SMTP on the same plan."],
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
      ["Free plan", "3,000 emails/month with your own domain."],
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
      ["SMTP drop-in", "Change host, port and credentials in your app's SMTP settings."],
      ["Transparent limits", "Plan limits visible in the dashboard and in /usage."],
      ["Free plan", "3,000 emails per month."],
    ],
    switchHow: API_SWITCH("Replace the SendGrid client with a single HTTP call to <code>POST /emails</code> (or keep SMTP and change host/credentials)."),
    faq: [["Can I keep using SMTP?", "Yes: postal.novamail.nexaclouds.online, port 587 with STARTTLS."]],
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
      ["Free plan", "3,000 emails per month."],
    ],
    switchHow: API_SWITCH("Replace Mailgun's messages endpoint with <code>POST /emails</code>, or switch SMTP host and credentials."),
    faq: [["Do you support SMTP?", "Yes, on ports 587 (STARTTLS) and 25."]],
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
      ["Free plan", "3,000 emails per month."],
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
      ["Simple pricing", "Free 3,000 emails/month; Pro $15/mo."],
    ],
    switchHow: API_SWITCH("Replace the SES SDK call with <code>POST /emails</code>, or point SMTP at postal.novamail.nexaclouds.online:587."),
    faq: [["Do I need an AWS account?", "No. NovaMail runs its own sending infrastructure."]],
  }),

  // ---------------- guides ----------------
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
      ["/guides/send-email-python", "Send email with Python", "requests or smtplib, both covered."],
    ].map(([h, t, d]) => `<a class="card" href="${h}" style="text-decoration:none"><h3>${t}</h3><p>${d}</p></a>`).join("")}</div></section>`,
  },
  {
    path: "/guides/spf-dkim-dmarc",
    type: "guide",
    title: "SPF, DKIM and DMARC Setup Guide (2026) | NovaMail",
    description: "What SPF, DKIM and DMARC are, the exact DNS records to add, how to check them and the mistakes that send email to spam. Step by step, with examples.",
    h1: "SPF, DKIM and DMARC: a plain-English setup guide",
    lead: "Three DNS records decide whether Gmail, Outlook and Yahoo trust your emails. Here is what each one does and exactly how to add them.",
    body: `<section class="prose"><h2>SPF — who may send for your domain</h2><p>SPF is a TXT record listing the servers allowed to send email for a domain. Receivers compare the sending server's IP with that list.</p>${code("mail.yourbrand.com.  TXT  \"v=spf1 a mx include:spf.novamail.nexaclouds.online ~all\"")}<p>Rules: only <strong>one</strong> SPF record per name, and no more than 10 DNS lookups in total. Use a sending subdomain (like <code>mail.</code>) so your main domain's SPF stays untouched.</p>
<h2>DKIM — a signature on every email</h2><p>DKIM adds a cryptographic signature to each message. The public key lives in DNS under a selector; receivers use it to prove the email was not altered and really came from your domain. Use 2048-bit keys.</p>${code("nm-AbC123._domainkey.mail.yourbrand.com.  TXT  \"v=DKIM1; t=s; h=sha256; p=MIIBIjANBgkq...\"")}
<h2>DMARC — the policy that ties them together</h2><p>DMARC tells receivers what to do when SPF or DKIM fail <em>and</em> don't align with the visible From domain, and where to send reports.</p>${code("_dmarc.mail.yourbrand.com.  TXT  \"v=DMARC1; p=none; adkim=r; aspf=r;\"")}<p>Start with <code>p=none</code> to monitor, then move to <code>p=quarantine</code> and eventually <code>p=reject</code> once all your legitimate senders pass.</p>
<h2>How to check</h2><p>Run <code>dig TXT mail.yourbrand.com</code> and <code>dig TXT _dmarc.mail.yourbrand.com</code>, or open your domain in the NovaMail dashboard and click <strong>Verify DNS</strong> — each record shows OK, Missing or Invalid.</p>
<h2>Common mistakes</h2><ul><li>Two SPF records on the same name (both become invalid).</li><li>Copying the DKIM value with quotes or line breaks inside.</li><li>Proxying mail records through a CDN (keep them DNS-only).</li><li>Publishing <code>p=reject</code> before every service that sends for you passes.</li></ul></section>`,
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
<tr><td>Valid forward and reverse DNS (PTR) on sending IPs</td><td>All senders</td><td>Configured on NovaMail's servers</td></tr>
<tr><td>TLS for transmission</td><td>All senders</td><td>STARTTLS with TLS 1.3</td></tr></tbody></table></section>
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
    title: "How to Send Email with Node.js (API & SMTP) | NovaMail",
    description: "Send email from Node.js using the Resend SDK with NovaMail, plain fetch, or Nodemailer over SMTP. Copy-paste examples with idempotency and error handling.",
    h1: "How to send email with Node.js",
    lead: "Three ways — the Resend SDK, plain fetch, or Nodemailer over SMTP — all sending from your own domain.",
    body: `<section class="prose"><h2>1. Resend SDK</h2>${code(`npm install resend`)}${code(`import { Resend } from "resend";\n\nconst nova = new Resend(process.env.NOVAMAIL_API_KEY, {\n  baseUrl: "https://api.novamail.nexaclouds.online",\n});\n\nconst { data, error } = await nova.emails.send({\n  from: "Your Store <hello@mail.yourstore.com>",\n  to: "customer@example.com",\n  subject: "Welcome!",\n  html: "<p>Thanks for signing up.</p>",\n});`)}
<h2>2. Plain fetch (no dependencies)</h2>${code(`const res = await fetch("https://api.novamail.nexaclouds.online/emails", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.NOVAMAIL_API_KEY}\`,\n    "Content-Type": "application/json",\n    "Idempotency-Key": \`welcome-\${userId}\`, // retries never send twice\n  },\n  body: JSON.stringify({ from: "hello@mail.yourstore.com", to: email, subject: "Welcome!", html }),\n});\nif (!res.ok) throw new Error((await res.json()).message);`)}
<h2>3. Nodemailer over SMTP</h2>${code(`import nodemailer from "nodemailer";\n\nconst transport = nodemailer.createTransport({\n  host: "postal.novamail.nexaclouds.online",\n  port: 587,\n  secure: false, // STARTTLS\n  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },\n});\n\nawait transport.sendMail({ from: "hello@mail.yourstore.com", to: "customer@example.com", subject: "Welcome!", html: "<p>Hi</p>" });`)}
<p>Errors come back as JSON with <code>statusCode</code>, <code>name</code> and <code>message</code> — for example <code>invalid_from_address</code> when the domain isn't verified yet, or <code>quota_exceeded</code> (HTTP 429). Full reference: <a href="${API_DOCS}">API docs</a>.</p></section>`,
  },
  {
    path: "/guides/send-email-python",
    type: "guide",
    title: "How to Send Email with Python (API & SMTP) | NovaMail",
    description: "Send email from Python with requests (REST API) or smtplib over STARTTLS. Copy-paste examples for Django, Flask and scripts, sending from your own domain.",
    h1: "How to send email with Python",
    lead: "Use the REST API with requests, or the standard library's smtplib — both send from your verified domain.",
    body: `<section class="prose"><h2>1. REST API with requests</h2>${code(`import os, requests\n\nr = requests.post(\n    "https://api.novamail.nexaclouds.online/emails",\n    headers={\n        "Authorization": f"Bearer {os.environ['NOVAMAIL_API_KEY']}",\n        "Idempotency-Key": "order-1042",\n    },\n    json={\n        "from": "Your Store <hello@mail.yourstore.com>",\n        "to": ["customer@example.com"],\n        "subject": "Order #1042 confirmed",\n        "html": "<p>Thanks for your order!</p>",\n    },\n    timeout=10,\n)\nr.raise_for_status()\nprint(r.json()["id"])`)}
<h2>2. smtplib (standard library)</h2>${code(`import os, smtplib, ssl\nfrom email.message import EmailMessage\n\nmsg = EmailMessage()\nmsg["From"] = "hello@mail.yourstore.com"\nmsg["To"] = "customer@example.com"\nmsg["Subject"] = "Order confirmed"\nmsg.set_content("Thanks for your order!")\n\nwith smtplib.SMTP("postal.novamail.nexaclouds.online", 587) as s:\n    s.starttls(context=ssl.create_default_context())\n    s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])\n    s.send_message(msg)`)}
<h2>Django</h2>${code(`EMAIL_HOST = "postal.novamail.nexaclouds.online"\nEMAIL_PORT = 587\nEMAIL_USE_TLS = True\nEMAIL_HOST_USER = os.environ["SMTP_USER"]\nEMAIL_HOST_PASSWORD = os.environ["SMTP_PASS"]`)}</section>`,
  },

  // ---------------- legal (server-rendered for crawlers; same text as the dashboard) ----------------
  {
    path: "/terms",
    title: "Terms of Service | NovaMail",
    description: "NovaMail Terms of Service: accounts, plans and billing, limits and suspension, availability, liability and termination.",
    h1: "Terms of Service",
    lead: "The rules for using NovaMail. Updated 17 November 2026.",
    priority: 0.3,
    body: `<section class="prose"><h3>1. Service</h3><p>NovaMail provides email campaigns, contact lists, an email API and SMTP, domain verification and delivery reporting. By creating an account you accept these Terms and the Acceptable Use Policy.</p><h3>2. Account</h3><p>You are responsible for your API keys, SMTP passwords and everything sent with them.</p><h3>3. Plans and billing</h3><p>The Free plan is free within the limits shown in the dashboard. Paid plans are billed monthly through Stripe, renew automatically and can be cancelled anytime; paid access lasts until the end of the paid period. No prorated refunds unless required by law.</p><h3>4. Limits and suspension</h3><p>Accounts above a 5% bounce rate or 0.3% spam-complaint rate are suspended automatically to protect every customer's deliverability. We may suspend accounts that violate the Acceptable Use Policy.</p><h3>5. Availability</h3><p>The service is provided "as is". Final delivery depends on receiving providers we do not control.</p><h3>6. Liability</h3><p>Our total liability is limited to the amount you paid in the 3 months before the event.</p><h3>7. Governing law</h3><p>These Terms are governed by the laws of Brazil.</p></section>`,
  },
  {
    path: "/aup",
    title: "Acceptable Use Policy (Anti-Spam) | NovaMail",
    description: "What you can and cannot send with NovaMail: opt-in only, no purchased or scraped lists, authentication and one-click unsubscribe required.",
    h1: "Acceptable Use Policy",
    lead: "NovaMail is for email people asked for. Updated 17 November 2026.",
    priority: 0.3,
    body: `<section class="prose"><h3>Allowed</h3><p>Transactional email and marketing to people who clearly opted in and can leave anytime.</p><h3>Forbidden</h3><p>Purchased, rented, scraped or generated lists; bulk cold email; phishing, malware, scams and illegal content; forged senders; hidden unsubscribe; sending from domains you do not control.</p><h3>Required</h3><p>Verified domain with SPF, DKIM and DMARC; a working unsubscribe in every marketing email; honour unsubscribes immediately; keep complaints below 0.1%.</p><h3>Enforcement</h3><p>We monitor bounces, complaints and blocklists. Violations lead to immediate suspension and may lead to termination.</p></section>`,
  },
  {
    path: "/privacy",
    title: "Privacy Policy (GDPR & LGPD) | NovaMail",
    description: "How NovaMail handles account data and the emails and contacts you send: what we collect, why, for how long, sub-processors and your rights.",
    h1: "Privacy Policy",
    lead: "How we handle your data and your contacts' data. Updated 17 November 2026.",
    priority: 0.3,
    body: `<section class="prose"><h3>Roles</h3><p>NovaMail is the controller of your account data. For the emails you send and your contact lists, you are the controller and NovaMail is a processor acting on your instructions.</p><h3>What we collect</h3><p>Login email, access logs, API keys (stored only as hashes), sending metadata and payment data processed by Stripe (we never store card numbers).</p><h3>Retention</h3><p>Sending metadata up to 90 days; message bodies on the sending servers up to 30 days; suppression lists while the account exists; account data until closure plus legal retention.</p><h3>Sub-processors</h3><p>Cloudflare (API and dashboard hosting), Amazon Web Services (sending servers), Stripe (payments). We do not sell data.</p><h3>Your rights</h3><p>Access, correction, portability, deletion and objection under GDPR and Brazil's LGPD. Contact us through the dashboard; we reply within 15 days.</p></section>`,
  },
];
