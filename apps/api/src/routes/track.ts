// Public open-pixel and click-redirect endpoints (signed tokens; see lib/tracking.ts).
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { sha256Hex } from "../lib/crypto";
import { PIXEL, readTrackToken } from "../lib/tracking";
import { enqueueCustomerEvent } from "../lib/webhooks";

const RANK: Record<string, number> = { queued: 0, delayed: 1, held: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 6 };

// Security scanners (Microsoft Safe Links, Proofpoint, Mimecast, Barracuda…) and scripts fetch every
// link before the person does. Their hits are kept (flagged) but never count as engagement.
const SCANNER = /(bot|crawler|spider|scan|barracuda|proofpoint|mimecast|forcepoint|symantec|messagelabs|trend ?micro|fortinet|sophos|ironport|cisco|safelinks|python|curl|wget|go-http|okhttp|java\/|headless|phantom|slurp|preview|monitor|check)/i;
const SCAN_WINDOW_MS = 10_000; // nobody reads and clicks within 10 s of the send

/** 0 = person, 1 = scanner/bot, 2 = privacy proxy (Apple Mail Privacy Protection prefetch). */
export function classify(ua: string, msSinceSend: number, kind: "open" | "click"): 0 | 1 | 2 {
  if (!ua || SCANNER.test(ua)) return 1;
  if (kind === "click" && msSinceSend < SCAN_WINDOW_MS) return 1;
  if (kind === "open" && ua.trim() === "Mozilla/5.0") return 2; // Apple's proxy sends a bare UA
  return 0;
}

async function record(env: Env, emailId: string, type: "email.opened" | "email.clicked", eventId: string, data: Record<string, unknown>, ua: string) {
  const em = await env.DB.prepare("SELECT id, account_id, last_event, from_addr, to_addrs, subject, created_at FROM emails WHERE id = ?").bind(emailId).first<Record<string, string> & { created_at: number }>();
  if (!em) return;
  const machine = classify(ua, Date.now() - em.created_at, type === "email.opened" ? "open" : "click");
  // Machine hits get their own ids so the person's real open/click is still recorded later.
  const id = machine === 1 ? `m${eventId}` : eventId;
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO email_events (id, email_id, account_id, type, recipient, data, created_at, machine) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, em.id, em.account_id, type, JSON.parse(em.to_addrs!)[0] ?? null, JSON.stringify({ ...data, userAgent: ua.slice(0, 200) }), Date.now(), machine)
    .run();
  if (!ins.meta.changes || machine === 1) return; // already counted, or a scanner
  const next = type === "email.opened" ? "opened" : "clicked";
  if ((RANK[next] ?? 0) > (RANK[em.last_event!] ?? 0) && em.last_event !== "bounced" && em.last_event !== "complained") {
    await env.DB.prepare("UPDATE emails SET last_event = ? WHERE id = ?").bind(next, em.id).run();
  }
  await enqueueCustomerEvent(env, em.account_id!, type, { email_id: em.id, from: em.from_addr, to: JSON.parse(em.to_addrs!), subject: em.subject, ...data });
}

export const track = new Hono<AppEnv>();

track.get("/o/:token", async (c) => {
  const t = await readTrackToken(c.env, c.req.param("token").replace(/\.gif$/, ""));
  if (t) c.executionCtx.waitUntil(record(c.env, t.e, "email.opened", `open:${t.e}`, {}, c.req.header("user-agent") ?? ""));
  return new Response(PIXEL, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" } });
});

track.get("/c/:token", async (c) => {
  const t = await readTrackToken(c.env, c.req.param("token"));
  if (!t?.u || !/^https?:\/\//i.test(t.u)) return c.text("Link expired or invalid.", 404);
  const ua = c.req.header("user-agent") ?? "";
  // A click implies an open; one click event per link per email.
  c.executionCtx.waitUntil(
    (async () => {
      await record(c.env, t.e, "email.opened", `open:${t.e}`, {}, ua);
      await record(c.env, t.e, "email.clicked", `click:${t.e}:${(await sha256Hex(t.u!)).slice(0, 16)}`, { click: { link: t.u } }, ua);
    })(),
  );
  return c.redirect(t.u, 302);
});
