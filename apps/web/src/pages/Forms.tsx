import { DEFAULT_FORM, formCss, formHtml, type FormConfig } from "@novamail/email";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, FileText, Monitor, MousePointerClick, PanelBottom, Plus, Smartphone, SquareStack, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { Button, Card, Empty, ErrorText, Input, PageTitle } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { title: "Formulários", lead: "Faça sua lista crescer sozinha: formulário no site, pop-up (tempo, rolagem ou intenção de saída) ou página própria — com confirmação dupla, proteção contra robôs e prova de consentimento.", new: "Novo formulário", views: "visualizações", subs: "inscritos", conv: "conversão", back: "Formulários", save: "Salvar", saved: "Salvo", kind: "Tipo", embed: "No site", popup: "Pop-up", page: "Página", list: "Lista", dbl: "Confirmação dupla (recomendado)", from: "Remetente da confirmação", content: "Conteúdo", ttl: "Título", txt: "Texto", btn: "Botão", ok: "Mensagem de sucesso", legal: "Texto de consentimento", img: "Imagem (URL https)", fields: "Campos", style: "Estilo", trig: "Quando abrir", delay: "Depois de X segundos", scroll: "Ao rolar X% da página", exit: "Intenção de saída", sec: "segundos", pct: "%", freq: "Mostrar de novo após (dias)", pos: "Posição", tags: "Etiquetas ao entrar", redir: "Redirecionar após inscrição (opcional)", code: "Instalar", copy: "Copiar", copied: "Copiado", active: "Ativo", paused: "Pausado", presets: "Comece por um modelo", del: "Excluir", noDomain: "Verifique um domínio para usar a confirmação dupla." }
  : { title: "Forms", lead: "Grow your list on autopilot: inline form, popup (time, scroll or exit-intent) or hosted page — with double opt-in, bot protection and consent proof.", new: "New form", views: "views", subs: "subscribers", conv: "conversion", back: "Forms", save: "Save", saved: "Saved", kind: "Type", embed: "Inline", popup: "Popup", page: "Page", list: "List", dbl: "Double opt-in (recommended)", from: "Confirmation sender", content: "Content", ttl: "Title", txt: "Text", btn: "Button", ok: "Success message", legal: "Consent text", img: "Image (https URL)", fields: "Fields", style: "Style", trig: "When to open", delay: "After X seconds", scroll: "After scrolling X%", exit: "Exit intent", sec: "seconds", pct: "%", freq: "Show again after (days)", pos: "Position", tags: "Tags on join", redir: "Redirect after signup (optional)", code: "Install", copy: "Copy", copied: "Copied", active: "Active", paused: "Paused", presets: "Start from a template", del: "Delete", noDomain: "Verify a domain to use double opt-in." };

const PRESETS: { id: string; name: string; kind: "embed" | "popup" | "page"; cfg: Partial<FormConfig> }[] = [
  { id: "discount", name: pt ? "Pop-up de desconto" : "Discount popup", kind: "popup", cfg: { title: "Take 10% off your first order", text: "Join the list and we'll send your code right away.", button: "Get my 10% off" } },
  { id: "exit", name: pt ? "Antes de sair" : "Exit intent", kind: "popup", cfg: { title: "Wait — don't miss the next drop", text: "Be first to know about new arrivals and private sales.", button: "Keep me posted", popup: { ...DEFAULT_FORM.popup, trigger: "exit" } } },
  { id: "newsletter", name: pt ? "Newsletter no rodapé" : "Footer newsletter", kind: "embed", cfg: { title: "The weekly letter", text: "One useful email every Friday. Unsubscribe anytime.", button: "Subscribe", fields: ["email"] } },
  { id: "waitlist", name: pt ? "Lista de espera" : "Waitlist page", kind: "page", cfg: { title: "Join the waitlist", text: "We're opening spots in small batches. Get early access before anyone else.", button: "Join the waitlist", fields: ["email", "first_name"] } },
  { id: "dark", name: pt ? "Barra escura" : "Dark bar", kind: "popup", cfg: { title: "Free shipping on your first order", text: "", button: "Unlock", fields: ["email"], theme: { bg: "#09090b", fg: "#fafafa", accent: "#fafafa", button_fg: "#09090b", radius: 14, font: "system" }, popup: { ...DEFAULT_FORM.popup, trigger: "scroll", scroll: 40, position: "bottom-bar" } } },
];

