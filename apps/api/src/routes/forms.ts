// Signup forms: embeddable inline form, popup (delay/scroll/exit-intent) and hosted landing
// page — with bot protection (honeypot, time-trap, rate limits), double opt-in and consent proof.
import { DEFAULT_FORM, escHtml, formCss, formHtml, type FormConfig } from "@novamail/email";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { prefixedId, randomToken, sha256Hex, uuidv7 } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { sendOne } from "./emails";
import { applyTags, onAudienceJoin } from "./funnels";
import { emit } from "../lib/events";

const PENDING_TTL = 7 * 86_400_000;
const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);
const configSchema = z.object({
  title: z.string().min(1).max(120),
  text: z.string().max(400).default(""),
  button: z.string().min(1).max(40),
  success: z.string().min(1).max(300),
  fields: z.array(z.enum(["email", "first_name", "last_name"])).min(1).max(3),
  consent_text: z.string().max(400).default(""),
  image: z.string().url().startsWith("https://").max(500).optional().or(z.literal("").transform(() => undefined)),
  theme: z.object({ bg: hex, fg: hex, accent: hex, button_fg: hex, radius: z.number().min(0).max(32), font: z.enum(["system", "serif", "mono"]) }),
  popup: z.object({ trigger: z.enum(["delay", "scroll", "exit"]), delay: z.number().min(0).max(120), scroll: z.number().min(5).max(100), frequency_days: z.number().min(0).max(365), position: z.enum(["center", "bottom-right", "bottom-bar"]) }),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/)).max(10).default([]),
  redirect_url: z.string().url().startsWith("https://").max(500).optional().or(z.literal("").transform(() => undefined)),
  confirm_subject: z.string().min(1).max(150),
  confirm_text: z.string().max(500),
  from: z.string().max(200).optional(),
});
const formInput = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(["embed", "popup", "page"]).default("embed"),
  audience_id: z.string().max(64),
  double_optin: z.boolean().default(true),
  status: z.enum(["active", "paused"]).default("active"),
  config: configSchema.default(DEFAULT_FORM as any),
});

interface FormRow { id: string; account_id: string; name: string; kind: string; audience_id: string; config: string; double_optin: number; status: string }

/** The sender must be on a verified domain of the account (same rule as /emails). */
async function assertSender(env: Env, accountId: string, from?: string) {
  const addr = from?.match(/<([^>]+)>/)?.[1] ?? from;
  const domain = addr?.split("@")[1]?.toLowerCase();
  if (!domain) throw errors.validation("Double opt-in needs a `config.from` address on one of your verified domains.");
  const doms = await env.DB.prepare("SELECT name FROM domains WHERE account_id = ? AND status = 'verified'").bind(accountId).all<{ name: string }>();
  if (!doms.results.some((d) => domain === d.name || domain.endsWith(`.${d.name}`))) throw errors.validation(`\`${domain}\` is not a verified domain on this account.`);
}

async function assertList(env: Env, accountId: string, id: string) {
  if (!(await env.DB.prepare("SELECT 1 AS x FROM audiences WHERE id = ? AND account_id = ?").bind(id, accountId).first())) throw errors.notFound("List");
}

// ---------------------------------------------------------------- dashboard CRUD

export const forms = new Hono<AppEnv>();

forms.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name, kind, audience_id, double_optin, status, views, submits, confirms, created_at, updated_at FROM forms WHERE account_id = ? ORDER BY created_at DESC").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results });
});

