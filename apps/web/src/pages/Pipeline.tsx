import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { date, lang, num } from "../i18n";
import { Button, Card, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Vendas", lead: "Arraste os negócios entre as etapas. Ganhou ou perdeu? O contato recebe a etiqueta deal-won ou deal-lost e seus funis seguem sozinhos.", open: "Em aberto", forecast: "Previsão ponderada", win: "Taxa de ganho", add: "Novo negócio", dealName: "Nome do negócio", value: "Valor", contact: "E-mail do contato", tasks: "Tarefas", myTasks: "Minhas tarefas", newTask: "Nova tarefa…", due: "Prazo", owner: "Responsável", close: "Fechamento previsto", notes: "Notas", save: "Salvar", del: "Excluir negócio", overdue: "atrasada", none: "Nada pendente." }
  : { title: "Sales", lead: "Drag deals between stages. Won or lost? The contact gets a deal-won or deal-lost tag and your funnels follow up on their own.", open: "Open pipeline", forecast: "Weighted forecast", win: "Win rate", add: "New deal", dealName: "Deal name", value: "Value", contact: "Contact email", tasks: "Tasks", myTasks: "My tasks", newTask: "New task…", due: "Due", owner: "Owner", close: "Expected close", notes: "Notes", save: "Save", del: "Delete deal", overdue: "overdue", none: "Nothing pending." };

const money = (c: number, cur = "USD") => new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(c / 100);
const sel = "h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900";

function TaskList({ dealId, mine }: { dealId?: string; mine?: boolean }) {
  const qc = useQueryClient();
  const key = ["tasks", dealId ?? (mine ? "mine" : "all")];
  const q = useQuery({ queryKey: key, queryFn: () => api(`/tasks?${dealId ? `deal_id=${dealId}&status=all` : mine ? "mine=true" : ""}`) });
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const add = useMutation({ mutationFn: () => api("/tasks", { body: { title, ...(dealId ? { deal_id: dealId } : {}), ...(due ? { due_at: new Date(due).getTime() } : {}) } }), onSuccess: () => (setTitle(""), setDue(""), refresh()) });
  const toggle = useMutation({ mutationFn: (t: any) => api(`/tasks/${t.id}`, { method: "PATCH", body: { done: !t.done_at } }), onSuccess: refresh });
  const rows: any[] = q.data?.data ?? [];
  return (
    <div>
      <form className="mb-2 flex gap-2" onSubmit={(e) => (e.preventDefault(), title && add.mutate())}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L.newTask} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900" />
        <Button variant="ghost" className="shrink-0"><Plus size={14} /></Button>
      </form>
      {rows.length === 0 ? <p className="text-xs text-zinc-500">{L.none}</p> : (
        <ul className="space-y-1">
          {rows.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-sm">
              <button onClick={() => toggle.mutate(t)} className="mt-0.5">{t.done_at ? <CheckSquare size={16} /> : <Square size={16} className="text-zinc-400" />}</button>
              <span className={`flex-1 ${t.done_at ? "text-zinc-400 line-through" : ""}`}>{t.title}{!dealId && t.deal_title && <span className="block text-xs text-zinc-500">{t.deal_title}</span>}</span>
              {t.due_at && <span className={`text-xs tabular-nums ${t.overdue ? "font-semibold" : "text-zinc-500"}`}>{t.overdue ? `${L.overdue} · ` : ""}{date(t.due_at)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DealDrawer({ deal, stages, onClose }: { deal: any; stages: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const [f, setF] = useState({ title: deal.title, value: String(deal.value_cents / 100), email: deal.email ?? "", owner_user_id: deal.owner_user_id ?? "", close: deal.close_date ? new Date(deal.close_date).toISOString().slice(0, 10) : "", notes: deal.notes ?? "", stage_id: deal.stage_id });
  const save = useMutation({ mutationFn: () => api(`/deals/${deal.id}`, { method: "PATCH", body: { title: f.title, value_cents: Math.round(Number(f.value || 0) * 100), email: f.email || null, owner_user_id: f.owner_user_id || null, close_date: f.close ? new Date(f.close).getTime() : null, notes: f.notes || null, stage_id: f.stage_id } }), onSuccess: () => (qc.invalidateQueries({ queryKey: ["board"] }), onClose()) });
  const del = useMutation({ mutationFn: () => api(`/deals/${deal.id}`, { method: "DELETE" }), onSuccess: () => (qc.invalidateQueries({ queryKey: ["board"] }), onClose()) });
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="h-full w-full max-w-md space-y-3 overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="font-semibold" /><button onClick={onClose} className="ml-2 p-1 text-zinc-500"><X size={18} /></button></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">{L.value}<Input type="number" min={0} step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
          <label className="text-xs text-zinc-500">Stage<select className={sel} value={f.stage_id} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="col-span-2 text-xs text-zinc-500">{L.contact}<Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="text-xs text-zinc-500">{L.owner}<select className={sel} value={f.owner_user_id} onChange={(e) => setF({ ...f, owner_user_id: e.target.value })}><option value="">—</option>{(team.data?.members ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.email}</option>)}</select></label>
          <label className="text-xs text-zinc-500">{L.close}<Input type="date" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></label>
        </div>
        <label className="block text-xs text-zinc-500">{L.notes}<textarea rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" /></label>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{L.save}</Button>
        <ErrorText error={save.error ?? del.error} />
        <h3 className="pt-3 text-sm font-semibold">{L.tasks}</h3>
        <TaskList dealId={deal.id} />
        <button className="flex items-center gap-1.5 pt-6 text-xs text-red-600" onClick={() => confirm(`${L.del}?`) && del.mutate()}><Trash2 size={13} /> {L.del}</button>
      </aside>
    </div>
  );
}

export function Pipeline() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["board"], queryFn: () => api("/deals") });
  const [open, setOpen] = useState<any>(null);
  const [over, setOver] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", value: "", email: "" });
  const add = useMutation({ mutationFn: () => api("/deals", { body: { title: f.title, value_cents: Math.round(Number(f.value || 0) * 100), ...(f.email ? { email: f.email } : {}) } }), onSuccess: () => (setF({ title: "", value: "", email: "" }), qc.invalidateQueries({ queryKey: ["board"] })) });
  const move = useMutation({
    mutationFn: ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) => api(`/deals/${id}`, { method: "PATCH", body: { stage_id, position } }),
    onMutate: async ({ id, stage_id, position }) => {
      await qc.cancelQueries({ queryKey: ["board"] });
      const prev = qc.getQueryData<any>(["board"]);
      if (prev) qc.setQueryData(["board"], { ...prev, deals: prev.deals.map((d: any) => (d.id === id ? { ...d, stage_id, position } : d)) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["board"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
  const b = q.data;
  const stages: any[] = b?.pipeline.stages ?? [];
  const deals: any[] = b?.deals ?? [];
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      {b && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card><div className="text-2xl font-semibold tabular-nums">{money(b.stats.open_value_cents)}</div><div className="text-xs text-zinc-500">{L.open}</div></Card>
          <Card><div className="text-2xl font-semibold tabular-nums">{money(b.stats.weighted_forecast_cents)}</div><div className="text-xs text-zinc-500">{L.forecast}</div></Card>
          <Card><div className="text-2xl font-semibold tabular-nums">{b.stats.win_rate === null ? "—" : `${Math.round(b.stats.win_rate * 100)}%`}</div><div className="text-xs text-zinc-500">{L.win}</div></Card>
        </div>
      )}
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
        <Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={L.dealName} className="min-w-[200px] flex-1" />
        <Input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={L.value} className="!w-32" />
        <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={L.contact} className="!w-56" />
        <Button disabled={add.isPending}><Plus size={14} /> {L.add}</Button>
      </form>
      <ErrorText error={add.error ?? move.error} />
      <div className="-mx-4 mb-8 flex gap-3 overflow-x-auto px-4 pb-3 md:-mx-10 md:px-10">
        {stages.map((s) => {
          const col = deals.filter((d) => d.stage_id === s.id).sort((a, z) => a.position - z.position);
          const st = b.stats.by_stage[s.id] ?? { count: 0, value_cents: 0 };
          return (
            <div key={s.id}
              onDragOver={(e) => (e.preventDefault(), setOver(s.id))}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/deal"); if (id) move.mutate({ id, stage_id: s.id, position: Date.now() }); }}
              className={`flex w-64 shrink-0 flex-col rounded-2xl border p-2 transition ${over === s.id ? "border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-800/50" : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40"}`}>
              <div className="flex items-baseline justify-between px-2 py-1.5">
                <span className="text-sm font-semibold">{s.name} <span className="font-normal text-zinc-400">{st.count}</span></span>
                <span className="text-xs tabular-nums text-zinc-500">{money(st.value_cents)}</span>
              </div>
              <div className="flex min-h-24 flex-col gap-2">
                {col.map((d) => (
                  <button key={d.id} draggable onDragStart={(e) => (e.dataTransfer.setData("text/deal", d.id), (e.dataTransfer.effectAllowed = "move"))} onClick={() => setOpen(d)}
                    className="cursor-grab rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="truncate text-sm font-medium">{d.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span className="truncate">{d.first_name ?? d.email ?? "—"}</span>
                      <b className="tabular-nums text-zinc-900 dark:text-white">{money(d.value_cents, d.currency)}</b>
                    </div>
                    {(d.open_tasks > 0 || d.close_date) && <div className="mt-1.5 flex gap-2 text-[11px] text-zinc-500">{d.open_tasks > 0 && <span>☐ {num(d.open_tasks)}</span>}{d.close_date && <span>{date(d.close_date)}</span>}</div>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Card><h3 className="mb-3 text-sm font-semibold">{L.myTasks}</h3><TaskList mine /></Card>
      {open && <DealDrawer deal={open} stages={stages} onClose={() => setOpen(null)} />}
    </>
  );
}
