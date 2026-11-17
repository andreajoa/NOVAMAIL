// Sales pipeline (deals on drag-and-drop stages, weighted forecast) and tasks. Winning or losing
// a deal tags the contact (deal-won / deal-lost) so email funnels can follow up automatically.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { prefixedId } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { applyTags } from "./funnels";

export interface Stage { id: string; name: string; kind: "open" | "won" | "lost"; probability: number }
const DEFAULT_STAGES: Stage[] = [
  { id: "lead", name: "Lead", kind: "open", probability: 10 },
  { id: "qualified", name: "Qualified", kind: "open", probability: 30 },
  { id: "proposal", name: "Proposal", kind: "open", probability: 60 },
  { id: "negotiation", name: "Negotiation", kind: "open", probability: 80 },
  { id: "won", name: "Won", kind: "won", probability: 100 },
  { id: "lost", name: "Lost", kind: "lost", probability: 0 },
];
const stageSchema = z.object({ id: z.string().regex(/^[a-z0-9_-]{1,30}$/), name: z.string().min(1).max(40), kind: z.enum(["open", "won", "lost"]), probability: z.number().min(0).max(100) });

async function pipelineOf(env: Env, accountId: string, id?: string) {
  if (id) {
    const p = await env.DB.prepare("SELECT * FROM pipelines WHERE id = ? AND account_id = ?").bind(id, accountId).first<{ id: string; name: string; stages: string }>();
    if (!p) throw errors.notFound("Pipeline");
    return { ...p, stages: JSON.parse(p.stages) as Stage[] };
  }
  const p = await env.DB.prepare("SELECT * FROM pipelines WHERE account_id = ? ORDER BY created_at LIMIT 1").bind(accountId).first<{ id: string; name: string; stages: string }>();
  if (p) return { ...p, stages: JSON.parse(p.stages) as Stage[] };
  const nid = prefixedId("pl");
  await env.DB.prepare("INSERT INTO pipelines (id, account_id, name, stages, created_at) VALUES (?,?, 'Sales', ?, ?)").bind(nid, accountId, JSON.stringify(DEFAULT_STAGES), Date.now()).run();
  return { id: nid, name: "Sales", stages: DEFAULT_STAGES };
}

async function log(env: Env, accountId: string, email: string | null, type: string, data: unknown) {
  if (email) await env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?,?,?,?)").bind(accountId, email, type, JSON.stringify(data), Date.now()).run();
}

export const pipelines = new Hono<AppEnv>();

pipelines.get("/", async (c) => {
  const p = c.get("principal");
  await pipelineOf(c.env, p.accountId);
  const r = await c.env.DB.prepare("SELECT id, name, stages FROM pipelines WHERE account_id = ? ORDER BY created_at").bind(p.accountId).all<{ id: string; name: string; stages: string }>();
  return c.json({ object: "list", data: r.results.map((x) => ({ ...x, stages: JSON.parse(x.stages) })) });
});

