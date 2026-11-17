import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Flame, GitBranch, Mail, MousePointerClick, Eye, Plus, Search, StickyNote, Tag, Trash2, Upload, UserPlus, X, Ban, ListPlus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { date, lang, num } from "../i18n";
import { navigate } from "../nav";
import { Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Contatos", lead: "Cada pessoa em um só lugar: listas, etiquetas, campos, aberturas, cliques, funis e notas — com pontuação de engajamento automática.", search: "Buscar nome, e-mail, empresa ou etiqueta", all: "Todos", hot: "Quentes", warm: "Mornos", cold: "Frios", add: "Adicionar contato", importc: "Importar CSV", export: "Exportar CSV", segments: "Segmentos", segment: "Segmento", none: "Nenhum", name: "Nome", tags: "Etiquetas", score: "Engajamento", activity: "Última atividade", lists: "listas", selected: "selecionados", addTag: "Adicionar etiqueta", removeTag: "Remover etiqueta", toList: "Adicionar à lista", unsub: "descadastrado", phone: "Telefone", company: "Empresa", first: "Nome", last: "Sobrenome", save: "Salvar", note: "Escreva uma nota…", addNote: "Adicionar nota", timeline: "Linha do tempo", sent: "Enviados", opened: "Abriu", clicked: "Clicou", fields: "Campos", newField: "Novo campo", del: "Apagar contato (LGPD)", importHint: "Cole um CSV com cabeçalho. Colunas reconhecidas: email, first_name, last_name, phone, company, tags (separadas por |). Outras colunas viram campos.", run: "Importar", list: "Lista" }
  : { title: "Contacts", lead: "Everyone in one place: lists, tags, fields, opens, clicks, funnels and notes — with automatic engagement scoring.", search: "Search name, email, company or tag", all: "All", hot: "Hot", warm: "Warm", cold: "Cold", add: "Add contact", importc: "Import CSV", export: "Export CSV", segments: "Segments", segment: "Segment", none: "None", name: "Name", tags: "Tags", score: "Engagement", activity: "Last activity", lists: "lists", selected: "selected", addTag: "Add tag", removeTag: "Remove tag", toList: "Add to list", unsub: "unsubscribed", phone: "Phone", company: "Company", first: "First name", last: "Last name", save: "Save", note: "Write a note…", addNote: "Add note", timeline: "Timeline", sent: "Sent", opened: "Opened", clicked: "Clicked", fields: "Fields", newField: "New field", del: "Delete contact (GDPR)", importHint: "Paste a CSV with a header row. Known columns: email, first_name, last_name, phone, company, tags (separated by |). Other columns become fields.", run: "Import", list: "List" };

const TIER: Record<string, string> = { hot: L.hot, warm: L.warm, cold: L.cold };
const initials = (p: any) => ((p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "") || p.email[0]).toUpperCase();
const ICONS: Record<string, ReactNode> = { sent: <Mail size={14} />, opened: <Eye size={14} />, clicked: <MousePointerClick size={14} />, note: <StickyNote size={14} />, tag_added: <Tag size={14} />, tag_removed: <Tag size={14} />, joined_list: <ListPlus size={14} />, funnel: <GitBranch size={14} />, unsubscribed: <Ban size={14} />, created: <UserPlus size={14} />, bounced: <Ban size={14} />, complained: <Ban size={14} /> };
const KIND: Record<string, string> = pt
  ? { sent: "E-mail enviado", opened: "Abriu", clicked: "Clicou", note: "Nota", tag_added: "Etiqueta adicionada", tag_removed: "Etiqueta removida", joined_list: "Entrou na lista", funnel: "Entrou no funil", unsubscribed: "Descadastrou", resubscribed: "Voltou a assinar", order: "Comprou", cart_abandoned: "Abandonou carrinho", deal_created: "Negócio criado", deal_stage: "Negócio mudou de etapa", task_done: "Tarefa concluída", created: "Criado", bounced: "Devolvido", complained: "Marcou como spam", delivery_delayed: "Entrega atrasada", held: "Retido" }
  : { sent: "Email sent", opened: "Opened", clicked: "Clicked", note: "Note", tag_added: "Tag added", tag_removed: "Tag removed", joined_list: "Joined list", funnel: "Entered funnel", unsubscribed: "Unsubscribed", resubscribed: "Resubscribed", order: "Ordered", cart_abandoned: "Abandoned cart", deal_created: "Deal created", deal_stage: "Deal moved", task_done: "Task done", created: "Created", bounced: "Bounced", complained: "Marked as spam", delivery_delayed: "Delivery delayed", held: "Held" };

function ScoreBar({ score, tier }: { score: number; tier: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-zinc-900 dark:bg-white" style={{ width: `${score}%`, opacity: tier === "cold" ? 0.35 : tier === "warm" ? 0.65 : 1 }} /></div>
      <span className="flex items-center gap-1 text-xs font-medium">{tier === "hot" && <Flame size={12} />}{TIER[tier]}</span>
    </div>
  );
}

function TagChips({ tags, onRemove }: { tags: string[]; onRemove?: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium dark:border-zinc-700">
          {t}{onRemove && <button onClick={() => onRemove(t)} className="opacity-50 hover:opacity-100"><X size={11} /></button>}
        </span>
      ))}
    </div>
  );
}

