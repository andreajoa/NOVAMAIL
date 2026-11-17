// CRM: one profile per e-mail (merged across lists), engagement scoring, timeline, notes,
// custom fields, dynamic segments (rule builder) and CSV import/export.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { prefixedId, uuidv7 } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { applyTags, onAudienceJoin } from "./funnels";

const tagsOf = (s: unknown): string[] => { try { const v = JSON.parse(String(s ?? "[]")); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const DAY = 86_400_000;

export interface Person {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  fields: Record<string, string>;
  tags: string[];
  lists: string[];
  subscribed: boolean;
  created_at: number;
  last_activity_at: number | null;
  opens_30d: number;
  clicks_30d: number;
  last_open_at: number | null;
  last_click_at: number | null;
  score: number;
  tier: "hot" | "warm" | "cold";
}

/** 0–100: clicks weigh more than opens (Apple MPP inflates opens); recency decays. */
export function scoreOf(opens: number, clicks: number, lastAt: number | null, now = Date.now()) {
  const recency = lastAt ? Math.max(0, 30 - (now - lastAt) / DAY) : 0;
  const s = Math.min(100, Math.round(Math.min(opens, 10) * 4 + Math.min(clicks, 6) * 15 + recency));
  return { score: s, tier: (s >= 40 ? "hot" : s >= 15 ? "warm" : "cold") as Person["tier"] };
}

/** Loads every person in the account (contacts merged by e-mail) with engagement stats. */
export async function loadPeople(env: Env, accountId: string, now = Date.now()): Promise<Person[]> {
  const [rows, data, eng, acts] = await env.DB.batch([
    env.DB.prepare("SELECT email, first_name, last_name, audience_id, unsubscribed, tags, created_at FROM contacts WHERE account_id = ? LIMIT 50000").bind(accountId),
    env.DB.prepare("SELECT email, phone, company, fields FROM people_data WHERE account_id = ?").bind(accountId),
    env.DB.prepare(
      `SELECT recipient AS email,
              SUM(CASE WHEN type = 'email.opened' AND created_at > ?2 THEN 1 ELSE 0 END) AS opens,
              SUM(CASE WHEN type = 'email.clicked' AND created_at > ?2 THEN 1 ELSE 0 END) AS clicks,
              MAX(CASE WHEN type = 'email.opened' THEN created_at END) AS last_open,
              MAX(CASE WHEN type = 'email.clicked' THEN created_at END) AS last_click,
              MAX(created_at) AS last_at
         FROM email_events WHERE account_id = ?1 AND recipient IS NOT NULL GROUP BY recipient`,
    ).bind(accountId, now - 30 * DAY),
    env.DB.prepare("SELECT email, MAX(created_at) AS last_at FROM activities WHERE account_id = ? GROUP BY email").bind(accountId),
  ]);
  const dmap = new Map((data!.results as any[]).map((d) => [d.email, d]));
  const emap = new Map((eng!.results as any[]).map((e) => [String(e.email).toLowerCase(), e]));
  const amap = new Map((acts!.results as any[]).map((a) => [a.email, a.last_at as number]));
  const people = new Map<string, Person>();
  for (const r of rows!.results as any[]) {
    let p = people.get(r.email);
    if (!p) {
      const d = dmap.get(r.email);
      let fields: Record<string, string> = {};
      try { fields = d ? JSON.parse(d.fields) : {}; } catch { /* ignore */ }
      p = { email: r.email, first_name: r.first_name, last_name: r.last_name, phone: d?.phone ?? null, company: d?.company ?? null, fields, tags: [], lists: [], subscribed: true, created_at: r.created_at, last_activity_at: null, opens_30d: 0, clicks_30d: 0, last_open_at: null, last_click_at: null, score: 0, tier: "cold" };
      people.set(r.email, p);
    }
    p.first_name ||= r.first_name;
    p.last_name ||= r.last_name;
    p.lists.push(r.audience_id);
    for (const t of tagsOf(r.tags)) if (!p.tags.includes(t)) p.tags.push(t);
    if (r.unsubscribed) p.subscribed = false;
    p.created_at = Math.min(p.created_at, r.created_at);
  }
  for (const p of people.values()) {
    const e = emap.get(p.email);
    p.opens_30d = e?.opens ?? 0;
    p.clicks_30d = e?.clicks ?? 0;
    p.last_open_at = e?.last_open ?? null;
    p.last_click_at = e?.last_click ?? null;
    p.last_activity_at = Math.max(e?.last_at ?? 0, amap.get(p.email) ?? 0, p.created_at) || null;
    Object.assign(p, scoreOf(p.opens_30d, p.clicks_30d, e?.last_at ?? null, now));
    if (!p.subscribed) Object.assign(p, { score: 0, tier: "cold" });
  }
  return [...people.values()];
}

// ---------------------------------------------------------------- segments

export const ruleSchema = z.object({
  field: z.string().max(60),
  op: z.enum(["has", "not_has", "in", "not_in", "gte", "lte", "within", "not_within", "eq", "neq", "contains", "is"]),
  value: z.union([z.string().max(200), z.number(), z.boolean()]),
});
export const rulesSchema = z.object({ match: z.enum(["all", "any"]).default("all"), rules: z.array(ruleSchema).max(30).default([]) });
export type Rules = z.infer<typeof rulesSchema>;

export function matches(p: Person, r: z.infer<typeof ruleSchema>, now = Date.now()): boolean {
  const v = r.value;
  const days = (t: number | null) => (t ? (now - t) / DAY : Infinity);
  switch (r.field) {
    case "tag": return r.op === "has" ? p.tags.includes(String(v)) : !p.tags.includes(String(v));
    case "list": return r.op === "in" ? p.lists.includes(String(v)) : !p.lists.includes(String(v));
    case "score": return r.op === "gte" ? p.score >= Number(v) : p.score <= Number(v);
    case "tier": return r.op === "eq" ? p.tier === v : p.tier !== v;
    case "opened": return r.op === "within" ? days(p.last_open_at) <= Number(v) : days(p.last_open_at) > Number(v);
    case "clicked": return r.op === "within" ? days(p.last_click_at) <= Number(v) : days(p.last_click_at) > Number(v);
    case "created": return r.op === "within" ? days(p.created_at) <= Number(v) : days(p.created_at) > Number(v);
    case "subscribed": return p.subscribed === (v === true || v === "true");
    case "email": return p.email.includes(String(v).toLowerCase());
    case "company": return (p.company ?? "").toLowerCase().includes(String(v).toLowerCase());
    default: {
      if (!r.field.startsWith("field:")) return false;
      const fv = p.fields[r.field.slice(6)] ?? "";
      if (r.op === "eq") return fv.toLowerCase() === String(v).toLowerCase();
      if (r.op === "neq") return fv.toLowerCase() !== String(v).toLowerCase();
      if (r.op === "contains") return fv.toLowerCase().includes(String(v).toLowerCase());
      if (r.op === "gte") return Number(fv) >= Number(v);
      if (r.op === "lte") return Number(fv) <= Number(v);
      return false;
    }
  }
}

export function applySegment(people: Person[], rules: Rules, now = Date.now()) {
  if (!rules.rules.length) return people;
  return people.filter((p) => (rules.match === "all" ? rules.rules.every((r) => matches(p, r, now)) : rules.rules.some((r) => matches(p, r, now))));
}

export async function logActivity(env: Env, accountId: string, email: string, type: string, data?: unknown) {
  await env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?,?,?,?)").bind(accountId, email, type, data ? JSON.stringify(data) : null, Date.now()).run();
}

async function defaultList(env: Env, accountId: string) {
  const a = await env.DB.prepare("SELECT id FROM audiences WHERE account_id = ? AND name = 'All contacts'").bind(accountId).first<{ id: string }>();
  if (a) return a.id;
  const id = prefixedId("aud");
  await env.DB.prepare("INSERT INTO audiences (id, account_id, name, created_at) VALUES (?,?, 'All contacts', ?)").bind(id, accountId, Date.now()).run();
  return id;
}

/** Upserts a person: list membership, names, profile fields and tags. */
async function upsertPerson(env: Env, accountId: string, x: { email: string; first_name?: string; last_name?: string; phone?: string; company?: string; fields?: Record<string, string>; tags?: string[]; list_id?: string }, now = Date.now()) {
  const list = x.list_id ?? (await defaultList(env, accountId));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contacts (id, account_id, audience_id, email, first_name, last_name, unsubscribed, created_at) VALUES (?,?,?,?,?,?,0,?)
       ON CONFLICT(audience_id, email) DO UPDATE SET first_name = COALESCE(excluded.first_name, first_name), last_name = COALESCE(excluded.last_name, last_name)`,
    ).bind(`con_${uuidv7(now)}`, accountId, list, x.email, x.first_name ?? null, x.last_name ?? null, now),
    env.DB.prepare(
      `INSERT INTO people_data (account_id, email, phone, company, fields, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)
       ON CONFLICT(account_id, email) DO UPDATE SET phone = COALESCE(?3, phone), company = COALESCE(?4, company),
         fields = json_patch(fields, ?5), updated_at = ?6`,
    ).bind(accountId, x.email, x.phone ?? null, x.company ?? null, JSON.stringify(x.fields ?? {}), now),
  ]);
  if (x.tags?.length) await applyTags(env, accountId, x.email, x.tags, []);
  return list;
}

// ---------------------------------------------------------------- routes

export const people = new Hono<AppEnv>();

const listQuery = z.object({
  q: z.string().max(200).optional(),
  segment: z.string().max(64).optional(),
  rules: z.string().max(5000).optional(),
  sort: z.enum(["score", "recent", "name", "created"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

async function resolveRules(env: Env, accountId: string, q: z.infer<typeof listQuery>): Promise<Rules> {
  if (q.segment) {
    const s = await env.DB.prepare("SELECT rules FROM segments WHERE id = ? AND account_id = ?").bind(q.segment, accountId).first<{ rules: string }>();
    if (!s) throw errors.notFound("Segment");
    return rulesSchema.parse(JSON.parse(s.rules));
  }
  if (q.rules) {
    const r = rulesSchema.safeParse(JSON.parse(q.rules));
    if (!r.success) throw errors.validation(zodMessage(r.error));
    return r.data;
  }
  return { match: "all", rules: [] };
}

people.get("/", async (c) => {
  const p = c.get("principal");
  const q = listQuery.safeParse(c.req.query());
  if (!q.success) throw errors.validation(zodMessage(q.error));
  let list = applySegment(await loadPeople(c.env, p.accountId), await resolveRules(c.env, p.accountId, q.data));
  if (q.data.q) {
    const s = q.data.q.toLowerCase();
    list = list.filter((x) => x.email.includes(s) || `${x.first_name ?? ""} ${x.last_name ?? ""}`.toLowerCase().includes(s) || (x.company ?? "").toLowerCase().includes(s) || x.tags.some((t) => t.includes(s)));
  }
  const sorters: Record<string, (a: Person, b: Person) => number> = {
    score: (a, b) => b.score - a.score,
    recent: (a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0),
    created: (a, b) => b.created_at - a.created_at,
    name: (a, b) => `${a.first_name ?? ""}${a.email}`.localeCompare(`${b.first_name ?? ""}${b.email}`),
  };
  list.sort(sorters[q.data.sort]);
  const tiers = { hot: 0, warm: 0, cold: 0 };
  for (const x of list) tiers[x.tier]++;
  return c.json({ object: "list", total: list.length, tiers, data: list.slice(q.data.offset, q.data.offset + q.data.limit) });
});

people.get("/export.csv", async (c) => {
  const p = c.get("principal");
  const all = await loadPeople(c.env, p.accountId);
  const keys = [...new Set(all.flatMap((x) => Object.keys(x.fields)))];
  const csvCell = (v: unknown) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // CSV-injection guard for spreadsheet apps
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["email", "first_name", "last_name", "phone", "company", "tags", "subscribed", "score", "tier", ...keys];
  const lines = all.map((x) => [x.email, x.first_name, x.last_name, x.phone, x.company, x.tags.join("|"), x.subscribed, x.score, x.tier, ...keys.map((k) => x.fields[k])].map(csvCell).join(","));
  return new Response([head.join(","), ...lines].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="novamail-contacts.csv"' } });
});

const personInput = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(120).optional(),
  fields: z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.string().max(500)).optional(),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/)).max(20).optional(),
  list_id: z.string().max(64).optional(),
});

people.post("/", async (c) => {
  const p = c.get("principal");
  const b = personInput.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (b.data.list_id) {
    const a = await c.env.DB.prepare("SELECT id FROM audiences WHERE id = ? AND account_id = ?").bind(b.data.list_id, p.accountId).first();
    if (!a) throw errors.notFound("List");
  }
  const list = await upsertPerson(c.env, p.accountId, b.data);
  await logActivity(c.env, p.accountId, b.data.email, "created", { list });
  c.executionCtx.waitUntil(onAudienceJoin(c.env, p.accountId, list, [b.data.email]));
  return c.json({ object: "person", email: b.data.email }, 201);
});

people.post("/import", async (c) => {
  const p = c.get("principal");
  const b = z.object({ list_id: z.string().max(64).optional(), rows: z.array(personInput.omit({ list_id: true })).min(1).max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const list = b.data.list_id ?? (await defaultList(c.env, p.accountId));
  const now = Date.now();
  for (const [i, r] of b.data.rows.entries()) await upsertPerson(c.env, p.accountId, { ...r, list_id: list }, now + i);
  c.executionCtx.waitUntil(onAudienceJoin(c.env, p.accountId, list, b.data.rows.map((r) => r.email)));
  return c.json({ imported: b.data.rows.length, list_id: list }, 201);
});

people.post("/bulk", async (c) => {
  const p = c.get("principal");
  const b = z.object({ emails: z.array(z.email()).min(1).max(5000), add_tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/)).max(10).default([]), remove_tags: z.array(z.string()).max(10).default([]), add_to_list: z.string().max(64).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (b.data.add_to_list) {
    const a = await c.env.DB.prepare("SELECT id FROM audiences WHERE id = ? AND account_id = ?").bind(b.data.add_to_list, p.accountId).first();
    if (!a) throw errors.notFound("List");
  }
  for (const email of b.data.emails) {
    const e = email.toLowerCase();
    if (b.data.add_tags.length || b.data.remove_tags.length) await applyTags(c.env, p.accountId, e, b.data.add_tags, b.data.remove_tags);
    if (b.data.add_to_list) {
      const src = await c.env.DB.prepare("SELECT first_name, last_name FROM contacts WHERE account_id = ? AND email = ? LIMIT 1").bind(p.accountId, e).first<{ first_name: string | null; last_name: string | null }>();
      await c.env.DB.prepare("INSERT OR IGNORE INTO contacts (id, account_id, audience_id, email, first_name, last_name, unsubscribed, created_at) VALUES (?,?,?,?,?,?,0,?)").bind(`con_${uuidv7()}`, p.accountId, b.data.add_to_list, e, src?.first_name ?? null, src?.last_name ?? null, Date.now()).run();
    }
  }
  if (b.data.add_to_list) c.executionCtx.waitUntil(onAudienceJoin(c.env, p.accountId, b.data.add_to_list, b.data.emails.map((e) => e.toLowerCase())));
  return c.json({ updated: b.data.emails.length });
});

people.get("/:email", async (c) => {
  const p = c.get("principal");
  const email = decodeURIComponent(c.req.param("email")).toLowerCase();
  const person = (await loadPeople(c.env, p.accountId)).find((x) => x.email === email);
  if (!person) throw errors.notFound("Contact");
  const [lists, sent, events, acts, notes, funnels] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, name FROM audiences WHERE account_id = ?").bind(p.accountId),
    c.env.DB.prepare("SELECT id, subject, last_event, created_at FROM emails WHERE account_id = ? AND to_addrs LIKE ? ORDER BY created_at DESC LIMIT 50").bind(p.accountId, `%"${email}"%`),
    c.env.DB.prepare("SELECT e.type, e.email_id, e.data, e.created_at, m.subject FROM email_events e LEFT JOIN emails m ON m.id = e.email_id WHERE e.account_id = ? AND e.recipient = ? ORDER BY e.created_at DESC LIMIT 100").bind(p.accountId, email),
    c.env.DB.prepare("SELECT type, data, created_at FROM activities WHERE account_id = ? AND email = ? ORDER BY created_at DESC LIMIT 100").bind(p.accountId, email),
    c.env.DB.prepare("SELECT id, body, author, created_at FROM notes WHERE account_id = ? AND email = ? ORDER BY created_at DESC LIMIT 100").bind(p.accountId, email),
    c.env.DB.prepare("SELECT f.name, e.status, e.created_at FROM enrollments e JOIN funnels f ON f.id = e.funnel_id WHERE e.account_id = ? AND e.email = ? ORDER BY e.created_at DESC").bind(p.accountId, email),
  ]);
  const listNames = new Map((lists!.results as any[]).map((l) => [l.id, l.name]));
  const timeline = [
    ...(sent!.results as any[]).map((m) => ({ at: m.created_at, kind: "sent", title: m.subject, detail: m.last_event })),
    ...(events!.results as any[]).filter((e) => e.type !== "email.delivered").map((e) => ({ at: e.created_at, kind: e.type.replace("email.", ""), title: e.subject ?? "", detail: e.type === "email.clicked" ? (() => { try { return JSON.parse(e.data).click?.link ?? ""; } catch { return ""; } })() : "" })),
    ...(acts!.results as any[]).map((a) => ({ at: a.created_at, kind: a.type, title: a.data ? (() => { try { const d = JSON.parse(a.data); return d.tag ?? (d.list ? listNames.get(d.list) ?? "" : ""); } catch { return ""; } })() : "", detail: "" })),
    ...(notes!.results as any[]).map((n) => ({ at: n.created_at, kind: "note", title: n.body, detail: n.author ?? "", id: n.id })),
    ...(funnels!.results as any[]).map((f) => ({ at: f.created_at, kind: "funnel", title: f.name, detail: f.status })),
  ].sort((a, b) => b.at - a.at);
  const stats = {
    sent: (sent!.results as any[]).length,
    opened: new Set((events!.results as any[]).filter((e) => e.type === "email.opened").map((e) => e.email_id)).size,
    clicked: new Set((events!.results as any[]).filter((e) => e.type === "email.clicked").map((e) => e.email_id)).size,
  };
  return c.json({ object: "person", ...person, lists: person.lists.map((id) => ({ id, name: listNames.get(id) ?? id })), stats, timeline });
});

people.patch("/:email", async (c) => {
  const p = c.get("principal");
  const email = decodeURIComponent(c.req.param("email")).toLowerCase();
  const b = personInput.omit({ email: true, list_id: true, tags: true }).extend({ add_tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/)).max(20).default([]), remove_tags: z.array(z.string()).max(20).default([]) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const exists = await c.env.DB.prepare("SELECT 1 AS x FROM contacts WHERE account_id = ? AND email = ? LIMIT 1").bind(p.accountId, email).first();
  if (!exists) throw errors.notFound("Contact");
  const now = Date.now();
  const stmts = [];
  if (b.data.first_name !== undefined || b.data.last_name !== undefined) {
    stmts.push(c.env.DB.prepare("UPDATE contacts SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE account_id = ? AND email = ?").bind(b.data.first_name ?? null, b.data.last_name ?? null, p.accountId, email));
  }
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO people_data (account_id, email, phone, company, fields, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)
       ON CONFLICT(account_id, email) DO UPDATE SET phone = COALESCE(?3, phone), company = COALESCE(?4, company), fields = json_patch(fields, ?5), updated_at = ?6`,
    ).bind(p.accountId, email, b.data.phone ?? null, b.data.company ?? null, JSON.stringify(b.data.fields ?? {}), now),
  );
  await c.env.DB.batch(stmts);
  if (b.data.add_tags.length || b.data.remove_tags.length) await applyTags(c.env, p.accountId, email, b.data.add_tags, b.data.remove_tags);
  return c.json({ object: "person", email, updated: true });
});

