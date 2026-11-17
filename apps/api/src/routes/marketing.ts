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
  await c.env.DB.prepare("INSERT INTO broadcasts (id, account_id, audience_id, name, from_addr, reply_to, subject, html, text, template_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.audience_id, b.name ?? null, b.from, b.reply_to ?? null, subject, html ?? null, text ?? null, b.template_id ?? null, Date.now())
    .run();
  return c.json({ object: "broadcast", id, status: "draft" }, 201);
});

broadcasts.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name, audience_id, subject, status, status_reason, sent_count, skipped_count, created_at, started_at, finished_at FROM broadcasts WHERE account_id = ? ORDER BY created_at DESC LIMIT 100").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

broadcasts.get("/:id", async (c) => c.json({ object: "broadcast", ...(await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId)) }));

broadcasts.post("/:id/send", async (c) => {
  const b = await own(c.env, "broadcasts", c.req.param("id"), c.get("principal").accountId);
  if (!["draft", "paused"].includes(b.status as string)) throw errors.conflict(`Broadcast is ${b.status}.`);
  await c.env.DB.prepare("UPDATE broadcasts SET status = 'sending', status_reason = NULL, started_at = COALESCE(started_at, ?) WHERE id = ?").bind(Date.now(), b.id).run();
  return c.json({ id: b.id, status: "sending" });
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

/** Sends the next batch of every broadcast in `sending` state. Called by the cron trigger. */
export async function processBroadcasts(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  const active = await env.DB.prepare("SELECT * FROM broadcasts WHERE status = 'sending' ORDER BY started_at LIMIT 5").all<Record<string, any>>();
  const out: { id: string; sent: number; done: boolean }[] = [];
  for (const b of active.results) {
    const contacts = await env.DB.prepare(
      `SELECT c.id, c.email, c.first_name, c.last_name FROM contacts c
        WHERE c.audience_id = ? AND c.id > ? AND c.unsubscribed = 0
          AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.account_id = ? AND s.address = c.email)
        ORDER BY c.id LIMIT ?`,
    ).bind(b.audience_id, b.cursor, b.account_id, BATCH_SIZE).all<{ id: string; email: string; first_name: string | null; last_name: string | null }>();
    const principal: Principal = { accountId: b.account_id, apiKeyId: `broadcast:${b.id}`, permission: "full", domainId: null };
    let sent = 0;
    let skipped = 0;
    let cursor = b.cursor as string;
    let pause: string | null = null;
    for (const ct of contacts.results) {
      const unsub = `${env.PUBLIC_URL}/u/${await unsubscribeToken(env, ct.id)}`;
      const vars = { first_name: ct.first_name ?? "", last_name: ct.last_name ?? "", email: ct.email, unsubscribe_url: unsub, preferences_url: unsub };
      try {
        await sendOne(
          env,
          principal,
          {
            from: b.from_addr,
            to: [ct.email],
            reply_to: b.reply_to ? [b.reply_to] : undefined,
            subject: personalize(b.subject, vars)!,
            html: personalize(b.html, vars),
            text: personalize(b.text, vars),
            headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", Precedence: "bulk" },
            tags: [{ name: "category", value: "broadcast" }, { name: "broadcast", value: b.id.replace(/[^A-Za-z0-9_-]/g, "") }],
          },
          `${b.id}:${ct.id}`,
          fetcher,
          { track: true },
        );
        sent++;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 429 || e.status === 403)) {
          pause = e.message;
          break;
        }
        skipped++; // invalid address, suppressed, upstream reject: skip and continue
      }
      cursor = ct.id;
    }
    const done = !pause && contacts.results.length < BATCH_SIZE;
    await env.DB.prepare(
      `UPDATE broadcasts SET cursor = ?, sent_count = sent_count + ?, skipped_count = skipped_count + ?,
              status = ?, status_reason = ?, finished_at = CASE WHEN ? THEN ? ELSE finished_at END WHERE id = ?`,
    ).bind(cursor, sent, skipped, pause ? "paused" : done ? "sent" : "sending", pause, done ? 1 : 0, now, b.id).run();
    out.push({ id: b.id, sent, done });
  }
  return out;
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
