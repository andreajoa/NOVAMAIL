// Ingests signed webhooks from Postal, updates email state, enforces reputation
// guards and fans events out to customer webhooks (Standard Webhooks format).
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { verifyPostalSignature } from "../lib/crypto";
import { postalAdmin } from "../lib/postal";
import { bumpUsage, reputation } from "../lib/usage";
import { enqueueCustomerEvent } from "../lib/webhooks";

interface PostalMessage {
  id: number;
  to: string;
  from: string;
  subject: string;
  tag?: string | null;
}

interface PostalWebhook {
  event: string;
  timestamp: number;
  uuid: string;
  payload: {
    message?: PostalMessage;
    original_message?: PostalMessage;
    status?: string;
    details?: string;
    output?: string;
    url?: string;
    ip_address?: string;
    user_agent?: string;
    domain?: { name: string };
  };
}

/** Postal event -> NovaMail (Resend-compatible) event type. */
export function mapEvent(e: PostalWebhook): string | null {
  switch (e.event) {
    case "MessageSent": return "email.delivered";
    case "MessageDelayed": return "email.delivery_delayed";
    case "MessageDeliveryFailed": return "email.bounced"; // permanent failure from the receiving MX
    case "MessageBounced": return "email.bounced";
    case "MessageHeld": return "email.held";
    case "MessageLoaded": return "email.opened";
    case "MessageLinkClicked": return "email.clicked";
    default: return null;
  }
}

const LAST_EVENT: Record<string, string> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.held": "held",
  "email.opened": "opened",
  "email.clicked": "clicked",
};
// Opens/clicks must not overwrite a terminal state like "bounced".
const RANK: Record<string, number> = { queued: 0, delayed: 1, held: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 6 };

export async function processPostalEvent(env: Env, accountId: string, e: PostalWebhook, ctx: { waitUntil(p: Promise<unknown>): void }) {
  const type = mapEvent(e);
  if (!type) return { ignored: e.event };
  const msg = e.payload.original_message ?? e.payload.message;
  if (!msg) return { ignored: "no message" };

  const rcpt = await env.DB.prepare(
    `SELECT r.email_id, r.address, em.last_event FROM email_recipients r JOIN emails em ON em.id = r.email_id
      WHERE em.account_id = ? AND r.postal_id = ?`,
  ).bind(accountId, msg.id).first<{ email_id: string; address: string; last_event: string }>();

  // Dedupe on Postal's uuid: Postal retries webhooks.
  const now = Date.now();
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO email_events (id, email_id, account_id, type, recipient, data, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(e.uuid, rcpt?.email_id ?? null, accountId, type, rcpt?.address ?? msg.to, JSON.stringify(e.payload), now)
    .run();
  if (!ins.meta.changes) return { duplicate: true };

  const stmts: D1PreparedStatement[] = [];
  const next = LAST_EVENT[type]!;
  if (rcpt) {
    stmts.push(env.DB.prepare("UPDATE email_recipients SET status = ?, updated_at = ? WHERE email_id = ? AND address = ?").bind(next, now, rcpt.email_id, rcpt.address));
    if ((RANK[next] ?? 0) >= (RANK[rcpt.last_event] ?? 0)) stmts.push(env.DB.prepare("UPDATE emails SET last_event = ? WHERE id = ?").bind(next, rcpt.email_id));
  }
  if (type === "email.bounced") {
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (account_id, address, reason, created_at) VALUES (?,?, 'hard_bounce', ?)").bind(accountId, (rcpt?.address ?? msg.to).toLowerCase(), now));
    stmts.push(bumpUsage(env.DB, accountId, "bounced", 1, now));
  }
  if (stmts.length) await env.DB.batch(stmts);

  if (type === "email.bounced") ctx.waitUntil(guard(env, accountId));

  ctx.waitUntil(
    enqueueCustomerEvent(env, accountId, type, {
      email_id: rcpt?.email_id ?? null,
      from: msg.from,
      to: [rcpt?.address ?? msg.to],
      subject: msg.subject,
      ...(type === "email.clicked" ? { click: { link: e.payload.url, ipAddress: e.payload.ip_address, userAgent: e.payload.user_agent } } : {}),
      ...(type === "email.bounced" ? { bounce: { message: e.payload.details ?? e.payload.output ?? "" } } : {}),
    }),
  );
  return { type };
}

/** Suspends the account in NovaMail and Postal when bounce/complaint rates breach the guard. */
export async function guard(env: Env, accountId: string) {
  const rep = await reputation(env.DB, accountId);
  if (!rep.breach) return;
  const a = await env.DB.prepare("SELECT status, postal_org, plan FROM accounts WHERE id = ?").bind(accountId).first<{ status: string; postal_org: string | null; plan: string }>();
  if (!a || a.status !== "active" || a.plan === "internal") return;
  const reason = `Automatic suspension: ${rep.breach}`;
  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET status = 'suspended', suspended_reason = ?, updated_at = ? WHERE id = ?").bind(reason, Date.now(), accountId),
    env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, 'system', 'suspend', ?, ?)").bind(accountId, reason, Date.now()),
  ]);
  if (a.postal_org) await postalAdmin.suspend(env, { org: a.postal_org, reason });
}

export const postalHooks = new Hono<AppEnv>();

postalHooks.post("/:accountId", async (c) => {
  const body = await c.req.text();
  const sig = c.req.header("x-postal-signature-256") ?? "";
  if (!sig || !(await verifyPostalSignature(body, sig, c.env.POSTAL_WEBHOOK_PUBLIC_KEY))) {
    return c.json({ error: "invalid signature" }, 401);
  }
  const e = JSON.parse(body) as PostalWebhook;
  const r = await processPostalEvent(c.env, c.req.param("accountId"), e, c.executionCtx);
  return c.json({ ok: true, ...r });
});
