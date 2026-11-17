// E-commerce: Shopify and WooCommerce webhooks (signed), a generic API for any store,
// abandoned-cart detection, product catalog for emails and last-click revenue attribution.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { b64encode, open, prefixedId, randomToken, safeEqual, seal, uuidv7 } from "../lib/crypto";
import { errors, zodMessage } from "../lib/http";
import { applyTags, onAudienceJoin } from "./funnels";

const CLICK_WINDOW = 5 * 86_400_000; // last human click within 5 days
const OPEN_WINDOW = 86_400_000; // or a human open within 24 h
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const httpsUrl = (u: unknown) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100) || 0;

export interface Item { title: string; qty: number; price_cents: number; image?: string | null; url?: string | null; product_id?: string | null }
export interface OrderIn { external_id: string; email?: string | null; first_name?: string | null; last_name?: string | null; amount_cents: number; currency: string; items: Item[]; accepts_marketing?: boolean | null; created_at?: number }
export interface CartIn { external_id: string; email?: string | null; first_name?: string | null; url?: string | null; amount_cents: number; currency: string; items: Item[]; accepts_marketing?: boolean | null }
export interface ProductIn { external_id: string; title: string; url?: string | null; image?: string | null; price_cents?: number | null; currency?: string | null }

interface Store { id: string; account_id: string; platform: "shopify" | "woocommerce" | "custom"; name: string; url: string | null; secret: string; currency: string; settings: string }
const settingsOf = (s: Store) => ({ abandon_minutes: 60, require_consent: s.platform === "shopify", list_id: null as string | null, ...(JSON.parse(s.settings || "{}") as object) });

// ---------------------------------------------------------------- normalizers

export const shopify = {
  order: (o: any): OrderIn => ({
    external_id: String(o.id), email: o.email ?? o.customer?.email ?? null, first_name: o.customer?.first_name ?? o.billing_address?.first_name ?? null, last_name: o.customer?.last_name ?? null,
    amount_cents: cents(o.total_price), currency: o.currency ?? "USD",
    items: (o.line_items ?? []).map((i: any) => ({ title: String(i.title ?? i.name ?? ""), qty: Number(i.quantity ?? 1), price_cents: cents(i.price), product_id: i.product_id ? String(i.product_id) : null })),
    accepts_marketing: o.buyer_accepts_marketing ?? o.customer?.email_marketing_consent?.state === "subscribed",
    created_at: o.created_at ? Date.parse(o.created_at) : undefined,
  }),
  cart: (c: any): CartIn => ({
    external_id: String(c.token ?? c.id), email: c.email ?? c.customer?.email ?? null, first_name: c.customer?.first_name ?? c.billing_address?.first_name ?? null,
    url: httpsUrl(c.abandoned_checkout_url), amount_cents: cents(c.total_price), currency: c.currency ?? c.presentment_currency ?? "USD",
    items: (c.line_items ?? []).map((i: any) => ({ title: String(i.title ?? ""), qty: Number(i.quantity ?? 1), price_cents: cents(i.price), product_id: i.product_id ? String(i.product_id) : null })),
    accepts_marketing: c.buyer_accepts_marketing ?? null,
  }),
  product: (p: any, storeUrl: string | null): ProductIn => ({
    external_id: String(p.id), title: String(p.title ?? ""), url: storeUrl && p.handle ? `${storeUrl.replace(/\/$/, "")}/products/${p.handle}` : null,
    image: httpsUrl(p.image?.src ?? p.images?.[0]?.src), price_cents: p.variants?.[0]?.price ? cents(p.variants[0].price) : null,
  }),
};

export const woo = {
  order: (o: any): OrderIn => ({
    external_id: String(o.id), email: o.billing?.email ?? null, first_name: o.billing?.first_name ?? null, last_name: o.billing?.last_name ?? null,
    amount_cents: cents(o.total), currency: o.currency ?? "USD",
    items: (o.line_items ?? []).map((i: any) => ({ title: String(i.name ?? ""), qty: Number(i.quantity ?? 1), price_cents: cents(i.price), image: httpsUrl(i.image?.src), product_id: i.product_id ? String(i.product_id) : null })),
    accepts_marketing: null,
    created_at: o.date_created_gmt ? Date.parse(`${o.date_created_gmt}Z`) : undefined,
  }),
  product: (p: any): ProductIn => ({ external_id: String(p.id), title: String(p.name ?? ""), url: httpsUrl(p.permalink), image: httpsUrl(p.images?.[0]?.src), price_cents: p.price ? cents(p.price) : null }),
};

