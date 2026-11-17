import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { date, lang, num } from "../i18n";
import { Badge, Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "SMS e WhatsApp", lead: "Use sua própria conta Twilio (SMS) ou WhatsApp Cloud da Meta — você paga as mensagens direto a eles. Mensagens de marketing só vão para quem aceitou; STOP descadastra na hora.", connect: "Conectar", name: "Nome", log: "Mensagens recentes", hook: "URL de webhook (status e respostas STOP)", verify: "Token de verificação (cole no app da Meta)", test: "Enviar teste para (+1…)", testBody: "Mensagem de teste", sent: "enviadas", delivered: "entregues", howTw: "No Twilio: Console → Account Info (SID e Auth Token) e um número com SMS. Cole a URL abaixo em Phone Numbers → seu número → Messaging → A message comes in.", howWa: "Na Meta: app do WhatsApp Business → API Setup (Phone number ID e token permanente de usuário do sistema) e App Secret (Configurações → Básico). Depois, em Webhooks, cole a URL e o token de verificação e assine messages." }
  : { title: "SMS & WhatsApp", lead: "Use your own Twilio (SMS) or Meta WhatsApp Cloud account — you pay them directly per message. Marketing messages only go to people who opted in; STOP opts out instantly.", connect: "Connect", name: "Name", log: "Recent messages", hook: "Webhook URL (status + STOP replies)", verify: "Verify token (paste into your Meta app)", test: "Send a test to (+1…)", testBody: "Test message", sent: "sent", delivered: "delivered", howTw: "In Twilio: Console → Account Info (SID and Auth Token) and an SMS-capable number. Paste the URL below in Phone Numbers → your number → Messaging → A message comes in.", howWa: "In Meta: your WhatsApp Business app → API Setup (Phone number ID and a permanent system-user token) and the App Secret (Settings → Basic). Then in Webhooks paste the URL and verify token and subscribe to messages." };

export function Channels() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["channels"], queryFn: () => api("/channels") });
  const log = useQuery({ queryKey: ["messages"], queryFn: () => api("/messages"), refetchInterval: 15_000 });
  const [kind, setKind] = useState<"sms_twilio" | "whatsapp_meta">("sms_twilio");
  const [f, setF] = useState<Record<string, string>>({ name: "" });
  const [created, setCreated] = useState<any>(null);
  const [test, setTest] = useState({ to: "", body: L.testBody });
  const refresh = () => (qc.invalidateQueries({ queryKey: ["channels"] }), qc.invalidateQueries({ queryKey: ["messages"] }));
  const add = useMutation({ mutationFn: () => api("/channels", { body: { kind, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) } }), onSuccess: (r) => (setCreated(r), setF({ name: "" }), refresh()) });
  const del = useMutation({ mutationFn: (id: string) => api(`/channels/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const send = useMutation({ mutationFn: (id: string) => api("/messages", { body: { channel_id: id, to: test.to, body: test.body, transactional: true } }), onSuccess: refresh });
  const fields: [string, string][] = kind === "sms_twilio"
    ? [["account_sid", "Account SID (AC…)"], ["auth_token", "Auth Token"], ["from", "From number (+1…)"], ["messaging_service_sid", "or Messaging Service SID (MG…)"]]
    : [["phone_number_id", "Phone number ID"], ["access_token", "Access token"], ["app_secret", "App Secret"]];
  const rows: any[] = q.data?.data ?? [];
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      <Card className="mb-6">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {([["sms_twilio", "SMS · Twilio", MessageSquare], ["whatsapp_meta", "WhatsApp · Meta", MessageCircle]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setKind(k)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${kind === k ? "bg-white shadow-sm dark:bg-zinc-950" : "text-zinc-500"}`}><I size={15} /> {l}</button>
          ))}
        </div>
        <p className="mb-3 text-xs text-zinc-500">{kind === "sms_twilio" ? L.howTw : L.howWa}</p>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
          <Input required value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={L.name} />
          {fields.map(([k, l]) => <Input key={k} type={/token|secret/.test(k) ? "password" : "text"} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value.trim() })} placeholder={l} autoComplete="off" />)}
          <Button disabled={add.isPending} className="sm:col-span-2">{L.connect}</Button>
        </form>
        <ErrorText error={add.error} />
        {created?.verify_token && <div className="mt-3 rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-100">{L.verify}: {created.verify_token}</div>}
      </Card>
      {rows.length > 0 && (
        <div className="mb-6 space-y-3">
          {rows.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">{c.kind === "sms_twilio" ? <MessageSquare size={17} /> : <MessageCircle size={17} />}</div>
                <div className="flex-1"><div className="font-medium">{c.name}</div><div className="text-xs text-zinc-500">{c.sender} · {num(c.sent)} {L.sent} · {num(c.delivered)} {L.delivered}</div></div>
                <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => confirm(`${c.name}?`) && del.mutate(c.id)}><Trash2 size={15} /></button>
              </div>
              <div className="mt-3 text-xs text-zinc-500">{L.hook}</div>
              <div className="truncate rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">{c.webhook_url}</div>
              {c.kind === "sms_twilio" && (
                <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), send.mutate(c.id))}>
                  <Input required value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} placeholder={L.test} className="!w-48" />
                  <Input value={test.body} onChange={(e) => setTest({ ...test, body: e.target.value })} className="min-w-[160px] flex-1" />
                  <Button variant="ghost" disabled={send.isPending}>→</Button>
                </form>
              )}
            </Card>
          ))}
          <ErrorText error={send.error ?? del.error} />
        </div>
      )}
      <Card>
        <h3 className="mb-2 text-sm font-semibold">{L.log}</h3>
        {(log.data?.data ?? []).length === 0 ? <Empty /> : (
          <div className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {log.data.data.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                {m.kind === "sms" ? <MessageSquare size={14} className="text-zinc-400" /> : <MessageCircle size={14} className="text-zinc-400" />}
                <span className="w-32 shrink-0 tabular-nums">{m.to_phone}</span>
                <span className="flex-1 truncate text-zinc-500">{m.body ?? (m.template ? `template: ${JSON.parse(m.template).name}` : "")}{m.error && ` — ${m.error}`}</span>
                <Badge value={m.status} />
                <span className="hidden text-xs text-zinc-400 sm:inline">{date(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
