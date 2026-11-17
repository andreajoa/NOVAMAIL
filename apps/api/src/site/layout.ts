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
  /** Custom hero + closing section (home page); replaces the default hero. */
  heroHtml?: string;
  finale?: string;
  extraCss?: string;
}

import { PRICING_CSS } from "./pricing";

const CSS = `:root{--fg:#18181b;--mut:#52525b;--bg:#fafafa;--card:#fff;--line:#e4e4e7;--code:#09090b;--acc:#18181b}
@media(prefers-color-scheme:dark){:root{--fg:#f4f4f5;--mut:#a1a1aa;--bg:#09090b;--card:#18181b;--line:#27272a;--acc:#fafafa}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Inter,sans-serif}
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
footer{background:#09090b;color:#a1a1aa;margin-top:64px;padding:56px 0 40px;font-size:14px}footer .cols{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:36px}footer a{text-decoration:none;display:block;margin:6px 0;color:#a1a1aa}footer a:hover{color:#fafafa;opacity:1}footer b{color:#fafafa}
.flogo{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:700;color:#fafafa;letter-spacing:-.02em;text-decoration:none}.flogo i{display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:#fafafa;color:#09090b;font-style:normal;font-size:19px}
.ftag{margin:12px 0 0;color:#a1a1aa;max-width:420px}.fbottom{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;border-top:1px solid #27272a;margin-top:36px;padding-top:22px;color:#71717a}`;

const NAV = `<nav class="m" aria-label="Main"><a href="/email-marketing">Email marketing</a><a href="/crm">CRM</a><a href="/pricing">Pricing</a><a href="/guides">Guides</a><a href="${API_DOCS}">API docs</a><a href="/login">Sign in</a></nav>`;

export const FOOTER_LINKS: [string, [string, string][]][] = [
  ["Product", [["/email-marketing", "Email marketing"], ["/crm", "CRM & segments"], ["/integrations", "Integrations"], ["/ai-agents", "Claude Code & Codex"], ["/transactional-email-api", "Transactional email API"], ["/smtp-relay", "SMTP relay"], ["/pricing", "Pricing"], [API_DOCS, "API reference"], [STATUS, "Status"]]],
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
  description: "NovaMail is an email marketing platform with a built-in CRM (contact profiles, engagement scoring, smart segments) and automated funnels, plus a Resend-compatible email API and SMTP relay.",
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
    "Built-in CRM: contact profiles, engagement scoring, smart segments, custom fields",
    "Sales pipeline with deals, tasks and weighted forecast",
    "Signup forms, popups and landing pages with double opt-in",
    "A/B testing, scheduling, smart send time and resend to non-openers",
    "AI email writer and subject-line generator",
    "Shopify and WooCommerce: abandoned carts and revenue attribution",
    "Reports with click maps, bot-click filtering and Apple privacy separation",
    "Pre-send deliverability check and dark-mode preview",
    "SMS and WhatsApp with your own Twilio or Meta account",
    "Team roles and Zapier/Make/n8n integrations",
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

export function render(p: Page, all: Page[], nonce = ""): string {
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
<style>${CSS}${PRICING_CSS}${p.extraCss ?? ""}</style></head><body>
<div class="${p.heroHtml ? "topdark" : ""}"><div class="w"><header class="top"><a class="logo" href="${lang === "en" ? "/" : "/pt/"}"><i aria-hidden="true">✉</i>NovaMail</a>${NAV}</header></div></div>
<main class="w">${p.heroHtml ?? `<div class="hero">${crumbHtml}<h1>${esc(p.h1)}</h1><p class="lead">${esc(p.lead)}</p><div class="cta"><a class="btn" href="/login">${lang === "en" ? "Start free — no card" : "Comece grátis — sem cartão"}</a><a class="btn g" href="${API_DOCS}">${lang === "en" ? "Read the API docs" : "Documentação da API"}</a></div></div>`}
${p.body}${faqHtml}${p.finale ?? ""}</main>${p.heroHtml && nonce ? `<script nonce="${nonce}">${TYPEWRITER}</script>` : ""}
<footer><div class="w"><a class="flogo" href="${lang === "en" ? "/" : "/pt/"}"><i aria-hidden="true">✉</i>NovaMail</a><p class="ftag">${lang === "en" ? "Email marketing + CRM that reaches the inbox." : "E-mail marketing + CRM que chega na caixa de entrada."}</p><div class="cols">${FOOTER_LINKS.map(([h, ls]) => `<div><b>${h}</b>${ls.map(([href, t]) => `<a href="${href}">${esc(t)}</a>`).join("")}</div>`).join("")}</div><div class="fbottom"><span>© 2026 NovaMail</span><span>${lang === "en" ? "Updated" : "Atualizado"} ${UPDATED}</span></div></div></footer>
</body></html>`;
}

function crumbTrail(p: Page, all: Page[]): [string, string][] {
  if (p.path.startsWith("/guides/")) return [["Guides", "/guides"], [p.h1, p.path]];
  const short = all.find((x) => x.path === p.path);
  return [[short ? short.h1.split(":")[0]!.split("—")[0]!.trim() : p.title, p.path]];
}

// Typewriter for the home hero: types, pauses, deletes, next word. Progressive enhancement:
// without JS (or with reduced motion) the first word stays static and fully readable.
const TYPEWRITER = `(()=>{const el=document.querySelector("[data-words]");if(!el||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
const words=JSON.parse(el.dataset.words);let w=0,i=words[0].length,del=true;
const box=document.createElement("span");box.className="twbox";el.parentNode.insertBefore(box,el);box.appendChild(el);
for(const g of words){const s=document.createElement("span");s.className="twghost";s.setAttribute("aria-hidden","true");s.textContent=g;box.appendChild(s)}
el.classList.add("typing");
const tick=()=>{const word=words[w];if(del){i--;if(i<0){del=false;w=(w+1)%words.length;i=0;return setTimeout(tick,250)}}else{i++;if(i>word.length){del=true;i=word.length;return setTimeout(tick,1900)}}
el.textContent=words[w].slice(0,Math.max(0,i))||"\u200b";setTimeout(tick,del?45:85)};setTimeout(tick,2200)})();
(()=>{const w=document.querySelector(".world");if(!w||matchMedia("(prefers-reduced-motion: reduce)").matches)return;let tx=0,ty=0,x=0,y=0;
addEventListener("pointermove",e=>{tx=(e.clientX/innerWidth-.5)*28;ty=(e.clientY/innerHeight-.5)*-14},{passive:true});
const f=()=>{x+=(tx-x)*.06;y+=(ty-y)*.06;w.style.setProperty("--ry",x.toFixed(2)+"deg");w.style.setProperty("--rx",y.toFixed(2)+"deg");requestAnimationFrame(f)};f()})();`;
