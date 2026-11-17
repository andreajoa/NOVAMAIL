import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env, WebhookJob } from "./env";
import { requireApiKey, requireFullAccess, requireOwner } from "./lib/auth";
import { ApiError, sendError } from "./lib/http";
import { handleQueue } from "./lib/webhooks";
import { apiKeys, me, suppressions, usage, webhooks } from "./routes/account";
import { auth } from "./routes/auth";
import { billing, stripeHooks } from "./routes/billing";
import { audiences, broadcasts, processBroadcasts, unsubscribe } from "./routes/marketing";
import { admin } from "./routes/admin";
import { domains } from "./routes/domains";
import { emails } from "./routes/emails";
import { postalHooks } from "./routes/postal-hooks";
import { fbl } from "./routes/fbl";
import { UpstreamError } from "./lib/postal";
import { openDb } from "./lib/dodb";
import { PLANS } from "./lib/plans";
import { site } from "./site";
import { docsHtml, openapi } from "./openapi";

export { NovaDB } from "./lib/dodb";

export const VERSION = "0.1.0";

export const app = new Hono<AppEnv>();

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

// Public status: API + database + sending node, cached 30 s at the edge.
app.get("/status", async (c) => {
  const t0 = Date.now();
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>().catch(() => null);
  const node = await fetch(`${c.env.POSTAL_ADMIN_URL}/health`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json() as Promise<{ ok: boolean; postal: string }>).catch(() => null);
  const body = { api: "operational", database: db?.ok === 1 ? "operational" : "down", sending_node: node?.ok ? "operational" : "down", postal: node?.postal ?? null, checked_ms: Date.now() - t0, at: new Date().toISOString() };
  c.header("cache-control", "public, max-age=30");
  if (!(c.req.header("accept") ?? "").includes("text/html")) return c.json(body, db?.ok === 1 && node?.ok ? 200 : 503);
  const row = (k: string, v: string) => `<li><span>${k}</span><b class="${v}">${v === "operational" ? "Operacional" : "Fora do ar"}</b></li>`;
  return c.html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>NovaMail status</title>
<style>body{margin:0;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;color:#18181b;display:grid;place-items:center;min-height:100vh;padding:16px}main{width:100%;max-width:440px}ul{list-style:none;padding:0;border:1px solid #e4e4e7;border-radius:12px;background:#fff}li{display:flex;justify-content:space-between;padding:14px 18px;border-top:1px solid #f4f4f5}li:first-child{border:0}.operational{color:#047857}.down{color:#b91c1c}small{color:#71717a}@media(prefers-color-scheme:dark){body{background:#09090b;color:#f4f4f5}ul{background:#18181b;border-color:#27272a}li{border-color:#27272a}}</style></head>
<body><main><h1>NovaMail</h1><ul>${row("API", body.api)}${row("Banco de dados", body.database)}${row("Servidor de envio", body.sending_node)}</ul><small>Verificado ${body.at} · ${body.checked_ms} ms</small></main></body></html>`);
});

app.get("/openapi.json", (c) => c.json(openapi(c.env.PUBLIC_URL)));
app.get("/docs", (c) => c.html(docsHtml(`${c.env.PUBLIC_URL}/openapi.json`)));

// Postal -> NovaMail (signed with Postal's RSA key, no API key).
app.route("/hooks/postal", postalHooks);
app.route("/hooks/stripe", stripeHooks);
app.route("/u", unsubscribe);
app.route("/hooks/fbl", fbl);

// Customer API (Resend-compatible paths).
app.use("/emails/*", requireApiKey);
app.use("/emails", requireApiKey);
app.route("/emails", emails);

app.route("/auth", auth);

for (const path of ["/domains", "/api-keys", "/webhooks", "/suppressions", "/usage", "/me", "/billing", "/audiences", "/broadcasts"]) {
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
      page.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
      return page;
    }
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(req);
      const h = new Headers(res.headers);
      // Stripe embedded Checkout needs js.stripe.com (script + frames) and api.stripe.com.
      h.set("content-security-policy", "default-src 'self'; script-src 'self' https://js.stripe.com https://*.js.stripe.com; frame-src https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://hooks.stripe.com; connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://*.stripe.com; img-src 'self' data: https://*.stripe.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://checkout.stripe.com");
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
    ctx.waitUntil(processBroadcasts(withDb(env)).then((r) => r.length && console.log(JSON.stringify({ level: "info", broadcasts: r }))));
  },
} satisfies ExportedHandler<Env, WebhookJob>;
