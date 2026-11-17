import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { date, lang, num } from "../i18n";
import { Badge, Button, Card, Empty, ErrorText, Input, PageTitle, Table, Td } from "../ui";

const L = lang === "pt"
  ? { title: "Campanhas", new: "Nova campanha", audience: "Público", from: "Remetente (domínio verificado)", subject: "Assunto", html: "Conteúdo HTML — use {{first_name}} e {{unsubscribe_url}}", save: "Salvar rascunho", send: "Enviar", cancel: "Cancelar", sent: "Enviados", skipped: "Pulados", hint: "O link de descadastro em 1 clique (exigido por Gmail e Yahoo) é adicionado automaticamente.", confirm: "Enviar agora para todo o público?" }
  : { title: "Broadcasts", new: "New broadcast", audience: "Audience", from: "From (verified domain)", subject: "Subject", html: "HTML content — use {{first_name}} and {{unsubscribe_url}}", save: "Save draft", send: "Send", cancel: "Cancel", sent: "Sent", skipped: "Skipped", hint: "One-click unsubscribe (required by Gmail and Yahoo) is added automatically.", confirm: "Send now to the whole audience?" };

export function Broadcasts() {
  const qc = useQueryClient();
  const auds = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const q = useQuery({ queryKey: ["broadcasts"], queryFn: () => api("/broadcasts"), refetchInterval: 10_000 });
  const [f, setF] = useState({ audience_id: new URLSearchParams(location.search).get("audience") ?? "", from: "", subject: "", html: "", template_id: "" });
  const tpls = useQuery({ queryKey: ["templates"], queryFn: () => api("/templates") });
  const create = useMutation({ mutationFn: () => api("/broadcasts", { body: { audience_id: f.audience_id, from: f.from, ...(f.subject ? { subject: f.subject } : {}), ...(f.template_id ? { template_id: f.template_id } : { html: f.html }) } }), onSuccess: () => (setF({ ...f, subject: "", html: "", template_id: "" }), qc.invalidateQueries({ queryKey: ["broadcasts"] })) });
  const act = useMutation({ mutationFn: ({ id, a }: { id: string; a: "send" | "cancel" }) => api(`/broadcasts/${id}/${a}`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }) });
  const audList: any[] = auds.data?.data ?? [];
  const rows: any[] = q.data?.data ?? [];
  const audName = (id: string) => audList.find((a) => a.id === id)?.name ?? id;
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <Card title={L.new} className="mb-4">
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <div className="grid gap-3 sm:grid-cols-2">
            <select required value={f.audience_id} onChange={(e) => setF({ ...f, audience_id: e.target.value })} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <option value="">{L.audience}…</option>
              {audList.map((a) => <option key={a.id} value={a.id}>{a.name} ({num(a.contacts)})</option>)}
            </select>
            <Input required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} placeholder={L.from} />
          </div>
          <select value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <option value="">{lang === "pt" ? "Usar um modelo (opcional)…" : "Use a template (optional)…"}</option>
            {(tpls.data?.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Input required={!f.template_id} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={f.template_id ? `${L.subject} (${lang === "pt" ? "opcional" : "optional"})` : L.subject} />
          {!f.template_id && <textarea required rows={6} value={f.html} onChange={(e) => setF({ ...f, html: e.target.value })} placeholder={L.html} className="w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950" />}
          <p className="text-xs text-zinc-500">{L.hint}</p>
          <Button disabled={create.isPending}>{L.save}</Button>
        </form>
        <div className="mt-2"><ErrorText error={create.error ?? act.error} /></div>
      </Card>
      <Card>
        {rows.length === 0 ? <Empty /> : (
          <Table head={[L.subject, L.audience, "Status", L.sent, ""]}>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td className="max-w-[240px] truncate">{b.subject}<div className="text-xs text-zinc-500">{date(b.created_at)}</div></Td>
                <Td className="text-zinc-500">{audName(b.audience_id)}</Td>
                <Td><Badge value={b.status} />{b.status_reason && <div className="mt-1 max-w-[220px] text-xs text-amber-700 dark:text-amber-400">{b.status_reason}</div>}</Td>
                <Td className="tabular-nums">{num(b.sent_count)}{b.skipped_count > 0 && <span className="text-zinc-500"> · {num(b.skipped_count)} {L.skipped.toLowerCase()}</span>}</Td>
                <Td className="text-right whitespace-nowrap">
                  {["draft", "paused"].includes(b.status) && <Button className="h-7 px-2 text-xs" onClick={() => confirm(L.confirm) && act.mutate({ id: b.id, a: "send" })}>{L.send}</Button>}
                  {["sending", "paused"].includes(b.status) && <Button variant="ghost" className="ml-2 h-7 px-2 text-xs" onClick={() => act.mutate({ id: b.id, a: "cancel" })}>{L.cancel}</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