pipelines.post("/", async (c) => {
  const b = z.object({ name: z.string().min(1).max(60), stages: z.array(stageSchema).min(2).max(12).default(DEFAULT_STAGES) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const id = prefixedId("pl");
  await c.env.DB.prepare("INSERT INTO pipelines (id, account_id, name, stages, created_at) VALUES (?,?,?,?,?)").bind(id, c.get("principal").accountId, b.data.name, JSON.stringify(b.data.stages), Date.now()).run();
  return c.json({ object: "pipeline", id }, 201);
});

pipelines.patch("/:id", async (c) => {
  const p = c.get("principal");
  const cur = await pipelineOf(c.env, p.accountId, c.req.param("id"));
  const b = z.object({ name: z.string().min(1).max(60).optional(), stages: z.array(stageSchema).min(2).max(12).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (b.data.stages) {
    const keep = new Set(b.data.stages.map((s) => s.id));
    const orphan = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM deals WHERE pipeline_id = ? AND stage_id NOT IN (${[...keep].map(() => "?").join(",")})`).bind(cur.id, ...keep).first<{ n: number }>();
    if (orphan?.n) throw errors.conflict("Move the deals out of a stage before removing it.");
  }
  await c.env.DB.prepare("UPDATE pipelines SET name = ?, stages = ? WHERE id = ?").bind(b.data.name ?? cur.name, JSON.stringify(b.data.stages ?? cur.stages), cur.id).run();
  return c.json({ object: "pipeline", id: cur.id, updated: true });
});

// ---------------------------------------------------------------- deals

export const deals = new Hono<AppEnv>();

deals.get("/", async (c) => {
  const p = c.get("principal");
  const pl = await pipelineOf(c.env, p.accountId, c.req.query("pipeline_id") || undefined);
  const r = await c.env.DB.prepare(
    `SELECT d.*, u.email AS owner_email, (SELECT COUNT(*) FROM tasks t WHERE t.deal_id = d.id AND t.done_at IS NULL) AS open_tasks,
            (SELECT first_name FROM contacts k WHERE k.account_id = d.account_id AND k.email = d.email LIMIT 1) AS first_name
       FROM deals d LEFT JOIN users u ON u.id = d.owner_user_id WHERE d.pipeline_id = ? ORDER BY d.position, d.created_at`,
  ).bind(pl.id).all<any>();
  const byStage = Object.fromEntries(pl.stages.map((s) => [s.id, { count: 0, value_cents: 0 }]));
  let forecast = 0, open = 0, won = 0, lost = 0;
  for (const d of r.results) {
    const s = pl.stages.find((x) => x.id === d.stage_id);
    if (byStage[d.stage_id]) { byStage[d.stage_id]!.count++; byStage[d.stage_id]!.value_cents += d.value_cents; }
    if (s?.kind === "open") { open += d.value_cents; forecast += Math.round((d.value_cents * s.probability) / 100); }
    if (s?.kind === "won") won++;
    if (s?.kind === "lost") lost++;
  }
  return c.json({ object: "board", pipeline: pl, deals: r.results, stats: { by_stage: byStage, open_value_cents: open, weighted_forecast_cents: forecast, win_rate: won + lost ? won / (won + lost) : null } });
});

const dealInput = z.object({
  title: z.string().min(1).max(200),
  pipeline_id: z.string().max(64).optional(),
  stage_id: z.string().max(30).optional(),
  email: z.email().transform((e) => e.toLowerCase()).optional().nullable(),
  value_cents: z.number().int().min(0).max(1e12).default(0),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  owner_user_id: z.string().max(64).optional().nullable(),
  close_date: z.number().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

async function assertOwner(env: Env, accountId: string, userId: string | null | undefined) {
  if (!userId) return;
  if (!(await env.DB.prepare("SELECT 1 AS x FROM memberships WHERE account_id = ? AND user_id = ?").bind(accountId, userId).first())) throw errors.validation("Owner must be a team member.");
}

deals.post("/", async (c) => {
  const p = c.get("principal");
  const b = dealInput.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const pl = await pipelineOf(c.env, p.accountId, b.data.pipeline_id);
  const stage = pl.stages.find((s) => s.id === (b.data.stage_id ?? pl.stages[0]!.id));
  if (!stage) throw errors.validation("Unknown stage.");
  await assertOwner(c.env, p.accountId, b.data.owner_user_id ?? p.userId);
  const id = prefixedId("deal");
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO deals (id, account_id, pipeline_id, stage_id, title, email, value_cents, currency, owner_user_id, close_date, position, status, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, pl.id, stage.id, b.data.title, b.data.email ?? null, b.data.value_cents, b.data.currency, b.data.owner_user_id ?? p.userId ?? null, b.data.close_date ?? null, now, stage.kind === "open" ? "open" : stage.kind, b.data.notes ?? null, now, now).run();
  await log(c.env, p.accountId, b.data.email ?? null, "deal_created", { deal: id, title: b.data.title, value_cents: b.data.value_cents });
  return c.json({ object: "deal", id }, 201);
});

deals.patch("/:id", async (c) => {
  const p = c.get("principal");
  const d = await c.env.DB.prepare("SELECT * FROM deals WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<any>();
  if (!d) throw errors.notFound("Deal");
  const b = dealInput.partial().extend({ position: z.number().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const pl = await pipelineOf(c.env, p.accountId, d.pipeline_id);
  const stage = pl.stages.find((s) => s.id === (b.data.stage_id ?? d.stage_id));
  if (!stage) throw errors.validation("Unknown stage.");
  if (b.data.owner_user_id !== undefined) await assertOwner(c.env, p.accountId, b.data.owner_user_id);
  const now = Date.now();
  const status = stage.kind === "open" ? "open" : stage.kind;
  const email = b.data.email === undefined ? d.email : b.data.email;
  await c.env.DB.prepare(
    `UPDATE deals SET title = ?, stage_id = ?, email = ?, value_cents = ?, currency = ?, owner_user_id = ?, close_date = ?, notes = ?, position = ?, status = ?,
            closed_at = CASE WHEN ? = 'open' THEN NULL WHEN status = 'open' THEN ? ELSE closed_at END, updated_at = ? WHERE id = ?`,
  ).bind(b.data.title ?? d.title, stage.id, email, b.data.value_cents ?? d.value_cents, b.data.currency ?? d.currency, b.data.owner_user_id === undefined ? d.owner_user_id : b.data.owner_user_id,
    b.data.close_date === undefined ? d.close_date : b.data.close_date, b.data.notes === undefined ? d.notes : b.data.notes, b.data.position ?? d.position, status, status, now, now, d.id).run();
  if (stage.id !== d.stage_id) {
    await log(c.env, p.accountId, email, "deal_stage", { deal: d.id, title: d.title, from: d.stage_id, to: stage.name });
    if (email && status !== d.status && status !== "open") await applyTags(c.env, p.accountId, email, [`deal-${status}`], [status === "won" ? "deal-lost" : "deal-won"]);
  }
  return c.json({ object: "deal", id: d.id, stage_id: stage.id, status });
});

deals.delete("/:id", async (c) => {
  const p = c.get("principal");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM tasks WHERE deal_id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId),
    c.env.DB.prepare("DELETE FROM deals WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId),
  ]);
  return c.json({ deleted: true });
});

// ---------------------------------------------------------------- tasks

export const tasks = new Hono<AppEnv>();

tasks.get("/", async (c) => {
  const p = c.get("principal");
  const q = z.object({ status: z.enum(["open", "done", "all"]).default("open"), mine: z.coerce.boolean().default(false), email: z.string().max(254).optional(), deal_id: z.string().max(64).optional() }).safeParse(c.req.query());
  if (!q.success) throw errors.validation(zodMessage(q.error));
  const where = ["t.account_id = ?"];
  const args: unknown[] = [p.accountId];
  if (q.data.status === "open") where.push("t.done_at IS NULL");
  if (q.data.status === "done") where.push("t.done_at IS NOT NULL");
  if (q.data.mine && p.userId) (where.push("t.assignee_user_id = ?"), args.push(p.userId));
  if (q.data.email) (where.push("t.email = ?"), args.push(q.data.email.toLowerCase()));
  if (q.data.deal_id) (where.push("t.deal_id = ?"), args.push(q.data.deal_id));
  const r = await c.env.DB.prepare(`SELECT t.*, u.email AS assignee_email, d.title AS deal_title FROM tasks t LEFT JOIN users u ON u.id = t.assignee_user_id LEFT JOIN deals d ON d.id = t.deal_id WHERE ${where.join(" AND ")} ORDER BY t.done_at IS NOT NULL, COALESCE(t.due_at, 9e15), t.created_at LIMIT 500`).bind(...args).all<any>();
  const now = Date.now();
  return c.json({ object: "list", data: r.results.map((t) => ({ ...t, overdue: !t.done_at && t.due_at && t.due_at < now })) });
});

tasks.post("/", async (c) => {
  const p = c.get("principal");
  const b = z.object({ title: z.string().min(1).max(300), due_at: z.number().optional(), assignee_user_id: z.string().max(64).optional(), email: z.email().transform((e) => e.toLowerCase()).optional(), deal_id: z.string().max(64).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  await assertOwner(c.env, p.accountId, b.data.assignee_user_id);
  let email = b.data.email ?? null;
  if (b.data.deal_id) {
    const d = await c.env.DB.prepare("SELECT email FROM deals WHERE id = ? AND account_id = ?").bind(b.data.deal_id, p.accountId).first<{ email: string | null }>();
    if (!d) throw errors.notFound("Deal");
    email ??= d.email;
  }
  const id = prefixedId("task");
  await c.env.DB.prepare("INSERT INTO tasks (id, account_id, title, due_at, assignee_user_id, email, deal_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.data.title, b.data.due_at ?? null, b.data.assignee_user_id ?? p.userId ?? null, email, b.data.deal_id ?? null, p.userId ?? "api", Date.now()).run();
  return c.json({ object: "task", id }, 201);
});

tasks.patch("/:id", async (c) => {
  const p = c.get("principal");
  const b = z.object({ title: z.string().min(1).max(300).optional(), due_at: z.number().nullable().optional(), done: z.boolean().optional(), assignee_user_id: z.string().max(64).nullable().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const t = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<any>();
  if (!t) throw errors.notFound("Task");
  if (b.data.assignee_user_id) await assertOwner(c.env, p.accountId, b.data.assignee_user_id);
  await c.env.DB.prepare("UPDATE tasks SET title = ?, due_at = ?, done_at = ?, assignee_user_id = ? WHERE id = ?")
    .bind(b.data.title ?? t.title, b.data.due_at === undefined ? t.due_at : b.data.due_at, b.data.done === undefined ? t.done_at : b.data.done ? Date.now() : null, b.data.assignee_user_id === undefined ? t.assignee_user_id : b.data.assignee_user_id, t.id).run();
  if (b.data.done && !t.done_at) await log(c.env, p.accountId, t.email, "task_done", { task: t.id, title: t.title });
  return c.json({ object: "task", id: t.id, updated: true });
});

tasks.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tasks WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  return c.json({ deleted: true });
});
