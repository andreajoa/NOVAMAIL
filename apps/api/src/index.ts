import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env, WebhookJob } from "./env";
import { requireApiKey, requireFullAccess, requireOwner } from "./lib/auth";
import { ApiError, sendError } from "./lib/http";
import { handleQueue } from "./lib/webhooks";
import { apiKeys, suppressions, usage, webhooks } from "./routes/account";
import { admin } from "./routes/admin";
import { domains } from "./routes/domains";
import { emails } from "./routes/emails";
import { postalHooks } from "./routes/postal-hooks";
import { UpstreamError } from "./lib/postal";
import { openDb } from "./lib/dodb";

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

// Postal -> NovaMail (signed with Postal's RSA key, no API key).
app.route("/hooks/postal", postalHooks);

// Customer API (Resend-compatible paths).
app.use("/emails/*", requireApiKey);
app.use("/emails", requireApiKey);
app.route("/emails", emails);

for (const path of ["/domains", "/api-keys", "/webhooks", "/suppressions", "/usage"]) {
  app.use(path, requireApiKey, requireFullAccess);
  app.use(`${path}/*`, requireApiKey, requireFullAccess);
}
app.route("/domains", domains);
app.route("/api-keys", apiKeys);
app.route("/webhooks", webhooks);
app.route("/suppressions", suppressions);
app.route("/usage", usage);

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

export default {
  fetch: (req, env, ctx) => app.fetch(req, withDb(env), ctx),
  queue: (batch, env) => handleQueue(batch, withDb(env)),
} satisfies ExportedHandler<Env, WebhookJob>;