forms.get("/:id", async (c) => {
  const f = await c.env.DB.prepare("SELECT * FROM forms WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).first<FormRow & Record<string, unknown>>();
  if (!f) throw errors.notFound("Form");
  return c.json({ object: "form", ...f, config: JSON.parse(f.config), double_optin: !!f.double_optin, embed: embedSnippets(c.env, f.id) });
});

forms.post("/", async (c) => {
  const p = c.get("principal");
  const b = formInput.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  await assertList(c.env, p.accountId, b.data.audience_id);
  if (b.data.double_optin) await assertSender(c.env, p.accountId, b.data.config.from);
  const id = prefixedId("frm");
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO forms (id, account_id, name, kind, audience_id, config, double_optin, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.data.name, b.data.kind, b.data.audience_id, JSON.stringify(b.data.config), b.data.double_optin ? 1 : 0, b.data.status, now, now).run();
  return c.json({ object: "form", id, embed: embedSnippets(c.env, id) }, 201);
});

forms.patch("/:id", async (c) => {
  const p = c.get("principal");
  const cur = await c.env.DB.prepare("SELECT * FROM forms WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<FormRow>();
  if (!cur) throw errors.notFound("Form");
  const b = formInput.partial().safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const next = { name: cur.name, kind: cur.kind, audience_id: cur.audience_id, double_optin: !!cur.double_optin, status: cur.status, config: JSON.parse(cur.config), ...b.data };
  if (b.data.audience_id) await assertList(c.env, p.accountId, b.data.audience_id);
  if (next.double_optin) await assertSender(c.env, p.accountId, next.config.from);
  await c.env.DB.prepare("UPDATE forms SET name = ?, kind = ?, audience_id = ?, config = ?, double_optin = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(next.name, next.kind, next.audience_id, JSON.stringify(next.config), next.double_optin ? 1 : 0, next.status, Date.now(), cur.id).run();
  return c.json({ object: "form", id: cur.id, updated: true });
});

forms.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM forms WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  return c.json({ deleted: true });
});

export function embedSnippets(env: Env, id: string) {
  const base = env.PUBLIC_URL;
  return {
    inline: `<div data-novamail-form="${id}"></div>\n<script src="${base}/f/${id}.js" async></script>`,
    popup: `<script src="${base}/f/${id}.js" async></script>`,
    page: `${base}/f/${id}`,
  };
}

// ---------------------------------------------------------------- public endpoints

export const publicForms = new Hono<AppEnv>();

async function hit(env: Env, key: string, limit: number, windowMs = 60_000) {
  const w = Math.floor(Date.now() / windowMs);
  const r = await env.DB.prepare("INSERT INTO rate_limits (key_id, window, count) VALUES (?,?,1) ON CONFLICT(key_id, window) DO UPDATE SET count = count + 1 RETURNING count").bind(key, w).first<{ count: number }>();
  return (r?.count ?? 0) <= limit;
}

async function loadForm(env: Env, id: string) {
  const f = await env.DB.prepare("SELECT f.*, a.status AS account_status, a.plan FROM forms f JOIN accounts a ON a.id = f.account_id WHERE f.id = ?").bind(id).first<FormRow & { account_status: string; plan: string }>();
  if (!f || f.status !== "active" || f.account_status !== "active") return null;
  return { ...f, cfg: { ...DEFAULT_FORM, ...(JSON.parse(f.config) as FormConfig) } };
}

const pageShell = (title: string, body: string, nonce: string, extraCss = "", lang = "en") =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title><meta name="robots" content="noindex">
<style nonce="${nonce}">html,body{margin:0;min-height:100%}body{display:grid;place-items:center;min-height:100vh;padding:20px;background:#f4f4f5;font:15px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#09090b}@media(prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}}.box{max-width:440px;background:#fff;color:#09090b;border-radius:16px;padding:28px;box-shadow:0 30px 80px -30px rgba(0,0,0,.4)}.box button{font:inherit;font-weight:600;background:#09090b;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer}${extraCss}</style></head><body>${body}</body></html>`;

function htmlResponse(html: string, nonce: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors *`,
      "cache-control": "no-store",
    },
  });
}

/** Hosted landing page: works without JavaScript; JS upgrades it to an inline success message. */
publicForms.get("/:id{frm_[A-Za-z0-9_-]+}", async (c) => {
  const f = await loadForm(c.env, c.req.param("id"));
  const nonce = randomToken(12);
  if (!f) return htmlResponse(pageShell("Form not available", `<div class="box"><h1>Form not available</h1><p>This form is paused or no longer exists.</p></div>`, nonce), nonce, 404);
  await c.env.DB.prepare("UPDATE forms SET views = views + 1 WHERE id = ?").bind(f.id).run();
  const body = `${formHtml(f.cfg, { action: `/f/${f.id}/submit`, branding: f.plan === "free" })}<script nonce="${nonce}">${CLIENT_JS}NM.bind(document.querySelector('.nm-card'),${JSON.stringify(`/f/${f.id}/submit`)},${JSON.stringify({ success: f.cfg.success, redirect: f.cfg.redirect_url ?? null })});</script>`;
  return htmlResponse(pageShell(f.cfg.title, body, nonce, formCss(f.cfg)), nonce);
});

/** Card payload for the embed script (HTML+CSS are rendered server-side, never from user JS). */
publicForms.get("/:id{frm_[A-Za-z0-9_-]+}/card", async (c) => {
  const f = await loadForm(c.env, c.req.param("id"));
  if (!f) return c.json({ error: "not_found" }, 404);
  const popup = f.kind === "popup";
  return c.json(
    { kind: f.kind, popup: f.cfg.popup, success: f.cfg.success, redirect: f.cfg.redirect_url ?? null, css: formCss(f.cfg), html: formHtml(f.cfg, { action: `${c.env.PUBLIC_URL}/f/${f.id}/submit`, closable: popup, branding: f.plan === "free" }) },
    200,
    { "cache-control": "public, max-age=60" },
  );
});

publicForms.post("/:id{frm_[A-Za-z0-9_-]+}/view", async (c) => {
  await c.env.DB.prepare("UPDATE forms SET views = views + 1 WHERE id = ? AND status = 'active'").bind(c.req.param("id")).run();
  return c.body(null, 204);
});

/** The embed script: inline (data-novamail-form) or popup, rendered in a Shadow DOM. */
publicForms.get("/:file{frm_[A-Za-z0-9_-]+\\.js}", (c) => {
  const id = c.req.param("file").replace(/\.js$/, "");
  const js = `(function(){var ID=${JSON.stringify(id)},B=${JSON.stringify(c.env.PUBLIC_URL)};${CLIENT_JS}
fetch(B+"/f/"+ID+"/card").then(function(r){return r.ok?r.json():null}).then(function(d){if(!d)return;
function mount(host,popup){var root=host.attachShadow?host.attachShadow({mode:"open"}):host;root.innerHTML="<style>"+d.css+(popup?NM.popupCss(d.popup):"")+"</style>"+(popup?'<div class="nm-ov"></div>':"")+d.html;var card=root.querySelector(".nm-card");NM.bind(card,B+"/f/"+ID+"/submit",{success:d.success,redirect:d.redirect,onDone:popup?function(){NM.remember(ID,3650)}:null});return root}
var inl=document.querySelectorAll('[data-novamail-form="'+ID+'"]');
if(inl.length&&d.kind!=="popup"){inl.forEach(function(el){mount(el,false)});NM.view(B,ID);return}
if(d.kind!=="popup"||NM.seen(ID))return;
var shown=false;function show(){if(shown)return;shown=true;NM.remember(ID,d.popup.frequency_days);var h=document.createElement("div");h.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none";document.body.appendChild(h);var root=mount(h,true);var close=function(){h.remove()};var x=root.querySelector(".nm-x");x&&x.addEventListener("click",close);var ov=root.querySelector(".nm-ov");ov&&ov.addEventListener("click",close);document.addEventListener("keydown",function(e){e.key==="Escape"&&close()});NM.view(B,ID)}
var p=d.popup;if(p.trigger==="delay")setTimeout(show,p.delay*1000);
else if(p.trigger==="scroll")addEventListener("scroll",function s(){var h=document.documentElement;if((h.scrollTop+innerHeight)/h.scrollHeight*100>=p.scroll){removeEventListener("scroll",s);show()}},{passive:true});
else{document.addEventListener("mouseout",function(e){if(!e.relatedTarget&&e.clientY<10)show()});if(matchMedia("(pointer:coarse)").matches)setTimeout(show,(p.delay||15)*1000)}
}).catch(function(){})})();`;
  return c.body(js, 200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" });
});

// Shared client: submits with fetch, shows the success message, handles popup state.
const CLIENT_JS = `var NM={
bind:function(card,url,o){var f=card.querySelector("form"),err=card.querySelector(".nm-err"),btn=card.querySelector(".nm-btn");f.addEventListener("submit",function(e){e.preventDefault();var fd=new FormData(f),body={};fd.forEach(function(v,k){body[k]=v});body.page=location.href;var em=String(body.email||"");if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)){err.textContent="Please enter a valid email.";err.hidden=false;return}err.hidden=true;btn.disabled=true;
fetch(url,{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){if(!x.ok){err.textContent=x.j.message||"Something went wrong. Try again.";err.hidden=false;btn.disabled=false;return}
if(o.redirect){location.href=o.redirect;return}var m=document.createElement("p");m.className="nm-msg";m.textContent=x.j.message||o.success;f.replaceWith(m);o.onDone&&o.onDone()}).catch(function(){err.textContent="Network error. Try again.";err.hidden=false;btn.disabled=false})})},
popupCss:function(p){var pos=p.position==="bottom-right"?"right:20px;bottom:20px;":p.position==="bottom-bar"?"left:50%;bottom:16px;transform:translateX(-50%);":"left:50%;top:50%;transform:translate(-50%,-50%);";return ".nm-ov{position:fixed;inset:0;background:rgba(9,9,11,.55);backdrop-filter:blur(3px);pointer-events:auto;animation:nm-fade .25s ease;"+(p.position==="center"?"":"display:none;")+"}.nm-card{position:fixed;"+pos+"width:min(440px,calc(100vw - 32px));pointer-events:auto;animation:nm-pop .35s cubic-bezier(.2,.9,.3,1.2)}@keyframes nm-fade{from{opacity:0}}@keyframes nm-pop{from{opacity:0;margin-top:14px}}@media(prefers-reduced-motion:reduce){.nm-card,.nm-ov{animation:none}}"},
seen:function(id){try{var t=+localStorage.getItem("nm_f_"+id);return t&&t>Date.now()}catch(e){return false}},
remember:function(id,days){try{localStorage.setItem("nm_f_"+id,String(Date.now()+days*864e5))}catch(e){}},
view:function(b,id){try{navigator.sendBeacon?navigator.sendBeacon(b+"/f/"+id+"/view"):fetch(b+"/f/"+id+"/view",{method:"POST",keepalive:true})}catch(e){}}};`;

const submitSchema = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  website: z.string().max(200).optional(),
  t: z.coerce.number().optional(),
  page: z.string().max(500).optional(),
});

publicForms.post("/:id{frm_[A-Za-z0-9_-]+}/submit", async (c) => {
  const wantsJson = (c.req.header("accept") ?? "").includes("json") || (c.req.header("content-type") ?? "").includes("json");
  const raw = (c.req.header("content-type") ?? "").includes("json") ? await c.req.json().catch(() => null) : Object.fromEntries((await c.req.formData().catch(() => new FormData())).entries());
  const f = await loadForm(c.env, c.req.param("id"));
  const nonce = randomToken(12);
  const reply = (status: number, message: string) =>
    wantsJson ? c.json({ ok: status < 300, message }, status as 200) : htmlResponse(pageShell(f?.cfg.title ?? "Subscribe", `<div class="box"><p>${escHtml(message)}</p></div>`, nonce), nonce, status);
  if (!f) return reply(404, "This form is not available.");
  const b = submitSchema.safeParse(raw);
  if (!b.success) return reply(422, "Please enter a valid email.");
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  if (!(await hit(c.env, `form-ip:${ip}`, 5)) || !(await hit(c.env, `form:${f.id}`, 120))) return reply(429, "Too many attempts. Please try again in a minute.");
  await c.env.DB.prepare("UPDATE forms SET submits = submits + 1 WHERE id = ?").bind(f.id).run();
  // Bots: filled the hidden field, or submitted faster than a human can type. Pretend success.
  const tooFast = b.data.t && Date.now() - b.data.t < 1500;
  if (b.data.website || tooFast) return reply(200, f.cfg.success);

  const info = { ip, user_agent: (c.req.header("user-agent") ?? "").slice(0, 300), page: b.data.page ?? c.req.header("referer") ?? null };
  const person = { email: b.data.email, first_name: b.data.first_name?.trim() || undefined, last_name: b.data.last_name?.trim() || undefined };
  if (!f.double_optin) {
    await subscribe(c.env, f, person, info, null);
    return reply(200, f.cfg.success);
  }
  // Already a confirmed, subscribed member of this list: don't send another confirmation.
  const member = await c.env.DB.prepare("SELECT unsubscribed FROM contacts WHERE audience_id = ? AND email = ?").bind(f.audience_id, person.email).first<{ unsubscribed: number }>();
  if (member && !member.unsubscribed) return reply(200, f.cfg.success);
  const token = randomToken(24);
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO form_pending (token_hash, form_id, account_id, email, data, created_at, expires_at) VALUES (?,?,?,?,?,?,?)")
    .bind(await sha256Hex(token), f.id, f.account_id, person.email, JSON.stringify({ person, info }), now, now + PENDING_TTL).run();
  const link = `${c.env.PUBLIC_URL}/f/confirm/${token}`;
  const principal: Principal = { accountId: f.account_id, apiKeyId: `form:${f.id}`, permission: "full", domainId: null };
  try {
    await sendOne(c.env, principal, {
      from: f.cfg.from!,
      to: [person.email],
      subject: f.cfg.confirm_subject,
      html: confirmEmail(f.cfg, link),
      text: `${f.cfg.confirm_text}\n\n${link}\n\nIf you didn't sign up, ignore this email.`,
      tags: [{ name: "category", value: "double_optin" }],
    }, `optin:${f.id}:${person.email}:${Math.floor(now / 600_000)}`);
  } catch {
    return reply(503, "We couldn't send the confirmation email. Please try again later.");
  }
  return reply(200, f.cfg.success);
});

