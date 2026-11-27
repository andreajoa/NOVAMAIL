import { isUnlimited, limitsOf } from "./plans";
import { errors } from "./http";

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const utcMonthStart = (t = Date.now()) => `${new Date(t).toISOString().slice(0, 7)}-01`;

export async function usageSnapshot(db: D1Database, accountId: string, now = Date.now()) {
  const r = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN day = ?2 THEN sent END),0) AS today,
              COALESCE(SUM(sent),0) AS month
         FROM usage_daily WHERE account_id = ?1 AND day >= ?3`,
    )
    .bind(accountId, utcDay(now), utcMonthStart(now))
    .first<{ today: number; month: number }>();
  return { today: r?.today ?? 0, month: r?.month ?? 0 };
}

/** Throws 429 if sending `n` more emails would exceed the plan. */
export async function assertQuota(db: D1Database, accountId: string, plan: string, n: number, now = Date.now()) {
  const packs = (await db.prepare("SELECT extra_packs FROM accounts WHERE id = ?").bind(accountId).first<{ extra_packs: number }>())?.extra_packs ?? 0;
  const p = limitsOf(plan, packs);
  const u = await usageSnapshot(db, accountId, now);
  if (isUnlimited(p)) return { ...u, plan: p };
  if (!p.canSend) throw errors.quota("Choose a plan to start sending. Plans start at $12/month for 10,000 emails: /plan");
  if (u.today + n > p.daily) throw errors.quota(`Daily limit of ${p.daily} emails reached on the ${p.label} plan. Upgrade at ${"/billing"} or wait until 00:00 UTC.`);
  if (u.month + n > p.monthly) throw errors.quota(`Monthly limit of ${p.monthly} emails reached on the ${p.label} plan. Upgrade to keep sending.`);
  return { ...u, plan: p };
}

export function bumpUsage(db: D1Database, accountId: string, field: "sent" | "bounced" | "complained", n = 1, now = Date.now()) {
  return db
    .prepare(`INSERT INTO usage_daily (account_id, day, ${field}) VALUES (?1, ?2, ?3)
              ON CONFLICT(account_id, day) DO UPDATE SET ${field} = ${field} + ?3`)
    .bind(accountId, utcDay(now), n);
}

// Reputation guard: thresholds follow Gmail/Yahoo bulk-sender rules (spam < 0.3%).
export const GUARD = { minVolume: 200, maxBounceRate: 0.05, maxComplaintRate: 0.003, windowDays: 7 };

export async function reputation(db: D1Database, accountId: string, now = Date.now()) {
  const since = utcDay(now - GUARD.windowDays * 86_400_000);
  const r = await db
    .prepare("SELECT COALESCE(SUM(sent),0) s, COALESCE(SUM(bounced),0) b, COALESCE(SUM(complained),0) c FROM usage_daily WHERE account_id = ? AND day >= ?")
    .bind(accountId, since)
    .first<{ s: number; b: number; c: number }>();
  const s = r?.s ?? 0;
  const bounceRate = s ? (r!.b / s) : 0;
  const complaintRate = s ? (r!.c / s) : 0;
  const breach =
    s >= GUARD.minVolume && bounceRate > GUARD.maxBounceRate ? `bounce rate ${(bounceRate * 100).toFixed(1)}% over ${GUARD.windowDays} days`
    : s >= GUARD.minVolume && complaintRate > GUARD.maxComplaintRate ? `spam complaint rate ${(complaintRate * 100).toFixed(2)}% over ${GUARD.windowDays} days`
    : null;
  return { sent: s, bounceRate, complaintRate, breach };
}
