import { useQuery } from "@tanstack/react-query";
import { Code2, Gauge, Globe, Mail, Megaphone, ShieldCheck } from "lucide-react";
import { API_BASE } from "../api";
import { lang, num } from "../i18n";
import { navigate } from "../nav";
import { Login } from "./Login";

const C = lang === "pt"
  ? {
      h1: "Sua própria plataforma de e-mail.",
      sub: "API compatível com Resend, SMTP, domínios com DKIM/SPF/DMARC, campanhas com descadastro em 1 clique e webhooks assinados. Comece grátis.",
      start: "Crie sua conta ou entre",
      feats: [
        ["Compatível com Resend", "Troque só a URL base. SDKs, payloads e erros iguais."],
        ["Domínios verificados", "Registros prontos para copiar e verificação ao vivo."],
        ["Campanhas", "Públicos, personalização e descadastro RFC 8058 automático."],
        ["Reputação protegida", "Supressão de devoluções e reclamações, suspensão automática de abuso."],
        ["Webhooks padrão", "Standard Webhooks assinados: entregue, aberto, clicado, devolvido."],
        ["SMTP 587 + TLS 1.3", "Para sistemas que só falam SMTP."],
      ],
      pricing: "Preços simples", month: "/mês", free: "Grátis", perMonth: "e-mails/mês", docs: "Documentação da API", status: "Status", terms: "Termos", aup: "Uso aceitável", privacy: "Privacidade",
    }
  : {
      h1: "Your own email platform.",
      sub: "Resend-compatible API, SMTP, DKIM/SPF/DMARC domains, broadcasts with one-click unsubscribe and signed webhooks. Start free.",
      start: "Create your account or sign in",
      feats: [
        ["Resend-compatible", "Change only the base URL. Same SDKs, payloads and errors."],
        ["Verified domains", "Copy-ready records and live verification."],
        ["Broadcasts", "Audiences, personalisation and automatic RFC 8058 unsubscribe."],
        ["Protected reputation", "Bounce and complaint suppression, automatic abuse suspension."],
        ["Standard webhooks", "Signed Standard Webhooks: delivered, opened, clicked, bounced."],
        ["SMTP 587 + TLS 1.3", "For systems that only speak SMTP."],
      ],
      pricing: "Simple pricing", month: "/mo", free: "Free", perMonth: "emails/month", docs: "API docs", status: "Status", terms: "Terms", aup: "Acceptable use", privacy: "Privacy",
    };

const ICONS = [Code2, Globe, Megaphone, ShieldCheck, Gauge, Mail];

export function Landing({ onDone }: { onDone: () => void }) {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => fetch("/api/plans").then((r) => r.json()) });
  const link = (href: string, label: string) => (
    <a href={href} onClick={(e) => href.startsWith("/") && (e.preventDefault(), navigate(href))} className="hover:text-zinc-900 dark:hover:text-white">{label}</a>
  );
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><Mail size={15} /></span>NovaMail
        </span>
        <nav className="flex gap-5 text-sm text-zinc-500">{link(`${API_BASE}/docs`, C.docs)}{link(`${API_BASE}/status`, C.status)}</nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-10 md:grid-cols-[1.2fr_1fr] md:pt-20">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{C.h1}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">{C.sub}</p>
          <pre className="mt-8 overflow-x-auto rounded-xl bg-zinc-950 p-5 font-mono text-[13px] leading-relaxed text-zinc-100"><code>{`curl ${API_BASE}/emails \\
  -H "Authorization: Bearer nm_..." \\
  -d '{"from":"oi@mail.loja.com","to":"cliente@gmail.com",
       "subject":"Pedido confirmado","html":"<b>Obrigado!</b>"}'`}</code></pre>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:self-start dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 font-semibold">{C.start}</h2>
          <Login onDone={onDone} embedded />
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-3">
          {C.feats.map(([h, p], i) => {
            const Icon = ICONS[i]!;
            return (
              <div key={h}>
                <Icon size={20} />
                <h3 className="mt-3 font-semibold">{h}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">{C.pricing}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {(plans.data?.data ?? []).map((p: any) => (
            <div key={p.id} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="font-semibold">{p.label}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{p.price_usd ? `US$${p.price_usd}` : C.free}{p.price_usd > 0 && <span className="text-sm font-normal text-zinc-500">{C.month}</span>}</div>
              <div className="mt-2 text-sm text-zinc-500">{num(p.monthly)} {C.perMonth}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap gap-5 px-4 pb-10 text-sm text-zinc-500">
        <span>© 2026 NovaMail</span>{link("/terms", C.terms)}{link("/aup", C.aup)}{link("/privacy", C.privacy)}
      </footer>
    </div>
  );
}
