import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Clock, Mail, Pause, Play, Plus, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { Badge, Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Funis de e-mail", new: "Novo funil", hint: "Um funil envia uma sequência de e-mails automaticamente: quando alguém entra numa lista, recebe o 1º e-mail, espera alguns dias, recebe o 2º… Quem se descadastra sai sozinho.", name: "Nome do funil", trigger: "Começa quando", joins: "alguém entra na lista", apiTrig: "chamado pela API (POST /funnels/:id/enroll)", from: "Remetente (domínio verificado)", step: "E-mail", wait: "Esperar", days: "dias", hours: "horas", now: "envia na hora", template: "Modelo", subjectOpt: "Assunto (opcional, usa o do modelo)", addStep: "Adicionar e-mail", save: "Salvar", activate: "Ativar", pause: "Pausar", del: "Excluir", active: "em andamento", completed: "concluíram", steps: "e-mails", noTpl: "Crie um modelo primeiro em Modelos.", draft: "rascunho", agent: "montado por IA — revise e ative" }
  : { title: "Email funnels", new: "New funnel", hint: "A funnel sends a sequence of emails automatically: when someone joins a list they get email 1, wait a few days, get email 2… Anyone who unsubscribes leaves on their own.", name: "Funnel name", trigger: "Starts when", joins: "someone joins the list", apiTrig: "called from the API (POST /funnels/:id/enroll)", from: "From (verified domain)", step: "Email", wait: "Wait", days: "days", hours: "hours", now: "sends immediately", template: "Template", subjectOpt: "Subject (optional, defaults to the template's)", addStep: "Add email", save: "Save", activate: "Activate", pause: "Pause", del: "Delete", active: "in progress", completed: "completed", steps: "emails", noTpl: "Create a template first under Templates.", draft: "draft", agent: "built by AI — review and activate" };

type Step = { template_id: string; wait_minutes: number; subject?: string };

function FunnelEditor({ funnel, onClose }: { funnel?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const tpls = useQuery({ queryKey: ["templates"], queryFn: () => api("/templates") });
  const auds = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const doms = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const [f, setF] = useState({ name: funnel?.name ?? "", trigger: funnel?.trigger ?? "audience", audience_id: funnel?.audience_id ?? "", from: funnel?.from ?? "" });
  const [steps, setSteps] = useState<Step[]>(funnel?.steps?.map((s: any) => ({ template_id: s.template_id, wait_minutes: s.wait_minutes, subject: s.subject ?? undefined })) ?? []);
  useEffect(() => {
    const v = doms.data?.data?.find((d: any) => d.status === "verified");
    if (v && !f.from) setF((x) => ({ ...x, from: `hello@${v.name}` }));
  }, [doms.data, f.from]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, audience_id: f.trigger === "audience" ? f.audience_id : undefined, steps };
      return funnel ? api(`/funnels/${funnel.id}`, { method: "PATCH", body }) : api("/funnels", { body });
    },
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["funnels"] }), onClose()),
  });
  const tplList: any[] = tpls.data?.data ?? [];
  const setStep = (i: number, p: Partial<Step>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const waitDays = (m: number) => Math.floor(m / 1440);
  const waitHours = (m: number) => Math.floor((m % 1440) / 60);

  return (
    <Card className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={L.name} />
        <Input value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} placeholder={L.from} />
      </div>
      <div className="mt-6 flex flex-col items-center">
        <div className="w-full max-w-md rounded-xl border-2 border-zinc-900 p-4 dark:border-white">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Zap size={16} /> {L.trigger}</div>
          <select value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value })} className="mb-2 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <option value="audience">{L.joins}</option>
            <option value="api">{L.apiTrig}</option>
          </select>
          {f.trigger === "audience" && (
            <select value={f.audience_id} onChange={(e) => setF({ ...f, audience_id: e.target.value })} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <option value="">—</option>
              {(auds.data?.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name} ({num(a.contacts)})</option>)}
            </select>
          )}
        </div>
        {steps.map((s, i) => (
          <div key={i} className="flex w-full max-w-md flex-col items-center">
            <ArrowDown size={18} className="my-1 text-zinc-400" />
            <div className="flex w-full items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
              <Clock size={15} /> {L.wait}
              <input type="number" min={0} value={waitDays(s.wait_minutes)} onChange={(e) => setStep(i, { wait_minutes: Number(e.target.value) * 1440 + waitHours(s.wait_minutes) * 60 })} className="w-14 rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900" /> {L.days}
              <input type="number" min={0} max={23} value={waitHours(s.wait_minutes)} onChange={(e) => setStep(i, { wait_minutes: waitDays(s.wait_minutes) * 1440 + Number(e.target.value) * 60 })} className="w-14 rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900" /> {L.hours}
              {s.wait_minutes === 0 && <span className="text-xs text-zinc-500">· {L.now}</span>}
            </div>
            <ArrowDown size={18} className="my-1 text-zinc-400" />
            <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2"><Mail size={16} /> {L.step} {i + 1}</span>
                <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
              <select value={s.template_id} onChange={(e) => setStep(i, { template_id: e.target.value })} className="mb-2 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <option value="">{L.template}…</option>
                {tplList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Input value={s.subject ?? ""} onChange={(e) => setStep(i, { subject: e.target.value || undefined })} placeholder={L.subjectOpt} />
            </div>
          </div>
        ))}
        <Button variant="ghost" className="mt-4" disabled={!tplList.length} onClick={() => setSteps([...steps, { template_id: tplList[0]?.id ?? "", wait_minutes: steps.length ? 2 * 1440 : 0 }])}><Plus size={15} /> {L.addStep}</Button>
        {!tplList.length && <p className="mt-2 text-xs text-zinc-500">{L.noTpl}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>✕</Button>
        <Button disabled={save.isPending || !f.name || !f.from || steps.some((s) => !s.template_id)} onClick={() => save.mutate()}>{L.save}</Button>
      </div>
      <ErrorText error={save.error} />
    </Card>
  );
}

