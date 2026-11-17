import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { num, t } from "../i18n";
import { Badge, Card, PageTitle } from "../ui";

export function Plan() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const p = me.data?.plan;
  if (!p) return null;
  return (
    <>
      <PageTitle>{t.plan}</PageTitle>
      <Card title={<span className="flex items-center gap-2">{p.label} <Badge value={me.data.account.status} /></span>}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-zinc-500">{t.perDay}</dt><dd className="text-xl font-semibold tabular-nums">{num(p.daily)}</dd></div>
          <div><dt className="text-xs text-zinc-500">{t.perMonth}</dt><dd className="text-xl font-semibold tabular-nums">{num(p.monthly)}</dd></div>
          <div><dt className="text-xs text-zinc-500">{t.domainsAllowed}</dt><dd className="text-xl font-semibold tabular-nums">{num(p.domains)}</dd></div>
        </dl>
        <p className="mt-6 text-sm text-zinc-500">{t.upgradeSoon}</p>
      </Card>
    </>
  );
}