people.post("/:email/notes", async (c) => {
  const p = c.get("principal");
  const email = decodeURIComponent(c.req.param("email")).toLowerCase();
  const b = z.object({ body: z.string().min(1).max(5000) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const author = p.userId ? (await c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(p.userId).first<{ email: string }>())?.email ?? null : "api";
  const id = prefixedId("note");
  await c.env.DB.prepare("INSERT INTO notes (id, account_id, email, body, author, created_at) VALUES (?,?,?,?,?,?)").bind(id, p.accountId, email, b.data.body, author, Date.now()).run();
  return c.json({ object: "note", id }, 201);
});

people.delete("/:email", async (c) => {
  // Right to erasure (GDPR/LGPD): removes the person from every list and the CRM.
  const p = c.get("principal");
  if (p.permission === "agent") throw errors.forbidden("Agents cannot delete contacts.");
  const email = decodeURIComponent(c.req.param("email")).toLowerCase();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM contacts WHERE account_id = ? AND email = ?").bind(p.accountId, email),
    c.env.DB.prepare("DELETE FROM people_data WHERE account_id = ? AND email = ?").bind(p.accountId, email),
    c.env.DB.prepare("DELETE FROM notes WHERE account_id = ? AND email = ?").bind(p.accountId, email),
    c.env.DB.prepare("DELETE FROM activities WHERE account_id = ? AND email = ?").bind(p.accountId, email),
    c.env.DB.prepare("DELETE FROM enrollments WHERE account_id = ? AND email = ?").bind(p.accountId, email),
  ]);
  return c.json({ email, deleted: true });
});