// ---------------------------------------------------------------- core

async function storeList(env: Env, s: Store) {
  const st = settingsOf(s);
  if (st.list_id) return st.list_id;
  const name = `${s.name} customers`;
  const a = await env.DB.prepare("SELECT id FROM audiences WHERE account_id = ? AND name = ?").bind(s.account_id, name).first<{ id: string }>();
  if (a) return a.id;
  const id = prefixedId("aud");
  await env.DB.prepare("INSERT INTO audiences (id, account_id, name, created_at) VALUES (?,?,?,?)").bind(id, s.account_id, name, Date.now()).run();
  return id;
}

async function addToList(env: Env, s: Store, email: string, first: string | null | undefined, last: string | null | undefined, source: string) {
  const list = await storeList(env, s);
  const now = Date.now();
  const r = await env.DB.prepare(
    `INSERT INTO contacts (id, account_id, audience_id, email, first_name, last_name, unsubscribed, created_at) VALUES (?,?,?,?,?,?,0,?)
     ON CONFLICT(audience_id, email) DO UPDATE SET first_name = COALESCE(first_name, excluded.first_name), last_name = COALESCE(last_name, excluded.last_name)`,
  ).bind(`con_${uuidv7(now)}`, s.account_id, list, email, first ?? null, last ?? null, now).run();
  await env.DB.prepare("INSERT INTO consents (account_id, email, source, text, created_at) VALUES (?,?,?,?,?)").bind(s.account_id, email, source, `Accepted marketing at checkout (${s.platform})`, now).run().catch(() => undefined);
  if (r.meta.changes) await onAudienceJoin(env, s.account_id, list, [email]);
}

/** Last-click attribution: the e-mail a person clicked (or opened) before buying. */
export async function attribute(env: Env, accountId: string, email: string, at: number) {
  const hit = await env.DB.prepare(
    `SELECT e.email_id, m.api_key_id FROM email_events e JOIN emails m ON m.id = e.email_id
      WHERE e.account_id = ? AND e.recipient = ? AND e.machine = 0
        AND ((e.type = 'email.clicked' AND e.created_at BETWEEN ? AND ?) OR (e.type = 'email.opened' AND e.created_at BETWEEN ? AND ?))
      ORDER BY (e.type = 'email.clicked') DESC, e.created_at DESC LIMIT 1`,
  ).bind(accountId, email, at - CLICK_WINDOW, at, at - OPEN_WINDOW, at).first<{ email_id: string; api_key_id: string | null }>();
  if (!hit) return { email_id: null, broadcast_id: null, funnel_id: null };
  const k = hit.api_key_id ?? "";
  return { email_id: hit.email_id, broadcast_id: k.startsWith("broadcast:") ? k.slice(10) : null, funnel_id: k.startsWith("funnel:") ? k.slice(7) : null };
}

export async function ingestOrder(env: Env, s: Store, o: OrderIn) {
  const email = o.email?.trim().toLowerCase() || null;
  const at = o.created_at && Number.isFinite(o.created_at) ? o.created_at : Date.now();
  const attr = email ? await attribute(env, s.account_id, email, at) : { email_id: null, broadcast_id: null, funnel_id: null };
  const ins = await env.DB.prepare(
    `INSERT INTO orders (store_id, external_id, account_id, email, amount_cents, currency, items, email_id, broadcast_id, funnel_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(store_id, external_id) DO UPDATE SET amount_cents = excluded.amount_cents, items = excluded.items`,
  ).bind(s.id, o.external_id, s.account_id, email, o.amount_cents, o.currency, JSON.stringify(o.items.slice(0, 50)), attr.email_id, attr.broadcast_id, attr.funnel_id, at).run();
  if (!email) return { attributed: attr };
  await env.DB.batch([
    env.DB.prepare("UPDATE carts SET status = 'recovered', updated_at = ? WHERE account_id = ? AND email = ? AND status IN ('open','abandoned')").bind(Date.now(), s.account_id, email),
    env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'order', ?, ?)").bind(s.account_id, email, JSON.stringify({ store: s.id, order: o.external_id, amount_cents: o.amount_cents, currency: o.currency, campaign: attr.broadcast_id, funnel: attr.funnel_id }), at),
  ]);
  const st = settingsOf(s);
  const known = await env.DB.prepare("SELECT 1 AS x FROM contacts WHERE account_id = ? AND email = ? AND unsubscribed = 0 LIMIT 1").bind(s.account_id, email).first();
  if (o.accepts_marketing === true || (!st.require_consent && o.accepts_marketing !== false)) await addToList(env, s, email, o.first_name, o.last_name, `${s.platform}_order`);
  if (known || o.accepts_marketing === true || !st.require_consent) await applyTags(env, s.account_id, email, ["purchased", "customer"], ["cart-abandoned"]);
  return { attributed: attr, new: !!ins.meta.changes };
}

