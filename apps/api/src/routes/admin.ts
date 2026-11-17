// Platform-owner routes (Bearer OWNER_TOKEN). Used to onboard André's own brands
// before self-service signup + Stripe go live, and for abuse handling.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { createAccount, poolFor } from "../lib/accounts";
import { prefixedId, randomToken, sha256Hex } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { planOf, type PlanId } from "../lib/plans";
import { postalAdmin } from "../lib/postal";
import { dedicatedPoolName, notifyOwner, syncSending } from "../lib/ip-pools";

export const admin = new Hono<AppEnv>();

admin.post("/accounts", async (c) => {
  const parsed = z
    .object({ name: z.string().min(1).max(100), email: z.email(), plan: z.enum(["free", "pro", "scale", "internal"]).default("free"), ip_pool: z.string().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const { name, email, plan } = parsed.data;
  return c.json(await createAccount(c.env, { name, email, plan, ipPool: parsed.data.ip_pool, actor: "owner" }), 201);
});

admin.get("/accounts", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT a.id, a.name, a.email, a.plan, a.status, a.suspended_reason, a.ip_pool, a.created_at,
            COALESCE((SELECT SUM(sent) FROM usage_daily u WHERE u.account_id = a.id AND u.day >= strftime('%Y-%m-01','now')),0) AS sent_month
       FROM accounts a ORDER BY a.created_at DESC`,
  ).all();
  return c.json({ object: "list", data: r.results });
});

admin.patch("/accounts/:id", async (c) => {
  const parsed = z.object({ plan: z.enum(["free", "pro", "scale", "internal"]).optional(), ip_pool: z.string().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const a = await c.env.DB.prepare("SELECT plan, ip_pool, postal_org, postal_server FROM accounts WHERE id = ?").bind(c.req.param("id")).first<{ plan: PlanId; ip_pool: string; postal_org: string; postal_server: string }>();
  if (!a) throw errors.notFound("Account");
  const plan = parsed.data.plan ?? a.plan;
  const pool = parsed.data.ip_pool ?? (parsed.data.plan ? poolFor(plan) : a.ip_pool);
  await postalAdmin.setLimits(c.env, { org: a.postal_org, server: a.postal_server, hourly_limit: planOf(plan).hourly || null, ip_pool: pool });
  await c.env.DB.prepare("UPDATE accounts SET plan = ?, ip_pool = ?, updated_at = ? WHERE id = ?").bind(plan, pool, Date.now(), c.req.param("id")).run();
  return c.json({ id: c.req.param("id"), plan, ip_pool: pool });
});

admin.post("/accounts/:id/suspend", async (c) => {
  const reason = ((await c.req.json().catch(() => ({}))) as { reason?: string }).reason ?? "Suspended by operator";
  const a = await c.env.DB.prepare("SELECT postal_org FROM accounts WHERE id = ?").bind(c.req.param("id")).first<{ postal_org: string }>();
  if (!a) throw errors.notFound("Account");
  await postalAdmin.suspend(c.env, { org: a.postal_org, reason });
  await c.env.DB.prepare("UPDATE accounts SET status = 'suspended', suspended_reason = ?, updated_at = ? WHERE id = ?").bind(reason, Date.now(), c.req.param("id")).run();
  return c.json({ id: c.req.param("id"), status: "suspended" });
});

admin.post("/accounts/:id/unsuspend", async (c) => {
  const a = await c.env.DB.prepare("SELECT postal_org FROM accounts WHERE id = ?").bind(c.req.param("id")).first<{ postal_org: string }>();
  if (!a) throw errors.notFound("Account");
  await postalAdmin.unsuspend(c.env, { org: a.postal_org });
  await c.env.DB.prepare("UPDATE accounts SET status = 'active', suspended_reason = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), c.req.param("id")).run();
  return c.json({ id: c.req.param("id"), status: "active" });
});

/** Creates (idempotently) the feedback-loop inbox on the system account's Postal server. */
admin.post("/fbl", async (c) => {
  const id = c.env.SYSTEM_ACCOUNT_ID;
  const a = id ? await c.env.DB.prepare("SELECT postal_org, postal_server FROM accounts WHERE id = ?").bind(id).first<{ postal_org: string; postal_server: string }>() : null;
  if (!a) throw errors.notFound("System account");
  const domain = (c.env.SYSTEM_FROM ?? "").match(/@([^>\s]+)/)?.[1] ?? "";
  const r = await postalAdmin.fbl(c.env, { org: a.postal_org, server: a.postal_server, domain, url: `${c.env.PUBLIC_URL}/hooks/fbl` });
  return c.json({ address: r.address });
});

/** Owner support: a short-lived (1 h) dashboard session for an account's owner user (created if missing). */
admin.post("/accounts/:id/session", async (c) => {
  const a = await c.env.DB.prepare("SELECT id, email FROM accounts WHERE id = ?").bind(c.req.param("id")).first<{ id: string; email: string }>();
  if (!a) throw errors.notFound("Account");
  let u = await c.env.DB.prepare("SELECT id FROM users WHERE account_id = ? ORDER BY created_at LIMIT 1").bind(a.id).first<{ id: string }>();
  if (!u) {
    u = { id: prefixedId("usr") };
    await c.env.DB.prepare("INSERT INTO users (id, email, account_id, role, created_at) VALUES (?,?,?, 'owner', ?)").bind(u.id, a.email, a.id, Date.now()).run();
  }
  const token = randomToken(32);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?, 'owner-support')").bind(await sha256Hex(token), u.id, now, now + 3_600_000),
    c.env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, 'owner', 'support_session', NULL, ?)").bind(a.id, now),
  ]);
  return c.json({ cookie: `nm_session=${token}`, expires_in: 3600 });
});

/** Creates/updates NovaMail's own nurture funnel (free → paid) on the system account. */
admin.post("/lifecycle/setup", async (c) => {
  const { setupNurture } = await import("../lib/lifecycle");
  return c.json(await setupNurture(c.env));
});

// ---------------------------------------------------------------- IP pools / dedicated IPs

/** Postal's pools and the dedicated-IP queue (requested = paid, waiting for an address). */
admin.get("/ips", async (c) => {
  const [pools, ded, tiers] = await Promise.all([
    postalAdmin.pools(c.env).catch((e) => ({ pools: [], error: String(e) })),
    c.env.DB.prepare("SELECT d.*, a.email, a.plan FROM dedicated_ips d JOIN accounts a ON a.id = d.account_id ORDER BY d.requested_at DESC").all(),
    c.env.DB.prepare("SELECT ip_pool, COUNT(*) AS accounts FROM accounts GROUP BY ip_pool").all(),
  ]);
  return c.json({ ...pools, dedicated: ded.results.map((d: any) => ({ ...d, suggested_pool: dedicatedPoolName(d.account_id) })), accounts_per_pool: tiers.results });
});

/** Creates/updates a Postal pool with one address (used by scripts/ip-pool.sh). */
admin.post("/ips/pools", async (c) => {
  const b = z.object({ name: z.string().regex(/^[a-z0-9_-]{2,60}$/), ipv4: z.ipv4(), hostname: z.string().min(3).max(253), ipv6: z.string().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  return c.json(await postalAdmin.upsertPool(c.env, b.data));
});

admin.delete("/ips/pools/:name", async (c) => {
  await postalAdmin.removePool(c.env, { name: c.req.param("name") });
  await c.env.DB.prepare("UPDATE dedicated_ips SET pool = NULL, ip = NULL WHERE pool = ? AND status = 'released'").bind(c.req.param("name")).run();
  return c.json({ deleted: true });
});

/** Attaches a pool to an account that bought a dedicated IP; warm-up starts now. */
admin.post("/ips/dedicated/:account/assign", async (c) => {
  const b = z.object({ pool: z.string().regex(/^[a-z0-9_-]{2,60}$/), ip: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const id = c.req.param("account");
  const a = await c.env.DB.prepare("SELECT email FROM accounts WHERE id = ?").bind(id).first<{ email: string }>();
  if (!a) throw errors.notFound("Account");
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO dedicated_ips (account_id, status, pool, ip, requested_at, assigned_at) VALUES (?, 'warming', ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET status = 'warming', pool = excluded.pool, ip = excluded.ip, assigned_at = excluded.assigned_at, released_at = NULL`,
  ).bind(id, b.data.pool, b.data.ip, now, now).run();
  const s = await syncSending(c.env, id, now);
  await notifyOwner(c.env, `Dedicated IP ${b.data.ip} attached — ${a.email}`, `<p>Warm-up started for <code>${id}</code>: ${s?.hourly ?? "?"} emails/hour today, doubling about every 2 days.</p>`);
  return c.json({ account_id: id, status: "warming", ...s });
});

/** Re-applies tier pools + limits to every account (run after adding a new pool). */
admin.post("/ips/resync", async (c) => {
  const r = await c.env.DB.prepare("SELECT id FROM accounts WHERE postal_org IS NOT NULL").all<{ id: string }>();
  const out: Record<string, string> = {};
  for (const x of r.results) {
    try { out[x.id] = (await syncSending(c.env, x.id))?.pool ?? "?"; } catch (e) { out[x.id] = `error: ${String(e).slice(0, 80)}`; }
  }
  return c.json({ synced: r.results.length, pools: out });
});
