// Feedback-loop (ARF, RFC 5965) complaint reports from mailbox providers (Yahoo CFL,
// Microsoft JMRP, …). Postal receives them on the FBL route and POSTs the raw message here.
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { b64decode, verifyPostalSignature } from "../lib/crypto";
import { bumpUsage } from "../lib/usage";
import { enqueueCustomerEvent } from "../lib/webhooks";
import { guard } from "./postal-hooks";

export interface ArfReport {
  feedbackType: string | null;
  novamailId: string | null;
  recipient: string | null;
}

/** Extracts what we need from an ARF report without a full MIME parser. */
export function parseArf(raw: string): ArfReport {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const pick = (re: RegExp) => unfolded.match(re)?.[1]?.trim() ?? null;
  const rcpt = pick(/^Original-Rcpt-To:\s*<?([^>\s]+@[^>\s]+)>?/im) ?? pick(/^Removal-Recipient:\s*<?([^>\s]+@[^>\s]+)>?/im);
  return {
    feedbackType: pick(/^Feedback-Type:\s*([\w-]+)/im)?.toLowerCase() ?? null,
    novamailId: pick(/^X-NovaMail-Id:\s*([0-9a-f-]{36})/im),
    recipient: rcpt?.toLowerCase() ?? null,
  };
}

export async function processComplaint(env: Env, report: ArfReport, ctx: { waitUntil(p: Promise<unknown>): void }) {
  if (!report.novamailId || (report.feedbackType && !["abuse", "fraud", "virus"].includes(report.feedbackType))) return { ignored: true };
  const em = await env.DB.prepare("SELECT id, account_id, from_addr, subject, to_addrs FROM emails WHERE id = ?").bind(report.novamailId).first<{ id: string; account_id: string; from_addr: string; subject: string; to_addrs: string }>();
  if (!em) return { ignored: true };
  const rcpt = report.recipient ?? (JSON.parse(em.to_addrs) as string[])[0]!.toLowerCase();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE emails SET last_event = 'complained' WHERE id = ?").bind(em.id),
    env.DB.prepare("INSERT OR IGNORE INTO suppressions (account_id, address, reason, created_at) VALUES (?,?, 'complaint', ?)").bind(em.account_id, rcpt, now),
    env.DB.prepare("INSERT INTO email_events (id, email_id, account_id, type, recipient, data, created_at) VALUES (?,?,?, 'email.complained', ?, '{}', ?)").bind(`fbl_${em.id}_${now}`, em.id, em.account_id, rcpt, now),
    bumpUsage(env.DB, em.account_id, "complained", 1, now),
  ]);
  ctx.waitUntil(guard(env, em.account_id));
  ctx.waitUntil(enqueueCustomerEvent(env, em.account_id, "email.complained", { email_id: em.id, from: em.from_addr, to: [rcpt], subject: em.subject }));
  return { complaint: em.id };
}

export const fbl = new Hono<AppEnv>();

fbl.post("/", async (c) => {
  const body = await c.req.text();
  const sig = c.req.header("x-postal-signature-256") ?? "";
  if (!sig || !(await verifyPostalSignature(body, sig, c.env.POSTAL_WEBHOOK_PUBLIC_KEY))) return c.json({ error: "invalid signature" }, 401);
  const j = JSON.parse(body) as { message?: string; base64?: boolean };
  const raw = j.message ? (j.base64 ? new TextDecoder().decode(b64decode(j.message.replace(/\s+/g, ""))) : j.message) : "";
  return c.json({ ok: true, ...(await processComplaint(c.env, parseArf(raw), c.executionCtx)) });
});
