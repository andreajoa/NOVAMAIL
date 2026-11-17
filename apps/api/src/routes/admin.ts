// Platform-owner routes (Bearer OWNER_TOKEN). Used to onboard André's own brands
// before self-service signup + Stripe go live, and for abuse handling.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { createApiKey } from "../lib/auth";
import { prefixedId, seal } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { PLANS, planOf, type PlanId } from "../lib/plans";
import { postalAdmin } from "../lib/postal";

export const admin = new Hono<AppEnv>();

const poolFor = (plan: PlanId, override?: string) => override ?? (PLANS[plan].ipPool === "shared" ? "shared" : "trusted");

/** Creates the Postal org+server for an account and stores its sealed API key. */
export async function provisionAccount(env: Env, accountId: string, fetcher?: typeof fetch) {
  const a = await env.DB.prepare("SELECT id, name, plan, ip_pool FROM accounts WHERE id = ?").bind(accountId).first<{ id: string; name: string; plan: PlanId; ip_pool: string }>();
  if (!a) throw errors.notFound("Account");
  const r = await postalAdmin.provision(
    env,
    { account_id: a.id, name: a.name, hourly_limit: planOf(a.plan).hourly, ip_pool: a.ip_pool, webhook_url: `${env.PUBLIC_URL}/hooks/postal/${a.id}` },
    fetcher,
  );
  await env.DB.prepare("UPDATE accounts SET postal_org = ?, postal_server = ?, postal_server_key = ?, updated_at = ? WHERE id = ?")
    .bind(r.org, r.server, await seal(r.api_key, env.ENCRYPTION_KEY), Date.now(), a.id)
    .run();
  return r;
}

admin.post("/accounts", async (c) => {
  const parsed = z
    .object({ name: z.string().min(1).max(100), email: z.email(), plan: z.enum(["free", "pro", "scale", "internal"]).default("free"), ip_pool: z.string().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const { name, email, plan } = parsed.data;
  const id = prefixedId("acc");
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO accounts (id, name, email, plan, ip_pool, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, name, email.toLowerCase(), plan, poolFor(plan, parsed.data.ip_pool), now, now)
    .run();
  const prov = await provisionAccount(c.env, id);
  const key = await createApiKey(c.env.DB, id, "Default");
  await c.env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, 'owner', 'create_account', ?, ?)").bind(id, plan, now).run();
  // SMTP credentials are returned once; NovaMail never stores the password in plaintext.
  return c.json({ id, plan, api_key: key.token, smtp: { host: new URL(c.env.POSTAL_URL).hostname, port: 587, username: prov.smtp_username, password: prov.smtp_password } }, 201);
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
  await postalAdmin.setLimits(c.env, { org: a.postal_org, server: a.postal_server, hourly_limit: planOf(plan).hourly, ip_pool: pool });
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
