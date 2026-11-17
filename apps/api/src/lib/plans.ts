// Plans are the single source of truth for quotas. Prices live in Stripe;
// here we only keep limits so the API can enforce them without a network call.

export type PlanId = "free" | "pro" | "scale" | "internal";

export interface Plan {
  id: PlanId;
  label: string;
  monthly: number; // emails per calendar month (UTC)
  daily: number; // emails per UTC day
  hourly: number; // pushed to Postal as server.send_limit (Postal enforces per 60 min)
  domains: number;
  ipPool: "shared" | "trusted" | "dedicated";
  priceUsd: number; // monthly list price shown in the dashboard (Stripe holds the real price)
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", label: "Free", monthly: 3_000, daily: 100, hourly: 100, domains: 1, ipPool: "shared", priceUsd: 0 },
  pro: { id: "pro", label: "Pro", monthly: 50_000, daily: 10_000, hourly: 2_000, domains: 10, ipPool: "trusted", priceUsd: 15 },
  scale: { id: "scale", label: "Scale", monthly: 250_000, daily: 50_000, hourly: 10_000, domains: 100, ipPool: "trusted", priceUsd: 60 },
  // André's own brands (Gilberto, AMB, Atenza, Trilha, FlowNexa, NexaCloud): no plan limits at all
  // (0 = unlimited). The only real ceiling is IP warm-up with the mailbox providers.
  internal: { id: "internal", label: "Internal", monthly: 0, daily: 0, hourly: 0, domains: 100_000, ipPool: "trusted", priceUsd: 0 },
};

export const isUnlimited = (p: Plan) => p.monthly === 0;

export function planOf(id: string): Plan {
  return PLANS[(id in PLANS ? id : "free") as PlanId];
}

export const PAID_PLANS = ["pro", "scale"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** One add-on pack bought in Checkout adds this much to the plan's limits. */
export const EXTRA_PACK = { monthly: 50_000, daily: 5_000, priceUsd: 10, priceUsdYear: 100 };

/** Effective limits = plan + purchased packs (internal stays unlimited). */
export function limitsOf(planId: string, packs = 0) {
  const p = planOf(planId);
  if (isUnlimited(p) || !packs) return p;
  return { ...p, monthly: p.monthly + packs * EXTRA_PACK.monthly, daily: p.daily + packs * EXTRA_PACK.daily };
}
