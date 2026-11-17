// SMS (Twilio) and WhatsApp (Meta Cloud API) through the customer's own provider accounts.
// Marketing texts only go to people with a recorded opt-in for that channel; STOP opts out.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { b64encode, open, prefixedId, randomToken, safeEqual, seal } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";

export type Kind = "sms" | "whatsapp";
const E164 = /^\+[1-9]\d{7,14}$/;
const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|parar|sair|cancelar)\s*$/i;
const START = /^\s*(start|unstop|yes)\s*$/i;
const META_API = "https://graph.facebook.com/v21.0";

export function normalizePhone(raw: string | null | undefined) {
  if (!raw) return null;
  const s = raw.replace(/[\s().-]/g, "");
  const p = s.startsWith("00") ? `+${s.slice(2)}` : s;
  return E164.test(p) ? p : null;
}

interface Channel { id: string; account_id: string; kind: "sms_twilio" | "whatsapp_meta"; name: string; config: string; sender: string | null; status: string }
type TwilioCfg = { account_sid: string; auth_token: string; from?: string; messaging_service_sid?: string };
type MetaCfg = { phone_number_id: string; access_token: string; app_secret: string; verify_token: string };
const kindOf = (c: Pick<Channel, "kind">): Kind => (c.kind === "sms_twilio" ? "sms" : "whatsapp");

// ---------------------------------------------------------------- consent

export async function setConsent(env: Env, accountId: string, phone: string, kind: Kind, granted: boolean, source: string, email?: string | null) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO message_consents (account_id, phone, kind, email, source, granted_at, revoked_at) VALUES (?1,?2,?3,?4,?5, CASE WHEN ?6 THEN ?7 END, CASE WHEN ?6 THEN NULL ELSE ?7 END)
     ON CONFLICT(account_id, phone, kind) DO UPDATE SET email = COALESCE(?4, email), source = ?5,
       granted_at = CASE WHEN ?6 THEN ?7 ELSE granted_at END, revoked_at = CASE WHEN ?6 THEN NULL ELSE ?7 END`,
  ).bind(accountId, phone, kind, email ?? null, source.slice(0, 60), granted ? 1 : 0, now).run();
  if (email) await env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?,?,?,?)").bind(accountId, email, granted ? `${kind}_optin` : `${kind}_optout`, JSON.stringify({ phone, source }), now).run();
}

async function hasConsent(env: Env, accountId: string, phone: string, kind: Kind) {
  const r = await env.DB.prepare("SELECT granted_at, revoked_at FROM message_consents WHERE account_id = ? AND phone = ? AND kind = ?").bind(accountId, phone, kind).first<{ granted_at: number | null; revoked_at: number | null }>();
  return !!r?.granted_at && !r.revoked_at;
}

// ---------------------------------------------------------------- providers

async function providerSend(env: Env, ch: Channel, to: string, msg: { body?: string; template?: { name: string; language: string; variables: string[] } }, fetcher: typeof fetch) {
  const cfg = JSON.parse(await open(ch.config, env.ENCRYPTION_KEY));
  if (ch.kind === "sms_twilio") {
    const c = cfg as TwilioCfg;
    const form = new URLSearchParams({ To: to, Body: msg.body ?? "", StatusCallback: `${env.PUBLIC_URL}/hooks/messaging/${ch.id}` });
    if (c.messaging_service_sid) form.set("MessagingServiceSid", c.messaging_service_sid); else form.set("From", c.from!);
    const r = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${c.account_sid}/Messages.json`, { method: "POST", headers: { authorization: `Basic ${btoa(`${c.account_sid}:${c.auth_token}`)}`, "content-type": "application/x-www-form-urlencoded" }, body: form });
    const j = (await r.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string };
    if (!r.ok) throw new ApiError(502, "provider_error", `Twilio: ${j.message ?? r.status}`);
    return { id: j.sid ?? null, status: j.status ?? "queued" };
  }
  const c = cfg as MetaCfg;
  const payload = msg.template
    ? { messaging_product: "whatsapp", to: to.slice(1), type: "template", template: { name: msg.template.name, language: { code: msg.template.language }, components: msg.template.variables.length ? [{ type: "body", parameters: msg.template.variables.map((text) => ({ type: "text", text })) }] : [] } }
    : { messaging_product: "whatsapp", to: to.slice(1), type: "text", text: { body: msg.body ?? "" } };
  const r = await fetcher(`${META_API}/${c.phone_number_id}/messages`, { method: "POST", headers: { authorization: `Bearer ${c.access_token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  if (!r.ok) throw new ApiError(502, "provider_error", `WhatsApp: ${j.error?.message ?? r.status}`);
  return { id: j.messages?.[0]?.id ?? null, status: "sent" };
}

async function verifyChannel(kind: Channel["kind"], cfg: TwilioCfg | MetaCfg, fetcher: typeof fetch = fetch) {
  if (kind === "sms_twilio") {
    const c = cfg as TwilioCfg;
    const r = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${c.account_sid}.json`, { headers: { authorization: `Basic ${btoa(`${c.account_sid}:${c.auth_token}`)}` } });
    if (!r.ok) throw errors.validation("Twilio rejected these credentials.");
    return c.from ?? c.messaging_service_sid ?? null;
  }
  const c = cfg as MetaCfg;
  const r = await fetcher(`${META_API}/${c.phone_number_id}?fields=display_phone_number`, { headers: { authorization: `Bearer ${c.access_token}` } });
  const j = (await r.json().catch(() => ({}))) as { display_phone_number?: string };
  if (!r.ok) throw errors.validation("Meta rejected this phone number ID / access token.");
  return j.display_phone_number ?? c.phone_number_id;
}

