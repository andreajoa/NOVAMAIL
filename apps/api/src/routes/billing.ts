// Stripe billing over plain fetch (no SDK in the Worker): Checkout for upgrades, the
// Customer Portal for card/cancel, and a signed webhook that moves accounts between plans.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { poolFor } from "../lib/accounts";
import { safeEqual } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { PAID_PLANS, planOf, type PaidPlan, type PlanId } from "../lib/plans";
import { postalAdmin } from "../lib/postal";

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

const priceFor = (env: Env, plan: PaidPlan) => (plan === "pro" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_SCALE);
const planForPrice = (env: Env, price: string | undefined): PlanId | null =>
  price && price === env.STRIPE_PRICE_PRO ? "pro" : price && price === env.STRIPE_PRICE_SCALE ? "scale" : null;

/** Moves an account to `plan`, pushing hourly limit + IP pool to Postal. */
export async function applyPlan(env: Env, accountId: string, plan: PlanId, sub: { customer?: string; subscription?: string | null }) {
  const a = await env.DB.prepare("SELECT plan, postal_org, postal_server FROM accounts WHERE id = ?").bind(accountId).first<{ plan: PlanId; postal_org: string | null; postal_server: string | null }>();
  if (!a || a.plan === "internal") return;
  const pool = poolFor(plan);
  if (a.postal_org && a.postal_server) await postalAdmin.setLimits(env, { org: a.postal_org, server: a.postal_server, hourly_limit: planOf(plan).hourly || null, ip_pool: pool });
  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET plan = ?, ip_pool = ?, stripe_customer = COALESCE(?, stripe_customer), stripe_subscription = ?, updated_at = ? WHERE id = ?")
      .bind(plan, pool, sub.customer ?? null, sub.subscription ?? null, Date.now(), accountId),
    env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, 'stripe', 'plan', ?, ?)").bind(accountId, `${a.plan} -> ${plan}`, Date.now()),
  ]);
}

export const billing = new Hono<AppEnv>();

billing.get("/plans", (c) =>
  c.json({
    enabled: !!c.env.STRIPE_SECRET_KEY,
    data: (["free", ...PAID_PLANS] as PlanId[]).map((id) => {
      const p = planOf(id);
      return { id, label: p.label, price_usd: p.priceUsd, monthly: p.monthly, daily: p.daily, domains: p.domains };
    }),
  }),
);

billing.post("/checkout", async (c) => {
  const parsed = z.object({ plan: z.enum(PAID_PLANS) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const price = priceFor(c.env, parsed.data.plan);
  if (!price) throw new ApiError(503, "billing_disabled", "Billing is not enabled yet.");
  const p = c.get("principal");
  const a = await c.env.DB.prepare("SELECT email, stripe_customer FROM accounts WHERE id = ?").bind(p.accountId).first<{ email: string; stripe_customer: string | null }>();
  const app = c.env.APP_URL ?? c.env.PUBLIC_URL;
  const s = await stripe<{ url: string }>(c.env, "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    client_reference_id: p.accountId,
    "metadata[account_id]": p.accountId,
    "subscription_data[metadata][account_id]": p.accountId,
    ...(a?.stripe_customer ? { customer: a.stripe_customer } : { customer_email: a?.email }),
    allow_promotion_codes: "true",
    success_url: `${app}/plan?upgraded=1`,
    cancel_url: `${app}/plan`,
  });
  return c.json({ url: s.url });
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
      const plan = planForPrice(c.env, sub.items?.data?.[0]?.price?.id);
      if (plan) await applyPlan(c.env, accountId, plan, { customer: o.customer, subscription: o.subscription });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const accountId = o.metadata?.account_id;
      if (!accountId) break;
      const active = evt.type === "customer.subscription.updated" && ["active", "trialing", "past_due"].includes(o.status);
      const plan = active ? planForPrice(c.env, o.items?.data?.[0]?.price?.id) : "free";
      if (plan) await applyPlan(c.env, accountId, plan, { customer: o.customer, subscription: active ? o.id : null });
      break;
    }
  }
  return c.json({ received: true });
});
