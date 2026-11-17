// Reports: campaign deep-dive (funnel, click map, mailbox providers, devices, timeline, revenue)
// and an account overview with trends. Machine opens/clicks (scanners) never count; Apple Mail
// Privacy prefetches are shown separately so open rates stay honest.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { errors, zodMessage } from "../lib/http";

const DAY = 86_400_000;

const PROVIDERS: [RegExp, string][] = [
  [/^(gmail|googlemail)\./, "Gmail"],
  [/^(outlook|hotmail|live|msn|passport)\./, "Outlook"],
  [/^(yahoo|ymail|rocketmail|aol|aim)\./, "Yahoo/AOL"],
  [/^(icloud|me|mac)\.com$/, "iCloud"],
  [/^(proton(mail)?|pm)\./, "Proton"],
  [/^(gmx|web|t-online)\./, "GMX/Web.de"],
  [/^(uol|bol|terra|ig)\.com\.br$/, "UOL/Terra"],
];
export const providerOf = (email: string) => {
  const d = (email.split("@")[1] ?? "").toLowerCase();
  return PROVIDERS.find(([re]) => re.test(d))?.[1] ?? "Business & other";
};

export function deviceOf(ua: string): "mobile" | "desktop" | "webmail" | "unknown" {
  if (!ua) return "unknown";
  if (/GoogleImageProxy|YahooMailProxy/i.test(ua)) return "webmail";
  if (/iPhone|iPad|Android|Mobile/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|Linux|Outlook|Thunderbird/i.test(ua)) return "desktop";
  return "unknown";
}

const rate = (n: number, d: number) => (d ? n / d : 0);

export const reports = new Hono<AppEnv>();

