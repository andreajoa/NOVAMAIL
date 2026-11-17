import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { lang, num, t } from "../i18n";
import { Badge, Button, Card, ErrorText, PageTitle } from "../ui";

const L = lang === "pt"
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

  const checkout = useMutation({ mutationFn: (plan: string) => api("/billing/checkout", { body: { plan, interval, embedded: true } }), onSuccess: (r) => setSecret(r.client_secret) });
  const portal = useMutation({ mutationFn: () => api("/billing/portal", { method: "POST" }), onSuccess: (r) => (location.href = r.url) });
  const current = me.data?.plan?.id;
  const subscribed = me.data?.plan?.subscribed;
  const cfg = plans.data;
  const enabled = cfg?.enabled;

  return (
    <>
      <PageTitle action={subscribed && enabled ? <Button variant="ghost" onClick={() => portal.mutate()}>{L.manage}</Button> : undefined}>{t.plan}</PageTitle>
      {sessionId && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          {confirm.data?.status === "complete" ? L.ok : L.checking}
        </p>
      )}
      {cfg?.yearly && (
        <div className="mb-4 inline-flex rounded-lg border border-zinc-200 p-1 text-sm dark:border-zinc-800">
          {(["month", "year"] as const).map((i) => (
            <button key={i} onClick={() => setInterval(i)} className={`rounded-md px-3 py-1.5 ${interval === i ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"}`}>
              {i === "month" ? L.monthly : <>{L.yearly} <span className="ml-1 text-emerald-600 dark:text-emerald-400">· {L.save}</span></>}
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
                <span className="text-3xl font-semibold tracking-tight">{p.price_usd ? `US$${yearly ? p.price_usd_year : p.price_usd}` : L.free}</span>
                {p.price_usd > 0 && <span className="text-sm text-zinc-500">{yearly ? L.year : L.month}</span>}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.monthly)} {L.emails}</li>
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.daily)} {L.day}</li>
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{num(p.domains)} {L.doms}</li>
              </ul>
              {p.id !== "free" && p.id !== current && current !== "internal" && !subscribed && (
                <Button className="mt-5 w-full" disabled={!enabled || checkout.isPending} onClick={() => checkout.mutate(p.id)}>{L.upgrade}</Button>
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