// ---------------------------------------------------------------- custom fields

export const crmFields = new Hono<AppEnv>();
crmFields.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT key, label, type FROM crm_fields WHERE account_id = ? ORDER BY created_at").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});
crmFields.post("/", async (c) => {
  const b = z.object({ label: z.string().min(1).max(60), type: z.enum(["text", "number", "date"]).default("text") }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const key = b.data.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
  await c.env.DB.prepare("INSERT OR REPLACE INTO crm_fields (account_id, key, label, type, created_at) VALUES (?,?,?,?,?)").bind(c.get("principal").accountId, key, b.data.label, b.data.type, Date.now()).run();
  return c.json({ key, label: b.data.label, type: b.data.type }, 201);
});
crmFields.delete("/:key", async (c) => {
  await c.env.DB.prepare("DELETE FROM crm_fields WHERE account_id = ? AND key = ?").bind(c.get("principal").accountId, c.req.param("key")).run();
  return c.json({ deleted: true });
});

// ---------------------------------------------------------------- segments

export const segments = new Hono<AppEnv>();

segments.get("/", async (c) => {
  const p = c.get("principal");
  const r = await c.env.DB.prepare("SELECT id, name, rules, created_at FROM segments WHERE account_id = ? ORDER BY created_at DESC").bind(p.accountId).all<{ id: string; name: string; rules: string; created_at: number }>();
  const all = await loadPeople(c.env, p.accountId);
  return c.json({ object: "list", data: r.results.map((s) => { const rules = rulesSchema.parse(JSON.parse(s.rules)); return { ...s, rules, count: applySegment(all, rules).length }; }) });
});

segments.post("/preview", async (c) => {
  const b = rulesSchema.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const list = applySegment(await loadPeople(c.env, c.get("principal").accountId), b.data);
  return c.json({ count: list.length, sample: list.slice(0, 5).map((x) => ({ email: x.email, first_name: x.first_name, score: x.score })) });
});

segments.post("/", async (c) => {
  const b = z.object({ name: z.string().min(1).max(100), rules: rulesSchema }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const id = prefixedId("seg");
  await c.env.DB.prepare("INSERT INTO segments (id, account_id, name, rules, created_at, updated_at) VALUES (?,?,?,?,?,?)").bind(id, c.get("principal").accountId, b.data.name, JSON.stringify(b.data.rules), Date.now(), Date.now()).run();
  return c.json({ object: "segment", id }, 201);
});

segments.patch("/:id", async (c) => {
  const b = z.object({ name: z.string().min(1).max(100).optional(), rules: rulesSchema.optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const r = await c.env.DB.prepare("UPDATE segments SET name = COALESCE(?, name), rules = COALESCE(?, rules), updated_at = ? WHERE id = ? AND account_id = ?").bind(b.data.name ?? null, b.data.rules ? JSON.stringify(b.data.rules) : null, Date.now(), c.req.param("id"), c.get("principal").accountId).run();
  if (!r.meta.changes) throw errors.notFound("Segment");
  return c.json({ id: c.req.param("id"), updated: true });
});

segments.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM segments WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  return c.json({ deleted: true });
});

/** Freezes a segment into a list so it can receive a campaign (subscribed people only). */
segments.post("/:id/list", async (c) => {
  const p = c.get("principal");
  const s = await c.env.DB.prepare("SELECT name, rules FROM segments WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<{ name: string; rules: string }>();
  if (!s) throw errors.notFound("Segment");
  const members = applySegment(await loadPeople(c.env, p.accountId), rulesSchema.parse(JSON.parse(s.rules))).filter((x) => x.subscribed);
  const id = prefixedId("aud");
  const now = Date.now();
  const name = `Segment · ${s.name} · ${new Date(now).toISOString().slice(0, 10)}`;
  await c.env.DB.prepare("INSERT INTO audiences (id, account_id, name, created_at) VALUES (?,?,?,?)").bind(id, p.accountId, name, now).run();
  const stmts = members.map((m, i) => c.env.DB.prepare("INSERT OR IGNORE INTO contacts (id, account_id, audience_id, email, first_name, last_name, unsubscribed, tags, created_at) VALUES (?,?,?,?,?,?,0,?,?)").bind(`con_${uuidv7(now + i)}`, p.accountId, id, m.email, m.first_name, m.last_name, JSON.stringify(m.tags), now));
  for (let i = 0; i < stmts.length; i += 100) await c.env.DB.batch(stmts.slice(i, i + 100));
  return c.json({ object: "audience", id, name, contacts: members.length }, 201);
});
