import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, DollarSign, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { date, lang, num } from "../i18n";
import { navigate } from "../nav";
import { Card, Empty, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Relatórios", lead: "Números honestos: aberturas e cliques de robôs de segurança são filtrados, e aberturas automáticas da Apple aparecem separadas.", sent: "Enviados", opens: "Aberturas", clicks: "Cliques", growth: "Novos contatos", unsub: "Descadastros", camps: "Campanhas", avg: "média", revenue: "Receita atribuída", days: "dias", back: "Campanhas", delivered: "Entregues", openR: "Abertura", humanR: "Abertura humana (est.)", clickR: "Clique", ctor: "Clique / abertura", unsubR: "Descadastro", complaint: "Spam", bots: "cliques de robôs filtrados", mpp: "aberturas automáticas da Apple", map: "Mapa de cliques", links: "Links", providers: "Provedores", devices: "Dispositivos", first48: "Primeiras 48 horas", hour: "hora", orders: "pedidos", perRecipient: "por destinatário", table: "Ver tabela" }
  : { title: "Reports", lead: "Honest numbers: security-scanner opens and clicks are filtered out, and Apple's automatic opens are shown separately.", sent: "Sent", opens: "Opens", clicks: "Clicks", growth: "New contacts", unsub: "Unsubscribes", camps: "Campaigns", avg: "average", revenue: "Attributed revenue", days: "days", back: "Campaigns", delivered: "Delivered", openR: "Open rate", humanR: "Human open rate (est.)", clickR: "Click rate", ctor: "Click-to-open", unsubR: "Unsubscribe", complaint: "Spam", bots: "bot clicks filtered", mpp: "Apple automatic opens", map: "Click map", links: "Links", providers: "Mailbox providers", devices: "Devices", first48: "First 48 hours", hour: "hour", orders: "orders", perRecipient: "per recipient", table: "Show table" };

const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const money = (cents: number, cur?: string | null) => new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(cents / 100);

/** Single-series bar chart: 2px gaps, 4px rounded data-ends, hover tooltip, sr-only table. */
function Bars({ label, values, labels, height = 120 }: { label: string; values: number[]; labels: string[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const w = 100 / values.length;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure className="relative">
      <figcaption className="mb-2 flex items-baseline justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-zinc-500">{num(total)}</span></figcaption>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-28 w-full overflow-visible" role="img" aria-label={`${label}: ${num(total)}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2="100" y1={height} y2={height} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => {
          const h = (v / max) * (height - 4);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              {v > 0 && <rect x={i * w + w * 0.12} y={height - h} width={w * 0.76} height={h} rx={Math.min(1.2, w * 0.3)} className={hover === null || hover === i ? "fill-zinc-900 dark:fill-zinc-100" : "fill-zinc-300 dark:fill-zinc-700"} />}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-6 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-white dark:text-zinc-900" style={{ left: `${(hover + 0.5) * w}%` }}>
          {labels[hover]} · <b className="tabular-nums">{num(values[hover]!)}</b>
        </div>
      )}
      <table className="sr-only"><caption>{label}</caption><tbody>{values.map((v, i) => <tr key={i}><th>{labels[i]}</th><td>{v}</td></tr>)}</tbody></table>
    </figure>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}

/** Rate bar row used for providers/links (one hue, value always printed as text). */
function RateRow({ name, value, max, right }: { name: string; value: number; max: number; right: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 py-1.5 text-sm">
      <div className="min-w-0"><div className="truncate">{name}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div></div>
      <div className="text-right text-xs tabular-nums text-zinc-500">{right}</div>
    </div>
  );
}

/** The email itself with a badge on every link showing its share of clicks. */
function ClickMap({ html, links }: { html: string; links: { url: string; unique_clicks: number; share: number }[] }) {
  const doc = useMemo(() => {
    const d = new DOMParser().parseFromString(html || "<p></p>", "text/html");
    d.querySelectorAll("script").forEach((s) => s.remove());
    d.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href")!.replace(/\{\{[^}]+\}\}/g, "");
      const l = links.find((x) => x.url === href || x.url.split("?")[0] === href.split("?")[0]);
      const badge = d.createElement("span");
      badge.textContent = l ? `${Math.round(l.share * 100)}% · ${l.unique_clicks}` : "0%";
      badge.setAttribute("style", `position:absolute;transform:translate(-4px,-115%);background:${l ? "#09090b" : "#a1a1aa"};color:#fff;font:600 11px/1 system-ui;padding:4px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25)`);
      (a as HTMLElement).style.outline = l ? "2px solid #09090b" : "1px dashed #a1a1aa";
      (a as HTMLElement).style.outlineOffset = "3px";
      a.before(badge);
    });
    return `<!doctype html><html><head><style>body{margin:0}</style></head><body>${d.body.innerHTML}</body></html>`;
  }, [html, links]);
  return <iframe title="click map" sandbox="" srcDoc={doc} className="h-[640px] w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800" />;
}

