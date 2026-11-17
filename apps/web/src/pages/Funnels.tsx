import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FunnelGraph } from "@novamail/email";
import { GitBranch, Pause, Play, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { navigate } from "../nav";
import { Badge, Button, Card, Empty, ErrorText, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Funis de e-mail", new: "Funil em branco", hint: "Monte automações arrastando passos e ligando com o mouse: gatilho → e-mail → esperar → condição (sim/não) → etiqueta. Comece de um pronto:", activate: "Ativar", pause: "Pausar", del: "Excluir", active: "em andamento", completed: "concluíram", steps: "e-mails", draft: "rascunho", agent: "montado por IA — revise e ative", open: "Abrir" }
  : { title: "Email funnels", new: "Blank funnel", hint: "Build automations by dragging steps and connecting them with your mouse: trigger → email → wait → condition (yes/no) → tag. Start from a recipe:", activate: "Activate", pause: "Pause", del: "Delete", active: "in progress", completed: "completed", steps: "emails", draft: "draft", agent: "built by AI — review and activate", open: "Open" };

const n = (id: string, type: string, x: number, y: number, data: Record<string, unknown> = {}) => ({ id, type, x, y, data });
const e = (from: string, to: string, handle = "next") => ({ id: `${from}-${handle}-${to}`, from, handle, to });
const RECIPES: { id: string; name: [string, string]; desc: [string, string]; graph: FunnelGraph }[] = [
  {
    id: "welcome",
    name: ["Série de boas-vindas", "Welcome series"],
    desc: ["3 e-mails nos primeiros 5 dias", "3 emails over the first 5 days"],
    graph: { version: 1, nodes: [n("t", "trigger", 0, 0, { kind: "audience" }), n("e1", "email", 0, 140), n("w1", "wait", 0, 280, { minutes: 2880 }), n("e2", "email", 0, 420), n("w2", "wait", 0, 560, { minutes: 4320 }), n("e3", "email", 0, 700), n("end", "end", 0, 840)] as any, edges: [e("t", "e1"), e("e1", "w1"), e("w1", "e2"), e("e2", "w2"), e("w2", "e3"), e("e3", "end")] as any },
  },
  {
    id: "cart",
    name: ["Carrinho abandonado", "Abandoned cart"],
    desc: ["Lembrete, e cupom só para quem não comprou", "Reminder, then a coupon only if they didn't buy"],
    graph: { version: 1, nodes: [n("t", "trigger", 0, 0, { kind: "tag", tag: "cart-abandoned" }), n("w1", "wait", 0, 140, { minutes: 120 }), n("e1", "email", 0, 280), n("w2", "wait", 0, 420, { minutes: 1440 }), n("c", "condition", 0, 560, { kind: "has_tag", tag: "purchased" }), n("end", "end", -160, 720), n("e2", "email", 160, 720), n("end2", "end", 160, 860)] as any, edges: [e("t", "w1"), e("w1", "e1"), e("e1", "w2"), e("w2", "c"), e("c", "end", "yes"), e("c", "e2", "no"), e("e2", "end2")] as any },
  },
  {
    id: "reengage",
    name: ["Reengajamento", "Re-engagement"],
    desc: ["Quem clicou vira 'engaged'; quem não, recebe uma 2ª chance", "Clickers get tagged; others get a second chance"],
    graph: { version: 1, nodes: [n("t", "trigger", 0, 0, { kind: "audience" }), n("e1", "email", 0, 140), n("w", "wait", 0, 280, { minutes: 4320 }), n("c", "condition", 0, 420, { kind: "clicked" }), n("tg", "tag", -160, 580, { action: "add", tag: "engaged" }), n("e2", "email", 160, 580), n("end", "end", -160, 720), n("end2", "end", 160, 720)] as any, edges: [e("t", "e1"), e("e1", "w"), e("w", "c"), e("c", "tg", "yes"), e("c", "e2", "no"), e("tg", "end"), e("e2", "end2")] as any },
  },
  {
    id: "post-purchase",
    name: ["Pós-compra", "Post-purchase"],
    desc: ["Quem compra recebe obrigado em 3 dias e, 30 dias depois, sugestões de produtos ({{products_html}}).", "Buyers get a thank-you after 3 days and, 30 days later, product picks ({{products_html}})."],
    graph: { version: 1, nodes: [n("t", "trigger", 0, 0, { kind: "tag", tag: "purchased" }), n("w1", "wait", 0, 140, { minutes: 4320 }), n("e1", "email", 0, 280), n("w2", "wait", 0, 420, { minutes: 43200 }), n("e2", "email", 0, 560), n("end", "end", 0, 700)] as any, edges: [e("t", "w1"), e("w1", "e1"), e("e1", "w2"), e("w2", "e2"), e("e2", "end")] as any },
  },
];

export function Funnels() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["funnels"], queryFn: () => api("/funnels"), refetchInterval: 15_000 });
  const doms = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const from = () => { const v = doms.data?.data?.find((d: any) => d.status === "verified"); return v ? `hello@${v.name}` : "hello@example.com"; };
  const create = useMutation({
    mutationFn: (r?: (typeof RECIPES)[number]) => api("/funnels", { body: { name: r ? r.name[pt ? 0 : 1] : L.new, from: from(), graph: r?.graph ?? { version: 1, nodes: [n("t", "trigger", 0, 0, { kind: "audience" })], edges: [] } } }),
    onSuccess: (f) => (qc.invalidateQueries({ queryKey: ["funnels"] }), navigate(`/funnels/${f.id}`)),
  });
  const act = useMutation({ mutationFn: ({ id, a }: { id: string; a: string }) => (a === "delete" ? api(`/funnels/${id}`, { method: "DELETE" }) : api(`/funnels/${id}/${a}`, { method: "POST" })), onSuccess: () => qc.invalidateQueries({ queryKey: ["funnels"] }) });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle action={<Button onClick={() => create.mutate(undefined)}><Plus size={15} /> {L.new}</Button>}>{L.title}</PageTitle>
      <p className="-mt-3 mb-4 max-w-2xl text-sm text-zinc-500">{L.hint}</p>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {RECIPES.map((r) => (
          <button key={r.id} onClick={() => create.mutate(r)} className="rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white">
            <GitBranch size={18} />
            <div className="mt-2 font-medium">{r.name[pt ? 0 : 1]}</div>
            <div className="text-xs text-zinc-500">{r.desc[pt ? 0 : 1]}</div>
          </button>
        ))}
      </div>
      <ErrorText error={create.error ?? act.error} />
      {rows.length === 0 ? <Card><Empty /></Card> : (
        <div className="space-y-3">
          {rows.map((f) => (
            <Card key={f.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => navigate(`/funnels/${f.id}`)} className="text-left">
                  <div className="flex items-center gap-2 font-medium">{f.name} <Badge value={f.status === "draft" ? L.draft : f.status} /></div>
                  <div className="text-xs text-zinc-500">{num(f.steps)} {L.steps} · {num(f.active)} {L.active} · {num(f.completed)} {L.completed}{String(f.created_by ?? "").startsWith("agent:") && f.status === "draft" ? ` · ${L.agent}` : ""}</div>
                </button>
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-8 text-xs" onClick={() => navigate(`/funnels/${f.id}`)}>{L.open}</Button>
                  {f.status === "active" ? <Button variant="ghost" className="h-8 text-xs" onClick={() => act.mutate({ id: f.id, a: "pause" })}><Pause size={14} /> {L.pause}</Button> : <Button className="h-8 text-xs" onClick={() => act.mutate({ id: f.id, a: "activate" })}><Play size={14} /> {L.activate}</Button>}
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