export async function ingestCart(env: Env, s: Store, cart: CartIn) {
  const email = cart.email?.trim().toLowerCase();
  if (!email || !cart.items.length) return { stored: false };
  const st = settingsOf(s);
  const known = await env.DB.prepare("SELECT 1 AS x FROM contacts WHERE account_id = ? AND email = ? AND unsubscribed = 0 LIMIT 1").bind(s.account_id, email).first();
  // Abandoned-cart emails are marketing: only for people who agreed (or are already subscribers).
  if (st.require_consent && cart.accepts_marketing !== true && !known) return { stored: false, reason: "no_consent" };
  if (cart.accepts_marketing === true) await addToList(env, s, email, cart.first_name, null, `${s.platform}_checkout`);
  await env.DB.prepare(
    `INSERT INTO carts (store_id, external_id, account_id, email, items, url, amount_cents, currency, status, updated_at) VALUES (?,?,?,?,?,?,?,?, 'open', ?)
     ON CONFLICT(store_id, external_id) DO UPDATE SET email = excluded.email, items = excluded.items, url = COALESCE(excluded.url, url), amount_cents = excluded.amount_cents,
       updated_at = excluded.updated_at, status = CASE WHEN status = 'recovered' THEN status ELSE 'open' END`,
  ).bind(s.id, cart.external_id, s.account_id, email, JSON.stringify(cart.items.slice(0, 30)), cart.url ?? null, cart.amount_cents, cart.currency, Date.now()).run();
  return { stored: true };
}

export async function ingestProduct(env: Env, s: Store, p: ProductIn) {
  if (!p.title) return;
  await env.DB.prepare(
    `INSERT INTO products (account_id, store_id, external_id, title, url, image, price_cents, currency, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(store_id, external_id) DO UPDATE SET title = excluded.title, url = excluded.url, image = excluded.image, price_cents = excluded.price_cents, updated_at = excluded.updated_at`,
  ).bind(s.account_id, s.id, p.external_id, p.title.slice(0, 300), httpsUrl(p.url), httpsUrl(p.image), p.price_cents ?? null, p.currency ?? s.currency, Date.now()).run();
}

/** Cron: carts idle for `abandon_minutes` become abandoned → tag `cart-abandoned` starts the recovery funnel. */
export async function processCarts(env: Env, now = Date.now()) {
  const due = await env.DB.prepare(
    `SELECT c.store_id, c.external_id, c.account_id, c.email, s.settings, s.platform FROM carts c JOIN stores s ON s.id = c.store_id
      WHERE c.status = 'open' AND c.updated_at < ? LIMIT 100`,
  ).bind(now - 15 * 60_000).all<{ store_id: string; external_id: string; account_id: string; email: string; settings: string; platform: Store["platform"] }>();
  let n = 0;
  for (const c of due.results) {
    const mins = settingsOf({ settings: c.settings, platform: c.platform } as Store).abandon_minutes;
    const row = await env.DB.prepare("SELECT updated_at FROM carts WHERE store_id = ? AND external_id = ?").bind(c.store_id, c.external_id).first<{ updated_at: number }>();
    if (!row || row.updated_at > now - mins * 60_000) continue;
    const bought = await env.DB.prepare("SELECT 1 AS x FROM orders WHERE account_id = ? AND email = ? AND created_at > ?").bind(c.account_id, c.email, row.updated_at - 60_000).first();
    await env.DB.prepare("UPDATE carts SET status = ? WHERE store_id = ? AND external_id = ?").bind(bought ? "recovered" : "abandoned", c.store_id, c.external_id).run();
    if (bought) continue;
    await env.DB.prepare("INSERT INTO activities (account_id, email, type, data, created_at) VALUES (?,?, 'cart_abandoned', ?, ?)").bind(c.account_id, c.email, JSON.stringify({ store: c.store_id, cart: c.external_id }), now).run();
    await applyTags(env, c.account_id, c.email, ["cart-abandoned"], ["purchased"]);
    n++;
  }
  return n;
}

