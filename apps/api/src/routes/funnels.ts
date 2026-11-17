// Email funnels as node graphs: trigger → email / wait / condition (yes|no) / tag / end.
// Contacts enter when they join a list, get a tag, or via POST /funnels/:id/enroll; the cron walks
// each enrollment through the graph. Unsubscribed/suppressed people exit automatically.
import { nextOf, stepsToGraph, validateGraph, type FunnelGraph, type FunnelNode } from "@novamail/email";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { prefixedId } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { sendOne } from "./emails";
import { commerceVars } from "./commerce";
import { emit } from "../lib/events";
import { sendMessage } from "./messaging";
import { personalize, personalizeHtml, unsubscribeToken } from "./marketing";

export const FUNNEL_BATCH = 30;
const MAX_HOPS = 25; // nodes processed per enrollment per tick (graphs are acyclic, so this is a safety net)

const actor = (p: Principal) => (p.permission === "agent" ? `agent:${p.apiKeyId}` : p.userId ? "user" : "api");
const tagsOf = (s: unknown): string[] => { try { const v = JSON.parse(String(s ?? "[]")); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

async function own(env: Env, id: string, accountId: string) {
  const f = await env.DB.prepare("SELECT * FROM funnels WHERE id = ? AND account_id = ?").bind(id, accountId).first<Record<string, any>>();
  if (!f) throw errors.notFound("Funnel");
  return f;
}

// ---------------------------------------------------------------- graph parsing & refs

const nodeSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["trigger", "email", "message", "wait", "condition", "tag", "end"]),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  data: z.record(z.string(), z.unknown()).default({}),
});
const edgeSchema = z.object({ id: z.string().min(1).max(100), from: z.string().max(40), handle: z.enum(["next", "yes", "no"]).default("next"), to: z.string().max(40) });
const graphSchema = z.object({ version: z.literal(1).default(1), nodes: z.array(nodeSchema).max(100), edges: z.array(edgeSchema).max(300) });

function cleanGraph(g: z.infer<typeof graphSchema>): FunnelGraph {
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const nodes = g.nodes.map((n): FunnelNode => {
    const d = n.data as Record<string, unknown>;
    const base = { id: n.id, x: Math.round(n.x), y: Math.round(n.y) };
    switch (n.type) {
      case "trigger": return { ...base, type: "trigger", data: { kind: (["audience", "api", "tag"].includes(String(d.kind)) ? d.kind : "audience") as "audience", audience_id: str(d.audience_id, 64), tag: str(d.tag, 40)?.toLowerCase() } };
      case "email": return { ...base, type: "email", data: { template_id: str(d.template_id, 64) ?? "", subject: str(d.subject, 300) } };
      case "message": {
        const tp = d.template as { name?: unknown; language?: unknown; variables?: unknown } | undefined;
        return { ...base, type: "message", data: { channel_id: str(d.channel_id, 64) ?? "", body: str(d.body, 1600), template: tp && typeof tp.name === "string" ? { name: tp.name.slice(0, 512), language: str(tp.language, 10) ?? "en_US", variables: Array.isArray(tp.variables) ? tp.variables.slice(0, 20).map((v) => String(v).slice(0, 1000)) : [] } : undefined } };
      }
      case "wait": return { ...base, type: "wait", data: { minutes: Math.round(Number(d.minutes ?? 0)) } };
      case "condition": return { ...base, type: "condition", data: { kind: (["opened", "clicked", "has_tag", "in_audience"].includes(String(d.kind)) ? d.kind : "opened") as "opened", tag: str(d.tag, 40)?.toLowerCase(), audience_id: str(d.audience_id, 64) } };
      case "tag": return { ...base, type: "tag", data: { action: d.action === "remove" ? "remove" : "add", tag: (str(d.tag, 40) ?? "").toLowerCase() } };
      case "end": return { ...base, type: "end", data: {} };
    }
  });
  return { version: 1, nodes, edges: g.edges };
}