export function Funnels() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["funnels"], queryFn: () => api("/funnels"), refetchInterval: 15_000 });
  const [editing, setEditing] = useState<any | null | "new">(null);
  const open = useMutation({ mutationFn: (id: string) => api(`/funnels/${id}`), onSuccess: (f) => setEditing(f) });
  const act = useMutation({ mutationFn: ({ id, a }: { id: string; a: string }) => (a === "delete" ? api(`/funnels/${id}`, { method: "DELETE" }) : api(`/funnels/${id}/${a}`, { method: "POST" })), onSuccess: () => qc.invalidateQueries({ queryKey: ["funnels"] }) });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle action={!editing && <Button onClick={() => setEditing("new")}><Plus size={15} /> {L.new}</Button>}>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.hint}</p>
      {editing && <FunnelEditor funnel={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ErrorText error={act.error ?? open.error} />
      {rows.length === 0 ? <Card><Empty /></Card> : (
        <div className="space-y-3">
          {rows.map((f) => (
            <Card key={f.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => open.mutate(f.id)} className="text-left">
                  <div className="flex items-center gap-2 font-medium">{f.name} <Badge value={f.status === "draft" ? L.draft : f.status} /></div>
                  <div className="text-xs text-zinc-500">{num(f.steps)} {L.steps} · {num(f.active)} {L.active} · {num(f.completed)} {L.completed}{String(f.created_by ?? "").startsWith("agent:") && f.status === "draft" ? ` · ${L.agent}` : ""}</div>
                </button>
                <div className="flex gap-2">
                  {f.status !== "active" ? (
                    <Button className="h-8 text-xs" onClick={() => act.mutate({ id: f.id, a: "activate" })}><Play size={14} /> {L.activate}</Button>
                  ) : (
                    <Button variant="ghost" className="h-8 text-xs" onClick={() => act.mutate({ id: f.id, a: "pause" })}><Pause size={14} /> {L.pause}</Button>
                  )}
                  <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => confirm(`${L.del} ${f.name}?`) && act.mutate({ id: f.id, a: "delete" })}><Trash2 size={15} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