const money = (c: number, cur: string | null) => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(c / 100); } catch { return `${(c / 100).toFixed(2)} ${cur ?? ""}`; }
};

/** Merge tags for e-mails: {{cart_url}}, {{cart_total}}, {{cart_items_html}}, {{products_html}}. */
export async function commerceVars(env: Env, accountId: string, email: string, tpl: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (tpl.includes("{{cart_") || tpl.includes("{{ cart_")) {
    const c = await env.DB.prepare("SELECT items, url, amount_cents, currency FROM carts WHERE account_id = ? AND email = ? AND status IN ('open','abandoned') ORDER BY updated_at DESC LIMIT 1").bind(accountId, email).first<{ items: string; url: string | null; amount_cents: number; currency: string | null }>();
    if (c) {
      const items = JSON.parse(c.items) as Item[];
      const ids = items.map((i) => i.product_id).filter(Boolean) as string[];
      const imgs = ids.length ? await env.DB.prepare(`SELECT external_id, image, url FROM products WHERE account_id = ? AND external_id IN (${ids.map(() => "?").join(",")})`).bind(accountId, ...ids).all<{ external_id: string; image: string | null; url: string | null }>() : { results: [] };
      const pm = new Map(imgs.results.map((p) => [p.external_id, p]));
      out.cart_url = c.url ?? "";
      out.cart_total = money(c.amount_cents, c.currency);
      out.cart_items_html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map((i) => {
        const img = httpsUrl(i.image) ?? (i.product_id ? httpsUrl(pm.get(i.product_id)?.image) : null);
        return `<tr><td width="72" style="padding:8px 12px 8px 0">${img ? `<img src="${esc(img)}" width="64" height="64" alt="" style="display:block;border-radius:8px;object-fit:cover">` : ""}</td><td style="padding:8px 0;font-size:15px">${esc(i.title)}<br><span style="color:#71717a;font-size:13px">× ${i.qty}</span></td><td align="right" style="padding:8px 0;font-size:15px;font-weight:600">${esc(money(i.price_cents * i.qty, c.currency))}</td></tr>`;
      }).join("")}</table>`;
    } else Object.assign(out, { cart_url: "", cart_total: "", cart_items_html: "" });
  }
  if (tpl.includes("{{products_html}}")) {
    const ps = await env.DB.prepare("SELECT title, url, image, price_cents, currency FROM products WHERE account_id = ? AND image IS NOT NULL ORDER BY updated_at DESC LIMIT 3").bind(accountId).all<{ title: string; url: string | null; image: string; price_cents: number | null; currency: string | null }>();
    out.products_html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${ps.results.map((p) => `<td width="33%" valign="top" style="padding:6px"><a href="${esc(p.url ?? "#")}" style="color:inherit;text-decoration:none"><img src="${esc(p.image)}" width="100%" alt="" style="display:block;border-radius:10px;width:100%;height:auto"><div style="margin-top:8px;font-size:14px;font-weight:600">${esc(p.title)}</div>${p.price_cents != null ? `<div style="font-size:13px;color:#71717a">${esc(money(p.price_cents, p.currency))}</div>` : ""}</a></td>`).join("")}</tr></table>`;
  }
  return out;
}

// ---------------------------------------------------------------- dashboard / API

export const stores = new Hono<AppEnv>();

const storeInput = z.object({
  platform: z.enum(["shopify", "woocommerce", "custom"]),
  name: z.string().min(1).max(100),
  url: z.string().url().startsWith("https://").max(300).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  // Shopify: the key shown under Settings → Notifications → Webhooks ("signed with …").
  signing_secret: z.string().min(16).max(200).optional(),
  settings: z.object({ abandon_minutes: z.number().int().min(15).max(7 * 1440).optional(), require_consent: z.boolean().optional(), list_id: z.string().max(64).nullable().optional() }).optional(),
});