const sel = "h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900";
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block"><span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>{children}</label>
);

function Preview({ cfg, kind, device }: { cfg: FormConfig; kind: string; device: "desktop" | "mobile" }) {
  const doc = useMemo(() => {
    const popup = kind === "popup";
    const pos = cfg.popup.position;
    const wrap = popup
      ? `body{background:linear-gradient(#e4e4e7 0 0) 24px 24px/60% 14px no-repeat,linear-gradient(#e4e4e7 0 0) 24px 52px/40% 10px no-repeat,#fafafa}.ov{position:fixed;inset:0;background:rgba(9,9,11,.5);${pos === "center" ? "" : "display:none"}}.nm-card{position:fixed;${pos === "bottom-right" ? "right:16px;bottom:16px" : pos === "bottom-bar" ? "left:50%;bottom:12px;transform:translateX(-50%)" : "left:50%;top:50%;transform:translate(-50%,-50%)"};width:min(440px,calc(100vw - 32px))}`
      : "body{display:grid;place-items:center;min-height:100vh;background:#f4f4f5}";
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%}body{padding:16px;box-sizing:border-box}${formCss(cfg)}${wrap}</style></head><body>${popup ? '<div class="ov"></div>' : ""}${formHtml(cfg, { action: "#", closable: popup })}</body></html>`;
  }, [cfg, kind]);
  return (
    <div className={`mx-auto overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all dark:border-zinc-800 ${device === "mobile" ? "h-[640px] w-[360px]" : "h-[560px] w-full"}`}>
      <iframe title="preview" sandbox="" srcDoc={doc} className="h-full w-full" />
    </div>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-500">{label}
        <button className="flex items-center gap-1 text-zinc-900 dark:text-white" onClick={() => (navigator.clipboard.writeText(value), setOk(true), setTimeout(() => setOk(false), 1500))}>{ok ? <Check size={13} /> : <Copy size={13} />}{ok ? L.copied : L.copy}</button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100">{value}</pre>
    </div>
  );
}

function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["form", id], queryFn: () => api(`/forms/${id}`) });
  const lists = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const doms = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const [f, setF] = useState<any>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data, f]);
  const save = useMutation({ mutationFn: () => api(`/forms/${id}`, { method: "PATCH", body: { name: f.name, kind: f.kind, audience_id: f.audience_id, double_optin: f.double_optin, status: f.status, config: f.config } }), onSuccess: () => (setSavedAt(Date.now()), qc.invalidateQueries({ queryKey: ["forms"] })) });
  if (!f) return <p className="text-sm text-zinc-500">…</p>;
  const c: FormConfig = f.config;
  const set = (patch: Partial<FormConfig>) => setF({ ...f, config: { ...c, ...patch } });
  const verified = (doms.data?.data ?? []).filter((d: any) => d.status === "verified");
  const fromOpts = verified.flatMap((d: any) => [`hello@${d.name}`, `news@${d.name}`]);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft size={15} /> {L.back}</button>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="!w-64 font-medium" />
        <select className={`${sel} !w-auto`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">{L.active}</option><option value="paused">{L.paused}</option></select>
        <Button className="ml-auto" onClick={() => save.mutate()} disabled={save.isPending}>{Date.now() - savedAt < 2500 ? <><Check size={14} /> {L.saved}</> : L.save}</Button>
      </div>
      <ErrorText error={save.error} />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {([["embed", L.embed, SquareStack], ["popup", L.popup, MousePointerClick], ["page", L.page, FileText]] as const).map(([k, l, I]) => (
                <button key={k} onClick={() => setF({ ...f, kind: k })} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${f.kind === k ? "bg-white shadow-sm dark:bg-zinc-950" : "text-zinc-500"}`}><I size={14} />{l}</button>
              ))}
            </div>
            <div className="space-y-3">
              <Field label={L.list}><select className={sel} value={f.audience_id} onChange={(e) => setF({ ...f, audience_id: e.target.value })}>{(lists.data?.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.double_optin} onChange={(e) => setF({ ...f, double_optin: e.target.checked })} /> {L.dbl}</label>
              {f.double_optin && (verified.length ? (
                <Field label={L.from}><select className={sel} value={c.from ?? ""} onChange={(e) => set({ from: e.target.value })}><option value="">—</option>{fromOpts.map((o: string) => <option key={o}>{o}</option>)}{c.from && !fromOpts.includes(c.from) && <option>{c.from}</option>}</select></Field>
              ) : <p className="text-xs text-zinc-500">{L.noDomain}</p>)}
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold">{L.content}</h3>
            <div className="space-y-3">
              <Field label={L.ttl}><Input value={c.title} onChange={(e) => set({ title: e.target.value })} /></Field>
              <Field label={L.txt}><textarea rows={3} value={c.text} onChange={(e) => set({ text: e.target.value })} className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label={L.btn}><Input value={c.button} onChange={(e) => set({ button: e.target.value })} /></Field><Field label={L.img}><Input value={c.image ?? ""} onChange={(e) => set({ image: e.target.value })} placeholder="https://…" /></Field></div>
              <Field label={L.fields}>
                <div className="flex gap-3 text-sm">{(["email", "first_name", "last_name", "phone"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5"><input type="checkbox" disabled={k === "email"} checked={c.fields.includes(k)} onChange={(e) => set({ fields: e.target.checked ? [...c.fields, k] : c.fields.filter((x) => x !== k) })} />{k.replace("_", " ")}</label>
                ))}</div>
              </Field>
              <Field label={L.ok}><Input value={c.success} onChange={(e) => set({ success: e.target.value })} /></Field>
              <Field label={L.legal}><Input value={c.consent_text} onChange={(e) => set({ consent_text: e.target.value })} /></Field>
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold">{L.style}</h3>
            <div className="grid grid-cols-4 gap-2">
              {(["bg", "fg", "accent", "button_fg"] as const).map((k) => (
                <label key={k} className="text-center text-[11px] text-zinc-500"><input type="color" value={c.theme[k]} onChange={(e) => set({ theme: { ...c.theme, [k]: e.target.value } })} className="h-9 w-full cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800" />{k.replace("_", " ")}</label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Radius"><input type="range" min={0} max={32} value={c.theme.radius} onChange={(e) => set({ theme: { ...c.theme, radius: Number(e.target.value) } })} className="w-full accent-zinc-900" /></Field>
              <Field label="Font"><select className={sel} value={c.theme.font} onChange={(e) => set({ theme: { ...c.theme, font: e.target.value as "system" } })}><option value="system">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></Field>
            </div>
          </Card>
          {f.kind === "popup" && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">{L.trig}</h3>
              <div className="space-y-3">
                <select className={sel} value={c.popup.trigger} onChange={(e) => set({ popup: { ...c.popup, trigger: e.target.value as "delay" } })}><option value="delay">{L.delay}</option><option value="scroll">{L.scroll}</option><option value="exit">{L.exit}</option></select>
                {c.popup.trigger === "delay" && <Field label={L.sec}><Input type="number" value={c.popup.delay} onChange={(e) => set({ popup: { ...c.popup, delay: Number(e.target.value) } })} /></Field>}
                {c.popup.trigger === "scroll" && <Field label={L.pct}><Input type="number" value={c.popup.scroll} onChange={(e) => set({ popup: { ...c.popup, scroll: Number(e.target.value) } })} /></Field>}
                <div className="grid grid-cols-2 gap-2">
                  <Field label={L.freq}><Input type="number" value={c.popup.frequency_days} onChange={(e) => set({ popup: { ...c.popup, frequency_days: Number(e.target.value) } })} /></Field>
                  <Field label={L.pos}><select className={sel} value={c.popup.position} onChange={(e) => set({ popup: { ...c.popup, position: e.target.value as "center" } })}><option value="center">Center</option><option value="bottom-right">Corner</option><option value="bottom-bar">Bar</option></select></Field>
                </div>
              </div>
            </Card>
          )}
          <Card>
            <div className="space-y-3">
              <Field label={L.tags}><Input value={c.tags.join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "-")).filter(Boolean).slice(0, 10) })} placeholder="lead, popup" /></Field>
              <Field label={L.redir}><Input value={c.redirect_url ?? ""} onChange={(e) => set({ redirect_url: e.target.value })} placeholder="https://yourshop.com/thanks" /></Field>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              {([["desktop", Monitor], ["mobile", Smartphone]] as const).map(([d, I]) => <button key={d} onClick={() => setDevice(d)} className={`rounded-md p-1.5 ${device === d ? "bg-white shadow-sm dark:bg-zinc-950" : "text-zinc-500"}`}><I size={15} /></button>)}
            </div>
            <div className="text-xs text-zinc-500 tabular-nums">{num(f.views)} {L.views} · {num(f.confirms)} {L.subs} · {f.views ? ((f.confirms / f.views) * 100).toFixed(1) : "0"}% {L.conv}</div>
          </div>
          <Preview cfg={c} kind={f.kind} device={device} />
          <Card>
            <h3 className="mb-3 text-sm font-semibold">{L.code}</h3>
            <div className="space-y-3">
              {f.kind === "embed" && <CopyBox label="HTML" value={f.embed.inline} />}
              {f.kind === "popup" && <CopyBox label="<head> / <body>" value={f.embed.popup} />}
              <CopyBox label={pt ? "Link da página" : "Hosted page link"} value={f.embed.page} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function Forms() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(new URLSearchParams(location.search).get("id"));
  const list = useQuery({ queryKey: ["forms"], queryFn: () => api("/forms") });
  const auds = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const doms = useQuery({ queryKey: ["domains"], queryFn: () => api("/domains") });
  const create = useMutation({
    mutationFn: async (p: (typeof PRESETS)[number]) => {
      let aud = auds.data?.data?.[0]?.id;
      if (!aud) aud = (await api("/audiences", { body: { name: "Subscribers" } })).id;
      const dom = (doms.data?.data ?? []).find((d: any) => d.status === "verified");
      const config = { ...DEFAULT_FORM, ...p.cfg, from: dom ? `hello@${dom.name}` : undefined };
      return api("/forms", { body: { name: p.name, kind: p.kind, audience_id: aud, double_optin: !!dom, config } });
    },
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ["forms"] }), setOpen(r.id)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/forms/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }) });
  if (open) return <Editor id={open} onBack={() => setOpen(null)} />;
  const rows: any[] = list.data?.data ?? [];
  const icon = (k: string) => (k === "popup" ? <MousePointerClick size={16} /> : k === "page" ? <FileText size={16} /> : <PanelBottom size={16} />);
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      <h2 className="mb-3 text-sm font-semibold">{L.presets}</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {PRESETS.map((p) => (
          <button key={p.id} disabled={create.isPending} onClick={() => create.mutate(p)} className="group rounded-xl border border-zinc-200 p-3 text-left transition hover:-translate-y-0.5 hover:border-zinc-900 dark:border-zinc-800 dark:hover:border-white">
            <div className="mb-3 grid h-20 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-800" style={p.cfg.theme ? { background: p.cfg.theme.bg, color: p.cfg.theme.fg } : undefined}>
              <div className="w-3/4 space-y-1"><div className="h-2 w-2/3 rounded bg-current opacity-80" /><div className="h-1.5 w-full rounded bg-current opacity-30" /><div className="mt-2 h-4 w-full rounded bg-current opacity-90" /></div>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium">{icon(p.kind)} {p.name}</div>
          </button>
        ))}
      </div>
      <ErrorText error={create.error} />
      <Card>
        {rows.length === 0 ? <Empty /> : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <div key={r.id} className="flex cursor-pointer items-center gap-4 py-3" onClick={() => setOpen(r.id)}>
                <div className="grid size-9 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-800">{icon(r.kind)}</div>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-zinc-500">{r.status === "active" ? L.active : L.paused} · {r.double_optin ? "double opt-in" : "single opt-in"}</div></div>
                <div className="hidden text-right text-xs tabular-nums text-zinc-500 sm:block"><b className="text-sm text-zinc-900 dark:text-white">{num(r.confirms)}</b> {L.subs}<br />{r.views ? ((r.confirms / r.views) * 100).toFixed(1) : "0"}% {L.conv}</div>
                <button onClick={(e) => (e.stopPropagation(), confirm(`${L.del} ${r.name}?`) && del.mutate(r.id))} className="p-1 text-zinc-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <button className="mt-3 flex items-center gap-1 text-sm text-zinc-500" onClick={() => create.mutate(PRESETS[2]!)}><Plus size={14} /> {L.new}</button>
    </>
  );
}
