import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env, WebhookJob } from "./env";
import { requireApiKey, requireFullAccess, requireOwner } from "./lib/auth";
import { ApiError, errors, sendError } from "./lib/http";
import { handleQueue } from "./lib/webhooks";
import { apiKeys, me, suppressions, usage, webhooks } from "./routes/account";
import { auth } from "./routes/auth";
import { billing, stripeHooks } from "./routes/billing";
import { audiences, broadcasts, processBroadcasts, unsubscribe } from "./routes/marketing";
import { contactTags, funnels, processFunnels } from "./routes/funnels";
import { track } from "./routes/track";
import { crmFields, people, segments } from "./routes/crm";
import { processWarmups } from "./lib/ip-pools";
import { cleanupPending, forms, publicForms } from "./routes/forms";
import { reports } from "./routes/reports";
import { team } from "./routes/team";
import { commerceApi, processCarts, storeHooks, stores } from "./routes/commerce";
import { ai } from "./routes/ai";
import { tools } from "./routes/tools";
import { deals, pipelines, tasks } from "./routes/pipeline";
import { integrations } from "./routes/integrations";
import { channels, messages, messagingHooks } from "./routes/messaging";
import { mcp } from "./routes/mcp";
import { media, serveMedia, templates } from "./routes/templates";
import { admin } from "./routes/admin";
import { domains } from "./routes/domains";
import { emails } from "./routes/emails";
import { postalHooks } from "./routes/postal-hooks";
import { sesHooks } from "./routes/ses-hooks";
import { sesAccount } from "./lib/ses";
import { fbl } from "./routes/fbl";
import { UpstreamError } from "./lib/postal";
import { openDb } from "./lib/dodb";
import { PLANS } from "./lib/plans";
import { site } from "./site";
import { docsHtml, openapi } from "./openapi";

export { NovaDB } from "./lib/dodb";

export const VERSION = "0.1.0";

export const app = new Hono<AppEnv>();

// Public assets meant to be loaded by other sites and mail clients: signup forms (script, card,
// landing page in an iframe), hosted media and the tracking pixel.
app.use("*", async (c, next) => {
  await next();
  const p = new URL(c.req.url).pathname;
  if (/^\/(f|m|t)\//.test(p)) {
    c.res.headers.set("cross-origin-resource-policy", "cross-origin");
    c.res.headers.delete("cross-origin-opener-policy");
    if (p.startsWith("/f/")) c.res.headers.delete("x-frame-options");
  }
});
app.use("*", secureHeaders());
app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "content-type", "idempotency-key"], allowMethods: ["GET", "POST", "PATCH", "DELETE"] }));

app.get("/", (c) => c.json({ name: "NovaMail API", version: VERSION, docs: `${c.env.PUBLIC_URL}/docs` }));
app.get("/health", async (c) => {
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>().catch(() => null);
  return c.json({ ok: db?.ok === 1, version: VERSION }, db?.ok === 1 ? 200 : 503);
});

// Public price list (landing page).
app.get("/plans", (c) => {
  c.header("cache-control", "public, max-age=300");
  return c.json({ data: (["free", "pro", "scale"] as const).map((id) => ({ id, label: PLANS[id].label, price_usd: PLANS[id].priceUsd, monthly: PLANS[id].monthly, daily: PLANS[id].daily, domains: PLANS[id].domains })) });
});

