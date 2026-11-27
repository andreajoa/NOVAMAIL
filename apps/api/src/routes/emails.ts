// Resend-compatible email API: existing `resend` SDKs work by changing only the base URL.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { open, uuidv7 } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { postalSend, type PostalSendInput } from "../lib/postal";
import { buildMime } from "../lib/mime";
import { sesSend } from "../lib/ses";
import { assertQuota, bumpUsage } from "../lib/usage";
import { addTracking } from "../lib/tracking";

const addr = z.string().trim().min(3).max(320);
const many = z.union([addr, z.array(addr).min(1).max(50)]).transform((v) => (Array.isArray(v) ? v : [v]));

export const sendSchema = z
  .object({
    from: addr,
    to: many,
    cc: many.optional(),
    bcc: many.optional(),
    subject: z.string().min(1).max(998),
    html: z.string().max(5_000_000).optional(),
    text: z.string().max(5_000_000).optional(),
    reply_to: many.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.object({ name: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/), value: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/) })).max(10).optional(),
    attachments: z
      .array(z.object({ filename: z.string().min(1).max(255), content: z.string().min(1), content_type: z.string().optional() }))
      .max(20)
      .optional(),
    scheduled_at: z.string().optional(),
  })
  .refine((v) => v.html || v.text, { message: "Provide `html` or `text`.", path: ["html"] });

export type SendBody = z.infer<typeof sendSchema>;

/** Extracts the bare address from `Name <user@domain>` and lower-cases it. */
export function bareAddress(v: string): string {
  const m = v.match(/<([^>]+)>\s*$/);
  return (m ? m[1]! : v).trim().toLowerCase();
}

export function domainOf(v: string): string {
  return bareAddress(v).split("@")[1] ?? "";
}

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

interface AccountRow {
  id: string;
  plan: string;
  status: string;
  suspended_reason: string | null;
  postal_server_key: string | null;
}

/** Resend accepts ISO 8601 dates (and epoch ms); up to 30 days ahead. Returns null when it is due now. */
export function parseScheduledAt(v: string, now = Date.now()): number | null {
  const t = /^\d{10,13}$/.test(v.trim()) ? Number(v.trim().length === 10 ? `${v.trim()}000` : v.trim()) : Date.parse(v);
  if (!Number.isFinite(t)) throw errors.validation("`scheduled_at` must be an ISO 8601 date, e.g. 2026-12-01T15:00:00Z.");
  if (t > now + 30 * 86_400_000) throw errors.validation("`scheduled_at` can be at most 30 days in the future.");
  return t <= now + 60_000 ? null : t;
}