// ---------------------------------------------------------------- sending

export interface SendInput { channel_id: string; to?: string; email?: string; body?: string; template?: { name: string; language: string; variables: string[] }; funnel_id?: string; vars?: Record<string, string>; marketing?: boolean }

export async function sendMessage(env: Env, accountId: string, x: SendInput, fetcher: typeof fetch = fetch) {
  const ch = await env.DB.prepare("SELECT * FROM channels WHERE id = ? AND account_id = ?").bind(x.channel_id, accountId).first<Channel>();
  if (!ch || ch.status !== "active") throw errors.notFound("Channel");
  const kind = kindOf(ch);
  const email = x.email?.toLowerCase() ?? null;
  let phone = normalizePhone(x.to);
  if (!phone && email) phone = normalizePhone((await env.DB.prepare("SELECT phone FROM people_data WHERE account_id = ? AND email = ?").bind(accountId, email).first<{ phone: string | null }>())?.phone);
  if (!phone) throw errors.validation("No valid phone number (E.164, e.g. +15551234567).");
  if (x.marketing !== false && !(await hasConsent(env, accountId, phone, kind))) throw new ApiError(403, "no_consent", `${phone} has not opted in to ${kind === "sms" ? "text messages" : "WhatsApp"}.`);
  if (kind === "whatsapp" && !x.template && !x.body) throw errors.validation("WhatsApp needs a template (or a text reply inside a 24-hour conversation).");
  const w = Math.floor(Date.now() / 60_000);
  const rl = await env.DB.prepare("INSERT INTO rate_limits (key_id, window, count) VALUES (?,?,1) ON CONFLICT(key_id, window) DO UPDATE SET count = count + 1 RETURNING count").bind(`msg:${accountId}`, w).first<{ count: number }>();
  if ((rl?.count ?? 0) > 120) throw new ApiError(429, "rate_limited", "Too many messages this minute.");
  const vars = x.vars ?? {};
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
  let body = x.body ? fill(x.body).slice(0, 1600) : undefined;
  // US carriers require opt-out instructions in marketing texts.
  if (kind === "sms" && body && x.marketing !== false && !/\bstop\b/i.test(body)) body = `${body}\nReply STOP to opt out.`;
  const template = x.template ? { ...x.template, variables: x.template.variables.map(fill) } : undefined;
  const id = prefixedId("msg");
  const now = Date.now();
  await env.DB.prepare("INSERT INTO messages (id, account_id, channel_id, kind, to_phone, email, body, template, status, funnel_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'queued', ?, ?, ?)")
    .bind(id, accountId, ch.id, kind, phone, email, body ?? null, template ? JSON.stringify(template) : null, x.funnel_id ?? null, now, now).run();
  try {
    const r = await providerSend(env, ch, phone, { body, template }, fetcher);
    await env.DB.prepare("UPDATE messages SET status = ?, provider_id = ?, updated_at = ? WHERE id = ?").bind(r.status, r.id, Date.now(), id).run();
    return { id, status: r.status, to: phone };
  } catch (e) {
    await env.DB.prepare("UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(String((e as Error).message).slice(0, 300), Date.now(), id).run();
    throw e;
  }
}

// ---------------------------------------------------------------- routes

export const channels = new Hono<AppEnv>();
const chInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sms_twilio"), name: z.string().min(1).max(60), account_sid: z.string().regex(/^AC[0-9a-f]{32}$/i), auth_token: z.string().min(16).max(64), from: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(), messaging_service_sid: z.string().regex(/^MG[0-9a-f]{32}$/i).optional() }).refine((v) => v.from || v.messaging_service_sid, { message: "Provide `from` (E.164) or `messaging_service_sid`.", path: ["from"] }),
  z.object({ kind: z.literal("whatsapp_meta"), name: z.string().min(1).max(60), phone_number_id: z.string().regex(/^\d{5,30}$/), access_token: z.string().min(20).max(1000), app_secret: z.string().min(16).max(100) }),
]);