function Drawer({ email, onClose }: { email: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["person", email], queryFn: () => api(`/people/${encodeURIComponent(email)}`) });
  const fields = useQuery({ queryKey: ["crm-fields"], queryFn: () => api("/crm/fields") });
  const [form, setForm] = useState<any>(null);
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  useEffect(() => { if (q.data) setForm({ first_name: q.data.first_name ?? "", last_name: q.data.last_name ?? "", phone: q.data.phone ?? "", company: q.data.company ?? "", fields: { ...q.data.fields } }); }, [q.data]);
  const refresh = () => (qc.invalidateQueries({ queryKey: ["person", email] }), qc.invalidateQueries({ queryKey: ["people"] }));
  const patch = useMutation({ mutationFn: (body: any) => api(`/people/${encodeURIComponent(email)}`, { method: "PATCH", body }), onSuccess: refresh });
  const addNote = useMutation({ mutationFn: () => api(`/people/${encodeURIComponent(email)}/notes`, { body: { body: note } }), onSuccess: () => (setNote(""), refresh()) });
  const del = useMutation({ mutationFn: () => api(`/people/${encodeURIComponent(email)}`, { method: "DELETE" }), onSuccess: () => (qc.invalidateQueries({ queryKey: ["people"] }), onClose()) });
  const p = q.data;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        {!p || !form ? <p className="text-sm text-zinc-500">…</p> : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-zinc-900 text-lg font-semibold text-white dark:bg-white dark:text-zinc-900">{initials(p)}</div>
                <div>
                  <div className="text-lg font-semibold">{[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}</div>
                  <div className="text-sm text-zinc-500">{p.email}{!p.subscribed && ` · ${L.unsub}`}</div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[["score", p.score], [L.sent, p.stats.sent], [L.opened, p.stats.opened], [L.clicked, p.stats.clicked]].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl border border-zinc-200 py-3 dark:border-zinc-800"><div className="text-xl font-semibold tabular-nums">{num(Number(v))}</div><div className="text-[11px] text-zinc-500">{k === "score" ? TIER[p.tier] : k}</div></div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder={L.first} />
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder={L.last} />
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={L.phone} />
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder={L.company} />
              {(fields.data?.data ?? []).map((f: any) => (
                <Input key={f.key} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={form.fields[f.key] ?? ""} onChange={(e) => setForm({ ...form, fields: { ...form.fields, [f.key]: e.target.value } })} placeholder={f.label} />
              ))}
            </div>
            <Button className="mt-2" onClick={() => patch.mutate(form)} disabled={patch.isPending}>{L.save}</Button>
            <div className="mt-5">
              <div className="mb-1.5 text-xs font-medium text-zinc-500">{L.tags}</div>
              <TagChips tags={p.tags} onRemove={(t) => patch.mutate({ remove_tags: [t] })} />
              <form className="mt-2 flex gap-2" onSubmit={(e) => (e.preventDefault(), tag && patch.mutate({ add_tags: [tag.toLowerCase().replace(/[^a-z0-9_.:-]/g, "-")] }), setTag(""))}>
                <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="vip, purchased, lead…" /><Button variant="ghost" className="shrink-0"><Plus size={14} /></Button>
              </form>
            </div>
            <div className="mt-5 text-xs text-zinc-500">{p.lists.map((l: any) => l.name).join(" · ")}</div>
            <div className="mt-5">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={L.note} className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
              <Button variant="ghost" className="mt-1" disabled={!note.trim()} onClick={() => addNote.mutate()}>{L.addNote}</Button>
            </div>
            <h3 className="mb-2 mt-6 text-sm font-semibold">{L.timeline}</h3>
            <ol className="relative space-y-3 border-l border-zinc-200 pl-5 dark:border-zinc-800">
              {p.timeline.map((t: any, i: number) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[29px] grid size-6 place-items-center rounded-full border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">{ICONS[t.kind] ?? <Mail size={14} />}</span>
                  <div className="text-sm"><span className="font-medium">{KIND[t.kind] ?? t.kind}</span>{t.title && <span className="text-zinc-600 dark:text-zinc-400"> — {t.title}</span>}</div>
                  {t.detail && <div className="truncate text-xs text-zinc-500">{t.detail}</div>}
                  <div className="text-[11px] text-zinc-400">{date(t.at)}</div>
                </li>
              ))}
            </ol>
            <button onClick={() => confirm(`${L.del}?`) && del.mutate()} className="mt-8 flex items-center gap-1.5 text-xs text-red-600 hover:underline"><Trash2 size={13} /> {L.del}</button>
            <ErrorText error={patch.error ?? addNote.error ?? del.error} />
          </>
        )}
      </aside>
    </div>
  );
}