function confirmEmail(cfg: FormConfig, link: string) {
  const ac = /^#[0-9a-fA-F]{3,8}$/.test(cfg.theme.accent) ? cfg.theme.accent : "#09090b";
  const bf = /^#[0-9a-fA-F]{3,8}$/.test(cfg.theme.button_fg) ? cfg.theme.button_fg : "#ffffff";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#09090b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<h1 style="margin:0 0 12px;font-size:22px">${escHtml(cfg.confirm_subject)}</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46">${escHtml(cfg.confirm_text)}</p>
<a href="${link}" style="display:inline-block;background:${ac};color:${bf};text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px">Confirm subscription</a>
<p style="margin:24px 0 0;font-size:12px;color:#71717a">If you didn't sign up, just ignore this email — you won't be added.</p></td></tr></table></td></tr></table></body></html>`;
}

/** Adds the person to the form's list (re-subscribing if they had left), tags, funnels and consent proof. */
async function subscribe(env: Env, f: FormRow & { cfg: FormConfig }, person: { email: string; first_name?: string; last_name?: string }, info: { ip: string; user_agent: string; page: string | null }, confirmedAt: number | null) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contacts (id, account_id, audience_id, email, first_name, last_name, unsubscribed, created_at) VALUES (?,?,?,?,?,?,0,?)
       ON CONFLICT(audience_id, email) DO UPDATE SET unsubscribed = 0, first_name = COALESCE(excluded.first_name, first_name), last_name = COALESCE(excluded.last_name, last_name)`,
    ).bind(`con_${uuidv7(now)}`, f.account_id, f.audience_id, person.email, person.first_name ?? null, person.last_name ?? null, now),
    // A fresh opt-in overrides an old unsubscribe (never a bounce or spam complaint).
    env.DB.prepare("DELETE FROM suppressions WHERE account_id = ? AND address = ? AND reason = 'unsubscribe'").bind(f.account_id, person.email),
    env.DB.prepare("INSERT INTO consents (account_id, email, source, form_id, text, ip, user_agent, page, created_at, confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(f.account_id, person.email, confirmedAt ? "form_double_optin" : "form", f.id, f.cfg.consent_text || null, info.ip, info.user_agent, info.page, now, confirmedAt),
    env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'joined_list', ?, ?)").bind(f.account_id, person.email, JSON.stringify({ list: f.audience_id, form: f.id }), now),
    env.DB.prepare("UPDATE forms SET confirms = confirms + 1 WHERE id = ?").bind(f.id),
  ]);
  await emit(env, f.account_id, "form.submitted", { form_id: f.id, form_name: f.name, email: person.email, first_name: person.first_name ?? null, last_name: person.last_name ?? null, list_id: f.audience_id, double_optin: !!confirmedAt, page: info.page });
  if (f.cfg.tags.length) await applyTags(env, f.account_id, person.email, f.cfg.tags, []);
  await onAudienceJoin(env, f.account_id, f.audience_id, [person.email]);
}