function CampaignReport({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api(`/reports/broadcasts/${id}`), refetchInterval: 30_000 });
  if (!q.data) return <p className="text-sm text-zinc-500">…</p>;
  const r = q.data;
  const t = r.totals;
  const dv = Object.entries(r.devices as Record<string, number>).filter(([, n]) => n > 0);
  const dvMax = Math.max(1, ...dv.map(([, n]) => n));
  return (
    <>
      <button onClick={() => navigate("/broadcasts")} className="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft size={15} /> {L.back}</button>
      <PageTitle>{r.broadcast.subject}</PageTitle>
      <p className="-mt-3 mb-5 text-sm text-zinc-500">{r.broadcast.started_at ? date(r.broadcast.started_at) : ""} · {num(t.sent)} {L.sent.toLowerCase()}</p>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={L.delivered} value={pct(t.delivery_rate)} sub={`${num(t.delivered)} / ${num(t.sent)}`} />
        <Stat label={L.openR} value={pct(t.open_rate)} sub={`${L.humanR}: ${pct(t.human_open_rate)}`} />
        <Stat label={L.clickR} value={pct(t.click_rate)} sub={`${L.ctor}: ${pct(t.click_to_open_rate)}`} />
        <Stat label={L.revenue} value={money(t.revenue_cents, t.currency)} sub={`${num(t.orders)} ${L.orders} · ${money(t.revenue_per_recipient_cents, t.currency)} ${L.perRecipient}`} />
      </div>
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
        <span>{L.unsubR}: <b className="tabular-nums text-zinc-900 dark:text-white">{pct(t.unsubscribe_rate)}</b></span>
        <span>{L.complaint}: <b className="tabular-nums text-zinc-900 dark:text-white">{pct(t.complaint_rate)}</b></span>
        <span className="flex items-center gap-1"><Bot size={13} /> {num(t.bot_clicks_filtered)} {L.bots}</span>
        <span className="flex items-center gap-1"><Shield size={13} /> {num(t.privacy_opens)} {L.mpp}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card><h3 className="mb-3 text-sm font-semibold">{L.map}</h3><ClickMap html={r.html} links={r.links} /></Card>
        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">{L.first48}</h3>
            <div className="space-y-5">
              <Bars label={L.opens} values={r.timeline.map((x: any) => x.opens)} labels={r.timeline.map((x: any) => `${L.hour} ${x.hour + 1}`)} />
              <Bars label={L.clicks} values={r.timeline.map((x: any) => x.clicks)} labels={r.timeline.map((x: any) => `${L.hour} ${x.hour + 1}`)} />
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold">{L.links}</h3>
            {r.links.length === 0 ? <Empty /> : r.links.map((l: any) => <RateRow key={l.url} name={l.url.replace(/^https?:\/\//, "")} value={l.unique_clicks} max={r.links[0].unique_clicks} right={`${num(l.unique_clicks)} · ${pct(l.share)}`} />)}
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold">{L.providers}</h3>
            {r.providers.map((p: any) => <RateRow key={p.name} name={`${p.name} · ${num(p.sent)}`} value={p.open_rate} max={Math.max(...r.providers.map((x: any) => x.open_rate), 0.0001)} right={`${pct(p.open_rate)} · ${pct(p.click_rate)}`} />)}
          </Card>
          {dv.length > 0 && (
            <Card>
              <h3 className="mb-2 text-sm font-semibold">{L.devices}</h3>
              {dv.map(([k, n]) => <RateRow key={k} name={k} value={n} max={dvMax} right={num(n)} />)}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Overview() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["overview", days], queryFn: () => api(`/reports/overview?days=${days}`) });
  const d = q.data;
  const labels = (d?.days ?? []).map((x: string) => x.slice(5));
  return (
    <>
      <PageTitle action={
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {[7, 30, 90].map((n) => <button key={n} onClick={() => setDays(n)} className={`rounded-md px-3 py-1 text-xs font-semibold ${days === n ? "bg-white shadow-sm dark:bg-zinc-950" : "text-zinc-500"}`}>{n} {L.days}</button>)}
        </div>
      }>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      {!d ? <p className="text-sm text-zinc-500">…</p> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={L.sent} value={num(d.series.sent.reduce((a: number, b: number) => a + b, 0))} />
            <Stat label={`${L.openR} (${L.avg})`} value={pct(d.averages.open_rate)} />
            <Stat label={`${L.clickR} (${L.avg})`} value={pct(d.averages.click_rate)} />
            <Stat label={L.revenue} value={money(d.revenue.attributed_cents, d.revenue.currency)} sub={`${num(d.revenue.orders)} ${L.orders}`} />
          </div>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card><Bars label={L.sent} values={d.series.sent} labels={labels} /></Card>
            <Card><Bars label={L.opens} values={d.series.opens} labels={labels} /></Card>
            <Card><Bars label={L.clicks} values={d.series.clicks} labels={labels} /></Card>
            <Card><Bars label={L.growth} values={d.series.new_contacts} labels={labels} /></Card>
            <Card><Bars label={L.unsub} values={d.series.unsubscribes} labels={labels} /></Card>
          </div>
          <Card>
            <h3 className="mb-2 text-sm font-semibold">{L.camps}</h3>
            {d.campaigns.length === 0 ? <Empty /> : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {d.campaigns.map((c: any) => (
                  <button key={c.id} onClick={() => navigate(`/reports?b=${c.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_repeat(3,72px)] items-center gap-2 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <span className="truncate">{c.subject}<span className="block text-xs text-zinc-500">{c.started_at ? date(c.started_at) : ""}</span></span>
                    <span className="text-right tabular-nums">{num(c.sent)}</span>
                    <span className={`text-right tabular-nums ${c.open_rate >= d.averages.open_rate ? "font-semibold" : "text-zinc-500"}`}>{pct(c.open_rate)}</span>
                    <span className={`text-right tabular-nums ${c.click_rate >= d.averages.click_rate ? "font-semibold" : "text-zinc-500"}`}>{pct(c.click_rate)}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 flex items-center gap-1 text-xs text-zinc-500"><DollarSign size={12} /> {pt ? "Em negrito: acima da sua média." : "Bold: above your average."}</p>
          </Card>
        </>
      )}
    </>
  );
}

export function Reports() {
  const b = new URLSearchParams(location.search).get("b");
  return b ? <CampaignReport id={b} /> : <Overview />;
}
