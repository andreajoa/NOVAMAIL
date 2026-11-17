// Email funnels (automated sequences): trigger → email → wait → email → …
// Contacts are enrolled when they join the funnel's audience (or via POST /funnels/:id/enroll)
// and the cron sends each step when it is due. Unsubscribed/suppressed people exit automatically.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { prefixedId } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { sendOne } from "./emails";
import { personalize, unsubscribeToken } from "./marketing";

export const FUNNEL_BATCH = 30;
const MAX_STEPS = 30;

const actor = (p: Principal) => (p.permission === "agent" ? `agent:${p.apiKeyId}` : p.userId ? "user" : "api");

async function own(env: Env, id: string, accountId: string) {
  const f = await env.DB.prepare("SELECT * FROM funnels WHERE id = ? AND account_id = ?").bind(id, accountId).first<Record<string, any>>();
  if (!f) throw errors.notFound("Funnel");
  return f;
}

const stepSchema = z.object({
  template_id: z.string().min(3),
  wait_minutes: z.number().int().min(0).max(60 * 24 * 365).default(0),
  subject: z.string().max(998).optional(),
});

const funnelSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: z.enum(["audience", "api"]).default("audience"),
  audience_id: z.string().optional(),
  from: z.string().min(3).max(320),
  reply_to: z.string().max(320).optional(),
  steps: z.array(stepSchema).max(MAX_STEPS).default([]),
});

async function writeSteps(env: Env, accountId: string, funnelId: string, steps: z.infer<typeof stepSchema>[]) {
  for (const s of steps) {
    const t = await env.DB.prepare("SELECT id FROM templates WHERE id = ? AND account_id = ?").bind(s.template_id, accountId).first();
    if (!t) throw errors.validation(`Template ${s.template_id} not found in this account.`);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM funnel_steps WHERE funnel_id = ?").bind(funnelId),
    ...steps.map((s, i) => env.DB.prepare("INSERT INTO funnel_steps (id, funnel_id, position, wait_minutes, template_id, subject) VALUES (?,?,?,?,?,?)").bind(prefixedId("fs"), funnelId, i, s.wait_minutes, s.template_id, s.subject ?? null)),
  ]);
}

export const funnels = new Hono<AppEnv>();

funnels.post("/", async (c) => {
  const p = c.get("principal");
  const b = funnelSchema.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (b.data.trigger === "audience") {
    if (!b.data.audience_id) throw errors.validation("audience_id is required for an audience trigger.");
    const a = await c.env.DB.prepare("SELECT id FROM audiences WHERE id = ? AND account_id = ?").bind(b.data.audience_id, p.accountId).first();
    if (!a) throw errors.notFound("Audience");
  }
  const id = prefixedId("fn");
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO funnels (id, account_id, name, trigger, audience_id, from_addr, reply_to, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?, 'draft', ?,?,?)")
    .bind(id, p.accountId, b.data.name, b.data.trigger, b.data.audience_id ?? null, b.data.from, b.data.reply_to ?? null, actor(p), now, now)
    .run();
  await writeSteps(c.env, p.accountId, id, b.data.steps);
  return c.json({ object: "funnel", id, status: "draft" }, 201);
});