// Public status: API + database + sending node + outbound delivery, cached 30 s at the edge.
// outbound_delivery comes from the node's 10-min healthcheck (real TCP test to Gmail MX on port 25),
// so the page never says "operational" while mail cannot actually leave the server.
type NodeHealth = { ok: boolean; postal: string; outbound_25?: boolean | null; blocklisted?: string[]; checked_at?: string | null };
app.get("/status", async (c) => {
  const t0 = Date.now();
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>().catch(() => null);
  const node: NodeHealth | null =
    c.env.SENDING_NODE === "ses"
      ? await sesAccount(c.env).then((a) => (a ? { ok: true, postal: "ses", outbound_25: !!(a.SendingEnabled && a.ProductionAccessEnabled), blocklisted: [], checked_at: new Date().toISOString() } : null))
      : await fetch(`${c.env.POSTAL_ADMIN_URL}/health`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json() as Promise<NodeHealth>).catch(() => null);
  const listed = node?.blocklisted ?? [];
  const outbound = !node?.ok ? "down" : node.outbound_25 === false ? "blocked" : node.outbound_25 === null ? "unknown" : listed.length ? "degraded" : "operational";
  const sending = !node?.ok ? "down" : outbound === "operational" ? "operational" : "degraded";
  const body = {
    api: "operational",
    database: db?.ok === 1 ? "operational" : "down",
    sending_node: sending,
    outbound_delivery: outbound,
    blocklisted: listed,
    postal: node?.postal ?? null,
    node_checked_at: node?.checked_at ?? null,
    checked_ms: Date.now() - t0,
    at: new Date().toISOString(),
  };
  c.header("cache-control", "public, max-age=30");
  if (!(c.req.header("accept") ?? "").includes("text/html")) return c.json(body, db?.ok === 1 && node?.ok ? 200 : 503);
  const pt = /^pt/i.test(c.req.header("accept-language") ?? "");
  const L = pt
    ? { api: "API", db: "Banco de dados", node: "Servidor de envio", out: "Entrega para fora (Gmail, Outlook…)", operational: "Operacional", degraded: "Parcial", down: "Fora do ar", blocked: "Bloqueada", unknown: "Verificando", checked: "Verificado", note: "A entrega externa está temporariamente indisponível enquanto o provedor de nuvem analisa a liberação do envio. A API e o painel funcionam normalmente.", listedNote: "IP em lista de bloqueio:" }
    : { api: "API", db: "Database", node: "Sending server", out: "Outbound delivery (Gmail, Outlook…)", operational: "Operational", degraded: "Partial", down: "Down", blocked: "Blocked", unknown: "Checking", checked: "Checked", note: "Outbound delivery is temporarily unavailable while the cloud provider reviews our sending limit removal. The API and dashboard work normally.", listedNote: "IP listed on:" };
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const row = (k: string, v: string) => `<li><span>${k}</span><b class="${v}">${(L as Record<string, string>)[v] ?? v}</b></li>`;
  const notes = (outbound === "blocked" ? `<p>${L.note}</p>` : "") + (listed.length ? `<p>${L.listedNote} ${listed.map(esc).join(", ")}</p>` : "");
  return c.html(`<!doctype html><html lang="${pt ? "pt-BR" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>NovaMail status</title>
<style>body{margin:0;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;color:#18181b;display:grid;place-items:center;min-height:100vh;padding:16px}main{width:100%;max-width:480px}ul{list-style:none;padding:0;border:1px solid #e4e4e7;border-radius:12px;background:#fff}li{display:flex;justify-content:space-between;gap:12px;padding:14px 18px;border-top:1px solid #f4f4f5}li:first-child{border:0}b{white-space:nowrap}.operational{color:#047857}.down,.blocked{color:#b91c1c}.degraded,.unknown{color:#b45309}p{color:#52525b}small{color:#71717a}@media(prefers-color-scheme:dark){body{background:#09090b;color:#f4f4f5}ul{background:#18181b;border-color:#27272a}li{border-color:#27272a}p{color:#a1a1aa}}</style></head>
<body><main><h1>NovaMail</h1><ul>${row(L.api, body.api)}${row(L.db, body.database)}${row(L.node, body.sending_node)}${row(L.out, body.outbound_delivery)}</ul>${notes}<small>${L.checked} ${body.at} · ${body.checked_ms} ms</small></main></body></html>`);
});

app.get("/openapi.json", (c) => c.json(openapi(c.env.PUBLIC_URL)));
app.get("/docs", (c) => c.html(docsHtml(`${c.env.PUBLIC_URL}/openapi.json`)));

// Postal -> NovaMail (signed with Postal's RSA key, no API key).
app.route("/hooks/postal", postalHooks);
// Amazon SES events via SNS (signature-verified, our topic only).
app.route("/hooks/ses", sesHooks);
app.route("/hooks/stripe", stripeHooks);
app.route("/u", unsubscribe);
app.route("/f", publicForms);
app.route("/hooks/store", storeHooks);
app.route("/hooks/messaging", messagingHooks);
// Public media used inside emails (immutable, edge-cached).
app.get("/m/:id", (c) => serveMedia(c.env, c.req.raw, c.req.param("id"), c.executionCtx));
app.route("/hooks/fbl", fbl);
// Open/click tracking (public, signed tokens).
app.route("/t", track);
// MCP for Claude Code / Codex (auth + scope enforced per tool through the REST routes).
app.route("/mcp", mcp);

// Customer API (Resend-compatible paths).
const noAgents: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("principal").permission === "agent") throw errors.forbidden("Agent keys cannot send email directly; build templates/funnels and let the owner send.");
  await next();
};
app.use("/emails/*", requireApiKey, noAgents);
app.use("/emails", requireApiKey, noAgents);
app.route("/emails", emails);

app.route("/auth", auth);

