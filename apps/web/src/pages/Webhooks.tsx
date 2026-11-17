import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { date, t } from "../i18n";
import { Button, Card, Empty, ErrorText, Input, Modal, PageTitle, Secret, Table, Td } from "../ui";

const EVENTS = ["email.delivered", "email.delivery_delayed", "email.bounced", "email.held", "email.opened", "email.clicked", "email.complained"];

export function Webhooks() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["*"]);
  const [secret, setSecret] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["webhooks"], queryFn: () => api("/webhooks") });
  const create = useMutation({
    mutationFn: () => api("/webhooks", { body: { endpoint: url, events } }),
    onSuccess: (r) => (setSecret(r.signing_secret), setUrl(""), qc.invalidateQueries({ queryKey: ["webhooks"] })),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/webhooks/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }) });
  const toggle = (e: string) => setEvents((cur) => (e === "*" ? ["*"] : cur.includes(e) ? cur.filter((x) => x !== e) : [...cur.filter((x) => x !== "*"), e]));
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{t.webhooks}</PageTitle>
      <Card className="mb-4">
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input required type="url" pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`${t.endpoint} — https://sualoja.com/webhooks/novamail`} />
            <Button disabled={create.isPending || events.length === 0} className="shrink-0">{t.addWebhook}</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["*", ...EVENTS].map((e) => (
              <button type="button" key={e} onClick={() => toggle(e)} className={`rounded-md border px-2 py-1 font-mono text-xs ${events.includes(e) ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900" : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"}`}>
                {e === "*" ? t.allEvents : e}
              </button>
            ))}
          </div>
        </form>
        <div className="mt-2"><ErrorText error={create.error ?? del.error} /></div>
      </Card>
      <Card>
        {rows.length === 0 ? <Empty /> : (
          <Table head={[t.endpoint, t.events, t.created, ""]}>
            {rows.map((w) => (
              <tr key={w.id}>
                <Td className="max-w-[280px] truncate font-mono text-xs">{w.endpoint}</Td>
                <Td className="text-xs text-zinc-500">{w.events.join(", ")}</Td>
                <Td className="text-zinc-500">{date(w.created_at)}</Td>
                <Td className="text-right"><Button variant="danger" className="h-7 px-2 text-xs" onClick={() => del.mutate(w.id)}>{t.remove}</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {secret && (
        <Modal title={t.signingSecret} onClose={() => setSecret(null)}>
          <p className="text-sm text-zinc-500">{t.showOnce} Standard Webhooks (webhook-id, webhook-timestamp, webhook-signature).</p>
          <Secret label={t.signingSecret} value={secret} />
        </Modal>
      )}
    </>
  );
}