funnels.get("/", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT f.id, f.name, f.trigger, f.audience_id, f.status, f.created_by, f.created_at,
            (SELECT COUNT(*) FROM funnel_steps s WHERE s.funnel_id = f.id) AS steps,
            (SELECT COUNT(*) FROM enrollments e WHERE e.funnel_id = f.id AND e.status = 'active') AS active,
            (SELECT COUNT(*) FROM enrollments e WHERE e.funnel_id = f.id AND e.status = 'done') AS completed
       FROM funnels f WHERE f.account_id = ? ORDER BY f.created_at DESC`,
  ).bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

funnels.get("/:id", async (c) => {
  const f = await own(c.env, c.req.param("id"), c.get("principal").accountId);
  const steps = await c.env.DB.prepare("SELECT s.id, s.position, s.wait_minutes, s.template_id, s.subject, t.name AS template_name FROM funnel_steps s LEFT JOIN templates t ON t.id = s.template_id WHERE s.funnel_id = ? ORDER BY s.position").bind(f.id).all();
  return c.json({ object: "funnel", ...f, from: f.from_addr, steps: steps.results });
});

funnels.patch("/:id", async (c) => {
  const p = c.get("principal");
  const f = await own(c.env, c.req.param("id"), p.accountId);
  const b = funnelSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  await c.env.DB.prepare("UPDATE funnels SET name = ?, audience_id = ?, from_addr = ?, reply_to = ?, updated_at = ? WHERE id = ?")
    .bind(b.data.name ?? f.name, b.data.audience_id ?? f.audience_id, b.data.from ?? f.from_addr, b.data.reply_to ?? f.reply_to, Date.now(), f.id)
    .run();
  if (b.data.steps) await writeSteps(c.env, p.accountId, f.id, b.data.steps);
  return c.json({ object: "funnel", id: f.id, updated: true });
});

// Activation sends real email automatically, so AI agents may build funnels but only a human
// (dashboard session or a full-access key) can switch them on.
funnels.post("/:id/:action{activate|pause}", async (c) => {
  const p = c.get("principal");
  if (c.req.param("action") === "activate" && p.permission === "agent") throw errors.forbidden("Agents can build funnels but a person must activate them in the dashboard.");
  const f = await own(c.env, c.req.param("id"), p.accountId);
  if (c.req.param("action") === "activate") {
    const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM funnel_steps WHERE funnel_id = ?").bind(f.id).first<{ n: number }>();
    if (!n?.n) throw errors.validation("Add at least one email step before activating.");
  }
  const status = c.req.param("action") === "activate" ? "active" : "paused";
  await c.env.DB.prepare("UPDATE funnels SET status = ?, updated_at = ? WHERE id = ?").bind(status, Date.now(), f.id).run();
  return c.json({ id: f.id, status });
});

funnels.delete("/:id", async (c) => {
  const f = await own(c.env, c.req.param("id"), c.get("principal").accountId);
  if (c.get("principal").permission === "agent") throw errors.forbidden("Agents cannot delete funnels.");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM enrollments WHERE funnel_id = ?").bind(f.id),
    c.env.DB.prepare("DELETE FROM funnel_steps WHERE funnel_id = ?").bind(f.id),
    c.env.DB.prepare("DELETE FROM funnels WHERE id = ?").bind(f.id),
  ]);
  return c.json({ id: f.id, deleted: true });
});

funnels.post("/:id/enroll", async (c) => {
  const p = c.get("principal");
  const f = await own(c.env, c.req.param("id"), p.accountId);
  const b = z.object({ email: z.email().transform((e) => e.toLowerCase()), first_name: z.string().max(100).optional(), last_name: z.string().max(100).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (f.status !== "active") throw errors.conflict("Funnel is not active.");
  const n = await enroll(c.env, f as { id: string; account_id: string }, [{ email: b.data.email, first_name: b.data.first_name ?? null, last_name: b.data.last_name ?? null, contact_id: null }]);
  return c.json({ enrolled: n });
});

/** Enrolls people at step 0 (idempotent per funnel+email). Returns how many were new. */
export async function enroll(env: Env, f: { id: string; account_id: string }, people: { email: string; first_name: string | null; last_name: string | null; contact_id: string | null }[], now = Date.now()) {
  if (!people.length) return 0;
  const first = await env.DB.prepare("SELECT wait_minutes FROM funnel_steps WHERE funnel_id = ? AND position = 0").bind(f.id).first<{ wait_minutes: number }>();
  const at = now + (first?.wait_minutes ?? 0) * 60_000;
  const res = await env.DB.batch(
    people.map((x) =>
      env.DB.prepare("INSERT OR IGNORE INTO enrollments (id, funnel_id, account_id, email, first_name, last_name, contact_id, step, next_at, status, created_at) VALUES (?,?,?,?,?,?,?, 0, ?, 'active', ?)")
        .bind(prefixedId("en"), f.id, f.account_id, x.email, x.first_name, x.last_name, x.contact_id, at, now),
    ),
  );
  return res.reduce((n, r) => n + (r.meta.changes ? 1 : 0), 0);
}

/** Called when contacts are added to an audience: enrolls them into every active funnel on it. */
export async function onAudienceJoin(env: Env, accountId: string, audienceId: string, emails: string[]) {
  const fs = await env.DB.prepare("SELECT id, account_id FROM funnels WHERE account_id = ? AND audience_id = ? AND trigger = 'audience' AND status = 'active'").bind(accountId, audienceId).all<{ id: string; account_id: string }>();
  if (!fs.results.length || !emails.length) return;
  const ph = emails.map(() => "?").join(",");
  const people = await env.DB.prepare(`SELECT id, email, first_name, last_name FROM contacts WHERE audience_id = ? AND unsubscribed = 0 AND email IN (${ph})`).bind(audienceId, ...emails).all<{ id: string; email: string; first_name: string | null; last_name: string | null }>();
  for (const f of fs.results) await enroll(env, f, people.results.map((p) => ({ email: p.email, first_name: p.first_name, last_name: p.last_name, contact_id: p.id })));
}

/** Sends every due funnel step (cron, every minute). */
export async function processFunnels(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  const due = await env.DB.prepare(
    `SELECT e.*, f.from_addr, f.reply_to, f.status AS funnel_status FROM enrollments e JOIN funnels f ON f.id = e.funnel_id
      WHERE e.status = 'active' AND e.next_at <= ? AND f.status = 'active' ORDER BY e.next_at LIMIT ?`,
  ).bind(now, FUNNEL_BATCH).all<Record<string, any>>();
  let sent = 0;
  for (const e of due.results) {
    const step = await env.DB.prepare("SELECT s.*, t.subject AS t_subject, t.html, t.text FROM funnel_steps s JOIN templates t ON t.id = s.template_id WHERE s.funnel_id = ? AND s.position = ?").bind(e.funnel_id, e.step).first<Record<string, any>>();
    if (!step) {
      await env.DB.prepare("UPDATE enrollments SET status = 'done' WHERE id = ?").bind(e.id).run();
      continue;
    }
    const unsubscribed = e.contact_id ? await env.DB.prepare("SELECT unsubscribed FROM contacts WHERE id = ?").bind(e.contact_id).first<{ unsubscribed: number }>() : null;
    const suppressed = await env.DB.prepare("SELECT 1 AS x FROM suppressions WHERE account_id = ? AND address = ?").bind(e.account_id, e.email).first();
    if (unsubscribed?.unsubscribed || suppressed) {
      await env.DB.prepare("UPDATE enrollments SET status = 'exited' WHERE id = ?").bind(e.id).run();
      continue;
    }
    const unsub = e.contact_id ? `${env.PUBLIC_URL}/u/${await unsubscribeToken(env, e.contact_id)}` : `mailto:unsubscribe@${String(e.from_addr).split("@")[1]?.replace(/>.*/, "")}`;
    const vars = { first_name: e.first_name ?? "", last_name: e.last_name ?? "", email: e.email, unsubscribe_url: unsub };
    const principal: Principal = { accountId: e.account_id, apiKeyId: `funnel:${e.funnel_id}`, permission: "full", domainId: null };
    try {
      await sendOne(
        env,
        principal,
        {
          from: e.from_addr,
          to: [e.email],
          reply_to: e.reply_to ? [e.reply_to] : undefined,
          subject: personalize(step.subject || step.t_subject || "(no subject)", vars)!,
          html: personalize(step.html, vars),
          text: personalize(step.text, vars),
          headers: { "List-Unsubscribe": `<${unsub}>`, ...(unsub.startsWith("http") ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}) },
          tags: [{ name: "category", value: "funnel" }],
        },
        `${e.id}:${e.step}`,
        fetcher,
      );
      sent++;
    } catch (err) {
      // Quota/suspension: retry in an hour. Anything else (invalid address…): exit this person.
      if (err instanceof ApiError && (err.status === 429 || err.status === 403)) {
        await env.DB.prepare("UPDATE enrollments SET next_at = ? WHERE id = ?").bind(now + 3_600_000, e.id).run();
        continue;
      }
      await env.DB.prepare("UPDATE enrollments SET status = 'exited' WHERE id = ?").bind(e.id).run();
      continue;
    }
    const next = await env.DB.prepare("SELECT wait_minutes FROM funnel_steps WHERE funnel_id = ? AND position = ?").bind(e.funnel_id, e.step + 1).first<{ wait_minutes: number }>();
    await env.DB.prepare("UPDATE enrollments SET step = step + 1, next_at = ?, status = ? WHERE id = ?")
      .bind(now + (next?.wait_minutes ?? 0) * 60_000, next ? "active" : "done", e.id)
      .run();
  }
  return { due: due.results.length, sent };
}
