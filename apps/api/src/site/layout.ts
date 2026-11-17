// Server-rendered marketing site (SEO + GEO). Plain HTML + inline CSS, zero JS:
// readable by Googlebot, Bingbot and AI crawlers (GPTBot, ClaudeBot, PerplexityBot) alike.

export const SITE = "https://app.novamail.nexaclouds.online";
export const API_DOCS = "https://api.novamail.nexaclouds.online/docs";
export const STATUS = "https://api.novamail.nexaclouds.online/status";
export const UPDATED = "2026-11-17";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Page {
  path: string;
  title: string; // <title>, ≤ 60 chars
  description: string; // meta description, ≤ 160 chars
  h1: string;
  lead: string;
  body: string; // trusted HTML authored in this repo
  faq?: [string, string][];
  lang?: "en" | "pt-BR";
  alternates?: { en: string; pt: string };
  type?: "page" | "guide" | "compare";
  priority?: number;
}

const CSS = `:root{--fg:#18181b;--mut:#52525b;--bg:#fafafa;--card:#fff;--line:#e4e4e7;--code:#09090b;--acc:#18181b}
@media(prefers-color-scheme:dark){:root{--fg:#f4f4f5;--mut:#a1a1aa;--bg:#09090b;--card:#18181b;--line:#27272a;--acc:#fafafa}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Inter,sans-serif}
a{color:inherit}a:hover{opacity:.75}.w{max-width:1080px;margin:0 auto;padding:0 20px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0}
.logo{display:flex;align-items:center;gap:8px;font-weight:650;text-decoration:none;letter-spacing:-.01em}.logo i{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--acc);color:var(--bg);font-style:normal;font-size:14px}
nav.m{display:flex;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--mut)}nav.m a{text-decoration:none}
.btn{display:inline-block;background:var(--acc);color:var(--bg);text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px}.btn.g{background:transparent;color:var(--fg);border:1px solid var(--line)}
.hero{padding:56px 0 32px}.hero h1{font-size:clamp(34px,6vw,58px);line-height:1.08;letter-spacing:-.03em;margin:0 0 18px;max-width:880px}.hero p.lead{font-size:clamp(17px,2.2vw,20px);color:var(--mut);max-width:720px;margin:0 0 26px}
.cta{display:flex;gap:10px;flex-wrap:wrap}.crumb{font-size:13px;color:var(--mut);margin-bottom:14px}.crumb a{text-decoration:none}
main section{padding:28px 0}main h2{font-size:clamp(22px,3vw,28px);letter-spacing:-.02em;margin:0 0 12px}main h3{font-size:18px;margin:20px 0 6px}
main p,main li{color:var(--mut)}main strong{color:var(--fg)}.prose{max-width:760px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}.card h3{margin-top:0}
pre{background:var(--code);color:#e4e4e7;border-radius:12px;padding:18px;overflow-x:auto;font:13.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
table{width:100%;border-collapse:collapse;font-size:15px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:600}td{color:var(--mut)}
.price{font-size:36px;font-weight:650;letter-spacing:-.02em;color:var(--fg)}.price small{font-size:15px;color:var(--mut);font-weight:400}
details{border-bottom:1px solid var(--line);padding:14px 0}summary{cursor:pointer;font-weight:600}details p{margin:8px 0 0}
footer{border-top:1px solid var(--line);margin-top:48px;padding:28px 0 40px;font-size:14px;color:var(--mut)}footer .cols{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}footer a{text-decoration:none;display:block;margin:4px 0}footer b{color:var(--fg)}`;

const NAV = `<nav class="m" aria-label="Main"><a href="/email-marketing">Email marketing</a><a href="/pricing">Pricing</a><a href="/guides">Guides</a><a href="${API_DOCS}">API docs</a><a href="/login">Sign in</a></nav>`;

export const FOOTER_LINKS: [string, [string, string][]][] = [
  ["Product", [["/email-marketing", "Email marketing"], ["/ai-agents", "Claude Code & Codex"], ["/transactional-email-api", "Transactional email API"], ["/smtp-relay", "SMTP relay"], ["/pricing", "Pricing"], [API_DOCS, "API reference"], [STATUS, "Status"]]],
  ["Compare", [["/mailchimp-alternative", "Mailchimp alternative"], ["/brevo-alternative", "Brevo alternative"], ["/mailerlite-alternative", "MailerLite alternative"], ["/resend-alternative", "Resend alternative"], ["/sendgrid-alternative", "SendGrid alternative"], ["/mailgun-alternative", "Mailgun alternative"], ["/postmark-alternative", "Postmark alternative"], ["/amazon-ses-alternative", "Amazon SES alternative"]]],
  ["Guides", [["/guides/spf-dkim-dmarc", "SPF, DKIM & DMARC setup"], ["/guides/gmail-yahoo-bulk-sender-requirements", "Gmail & Yahoo sender rules"], ["/guides/one-click-unsubscribe", "One-click unsubscribe"], ["/guides/send-email-nodejs", "Send email with Node.js"], ["/guides/send-email-python", "Send email with Python"]]],
  ["Company", [["/terms", "Terms"], ["/aup", "Acceptable use"], ["/privacy", "Privacy"], ["/pt/", "Português"]]],
];

export const ORG = {
  "@type": "Organization",
  "@id": `${SITE}/#org`,
  name: "NovaMail",
  url: `${SITE}/`,
  logo: `${SITE}/icon.svg`,
  description: "NovaMail is an email marketing and transactional email platform: send newsletters and campaigns to your customers, plus a Resend-compatible email API and SMTP relay.",
};