export async function sendOne(env: Env, p: Principal, body: SendBody, idemKey: string | null, fetcher: typeof fetch = fetch, opts: { track?: boolean; deliverId?: string } = {}): Promise<{ id: string }> {
  const sendAt = !opts.deliverId && body.scheduled_at ? parseScheduledAt(body.scheduled_at) : null;
  const all = [...body.to, ...(body.cc ?? []), ...(body.bcc ?? [])].map(bareAddress);
  for (const a of all) if (!EMAIL_RE.test(a)) throw errors.validation(`Invalid recipient address: ${a}`);
  const fromAddr = bareAddress(body.from);
  if (!EMAIL_RE.test(fromAddr)) throw errors.validation("Invalid `from` address.");

  if (idemKey && !opts.deliverId) {
    const prev = await env.DB.prepare("SELECT id FROM emails WHERE account_id = ? AND idempotency_key = ?").bind(p.accountId, idemKey).first<{ id: string }>();
    if (prev) return { id: prev.id };
  }

  // Sender domain must be verified on this account (subdomains of a verified domain are allowed).
  const fromDomain = domainOf(body.from);
  const doms = await env.DB.prepare("SELECT id, name FROM domains WHERE account_id = ? AND status = 'verified'").bind(p.accountId).all<{ id: string; name: string }>();
  const dom = doms.results.find((d) => fromDomain === d.name || fromDomain.endsWith(`.${d.name}`));
  if (!dom) throw new ApiError(403, "invalid_from_address", `The domain ${fromDomain} is not verified. Add and verify it under /domains first.`);
  if (p.domainId && p.domainId !== dom.id) throw errors.forbidden("This API key can only send from its assigned domain.");

  if (sendAt) {
    // Store now, send when due (processScheduled). Suppression and quota are applied at send time.
    if ((body.html?.length ?? 0) + (body.text?.length ?? 0) > 1_000_000) throw errors.validation("Scheduled emails are limited to 1 MB of content.");
    const id = uuidv7();
    const now = Date.now();
    const { scheduled_at: _s, ...payload } = body;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO emails (id, account_id, api_key_id, from_addr, to_addrs, cc_addrs, bcc_addrs, subject, tags, last_event, scheduled_at, idempotency_key, created_at)
         VALUES (?,?,?,?,?,?,?,?,?, 'scheduled', ?,?,?)`,
      ).bind(id, p.accountId, p.apiKeyId, body.from, JSON.stringify(body.to), body.cc ? JSON.stringify(body.cc) : null, body.bcc ? JSON.stringify(body.bcc) : null, body.subject, body.tags ? JSON.stringify(body.tags) : null, sendAt, idemKey, now),
      env.DB.prepare("INSERT INTO scheduled_emails (email_id, account_id, principal, payload, track, send_at, created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(id, p.accountId, JSON.stringify(p), JSON.stringify(payload), opts.track ? 1 : 0, sendAt, now),
    ]);
    return { id };
  }

  // Drop suppressed recipients (hard bounces, complaints, unsubscribes).
  const placeholders = all.map(() => "?").join(",");
  const sup = await env.DB.prepare(`SELECT address FROM suppressions WHERE account_id = ? AND address IN (${placeholders})`).bind(p.accountId, ...all).all<{ address: string }>();
  const suppressed = new Set(sup.results.map((r) => r.address));
  const keep = (list?: string[]) => list?.filter((a) => !suppressed.has(bareAddress(a)));
  const to = keep(body.to) ?? [];
  const cc = keep(body.cc);
  const bcc = keep(body.bcc);
  const count = to.length + (cc?.length ?? 0) + (bcc?.length ?? 0);
  if (count === 0) {
    if (opts.deliverId) await env.DB.prepare("UPDATE emails SET last_event = 'suppressed' WHERE id = ?").bind(opts.deliverId).run();
    throw new ApiError(422, "recipients_suppressed", "All recipients are on the suppression list.");
  }

  const acc = await env.DB.prepare("SELECT id, plan, status, suspended_reason, postal_server_key FROM accounts WHERE id = ?").bind(p.accountId).first<AccountRow>();
  if (!acc) throw errors.notFound("Account");
  // Broadcasts and funnels run from cron without the auth middleware, so check here too.
  if (acc.status !== "active") throw errors.suspended(acc.suspended_reason);
  const ses = env.SENDING_NODE === "ses";
  if (!ses && !acc.postal_server_key) throw new ApiError(503, "account_not_provisioned", "Sending is being activated on NovaMail and is not available yet.");
  await assertQuota(env.DB, acc.id, acc.plan, count);

  const id = opts.deliverId ?? uuidv7();
  const input: PostalSendInput = {
    from: body.from,
    to,
    cc,
    bcc,
    subject: body.subject,
    html: body.html && opts.track ? await addTracking(env, body.html, id) : body.html,
    text: body.text,
    replyTo: body.reply_to?.join(", "),
    tag: body.tags?.find((t) => t.name === "category")?.value,
    // Feedback-ID lets Gmail Postmaster Tools report spam rates per sender/category.
    headers: { ...body.headers, "X-NovaMail-Id": id, "Feedback-ID": `${(body.tags?.find((t) => t.name === "category")?.value ?? "tx").slice(0, 40)}:${p.accountId}:novamail` },
    attachments: body.attachments?.map((a) => ({ name: a.filename, content_type: a.content_type ?? "application/octet-stream", data: a.content })),
  };
  const res = ses
    ? {
        messageId: await sesSend(
          env,
          {
            raw: buildMime({ from: input.from, to, cc, replyTo: input.replyTo, subject: input.subject, html: input.html, text: input.text, headers: input.headers, attachments: input.attachments }),
            to,
            cc,
            bcc,
            tags: { account: p.accountId, email: id, category: input.tag ?? "tx" },
          },
          fetcher,
        ),
        // SES reports events per address; recipients are keyed by address (no numeric id).
        recipients: Object.fromEntries([...to, ...(cc ?? []), ...(bcc ?? [])].map((a) => [bareAddress(a), { id: null as number | null, token: "" }])),
      }
    : await postalSend(env, await open(acc.postal_server_key!, env.ENCRYPTION_KEY), input, fetcher);

  const now = Date.now();
  const stmts = [
    opts.deliverId
      ? env.DB.prepare("UPDATE emails SET to_addrs = ?, cc_addrs = ?, bcc_addrs = ?, last_event = 'queued', postal_message_id = ? WHERE id = ?")
          .bind(JSON.stringify(to), cc ? JSON.stringify(cc) : null, bcc ? JSON.stringify(bcc) : null, res.messageId, id)
      : env.DB.prepare(
          `INSERT INTO emails (id, account_id, api_key_id, from_addr, to_addrs, cc_addrs, bcc_addrs, subject, tags, last_event, postal_message_id, idempotency_key, created_at)
           VALUES (?,?,?,?,?,?,?,?,?, 'queued', ?,?,?)`,
        ).bind(id, p.accountId, p.apiKeyId, body.from, JSON.stringify(to), cc ? JSON.stringify(cc) : null, bcc ? JSON.stringify(bcc) : null, body.subject, body.tags ? JSON.stringify(body.tags) : null, res.messageId, idemKey, now),
    ...Object.entries(res.recipients).map(([address, m]) =>
      env.DB.prepare("INSERT OR IGNORE INTO email_recipients (email_id, address, postal_id, status, updated_at) VALUES (?,?,?, 'queued', ?)").bind(id, address.toLowerCase(), m.id, now),
    ),
    bumpUsage(env.DB, p.accountId, "sent", count, now),
  ];
  await env.DB.batch(stmts);
  return { id };
}

/** Cron: sends scheduled emails that are due. Each row is claimed (deleted) before sending, so it goes out once. */
export async function processScheduled(env: Env, fetcher: typeof fetch = fetch, now = Date.now()) {
  const due = await env.DB.prepare("SELECT email_id, principal, payload, track FROM scheduled_emails WHERE send_at <= ? ORDER BY send_at LIMIT 100")
    .bind(now)
    .all<{ email_id: string; principal: string; payload: string; track: number }>();
  let sent = 0, failed = 0;
  for (const r of due.results) {
    const claim = await env.DB.prepare("DELETE FROM scheduled_emails WHERE email_id = ?").bind(r.email_id).run();
    if (!claim.meta.changes) continue;
    try {
      await sendOne(env, JSON.parse(r.principal) as Principal, JSON.parse(r.payload) as SendBody, null, fetcher, { track: !!r.track, deliverId: r.email_id });
      sent++;
    } catch (e) {
      failed++;
      await env.DB.prepare("UPDATE emails SET last_event = CASE WHEN last_event = 'scheduled' THEN 'failed' ELSE last_event END WHERE id = ?").bind(r.email_id).run();
      console.log(JSON.stringify({ level: "warn", scheduled_email: r.email_id, error: String(e).slice(0, 200) }));
    }
  }
  return { due: due.results.length, sent, failed };
}

export const emails = new Hono<AppEnv>();

// Resend-compatible: cancel an email that is still scheduled.
emails.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const accountId = c.get("principal").accountId;
  const del = await c.env.DB.prepare("DELETE FROM scheduled_emails WHERE email_id = ? AND account_id = ?").bind(id, accountId).run();
  if (!del.meta.changes) {
    const row = await c.env.DB.prepare("SELECT 1 FROM emails WHERE id = ? AND account_id = ?").bind(id, accountId).first();
    if (!row) throw errors.notFound("Email");
    throw new ApiError(422, "not_scheduled", "Only emails that are still scheduled can be cancelled.");
  }
  await c.env.DB.prepare("UPDATE emails SET last_event = 'canceled' WHERE id = ?").bind(id).run();
  return c.json({ object: "email", id });
});

emails.post("/", async (c) => {
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  return c.json(await sendOne(c.env, c.get("principal"), parsed.data, c.req.header("idempotency-key") ?? null));
});

emails.post("/batch", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = z.array(sendSchema).min(1).max(100).safeParse(raw);
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const total = parsed.data.reduce((n, b) => n + b.to.length + (b.cc?.length ?? 0) + (b.bcc?.length ?? 0), 0);
  const acc = await c.env.DB.prepare("SELECT plan FROM accounts WHERE id = ?").bind(c.get("principal").accountId).first<{ plan: string }>();
  await assertQuota(c.env.DB, c.get("principal").accountId, acc?.plan ?? "free", total);
  const idem = c.req.header("idempotency-key");
  const data: { id: string }[] = [];
  for (const [i, b] of parsed.data.entries()) data.push(await sendOne(c.env, c.get("principal"), b, idem ? `${idem}:${i}` : null));
  return c.json({ data });
});

emails.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM emails WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).first<Record<string, unknown>>();
  if (!row) throw errors.notFound("Email");
  return c.json(present(row));
});

emails.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 100);
  const before = c.req.query("before");
  const rows = await c.env.DB.prepare(
    `SELECT * FROM emails WHERE account_id = ? ${before ? "AND id < ?" : ""} ORDER BY id DESC LIMIT ?`,
  )
    .bind(...(before ? [c.get("principal").accountId, before, limit + 1] : [c.get("principal").accountId, limit + 1]))
    .all<Record<string, unknown>>();
  const has_more = rows.results.length > limit;
  return c.json({ object: "list", has_more, data: rows.results.slice(0, limit).map(present) });
});

function present(r: Record<string, unknown>) {
  const j = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : null);
  return {
    object: "email",
    id: r.id,
    from: r.from_addr,
    to: j(r.to_addrs),
    cc: j(r.cc_addrs),
    bcc: j(r.bcc_addrs),
    subject: r.subject,
    tags: j(r.tags),
    last_event: r.last_event,
    scheduled_at: r.scheduled_at ? new Date(r.scheduled_at as number).toISOString() : null,
    created_at: new Date(r.created_at as number).toISOString(),
  };
}
