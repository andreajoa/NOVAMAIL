import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Megaphone, Plus, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { navigate } from "../nav";
import { Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Segmentos", lead: "Monte grupos que se atualizam sozinhos — por etiquetas, listas, engajamento, cliques recentes ou seus próprios campos — e envie campanhas só para quem importa.", name: "Nome do segmento", match: "Contatos que atendem", all: "todas", any: "qualquer uma", rules: "das regras", add: "Adicionar regra", save: "Salvar segmento", people: "pessoas", view: "Ver contatos", send: "Enviar campanha", del: "Excluir", saved: "Seus segmentos", days: "dias" }
  : { title: "Segments", lead: "Build groups that update themselves — by tags, lists, engagement, recent clicks or your own fields — and send campaigns only to the people who matter.", name: "Segment name", match: "Contacts matching", all: "all", any: "any", rules: "of the rules", add: "Add rule", save: "Save segment", people: "people", view: "View contacts", send: "Send campaign", del: "Delete", saved: "Your segments", days: "days" };

type Rule = { field: string; op: string; value: string | number | boolean };
const FIELDS: { k: string; l: string; ops: [string, string][]; kind: "tag" | "list" | "num" | "days" | "tier" | "bool" | "text" }[] = [
  { k: "tag", l: pt ? "Etiqueta" : "Tag", ops: [["has", pt ? "tem" : "has"], ["not_has", pt ? "não tem" : "doesn't have"]], kind: "tag" },
  { k: "list", l: pt ? "Lista" : "List", ops: [["in", pt ? "está em" : "is in"], ["not_in", pt ? "não está em" : "is not in"]], kind: "list" },
  { k: "tier", l: pt ? "Engajamento" : "Engagement", ops: [["eq", pt ? "é" : "is"], ["neq", pt ? "não é" : "is not"]], kind: "tier" },
  { k: "score", l: pt ? "Pontuação" : "Score", ops: [["gte", "≥"], ["lte", "≤"]], kind: "num" },
  { k: "clicked", l: pt ? "Clicou" : "Clicked", ops: [["within", pt ? "nos últimos" : "in the last"], ["not_within", pt ? "não nos últimos" : "not in the last"]], kind: "days" },
  { k: "opened", l: pt ? "Abriu" : "Opened", ops: [["within", pt ? "nos últimos" : "in the last"], ["not_within", pt ? "não nos últimos" : "not in the last"]], kind: "days" },
  { k: "created", l: pt ? "Entrou" : "Joined", ops: [["within", pt ? "nos últimos" : "in the last"], ["not_within", pt ? "há mais de" : "more than"]], kind: "days" },
  { k: "subscribed", l: pt ? "Inscrito" : "Subscribed", ops: [["is", pt ? "é" : "is"]], kind: "bool" },
  { k: "company", l: pt ? "Empresa" : "Company", ops: [["contains", pt ? "contém" : "contains"]], kind: "text" },
  { k: "email", l: "E-mail", ops: [["contains", pt ? "contém" : "contains"]], kind: "text" },
];
const sel = "h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900";

function RuleRow({ r, onChange, onRemove, lists, customFields }: { r: Rule; onChange: (r: Rule) => void; onRemove: () => void; lists: any[]; customFields: any[] }) {
  const f = FIELDS.find((x) => x.k === r.field) ?? (r.field.startsWith("field:") ? { k: r.field, l: "", ops: [["eq", "="], ["contains", pt ? "contém" : "contains"], ["gte", "≥"], ["lte", "≤"]] as [string, string][], kind: "text" as const } : FIELDS[0]!);
  const fieldOptions = [...FIELDS.map((x) => [x.k, x.l]), ...customFields.map((c) => [`field:${c.key}`, c.label])];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <select className={sel} value={r.field} onChange={(e) => { const nf = FIELDS.find((x) => x.k === e.target.value); onChange({ field: e.target.value, op: nf?.ops[0]![0] ?? "eq", value: nf?.kind === "bool" ? true : nf?.kind === "days" ? 30 : nf?.kind === "num" ? 40 : nf?.kind === "tier" ? "hot" : "" }); }}>
        {fieldOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select className={sel} value={r.op} onChange={(e) => onChange({ ...r, op: e.target.value })}>{f.ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {f.kind === "list" ? (
        <select className={sel} value={String(r.value)} onChange={(e) => onChange({ ...r, value: e.target.value })}><option value="">—</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      ) : f.kind === "tier" ? (
        <select className={sel} value={String(r.value)} onChange={(e) => onChange({ ...r, value: e.target.value })}><option value="hot">{pt ? "Quente" : "Hot"}</option><option value="warm">{pt ? "Morno" : "Warm"}</option><option value="cold">{pt ? "Frio" : "Cold"}</option></select>
      ) : f.kind === "bool" ? (
        <select className={sel} value={String(r.value)} onChange={(e) => onChange({ ...r, value: e.target.value === "true" })}><option value="true">{pt ? "sim" : "yes"}</option><option value="false">{pt ? "não" : "no"}</option></select>
      ) : (
        <div className="flex items-center gap-2">
          <Input className="!w-40" type={f.kind === "num" || f.kind === "days" ? "number" : "text"} value={String(r.value)} onChange={(e) => onChange({ ...r, value: f.kind === "num" || f.kind === "days" ? Number(e.target.value) : f.kind === "tag" ? e.target.value.toLowerCase() : e.target.value })} />
          {f.kind === "days" && <span className="text-sm text-zinc-500">{L.days}</span>}
        </div>
      )}
      <button onClick={onRemove} className="ml-auto p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"><X size={16} /></button>
    </div>
  );
}

export function Segments() {
  const qc = useQueryClient();
  const lists = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const fields = useQuery({ queryKey: ["crm-fields"], queryFn: () => api("/crm/fields") });
  const saved = useQuery({ queryKey: ["segments"], queryFn: () => api("/segments") });
  const [name, setName] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [rules, setRules] = useState<Rule[]>([{ field: "tier", op: "eq", value: "hot" }]);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setCount((await api("/segments/preview", { body: { match, rules } })).count); } catch { setCount(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [match, rules]);
  const save = useMutation({ mutationFn: () => api("/segments", { body: { name, rules: { match, rules } } }), onSuccess: () => (setName(""), qc.invalidateQueries({ queryKey: ["segments"] })) });
  const del = useMutation({ mutationFn: (id: string) => api(`/segments/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }) });
  const send = useMutation({ mutationFn: (id: string) => api(`/segments/${id}/list`, { method: "POST" }), onSuccess: (r) => (qc.invalidateQueries({ queryKey: ["audiences"] }), navigate(`/broadcasts?audience=${r.id}`)) });

  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      <Card className="mb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Filter size={16} /> {L.match}
          <select className={sel} value={match} onChange={(e) => setMatch(e.target.value as "all")}><option value="all">{L.all}</option><option value="any">{L.any}</option></select>
          {L.rules}
          <span className="ml-auto rounded-full bg-zinc-900 px-3 py-1 text-sm font-semibold text-white tabular-nums dark:bg-white dark:text-zinc-900">{count === null ? "…" : num(count)} {L.people}</span>
        </div>
        <div className="space-y-2">
          {rules.map((r, i) => <RuleRow key={i} r={r} lists={lists.data?.data ?? []} customFields={fields.data?.data ?? []} onChange={(nr) => setRules(rules.map((x, j) => (j === i ? nr : x)))} onRemove={() => setRules(rules.filter((_, j) => j !== i))} />)}
        </div>
        <Button variant="ghost" className="mt-3" onClick={() => setRules([...rules, { field: "tag", op: "has", value: "" }])}><Plus size={14} /> {L.add}</Button>
        <form className="mt-5 flex gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={L.name} />
          <Button disabled={save.isPending} className="shrink-0">{L.save}</Button>
        </form>
        <ErrorText error={save.error} />
      </Card>

      <h2 className="mb-3 text-sm font-semibold">{L.saved}</h2>
      {(saved.data?.data ?? []).length === 0 ? <Card><Empty /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {saved.data.data.map((s: any) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-medium">{s.name}</div><div className="text-xs text-zinc-500">{s.rules.rules.length} {pt ? "regras" : "rules"} · {s.rules.match === "all" ? L.all : L.any}</div></div>
                <div className="text-right"><div className="text-2xl font-semibold tabular-nums">{num(s.count)}</div><div className="text-[11px] text-zinc-500">{L.people}</div></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="ghost" className="h-8 text-xs" onClick={() => navigate(`/contacts?segment=${s.id}`)}><Users size={14} /> {L.view}</Button>
                <Button className="h-8 text-xs" onClick={() => send.mutate(s.id)} disabled={send.isPending || !s.count}><Megaphone size={14} /> {L.send}</Button>
                <button className="ml-auto p-1 text-zinc-400 hover:text-red-600" onClick={() => confirm(`${L.del} ${s.name}?`) && del.mutate(s.id)}><Trash2 size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ErrorText error={send.error ?? del.error} />
    </>
  );
}