function hookInfo(env: Env, s: { id: string; platform: string }) {
  const url = `${env.PUBLIC_URL}/hooks/store/${s.id}`;
  return s.platform === "shopify"
    ? { webhook_url: url, topics: ["orders/create", "checkouts/create", "checkouts/update", "products/create", "products/update"], format: "JSON" }
    : s.platform === "woocommerce"
      ? { webhook_url: url, topics: ["Order created", "Order updated", "Product created", "Product updated"], api_version: "WP REST API v3" }
      : { api: ["POST /commerce/orders", "POST /commerce/carts", "POST /commerce/products"], webhook_url: url };
}

stores.get("/", async (c) => {
  const p = c.get("principal");
  const r = await c.env.DB.prepare(
    `SELECT s.id, s.platform, s.name, s.url, s.currency, s.settings, s.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM orders o WHERE o.store_id = s.id AND o.email_id IS NOT NULL) AS attributed_cents,
            (SELECT COUNT(*) FROM products x WHERE x.store_id = s.id) AS products,
            (SELECT COUNT(*) FROM carts k WHERE k.store_id = s.id AND k.status = 'abandoned') AS abandoned,
            (SELECT COUNT(*) FROM carts k WHERE k.store_id = s.id AND k.status = 'recovered') AS recovered
       FROM stores s WHERE s.account_id = ? ORDER BY s.created_at`,
  ).bind(p.accountId).all<any>();
  return c.json({ object: "list", data: r.results.map((s) => ({ ...s, settings: JSON.parse(s.settings), ...hookInfo(c.env, s) })) });
});

