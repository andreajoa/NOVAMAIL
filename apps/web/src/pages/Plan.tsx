import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { lang, num, t } from "../i18n";
import { Badge, Button, Card, ErrorText, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { month: "/mês", year: "/ano", monthly: "Mensal", yearly: "Anual", save: "pague 10 meses, use 12", current: "Plano atual", upgrade: "Assinar", manage: "Gerenciar assinatura", free: "Sem plano", emails: "e-mails por mês", day: "por dia", doms: "domínios", soon: "O envio de e-mails do NovaMail está em ativação. As assinaturas abrem assim que ele estiver no ar — até lá, nada é cobrado.", ok: "Assinatura ativa. Os novos limites já valem.", checking: "Confirmando pagamento…", packs: "pacotes extras", packHint: (n: string, p: number) => `No checkout você pode adicionar pacotes de +${n} e-mails/mês por US$${p} cada.`, perYear: (v: number) => `US$${v}/ano`, close: "Fechar" }
  : { month: "/mo", year: "/yr", monthly: "Monthly", yearly: "Yearly", save: "pay 10 months, get 12", current: "Current plan", upgrade: "Upgrade", manage: "Manage subscription", free: "No plan", emails: "emails per month", day: "per day", doms: "domains", soon: "NovaMail sending is being activated. Subscriptions open as soon as it is live — nothing is charged until then.", ok: "Subscription active. New limits apply now.", checking: "Confirming payment…", packs: "add-on packs", packHint: (n: string, p: number) => `At checkout you can add +${n} emails/month packs for $${p} each.`, perYear: (v: number) => `$${v}/yr`, close: "Close" };

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
    if (["starter", "pro", "scale"].includes(intent.plan) && !me.data.plan.subscribed) checkout.mutate(intent.plan);
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
      {current === "free" && (
        <p className="mb-6 rounded-lg border border-zinc-900 px-4 py-3 text-sm dark:border-white">
          <b>{pt ? "Você ainda não tem um plano." : "You don't have a plan yet."}</b> {pt ? "Monte domínio, contatos, modelos e funis à vontade — para enviar, escolha um plano abaixo." : "Set up your domain, contacts, templates and funnels freely — to send, pick a plan below."}
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
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{pt ? "CRM embutido · contatos ilimitados" : "Built-in CRM · unlimited contacts"}</li>
                <li className="flex gap-2"><Check size={16} className="shrink-0" />{pt ? "Segmentos, pontuação e funis" : "Segments, scoring and funnels"}</li>
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
      {cfg?.dedicated_ip?.available && current !== "internal" && <DedicatedIp subscribed={!!subscribed} yearly={me.data?.plan?.interval === "year"} />}
      <div className="mt-3"><ErrorText error={checkout.error ?? portal.error ?? confirm.error} /></div>
      {secret && cfg?.publishable_key && <EmbeddedCheckout publishableKey={cfg.publishable_key} clientSecret={secret} onClose={() => setSecret(null)} />}
    </>
  );
}

function DedicatedIp({ subscribed, yearly }: { subscribed: boolean; yearly: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dedicated-ip"], queryFn: () => api("/billing/dedicated-ip") });
  const buy = useMutation({ mutationFn: () => api("/billing/dedicated-ip", { body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dedicated-ip"] }) });
  const d = q.data;
  if (!d) return null;
  const price = yearly ? `US$${d.priceUsdYear}${pt ? "/ano" : "/year"}` : `US$${d.priceUsd}${pt ? "/mês" : "/month"}`;
  const status: Record<string, string> = pt
    ? { requested: "Pago — estamos reservando o seu IP (até 1 dia útil).", warming: `Aquecendo ${d.ip}: o limite por hora sobe sozinho por ~3 semanas para proteger a reputação.`, active: `Ativo: você envia só pelo IP ${d.ip}.` }
    : { requested: "Paid — we're reserving your IP (within 1 business day).", warming: `Warming up ${d.ip}: your hourly limit rises automatically for ~3 weeks to protect its reputation.`, active: `Active: you send only from ${d.ip}.` };
  return (
    <Card className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <div className="font-semibold">{pt ? "IP dedicado" : "Dedicated IP"} <span className="ml-1 text-sm font-normal text-zinc-500">{price}</span></div>
          <p className="mt-1 text-sm text-zinc-500">
            {pt
              ? `Sua reputação de envio passa a depender só de você. Recomendado a partir de ${num(d.recommendedMonthly)} e-mails por mês, todo mês — com pouco volume, o IP compartilhado entrega melhor.`
              : `Your sending reputation depends only on you. Recommended from ${num(d.recommendedMonthly)} emails a month, every month — at low volume the shared pool delivers better.`}
          </p>
          {status[d.status] && <p className="mt-3 text-sm font-medium">{status[d.status]}</p>}
        </div>
        {(d.status === "none" || d.status === "released") && (
          <Button variant="ghost" disabled={!subscribed || buy.isPending} onClick={() => window.confirm(pt ? `Adicionar IP dedicado por ${price}? O valor proporcional entra na próxima fatura.` : `Add a dedicated IP for ${price}? The prorated amount goes on your next invoice.`) && buy.mutate()}>
            {subscribed ? (pt ? "Adicionar IP dedicado" : "Add dedicated IP") : pt ? "Disponível em planos pagos" : "Available on paid plans"}
          </Button>
        )}
      </div>
      <ErrorText error={buy.error} />
    </Card>
  );
}
