import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { date, lang } from "../i18n";
import { Button, Card, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const ROLE_INFO: Record<string, [string, string]> = pt
  ? { owner: ["Dono", "Tudo, inclusive cobrança e donos"], admin: ["Admin", "Tudo, menos cobrança"], editor: ["Editor", "Campanhas, modelos, funis, formulários e contatos"], viewer: ["Leitor", "Só visualiza"] }
  : { owner: ["Owner", "Everything, incl. billing and owners"], admin: ["Admin", "Everything except billing"], editor: ["Editor", "Campaigns, templates, funnels, forms and contacts"], viewer: ["Viewer", "Read-only"] };
const L = pt
  ? { title: "Equipe", lead: "Convide pessoas e dê a cada uma só o acesso de que precisa.", invite: "Convidar", email: "e-mail@empresa.com", pending: "Convites pendentes", members: "Membros", you: "você", last: "último acesso", never: "nunca entrou", expires: "expira" }
  : { title: "Team", lead: "Invite people and give each one only the access they need.", invite: "Invite", email: "name@company.com", pending: "Pending invites", members: "Members", you: "you", last: "last seen", never: "never signed in", expires: "expires" };
const sel = "h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900";

export function Team() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const [f, setF] = useState({ email: "", role: "editor" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });
  const invite = useMutation({ mutationFn: () => api("/team/invites", { body: f }), onSuccess: () => (setF({ ...f, email: "" }), refresh()) });
  const setRole = useMutation({ mutationFn: ({ id, role }: { id: string; role: string }) => api(`/team/members/${id}`, { method: "PATCH", body: { role } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/team/members/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/team/invites/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const d = q.data;
  const canManage = d?.role === "owner" || d?.role === "admin";
  const roles = d?.role === "owner" ? ["owner", "admin", "editor", "viewer"] : ["admin", "editor", "viewer"];
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 text-sm text-zinc-500">{L.lead}</p>
      {canManage && (
        <Card className="mb-6">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), invite.mutate())}>
            <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={L.email} className="min-w-[220px] flex-1" />
            <select className={sel} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{ROLE_INFO[r]![0]}</option>)}</select>
            <Button disabled={invite.isPending}><UserPlus size={15} /> {L.invite}</Button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">{ROLE_INFO[f.role]![1]}</p>
          <ErrorText error={invite.error} />
        </Card>
      )}
      <Card className="mb-6">
        <h3 className="mb-2 text-sm font-semibold">{L.members}</h3>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {(d?.members ?? []).map((m: any) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="grid size-9 place-items-center rounded-full bg-zinc-100 text-sm font-semibold dark:bg-zinc-800">{m.email[0].toUpperCase()}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.email}{m.id === d.you && <span className="ml-1 text-zinc-500">({L.you})</span>}</div><div className="text-xs text-zinc-500">{m.last_login_at ? `${L.last} ${date(m.last_login_at)}` : L.never}</div></div>
              {canManage && m.id !== d.you && (d.role === "owner" || m.role !== "owner") ? (
                <>
                  <select className={sel} value={m.role} onChange={(e) => setRole.mutate({ id: m.id, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{ROLE_INFO[r]![0]}</option>)}</select>
                  <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => confirm(`${m.email}?`) && remove.mutate(m.id)}><Trash2 size={15} /></button>
                </>
              ) : <span className="text-sm text-zinc-500">{ROLE_INFO[m.role]![0]}</span>}
            </div>
          ))}
        </div>
        <ErrorText error={setRole.error ?? remove.error} />
      </Card>
      {(d?.invites ?? []).length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold">{L.pending}</h3>
          {d.invites.map((i: any) => (
            <div key={i.id} className="flex items-center gap-3 py-2 text-sm">
              <Mail size={15} className="text-zinc-400" /><span className="flex-1 truncate">{i.email}</span>
              <span className="text-xs text-zinc-500">{ROLE_INFO[i.role]![0]} · {L.expires} {date(i.expires_at)}</span>
              {canManage && <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => revoke.mutate(i.id)}><Trash2 size={14} /></button>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
