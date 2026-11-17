import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { date, t } from "../i18n";
import { Badge, Button, Card, Empty, ErrorText, Input, Modal, PageTitle, Secret, Table, Td } from "../ui";

export function Keys() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [perm, setPerm] = useState("sending_access");
  const [token, setToken] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["keys"], queryFn: () => api("/api-keys") });
  const create = useMutation({
    mutationFn: () => api("/api-keys", { body: { name, permission: perm } }),
    onSuccess: (r) => (setToken(r.token), setName(""), qc.invalidateQueries({ queryKey: ["keys"] })),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/api-keys/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }) });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{t.apiKeys}</PageTitle>
      <Card className="mb-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Input required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.keyName} />
          <select value={perm} onChange={(e) => setPerm(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <option value="sending_access">{t.sendingAccess}</option>
            <option value="full_access">{t.fullAccess}</option>
          </select>
          <Button disabled={create.isPending} className="shrink-0">{t.createKey}</Button>
        </form>
        <div className="mt-2"><ErrorText error={create.error ?? revoke.error} /></div>
      </Card>
      <Card>
        {rows.length === 0 ? <Empty /> : (
          <Table head={[t.name, "Token", t.status, t.lastUsed, ""]}>
            {rows.map((k) => (
              <tr key={k.id}>
                <Td className="font-medium">{k.name}</Td>
                <Td><code className="font-mono text-xs text-zinc-500">{k.prefix}…</code></Td>
                <Td><Badge value={k.permission === "full" ? t.fullAccess : t.sendingAccess} /></Td>
                <Td className="text-zinc-500">{k.last_used_at ? date(k.last_used_at) : t.never}</Td>
                <Td className="text-right"><Button variant="danger" className="h-7 px-2 text-xs" onClick={() => confirm(`${t.revoke} ${k.name}?`) && revoke.mutate(k.id)}>{t.revoke}</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {token && (
        <Modal title={t.apiKeys} onClose={() => setToken(null)}>
          <p className="text-sm text-zinc-500">{t.showOnce}</p>
          <Secret label="API key" value={token} />
        </Modal>
      )}
    </>
  );
}
