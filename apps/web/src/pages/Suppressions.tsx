import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { date, t } from "../i18n";
import { Badge, Button, Card, Empty, ErrorText, Input, PageTitle, Table, Td } from "../ui";

export function Suppressions() {
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const q = useQuery({ queryKey: ["suppressions"], queryFn: () => api("/suppressions") });
  const add = useMutation({ mutationFn: () => api("/suppressions", { body: { address } }), onSuccess: () => (setAddress(""), qc.invalidateQueries({ queryKey: ["suppressions"] })) });
  const del = useMutation({ mutationFn: (a: string) => api(`/suppressions/${encodeURIComponent(a)}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["suppressions"] }) });
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{t.suppressions}</PageTitle>
      <Card className="mb-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
          <Input required type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="cliente@exemplo.com" />
          <Button disabled={add.isPending} className="shrink-0">{t.add}</Button>
        </form>
        <div className="mt-2"><ErrorText error={add.error ?? del.error} /></div>
      </Card>
      <Card>
        {rows.length === 0 ? <Empty /> : (
          <Table head={[t.address, t.reason, t.date, ""]}>
            {rows.map((s) => (
              <tr key={s.address}>
                <Td className="font-mono text-xs">{s.address}</Td>
                <Td><Badge value={s.reason} /></Td>
                <Td className="text-zinc-500">{date(s.created_at)}</Td>
                <Td className="text-right"><Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => del.mutate(s.address)}>{t.remove}</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