// GET only shows the page (link scanners prefetch); a script or the button POSTs the confirmation.
publicForms.get("/confirm/:token", async (c) => {
  const nonce = randomToken(12);
  const p = await c.env.DB.prepare("SELECT form_id, expires_at FROM form_pending WHERE token_hash = ?").bind(await sha256Hex(c.req.param("token"))).first<{ form_id: string; expires_at: number }>();
  if (!p || p.expires_at < Date.now()) return htmlResponse(pageShell("Link expired", `<div class="box"><h1>Link expired</h1><p>This confirmation link is no longer valid. Please sign up again.</p></div>`, nonce), nonce, 404);
  return htmlResponse(pageShell("Confirm subscription", `<div class="box"><h1>Confirm your subscription</h1><form method="post" id="c"><button>Yes, subscribe me</button></form></div><script nonce="${nonce}">document.getElementById("c").submit()</script>`, nonce), nonce);
});

publicForms.post("/confirm/:token", async (c) => {
  const nonce = randomToken(12);
  const hash = await sha256Hex(c.req.param("token"));
  const p = await c.env.DB.prepare("DELETE FROM form_pending WHERE token_hash = ? RETURNING form_id, email, data, expires_at").bind(hash).first<{ form_id: string; email: string; data: string; expires_at: number }>();
  if (!p || p.expires_at < Date.now()) return htmlResponse(pageShell("Link expired", `<div class="box"><h1>Link expired</h1><p>This confirmation link is no longer valid. Please sign up again.</p></div>`, nonce), nonce, 404);
  const f = await loadForm(c.env, p.form_id);
  if (!f) return htmlResponse(pageShell("Form not available", `<div class="box"><p>This form is no longer active.</p></div>`, nonce), nonce, 404);
  const d = JSON.parse(p.data) as { person: { email: string; first_name?: string; last_name?: string }; info: { ip: string; user_agent: string; page: string | null } };
  await subscribe(c.env, f, d.person, d.info, Date.now());
  if (f.cfg.redirect_url) return c.redirect(f.cfg.redirect_url, 303);
  return htmlResponse(pageShell("Subscribed", `<div class="box"><h1>You're in ✓</h1><p>Thanks for confirming — <b>${escHtml(p.email)}</b> is now subscribed.</p></div>`, nonce), nonce);
});

/** Cron: drops expired double opt-in requests. */
export async function cleanupPending(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM form_pending WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE window < ?").bind(Math.floor(now / 60_000) - 120),
  ]);
}