async function refsFor(env: Env, accountId: string) {
  const [t, a] = await env.DB.batch([
    env.DB.prepare("SELECT id FROM templates WHERE account_id = ?").bind(accountId),
    env.DB.prepare("SELECT id FROM audiences WHERE account_id = ?").bind(accountId),
  ]);
  return { templateIds: new Set((t!.results as { id: string }[]).map((r) => r.id)), audienceIds: new Set((a!.results as { id: string }[]).map((r) => r.id)) };
}

function triggerCols(g: FunnelGraph) {
  const t = g.nodes.find((n) => n.type === "trigger") as Extract<FunnelNode, { type: "trigger" }> | undefined;
  return { trigger: t?.data.kind ?? "api", audience_id: t?.data.kind === "audience" ? t.data.audience_id ?? null : null, trigger_tag: t?.data.kind === "tag" ? t.data.tag ?? null : null };
}

export function graphOf(f: Record<string, any>, legacySteps: { template_id: string; wait_minutes: number; subject?: string | null }[] = []): FunnelGraph {
  if (f.graph) return JSON.parse(f.graph);
  return stepsToGraph({ kind: f.trigger === "api" ? "api" : "audience", audience_id: f.audience_id }, legacySteps);
}

// ---------------------------------------------------------------- routes

const stepSchema = z.object({ template_id: z.string().min(3), wait_minutes: z.number().int().min(0).max(525_600).default(0), subject: z.string().max(998).optional() });
const funnelSchema = z.object({
  name: z.string().min(1).max(120),
  from: z.string().min(3).max(320),
  reply_to: z.string().max(320).optional(),
  graph: graphSchema.optional(),
  // Convenience for linear funnels (agents, simple API use): converted to a graph.
  trigger: z.enum(["audience", "api"]).optional(),
  audience_id: z.string().optional(),
  steps: z.array(stepSchema).max(30).optional(),
});

export const funnels = new Hono<AppEnv>();

funnels.post("/", async (c) => {
  const p = c.get("principal");
  const b = funnelSchema.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const graph = b.data.graph ? cleanGraph(b.data.graph) : stepsToGraph({ kind: b.data.trigger ?? (b.data.audience_id ? "audience" : "api"), audience_id: b.data.audience_id }, b.data.steps ?? []);
  const refs = await refsFor(c.env, p.accountId);
  if (b.data.steps?.some((s) => !refs.templateIds.has(s.template_id))) throw errors.validation("A step references a template that doesn't exist in this account.");
  if (b.data.audience_id && !refs.audienceIds.has(b.data.audience_id)) throw errors.notFound("Audience");
  const id = prefixedId("fn");
  const now = Date.now();
  const tc = triggerCols(graph);
  await c.env.DB.prepare("INSERT INTO funnels (id, account_id, name, trigger, audience_id, trigger_tag, from_addr, reply_to, status, graph, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'draft', ?,?,?,?)")
    .bind(id, p.accountId, b.data.name, tc.trigger, tc.audience_id, tc.trigger_tag, b.data.from, b.data.reply_to ?? null, JSON.stringify(graph), actor(p), now, now)
    .run();
  return c.json({ object: "funnel", id, status: "draft", issues: validateGraph(graph, refs) }, 201);
});