export function Contacts() {
  const qc = useQueryClient();
  const [qText, setQ] = useState("");
  const [tier, setTier] = useState<"" | "hot" | "warm" | "cold">("");
  const [segment, setSegment] = useState(new URLSearchParams(location.search).get("segment") ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<"" | "add" | "import" | "field">("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(qText), 250); return () => clearTimeout(t); }, [qText]);
  const rules = tier ? JSON.stringify({ match: "all", rules: [{ field: "tier", op: "eq", value: tier }] }) : "";
  const params = new URLSearchParams({ sort: "recent", limit: "200", ...(debounced ? { q: debounced } : {}), ...(segment ? { segment } : rules ? { rules } : {}) });
  const q = useQuery({ queryKey: ["people", params.toString()], queryFn: () => api(`/people?${params}`) });
  const all = useQuery({ queryKey: ["people", "tiers"], queryFn: () => api("/people?limit=1") });
  const segs = useQuery({ queryKey: ["segments"], queryFn: () => api("/segments") });
  const auds = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const rows: any[] = q.data?.data ?? [];
  const bulk = useMutation({ mutationFn: (body: any) => api("/people/bulk", { body: { emails: [...sel], ...body } }), onSuccess: () => (setSel(new Set()), qc.invalidateQueries({ queryKey: ["people"] })) });
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", list_id: "", tags: "" });
  const add = useMutation({ mutationFn: () => api("/people", { body: { email: form.email, first_name: form.first_name || undefined, last_name: form.last_name || undefined, list_id: form.list_id || undefined, tags: form.tags ? form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : undefined } }), onSuccess: () => (setPanel(""), setForm({ email: "", first_name: "", last_name: "", list_id: "", tags: "" }), qc.invalidateQueries({ queryKey: ["people"] })) });
  const [csv, setCsv] = useState("");
  const [importList, setImportList] = useState("");
  const parsed = useMemo(() => parseCsv(csv), [csv]);
  const imp = useMutation({ mutationFn: () => api("/people/import", { body: { rows: parsed, list_id: importList || undefined } }), onSuccess: () => (setPanel(""), setCsv(""), qc.invalidateQueries({ queryKey: ["people"] })) });
  const [fieldLabel, setFieldLabel] = useState("");
  const addField = useMutation({ mutationFn: () => api("/crm/fields", { body: { label: fieldLabel } }), onSuccess: () => (setFieldLabel(""), setPanel(""), qc.invalidateQueries({ queryKey: ["crm-fields"] })) });
  const t = all.data?.tiers ?? { hot: 0, warm: 0, cold: 0 };
  const toggle = (e: string) => setSel((s) => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n; });

  return (
    <>
      <PageTitle action={
        <div className="flex flex-wrap gap-2">
          <a href="/api/people/export.csv" className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"><Download size={15} /> {L.export}</a>
          <Button variant="ghost" onClick={() => setPanel(panel === "import" ? "" : "import")}><Upload size={15} /> {L.importc}</Button>
          <Button onClick={() => setPanel(panel === "add" ? "" : "add")}><UserPlus size={15} /> {L.add}</Button>
        </div>
      }>{L.title}</PageTitle>
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-zinc-500">{L.lead}</p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["", L.all, (all.data?.total ?? 0)], ["hot", L.hot, t.hot], ["warm", L.warm, t.warm], ["cold", L.cold, t.cold]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => (setTier(k), setSegment(""))} className={`rounded-xl border p-4 text-left transition ${tier === k && !segment ? "border-zinc-900 dark:border-white" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"}`}>
            <div className="text-2xl font-semibold tabular-nums">{num(n)}</div>
            <div className="flex items-center gap-1 text-xs text-zinc-500">{k === "hot" && <Flame size={12} />}{label}</div>
          </button>
        ))}
      </div>

      {panel === "add" && (
        <Card className="mb-4">
          <form className="grid gap-2 sm:grid-cols-5" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder={L.first} />
            <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder={L.last} />
            <select value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"><option value="">{L.list}: All contacts</option>{(auds.data?.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <div className="flex gap-2"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, lead" /><Button disabled={add.isPending} className="shrink-0"><Plus size={14} /></Button></div>
          </form>
          <ErrorText error={add.error} />
        </Card>
      )}
      {panel === "import" && (
        <Card className="mb-4">
          <p className="mb-2 text-xs text-zinc-500">{L.importHint}</p>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder={"email,first_name,company,tags,city\nana@shop.com,Ana,Acme,vip|lead,Austin"} className="w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={importList} onChange={(e) => setImportList(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"><option value="">{L.list}: All contacts</option>{(auds.data?.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <Button disabled={!parsed.length || imp.isPending} onClick={() => imp.mutate()}>{L.run} ({num(parsed.length)})</Button>
            <label className="cursor-pointer text-xs underline">.csv<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => e.target.files?.[0] && setCsv(await e.target.files[0].text())} /></label>
          </div>
          <ErrorText error={imp.error} />
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-zinc-400" /><Input value={qText} onChange={(e) => setQ(e.target.value)} placeholder={L.search} className="pl-9" /></div>
        <select value={segment} onChange={(e) => (setSegment(e.target.value), setTier(""))} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <option value="">{L.segment}: {L.none}</option>
          {(segs.data?.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({num(s.count)})</option>)}
        </select>
        <Button variant="ghost" onClick={() => navigate("/segments")}>{L.segments}</Button>
        <Button variant="ghost" onClick={() => setPanel(panel === "field" ? "" : "field")}>+ {L.newField}</Button>
      </div>
      {panel === "field" && (
        <form className="mb-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), addField.mutate())}><Input value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} placeholder={pt ? "Ex.: Cidade, Último pedido, Aniversário" : "e.g. City, Last order, Birthday"} /><Button className="shrink-0">{L.save}</Button></form>
      )}
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-white dark:text-zinc-900">
          <b>{num(sel.size)} {L.selected}</b>
          <button className="underline" onClick={() => { const t = prompt(L.addTag); t && bulk.mutate({ add_tags: [t.toLowerCase()] }); }}>{L.addTag}</button>
          <button className="underline" onClick={() => { const t = prompt(L.removeTag); t && bulk.mutate({ remove_tags: [t.toLowerCase()] }); }}>{L.removeTag}</button>
          <select onChange={(e) => e.target.value && bulk.mutate({ add_to_list: e.target.value })} value="" className="rounded bg-transparent text-sm underline"><option value="">{L.toList}…</option>{(auds.data?.data ?? []).map((a: any) => <option key={a.id} value={a.id} className="text-zinc-900">{a.name}</option>)}</select>
          <button className="ml-auto opacity-70" onClick={() => setSel(new Set())}><X size={15} /></button>
        </div>
      )}

      <Card>
        {rows.length === 0 ? <Empty>{q.isLoading ? "…" : undefined}</Empty> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-zinc-500"><tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="w-10 px-5 py-2"><input type="checkbox" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.email)) : new Set())} /></th>
                <th className="px-2 py-2 font-medium">{L.name}</th><th className="px-2 py-2 font-medium">{L.tags}</th><th className="px-2 py-2 font-medium">{L.score}</th><th className="px-5 py-2 font-medium">{L.activity}</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((p) => (
                  <tr key={p.email} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40" onClick={() => setOpen(p.email)}>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.email)} onChange={() => toggle(p.email)} /></td>
                    <td className="px-2 py-3"><div className="flex items-center gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-xs font-semibold dark:bg-zinc-800">{initials(p)}</div><div className="min-w-0"><div className="truncate font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</div><div className="truncate text-xs text-zinc-500">{p.email}{p.company ? ` · ${p.company}` : ""}{!p.subscribed ? ` · ${L.unsub}` : ""}</div></div></div></td>
                    <td className="px-2 py-3"><TagChips tags={p.tags.slice(0, 4)} /></td>
                    <td className="px-2 py-3"><ScoreBar score={p.score} tier={p.tier} /></td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-500">{p.last_activity_at ? date(p.last_activity_at) : "—"} · {p.lists.length} {L.lists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ErrorText error={q.error ?? bulk.error} />
      {open && <Drawer email={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Small CSV parser (quoted fields, commas, newlines in quotes). */
function parseCsv(src: string) {
  const text = src.trim();
  if (!text) return [];
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") (row.push(cur), (cur = ""));
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  row.push(cur); rows.push(row);
  const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!head.includes("email")) return rows.filter((r) => r[0]?.includes("@")).map((r) => ({ email: r[0]!.trim().toLowerCase() }));
  const known = ["email", "first_name", "last_name", "phone", "company", "tags"];
  return rows.slice(1).filter((r) => r[head.indexOf("email")]?.includes("@")).slice(0, 2000).map((r) => {
    const o: any = { fields: {} };
    head.forEach((h, i) => {
      const v = (r[i] ?? "").trim();
      if (!v) return;
      if (h === "tags") o.tags = v.split("|").map((t) => t.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "-")).filter(Boolean).slice(0, 20);
      else if (known.includes(h)) o[h] = h === "email" ? v.toLowerCase() : v;
      else o.fields[h.replace(/[^a-z0-9_]/g, "_").slice(0, 40)] = v.slice(0, 500);
    });
    return o;
  });
}
