// Resend-compatible email API: existing `resend` SDKs work by changing only the base URL.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { open, uuidv7 } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { postalSend, type PostalSendInput } from "../lib/postal";
import { assertQuota, bumpUsage } from "../lib/usage";

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
  postal_server_key: string | null;
}

export async function sendOne(env: Env, p: Principal, body: SendBody, idemKey: string | null, fetcher: typeof fetch = fetch): Promise<{ id: string }> {
  if (body.scheduled_at) throw errors.validation("`scheduled_at` is not available yet.");
  const all = [...body.to, ...(body.cc ?? []), ...(body.bcc ?? [])].map(bareAddress);
  for (const a of all) if (!EMAIL_RE.test(a)) throw errors.validation(`Invalid recipient address: ${a}`);
  const fromAddr = bareAddress(body.from);
  if (!EMAIL_RE.test(fromAddr)) throw errors.validation("Invalid `from` address.");

  if (idemKey) {
    const prev = await env.DB.prepare("SELECT id FROM emails WHERE account_id = ? AND idempotency_key = ?").bind(p.accountId, idemKey).first<{ id: string }>();
    if (prev) return { id: prev.id };
  }

  // Sender domain must be verified on this account (subdomains of a verified domain are allowed).
  const fromDomain = domainOf(body.from);
  const doms = await env.DB.prepare("SELECT id, name FROM domains WHERE account_id = ? AND status = 'verified'").bind(p.accountId).all<{ id: string; name: string }>();
  const dom = doms.results.find((d) => fromDomain === d.name || fromDomain.endsWith(`.${d.name}`));
  if (!dom) throw new ApiError(403, "invalid_from_address", `The domain ${fromDomain} is not verified. Add and verify it under /domains first.`);
  if (p.domainId && p.domainId !== dom.id) throw errors.forbidden("This API key can only send from its assigned domain.");

  // Drop suppressed recipients (hard bounces, complaints, unsubscribes).
  const placeholders = all.map(() => "?").join(",");
  const sup = await env.DB.prepare(`SELECT address FROM suppressions WHERE account_id = ? AND address IN (${placeholders})`).bind(p.accountId, ...all).all<{ address: string }>();
  const suppressed = new Set(sup.results.map((r) => r.address));
  const keep = (list?: string[]) => list?.filter((a) => !suppressed.has(bareAddress(a)));
  const to = keep(body.to) ?? [];
  const cc = keep(body.cc);
  const bcc = keep(body.bcc);
  const count = to.length + (cc?.length ?? 0) + (bcc?.length ?? 0);
  if (count === 0) throw new ApiError(422, "recipients_suppressed", "All recipients are on the suppression list.");

  const acc = await env.DB.prepare("SELECT id, plan, postal_server_key FROM accounts WHERE id = ?").bind(p.accountId).first<AccountRow>();
  if (!acc?.postal_server_key) throw new ApiError(503, "account_not_provisioned", "Sending is not provisioned for this account yet.");
  await assertQuota(env.DB, acc.id, acc.plan, count);

  const id = uuidv7();
  const input: PostalSendInput = {
    from: body.from,
    to,
    cc,
    bcc,
    subject: body.subject,
    html: body.html,
    text: body.text,
    replyTo: body.reply_to?.join(", "),
    tag: body.tags?.find((t) => t.name === "category")?.value,
    headers: { ...body.headers, "X-NovaMail-Id": id },
    attachments: body.attachments?.map((a) => ({ name: a.filename, content_type: a.content_type ?? "application/octet-stream", data: a.content })),
  };
  const res = await postalSend(env, await open(acc.postal_server_key, env.ENCRYPTION_KEY), input, fetcher);

  const now = Date.now();
  const stmts = [
    env.DB.prepare(
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

export const emails = new Hono<AppEnv>();

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
    created_at: new Date(r.created_at as number).toISOString(),
  };
}
