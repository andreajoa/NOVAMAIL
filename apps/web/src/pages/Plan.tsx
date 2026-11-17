import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "../api";
import { lang, num, t } from "../i18n";
import { Badge, Button, Card, ErrorText, PageTitle } from "../ui";

const L = lang === "pt"
  ? { month: "/mês", current: "Plano atual", upgrade: "Assinar", manage: "Gerenciar assinatura", free: "Grátis", emails: "e-mails por mês", day: "por dia", doms: "domínios", soon: "A cobrança online será ligada em breve. Fale com a gente para subir de plano.", ok: "Assinatura ativa. Os novos limites já valem." }
  : { month: "/mo", current: "Current plan", upgrade: "Upgrade", manage: "Manage subscription", free: "Free", emails: "emails per month", day: "per day", doms: "domains", soon: "Online billing is coming soon. Contact us to upgrade.", ok: "Subscription active. New limits apply now." };

export function Plan() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const checkout = useMutation({ mutationFn: (plan: string) => api("/billing/checkout", { body: { plan } }), onSuccess: (r) => (location.href = r.url) });
  const portal = useMutation({ mutationFn: () => api("/billing/portal", { method: "POST" }), onSuccess: (r) => (location.href = r.url) });
  const current = me.data?.plan?.id;
  const enabled = plans.data?.enabled;
  return (
    <>
      <PageTitle action={current && current !== "free" && current !== "internal" && enabled ? <Button variant="ghost" onClick={() => portal.mutate()}>{L.manage}</Button> : undefined}>{t.plan}</PageTitle>
      {new URLSearchParams(location.search).has("upgraded") && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">{L.ok}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data?.data ?? []).map((p: any) => (
          <Card key={p.id} className={p.id === current ? "ring-2 ring-zinc-900 dark:ring-white" : ""}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{p.label}</h2>
              {p.id === current && <Badge value={L.current} />}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight">{p.price_usd ? `US$${p.price_usd}` : L.free}</span>
              {p.price_usd > 0 && <span className="text-sm text-zinc-500">{L.month}</span>}
            </div>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.monthly)} {L.emails}</li>
              <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.daily)} {L.day}</li>
              <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.domains)} {L.doms}</li>
            </ul>
            {p.id !== "free" && p.id !== current && current !== "internal" && (
              <Button className="mt-5 w-full" disabled={!enabled || checkout.isPending} onClick={() => checkout.mutate(p.id)}>{L.upgrade}</Button>
            )}
          </Card>
        ))}
      </div>
      {plans.data && !enabled && <p className="mt-4 text-sm text-zinc-500">{L.soon}</p>}
      <div className="mt-3"><ErrorText error={checkout.error ?? portal.error} /></div>
    </>
  );
}
