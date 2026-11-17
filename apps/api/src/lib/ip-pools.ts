// IP reputation tiers. Each tier is a Postal IP pool; a pool that has no address yet falls
// back to "trusted" and then "brands" inside Postal, so nothing breaks before an IP exists.
//   brands  — André's own projects (main IP, unlimited)
//   trusted — paying customers
//   shared  — Free plan (isolated so abuse can't hurt payers or brands)
//   ded_<account> — a customer's dedicated IP (paid add-on)
import type { Env } from "../env";
import { planOf, type PlanId } from "./plans";
import { postalAdmin } from "./postal";
import { layout, sendSystemEmail } from "./system-mail";

export const DEDICATED_IP = { priceUsd: 29, priceUsdYear: 290, recommendedMonthly: 50_000 };

export const tierPool = (plan: PlanId) => (plan === "internal" ? "brands" : plan === "free" ? "shared" : "trusted");
export const dedicatedPoolName = (accountId: string) => `ded_${accountId.replace(/^acc_/, "").toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`.slice(0, 60);

/** Hourly cap while a fresh dedicated IP warms up (doubling roughly every 2 days, ~3 weeks). */
const WARMUP = [50, 100, 200, 400, 700, 1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 7_000, 10_000];
export function warmupCap(assignedAt: number, now = Date.now()) {
  const step = Math.floor((now - assignedAt) / (2 * 86_400_000));
  return step >= WARMUP.length ? null : WARMUP[step]!;
}

interface DedRow { status: string; pool: string | null; assigned_at: number | null }

/** The pool + hourly limit an account should have right now. */
export function effectiveSending(plan: PlanId, ded: DedRow | null, now = Date.now()) {
  const planHourly = planOf(plan).hourly || null;
  if (ded && ded.pool && (ded.status === "warming" || ded.status === "active")) {
    const cap = ded.status === "warming" && ded.assigned_at ? warmupCap(ded.assigned_at, now) : null;
    return { pool: ded.pool, hourly: cap && planHourly ? Math.min(cap, planHourly) : cap ?? planHourly, warming: cap !== null };
  }
  return { pool: tierPool(plan), hourly: planHourly, warming: false };
}

/** Pushes pool + hourly limit for one account to Postal and the DB. */
export async function syncSending(env: Env, accountId: string, now = Date.now()) {
  const a = await env.DB.prepare("SELECT plan, postal_org, postal_server FROM accounts WHERE id = ?").bind(accountId).first<{ plan: PlanId; postal_org: string | null; postal_server: string | null }>();
  if (!a) return null;
  const ded = await env.DB.prepare("SELECT status, pool, assigned_at FROM dedicated_ips WHERE account_id = ?").bind(accountId).first<DedRow>();
  const s = effectiveSending(a.plan, ded, now);
  if (a.postal_org && a.postal_server) await postalAdmin.setLimits(env, { org: a.postal_org, server: a.postal_server, hourly_limit: s.hourly, ip_pool: s.pool });
  await env.DB.prepare("UPDATE accounts SET ip_pool = ?, updated_at = ? WHERE id = ?").bind(s.pool, now, accountId).run();
  if (ded?.status === "warming" && !s.warming) await env.DB.prepare("UPDATE dedicated_ips SET status = 'active' WHERE account_id = ?").bind(accountId).run();
  return s;
}

/** Hourly cron step: advances warm-up caps and promotes finished IPs to active. */
export async function processWarmups(env: Env, now = Date.now()) {
  const r = await env.DB.prepare("SELECT account_id FROM dedicated_ips WHERE status = 'warming'").all<{ account_id: string }>();
  for (const x of r.results) await syncSending(env, x.account_id, now).catch((e) => console.log(JSON.stringify({ level: "error", warmup: x.account_id, error: String(e) })));
  return r.results.length;
}

/** E-mails the platform owner(s): the users of the NovaMail system account. */
export async function notifyOwner(env: Env, subject: string, html: string) {
  await env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (NULL, 'system', 'owner_notice', ?, ?)").bind(subject, Date.now()).run();
  if (!env.SYSTEM_ACCOUNT_ID) return;
  const owners = await env.DB.prepare("SELECT email FROM users WHERE account_id = ?").bind(env.SYSTEM_ACCOUNT_ID).all<{ email: string }>();
  for (const o of owners.results) await sendSystemEmail(env, o.email, { subject, html: layout({ preheader: subject, title: subject, body: html }), text: html.replace(/<[^>]+>/g, " ") }, "owner").catch(() => undefined);
}

/** Reacts to the add-on appearing/disappearing on a subscription. */
export async function applyDedicated(env: Env, accountId: string, wanted: boolean, email: string) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT status, pool, ip FROM dedicated_ips WHERE account_id = ?").bind(accountId).first<{ status: string; pool: string | null; ip: string | null }>();
  const live = row && row.status !== "released";
  if (wanted && !live) {
    await env.DB.prepare(
      `INSERT INTO dedicated_ips (account_id, status, requested_at) VALUES (?, 'requested', ?)
       ON CONFLICT(account_id) DO UPDATE SET status = 'requested', pool = NULL, ip = NULL, requested_at = excluded.requested_at, assigned_at = NULL, released_at = NULL`,
    ).bind(accountId, now).run();
    await notifyOwner(env, `Dedicated IP bought — ${email}`, `<p>Account <code>${accountId}</code> (${email}) bought a dedicated IP.</p><p>Run on your Mac:<br><code>bash ~/Projects/NOVAMAIL/scripts/ip-pool.sh ${dedicatedPoolName(accountId)} ${accountId}</code></p><p>It allocates the IP, sets reverse DNS, adds it to Postal and starts the warm-up automatically.</p>`);
  } else if (!wanted && live) {
    await env.DB.prepare("UPDATE dedicated_ips SET status = 'released', released_at = ? WHERE account_id = ?").bind(now, accountId).run();
    await syncSending(env, accountId, now);
    if (row.ip) await notifyOwner(env, `Dedicated IP cancelled — release ${row.ip}`, `<p>Account <code>${accountId}</code> (${email}) cancelled the dedicated IP. It already sends from the shared tier again.</p><p>Release the address to stop paying for it:<br><code>bash ~/Projects/NOVAMAIL/scripts/ip-pool.sh --release ${row.pool}</code></p>`);
  }
}