stores.post("/", async (c) => {
  const p = c.get("principal");
  const b = storeInput.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const id = prefixedId("st");
  const secret = b.data.signing_secret ?? `whsec_${randomToken(24)}`;
  await c.env.DB.prepare("INSERT INTO stores (id, account_id, platform, name, url, secret, currency, settings, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.data.platform, b.data.name, b.data.url ?? null, await seal(secret, c.env.ENCRYPTION_KEY), b.data.currency, JSON.stringify(b.data.settings ?? {}), Date.now()).run();
  // The generated secret is shown once (WooCommerce/custom); a Shopify key is never echoed back.
  return c.json({ object: "store", id, ...hookInfo(c.env, { id, platform: b.data.platform }), ...(b.data.signing_secret ? {} : { secret }) }, 201);
});

stores.patch("/:id", async (c) => {
  const p = c.get("principal");
  const s = await c.env.DB.prepare("SELECT * FROM stores WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<Store>();
  if (!s) throw errors.notFound("Store");
  const b = storeInput.partial().safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const settings = { ...JSON.parse(s.settings), ...(b.data.settings ?? {}) };
  await c.env.DB.prepare("UPDATE stores SET name = ?, url = ?, currency = ?, settings = ?, secret = ? WHERE id = ?")
    .bind(b.data.name ?? s.name, b.data.url ?? s.url, b.data.currency ?? s.currency, JSON.stringify(settings), b.data.signing_secret ? await seal(b.data.signing_secret, c.env.ENCRYPTION_KEY) : s.secret, s.id).run();
  return c.json({ object: "store", id: s.id, updated: true });
});

stores.delete("/:id", async (c) => {
  const p = c.get("principal");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM carts WHERE store_id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId),
    c.env.DB.prepare("DELETE FROM products WHERE store_id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId),
    c.env.DB.prepare("DELETE FROM stores WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId),
  ]);
  return c.json({ deleted: true }); // orders are kept for revenue history
});

// Generic API for any store (custom code, WooCommerce carts via a plugin, Zapier/Make).
export const commerceApi = new Hono<AppEnv>();
const itemSchema = z.object({ title: z.string().min(1).max(300), qty: z.number().int().min(1).max(10_000).default(1), price_cents: z.number().int().min(0), image: z.string().max(500).optional(), url: z.string().max(500).optional(), product_id: z.string().max(100).optional() });
async function storeFor(env: Env, accountId: string, id: string) {
  const s = await env.DB.prepare("SELECT * FROM stores WHERE id = ? AND account_id = ?").bind(id, accountId).first<Store>();
  if (!s) throw errors.notFound("Store");
  return s;
}
commerceApi.post("/orders", async (c) => {
  const b = z.object({ store_id: z.string(), id: z.string().min(1).max(100), email: z.email().optional(), first_name: z.string().max(100).optional(), last_name: z.string().max(100).optional(), total_cents: z.number().int().min(0), currency: z.string().regex(/^[A-Z]{3}$/).default("USD"), items: z.array(itemSchema).max(100).default([]), accepts_marketing: z.boolean().optional(), created_at: z.number().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const s = await storeFor(c.env, c.get("principal").accountId, b.data.store_id);
  return c.json({ object: "order", ...(await ingestOrder(c.env, s, { ...b.data, external_id: b.data.id, amount_cents: b.data.total_cents })) }, 201);
});
commerceApi.post("/carts", async (c) => {
  const b = z.object({ store_id: z.string(), id: z.string().min(1).max(100), email: z.email(), first_name: z.string().max(100).optional(), checkout_url: z.string().url().startsWith("https://").optional(), total_cents: z.number().int().min(0), currency: z.string().regex(/^[A-Z]{3}$/).default("USD"), items: z.array(itemSchema).min(1).max(100), accepts_marketing: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const s = await storeFor(c.env, c.get("principal").accountId, b.data.store_id);
  return c.json({ object: "cart", ...(await ingestCart(c.env, s, { ...b.data, external_id: b.data.id, url: b.data.checkout_url, amount_cents: b.data.total_cents })) }, 201);
});
commerceApi.post("/products", async (c) => {
  const b = z.object({ store_id: z.string(), products: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(300), url: z.string().max(500).optional(), image: z.string().max(500).optional(), price_cents: z.number().int().min(0).optional() })).min(1).max(500) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const s = await storeFor(c.env, c.get("principal").accountId, b.data.store_id);
  for (const p of b.data.products) await ingestProduct(c.env, s, { ...p, external_id: p.id });
  return c.json({ object: "products", upserted: b.data.products.length }, 201);
});

// ---------------------------------------------------------------- signed store webhooks (public)

export const storeHooks = new Hono<AppEnv>();

async function hmacB64(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}

storeHooks.post("/:id", async (c) => {
  const s = await c.env.DB.prepare("SELECT * FROM stores WHERE id = ?").bind(c.req.param("id")).first<Store>();
  if (!s) return c.json({ error: "unknown store" }, 404);
  const body = await c.req.text();
  // WooCommerce pings a new webhook with an unsigned form body ("webhook_id=…"): acknowledge it.
  if (s.platform === "woocommerce" && /^webhook_id=\d+$/.test(body.trim())) return c.json({ ok: true });
  const sig = c.req.header("x-shopify-hmac-sha256") ?? c.req.header("x-wc-webhook-signature") ?? c.req.header("x-novamail-signature") ?? "";
  const secret = await open(s.secret, c.env.ENCRYPTION_KEY);
  if (!sig || !safeEqual(sig, await hmacB64(secret, body))) return c.json({ error: "invalid signature" }, 401);
  let data: any;
  try { data = JSON.parse(body); } catch { return c.json({ error: "invalid json" }, 400); }
  const topic = (c.req.header("x-shopify-topic") ?? c.req.header("x-wc-webhook-topic") ?? c.req.header("x-novamail-topic") ?? "").toLowerCase();
  const work = (async () => {
    if (s.platform === "shopify") {
      if (topic.startsWith("orders/")) await ingestOrder(c.env, s, shopify.order(data));
      else if (topic.startsWith("checkouts/")) await ingestCart(c.env, s, shopify.cart(data));
      else if (topic.startsWith("products/")) await ingestProduct(c.env, s, shopify.product(data, s.url));
    } else if (s.platform === "woocommerce") {
      if (topic.startsWith("order.") && ["processing", "completed", "on-hold"].includes(data.status)) await ingestOrder(c.env, s, woo.order(data));
      else if (topic.startsWith("product.")) await ingestProduct(c.env, s, woo.product(data));
    }
  })();
  c.executionCtx.waitUntil(work.catch((e) => console.log(JSON.stringify({ level: "error", store_hook: s.id, topic, error: String(e) }))));
  return c.json({ ok: true });
});
