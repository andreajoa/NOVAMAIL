// Marketing site router: server-rendered pages + crawler files (robots, sitemap, llms.txt, IndexNow).
import { esc, render, SITE, UPDATED, API_DOCS, type Page } from "./layout";
import { PAGES } from "./pages";
import { PAGES2 } from "./pages2";

export const ALL: Page[] = [...PAGES, ...PAGES2];
const BY_PATH = new Map(ALL.map((p) => [p.path, p]));

// IndexNow key (public by design: the key file proves we own the host).
export const INDEXNOW_KEY = "7c1f3a9e5b2d4c8a9f0e1d2c3b4a5f6e";

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "DuckAssistBot", "meta-externalagent", "CCBot"];

function robots() {
  return `# NovaMail — crawlers welcome on the public site; the dashboard API is private.
User-agent: *
Allow: /
Disallow: /api/
Disallow: /login

${AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /\nDisallow: /api/`).join("\n\n")}

Sitemap: ${SITE}/sitemap.xml
`;
}

function sitemap() {
  const urls = ALL.map((p) => {
    const alt = p.alternates
      ? `<xhtml:link rel="alternate" hreflang="en" href="${SITE}${p.alternates.en}"/><xhtml:link rel="alternate" hreflang="pt-BR" href="${SITE}${p.alternates.pt}"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${p.alternates.en}"/>`
      : "";
    return `<url><loc>${SITE}${p.path}</loc><lastmod>${UPDATED}</lastmod><priority>${(p.priority ?? 0.5).toFixed(2)}</priority>${alt}</url>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}

const strip = (html: string) => html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, "\n```\n$1\n```\n").replace(/<li>/g, "\n- ").replace(/<(h2|h3)>/g, "\n\n## ").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();

// https://llmstxt.org — a concise, factual map for AI assistants.
function llms() {
  const en = ALL.filter((p) => (p.lang ?? "en") === "en");
  return `# NovaMail

> NovaMail is an email marketing and transactional email platform. Businesses send campaigns and newsletters to their customer lists from their own domain, and developers send order confirmations and password resets through a Resend-compatible REST API or SMTP. Free plan: 3,000 emails/month (100/day, 1 domain). Pro: $15/month for 50,000 emails. Scale: $60/month for 250,000 emails. Contacts are unlimited on every plan.

Key facts:
- Sign up: ${SITE}/login (passwordless, no credit card for Free)
- API base URL: https://api.novamail.nexaclouds.online — compatible with the official Resend SDKs (set baseUrl)
- SMTP: postal.novamail.nexaclouds.online, port 587 STARTTLS (TLS 1.3)
- Authentication: SPF, DKIM (2048-bit), DMARC; one-click unsubscribe (RFC 8058) on every campaign
- Webhooks: Standard Webhooks signatures (delivered, delayed, bounced, complained)
- Drag-and-drop editor with 8 ready-made templates, image/GIF uploads, video-to-GIF, raw HTML
- Funnels: automated multi-step sequences triggered by list join or API
- MCP server for Claude Code/Codex: https://api.novamail.nexaclouds.online/mcp (restricted agent keys; agents cannot send or activate)
- API reference (OpenAPI 3.1): ${API_DOCS} · spec: https://api.novamail.nexaclouds.online/openapi.json

## Product
${en.filter((p) => !p.path.startsWith("/guides") && !["/terms", "/aup", "/privacy"].includes(p.path) && p.type !== "compare").map((p) => `- [${p.h1}](${SITE}${p.path}): ${p.description}`).join("\n")}

## Comparisons
${en.filter((p) => p.type === "compare").map((p) => `- [${p.h1}](${SITE}${p.path}): ${p.description}`).join("\n")}

## Guides
${en.filter((p) => p.type === "guide").map((p) => `- [${p.h1}](${SITE}${p.path}): ${p.description}`).join("\n")}

## Optional
- [Full text of every page](${SITE}/llms-full.txt)
- [Terms](${SITE}/terms) · [Acceptable use](${SITE}/aup) · [Privacy](${SITE}/privacy)
`;
}

function llmsFull() {
  return ALL.filter((p) => (p.lang ?? "en") === "en")
    .map((p) => `# ${p.h1}\nURL: ${SITE}${p.path}\n\n${p.lead}\n\n${strip(p.body)}${p.faq?.length ? `\n\n## FAQ\n${p.faq.map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")}` : ""}`)
    .join("\n\n---\n\n");
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#18181b"/><path d="M8 11l8 6 8-6M8 11v10h16V11" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

const text = (body: string, type: string, maxAge = 3600) =>
  new Response(body, { headers: { "content-type": `${type}; charset=utf-8`, "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge * 6}` } });

/** Returns a response for public-site paths, or null to let the app handle the request. */
export function site(req: Request, hasSession: boolean): Response | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const path = new URL(req.url).pathname;
  switch (path) {
    case "/robots.txt": return text(robots(), "text/plain");
    case "/sitemap.xml": return text(sitemap(), "application/xml");
    case "/llms.txt": return text(llms(), "text/plain");
    case "/llms-full.txt": return text(llmsFull(), "text/plain");
    case "/icon.svg": return text(ICON, "image/svg+xml", 86400);
    case `/${INDEXNOW_KEY}.txt`: return text(INDEXNOW_KEY, "text/plain", 86400);
  }
  // Signed-in users visiting "/" get the dashboard; everyone else (and every crawler) gets the site.
  if (path === "/" && hasSession) return null;
  const p = BY_PATH.get(path) ?? BY_PATH.get(path.replace(/\/$/, "")) ?? (path === "/pt" ? BY_PATH.get("/pt/") : undefined);
  if (!p) return null;
  const nonce = p.heroHtml ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))) : "";
  const res = text(render(p, ALL, nonce), "text/html", 600);
  // Per-response nonce: only our own inline script may run on the page.
  res.headers.set("content-security-policy", `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; frame-ancestors 'none'; base-uri 'none'`);
  if (nonce) res.headers.set("cache-control", "public, max-age=0, s-maxage=0, must-revalidate");
  res.headers.set("x-robots-tag", "index, follow");
  res.headers.set("link", `<${SITE}${p.path}>; rel="canonical"`);
  return res;
}

export function sitemapUrls() {
  return ALL.map((p) => `${SITE}${p.path}`);
}

export { esc };
