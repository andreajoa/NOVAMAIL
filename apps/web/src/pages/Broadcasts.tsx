import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Clock, FlaskConical, Plus, Repeat, Send, Wand2, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { date, lang, num } from "../i18n";
import { navigate } from "../nav";
import { Badge, Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";
import { Preflight } from "../Preflight";

const pt = lang === "pt";
const L = pt
  ? { title: "Campanhas", new: "Nova campanha", audience: "Lista", from: "Remetente", subject: "Assunto", html: "Conteúdo HTML — use {{first_name}} e {{unsubscribe_url}}", save: "Salvar rascunho", send: "Enviar agora", schedule: "Agendar", cancel: "Cancelar", sent: "enviados", skipped: "pulados", hint: "Descadastro em 1 clique (exigido por Gmail e Yahoo) e central de preferências são adicionados automaticamente.", confirm: "Enviar agora para toda a lista?", ab: "Teste A/B de assunto", abHint: "Uma parte da lista recebe cada assunto; depois do tempo de teste o vencedor vai para o resto, sozinho.", variant: "Assunto", addVar: "Adicionar variação", testPct: "Tamanho do teste", metric: "Vencedor por", opens: "aberturas", clicks: "cliques", wait: "Esperar", hours: "horas", when: "Quando enviar", now: "Agora", later: "Agendar para", smart: "Melhor horário de cada contato (nas próximas 24 h)", resend: "Reenviar para quem não abriu", resendQ: "Novo assunto para quem não abriu:", report: "Relatório", winner: "vencedor", testing: "testando" }
  : { title: "Campaigns", new: "New campaign", audience: "List", from: "From", subject: "Subject", html: "HTML content — use {{first_name}} and {{unsubscribe_url}}", save: "Save draft", send: "Send now", schedule: "Schedule", cancel: "Cancel", sent: "sent", skipped: "skipped", hint: "One-click unsubscribe (required by Gmail and Yahoo) and a preference center are added automatically.", confirm: "Send now to the whole list?", ab: "A/B test the subject", abHint: "Part of the list gets each subject; after the test window the winner goes to everyone else, automatically.", variant: "Subject", addVar: "Add variation", testPct: "Test size", metric: "Winner by", opens: "opens", clicks: "clicks", wait: "Wait", hours: "hours", when: "When to send", now: "Now", later: "Schedule for", smart: "Each contact's best time (within 24 h)", resend: "Resend to non-openers", resendQ: "New subject for people who didn't open:", report: "Report", winner: "winner", testing: "testing" };

const sel = "h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900";

function AbResults({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["ab", id], queryFn: () => api(`/broadcasts/${id}/ab`), refetchInterval: 15_000 });
  if (!q.data) return null;
  const best = Math.max(...q.data.results.map((r: any) => (q.data.metric === "clicks" ? r.click_rate : r.open_rate)), 0.0001);
  return (
    <div className="mt-3 space-y-1.5">
      {q.data.results.map((r: any) => {
        const v = q.data.metric === "clicks" ? r.click_rate : r.open_rate;
        const win = q.data.winner === r.variant;
        return (
          <div key={r.variant} className="grid grid-cols-[22px_1fr_70px] items-center gap-2 text-xs">
            <b className={`grid size-5 place-items-center rounded ${win ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}>{String.fromCharCode(65 + r.variant)}</b>
            <div><div className="truncate">{q.data.variants[r.variant]}{win && <span className="ml-1 font-semibold">· {L.winner}</span>}</div><div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-zinc-900 dark:bg-white" style={{ width: `${(v / best) * 100}%` }} /></div></div>
            <span className="text-right tabular-nums">{(v * 100).toFixed(1)}% · {num(r.sent)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Broadcasts() {
  const qc = useQueryClient();
  const auds = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const doms = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const q = useQuery({ queryKey: ["broadcasts"], queryFn: () => api("/broadcasts"), refetchInterval: 10_000 });
  const tpls = useQuery({ queryKey: ["templates"], queryFn: () => api("/templates") });
  const [f, setF] = useState({ audience_id: new URLSearchParams(location.search).get("audience") ?? "", from: "", subject: "", html: "", template_id: "" });
  const [ab, setAb] = useState<{ on: boolean; subjects: string[]; test_percent: number; metric: "opens" | "clicks"; wait_hours: number }>({ on: false, subjects: [""], test_percent: 20, metric: "opens", wait_hours: 4 });
  const [when, setWhen] = useState<{ mode: "now" | "later"; at: string; smart: boolean }>({ mode: "now", at: "", smart: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["broadcasts"] });
  const tplHtml = useQuery({ queryKey: ["template", f.template_id], queryFn: () => api(`/templates/${f.template_id}`), enabled: !!f.template_id });
  const [ideas, setIdeas] = useState<{ subject: string; preheader: string; angle: string }[]>([]);
  const suggest = useMutation({
    mutationFn: async () => {
      const tpl = f.template_id ? (await api(`/templates/${f.template_id}`)) : null;
      const brief = [f.subject, tpl?.subject, tpl?.html ?? f.html].filter(Boolean).join("\n").slice(0, 3800) || (pt ? "Novidades da loja" : "Store news");
      return api("/ai/subjects", { body: { brief, n: 5, ...(f.subject ? { current: f.subject } : {}) } });
    },
    onSuccess: (r) => setIdeas(r.subjects),
  });
  const create = useMutation({
    mutationFn: async (go: boolean) => {
      const b = await api("/broadcasts", { body: { audience_id: f.audience_id, from: f.from, ...(f.subject ? { subject: f.subject } : {}), ...(f.template_id ? { template_id: f.template_id } : { html: f.html }), ...(ab.on && ab.subjects.some(Boolean) ? { ab: { ...ab, subjects: ab.subjects.filter(Boolean) } } : {}) } });
      if (go) await api(`/broadcasts/${b.id}/send`, { body: { ...(when.mode === "later" && when.at ? { send_at: new Date(when.at).getTime() } : {}), smart_time: when.smart } });
      return b;
    },
    onSuccess: () => (setF({ ...f, subject: "", html: "", template_id: "" }), setAb({ ...ab, on: false, subjects: [""] }), invalidate()),
  });
  const act = useMutation({ mutationFn: ({ id, a, body }: { id: string; a: string; body?: unknown }) => api(`/broadcasts/${id}/${a}`, { method: "POST", body: body ?? {} }), onSuccess: invalidate });
  const audList: any[] = auds.data?.data ?? [];
  const rows: any[] = q.data?.data ?? [];
  const fromOpts = (doms.data?.data ?? []).filter((d: any) => d.status === "verified").flatMap((d: any) => [`hello@${d.name}`, `news@${d.name}`]);
  const audName = (id: string) => audList.find((a) => a.id === id)?.name ?? id;
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <Card title={L.new} className="mb-6">
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), (when.mode === "now" ? confirm(L.confirm) : true) && create.mutate(true))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <select required value={f.audience_id} onChange={(e) => setF({ ...f, audience_id: e.target.value })} className={sel}>
              <option value="">{L.audience}…</option>
              {audList.map((a) => <option key={a.id} value={a.id}>{a.name} ({num(a.contacts)})</option>)}
            </select>
            <Input required list="from-opts" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} placeholder={`${L.from} — Your Brand <hello@yourdomain.com>`} />
            <datalist id="from-opts">{fromOpts.map((o: string) => <option key={o} value={o} />)}</datalist>
          </div>
          <select value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })} className={`${sel} w-full`}>
            <option value="">{pt ? "Usar um modelo (opcional)…" : "Use a template (optional)…"}</option>
            {(tpls.data?.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex gap-2">
            <Input required={!f.template_id} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={(ab.on ? "A — " : "") + (f.template_id ? `${L.subject} (${pt ? "opcional" : "optional"})` : L.subject)} />
            <Button type="button" variant="ghost" className="shrink-0" disabled={suggest.isPending} onClick={() => suggest.mutate()}><Wand2 size={14} /> {suggest.isPending ? "…" : pt ? "Sugerir" : "Suggest"}</Button>
          </div>
          {ideas.length > 0 && (
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap gap-1.5">
                {ideas.map((x) => <button type="button" key={x.subject} title={x.preheader} onClick={() => setF({ ...f, subject: x.subject })} className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${f.subject === x.subject ? "border-zinc-900 dark:border-white" : "border-zinc-200 dark:border-zinc-700"}`}>{x.subject}<span className="block text-[10px] text-zinc-500">{x.angle}</span></button>)}
              </div>
              <button type="button" className="mt-2 flex items-center gap-1 text-xs font-semibold" onClick={() => { setF({ ...f, subject: f.subject || ideas[0]!.subject }); setAb({ ...ab, on: true, subjects: ideas.filter((x) => x.subject !== (f.subject || ideas[0]!.subject)).slice(0, 2).map((x) => x.subject) }); }}><FlaskConical size={13} /> {pt ? "Testar as melhores em A/B" : "A/B test the best ones"}</button>
              <ErrorText error={suggest.error} />
            </div>
          )}
          {!f.template_id && <textarea required rows={6} value={f.html} onChange={(e) => setF({ ...f, html: e.target.value })} placeholder={L.html} className="w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950" />}

          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={ab.on} onChange={(e) => setAb({ ...ab, on: e.target.checked })} /><FlaskConical size={15} /> {L.ab}</label>
            {ab.on && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-zinc-500">{L.abHint}</p>
                {ab.subjects.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={s} onChange={(e) => setAb({ ...ab, subjects: ab.subjects.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`${String.fromCharCode(66 + i)} — ${L.variant}`} />
                    {ab.subjects.length > 1 && <button type="button" className="text-zinc-400" onClick={() => setAb({ ...ab, subjects: ab.subjects.filter((_, j) => j !== i) })}><X size={15} /></button>}
                  </div>
                ))}
                {ab.subjects.length < 3 && <button type="button" className="flex items-center gap-1 text-xs text-zinc-500" onClick={() => setAb({ ...ab, subjects: [...ab.subjects, ""] })}><Plus size={13} /> {L.addVar}</button>}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {L.testPct}<select className={sel} value={ab.test_percent} onChange={(e) => setAb({ ...ab, test_percent: Number(e.target.value) })}>{[10, 20, 30, 50, 100].map((p) => <option key={p} value={p}>{p}%</option>)}</select>
                  {L.metric}<select className={sel} value={ab.metric} onChange={(e) => setAb({ ...ab, metric: e.target.value as "opens" })}><option value="opens">{L.opens}</option><option value="clicks">{L.clicks}</option></select>
                  {L.wait}<select className={sel} value={ab.wait_hours} onChange={(e) => setAb({ ...ab, wait_hours: Number(e.target.value) })}>{[1, 2, 4, 8, 12, 24].map((h) => <option key={h} value={h}>{h} {L.hours}</option>)}</select>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <Clock size={15} /> {L.when}
            <select className={sel} value={when.mode} onChange={(e) => setWhen({ ...when, mode: e.target.value as "now" })}><option value="now">{L.now}</option><option value="later">{L.later}</option></select>
            {when.mode === "later" && <input type="datetime-local" required value={when.at} onChange={(e) => setWhen({ ...when, at: e.target.value })} className={sel} />}
            <label className="flex items-center gap-2"><input type="checkbox" checked={when.smart} onChange={(e) => setWhen({ ...when, smart: e.target.checked })} /> {L.smart}</label>
          </div>
          <details className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && f.template_id && tplHtml.refetch()}>
            <summary className="cursor-pointer text-sm font-medium">{pt ? "Checar antes de enviar" : "Check before sending"}</summary>
            <div className="mt-3"><Preflight subject={f.subject || tplHtml.data?.subject || ""} html={f.template_id ? tplHtml.data?.html ?? "" : f.html} from={f.from} /></div>
          </details>
          <p className="text-xs text-zinc-500">{L.hint}</p>
          <div className="flex gap-2">
            <Button disabled={create.isPending}>{when.mode === "now" ? <><Send size={14} /> {L.send}</> : <><Clock size={14} /> {L.schedule}</>}</Button>
            <Button type="button" variant="ghost" disabled={create.isPending} onClick={(e) => { const form = (e.currentTarget as HTMLButtonElement).form!; if (form.reportValidity()) create.mutate(false); }}>{L.save}</Button>
          </div>
        </form>
        <div className="mt-2"><ErrorText error={create.error ?? act.error} /></div>
      </Card>

      {rows.length === 0 ? <Card><Empty /></Card> : (
        <div className="space-y-3">
          {rows.map((b) => (
            <Card key={b.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-medium">{b.subject}</span>{b.ab && <FlaskConical size={14} />}{b.resend_of && <Repeat size={14} />}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{audName(b.audience_id)} · {b.status === "scheduled" && b.send_at ? `${L.schedule.toLowerCase()} ${date(b.send_at)}` : date(b.created_at)}{b.smart_time ? " · ✦ best time" : ""}</div>
                  {b.status_reason && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">{b.status_reason}</div>}
                </div>
                <div className="text-right text-sm tabular-nums"><Badge value={b.status} /><div className="mt-1 text-xs text-zinc-500">{num(b.sent_count)} {L.sent}{b.skipped_count > 0 && ` · ${num(b.skipped_count)} ${L.skipped}`}</div></div>
              </div>
              {b.ab && b.sent_count > 0 && <AbResults id={b.id} />}
              <div className="mt-3 flex flex-wrap gap-2">
                {["draft", "paused", "scheduled"].includes(b.status) && <Button className="h-8 text-xs" onClick={() => confirm(L.confirm) && act.mutate({ id: b.id, a: "send" })}><Send size={13} /> {L.send}</Button>}
                {["sending", "paused", "scheduled", "testing"].includes(b.status) && <Button variant="ghost" className="h-8 text-xs" onClick={() => act.mutate({ id: b.id, a: "cancel" })}>{L.cancel}</Button>}
                {b.sent_count > 0 && <Button variant="ghost" className="h-8 text-xs" onClick={() => navigate(`/reports?b=${b.id}`)}><BarChart3 size={13} /> {L.report}</Button>}
                {b.status === "sent" && !b.resend_of && <Button variant="ghost" className="h-8 text-xs" onClick={() => { const s = prompt(L.resendQ, `Did you miss this? ${b.subject}`); s && act.mutate({ id: b.id, a: "resend", body: { subject: s, after_hours: 48 } }); }}><Repeat size={13} /> {L.resend}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