channels.get("/", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT ch.id, ch.kind, ch.name, ch.sender, ch.status, ch.created_at,
            (SELECT COUNT(*) FROM messages m WHERE m.channel_id = ch.id) AS sent,
            (SELECT COUNT(*) FROM messages m WHERE m.channel_id = ch.id AND m.status IN ('delivered','read')) AS delivered
       FROM channels ch WHERE ch.account_id = ? ORDER BY ch.created_at`,
  ).bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results.map((x: any) => ({ ...x, webhook_url: `${c.env.PUBLIC_URL}/hooks/messaging/${x.id}` })) });
});

channels.post("/", async (c) => {
  const p = c.get("principal");
  const b = chInput.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const { kind, name, ...rest } = b.data;
  const cfg = kind === "whatsapp_meta" ? { ...rest, verify_token: randomToken(18) } : rest;
  const sender = await verifyChannel(kind, cfg as TwilioCfg | MetaCfg);
  const id = prefixedId("ch");
  await c.env.DB.prepare("INSERT INTO channels (id, account_id, kind, name, config, sender, created_at) VALUES (?,?,?,?,?,?,?)").bind(id, p.accountId, kind, name, await seal(JSON.stringify(cfg), c.env.ENCRYPTION_KEY), sender, Date.now()).run();
  return c.json({ object: "channel", id, kind, sender, webhook_url: `${c.env.PUBLIC_URL}/hooks/messaging/${id}`, ...(kind === "whatsapp_meta" ? { verify_token: (cfg as MetaCfg).verify_token } : {}) }, 201);
});

channels.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM channels WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  return c.json({ deleted: true });
});

export const messages = new Hono<AppEnv>();
messages.post("/", async (c) => {
  const p = c.get("principal");
  if (p.permission === "agent") throw errors.forbidden("Agents cannot send messages.");
  const b = z.object({ channel_id: z.string().max(64), to: z.string().max(30).optional(), email: z.email().optional(), body: z.string().min(1).max(1600).optional(), template: z.object({ name: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string().max(10).default("en_US"), variables: z.array(z.string().max(1000)).max(20).default([]) }).optional(), transactional: z.boolean().default(false) }).refine((v) => v.to || v.email, { message: "Provide `to` or `email`." }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const r = await sendMessage(c.env, p.accountId, { ...b.data, marketing: !b.data.transactional });
  return c.json({ object: "message", ...r }, 201);
});

messages.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, channel_id, kind, to_phone, email, body, template, status, error, created_at, updated_at FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT 200").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

/** Record an opt-in/out you collected elsewhere (checkout, paper form, verbal with record). */
messages.post("/consent", async (c) => {
  const p = c.get("principal");
  const b = z.object({ phone: z.string().max(30), kind: z.enum(["sms", "whatsapp"]), granted: z.boolean(), email: z.email().optional(), source: z.string().max(60).default("api") }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const phone = normalizePhone(b.data.phone);
  if (!phone) throw errors.validation("Phone must be E.164, e.g. +15551234567.");
  await setConsent(c.env, p.accountId, phone, b.data.kind, b.data.granted, b.data.source, b.data.email?.toLowerCase());
  if (b.data.email) await c.env.DB.prepare("INSERT INTO people_data (account_id, email, phone, fields, created_at, updated_at) VALUES (?,?,?, '{}', ?, ?) ON CONFLICT(account_id, email) DO UPDATE SET phone = excluded.phone, updated_at = excluded.updated_at").bind(p.accountId, b.data.email.toLowerCase(), phone, Date.now(), Date.now()).run();
  return c.json({ object: "consent", phone, kind: b.data.kind, granted: b.data.granted });
});

// ---------------------------------------------------------------- provider webhooks (public, signed)

export const messagingHooks = new Hono<AppEnv>();

async function hmac(algo: "SHA-1" | "SHA-256", key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: algo }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}

/** Twilio signature: base64(HMAC-SHA1(token, url + sorted key+value pairs)). */
export async function twilioSignature(token: string, url: string, params: Record<string, string>) {
  return b64encode(await hmac("SHA-1", token, url + Object.keys(params).sort().map((k) => k + params[k]).join("")));
}

messagingHooks.get("/:id", async (c) => {
  // Meta webhook verification handshake.
  const ch = await c.env.DB.prepare("SELECT * FROM channels WHERE id = ?").bind(c.req.param("id")).first<Channel>();
  if (!ch || ch.kind !== "whatsapp_meta") return c.text("not found", 404);
  const cfg = JSON.parse(await open(ch.config, c.env.ENCRYPTION_KEY)) as MetaCfg;
  if (c.req.query("hub.mode") === "subscribe" && safeEqual(c.req.query("hub.verify_token") ?? "", cfg.verify_token)) return c.text(c.req.query("hub.challenge") ?? "");
  return c.text("forbidden", 403);
});

messagingHooks.post("/:id", async (c) => {
  const ch = await c.env.DB.prepare("SELECT * FROM channels WHERE id = ?").bind(c.req.param("id")).first<Channel>();
  if (!ch) return c.text("not found", 404);
  const cfg = JSON.parse(await open(ch.config, c.env.ENCRYPTION_KEY));
  const raw = await c.req.text();
  const now = Date.now();
  if (ch.kind === "sms_twilio") {
    const params = Object.fromEntries(new URLSearchParams(raw));
    const expected = await twilioSignature((cfg as TwilioCfg).auth_token, c.req.url, params);
    if (!safeEqual(c.req.header("x-twilio-signature") ?? "", expected)) return c.text("invalid signature", 403);
    if (params.MessageStatus && params.MessageSid) {
      await c.env.DB.prepare("UPDATE messages SET status = ?, error = COALESCE(?, error), updated_at = ? WHERE provider_id = ? AND channel_id = ?").bind(params.MessageStatus, params.ErrorCode ?? null, now, params.MessageSid, ch.id).run();
    } else if (params.Body && params.From) {
      const phone = normalizePhone(params.From);
      if (phone && STOP.test(params.Body)) await setConsent(c.env, ch.account_id, phone, "sms", false, "reply_stop");
      else if (phone && START.test(params.Body)) {
        const prev = await c.env.DB.prepare("SELECT granted_at FROM message_consents WHERE account_id = ? AND phone = ? AND kind = 'sms'").bind(ch.account_id, phone).first<{ granted_at: number | null }>();
        if (prev?.granted_at) await setConsent(c.env, ch.account_id, phone, "sms", true, "reply_start");
      }
    }
    return c.body('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, { "content-type": "text/xml" });
  }
  const sig = (c.req.header("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  const mac = [...(await hmac("SHA-256", (cfg as MetaCfg).app_secret, raw))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!sig || !safeEqual(sig, mac)) return c.text("invalid signature", 403);
  let body: any;
  try { body = JSON.parse(raw); } catch { return c.text("bad json", 400); }
  for (const e of body.entry ?? []) for (const ch2 of e.changes ?? []) {
    const v = ch2.value ?? {};
    for (const s of v.statuses ?? []) await c.env.DB.prepare("UPDATE messages SET status = ?, error = COALESCE(?, error), updated_at = ? WHERE provider_id = ? AND channel_id = ?").bind(String(s.status), s.errors?.[0]?.title ?? null, now, String(s.id), ch.id).run();
    for (const m of v.messages ?? []) {
      const phone = normalizePhone(`+${m.from}`);
      const text = m.text?.body ?? m.button?.text ?? "";
      if (phone && STOP.test(text)) await setConsent(c.env, ch.account_id, phone, "whatsapp", false, "reply_stop");
    }
  }
  return c.json({ ok: true });
});
