// Audiences, contacts and broadcasts. Broadcasts are sent in small batches by the cron
// trigger (free-plan friendly) and always carry RFC 8058 one-click unsubscribe headers.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { b64decode, base64url, prefixedId, safeEqual, uuidv7 } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { sendOne } from "./emails";
import { onAudienceJoin } from "./funnels";

export const BATCH_SIZE = 40; // per cron tick per broadcast (subrequest budget on the free plan)

const parse = async <T extends z.ZodTypeAny>(schema: T, req: Request): Promise<z.infer<T>> => {
  const r = schema.safeParse(await req.json().catch(() => null));
  if (!r.success) throw errors.validation(zodMessage(r.error));
  return r.data;
};

async function own(env: Env, table: "audiences" | "broadcasts", id: string, accountId: string) {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND account_id = ?`).bind(id, accountId).first<Record<string, unknown>>();
  if (!row) throw errors.notFound(table === "audiences" ? "Audience" : "Broadcast");
  return row;
}

// ---------------- unsubscribe tokens ----------------

async function hmac(env: Env, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${env.ENCRYPTION_KEY}:unsub`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg))).slice(0, 16));
}
export async function unsubscribeToken(env: Env, contactId: string) {
  return `${base64url(new TextEncoder().encode(contactId))}.${await hmac(env, contactId)}`;
}
export async function readUnsubscribeToken(env: Env, token: string) {
  const [a, sig] = token.split(".");
  if (!a || !sig) return null;
  let id: string;
  try {
    id = new TextDecoder().decode(b64decode(a.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((a.length + 3) % 4)));
  } catch {
    return null;
  }
  return safeEqual(sig, await hmac(env, id)) ? id : null;
}

