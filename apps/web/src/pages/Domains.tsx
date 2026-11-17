import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { date, t } from "../i18n";
import { Badge, Button, Card, CopyButton, Empty, ErrorText, Input, PageTitle } from "../ui";

function DomainDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["domain", id], queryFn: () => api(`/domains/${id}`) });
  const verify = useMutation({
    mutationFn: () => api(`/domains/${id}/verify`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain", id] }).then(() => qc.invalidateQueries({ queryKey: ["domains"] })),
  });
  const remove = useMutation({ mutationFn: () => api(`/domains/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }) });
  const d = q.data;
  if (!d) return <p className="text-sm text-zinc-500">{t.loading}</p>;
  const checks: Record<string, string | null> = d.checks ?? {};
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t.dnsHint}</p>
      <div className="space-y-2">
        {d.records.map((r: any) => (
          <div key={r.record + r.name} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-white dark:bg-white dark:text-zinc-900">{r.type}</span>
              <span className="font-medium uppercase tracking-wide text-zinc-500">{r.record.replace("_", " ")}</span>
              <span className="text-zinc-400">· {r.required ? t.required : t.optional}</span>
              {checks[r.record] !== undefined && <Badge value={checks[r.record]} />}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="flex min-w-0 items-center justify-between gap-1 rounded bg-zinc-50 px-2 py-1.5 dark:bg-zinc-950">
                <code className="truncate font-mono text-xs">{r.name}</code>
                <CopyButton value={r.name} label={false} />
              </div>
              <div className="flex min-w-0 items-center justify-between gap-1 rounded bg-zinc-50 px-2 py-1.5 dark:bg-zinc-950">
                <code className="truncate font-mono text-xs">{r.value}</code>
                <CopyButton value={r.value} label={false} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
          <RefreshCw size={14} className={verify.isPending ? "animate-spin" : ""} /> {t.verify}
        </Button>
        <Button variant="danger" onClick={() => confirm(`${t.remove} ${d.name}?`) && remove.mutate()}>{t.remove}</Button>
      </div>
      <ErrorText error={verify.error ?? remove.error} />
    </div>
  );
}

export function Domains() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const add = useMutation({
    mutationFn: () => api("/domains", { body: { name } }),
    onSuccess: (d) => {
      setName("");
      setOpen(d.id);
      qc.invalidateQueries({ queryKey: ["domains"] });
    },
  });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{t.domains}</PageTitle>
      <Card className="mb-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t.domainName} />
          <Button disabled={add.isPending} className="shrink-0">{t.addDomain}</Button>
        </form>
        <div className="mt-2"><ErrorText error={add.error} /></div>
      </Card>
      {rows.length === 0 ? (
        <Card><Empty /></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card
              key={d.id}
              title={<span className="font-mono">{d.name}</span>}
              action={
                <div className="flex items-center gap-3">
                  <Badge value={d.status} />
                  <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    {open === d.id ? "▲" : "DNS ▼"}
                  </button>
                </div>
              }
            >
              {open === d.id ? <DomainDetail id={d.id} /> : <p className="text-xs text-zinc-500">{t.created} {date(d.created_at)}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
