import { useQuery } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { num, t } from "../i18n";
import { Card, CopyButton, PageTitle } from "../ui";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, limit ? (used / limit) * 100 : 0);
  return (
    <Card>
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{num(used)}</span>
        <span className="text-sm text-zinc-500">{t.of} {num(limit)}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : "bg-zinc-900 dark:bg-white"}`} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

function Chart({ data }: { data: { day: string; sent: number; bounced: number }[] }) {
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10));
  const by = new Map(data.map((d) => [d.day, d]));
  const max = Math.max(1, ...data.map((d) => d.sent));
  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={t.last30}>
        {days.map((d) => {
          const v = by.get(d);
          const h = ((v?.sent ?? 0) / max) * 100;
          return (
            <div key={d} className="group relative flex h-full flex-1 items-end" title={`${d}: ${v?.sent ?? 0} ${t.sent.toLowerCase()}, ${v?.bounced ?? 0} ${t.bounced.toLowerCase()}`}>
              <div className="w-full rounded-sm bg-zinc-900 transition group-hover:opacity-70 dark:bg-zinc-100" style={{ height: `${Math.max(h, v?.sent ? 3 : 1)}%`, opacity: v?.sent ? 1 : 0.12 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-zinc-500"><span>{days[0]}</span><span>{days[29]}</span></div>
    </div>
  );
}

export function Overview() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api("/me/stats?days=30") });
  const p = me.data?.plan;
  const u = me.data?.usage;
  const snippet = `import { Resend } from "resend";

const nova = new Resend(process.env.NOVAMAIL_KEY, { baseUrl: "${API_BASE}" });

await nova.emails.send({
  from: "Loja <oi@mail.sualoja.com>",
  to: "cliente@gmail.com",
  subject: "Pedido confirmado",
  html: "<b>Obrigado!</b>",
});`;
  return (
    <>
      <PageTitle>{t.overview}</PageTitle>
      {p && u && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Meter label={t.today} used={u.today} limit={p.daily} />
          <Meter label={t.thisMonth} used={u.month} limit={p.monthly} />
        </div>
      )}
      <Card title={t.last30} className="mt-4">
        <Chart data={stats.data?.data ?? []} />
      </Card>
      <Card title={t.quickstart} className="mt-4" action={<CopyButton value={snippet} />}>
        <p className="mb-3 text-sm text-zinc-500">{t.quickstartHint}</p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed text-zinc-100"><code>{snippet}</code></pre>
      </Card>
    </>
  );
}