reports.get("/broadcasts/:id", async (c) => {
  const p = c.get("principal");
  const b = await c.env.DB.prepare("SELECT id, name, subject, html, status, sent_count, skipped_count, started_at, finished_at, created_at, ab, resend_of FROM broadcasts WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<Record<string, any>>();
  if (!b) throw errors.notFound("Broadcast");
  const [recips, events, unsubs, orders] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT r.email, r.email_id, m.last_event FROM broadcast_recipients r LEFT JOIN emails m ON m.id = r.email_id WHERE r.broadcast_id = ?").bind(b.id),
    c.env.DB.prepare(
      `SELECT e.email_id, e.type, e.data, e.created_at, e.machine, e.recipient FROM email_events e JOIN broadcast_recipients r ON r.email_id = e.email_id
        WHERE r.broadcast_id = ? AND e.type IN ('email.delivered','email.opened','email.clicked','email.bounced','email.complained')`,
    ).bind(b.id),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT a.email) AS n FROM activities a JOIN broadcast_recipients r ON r.email = a.email AND r.broadcast_id = ?
        WHERE a.account_id = ? AND a.type = 'unsubscribed' AND a.created_at BETWEEN r.created_at AND r.created_at + ?`,
    ).bind(b.id, p.accountId, 14 * DAY),
    c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents, MAX(currency) AS currency FROM orders WHERE broadcast_id = ?").bind(b.id),
  ]);
  const rs = recips!.results as { email: string; email_id: string | null; last_event: string | null }[];
  const ev = events!.results as { email_id: string; type: string; data: string; created_at: number; machine: number; recipient: string | null }[];
  const byEmail = new Map(rs.map((r) => [r.email_id, r.email]));
  const sets = { delivered: new Set<string>(), opened: new Set<string>(), mpp: new Set<string>(), clicked: new Set<string>(), bounced: new Set<string>(), complained: new Set<string>() };
  let botClicks = 0;
  const links = new Map<string, { unique: Set<string>; total: number }>();
  const devices: Record<string, number> = { mobile: 0, desktop: 0, webmail: 0, unknown: 0 };
  const start = b.started_at ?? b.created_at;
  const timeline = Array.from({ length: 48 }, (_, h) => ({ hour: h, opens: 0, clicks: 0 }));
  for (const e of ev) {
    const who = byEmail.get(e.email_id) ?? e.recipient ?? e.email_id;
    let d: any = {};
    try { d = JSON.parse(e.data); } catch { /* */ }
    if (e.type === "email.delivered") sets.delivered.add(who);
    else if (e.type === "email.bounced") sets.bounced.add(who);
    else if (e.type === "email.complained") sets.complained.add(who);
    else if (e.machine === 1) { if (e.type === "email.clicked") botClicks++; }
    else if (e.type === "email.opened") {
      if (e.machine === 2) sets.mpp.add(who);
      else if (!sets.opened.has(who)) devices[deviceOf(d.userAgent ?? "")]!++;
      sets.opened.add(who);
      const h = Math.floor((e.created_at - start) / 3_600_000);
      if (h >= 0 && h < 48) timeline[h]!.opens++;
    } else if (e.type === "email.clicked") {
      sets.clicked.add(who);
      const url = d.click?.link ?? "";
      const l = links.get(url) ?? { unique: new Set(), total: 0 };
      l.unique.add(who); l.total++; links.set(url, l);
      const h = Math.floor((e.created_at - start) / 3_600_000);
      if (h >= 0 && h < 48) timeline[h]!.clicks++;
    }
  }
  const sent = rs.filter((r) => r.email_id).length;
  // Delivery webhooks may lag; anything not bounced counts as delivered once accepted.
  const delivered = Math.max(sets.delivered.size, sent - sets.bounced.size);
  const humanOpens = [...sets.opened].filter((x) => !sets.mpp.has(x) || sets.clicked.has(x)).length;
  const prov = new Map<string, { sent: number; opened: number; clicked: number; bounced: number }>();
  for (const r of rs) {
    if (!r.email_id) continue;
    const k = providerOf(r.email);
    const x = prov.get(k) ?? { sent: 0, opened: 0, clicked: 0, bounced: 0 };
    x.sent++;
    if (sets.opened.has(r.email)) x.opened++;
    if (sets.clicked.has(r.email)) x.clicked++;
    if (sets.bounced.has(r.email)) x.bounced++;
    prov.set(k, x);
  }
  const o = (orders!.results as any[])[0] ?? { n: 0, cents: 0, currency: null };
  const u = ((unsubs!.results as any[])[0]?.n ?? 0) as number;
  return c.json({
    object: "broadcast_report",
    broadcast: { id: b.id, name: b.name, subject: b.subject, status: b.status, started_at: b.started_at, finished_at: b.finished_at, ab: b.ab ? JSON.parse(b.ab) : null, resend_of: b.resend_of },
    html: b.html,
    totals: {
      sent, delivered, bounced: sets.bounced.size, complained: sets.complained.size, unsubscribed: u,
      opened: sets.opened.size, opened_human_estimate: humanOpens, privacy_opens: sets.mpp.size, clicked: sets.clicked.size, bot_clicks_filtered: botClicks,
      delivery_rate: rate(delivered, sent), open_rate: rate(sets.opened.size, delivered), human_open_rate: rate(humanOpens, delivered), click_rate: rate(sets.clicked.size, delivered),
      click_to_open_rate: rate(sets.clicked.size, sets.opened.size), unsubscribe_rate: rate(u, delivered), complaint_rate: rate(sets.complained.size, delivered),
      orders: o.n, revenue_cents: o.cents, currency: o.currency, revenue_per_recipient_cents: sent ? Math.round(o.cents / sent) : 0,
    },
    links: [...links].map(([url, l]) => ({ url, unique_clicks: l.unique.size, total_clicks: l.total, share: rate(l.unique.size, sets.clicked.size) })).sort((a, b) => b.unique_clicks - a.unique_clicks),
    providers: [...prov].map(([name, x]) => ({ name, ...x, open_rate: rate(x.opened, x.sent - x.bounced), click_rate: rate(x.clicked, x.sent - x.bounced), bounce_rate: rate(x.bounced, x.sent) })).sort((a, b) => b.sent - a.sent),
    devices,
    timeline,
  });
});

reports.get("/overview", async (c) => {
  const p = c.get("principal");
  const q = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).safeParse(c.req.query());
  if (!q.success) throw errors.validation(zodMessage(q.error));
  const since = Date.now() - q.data.days * DAY;
  const day = (col: string) => `strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch')`;
  const [sent, eng, growth, unsub, camps, rev] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${day("created_at")} AS d, COUNT(*) AS n FROM emails WHERE account_id = ? AND created_at > ? GROUP BY d`).bind(p.accountId, since),
    c.env.DB.prepare(`SELECT ${day("created_at")} AS d, SUM(type = 'email.opened') AS opens, SUM(type = 'email.clicked') AS clicks FROM email_events WHERE account_id = ? AND created_at > ? AND machine != 1 AND type IN ('email.opened','email.clicked') GROUP BY d`).bind(p.accountId, since),
    c.env.DB.prepare(`SELECT ${day("MIN(created_at)")} AS d, 1 AS n FROM contacts WHERE account_id = ? GROUP BY email HAVING MIN(created_at) > ?`).bind(p.accountId, since),
    c.env.DB.prepare(`SELECT ${day("created_at")} AS d, COUNT(DISTINCT email) AS n FROM activities WHERE account_id = ? AND type = 'unsubscribed' AND created_at > ? GROUP BY d`).bind(p.accountId, since),
    c.env.DB.prepare(
      `SELECT b.id, b.subject, b.finished_at, b.started_at, COUNT(DISTINCT r.email) AS sent,
              COUNT(DISTINCT CASE WHEN e.type = 'email.opened' THEN r.email END) AS opened,
              COUNT(DISTINCT CASE WHEN e.type = 'email.clicked' THEN r.email END) AS clicked
         FROM broadcasts b JOIN broadcast_recipients r ON r.broadcast_id = b.id
         LEFT JOIN email_events e ON e.email_id = r.email_id AND e.machine != 1 AND e.type IN ('email.opened','email.clicked')
        WHERE b.account_id = ? AND COALESCE(b.started_at, b.created_at) > ? GROUP BY b.id ORDER BY b.started_at DESC LIMIT 20`,
    ).bind(p.accountId, since),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS n, COALESCE(SUM(CASE WHEN email_id IS NOT NULL THEN amount_cents END), 0) AS attributed, MAX(currency) AS currency FROM orders WHERE account_id = ? AND created_at > ?`).bind(p.accountId, since),
  ]);
  const days: string[] = [];
  for (let t = since; t <= Date.now(); t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  const pick = (rows: any[], k = "n") => { const m = new Map(rows.map((r) => [r.d, Number(r[k] ?? 0)])); return days.map((d) => m.get(d) ?? 0); };
  const gRows = growth!.results as any[];
  const gm = new Map<string, number>();
  for (const r of gRows) gm.set(r.d, (gm.get(r.d) ?? 0) + 1);
  const campaigns = (camps!.results as any[]).map((x) => ({ ...x, open_rate: rate(x.opened, x.sent), click_rate: rate(x.clicked, x.sent) }));
  const avg = (k: "open_rate" | "click_rate") => (campaigns.length ? campaigns.reduce((s, x) => s + x[k], 0) / campaigns.length : 0);
  const r = (rev!.results as any[])[0];
  return c.json({
    object: "overview", days,
    series: { sent: pick(sent!.results as any[]), opens: pick(eng!.results as any[], "opens"), clicks: pick(eng!.results as any[], "clicks"), new_contacts: days.map((d) => gm.get(d) ?? 0), unsubscribes: pick(unsub!.results as any[]) },
    campaigns, averages: { open_rate: avg("open_rate"), click_rate: avg("click_rate") },
    revenue: { total_cents: r.cents, attributed_cents: r.attributed, orders: r.n, currency: r.currency },
  });
});
