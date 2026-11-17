// Pricing cards with a CSS-only Monthly/Yearly switch (radio + :has), used on /, /pt/ and /pricing.
// Buttons deep-link to sign-in with the chosen plan; the dashboard opens checkout right after login.
import { esc } from "./layout";

export const PRICING_CSS = `
.pr{margin-top:8px}.pr-sw{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:4px;background:var(--card);margin:6px 0 22px}
.pr-sw input{position:absolute;opacity:0;pointer-events:none}.pr-sw label{cursor:pointer;padding:10px 18px;border-radius:999px;font-weight:600;font-size:15px;color:var(--mut);display:flex;gap:8px;align-items:center}
.pr-sw label small{font-size:12px;font-weight:700;border:1px solid currentColor;border-radius:999px;padding:1px 7px}
.pr:has(#pr-m:checked) label[for=pr-m],.pr:has(#pr-y:checked) label[for=pr-y]{background:var(--fg);color:var(--bg)}
.pr-cards{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.pr-card{position:relative;border:1px solid var(--line);border-radius:18px;padding:26px;background:var(--card);display:flex;flex-direction:column}
.pr-card.hot{border:2px solid var(--fg)}.pr-card .hot-b{position:absolute;top:-12px;left:22px;background:var(--fg);color:var(--bg);font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px}
.pr-card h3{margin:0 0 4px;font-size:20px}.pr-card .amt{font-size:42px;font-weight:720;letter-spacing:-.03em;color:var(--fg);line-height:1.1}.pr-card .amt small{font-size:16px;font-weight:500;color:var(--mut)}
.pr-card .bill{min-height:22px;font-size:14px;color:var(--mut);margin:4px 0 16px}.pr-card ul{list-style:none;padding:0;margin:0 0 22px;display:grid;gap:9px;flex:1}.pr-card li{color:var(--mut);padding-left:24px;position:relative}.pr-card li::before{content:"✓";position:absolute;left:0;color:var(--fg);font-weight:700}
.pr-card .btn{text-align:center}.pr .y{display:none}.pr:has(#pr-y:checked) .y{display:inline}.pr:has(#pr-y:checked) .m{display:none}.pr .yb{display:none}.pr:has(#pr-y:checked) .yb{display:block}.pr:has(#pr-y:checked) .mb{display:none}
.pr-note{margin-top:14px;font-size:14px;color:var(--mut)}`;

export function pricingCards(lang: "en" | "pt-BR") {
  const en = lang === "en";
  const t = en
    ? { m: "Monthly", y: "Yearly", save: "2 months free", mo: "/mo", free: "Free forever", billed: (v: string) => `billed ${v} per year`, start: "Start free", sub: (p: string) => `Subscribe to ${p}`, pop: "Most popular", note: "Unlimited contacts on every plan. Add +50,000 emails for $10/month at checkout. Cancel anytime." }
    : { m: "Mensal", y: "Anual", save: "2 meses grátis", mo: "/mês", free: "Grátis para sempre", billed: (v: string) => `cobrado ${v} por ano`, start: "Começar grátis", sub: (p: string) => `Assinar ${p}`, pop: "Mais escolhido", note: "Contatos ilimitados em todos os planos. Adicione +50.000 e-mails por US$10/mês no checkout. Cancele quando quiser." };
  const feats = en
    ? { free: ["3,000 emails/month", "100 emails/day", "1 sending domain", "Templates, funnels, CRM"], pro: ["50,000 emails/month", "10,000 emails/day", "10 sending domains", "Everything in Free", "Trusted IP pool"], scale: ["250,000 emails/month", "50,000 emails/day", "100 sending domains", "Everything in Pro", "Priority support", "Optional dedicated IP ($29/mo)"] }
    : { free: ["3.000 e-mails/mês", "100 e-mails/dia", "1 domínio de envio", "Modelos, funis, CRM"], pro: ["50.000 e-mails/mês", "10.000 e-mails/dia", "10 domínios de envio", "Tudo do Free", "IPs de alta reputação"], scale: ["250.000 e-mails/mês", "50.000 e-mails/dia", "100 domínios de envio", "Tudo do Pro", "Suporte prioritário", "IP dedicado opcional (US$29/mês)"] };
  const card = (id: string, name: string, month: number, items: string[], hot = false) => {
    const yearTotal = month * 10;
    const perMonthYearly = (yearTotal / 12).toFixed(2).replace(/\.00$/, "");
    const price = month
      ? `<div class="amt"><span class="m">$${month}</span><span class="y">$${perMonthYearly}</span><small>${t.mo}</small></div><div class="bill"><span class="y">${t.billed(`$${yearTotal}`)} · ${t.save}</span></div>`
      : `<div class="amt">$0</div><div class="bill">${t.free}</div>`;
    const btn = month
      ? `<a class="btn${hot ? "" : " g"} mb" href="/login?plan=${id}&interval=month">${esc(t.sub(name))}</a><a class="btn${hot ? "" : " g"} yb" href="/login?plan=${id}&interval=year">${esc(t.sub(name))}</a>`
      : `<a class="btn g" href="/login">${esc(t.start)}</a>`;
    return `<div class="pr-card${hot ? " hot" : ""}">${hot ? `<span class="hot-b">${t.pop}</span>` : ""}<h3>${name}</h3>${price}<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>${btn}</div>`;
  };
  return `<div class="pr"><div class="pr-sw" role="radiogroup"><input type="radio" name="pr" id="pr-m" checked><label for="pr-m">${t.m}</label><input type="radio" name="pr" id="pr-y"><label for="pr-y">${t.y} <small>${t.save}</small></label></div>
<div class="pr-cards">${card("free", "Free", 0, feats.free)}${card("pro", "Pro", 15, feats.pro, true)}${card("scale", "Scale", 60, feats.scale)}</div><p class="pr-note">${esc(t.note)}</p></div>`;
}
