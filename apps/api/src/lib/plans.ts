// Plans are the single source of truth for quotas. Prices live in Stripe;
// here we only keep limits so the API can enforce them without a network call.
//
// Pricing rule (André, 26/11/2026): every plan is paid and profitable even at full use.
// Sending runs on Cloudflare Email Service (US$0.35 per 1,000 emails after the 3,000
// included in Workers Paid), so each plan keeps >= 50% margin after Stripe fees.
// There is no free sending: a new account can build lists, templates and funnels,
// but sends nothing until it subscribes ("none" is stored as plan = 'free' in the DB).

export type PlanId = "free" | "starter" | "pro" | "scale" | "internal";

export interface Plan {
  id: PlanId;
  label: string;
  monthly: number; // emails per calendar month (UTC)
  daily: number; // emails per UTC day
  hourly: number; // pushed to Postal as server.send_limit (Postal enforces per 60 min)
  domains: number;
  ipPool: "shared" | "trusted" | "dedicated";
  priceUsd: number; // monthly list price shown in the dashboard (Stripe holds the real price)
  unlimited?: boolean; // André's own brands only
  canSend: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  // No subscription yet: set up everything, send nothing.
  free: { id: "free", label: "No plan", monthly: 0, daily: 0, hourly: 0, domains: 1, ipPool: "shared", priceUsd: 0, canSend: false },
  starter: { id: "starter", label: "Starter", monthly: 10_000, daily: 2_000, hourly: 1_000, domains: 3, ipPool: "trusted", priceUsd: 12, canSend: true },
  pro: { id: "pro", label: "Pro", monthly: 30_000, daily: 10_000, hourly: 2_000, domains: 10, ipPool: "trusted", priceUsd: 25, canSend: true },
  scale: { id: "scale", label: "Scale", monthly: 100_000, daily: 30_000, hourly: 10_000, domains: 100, ipPool: "trusted", priceUsd: 79, canSend: true },
  // André's own brands (Gilberto, AMB, Atenza, Trilha, FlowNexa, NexaCloud): no plan limits at all.
  internal: { id: "internal", label: "Internal", monthly: 0, daily: 0, hourly: 0, domains: 100_000, ipPool: "trusted", priceUsd: 0, unlimited: true, canSend: true },
};

export const isUnlimited = (p: Plan) => !!p.unlimited;

export function planOf(id: string): Plan {
  return PLANS[(id in PLANS ? id : "free") as PlanId];
}

export const PAID_PLANS = ["starter", "pro", "scale"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** Yearly = pay 10 months, get 12. */
export const yearlyPrice = (p: Plan) => p.priceUsd * 10;

/** One add-on pack bought in Checkout adds this much to the plan's limits. */
export const EXTRA_PACK = { monthly: 10_000, daily: 2_000, priceUsd: 10, priceUsdYear: 100 };

/** Effective limits = plan + purchased packs (internal stays unlimited; no packs without a plan). */
export function limitsOf(planId: string, packs = 0) {
  const p = planOf(planId);
  if (isUnlimited(p) || !p.canSend || !packs) return p;
  return { ...p, monthly: p.monthly + packs * EXTRA_PACK.monthly, daily: p.daily + packs * EXTRA_PACK.daily };
}
