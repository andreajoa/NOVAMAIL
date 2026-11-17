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
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", label: "Free", monthly: 3_000, daily: 100, hourly: 100, domains: 1, ipPool: "shared" },
  pro: { id: "pro", label: "Pro", monthly: 50_000, daily: 10_000, hourly: 2_000, domains: 10, ipPool: "trusted" },
  scale: { id: "scale", label: "Scale", monthly: 250_000, daily: 50_000, hourly: 10_000, domains: 100, ipPool: "trusted" },
  // André's own brands (Gilberto, AMB, Atenza, Trilha, FlowNexa, NexaCloud).
  internal: { id: "internal", label: "Internal", monthly: 10_000_000, daily: 1_000_000, hourly: 50_000, domains: 1_000, ipPool: "trusted" },
};

export function planOf(id: string): Plan {
  return PLANS[(id in PLANS ? id : "free") as PlanId];
}
