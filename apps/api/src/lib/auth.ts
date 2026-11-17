import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { prefixedId, randomToken, safeEqual, sha256Hex } from "./crypto";
import { errors } from "./http";

export const KEY_PREFIX = "nm_";

export async function createApiKey(db: D1Database, accountId: string, name: string, permission: "full" | "sending" = "full", domainId: string | null = null) {
  const token = `${KEY_PREFIX}${randomToken(24)}`;
  const id = prefixedId("key");
  await db
    .prepare("INSERT INTO api_keys (id, account_id, name, prefix, hash, permission, domain_id, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, accountId, name, token.slice(0, 10), await sha256Hex(token), permission, domainId, Date.now())
    .run();
  return { id, token };
}

/** Customer API-key auth. Also accepts the Resend header style (Authorization: Bearer). */
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
      c.set("principal", { accountId: s.account_id, apiKeyId: null, permission: "full", domainId: null, userId: s.user_id });
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
    .first<{ id: string; account_id: string; permission: "full" | "sending"; domain_id: string | null; last_used_at: number | null; status: string; suspended_reason: string | null }>();
  if (!row) throw errors.unauthorized();
  if (row.status !== "active") throw errors.suspended(row.suspended_reason);
  c.set("principal", { accountId: row.account_id, apiKeyId: row.id, permission: row.permission, domainId: row.domain_id });
  // Touch last_used_at at most once a minute to keep writes cheap.
  if (!row.last_used_at || Date.now() - row.last_used_at > 60_000) {
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(Date.now(), row.id).run());
  }
  await next();
};

export const requireFullAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("principal").permission !== "full") throw errors.forbidden();
  await next();
};

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const h = c.req.header("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!c.env.OWNER_TOKEN || !token || !safeEqual(token, c.env.OWNER_TOKEN)) throw errors.unauthorized();
  await next();
};
