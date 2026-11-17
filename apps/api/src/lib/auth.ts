import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Role } from "../env";
import type { AppEnv } from "../env";
import { prefixedId, randomToken, safeEqual, sha256Hex } from "./crypto";
import { errors } from "./http";

export const KEY_PREFIX = "nm_";

export async function createApiKey(db: D1Database, accountId: string, name: string, permission: "full" | "sending" | "agent" = "full", domainId: string | null = null) {
  const token = `${KEY_PREFIX}${randomToken(24)}`;
  const id = prefixedId("key");
  await db
    .prepare("INSERT INTO api_keys (id, account_id, name, prefix, hash, permission, domain_id, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, accountId, name, token.slice(0, 10), await sha256Hex(token), permission, domainId, Date.now())
    .run();
  return { id, token };
}

/** Customer API-key auth. Also accepts the Resend header style (Authorization: Bearer). */
/**
 * Team roles for dashboard sessions (API keys keep their own permission model).
 *   owner  — everything, incl. billing and ownership
 *   admin  — everything except billing changes and removing owners
 *   editor — campaigns, templates, funnels, forms, contacts; no keys/domains/webhooks/team/billing
 *   viewer — read-only
 */
export function roleAllows(role: Role, method: string, path: string) {
  const read = method === "GET" || method === "HEAD" || method === "OPTIONS";
  if (path.startsWith("/team/switch") || path.startsWith("/team/invites/accept")) return true;
  if (role === "owner") return true;
  if (role === "viewer") return read;
  const billingWrite = path.startsWith("/billing") && !read;
  if (role === "admin") return !billingWrite;
  // editor
  if (/^\/(api-keys|domains|webhooks|team|billing|suppressions)(\/|$)/.test(path)) return read && !path.startsWith("/api-keys");
  return true;
}

export const requireApiKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  const h = c.req.header("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) {
    // Dashboard: session cookie. Mutations must carry a custom header, which a cross-site
    // form or image cannot send without a CORS preflight (CSRF defence on top of SameSite=Lax).
    const { sessionPrincipal, SESSION_COOKIE } = await import("../routes/auth");
    const s = await sessionPrincipal(c.env, getCookie(c, SESSION_COOKIE));
    if (s) {
      if (c.req.method !== "GET" && c.req.header("x-novamail-client") !== "dashboard") throw errors.forbidden("Missing dashboard header.");
      if (s.status !== "active") throw errors.suspended(s.suspended_reason);
      if (!roleAllows(s.role, c.req.method, new URL(c.req.url).pathname)) throw errors.forbidden(`Your role (${s.role}) can't do this. Ask an owner or admin.`);
      c.set("principal", { accountId: s.account_id, apiKeyId: null, permission: "full", domainId: null, userId: s.user_id, role: s.role });
      return next();
    }
  }
  if (!token.startsWith(KEY_PREFIX)) throw errors.unauthorized();
  const row = await c.env.DB.prepare(
    `SELECT k.id, k.account_id, k.permission, k.domain_id, k.last_used_at, a.status, a.suspended_reason
       FROM api_keys k JOIN accounts a ON a.id = k.account_id
      WHERE k.hash = ? AND k.revoked_at IS NULL`,
  )
    .bind(await sha256Hex(token))
    .first<{ id: string; account_id: string; permission: "full" | "sending" | "agent"; domain_id: string | null; last_used_at: number | null; status: string; suspended_reason: string | null }>();
  if (!row) throw errors.unauthorized();
  if (row.status !== "active") throw errors.suspended(row.suspended_reason);
  c.set("principal", { accountId: row.account_id, apiKeyId: row.id, permission: row.permission, domainId: row.domain_id });
  // Touch last_used_at at most once a minute to keep writes cheap.
  if (!row.last_used_at || Date.now() - row.last_used_at > 60_000) {
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(Date.now(), row.id).run());
  }
  await next();
};

// What an AI-agent key (Claude Code, Codex… through MCP) may do: build and inspect, never send
// to arbitrary people, never delete, never touch keys/webhooks/domains/billing.
export const AGENT_ALLOW: [string, RegExp][] = [
  ["GET", /^\/(me|usage)$/],
  ["GET", /^\/domains(\/[\w-]+)?$/],
  ["GET", /^\/audiences(\/[\w-]+\/contacts)?$/],
  ["POST", /^\/audiences(\/[\w-]+\/contacts)?$/],
  ["GET", /^\/templates(\/presets|\/[\w-]+)?$/],
  ["POST", /^\/templates(\/[\w-]+\/test)?$/],
  ["PATCH", /^\/templates\/[\w-]+$/],
  ["GET", /^\/funnels(\/[\w-]+)?$/],
  ["POST", /^\/funnels(\/[\w-]+\/pause)?$/],
  ["PATCH", /^\/funnels\/[\w-]+$/],
  ["GET", /^\/broadcasts(\/[\w-]+)?$/],
  ["POST", /^\/broadcasts$/],
  ["GET", /^\/media$/],
];
export const AGENT_RATE_PER_MIN = 120;

export const requireFullAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const p = c.get("principal");
  if (p.permission === "agent") {
    const path = new URL(c.req.url).pathname;
    if (!AGENT_ALLOW.some(([m, re]) => m === c.req.method && re.test(path))) throw errors.forbidden("This agent key cannot do that. Ask the account owner to do it in the dashboard.");
    const win = Math.floor(Date.now() / 60_000);
    const r = await c.env.DB.prepare("INSERT INTO rate_limits (key_id, window, count) VALUES (?1, ?2, 1) ON CONFLICT(key_id, window) DO UPDATE SET count = count + 1 RETURNING count").bind(p.apiKeyId, win).first<{ count: number }>();
    if ((r?.count ?? 0) > AGENT_RATE_PER_MIN) throw errors.quota(`Agent rate limit: ${AGENT_RATE_PER_MIN} requests per minute.`);
    if (c.req.method !== "GET") {
      c.executionCtx.waitUntil(c.env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)").bind(p.accountId, `agent:${p.apiKeyId}`, `${c.req.method} ${path}`, null, Date.now()).run());
    }
    if (c.req.method === "POST" && /^\/audiences\/[\w-]+\/contacts$/.test(path)) {
      const len = Number(c.req.header("content-length") ?? 0);
      if (len > 64_000) throw errors.validation("Agents can import at most ~200 contacts per call.");
    }
    return next();
  }
  if (p.permission !== "full") throw errors.forbidden();
  await next();
};

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const h = c.req.header("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!c.env.OWNER_TOKEN || !token || !safeEqual(token, c.env.OWNER_TOKEN)) throw errors.unauthorized();
  await next();
};
