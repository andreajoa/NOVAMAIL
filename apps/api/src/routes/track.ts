// Public open-pixel and click-redirect endpoints (signed tokens; see lib/tracking.ts).
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { sha256Hex } from "../lib/crypto";
import { PIXEL, readTrackToken } from "../lib/tracking";
import { enqueueCustomerEvent } from "../lib/webhooks";

const RANK: Record<string, number> = { queued: 0, delayed: 1, held: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 6 };

async function record(env: Env, emailId: string, type: "email.opened" | "email.clicked", eventId: string, data: Record<string, unknown>) {
  const em = await env.DB.prepare("SELECT id, account_id, last_event, from_addr, to_addrs, subject FROM emails WHERE id = ?").bind(emailId).first<Record<string, string>>();
  if (!em) return;
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO email_events (id, email_id, account_id, type, recipient, data, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(eventId, em.id, em.account_id, type, JSON.parse(em.to_addrs!)[0] ?? null, JSON.stringify(data), Date.now())
    .run();
  if (!ins.meta.changes) return; // already counted
  const next = type === "email.opened" ? "opened" : "clicked";
  if ((RANK[next] ?? 0) > (RANK[em.last_event!] ?? 0) && em.last_event !== "bounced" && em.last_event !== "complained") {
    await env.DB.prepare("UPDATE emails SET last_event = ? WHERE id = ?").bind(next, em.id).run();
  }
  await enqueueCustomerEvent(env, em.account_id!, type, { email_id: em.id, from: em.from_addr, to: JSON.parse(em.to_addrs!), subject: em.subject, ...data });
}

export const track = new Hono<AppEnv>();

track.get("/o/:token", async (c) => {
  const t = await readTrackToken(c.env, c.req.param("token").replace(/\.gif$/, ""));
  if (t) c.executionCtx.waitUntil(record(c.env, t.e, "email.opened", `open:${t.e}`, {}));
  return new Response(PIXEL, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" } });
});

track.get("/c/:token", async (c) => {
  const t = await readTrackToken(c.env, c.req.param("token"));
  if (!t?.u || !/^https?:\/\//i.test(t.u)) return c.text("Link expired or invalid.", 404);
  const ua = c.req.header("user-agent") ?? "";
  // A click implies an open; one click event per link per email.
  c.executionCtx.waitUntil(
    (async () => {
      await record(c.env, t.e, "email.opened", `open:${t.e}`, {});
      await record(c.env, t.e, "email.clicked", `click:${t.e}:${(await sha256Hex(t.u!)).slice(0, 16)}`, { click: { link: t.u, userAgent: ua.slice(0, 200) } });
    })(),
  );
  return c.redirect(t.u, 302);
});
