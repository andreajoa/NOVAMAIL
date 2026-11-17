import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { lang, num, t } from "../i18n";
import { Badge, Button, Card, ErrorText, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { month: "/mês", year: "/ano", monthly: "Mensal", yearly: "Anual", save: "2 meses grátis", current: "Plano atual", upgrade: "Assinar", manage: "Gerenciar assinatura", free: "Grátis", emails: "e-mails por mês", day: "por dia", doms: "domínios", soon: "A cobrança online será ligada em breve.", ok: "Assinatura ativa. Os novos limites já valem.", checking: "Confirmando pagamento…", packs: "pacotes extras", packHint: (n: string, p: number) => `No checkout você pode adicionar pacotes de +${n} e-mails/mês por US$${p} cada.`, perYear: (v: number) => `US$${v}/ano`, close: "Fechar" }
  : { month: "/mo", year: "/yr", monthly: "Monthly", yearly: "Yearly", save: "2 months free", current: "Current plan", upgrade: "Upgrade", manage: "Manage subscription", free: "Free", emails: "emails per month", day: "per day", doms: "domains", soon: "Online billing is coming soon.", ok: "Subscription active. New limits apply now.", checking: "Confirming payment…", packs: "add-on packs", packHint: (n: string, p: number) => `At checkout you can add +${n} emails/month packs for $${p} each.`, perYear: (v: number) => `$${v}/yr`, close: "Close" };

function EmbeddedCheckout({ publishableKey, clientSecret, onClose }: { publishableKey: string; clientSecret: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let checkout: StripeEmbeddedCheckout | undefined;
    let cancelled = false;
    loadStripe(publishableKey).then(async (stripe) => {
      if (!stripe || cancelled) return;
      const page = await stripe.createEmbeddedCheckoutPage({ clientSecret });
      checkout = page;
      if (cancelled) page.destroy();
      else page.mount(ref.current!);
    });
    return () => {
      cancelled = true;
      checkout?.destroy();
    };
  }, [publishableKey, clientSecret]);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-2 shadow-2xl">
        <div className="flex justify-end p-1">
          <button onClick={onClose} aria-label={L.close} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
        </div>
        <div ref={ref} />
      </div>
    </div>
  );
}

export function Plan() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [secret, setSecret] = useState<string | null>(null);
  const sessionId = new URLSearchParams(location.search).get("session_id");
  const confirm = useQuery({
    queryKey: ["checkout-session", sessionId],
    queryFn: () => api(`/billing/session/${sessionId}`),
    enabled: !!sessionId,
  });
  useEffect(() => {
    if (confirm.data?.status === "complete") qc.invalidateQueries({ queryKey: ["me"] });
  }, [confirm.data, qc]);

  // Arriving from the website's "Subscribe" buttons: open checkout for that plan/interval right away.
  const [intent] = useState<{ plan: string; interval: "month" | "year" } | null>(() => { try { const v = sessionStorage.getItem("nm_intent"); sessionStorage.removeItem("nm_intent"); return v ? JSON.parse(v) : null; } catch { return null; } });
  const checkout = useMutation({ mutationFn: (plan: string) => api("/billing/checkout", { body: { plan, interval: intent?.interval ?? interval, embedded: true } }), onSuccess: (r) => setSecret(r.client_secret) });
  const portal = useMutation({ mutationFn: () => api("/billing/portal", { method: "POST" }), onSuccess: (r) => (location.href = r.url) });
  useEffect(() => {
    if (!intent || !plans.data?.enabled || !me.data) return;
    if (intent.interval === "year") setInterval("year");
    if (["pro", "scale"].includes(intent.plan) && !me.data.plan.subscribed) checkout.mutate(intent.plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, plans.data, me.data]);
  const current = me.data?.plan?.id;
  const subscribed = me.data?.plan?.subscribed;
  const cfg = plans.data;
  const enabled = cfg?.enabled;

  return (
    <>
      <PageTitle action={subscribed && enabled ? <Button variant="ghost" onClick={() => portal.mutate()}>{L.manage}</Button> : undefined}>{t.plan}</PageTitle>
      {sessionId && (
        <p className="mb-4 rounded-lg border border-zinc-900 px-4 py-3 text-sm font-medium dark:border-white">
          {confirm.data?.status === "complete" ? L.ok : L.checking}
        </p>
      )}
      {cfg?.yearly && (
        <div className="mb-6 inline-flex rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
          {(["month", "year"] as const).map((i) => (
            <button key={i} onClick={() => setInterval(i)} className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${interval === i ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"}`}>
              {i === "month" ? L.monthly : L.yearly}
              {i === "year" && <span className={`rounded-full border px-2 py-0.5 text-[11px] ${interval === i ? "border-white/40 dark:border-zinc-900/30" : "border-zinc-300 dark:border-zinc-700"}`}>{L.save}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {(cfg?.data ?? []).map((p: any) => {
          const yearly = interval === "year" && p.price_usd > 0;
          return (
            <Card key={p.id} className={p.id === current ? "ring-2 ring-zinc-900 dark:ring-white" : ""}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{p.label}</h2>
                {p.id === current && <Badge value={L.current} />}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{p.price_usd ? `US$${yearly ? (p.price_usd_year / 12).toFixed(2).replace(/\.00$/, "") : p.price_usd}` : L.free}</span>
                {p.price_usd > 0 && <span className="text-sm text-zinc-500">{L.month}</span>}
              </div>
              {yearly && <div className="text-xs text-zinc-500">{pt ? `cobrado US$${p.price_usd_year}/ano · economize US$${p.price_usd * 2}` : `billed $${p.price_usd_year}/year · save $${p.price_usd * 2}`}</div>}
              <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.monthly)} {L.emails}</li>
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.daily)} {L.day}</li>
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.domains)} {L.doms}</li>
              </ul>
              {p.id !== "free" && p.id !== current && current !== "internal" && !subscribed && (
                <Button className="mt-5 w-full" disabled={!enabled || checkout.isPending} onClick={() => checkout.mutate(p.id)}>{pt ? `Assinar ${p.label} ${interval === "year" ? "anual" : "mensal"}` : `Subscribe ${interval === "year" ? "yearly" : "monthly"}`}</Button>
              )}
            </Card>
          );
        })}
      </div>
      {cfg?.extra_pack?.available && <p className="mt-4 text-sm text-zinc-500">{L.packHint(num(cfg.extra_pack.monthly), interval === "year" ? cfg.extra_pack.priceUsdYear : cfg.extra_pack.priceUsd)}</p>}
      {me.data?.plan?.extra_packs > 0 && <p className="mt-2 text-sm text-zinc-500">{me.data.plan.extra_packs} {L.packs}</p>}
      {cfg && !enabled && <p className="mt-4 text-sm text-zinc-500">{L.soon}</p>}
      <div className="mt-3"><ErrorText error={checkout.error ?? portal.error ?? confirm.error} /></div>
      {secret && cfg?.publishable_key && <EmbeddedCheckout publishableKey={cfg.publishable_key} clientSecret={secret} onClose={() => setSecret(null)} />}
    </>
  );
}
