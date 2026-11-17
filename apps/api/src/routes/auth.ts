// Passwordless dashboard login: 6-digit code by e-mail (sent through NovaMail itself),
// then an HttpOnly session cookie. New e-mails get a Free account automatically.
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { createAccount } from "../lib/accounts";
import { prefixedId, randomToken, safeEqual, sha256Hex } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { loginCodeEmail, sendSystemEmail } from "../lib/system-mail";
import { onSignup } from "../lib/lifecycle";

export const SESSION_COOKIE = "nm_session";
const CODE_TTL = 10 * 60_000;
const SESSION_TTL = 30 * 86_400_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW = 15 * 60_000;

// Throwaway-inbox providers rejected at signup (abuse control for the free tier).
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com"]);

const codeHash = (env: Env, email: string, code: string) => sha256Hex(`${env.ENCRYPTION_KEY}:login:${email}:${code}`);

export function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return n.toString().padStart(6, "0");
}

export const auth = new Hono<AppEnv>();

const emailSchema = z.object({ email: z.email().transform((e) => e.trim().toLowerCase()) });

auth.post("/start", async (c) => {
  const parsed = emailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation("Informe um e-mail válido.");
  const email = parsed.data.email;
  if (DISPOSABLE.has(email.split("@")[1]!)) throw errors.validation("Use um e-mail permanente (provedores temporários não são aceitos).");

  const now = Date.now();
  const prev = await c.env.DB.prepare("SELECT sent_count, window_at FROM login_codes WHERE email = ?").bind(email).first<{ sent_count: number; window_at: number }>();
  const inWindow = prev && now - prev.window_at < SEND_WINDOW;
  if (inWindow && prev.sent_count >= MAX_SENDS_PER_WINDOW) throw errors.quota("Muitos códigos pedidos. Tente de novo em alguns minutos.");

  const code = newCode();
  await c.env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, sent_count, window_at) VALUES (?1, ?2, ?3, 0, 1, ?4)
     ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0,
       sent_count = CASE WHEN ?4 - window_at < ?5 THEN sent_count + 1 ELSE 1 END,
       window_at  = CASE WHEN ?4 - window_at < ?5 THEN window_at ELSE ?4 END`,
  )
    .bind(email, await codeHash(c.env, email, code), now + CODE_TTL, now, SEND_WINDOW)
    .run();
  await sendSystemEmail(c.env, email, loginCodeEmail(code), "login");
  return c.json({ sent: true, expires_in: CODE_TTL / 1000 });
});

auth.post("/verify", async (c) => {
  const parsed = emailSchema.extend({ code: z.string().regex(/^\d{3}\s?\d{3}$/) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const email = parsed.data.email;
  const code = parsed.data.code.replace(/\s/g, "");
  const now = Date.now();

  const row = await c.env.DB.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?").bind(email).first<{ code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at < now) throw new ApiError(401, "code_expired", "Código expirado. Peça um novo.");
  if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "too_many_attempts", "Muitas tentativas. Peça um novo código.");
  if (!safeEqual(row.code_hash, await codeHash(c.env, email, code))) {
    await c.env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    throw new ApiError(401, "invalid_code", "Código incorreto.");
  }
  await c.env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();

  let user = await c.env.DB.prepare("SELECT id, account_id FROM users WHERE email = ?").bind(email).first<{ id: string; account_id: string }>();
  let created: Awaited<ReturnType<typeof createAccount>> | null = null;
  if (!user) {
    created = await createAccount(c.env, { name: email.split("@")[1]!, email, plan: "free", actor: "signup" });
    const id = prefixedId("usr");
    await c.env.DB.prepare("INSERT INTO users (id, email, account_id, role, created_at) VALUES (?,?,?, 'owner', ?)").bind(id, email, created.id, now).run();
    user = { id, account_id: created.id };
    // Welcome email now + NovaMail's own free→paid nurture funnel.
    c.executionCtx.waitUntil(onSignup(c.env, email));
  }

  const token = randomToken(32);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)")
      .bind(await sha256Hex(token), user.id, now, now + SESSION_TTL, (c.req.header("user-agent") ?? "").slice(0, 200)),
    c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now, user.id),
  ]);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_TTL / 1000 });
  // A brand-new account sees its first API key and SMTP password exactly once.
  return c.json({ ok: true, new_account: !!created, ...(created ? { api_key: created.api_key, smtp: created.smtp } : {}) });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/** Resolves a dashboard session cookie to a principal (null when absent/expired). */
export async function sessionPrincipal(env: Env, token: string | undefined) {
  if (!token) return null;
  const r = await env.DB.prepare(
    `SELECT s.user_id, u.account_id, u.email, a.status, a.suspended_reason
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN accounts a ON a.id = u.account_id
      WHERE s.id_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<{ user_id: string; account_id: string; email: string; status: string; suspended_reason: string | null }>();
  return r;
}
