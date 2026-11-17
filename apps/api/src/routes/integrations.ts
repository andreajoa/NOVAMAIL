// Zapier / Make / n8n: REST Hook subscriptions (subscribe → we POST events to the hook URL,
// unsubscribe → we stop), auth test and sample payloads for each trigger.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { b64encode, prefixedId } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { EVENTS, SAMPLES, type EventType } from "../lib/events";

export const integrations = new Hono<AppEnv>();

/** Connection test used by Zapier/Make when the API key is entered. */
integrations.get("/me", async (c) => {
  const p = c.get("principal");
  const a = await c.env.DB.prepare("SELECT id, name, plan FROM accounts WHERE id = ?").bind(p.accountId).first<{ id: string; name: string; plan: string }>();
  return c.json({ id: a?.id, name: a?.name, plan: a?.plan, label: `NovaMail · ${a?.name}` });
});

integrations.get("/events", (c) => c.json({ object: "list", data: EVENTS.map((e) => ({ event: e, sample: SAMPLES[e] })) }));

integrations.get("/samples/:event", (c) => {
  const e = c.req.param("event") as EventType;
  if (!EVENTS.includes(e)) throw errors.notFound("Event");
  return c.json([{ id: `sample_${e}`, ...SAMPLES[e] }]);
});

integrations.post("/subscriptions", async (c) => {
  const p = c.get("principal");
  const b = z.object({ target_url: z.url({ protocol: /^https$/ }).max(2000), event: z.enum(EVENTS), source: z.enum(["zapier", "make", "n8n", "other"]).default("other") }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM webhooks WHERE account_id = ?").bind(p.accountId).first<{ n: number }>();
  if ((n?.n ?? 0) >= 100) throw errors.quota("Webhook limit reached (100).");
  const id = prefixedId("wh");
  await c.env.DB.prepare("INSERT INTO webhooks (id, account_id, url, secret, events, created_at) VALUES (?,?,?,?,?,?)")
    .bind(id, p.accountId, b.data.target_url, `whsec_${b64encode(crypto.getRandomValues(new Uint8Array(32)))}`, JSON.stringify([b.data.event]), Date.now()).run();
  return c.json({ id, event: b.data.event, target_url: b.data.target_url }, 201);
});

integrations.delete("/subscriptions/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM webhooks WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  return c.json({ deleted: true });
});