for (const path of ["/domains", "/api-keys", "/webhooks", "/suppressions", "/usage", "/me", "/billing", "/audiences", "/broadcasts", "/templates", "/media", "/funnels", "/contacts", "/people", "/segments", "/crm", "/forms", "/reports", "/team", "/stores", "/commerce", "/ai", "/tools", "/deals", "/pipelines", "/tasks", "/integrations", "/channels", "/messages"]) {
  app.use(path, requireApiKey, requireFullAccess);
  app.use(`${path}/*`, requireApiKey, requireFullAccess);
}
app.route("/domains", domains);
app.route("/api-keys", apiKeys);
app.route("/webhooks", webhooks);
app.route("/suppressions", suppressions);
app.route("/usage", usage);
app.route("/me", me);
app.route("/billing", billing);
app.route("/audiences", audiences);
app.route("/broadcasts", broadcasts);
app.route("/templates", templates);
app.route("/media", media);
app.route("/funnels", funnels);
app.route("/contacts/tags", contactTags);
app.route("/people", people);
app.route("/segments", segments);
app.route("/crm/fields", crmFields);
app.route("/forms", forms);
app.route("/reports", reports);
app.route("/team", team);
app.route("/stores", stores);
app.route("/commerce", commerceApi);
app.route("/ai", ai);
app.route("/tools", tools);
app.route("/deals", deals);
app.route("/pipelines", pipelines);
app.route("/tasks", tasks);
app.route("/integrations", integrations);
app.route("/channels", channels);
app.route("/messages", messages);

// Platform owner.
app.use("/admin/*", requireOwner);
app.route("/admin", admin);

app.notFound((c) => c.json({ statusCode: 404, name: "not_found", message: "Route not found." }, 404));
app.onError((err, c) => {
  if (err instanceof ApiError) return sendError(c, err);
  if (err instanceof UpstreamError) return sendError(c, new ApiError(err.status as 422, err.code, err.message));
  console.error(JSON.stringify({ level: "error", path: c.req.path, message: err.message, stack: err.stack }));
  return c.json({ statusCode: 500, name: "internal_server_error", message: "Something went wrong. It has been logged." }, 500);
});

/** Attaches the D1-compatible handle (SQLite Durable Object) unless a real D1 is bound. */
const withDb = (env: Env): Env => (env.DB ? env : { ...env, DB: openDb(env.NOVADB) });

/**
 * app.<domain>  → dashboard (static assets) + same-origin API under /api/*
 * api.<domain>  → public API
 */
export async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (env.APP_URL && url.hostname === new URL(env.APP_URL).hostname) {
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      url.pathname = url.pathname.slice(4) || "/";
      return app.fetch(new Request(url, req), withDb(env), ctx);
    }
    // Public marketing site (server-rendered for search engines and AI crawlers).
    const page = site(req, /(?:^|;\s*)nm_session=/.test(req.headers.get("cookie") ?? ""));
    if (page) {
      page.headers.set("x-content-type-options", "nosniff");
      page.headers.set("referrer-policy", "strict-origin-when-cross-origin");
      if (!page.headers.has("content-security-policy")) page.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
      return page;
    }
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(req);
      const h = new Headers(res.headers);
      // Stripe embedded Checkout needs js.stripe.com (script + frames) and api.stripe.com.
      h.set("content-security-policy", "default-src 'self'; script-src 'self' https://js.stripe.com https://*.js.stripe.com; frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://hooks.stripe.com; connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://*.stripe.com; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://checkout.stripe.com");
      h.set("x-content-type-options", "nosniff");
      h.set("referrer-policy", "strict-origin-when-cross-origin");
      return new Response(res.body, { status: res.status, headers: h });
    }
  }
  return app.fetch(req, withDb(env), ctx);
}

export default {
  fetch: route,
  queue: (batch, env) => handleQueue(batch, withDb(env)),
  // Every minute: next batch of each broadcast being sent.
  scheduled: async (_ctrl, env, ctx) => {
    const e = withDb(env);
    ctx.waitUntil(processBroadcasts(e).then((r) => r.length && console.log(JSON.stringify({ level: "info", broadcasts: r }))));
    ctx.waitUntil(processFunnels(e).then((r) => r.due && console.log(JSON.stringify({ level: "info", funnels: r }))));
    if (new Date(_ctrl.scheduledTime).getUTCMinutes() === 13) ctx.waitUntil(cleanupPending(e));
    if (new Date(_ctrl.scheduledTime).getUTCMinutes() % 5 === 0) ctx.waitUntil(processCarts(e).then((n) => n && console.log(JSON.stringify({ level: "info", abandoned_carts: n }))));
    if (new Date(_ctrl.scheduledTime).getUTCMinutes() === 7) ctx.waitUntil(processWarmups(e).then((n) => n && console.log(JSON.stringify({ level: "info", warmups: n }))));
  },
} satisfies ExportedHandler<Env, WebhookJob>;
