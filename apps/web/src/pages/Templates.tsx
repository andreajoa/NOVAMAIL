import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { renderDesign } from "@novamail/email";
import { Code2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { date, lang } from "../i18n";
import { navigate } from "../nav";
import { Badge, Button, Card, Empty, ErrorText, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { seasonal: "Datas comemorativas (EUA)", standard: "Do dia a dia", title: "Modelos de e-mail", presets: "Comece com um modelo pronto", mine: "Seus modelos", blank: "Em branco", paste: "Colar HTML", use: "Usar", edit: "Editar", del: "Excluir", visual: "visual", html: "HTML", agent: "criado por IA", hint: "Clique em um modelo, troque textos, cores e imagens arrastando com o mouse e salve. Depois use em campanhas e funis." }
  : { seasonal: "Holidays & seasons (US)", standard: "Everyday", title: "Email templates", presets: "Start from a ready-made template", mine: "Your templates", blank: "Blank", paste: "Paste HTML", use: "Use", edit: "Edit", del: "Delete", visual: "visual", html: "HTML", agent: "made by AI", hint: "Pick a template, change text, colours and images with your mouse, save — then use it in campaigns and funnels." };

function Thumb({ design }: { design: unknown }) {
  const html = useMemo(() => renderDesign(design), [design]);
  return (
    <div className="pointer-events-none h-56 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800">
      <iframe title="thumb" sandbox="allow-same-origin" srcDoc={html} className="h-[900px] w-[1000px] origin-top-left scale-[0.32] border-0" tabIndex={-1} />
    </div>
  );
}

export function Templates() {
  const qc = useQueryClient();
  const presets = useQuery({ queryKey: ["presets"], queryFn: () => api("/templates/presets") });
  const mine = useQuery({ queryKey: ["templates"], queryFn: () => api("/templates") });
  const create = useMutation({
    mutationFn: (body: unknown) => api("/templates", { body }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ["templates"] }), navigate(`/templates/${r.id}`)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/templates/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }) });
  const rows: any[] = mine.data?.data ?? [];
  const [cat, setCat] = useState<"seasonal" | "standard">("seasonal");
  const list: any[] = (presets.data?.data ?? []).filter((p: any) => (p.category ?? "standard") === cat);
  return (
    <>
      <PageTitle
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => create.mutate({ name: L.paste, subject: "", html: "<!doctype html><html><body><p>Paste your HTML here</p></body></html>" })}><Code2 size={15} /> {L.paste}</Button>
            <Button onClick={() => create.mutate({ name: L.blank, subject: "", design: { version: 1, theme: {}, blocks: [] } })}><Plus size={15} /> {L.blank}</Button>
          </div>
        }
      >
        {L.title}
      </PageTitle>
      <p className="-mt-3 mb-6 text-sm text-zinc-500">{L.hint}</p>
      <ErrorText error={create.error ?? del.error} />

      {rows.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold">{L.mine}</h2>
          <Card>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button onClick={() => navigate(`/templates/${t.id}`)} className="min-w-0 text-left">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="truncate text-xs text-zinc-500">{t.subject || "—"} · {date(t.updated_at)}</div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge value={t.visual ? L.visual : L.html} />
                    {String(t.created_by ?? "").startsWith("agent:") && <Badge value={L.agent} />}
                    <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => navigate(`/templates/${t.id}`)}>{L.edit}</Button>
                    <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => confirm(`${L.del} ${t.name}?`) && del.mutate(t.id)} aria-label={L.del}><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{L.presets}</h2>
        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800">
          {(["seasonal", "standard"] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`rounded-md px-3 py-1.5 ${cat === c ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"}`}>{L[c]}</button>
          ))}
        </div>
      </div>
      {!presets.data ? <Empty /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p: any) => (
            <button key={p.id} onClick={() => create.mutate({ name: p.name[pt ? "pt" : "en"], subject: p.subject, design: p.design })} disabled={create.isPending} className="group rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Thumb design={p.design} />
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium">{p.name[pt ? "pt" : "en"]}{p.date && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{p.date}</span>}</div>
                  <div className="text-xs text-zinc-500">{p.description[pt ? "pt" : "en"]}</div>
                </div>
                <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100 dark:bg-white dark:text-zinc-900">{L.use}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
