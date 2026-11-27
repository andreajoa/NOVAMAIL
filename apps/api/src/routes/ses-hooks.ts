// Amazon SES events (configuration set "novamail" → SNS topic → here). Every message is
// signature-checked against the SNS certificate and must come from our own topic.
// Bounces and complaints feed the suppression list and the reputation guard (auto-suspension).
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { sesRegion } from "../lib/ses";
import { verifySns, trustedSnsUrl, type SnsMessage } from "../lib/sns";
import { bumpUsage } from "../lib/usage";
import { enqueueCustomerEvent } from "../lib/webhooks";
import { guard } from "./postal-hooks";

interface SesEvent {
  eventType: string;
  mail: { messageId: string; destination?: string[]; tags?: Record<string, string[]>; commonHeaders?: { from?: string[]; subject?: string } };
  bounce?: { bounceType: string; bounceSubType?: string; bouncedRecipients: { emailAddress: string; diagnosticCode?: string; status?: string }[] };
  complaint?: { complainedRecipients: { emailAddress: string }[]; complaintFeedbackType?: string };
  delivery?: { recipients: string[] };
  deliveryDelay?: { delayType?: string; delayedRecipients: { emailAddress: string; diagnosticCode?: string }[] };
  reject?: { reason?: string };
  failure?: { errorMessage?: string };
}

// Opens/clicks are tracked by NovaMail itself (lib/tracking.ts), not by SES.
const LAST: Record<string, string> = { "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced", "email.complained": "complained" };
const RANK: Record<string, number> = { queued: 0, delayed: 1, held: 1, delivered: 2, opened: 3, clicked: 4, failed: 5, bounced: 5, complained: 6 };

interface Item { type: keyof typeof LAST; rcpt: string; extra: Record<string, unknown>; suppress?: "hard_bounce" | "complaint"; counter?: "bounced" | "complained" }

function itemsOf(e: SesEvent): Item[] {
  switch (e.eventType) {
    case "Delivery":
      return (e.delivery?.recipients ?? []).map((r) => ({ type: "email.delivered", rcpt: r, extra: {} }));
    case "DeliveryDelay":
      return (e.deliveryDelay?.delayedRecipients ?? []).map((r) => ({ type: "email.delivery_delayed", rcpt: r.emailAddress, extra: { details: r.diagnosticCode ?? e.deliveryDelay?.delayType ?? "" } }));
    case "Bounce": {
      const hard = e.bounce?.bounceType === "Permanent";
      return (e.bounce?.bouncedRecipients ?? []).map((r) => ({
        type: "email.bounced",
        rcpt: r.emailAddress,
        extra: { bounce: { type: hard ? "hard" : "soft", subtype: e.bounce?.bounceSubType ?? null, message: r.diagnosticCode ?? "" } },
        // Only permanent bounces suppress the address and count toward the bounce-rate guard.
        ...(hard ? { suppress: "hard_bounce" as const, counter: "bounced" as const } : {}),
      }));
    }
    case "Complaint":
      return (e.complaint?.complainedRecipients ?? []).map((r) => ({ type: "email.complained", rcpt: r.emailAddress, extra: { complaint: { type: e.complaint?.complaintFeedbackType ?? null } }, suppress: "complaint", counter: "complained" }));
    default:
      return [];
  }
}

export async function processSesEvent(env: Env, snsId: string, e: SesEvent, ctx: { waitUntil(p: Promise<unknown>): void }) {
  const emailId = e.mail.tags?.email?.[0];
  if (!emailId) return { ignored: "no email tag" };
  const em = await env.DB.prepare("SELECT id, account_id, from_addr, subject, last_event, postal_message_id FROM emails WHERE id = ?")
    .bind(emailId)
    .first<{ id: string; account_id: string; from_addr: string; subject: string; last_event: string; postal_message_id: string | null }>();
  // The SES MessageId must match what we stored: a tag alone cannot touch another account's email.
  if (!em || em.postal_message_id !== e.mail.messageId) return { ignored: "unknown email" };
  const now = Date.now();

  if (e.eventType === "Reject" || e.eventType === "RenderingFailure") {
    await env.DB.prepare("UPDATE emails SET last_event = 'failed' WHERE id = ? AND last_event IN ('queued','delayed')").bind(em.id).run();
    return { type: "failed" };
  }

  let last = em.last_event;
  const done: string[] = [];
  for (const it of itemsOf(e)) {
    const rcpt = it.rcpt.toLowerCase();
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO email_events (id, email_id, account_id, type, recipient, data, created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(`ses_${snsId}_${rcpt}`, em.id, em.account_id, it.type, rcpt, JSON.stringify(it.extra), now)
      .run();
    if (!ins.meta.changes) continue; // SNS redelivery
    const next = LAST[it.type]!;
    const stmts: D1PreparedStatement[] = [env.DB.prepare("UPDATE email_recipients SET status = ?, updated_at = ? WHERE email_id = ? AND address = ?").bind(next, now, em.id, rcpt)];
    if ((RANK[next] ?? 0) >= (RANK[last] ?? 0)) {
      stmts.push(env.DB.prepare("UPDATE emails SET last_event = ? WHERE id = ?").bind(next, em.id));
      last = next;
    }
    if (it.suppress) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (account_id, address, reason, created_at) VALUES (?,?,?,?)").bind(em.account_id, rcpt, it.suppress, now));
    if (it.counter) stmts.push(bumpUsage(env.DB, em.account_id, it.counter, 1, now));
    await env.DB.batch(stmts);
    if (it.counter) ctx.waitUntil(guard(env, em.account_id));
    ctx.waitUntil(enqueueCustomerEvent(env, em.account_id, it.type, { email_id: em.id, from: em.from_addr, to: [rcpt], subject: em.subject, ...it.extra }));
    done.push(it.type);
  }
  return { types: done };
}

export const sesHooks = new Hono<AppEnv>();

sesHooks.post("/", async (c) => {
  const m = (await c.req.json().catch(() => null)) as SnsMessage | null;
  const region = sesRegion(c.env);
  if (!m || !c.env.SES_SNS_TOPIC_ARN || m.TopicArn !== c.env.SES_SNS_TOPIC_ARN) return c.json({ error: "unknown topic" }, 403);
  if (!(await verifySns(m, region))) return c.json({ error: "invalid signature" }, 401);

  if (m.Type === "SubscriptionConfirmation") {
    if (!m.SubscribeURL || !trustedSnsUrl(m.SubscribeURL, region)) return c.json({ error: "untrusted subscribe url" }, 400);
    const r = await fetch(m.SubscribeURL);
    return c.json({ ok: r.ok, confirmed: r.ok });
  }
  if (m.Type !== "Notification") return c.json({ ok: true, ignored: m.Type });
  const e = JSON.parse(m.Message) as SesEvent;
  return c.json({ ok: true, ...(await processSesEvent(c.env, m.MessageId, e, c.executionCtx)) });
});