export function personalize(tpl: string | null | undefined, vars: Record<string, string>) {
  if (!tpl) return undefined;
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

// ---------------- audiences & contacts ----------------

export const audiences = new Hono<AppEnv>();

audiences.post("/", async (c) => {
  const b = await parse(z.object({ name: z.string().min(1).max(100) }), c.req.raw);
  const id = prefixedId("aud");
  await c.env.DB.prepare("INSERT INTO audiences (id, account_id, name, created_at) VALUES (?,?,?,?)").bind(id, c.get("principal").accountId, b.name, Date.now()).run();
  return c.json({ object: "audience", id, name: b.name }, 201);
});

audiences.get("/", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT a.id, a.name, a.created_at,
            (SELECT COUNT(*) FROM contacts x WHERE x.audience_id = a.id) AS contacts,
            (SELECT COUNT(*) FROM contacts x WHERE x.audience_id = a.id AND x.unsubscribed = 1) AS unsubscribed
       FROM audiences a WHERE a.account_id = ? ORDER BY a.created_at DESC`,
  ).bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

audiences.delete("/:id", async (c) => {
  await own(c.env, "audiences", c.req.param("id"), c.get("principal").accountId);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM contacts WHERE audience_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM audiences WHERE id = ?").bind(c.req.param("id")),
  ]);
  return c.json({ id: c.req.param("id"), deleted: true });
});

const contactSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  unsubscribed: z.boolean().optional(),
});

audiences.post("/:id/contacts", async (c) => {
  const p = c.get("principal");
  await own(c.env, "audiences", c.req.param("id"), p.accountId);
  const raw = await c.req.json().catch(() => null);
  // Accepts one contact or an array of up to 1000 (bulk import).
  const list = z.union([contactSchema, z.array(contactSchema).min(1).max(1000)]).safeParse(raw);
  if (!list.success) throw errors.validation(zodMessage(list.error));
  const items = Array.isArray(list.data) ? list.data : [list.data];
  const now = Date.now();
  const stmts = items.map((ct, i) =>
    c.env.DB.prepare(
      `INSERT INTO contacts (id, account_id, audience_id, email, first_name, last_name, unsubscribed, created_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(audience_id, email) DO UPDATE SET first_name = COALESCE(excluded.first_name, first_name), last_name = COALESCE(excluded.last_name, last_name),
         unsubscribed = CASE WHEN ? THEN excluded.unsubscribed ELSE unsubscribed END`,
    ).bind(`con_${uuidv7(now + i)}`, p.accountId, c.req.param("id"), ct.email, ct.first_name ?? null, ct.last_name ?? null, ct.unsubscribed ? 1 : 0, now, ct.unsubscribed === undefined ? 0 : 1),
  );
  for (let i = 0; i < stmts.length; i += 100) await c.env.DB.batch(stmts.slice(i, i + 100));
  const acts = items.map((ct) => c.env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'joined_list', ?, ?)").bind(p.accountId, ct.email, JSON.stringify({ list: c.req.param("id") }), now));
  for (let i = 0; i < acts.length; i += 100) await c.env.DB.batch(acts.slice(i, i + 100));
  // Funnels triggered by this audience start for the new contacts.
  c.executionCtx.waitUntil(onAudienceJoin(c.env, p.accountId, c.req.param("id"), items.filter((x) => !x.unsubscribed).map((x) => x.email)));
  return c.json({ object: "list", imported: items.length }, 201);
});

audiences.get("/:id/contacts", async (c) => {
  await own(c.env, "audiences", c.req.param("id"), c.get("principal").accountId);
  const r = await c.env.DB.prepare("SELECT id, email, first_name, last_name, unsubscribed, created_at FROM contacts WHERE audience_id = ? ORDER BY id DESC LIMIT 500").bind(c.req.param("id")).all();
  return c.json({ object: "list", data: r.results.map((x) => ({ ...x, unsubscribed: !!x.unsubscribed })) });
});

audiences.delete("/:id/contacts/:email", async (c) => {
  await own(c.env, "audiences", c.req.param("id"), c.get("principal").accountId);
  await c.env.DB.prepare("DELETE FROM contacts WHERE audience_id = ? AND email = ?").bind(c.req.param("id"), c.req.param("email").toLowerCase()).run();
  return c.json({ deleted: true });
});

// ---------------- broadcasts ----------------

export const broadcasts = new Hono<AppEnv>();

const bcSchema = z
  .object({
    audience_id: z.string(),
    name: z.string().max(200).optional(),
    from: z.string().min(3).max(320),
    reply_to: z.string().max(320).optional(),
    subject: z.string().max(998).optional(),
    html: z.string().max(2_000_000).optional(),
    text: z.string().max(2_000_000).optional(),
    template_id: z.string().optional(),
    // A/B test: alternative subjects (the main `subject` is variant A).
    ab: z.object({
      subjects: z.array(z.string().min(1).max(998)).min(1).max(3),
      test_percent: z.number().int().min(10).max(100).default(20),
      metric: z.enum(["opens", "clicks"]).default("opens"),
      wait_hours: z.number().min(1).max(72).default(4),
    }).optional(),
  })
  .refine((v) => v.html || v.text || v.template_id, { message: "Provide `template_id`, `html` or `text`.", path: ["html"] });

broadcasts.post("/", async (c) => {
  const p = c.get("principal");
  const b = await parse(bcSchema, c.req.raw);
  await own(c.env, "audiences", b.audience_id, p.accountId);
  let { subject, html, text } = b;
  if (b.template_id) {
    const t = await c.env.DB.prepare("SELECT subject, html, text FROM templates WHERE id = ? AND account_id = ?").bind(b.template_id, p.accountId).first<{ subject: string; html: string; text: string | null }>();
    if (!t) throw errors.notFound("Template");
    subject ||= t.subject;
    html ??= t.html;
    text ??= t.text ?? undefined;
  }
  if (!subject) throw errors.validation("subject is required (or use a template with a subject).");
  const id = prefixedId("bc");
  const ab = b.ab ? { variants: [subject, ...b.ab.subjects], test_percent: b.ab.test_percent, metric: b.ab.metric, wait_hours: b.ab.wait_hours, test_size: null, winner: null, test_done_at: null } : null;
  await c.env.DB.prepare("INSERT INTO broadcasts (id, account_id, audience_id, name, from_addr, reply_to, subject, html, text, template_id, ab, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.audience_id, b.name ?? null, b.from, b.reply_to ?? null, subject, html ?? null, text ?? null, b.template_id ?? null, ab ? JSON.stringify(ab) : null, Date.now())
    .run();
  return c.json({ object: "broadcast", id, status: "draft" }, 201);
});

broadcasts.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name, audience_id, subject, status, status_reason, sent_count, skipped_count, created_at, started_at, finished_at, send_at, resend_of, smart_time, ab FROM broadcasts WHERE account_id = ? ORDER BY created_at DESC LIMIT 100").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

broadcasts.get("/:id", async (c) => c.json({ object: "broadcast", ...(await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId)) }));

broadcasts.post("/:id/send", async (c) => {
  const b = await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId);
  if (!["draft", "paused", "scheduled"].includes(b.status as string)) throw errors.conflict(`Broadcast is ${b.status}.`);
  const o = z.object({ send_at: z.union([z.number(), z.iso.datetime({ offset: true })]).optional(), smart_time: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!o.success) throw errors.validation(zodMessage(o.error));
  const at = o.data.send_at === undefined ? null : typeof o.data.send_at === "number" ? o.data.send_at : Date.parse(o.data.send_at);
  if (at && at > Date.now() + 60_000) {
    await c.env.DB.prepare("UPDATE broadcasts SET status = 'scheduled', send_at = ?, smart_time = ? WHERE id = ?").bind(at, o.data.smart_time ? 1 : 0, b.id).run();
    return c.json({ id: b.id, status: "scheduled", send_at: at });
  }
  await c.env.DB.prepare("UPDATE broadcasts SET status = 'sending', status_reason = NULL, smart_time = ?, started_at = COALESCE(started_at, ?) WHERE id = ?").bind(o.data.smart_time ? 1 : 0, Date.now(), b.id).run();
  return c.json({ id: b.id, status: "sending" });
});

/** Re-sends a finished campaign, with a new subject, only to people who didn't open (or click) it. */
broadcasts.post("/:id/resend", async (c) => {
  const p = c.get("principal");
  const b = await own(c.env, "broadcasts", c.req.param("id"), p.accountId);
  if (b.status !== "sent") throw errors.conflict("Only a sent campaign can be re-sent to non-openers.");
  const o = z.object({ subject: z.string().min(1).max(998), after_hours: z.number().min(0).max(24 * 14).default(48) }).safeParse(await c.req.json().catch(() => null));
  if (!o.success) throw errors.validation(zodMessage(o.error));
  const id = prefixedId("bc");
  const now = Date.now();
  const at = Math.max(now, (b.finished_at as number) + o.data.after_hours * 3_600_000);
  await c.env.DB.prepare("INSERT INTO broadcasts (id, account_id, audience_id, name, from_addr, reply_to, subject, html, text, template_id, resend_of, status, send_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'scheduled', ?, ?)")
    .bind(id, p.accountId, b.audience_id, `${b.name ?? b.subject} — resend to non-openers`, b.from_addr, b.reply_to, o.data.subject, b.html, b.text, b.template_id, b.id, at, now).run();
  return c.json({ object: "broadcast", id, status: "scheduled", send_at: at, resend_of: b.id }, 201);
});

/** Per-variant results of an A/B test. */
broadcasts.get("/:id/ab", async (c) => {
  const b = await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId);
  if (!b.ab) throw errors.notFound("A/B test");
  const ab = JSON.parse(b.ab as string);
  return c.json({ object: "ab_test", ...ab, results: await abResults(c.env, b.id as string, ab.variants.length) });
});

broadcasts.post("/:id/cancel", async (c) => {
  const b = await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId);
  if (["sent", "cancelled"].includes(b.status as string)) throw errors.conflict(`Broadcast is ${b.status}.`);
  await c.env.DB.prepare("UPDATE broadcasts SET status = 'cancelled', finished_at = ? WHERE id = ?").bind(Date.now(), b.id).run();
  return c.json({ id: b.id, status: "cancelled" });
});

broadcasts.delete("/:id", async (c) => {
  const b = await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId);
  if (b.status === "sending") throw errors.conflict("Cancel the broadcast before deleting it.");
  await c.env.DB.prepare("DELETE FROM broadcasts WHERE id = ?").bind(b.id).run();
  return c.json({ id: b.id, deleted: true });
});

export async function abResults(env: Env, broadcastId: string, n: number) {
  const r = await env.DB.prepare(
    `SELECT r.variant, COUNT(*) AS sent,
            COUNT(DISTINCT CASE WHEN e.type = 'email.opened' THEN r.email END) AS opens,
            COUNT(DISTINCT CASE WHEN e.type = 'email.clicked' THEN r.email END) AS clicks
       FROM broadcast_recipients r LEFT JOIN email_events e ON e.email_id = r.email_id AND e.type IN ('email.opened','email.clicked') AND e.machine != 1
      WHERE r.broadcast_id = ? GROUP BY r.variant`,
  ).bind(broadcastId).all<{ variant: number; sent: number; opens: number; clicks: number }>();
  return Array.from({ length: n }, (_, i) => {
    const x = r.results.find((v) => v.variant === i) ?? { sent: 0, opens: 0, clicks: 0 };
    return { variant: i, sent: x.sent, opens: x.opens, clicks: x.clicks, open_rate: x.sent ? x.opens / x.sent : 0, click_rate: x.sent ? x.clicks / x.sent : 0 };
  });
}

interface AbState { variants: string[]; test_percent: number; metric: "opens" | "clicks"; wait_hours: number; test_size: number | null; winner: number | null; test_done_at: number | null }

// ?6 = legacy cursor (campaigns started before the per-recipient log; '' for new ones).
const eligibleSql = `FROM contacts c WHERE c.audience_id = ?1 AND c.id > ?6 AND c.unsubscribed = 0
   AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.account_id = ?2 AND s.address = c.email)
   AND NOT EXISTS (SELECT 1 FROM broadcast_recipients x WHERE x.broadcast_id = ?3 AND x.email = c.email)
   AND (?4 IS NULL OR EXISTS (SELECT 1 FROM broadcast_recipients r WHERE r.broadcast_id = ?4 AND r.email = c.email
        AND NOT EXISTS (SELECT 1 FROM email_events e WHERE e.email_id = r.email_id AND e.machine != 1 AND e.type IN ('email.opened','email.clicked'))))`;

const HOUR = 3_600_000;

/** Usual open hour (UTC, 0–23) per recipient, plus the list-wide favourite as fallback. */
export async function openHours(env: Env, accountId: string) {
  const r = await env.DB.prepare(
    `SELECT recipient AS email, CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS n
       FROM email_events WHERE account_id = ? AND type IN ('email.opened','email.clicked') AND machine = 0 AND recipient IS NOT NULL AND created_at > ?
      GROUP BY recipient, h`,
  ).bind(accountId, Date.now() - 180 * 86_400_000).all<{ email: string; h: number; n: number }>();
  const per = new Map<string, { h: number; n: number }>();
  const all = new Array(24).fill(0);
  for (const x of r.results) {
    all[x.h] += x.n;
    const cur = per.get(x.email.toLowerCase());
    if (!cur || x.n > cur.n) per.set(x.email.toLowerCase(), { h: x.h, n: x.n });
  }
  const top = all.some((n) => n > 0) ? all.indexOf(Math.max(...all)) : null;
  return { per: new Map([...per].map(([e, v]) => [e, v.h])), top };
}

/** Next time (≥ start, < start+24h) at hour `h` UTC, spread across the hour so sends don't spike. */
export function nextAt(start: number, h: number, email: string) {
  const d = new Date(start);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h);
  if (t < start - HOUR / 2) t += 24 * HOUR;
  let spread = 0;
  for (const ch of email) spread = (spread * 31 + ch.charCodeAt(0)) % 3_000_000;
  return Math.max(start, t + spread);
}

/** Cron: scheduled → sending, finished A/B tests pick a winner, then every `sending` campaign sends a batch. */
export async function processBroadcasts(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  await env.DB.prepare("UPDATE broadcasts SET status = 'sending', started_at = COALESCE(started_at, ?1) WHERE status = 'scheduled' AND send_at <= ?1").bind(now).run();
  const testing = await env.DB.prepare("SELECT id, ab FROM broadcasts WHERE status = 'testing'").all<{ id: string; ab: string }>();
  for (const t of testing.results) {
    const ab = JSON.parse(t.ab) as AbState;
    if (!ab.test_done_at || now < ab.test_done_at + ab.wait_hours * 3_600_000) continue;
    const res = await abResults(env, t.id, ab.variants.length);
    const score = (x: (typeof res)[number]) => (ab.metric === "clicks" ? x.click_rate * 1000 + x.open_rate : x.open_rate * 1000 + x.click_rate);
    ab.winner = res.reduce((best, x) => (score(x) > score(res[best]!) ? x.variant : best), 0);
    await env.DB.prepare("UPDATE broadcasts SET ab = ?, status = 'sending' WHERE id = ?").bind(JSON.stringify(ab), t.id).run();
  }

  const active = await env.DB.prepare("SELECT * FROM broadcasts WHERE status = 'sending' ORDER BY started_at LIMIT 5").all<Record<string, any>>();
  const out: { id: string; sent: number; done: boolean }[] = [];
  for (const b of active.results) {
    const ab: AbState | null = b.ab ? JSON.parse(b.ab) : null;
    if (ab && ab.test_size === null) {
      const total = (await env.DB.prepare(`SELECT COUNT(*) AS n ${eligibleSql}`).bind(b.audience_id, b.account_id, b.id, b.resend_of ?? null, null, b.cursor ?? "").first<{ n: number }>())!.n;
      ab.test_size = ab.test_percent >= 100 ? total : Math.max(ab.variants.length * 2, Math.ceil((total * ab.test_percent) / 100));
      await env.DB.prepare("UPDATE broadcasts SET ab = ? WHERE id = ?").bind(JSON.stringify(ab), b.id).run();
    }
    if (b.smart_time && !ab) {
      out.push(await processSmart(env, b, now, fetcher));
      continue;
    }
    const inTest = ab && ab.winner === null;
    const room = inTest ? Math.max(0, ab!.test_size! - b.sent_count) : BATCH_SIZE;
    const contacts = await env.DB.prepare(`SELECT c.id, c.email, c.first_name, c.last_name ${eligibleSql} ORDER BY c.id LIMIT ?5`)
      .bind(b.audience_id, b.account_id, b.id, b.resend_of ?? null, Math.min(BATCH_SIZE, room), b.cursor ?? "")
      .all<{ id: string; email: string; first_name: string | null; last_name: string | null }>();
    let sent = 0;
    let skipped = 0;
    let pause: string | null = null;
    for (const ct of contacts.results) {
      const variant = !ab ? 0 : inTest ? (b.sent_count + sent + skipped) % ab.variants.length : ab.winner!;
      const subject = ab ? ab.variants[variant]! : b.subject;
      let emailId: string | null = null;
      try {
        emailId = await sendToContact(env, b, ct, subject, variant, ab ? [{ name: "variant", value: String.fromCharCode(65 + variant) }] : [], fetcher);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 429 || e.status === 403)) {
          pause = e.message;
          break;
        }
        skipped++; // invalid address, suppressed, upstream reject: skip and continue
      }
      await env.DB.prepare("INSERT OR IGNORE INTO broadcast_recipients (broadcast_id, email, email_id, variant, created_at) VALUES (?,?,?,?,?)").bind(b.id, ct.email, emailId, variant, now).run();
    }
    const testFilled = inTest && ab!.test_percent < 100 && b.sent_count + sent + skipped >= ab!.test_size!;
    const done = !pause && !testFilled && contacts.results.length < Math.min(BATCH_SIZE, room || BATCH_SIZE);
    if (testFilled) ab!.test_done_at = now;
    const status = pause ? "paused" : testFilled ? "testing" : done ? "sent" : "sending";
    await env.DB.prepare(
      `UPDATE broadcasts SET sent_count = sent_count + ?, skipped_count = skipped_count + ?, ab = COALESCE(?, ab),
              status = ?, status_reason = ?, finished_at = CASE WHEN ? THEN ? ELSE finished_at END WHERE id = ?`,
    ).bind(sent, skipped, testFilled ? JSON.stringify(ab) : null, status, pause, done ? 1 : 0, now, b.id).run();
    out.push({ id: b.id, sent, done });
  }
  return out;
}

async function sendToContact(env: Env, b: Record<string, any>, ct: { id: string; email: string; first_name: string | null; last_name: string | null }, subject: string, variant: number, extraTags: { name: string; value: string }[], fetcher: typeof fetch) {
  const principal: Principal = { accountId: b.account_id, apiKeyId: `broadcast:${b.id}`, permission: "full", domainId: null };
  const unsub = `${env.PUBLIC_URL}/u/${await unsubscribeToken(env, ct.id)}`;
  const vars = { first_name: ct.first_name ?? "", last_name: ct.last_name ?? "", email: ct.email, unsubscribe_url: unsub, preferences_url: unsub };
  return (await sendOne(
    env,
    principal,
    {
      from: b.from_addr,
      to: [ct.email],
      reply_to: b.reply_to ? [b.reply_to] : undefined,
      subject: personalize(subject, vars)!,
      html: personalize(b.html, vars),
      text: personalize(b.text, vars),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", Precedence: "bulk" },
      tags: [{ name: "category", value: "broadcast" }, { name: "broadcast", value: b.id.replace(/[^A-Za-z0-9_-]/g, "") }, ...extraTags],
    },
    `${b.id}:${ct.id}`,
    fetcher,
    { track: true },
  )).id;
}

/** Smart send time: queue everyone at their usual open hour once, then send whoever is due. */
async function processSmart(env: Env, b: Record<string, any>, now: number, fetcher: typeof fetch) {
  if (!b.queued_at) {
    const start = b.started_at ?? now;
    const { per, top } = await openHours(env, b.account_id);
    const people = await env.DB.prepare(`SELECT c.id, c.email ${eligibleSql}`).bind(b.audience_id, b.account_id, b.id, b.resend_of ?? null, null, b.cursor ?? "").all<{ id: string; email: string }>();
    const stmts = people.results.map((p) => {
      const h = per.get(p.email.toLowerCase()) ?? top;
      return env.DB.prepare("INSERT OR IGNORE INTO broadcast_queue (broadcast_id, contact_id, due_at) VALUES (?,?,?)").bind(b.id, p.id, h === null ? start : nextAt(start, h, p.email));
    });
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    await env.DB.prepare("UPDATE broadcasts SET queued_at = ? WHERE id = ?").bind(now, b.id).run();
  }
  const due = await env.DB.prepare(
    `SELECT q.contact_id AS id, c.email, c.first_name, c.last_name, c.unsubscribed,
            EXISTS (SELECT 1 FROM suppressions s WHERE s.account_id = ? AND s.address = c.email) AS suppressed
       FROM broadcast_queue q JOIN contacts c ON c.id = q.contact_id WHERE q.broadcast_id = ? AND q.due_at <= ? ORDER BY q.due_at LIMIT ?`,
  ).bind(b.account_id, b.id, now, BATCH_SIZE).all<{ id: string; email: string; first_name: string | null; last_name: string | null; unsubscribed: number; suppressed: number }>();
  let sent = 0, skipped = 0;
  let pause: string | null = null;
  for (const ct of due.results) {
    let emailId: string | null = null;
    if (ct.unsubscribed || ct.suppressed) skipped++;
    else {
      try {
        emailId = await sendToContact(env, b, ct, b.subject, 0, [{ name: "send_time", value: "smart" }], fetcher);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 429 || e.status === 403)) { pause = e.message; break; }
        skipped++;
      }
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM broadcast_queue WHERE broadcast_id = ? AND contact_id = ?").bind(b.id, ct.id),
      env.DB.prepare("INSERT OR IGNORE INTO broadcast_recipients (broadcast_id, email, email_id, variant, created_at) VALUES (?,?,?,0,?)").bind(b.id, ct.email, emailId, now),
    ]);
  }
  const left = (await env.DB.prepare("SELECT COUNT(*) AS n FROM broadcast_queue WHERE broadcast_id = ?").bind(b.id).first<{ n: number }>())!.n;
  const done = !pause && left === 0;
  await env.DB.prepare("UPDATE broadcasts SET sent_count = sent_count + ?, skipped_count = skipped_count + ?, status = ?, status_reason = ?, finished_at = CASE WHEN ? THEN ? ELSE finished_at END WHERE id = ?")
    .bind(sent, skipped, pause ? "paused" : done ? "sent" : "sending", pause, done ? 1 : 0, now, b.id).run();
  return { id: b.id as string, sent, done };
}

// ---------------- public unsubscribe (RFC 8058) ----------------

export const unsubscribe = new Hono<AppEnv>();

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;color:#18181b;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:420px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px}button{font:inherit;background:#18181b;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}@media(prefers-color-scheme:dark){body{background:#09090b;color:#f4f4f5}main{background:#18181b;border-color:#27272a}button{background:#fff;color:#18181b}}</style></head><body><main>${body}</main></body></html>`;

async function doUnsubscribe(env: Env, token: string) {
  const id = await readUnsubscribeToken(env, token);
  if (!id) return null;
  const ct = await env.DB.prepare("SELECT account_id, email FROM contacts WHERE id = ?").bind(id).first<{ account_id: string; email: string }>();
  if (!ct) return null;
  await env.DB.batch([
    env.DB.prepare("UPDATE contacts SET unsubscribed = 1 WHERE account_id = ? AND email = ?").bind(ct.account_id, ct.email),
    env.DB.prepare("INSERT OR IGNORE INTO suppressions (account_id, address, reason, created_at) VALUES (?,?, 'unsubscribe', ?)").bind(ct.account_id, ct.email, Date.now()),
    env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'unsubscribed', NULL, ?)").bind(ct.account_id, ct.email, Date.now()),
  ]);
  return ct.email;
}

const T = {
  en: { invalid: "Invalid link", invalidP: "This link is not valid.", title: "Email preferences", lead: (e: string) => `Choose what <b>${e}</b> receives.`, save: "Save preferences", all: "Unsubscribe from everything", saved: "Preferences saved.", done: "You're unsubscribed", doneP: (e: string) => `<b>${e}</b> won't receive these emails anymore.`, resub: "Changed your mind? Tick a list below and save." },
  pt: { invalid: "Link inválido", invalidP: "Este link não é válido.", title: "Preferências de e-mail", lead: (e: string) => `Escolha o que <b>${e}</b> recebe.`, save: "Salvar preferências", all: "Descadastrar de tudo", saved: "Preferências salvas.", done: "Descadastrado", doneP: (e: string) => `<b>${e}</b> não vai mais receber estes e-mails.`, resub: "Mudou de ideia? Marque uma lista abaixo e salve." },
};
const tr = (c: { req: { header: (h: string) => string | undefined } }) => ((c.req.header("accept-language") ?? "").toLowerCase().startsWith("pt") ? T.pt : T.en);
const PREF_CSS = "label.l{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #e4e4e7}label.l input{width:18px;height:18px;accent-color:#18181b}.ghost{background:transparent!important;color:inherit!important;text-decoration:underline;padding:8px 0!important}.ok{font-weight:600}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:18px}";

async function prefsFor(env: Env, contactId: string) {
  const ct = await env.DB.prepare("SELECT account_id, email FROM contacts WHERE id = ?").bind(contactId).first<{ account_id: string; email: string }>();
  if (!ct) return null;
  const lists = await env.DB.prepare(
    "SELECT a.id, a.name, c.unsubscribed FROM contacts c JOIN audiences a ON a.id = c.audience_id WHERE c.account_id = ? AND c.email = ? AND a.name NOT LIKE 'Segment · %' ORDER BY a.name",
  ).bind(ct.account_id, ct.email).all<{ id: string; name: string; unsubscribed: number }>();
  return { ...ct, lists: lists.results };
}

function prefsPage(t: typeof T.en, p: NonNullable<Awaited<ReturnType<typeof prefsFor>>>, note = "") {
  const e = p.email.replace(/[<>&"]/g, "");
  const allOff = p.lists.every((l) => l.unsubscribed);
  return page(t.title, `<style>${PREF_CSS}</style><h1>${allOff ? t.done : t.title}</h1><p>${allOff ? `${t.doneP(e)} ${t.resub}` : t.lead(e)}</p>${note ? `<p class="ok">${note}</p>` : ""}
<form method="post"><input type="hidden" name="action" value="save">${p.lists.map((l) => `<label class="l"><input type="checkbox" name="list" value="${l.id}" ${l.unsubscribed ? "" : "checked"}> ${l.name.replace(/[<>&"]/g, "")}</label>`).join("")}
<div class="row"><button>${t.save}</button>${allOff ? "" : `<button class="ghost" name="action" value="all">${t.all}</button>`}</div></form>`);
}

// Preference center. Mail clients (Gmail/Yahoo "Unsubscribe" button) POST
// "List-Unsubscribe=One-Click" here without user interaction (RFC 8058) → unsubscribe from everything.
unsubscribe.post("/:token", async (c) => {
  const t = tr(c);
  const body = await c.req.parseBody({ all: true }).catch(() => ({}) as Record<string, unknown>);
  const action = Array.isArray(body.action) ? String(body.action.at(-1)) : String(body.action ?? "");
  if (body["List-Unsubscribe"] === "One-Click" || action === "all" || !action) {
    const email = await doUnsubscribe(c.env, c.req.param("token"));
    if (!email) return c.html(page(t.invalid, `<h1>${t.invalid}</h1><p>${t.invalidP}</p>`), 404);
    const id = await readUnsubscribeToken(c.env, c.req.param("token"));
    const p = id ? await prefsFor(c.env, id) : null;
    return c.html(p ? prefsPage(t, p) : page(t.done, `<h1>${t.done}</h1><p>${t.doneP(email.replace(/[<>&"]/g, ""))}</p>`));
  }
  const id = await readUnsubscribeToken(c.env, c.req.param("token"));
  const p = id ? await prefsFor(c.env, id) : null;
  if (!p) return c.html(page(t.invalid, `<h1>${t.invalid}</h1><p>${t.invalidP}</p>`), 404);
  const keep = new Set((Array.isArray(body.list) ? body.list : body.list ? [body.list] : []).map(String));
  const now = Date.now();
  const stmts = p.lists.flatMap((l) => {
    const on = keep.has(l.id);
    if (on === !l.unsubscribed) return [];
    return [
      c.env.DB.prepare("UPDATE contacts SET unsubscribed = ? WHERE account_id = ? AND audience_id = ? AND email = ?").bind(on ? 0 : 1, p.account_id, l.id, p.email),
      c.env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?,?,?,?)").bind(p.account_id, p.email, on ? "resubscribed" : "unsubscribed", JSON.stringify({ list: l.id }), now),
    ];
  });
  if (keep.size) stmts.push(c.env.DB.prepare("DELETE FROM suppressions WHERE account_id = ? AND address = ? AND reason = 'unsubscribe'").bind(p.account_id, p.email));
  else stmts.push(c.env.DB.prepare("INSERT OR IGNORE INTO suppressions (account_id, address, reason, created_at) VALUES (?,?, 'unsubscribe', ?)").bind(p.account_id, p.email, now));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.html(prefsPage(t, (await prefsFor(c.env, id!))!, t.saved));
});

// A human clicking the link sees the preference center (GETs never change state: link scanners prefetch).
unsubscribe.get("/:token", async (c) => {
  const t = tr(c);
  const id = await readUnsubscribeToken(c.env, c.req.param("token"));
  const p = id ? await prefsFor(c.env, id) : null;
  if (!p) return c.html(page(t.invalid, `<h1>${t.invalid}</h1><p>${t.invalidP}</p>`), 404);
  return c.html(prefsPage(t, p));
});
