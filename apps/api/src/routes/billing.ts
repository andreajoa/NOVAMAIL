// Stripe billing over plain fetch (no SDK in the Worker): Checkout for upgrades, the
// Customer Portal for card/cancel, and a signed webhook that moves accounts between plans.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { poolFor } from "../lib/accounts";
import { safeEqual } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { EXTRA_PACK, PAID_PLANS, planOf, type PaidPlan, type PlanId } from "../lib/plans";
import { postalAdmin } from "../lib/postal";
import { onPlanChange } from "../lib/lifecycle";

const STRIPE = "https://api.stripe.com/v1";

function form(obj: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.set(k, String(v));
  return p;
}

export async function stripe<T = any>(env: Env, path: string, body?: Record<string, string | number | undefined>, fetcher: typeof fetch = fetch): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new ApiError(503, "billing_disabled", "Billing is not enabled yet.");
  const res = await fetcher(`${STRIPE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: body ? form(body) : undefined,
  });
  const j = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new ApiError(502, "stripe_error", j.error?.message ?? `Stripe ${res.status}`);
  return j;
}

type Interval = "month" | "year";
const priceFor = (env: Env, plan: PaidPlan, interval: Interval) =>
  interval === "year" ? (plan === "pro" ? env.STRIPE_PRICE_PRO_YEAR : env.STRIPE_PRICE_SCALE_YEAR) : plan === "pro" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_SCALE;
const extraPriceFor = (env: Env, interval: Interval) => (interval === "year" ? env.STRIPE_PRICE_EXTRA_YEAR : env.STRIPE_PRICE_EXTRA);
const planForPrice = (env: Env, price: string | undefined): PlanId | null =>
  !price ? null : [env.STRIPE_PRICE_PRO, env.STRIPE_PRICE_PRO_YEAR].includes(price) ? "pro" : [env.STRIPE_PRICE_SCALE, env.STRIPE_PRICE_SCALE_YEAR].includes(price) ? "scale" : null;

/** Reads plan, interval and add-on packs from a Stripe subscription's items. */
export function readSubscription(env: Env, sub: { items?: { data?: { price?: { id?: string; recurring?: { interval?: string } }; quantity?: number }[] } }) {
  let plan: PlanId | null = null;
  let interval: string | null = null;
  let packs = 0;
  for (const it of sub.items?.data ?? []) {
    const id = it.price?.id;
    const pl = planForPrice(env, id);
    if (pl) (plan = pl), (interval = it.price?.recurring?.interval ?? null);
    else if (id && (id === env.STRIPE_PRICE_EXTRA || id === env.STRIPE_PRICE_EXTRA_YEAR)) packs += it.quantity ?? 1;
  }
  return { plan, interval, packs };
}

/** Moves an account to `plan`, pushing hourly limit + IP pool to Postal. */
export async function applyPlan(env: Env, accountId: string, plan: PlanId, sub: { customer?: string; subscription?: string | null; packs?: number; interval?: string | null }) {
  const a = await env.DB.prepare("SELECT plan, email, extra_packs, billing_interval, postal_org, postal_server FROM accounts WHERE id = ?").bind(accountId).first<{ plan: PlanId; email: string; extra_packs: number; billing_interval: string | null; postal_org: string | null; postal_server: string | null }>();
  if (!a || a.plan === "internal") return;
  const pool = poolFor(plan);
  if (a.postal_org && a.postal_server) await postalAdmin.setLimits(env, { org: a.postal_org, server: a.postal_server, hourly_limit: planOf(plan).hourly || null, ip_pool: pool });
  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET plan = ?, ip_pool = ?, stripe_customer = COALESCE(?, stripe_customer), stripe_subscription = ?, extra_packs = ?, billing_interval = ?, updated_at = ? WHERE id = ?")
      .bind(plan, pool, sub.customer ?? null, sub.subscription ?? null, sub.packs ?? 0, sub.interval ?? null, Date.now(), accountId),
    env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, 'stripe', 'plan', ?, ?)").bind(accountId, `${a.plan} -> ${plan}`, Date.now()),
  ]);
  const changed = a.plan !== plan || (a.extra_packs ?? 0) !== (sub.packs ?? 0) || a.billing_interval !== (sub.interval ?? null);
  if (changed) await onPlanChange(env, a.email, plan, sub.interval ?? null, sub.packs ?? 0, a.plan);
}

export const billing = new Hono<AppEnv>();

billing.get("/plans", (c) =>
  c.json({
    enabled: !!c.env.STRIPE_SECRET_KEY,
    publishable_key: c.env.STRIPE_PUBLISHABLE_KEY ?? null,
    yearly: !!(c.env.STRIPE_PRICE_PRO_YEAR && c.env.STRIPE_PRICE_SCALE_YEAR),
    extra_pack: { ...EXTRA_PACK, available: !!c.env.STRIPE_PRICE_EXTRA },
    data: (["free", ...PAID_PLANS] as PlanId[]).map((id) => {
      const p = planOf(id);
      return { id, label: p.label, price_usd: p.priceUsd, price_usd_year: p.priceUsd * 10, monthly: p.monthly, daily: p.daily, domains: p.domains };
    }),
  }),
);

billing.post("/checkout", async (c) => {
  const parsed = z.object({ plan: z.enum(PAID_PLANS), interval: z.enum(["month", "year"]).default("month"), embedded: z.boolean().default(true) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const { plan, interval, embedded } = parsed.data;
  const price = priceFor(c.env, plan, interval);
  if (!price) throw new ApiError(503, "billing_disabled", "Billing is not enabled yet.");
  const p = c.get("principal");
  const a = await c.env.DB.prepare("SELECT email, stripe_customer, stripe_subscription FROM accounts WHERE id = ?").bind(p.accountId).first<{ email: string; stripe_customer: string | null; stripe_subscription: string | null }>();
  if (a?.stripe_subscription) throw errors.conflict("You already have a subscription — change it from Manage subscription.");
  const app = c.env.APP_URL ?? c.env.PUBLIC_URL;
  const extra = extraPriceFor(c.env, interval);
  const s = await stripe<{ url?: string; client_secret?: string; id: string }>(c.env, "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    // Value-adding upsell inside Checkout: extra sending capacity, quantity adjustable by the buyer.
    ...(extra
      ? {
          "optional_items[0][price]": extra,
          "optional_items[0][quantity]": 1,
          "optional_items[0][adjustable_quantity][enabled]": "true",
          "optional_items[0][adjustable_quantity][minimum]": 1,
          "optional_items[0][adjustable_quantity][maximum]": 20,
        }
      : {}),
    client_reference_id: p.accountId,
    "metadata[account_id]": p.accountId,
    "subscription_data[metadata][account_id]": p.accountId,
    ...(a?.stripe_customer ? { customer: a.stripe_customer } : { customer_email: a?.email }),
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    "automatic_tax[enabled]": c.env.STRIPE_AUTOMATIC_TAX === "true" ? "true" : undefined,
    ...(embedded
      ? { ui_mode: "embedded", return_url: `${app}/plan?session_id={CHECKOUT_SESSION_ID}` }
      : { success_url: `${app}/plan?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${app}/plan` }),
  });
  return c.json(embedded ? { client_secret: s.client_secret, session_id: s.id } : { url: s.url });
});

/** After Checkout returns: confirm status and apply the plan immediately (webhook stays the source of truth). */
billing.get("/session/:id", async (c) => {
  const s = await stripe<{ status: string; client_reference_id?: string; subscription?: string; customer?: string }>(c.env, `/checkout/sessions/${encodeURIComponent(c.req.param("id"))}`);
  if (s.client_reference_id !== c.get("principal").accountId) throw errors.notFound("Session");
  if (s.status === "complete" && s.subscription) {
    const sub = await stripe(c.env, `/subscriptions/${s.subscription}`);
    const r = readSubscription(c.env, sub);
    if (r.plan) await applyPlan(c.env, c.get("principal").accountId, r.plan, { customer: s.customer, subscription: s.subscription, packs: r.packs, interval: r.interval });
  }
  return c.json({ status: s.status });
});

billing.post("/portal", async (c) => {
  const a = await c.env.DB.prepare("SELECT stripe_customer FROM accounts WHERE id = ?").bind(c.get("principal").accountId).first<{ stripe_customer: string | null }>();
  if (!a?.stripe_customer) throw errors.validation("No subscription yet.");
  const s = await stripe<{ url: string }>(c.env, "/billing_portal/sessions", { customer: a.stripe_customer, return_url: `${c.env.APP_URL ?? c.env.PUBLIC_URL}/plan` });
  return c.json({ url: s.url });
});

/** Verifies a Stripe-Signature header (t=…,v1=…) with a 5-minute tolerance. */
export async function verifyStripeSignature(body: string, header: string, secret: string, now = Date.now()) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return header.split(",").some((kv) => kv.startsWith("v1=") && safeEqual(kv.slice(3), hex));
}

export const stripeHooks = new Hono<AppEnv>();

stripeHooks.post("/", async (c) => {
  const body = await c.req.text();
  if (!c.env.STRIPE_WEBHOOK_SECRET || !(await verifyStripeSignature(body, c.req.header("stripe-signature") ?? "", c.env.STRIPE_WEBHOOK_SECRET))) {
    return c.json({ error: "invalid signature" }, 400);
  }
  const evt = JSON.parse(body) as { type: string; data: { object: any } };
  const o = evt.data.object;
  switch (evt.type) {
    case "checkout.session.completed": {
      const accountId = o.client_reference_id ?? o.metadata?.account_id;
      if (!accountId || !o.subscription) break;
      const sub = await stripe(c.env, `/subscriptions/${o.subscription}`);
      const r = readSubscription(c.env, sub);
      if (r.plan) await applyPlan(c.env, accountId, r.plan, { customer: o.customer, subscription: o.subscription, packs: r.packs, interval: r.interval });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const accountId = o.metadata?.account_id;
      if (!accountId) break;
      const active = evt.type === "customer.subscription.updated" && ["active", "trialing", "past_due"].includes(o.status);
      const r = active ? readSubscription(c.env, o) : { plan: "free" as PlanId, packs: 0, interval: null };
      if (r.plan) await applyPlan(c.env, accountId, r.plan, { customer: o.customer, subscription: active ? o.id : null, packs: r.packs, interval: r.interval });
      break;
    }
  }
  return c.json({ received: true });
});