funnels.get("/", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT f.id, f.name, f.trigger, f.audience_id, f.trigger_tag, f.status, f.created_by, f.created_at, f.graph,
            (SELECT COUNT(*) FROM enrollments e WHERE e.funnel_id = f.id AND e.status = 'active') AS active,
            (SELECT COUNT(*) FROM enrollments e WHERE e.funnel_id = f.id AND e.status = 'done') AS completed
       FROM funnels f WHERE f.account_id = ? ORDER BY f.created_at DESC`,
  ).bind(c.get("principal").accountId).all<Record<string, any>>();
  return c.json({ object: "list", data: r.results.map(({ graph, ...f }) => ({ ...f, steps: graph ? (JSON.parse(graph) as FunnelGraph).nodes.filter((n) => n.type === "email").length : 0 })) });
});

funnels.get("/:id", async (c) => {
  const p = c.get("principal");
  const f = await own(c.env, c.req.param("id"), p.accountId);
  const legacy = f.graph ? [] : (await c.env.DB.prepare("SELECT template_id, wait_minutes, subject FROM funnel_steps WHERE funnel_id = ? ORDER BY position").bind(f.id).all<{ template_id: string; wait_minutes: number; subject: string | null }>()).results;
  const graph = graphOf(f, legacy);
  // Live counts per node (how many people are waiting at each step).
  const at = await c.env.DB.prepare("SELECT node_id, COUNT(*) n FROM enrollments WHERE funnel_id = ? AND status = 'active' GROUP BY node_id").bind(f.id).all<{ node_id: string; n: number }>();
  const { graph: _g, ...rest } = f;
  return c.json({ object: "funnel", ...rest, from: f.from_addr, graph, issues: validateGraph(graph, await refsFor(c.env, p.accountId)), node_counts: Object.fromEntries(at.results.map((r) => [r.node_id, r.n])) });
});

funnels.patch("/:id", async (c) => {
  const p = c.get("principal");
  const f = await own(c.env, c.req.param("id"), p.accountId);
  const b = funnelSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  let graph: FunnelGraph | null = b.data.graph ? cleanGraph(b.data.graph) : b.data.steps ? stepsToGraph({ kind: b.data.trigger ?? (f.trigger === "api" ? "api" : "audience"), audience_id: b.data.audience_id ?? f.audience_id }, b.data.steps) : null;
  const refs = await refsFor(c.env, p.accountId);
  if (graph && f.status === "active") {
    const issues = validateGraph(graph, refs);
    if (issues.length) throw new ApiError(422, "invalid_funnel", `Pause the funnel or fix: ${issues.map((i) => i.message).join(" ")}`);
  }
  const g = graph ?? graphOf(f);
  const tc = triggerCols(g);
  await c.env.DB.prepare("UPDATE funnels SET name = ?, from_addr = ?, reply_to = ?, graph = ?, trigger = ?, audience_id = ?, trigger_tag = ?, updated_at = ? WHERE id = ?")
    .bind(b.data.name ?? f.name, b.data.from ?? f.from_addr, b.data.reply_to ?? f.reply_to, JSON.stringify(g), tc.trigger, tc.audience_id, tc.trigger_tag, Date.now(), f.id)
    .run();
  return c.json({ object: "funnel", id: f.id, updated: true, issues: validateGraph(g, refs) });
});

// Activation sends real email automatically, so AI agents may build funnels but only a human
// (dashboard session or a full-access key) can switch them on.
funnels.post("/:id/:action{activate|pause}", async (c) => {
  const p = c.get("principal");
  const activate = c.req.param("action") === "activate";
  if (activate && p.permission === "agent") throw errors.forbidden("Agents can build funnels but a person must activate them in the dashboard.");
  const f = await own(c.env, c.req.param("id"), p.accountId);
  if (activate) {
    const legacy = f.graph ? [] : (await c.env.DB.prepare("SELECT template_id, wait_minutes, subject FROM funnel_steps WHERE funnel_id = ? ORDER BY position").bind(f.id).all<{ template_id: string; wait_minutes: number; subject: string | null }>()).results;
    const graph = graphOf(f, legacy);
    const issues = validateGraph(graph, await refsFor(c.env, p.accountId));
    if (!graph.nodes.some((n) => n.type === "email" || n.type === "message")) issues.push({ message: "Add at least one email or message." });
    if (issues.length) return c.json({ statusCode: 422, name: "invalid_funnel", message: issues.map((i) => i.message).join(" "), issues }, 422);
    if (!f.graph) await c.env.DB.prepare("UPDATE funnels SET graph = ? WHERE id = ?").bind(JSON.stringify(graph), f.id).run();
  }
  const status = activate ? "active" : "paused";
  await c.env.DB.prepare("UPDATE funnels SET status = ?, updated_at = ? WHERE id = ?").bind(status, Date.now(), f.id).run();
  return c.json({ id: f.id, status });
});

funnels.delete("/:id", async (c) => {
  if (c.get("principal").permission === "agent") throw errors.forbidden("Agents cannot delete funnels.");
  const f = await own(c.env, c.req.param("id"), c.get("principal").accountId);
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
  const ct = await c.env.DB.prepare("SELECT id FROM contacts WHERE account_id = ? AND email = ? LIMIT 1").bind(p.accountId, b.data.email).first<{ id: string }>();
  const n = await enroll(c.env, f as { id: string; account_id: string; graph: string | null }, [{ email: b.data.email, first_name: b.data.first_name ?? null, last_name: b.data.last_name ?? null, contact_id: ct?.id ?? null }]);
  return c.json({ enrolled: n });
});

// ---------------------------------------------------------------- contact tags (e.g. "purchased" from a store)

export const contactTags = new Hono<AppEnv>();

contactTags.post("/", async (c) => {
  const p = c.get("principal");
  const tag = z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/);
  const b = z.object({ email: z.email().transform((e) => e.toLowerCase()), add: z.array(tag).max(20).default([]), remove: z.array(tag).max(20).default([]) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const added = await applyTags(c.env, p.accountId, b.data.email, b.data.add, b.data.remove);
  return c.json({ email: b.data.email, tags_added: added });
});

/** Updates tags on every contact row with this e-mail and starts funnels triggered by newly added tags. */
export async function applyTags(env: Env, accountId: string, email: string, add: string[], remove: string[]) {
  const rows = await env.DB.prepare("SELECT id, tags FROM contacts WHERE account_id = ? AND email = ?").bind(accountId, email).all<{ id: string; tags: string }>();
  const newly = new Set<string>();
  const stmts = rows.results.map((r) => {
    const cur = new Set(tagsOf(r.tags));
    for (const t of add) if (!cur.has(t)) (cur.add(t), newly.add(t));
    for (const t of remove) cur.delete(t);
    return env.DB.prepare("UPDATE contacts SET tags = ? WHERE id = ?").bind(JSON.stringify([...cur].slice(0, 100)), r.id);
  });
  const now = Date.now();
  for (const t of newly) stmts.push(env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'tag_added', ?, ?)").bind(accountId, email, JSON.stringify({ tag: t }), now));
  for (const t of remove) if (rows.results.some((r) => tagsOf(r.tags).includes(t))) stmts.push(env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'tag_removed', ?, ?)").bind(accountId, email, JSON.stringify({ tag: t }), now));
  if (stmts.length) await env.DB.batch(stmts);
  for (const t of newly) await emit(env, accountId, "contact.tagged", { email, tag: t });
  for (const t of newly) await onTagAdded(env, accountId, email, t);
  return [...newly];
}

// ---------------------------------------------------------------- enrollment

type FunnelRow = { id: string; account_id: string; graph: string | null };

/** Enrolls people at the trigger (idempotent per funnel+email). Returns how many were new. */
export async function enroll(env: Env, f: FunnelRow, people: { email: string; first_name: string | null; last_name: string | null; contact_id: string | null }[], now = Date.now()) {
  if (!people.length) return 0;
  const trigger = f.graph ? (JSON.parse(f.graph) as FunnelGraph).nodes.find((n) => n.type === "trigger")?.id ?? "trigger" : "trigger";
  const res = await env.DB.batch(
    people.map((x) =>
      env.DB.prepare("INSERT OR IGNORE INTO enrollments (id, funnel_id, account_id, email, first_name, last_name, contact_id, step, node_id, next_at, status, created_at) VALUES (?,?,?,?,?,?,?, 0, ?, ?, 'active', ?)")
        .bind(prefixedId("en"), f.id, f.account_id, x.email, x.first_name, x.last_name, x.contact_id, trigger, now, now),
    ),
  );
  return res.reduce((n, r) => n + (r.meta.changes ? 1 : 0), 0);
}

export async function onAudienceJoin(env: Env, accountId: string, audienceId: string, emails: string[]) {
  const fs = await env.DB.prepare("SELECT id, account_id, graph FROM funnels WHERE account_id = ? AND audience_id = ? AND trigger = 'audience' AND status = 'active'").bind(accountId, audienceId).all<FunnelRow>();
  if (!fs.results.length || !emails.length) return;
  const ph = emails.map(() => "?").join(",");
  const people = await env.DB.prepare(`SELECT id, email, first_name, last_name FROM contacts WHERE audience_id = ? AND unsubscribed = 0 AND email IN (${ph})`).bind(audienceId, ...emails).all<{ id: string; email: string; first_name: string | null; last_name: string | null }>();
  for (const f of fs.results) await enroll(env, f, people.results.map((p) => ({ email: p.email, first_name: p.first_name, last_name: p.last_name, contact_id: p.id })));
}

export async function onTagAdded(env: Env, accountId: string, email: string, tag: string) {
  const fs = await env.DB.prepare("SELECT id, account_id, graph FROM funnels WHERE account_id = ? AND trigger = 'tag' AND trigger_tag = ? AND status = 'active'").bind(accountId, tag).all<FunnelRow>();
  if (!fs.results.length) return;
  const ct = await env.DB.prepare("SELECT id, first_name, last_name FROM contacts WHERE account_id = ? AND email = ? AND unsubscribed = 0 LIMIT 1").bind(accountId, email).first<{ id: string; first_name: string | null; last_name: string | null }>();
  if (!ct) return;
  for (const f of fs.results) await enroll(env, f, [{ email, first_name: ct.first_name, last_name: ct.last_name, contact_id: ct.id }]);
}

// ---------------------------------------------------------------- engine

async function evaluate(env: Env, e: Record<string, any>, n: Extract<FunnelNode, { type: "condition" }>): Promise<boolean> {
  switch (n.data.kind) {
    case "opened":
    case "clicked": {
      if (!e.last_email_id) return false;
      const types = n.data.kind === "opened" ? ["email.opened", "email.clicked"] : ["email.clicked"];
      const r = await env.DB.prepare(`SELECT 1 AS x FROM email_events WHERE email_id = ? AND machine != 1 AND type IN (${types.map(() => "?").join(",")}) LIMIT 1`).bind(e.last_email_id, ...types).first();
      return !!r;
    }
    case "has_tag": {
      const r = await env.DB.prepare("SELECT tags FROM contacts WHERE account_id = ? AND email = ?").bind(e.account_id, e.email).all<{ tags: string }>();
      return r.results.some((x) => tagsOf(x.tags).includes(n.data.tag ?? ""));
    }
    case "in_audience": {
      const r = await env.DB.prepare("SELECT 1 AS x FROM contacts WHERE audience_id = ? AND email = ? AND unsubscribed = 0").bind(n.data.audience_id ?? "", e.email).first();
      return !!r;
    }
  }
}

/** Walks every due enrollment through its funnel graph (cron, every minute). */
export async function processFunnels(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  const due = await env.DB.prepare(
    `SELECT e.*, f.from_addr, f.reply_to, f.graph FROM enrollments e JOIN funnels f ON f.id = e.funnel_id
      WHERE e.status = 'active' AND e.next_at <= ? AND f.status = 'active' ORDER BY e.next_at LIMIT ?`,
  ).bind(now, FUNNEL_BATCH).all<Record<string, any>>();
  const graphs = new Map<string, FunnelGraph>();
  let sent = 0;

  for (const e of due.results) {
    if (!e.graph) continue;
    const g = graphs.get(e.funnel_id) ?? (JSON.parse(e.graph) as FunnelGraph);
    graphs.set(e.funnel_id, g);
    let node: FunnelNode | null = g.nodes.find((n) => n.id === e.node_id) ?? null;
    let status: "active" | "done" | "exited" = "active";
    let nextAt = now;
    let lastEmail: string | null = e.last_email_id ?? null;
    // Arriving here after a wait has elapsed: continue past the wait node.
    if (node?.type === "wait") node = nextOf(g, node.id);

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (!node || node.type === "end") {
        status = "done";
        break;
      }
      if (node.type === "trigger") {
        node = nextOf(g, node.id);
        continue;
      }
      if (node.type === "wait") {
        nextAt = now + node.data.minutes * 60_000;
        break; // stay on the wait node until it is due
      }
      if (node.type === "condition") {
        node = nextOf(g, node.id, (await evaluate(env, e, node)) ? "yes" : "no");
        continue;
      }
      if (node.type === "message") {
        // SMS/WhatsApp step: only for people with a phone and an opt-in; otherwise the funnel just continues.
        try {
          await sendMessage(env, e.account_id, { channel_id: node.data.channel_id, email: e.email, body: node.data.body, template: node.data.template, funnel_id: e.funnel_id, vars: { first_name: e.first_name ?? "", last_name: e.last_name ?? "", email: e.email } }, fetcher);
        } catch (err) {
          if (err instanceof ApiError && err.status === 429) { nextAt = now + 60_000; break; }
          await env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'message_skipped', ?, ?)").bind(e.account_id, e.email, JSON.stringify({ funnel: e.funnel_id, reason: String((err as Error).message).slice(0, 120) }), now).run();
        }
        node = nextOf(g, node.id);
        continue;
      }
      if (node.type === "tag") {
        await applyTags(env, e.account_id, e.email, node.data.action === "add" ? [node.data.tag] : [], node.data.action === "remove" ? [node.data.tag] : []);
        node = nextOf(g, node.id);
        continue;
      }
      // email
      const ct = e.contact_id ? await env.DB.prepare("SELECT unsubscribed FROM contacts WHERE id = ?").bind(e.contact_id).first<{ unsubscribed: number }>() : null;
      const suppressed = await env.DB.prepare("SELECT 1 AS x FROM suppressions WHERE account_id = ? AND address = ?").bind(e.account_id, e.email).first();
      if (ct?.unsubscribed || suppressed) {
        status = "exited";
        break;
      }
      const t = await env.DB.prepare("SELECT subject, html, text FROM templates WHERE id = ? AND account_id = ?").bind(node.data.template_id, e.account_id).first<{ subject: string; html: string; text: string | null }>();
      if (!t) {
        status = "exited";
        break;
      }
      const unsub = e.contact_id ? `${env.PUBLIC_URL}/u/${await unsubscribeToken(env, e.contact_id)}` : `mailto:unsubscribe@${String(e.from_addr).replace(/.*@/, "").replace(/>.*/, "")}`;
      const vars = { first_name: e.first_name ?? "", last_name: e.last_name ?? "", email: e.email, unsubscribe_url: unsub, preferences_url: unsub, ...(await commerceVars(env, e.account_id, e.email, `${t.html}${t.text ?? ""}`)) };
      try {
        const r = await sendOne(
          env,
          { accountId: e.account_id, apiKeyId: `funnel:${e.funnel_id}`, permission: "full", domainId: null },
          {
            from: e.from_addr,
            to: [e.email],
            reply_to: e.reply_to ? [e.reply_to] : undefined,
            subject: personalize(node.data.subject || t.subject || "(no subject)", vars)!,
            html: personalizeHtml(t.html, vars),
            text: personalize(t.text, vars),
            headers: { "List-Unsubscribe": `<${unsub}>`, ...(unsub.startsWith("http") ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}) },
            tags: [{ name: "category", value: "funnel" }, { name: "funnel", value: String(e.funnel_id).replace(/[^A-Za-z0-9_-]/g, "") }],
          },
          `${e.id}:${node.id}`,
          fetcher,
          { track: true },
        );
        lastEmail = r.id;
        sent++;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 429 || err.status === 403)) {
          nextAt = now + 3_600_000; // quota or suspension: retry this node in an hour
          break;
        }
        status = "exited";
        break;
      }
      node = nextOf(g, node.id);
    }
    await env.DB.prepare("UPDATE enrollments SET node_id = ?, next_at = ?, status = ?, last_email_id = ? WHERE id = ?")
      .bind(node?.id ?? e.node_id, nextAt, status, lastEmail, e.id)
      .run();
  }
  return { due: due.results.length, sent };
}
