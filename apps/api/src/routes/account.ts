// API keys, customer webhooks, suppressions and usage for the authenticated account.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { createApiKey } from "../lib/auth";
import { b64encode, prefixedId } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { limitsOf, planOf } from "../lib/plans";
import { reputation, usageSnapshot } from "../lib/usage";

export const apiKeys = new Hono<AppEnv>();

apiKeys.post("/", async (c) => {
  const parsed = z
    .object({ name: z.string().min(1).max(50), permission: z.enum(["full_access", "sending_access", "agent_access"]).default("full_access"), domain_id: z.string().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const p = c.get("principal");
  if (parsed.data.domain_id) {
    const d = await c.env.DB.prepare("SELECT id FROM domains WHERE id = ? AND account_id = ?").bind(parsed.data.domain_id, p.accountId).first();
    if (!d) throw errors.notFound("Domain");
  }
  const k = await createApiKey(c.env.DB, p.accountId, parsed.data.name, parsed.data.permission === "full_access" ? "full" : parsed.data.permission === "agent_access" ? "agent" : "sending", parsed.data.domain_id ?? null);
  return c.json({ id: k.id, token: k.token }, 201);
});

apiKeys.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name, prefix, permission, created_at, last_used_at FROM api_keys WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at DESC")
    .bind(c.get("principal").accountId)
    .all();
  return c.json({ object: "list", data: r.results });
});

apiKeys.delete("/:id", async (c) => {
  const p = c.get("principal");
  if (c.req.param("id") === p.apiKeyId) throw errors.validation("You cannot revoke the key used for this request.");
  const r = await c.env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL").bind(Date.now(), c.req.param("id"), p.accountId).run();
  if (!r.meta.changes) throw errors.notFound("API key");
  return c.json({ id: c.req.param("id"), deleted: true });
});

export const webhooks = new Hono<AppEnv>();

import { EVENTS } from "../lib/events";

webhooks.post("/", async (c) => {
  const parsed = z
    .object({ endpoint: z.url({ protocol: /^https$/ }), events: z.array(z.enum([...EVENTS, "*"])).min(1).default(["*"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const id = prefixedId("wh");
  const secret = `whsec_${b64encode(crypto.getRandomValues(new Uint8Array(32)))}`;
  await c.env.DB.prepare("INSERT INTO webhooks (id, account_id, url, secret, events, created_at) VALUES (?,?,?,?,?,?)")
    .bind(id, c.get("principal").accountId, parsed.data.endpoint, secret, JSON.stringify(parsed.data.events), Date.now())
    .run();
  return c.json({ object: "webhook", id, endpoint: parsed.data.endpoint, events: parsed.data.events, signing_secret: secret }, 201);
});

webhooks.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, url AS endpoint, events, enabled, created_at FROM webhooks WHERE account_id = ?").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results.map((w) => ({ ...w, events: JSON.parse(w.events as string), enabled: !!w.enabled })) });
});

webhooks.delete("/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM webhooks WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  if (!r.meta.changes) throw errors.notFound("Webhook");
  return c.json({ id: c.req.param("id"), deleted: true });
});

export const suppressions = new Hono<AppEnv>();

suppressions.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT address, reason, created_at FROM suppressions WHERE account_id = ? ORDER BY created_at DESC LIMIT 500").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

suppressions.post("/", async (c) => {
  const parsed = z.object({ address: z.email(), reason: z.enum(["manual", "unsubscribe"]).default("manual") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  await c.env.DB.prepare("INSERT OR REPLACE INTO suppressions (account_id, address, reason, created_at) VALUES (?,?,?,?)")
    .bind(c.get("principal").accountId, parsed.data.address.toLowerCase(), parsed.data.reason, Date.now())
    .run();
  return c.json({ address: parsed.data.address.toLowerCase(), suppressed: true }, 201);
});

suppressions.delete("/:address", async (c) => {
  await c.env.DB.prepare("DELETE FROM suppressions WHERE account_id = ? AND address = ?").bind(c.get("principal").accountId, c.req.param("address").toLowerCase()).run();
  return c.json({ address: c.req.param("address").toLowerCase(), suppressed: false });
});

export const usage = new Hono<AppEnv>();

usage.get("/", async (c) => {
  const id = c.get("principal").accountId;
  const a = await c.env.DB.prepare("SELECT plan, status, extra_packs FROM accounts WHERE id = ?").bind(id).first<{ plan: string; status: string; extra_packs: number }>();
  const plan = limitsOf(a?.plan ?? "free", a?.extra_packs ?? 0);
  const u = await usageSnapshot(c.env.DB, id);
  const rep = await reputation(c.env.DB, id);
  return c.json({
    plan: plan.id,
    status: a?.status,
    limits: { daily: plan.daily, monthly: plan.monthly, domains: plan.domains },
    usage: { today: u.today, month: u.month },
    reputation: { sent_7d: rep.sent, bounce_rate: rep.bounceRate, complaint_rate: rep.complaintRate },
  });
});

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const p = c.get("principal");
  const a = await c.env.DB.prepare("SELECT id, name, email, plan, status, suspended_reason, created_at, extra_packs, billing_interval, stripe_subscription FROM accounts WHERE id = ?").bind(p.accountId).first<Record<string, unknown>>();
  const u = p.userId ? await c.env.DB.prepare("SELECT email, role FROM users WHERE id = ?").bind(p.userId).first<{ email: string; role: string }>() : null;
  const plan = limitsOf((a?.plan as string) ?? "free", (a?.extra_packs as number) ?? 0);
  const counts = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM domains WHERE account_id = ?1) AS domains,
            (SELECT COUNT(*) FROM domains WHERE account_id = ?1 AND status = 'verified') AS verified_domains,
            (SELECT COUNT(*) FROM api_keys WHERE account_id = ?1 AND revoked_at IS NULL) AS api_keys,
            (SELECT COUNT(*) FROM webhooks WHERE account_id = ?1) AS webhooks`,
  ).bind(p.accountId).first<Record<string, number>>();
  return c.json({
    user: u ? { ...u, role: p.role ?? u.role } : null,
    account: { ...a, created_at: new Date(a!.created_at as number).toISOString() },
    plan: { id: plan.id, label: plan.label, daily: plan.daily, monthly: plan.monthly, domains: plan.domains, extra_packs: a?.extra_packs ?? 0, interval: a?.billing_interval ?? null, subscribed: !!a?.stripe_subscription },
    usage: await usageSnapshot(c.env.DB, p.accountId),
    counts,
  });
});

/** Daily sent/bounced series for the dashboard chart (last N days, UTC). */
me.get("/stats", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 30) || 30, 1), 90);
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const r = await c.env.DB.prepare("SELECT day, sent, bounced, complained FROM usage_daily WHERE account_id = ? AND day >= ? ORDER BY day").bind(c.get("principal").accountId, since).all();
  return c.json({ object: "list", data: r.results });
});
