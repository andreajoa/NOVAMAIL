// Customer-facing webhooks, signed per https://www.standardwebhooks.com
// (headers webhook-id / webhook-timestamp / webhook-signature; Svix-compatible).
import type { Env, WebhookJob } from "../env";
import { standardWebhookSignature, uuidv7 } from "./crypto";

export const MAX_ATTEMPTS = 8; // ~ 1m, 2m, 4m ... up to ~2h between tries

export async function enqueueCustomerEvent(env: Env, accountId: string, type: string, data: Record<string, unknown>) {
  const hooks = await env.DB.prepare("SELECT id, events FROM webhooks WHERE account_id = ? AND enabled = 1").bind(accountId).all<{ id: string; events: string }>();
  const msgId = `msg_${uuidv7()}`;
  const body = JSON.stringify({ type, created_at: new Date().toISOString(), data });
  for (const h of hooks.results) {
    const events = JSON.parse(h.events) as string[];
    if (!events.includes("*") && !events.includes(type)) continue;
    const job: WebhookJob = { webhookId: h.id, msgId, body, attempt: 1 };
    if (env.WEBHOOK_QUEUE) await env.WEBHOOK_QUEUE.send(job);
    else await deliver(env, job);
  }
}

/** Returns true when the endpoint accepted the event (2xx). */
export async function deliver(env: Env, job: WebhookJob, fetcher: typeof fetch = fetch): Promise<boolean> {
  const h = await env.DB.prepare("SELECT url, secret, enabled FROM webhooks WHERE id = ?").bind(job.webhookId).first<{ url: string; secret: string; enabled: number }>();
  if (!h || !h.enabled) return true; // nothing to retry
  const ts = Math.floor(Date.now() / 1000);
  try {
    const res = await fetcher(h.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "NovaMail-Webhooks/1.0",
        "webhook-id": job.msgId,
        "webhook-timestamp": String(ts),
        "webhook-signature": await standardWebhookSignature(h.secret, job.msgId, ts, job.body),
      },
      body: job.body,
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch (e) {
    console.log(JSON.stringify({ level: "warn", webhook: job.webhookId, error: String(e).slice(0, 200) }));
    return false;
  }
}

export async function handleQueue(batch: MessageBatch<WebhookJob>, env: Env) {
  for (const m of batch.messages) {
    const ok = await deliver(env, m.body);
    if (!ok && m.body.attempt < MAX_ATTEMPTS && env.WEBHOOK_QUEUE) {
      // Re-enqueue with attempt+1 (retry() would keep the same body/attempt).
      await env.WEBHOOK_QUEUE.send({ ...m.body, attempt: m.body.attempt + 1 }, { delaySeconds: Math.min(60 * 2 ** (m.body.attempt - 1), 7_200) });
    }
    m.ack();
  }
}
