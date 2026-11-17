// Team members, invitations and workspace switching (dashboard sessions).
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Role } from "../env";
import { prefixedId, randomToken, sha256Hex } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { layout, sendSystemEmail } from "../lib/system-mail";

const INVITE_TTL = 7 * 86_400_000;
const ROLES = ["owner", "admin", "editor", "viewer"] as const;
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const team = new Hono<AppEnv>();

function sessionOnly(p: { userId?: string; role?: Role }) {
  if (!p.userId || !p.role) throw errors.forbidden("Team management is only available in the dashboard.");
  return { userId: p.userId, role: p.role };
}

team.get("/", async (c) => {
  const p = c.get("principal");
  const [members, invites] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT u.id, u.email, m.role, m.created_at, u.last_login_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? ORDER BY m.created_at").bind(p.accountId),
    c.env.DB.prepare("SELECT id, email, role, created_at, expires_at FROM invites WHERE account_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC").bind(p.accountId, Date.now()),
  ]);
  return c.json({ object: "team", you: p.userId ?? null, role: p.role ?? null, members: members!.results, invites: invites!.results });
});

team.post("/invites", async (c) => {
  const p = c.get("principal");
  const me = sessionOnly(p);
  const b = z.object({ email: z.email().transform((e) => e.trim().toLowerCase()), role: z.enum(ROLES).default("editor") }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (RANK[b.data.role] > RANK[me.role]) throw errors.forbidden("You can't invite someone with a higher role than yours.");
  const already = await c.env.DB.prepare("SELECT 1 AS x FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? AND u.email = ?").bind(p.accountId, b.data.email).first();
  if (already) throw errors.conflict("This person is already on the team.");
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM invites WHERE account_id = ? AND created_at > ?").bind(p.accountId, Date.now() - 86_400_000).first<{ n: number }>();
  if ((count?.n ?? 0) >= 20) throw errors.quota("Invite limit reached for today.");
  const token = randomToken(24);
  const now = Date.now();
  const id = prefixedId("inv");
  await c.env.DB.prepare("INSERT INTO invites (id, account_id, email, role, token_hash, invited_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.data.email, b.data.role, await sha256Hex(token), me.userId, now, now + INVITE_TTL).run();
  const [acc, inviter] = await Promise.all([
    c.env.DB.prepare("SELECT name FROM accounts WHERE id = ?").bind(p.accountId).first<{ name: string }>(),
    c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(me.userId).first<{ email: string }>(),
  ]);
  const link = `${c.env.APP_URL ?? c.env.PUBLIC_URL}/login?invite=${token}`;
  const ws = (acc?.name ?? "a workspace").replace(/[<>&"]/g, "");
  await sendSystemEmail(c.env, b.data.email, {
    subject: `${inviter?.email ?? "Someone"} invited you to ${ws} on NovaMail`,
    html: layout({ preheader: `Join ${ws} as ${b.data.role}`, title: "You're invited", body: `<p><b>${(inviter?.email ?? "A teammate").replace(/[<>&"]/g, "")}</b> invited you to the <b>${ws}</b> workspace as <b>${b.data.role}</b>.</p><p style="margin:24px 0"><a href="${link}" style="background:#09090b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Accept invitation</a></p><p style="color:#71717a;font-size:13px">The link expires in 7 days. Sign in with this email address (${b.data.email}).</p>` }),
    text: `You were invited to ${ws} on NovaMail as ${b.data.role}. Accept: ${link}`,
  }, "invite");
  return c.json({ object: "invite", id, email: b.data.email, role: b.data.role }, 201);
});

team.delete("/invites/:id", async (c) => {
  sessionOnly(c.get("principal"));
  await c.env.DB.prepare("DELETE FROM invites WHERE id = ? AND account_id = ? AND accepted_at IS NULL").bind(c.req.param("id"), c.get("principal").accountId).run();
  return c.json({ deleted: true });
});

/** An existing user accepts an invite (must be signed in with the invited address). */
team.post("/invites/accept", async (c) => {
  const p = c.get("principal");
  const me = sessionOnly(p);
  const b = z.object({ token: z.string().min(10).max(100) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const inv = await c.env.DB.prepare("SELECT id, account_id, email, role, expires_at, accepted_at FROM invites WHERE token_hash = ?").bind(await sha256Hex(b.data.token)).first<{ id: string; account_id: string; email: string; role: Role; expires_at: number; accepted_at: number | null }>();
  if (!inv || inv.expires_at < Date.now()) throw errors.notFound("Invite");
  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(me.userId).first<{ email: string }>();
  if (user?.email !== inv.email) throw errors.forbidden(`This invite is for ${inv.email}. Sign in with that address.`);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO memberships (user_id, account_id, role, created_at) VALUES (?,?,?,?) ON CONFLICT(user_id, account_id) DO UPDATE SET role = excluded.role").bind(me.userId, inv.account_id, inv.role, now),
    c.env.DB.prepare("UPDATE invites SET accepted_at = COALESCE(accepted_at, ?) WHERE id = ?").bind(now, inv.id),
    c.env.DB.prepare("UPDATE users SET account_id = ? WHERE id = ?").bind(inv.account_id, me.userId),
  ]);
  return c.json({ object: "membership", account_id: inv.account_id, role: inv.role });
});

team.patch("/members/:userId", async (c) => {
  const p = c.get("principal");
  const me = sessionOnly(p);
  const b = z.object({ role: z.enum(ROLES) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const target = await c.env.DB.prepare("SELECT role FROM memberships WHERE user_id = ? AND account_id = ?").bind(c.req.param("userId"), p.accountId).first<{ role: Role }>();
  if (!target) throw errors.notFound("Member");
  if ((target.role === "owner" || b.data.role === "owner") && me.role !== "owner") throw errors.forbidden("Only an owner can change ownership.");
  if (target.role === "owner" && b.data.role !== "owner") await assertAnotherOwner(c.env, p.accountId, c.req.param("userId"));
  await c.env.DB.prepare("UPDATE memberships SET role = ? WHERE user_id = ? AND account_id = ?").bind(b.data.role, c.req.param("userId"), p.accountId).run();
  return c.json({ user_id: c.req.param("userId"), role: b.data.role });
});

team.delete("/members/:userId", async (c) => {
  const p = c.get("principal");
  const me = sessionOnly(p);
  const uid = c.req.param("userId");
  const target = await c.env.DB.prepare("SELECT role FROM memberships WHERE user_id = ? AND account_id = ?").bind(uid, p.accountId).first<{ role: Role }>();
  if (!target) throw errors.notFound("Member");
  if (target.role === "owner" && me.role !== "owner") throw errors.forbidden("Only an owner can remove an owner.");
  if (target.role === "owner") await assertAnotherOwner(c.env, p.accountId, uid);
  await c.env.DB.prepare("DELETE FROM memberships WHERE user_id = ? AND account_id = ?").bind(uid, p.accountId).run();
  // Move them to another workspace they belong to; with none left, the user is removed (they can sign up again).
  const other = await c.env.DB.prepare("SELECT account_id FROM memberships WHERE user_id = ? LIMIT 1").bind(uid).first<{ account_id: string }>();
  if (other) await c.env.DB.prepare("UPDATE users SET account_id = ? WHERE id = ? AND account_id = ?").bind(other.account_id, uid, p.accountId).run();
  else await c.env.DB.batch([c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(uid), c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid)]);
  return c.json({ deleted: true });
});

async function assertAnotherOwner(env: AppEnv["Bindings"], accountId: string, exceptUser: string) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE account_id = ? AND role = 'owner' AND user_id != ?").bind(accountId, exceptUser).first<{ n: number }>();
  if (!r?.n) throw errors.conflict("A workspace needs at least one owner.");
}

team.get("/workspaces", async (c) => {
  const me = sessionOnly(c.get("principal"));
  const r = await c.env.DB.prepare("SELECT a.id, a.name, a.plan, m.role FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.user_id = ? ORDER BY a.name").bind(me.userId).all();
  return c.json({ object: "list", current: c.get("principal").accountId, data: r.results });
});

team.post("/switch", async (c) => {
  const me = sessionOnly(c.get("principal"));
  const b = z.object({ account_id: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const m = await c.env.DB.prepare("SELECT role FROM memberships WHERE user_id = ? AND account_id = ?").bind(me.userId, b.data.account_id).first();
  if (!m) throw errors.notFound("Workspace");
  await c.env.DB.prepare("UPDATE users SET account_id = ? WHERE id = ?").bind(b.data.account_id, me.userId).run();
  return c.json({ account_id: b.data.account_id });
});
