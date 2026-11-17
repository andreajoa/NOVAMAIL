import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { Badge, Button, Card, Empty, ErrorText, Input, PageTitle, Table, Td } from "../ui";

const L = lang === "pt"
  ? { title: "Públicos", new: "Novo público", name: "Nome do público", contacts: "Contatos", unsub: "Descadastrados", import: "Importar contatos", importHint: "Cole e-mails (um por linha) ou CSV: email,nome,sobrenome", run: "Importar", open: "Ver", del: "Excluir", imported: "importados" }
  : { title: "Audiences", new: "New audience", name: "Audience name", contacts: "Contacts", unsub: "Unsubscribed", import: "Import contacts", importHint: "Paste emails (one per line) or CSV: email,first,last", run: "Import", open: "Open", del: "Delete", imported: "imported" };

function parseList(src: string) {
  return src
    .split(/\r?\n/)
    .map((l) => l.split(/[,;\t]/).map((x) => x.trim()))
    .filter(([e]) => e && e.includes("@") && !/^email$/i.test(e))
    .map(([email, first_name, last_name]) => ({ email: email!, first_name: first_name || undefined, last_name: last_name || undefined }));
}

function Contacts({ id }: { id: string }) {
  const qc = useQueryClient();
  const [src, setSrc] = useState("");
  const q = useQuery({ queryKey: ["contacts", id], queryFn: () => api(`/audiences/${id}/contacts`) });
  const imp = useMutation({
    mutationFn: async () => {
      const list = parseList(src);
      let n = 0;
      for (let i = 0; i < list.length; i += 1000) n += (await api(`/audiences/${id}/contacts`, { body: list.slice(i, i + 1000) })).imported;
      return n;
    },
    onSuccess: () => (setSrc(""), qc.invalidateQueries({ queryKey: ["contacts", id] }), qc.invalidateQueries({ queryKey: ["audiences"] })),
  });
  const rows: any[] = q.data?.data ?? [];
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{L.import}</label>
        <textarea value={src} onChange={(e) => setSrc(e.target.value)} rows={4} placeholder={L.importHint} className="w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950" />
        <div className="flex items-center gap-3">
          <Button disabled={!src.trim() || imp.isPending} onClick={() => imp.mutate()}>{L.run} ({parseList(src).length})</Button>
          {imp.data !== undefined && <span className="text-sm text-zinc-500">{num(imp.data)} {L.imported}</span>}
        </div>
        <ErrorText error={imp.error} />
      </div>
      {rows.length === 0 ? <Empty /> : (
        <Table head={["E-mail", lang === "pt" ? "Nome" : "Name", "Status"]}>
          {rows.map((c) => (
            <tr key={c.id}>
              <Td className="font-mono text-xs">{c.email}</Td>
              <Td>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</Td>
              <Td><Badge value={c.unsubscribed ? "unsubscribed" : "active"} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export function Audiences() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const add = useMutation({ mutationFn: () => api("/audiences", { body: { name } }), onSuccess: (r) => (setName(""), setOpen(r.id), qc.invalidateQueries({ queryKey: ["audiences"] })) });
  const del = useMutation({ mutationFn: (id: string) => api(`/audiences/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["audiences"] }) });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <Card className="mb-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={L.name} />
          <Button disabled={add.isPending} className="shrink-0">{L.new}</Button>
        </form>
        <div className="mt-2"><ErrorText error={add.error ?? del.error} /></div>
      </Card>
      {rows.length === 0 ? <Card><Empty /></Card> : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Card
              key={a.id}
              title={a.name}
              action={
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{num(a.contacts)} {L.contacts.toLowerCase()} · {num(a.unsubscribed)} {L.unsub.toLowerCase()}</span>
                  <button className="hover:text-zinc-900 dark:hover:text-white" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "▲" : L.open}</button>
                  <button className="text-red-600 hover:underline" onClick={() => confirm(`${L.del} ${a.name}?`) && del.mutate(a.id)}>{L.del}</button>
                </div>
              }
            >
              {open === a.id ? <Contacts id={a.id} /> : <p className="text-xs text-zinc-500 font-mono">{a.id}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