export const PRODUCT = {
  "@type": "SoftwareApplication",
  "@id": `${SITE}/#app`,
  name: "NovaMail",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Email marketing and transactional email",
  operatingSystem: "Web, any (REST API and SMTP)",
  url: `${SITE}/`,
  publisher: { "@id": `${SITE}/#org` },
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", description: "3,000 emails per month, 100 per day, 1 domain" },
    { "@type": "Offer", name: "Pro", price: "15", priceCurrency: "USD", description: "50,000 emails per month, 10 domains", priceSpecification: { "@type": "UnitPriceSpecification", price: "15", priceCurrency: "USD", billingDuration: "P1M" } },
    { "@type": "Offer", name: "Scale", price: "60", priceCurrency: "USD", description: "250,000 emails per month, 100 domains", priceSpecification: { "@type": "UnitPriceSpecification", price: "60", priceCurrency: "USD", billingDuration: "P1M" } },
  ],
  featureList: [
    "Email campaigns and newsletters to your contact lists",
    "Drag-and-drop email editor with ready-made templates, GIFs and video-to-GIF",
    "Automated email funnels (multi-step sequences)",
    "MCP server for Claude Code and Codex with restricted agent keys",
    "Contact lists with CSV import and personalization ({{first_name}})",
    "Resend-compatible REST API (POST /emails, /emails/batch)",
    "SMTP relay on port 587 with STARTTLS (TLS 1.3)",
    "Sending domains with SPF, DKIM (2048-bit) and DMARC guidance",
    "Standard Webhooks signed events: delivered, delayed, bounced, complained",
    "Automatic suppression of hard bounces, complaints and unsubscribes",
    "Broadcasts with RFC 8058 one-click unsubscribe",
    "Idempotency keys and OpenAPI 3.1 reference",
  ],
};

export function render(p: Page, all: Page[]): string {
  const lang = p.lang ?? "en";
  const url = `${SITE}${p.path}`;
  const crumbs = p.path === "/" || p.path === "/pt/" ? [] : crumbTrail(p, all);
  const ld: unknown[] = [ORG];
  if (p.path === "/" || p.path === "/pricing" || p.path === "/pt/") ld.push(PRODUCT);
  ld.push({ "@type": "WebPage", "@id": `${url}#page`, url, name: p.title, description: p.description, inLanguage: lang, isPartOf: { "@type": "WebSite", "@id": `${SITE}/#site`, name: "NovaMail", url: `${SITE}/` }, dateModified: UPDATED });
  if (p.type === "guide") ld.push({ "@type": "TechArticle", headline: p.h1, description: p.description, inLanguage: lang, dateModified: UPDATED, author: { "@id": `${SITE}/#org` }, publisher: { "@id": `${SITE}/#org` }, mainEntityOfPage: url });
  if (crumbs.length) ld.push({ "@type": "BreadcrumbList", itemListElement: [["Home", "/"], ...crumbs].map(([n, h], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${SITE}${h}` })) });
  if (p.faq?.length) ld.push({ "@type": "FAQPage", mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

  const alt = p.alternates
    ? `<link rel="alternate" hreflang="en" href="${SITE}${p.alternates.en}"><link rel="alternate" hreflang="pt-BR" href="${SITE}${p.alternates.pt}"><link rel="alternate" hreflang="x-default" href="${SITE}${p.alternates.en}">`
    : "";
  const faqHtml = p.faq?.length
    ? `<section><h2>${lang === "en" ? "Frequently asked questions" : "Perguntas frequentes"}</h2>${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>`
    : "";
  const crumbHtml = crumbs.length ? `<div class="crumb"><a href="/">Home</a>${crumbs.map(([n, h]) => ` / <a href="${h}">${esc(n)}</a>`).join("")}</div>` : "";

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title><meta name="description" content="${esc(p.description)}"><link rel="canonical" href="${url}">${alt}
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><meta name="theme-color" content="#18181b">
<meta property="og:type" content="website"><meta property="og:site_name" content="NovaMail"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="${lang === "en" ? "en_US" : "pt_BR"}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(p.title)}"><meta name="twitter:description" content="${esc(p.description)}"><meta name="twitter:image" content="${SITE}/og.png">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c")}</script>
<style>${CSS}</style></head><body>
<div class="w"><header class="top"><a class="logo" href="${lang === "en" ? "/" : "/pt/"}"><i aria-hidden="true">✉</i>NovaMail</a>${NAV}</header></div>
<main class="w"><div class="hero">${crumbHtml}<h1>${esc(p.h1)}</h1><p class="lead">${esc(p.lead)}</p><div class="cta"><a class="btn" href="/login">${lang === "en" ? "Start free — no card" : "Comece grátis — sem cartão"}</a><a class="btn g" href="${API_DOCS}">${lang === "en" ? "Read the API docs" : "Documentação da API"}</a></div></div>
${p.body}${faqHtml}</main>
<footer><div class="w"><div class="cols">${FOOTER_LINKS.map(([h, ls]) => `<div><b>${h}</b>${ls.map(([href, t]) => `<a href="${href}">${esc(t)}</a>`).join("")}</div>`).join("")}</div><p>© 2026 NovaMail · Updated ${UPDATED}</p></div></footer>
</body></html>`;
}

function crumbTrail(p: Page, all: Page[]): [string, string][] {
  if (p.path.startsWith("/guides/")) return [["Guides", "/guides"], [p.h1, p.path]];
  const short = all.find((x) => x.path === p.path);
  return [[short ? short.h1.split(":")[0]!.split("—")[0]!.trim() : p.title, p.path]];
}
