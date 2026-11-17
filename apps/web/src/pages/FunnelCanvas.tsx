import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateGraph, type FunnelGraph, type FunnelNode, type NodeType } from "@novamail/email";
import {
  addEdge, Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, CircleStop, Clock, GitFork, Mail, Pause, Play, Tag, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { lang, num } from "../i18n";
import { navigate } from "../nav";
import { Button, ErrorText, Input } from "../ui";

const pt = lang === "pt";
const L = pt
  ? { back: "Funis", save: "Salvar", saved: "Salvo", activate: "Ativar", pause: "Pausar", from: "Remetente (domínio verificado)", name: "Nome do funil", palette: "Arraste para o desenho", fix: "Para ativar, corrija:", ok: "Pronto para ativar", select: "Clique em um passo para configurar. Ligue os passos arrastando da bolinha de baixo para a de cima. Delete apaga.", people: "pessoas aqui", yes: "Sim", no: "Não",
      types: { trigger: "Gatilho", email: "Enviar e-mail", wait: "Esperar", condition: "Condição", tag: "Etiqueta", end: "Fim" } as Record<NodeType, string>,
      tkind: { audience: "Entrou na lista", tag: "Recebeu a etiqueta", api: "Chamado pela API" }, ckind: { opened: "Abriu o e-mail anterior?", clicked: "Clicou no e-mail anterior?", has_tag: "Tem a etiqueta?", in_audience: "Está na lista?" },
      list: "Lista", template: "Modelo", subject: "Assunto (opcional)", days: "dias", hours: "horas", minutes: "minutos", tag: "Etiqueta", add: "Adicionar", remove: "Remover", newTpl: "Criar modelo", none: "—", draft: "rascunho", active: "ativo", paused: "pausado", api: "Inscreva pela API: POST /funnels/{id}/enroll", tagApi: "Sua loja aplica etiquetas com POST /contacts/tags" }
  : { back: "Funnels", save: "Save", saved: "Saved", activate: "Activate", pause: "Pause", from: "From (verified domain)", name: "Funnel name", palette: "Drag onto the canvas", fix: "To activate, fix:", ok: "Ready to activate", select: "Click a step to configure it. Connect steps by dragging from the bottom dot to the top dot. Delete removes.", people: "people here", yes: "Yes", no: "No",
      types: { trigger: "Trigger", email: "Send email", wait: "Wait", condition: "Condition", tag: "Tag", end: "End" } as Record<NodeType, string>,
      tkind: { audience: "Joined a list", tag: "Got a tag", api: "Called from the API" }, ckind: { opened: "Opened the previous email?", clicked: "Clicked the previous email?", has_tag: "Has the tag?", in_audience: "Is on the list?" },
      list: "List", template: "Template", subject: "Subject (optional)", days: "days", hours: "hours", minutes: "minutes", tag: "Tag", add: "Add", remove: "Remove", newTpl: "Create template", none: "—", draft: "draft", active: "active", paused: "paused", api: "Enroll from the API: POST /funnels/{id}/enroll", tagApi: "Your store applies tags with POST /contacts/tags" };

const ICON: Record<NodeType, ReactNode> = { trigger: <Zap size={15} />, email: <Mail size={15} />, wait: <Clock size={15} />, condition: <GitFork size={15} />, tag: <Tag size={15} />, end: <CircleStop size={15} /> };

type Ctx = { templates: Map<string, string>; audiences: Map<string, string>; counts: Record<string, number> };
let ctx: Ctx = { templates: new Map(), audiences: new Map(), counts: {} };

function summary(type: NodeType, d: any): string {
  switch (type) {
    case "trigger": return d.kind === "audience" ? `${L.tkind.audience}: ${ctx.audiences.get(d.audience_id) ?? L.none}` : d.kind === "tag" ? `${L.tkind.tag}: ${d.tag || L.none}` : L.tkind.api;
    case "email": return ctx.templates.get(d.template_id) ?? L.none;
    case "wait": { const m = d.minutes ?? 0; const dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60; const u = (n: number, many: string, one: string) => `${n} ${n === 1 ? one : many}`; return [dd && u(dd, L.days, pt ? "dia" : "day"), h && u(h, L.hours, pt ? "hora" : "hour"), mm && u(mm, L.minutes, pt ? "minuto" : "minute")].filter(Boolean).join(" ") || L.none; }
    case "condition": return d.kind === "has_tag" ? `${L.ckind.has_tag} ${d.tag ?? ""}` : d.kind === "in_audience" ? `${L.ckind.in_audience} ${ctx.audiences.get(d.audience_id) ?? ""}` : L.ckind[d.kind as "opened"];
    case "tag": return `${d.action === "remove" ? L.remove : L.add}: ${d.tag || L.none}`;
    case "end": return "";
  }
}

function Card({ id, type, data, selected }: NodeProps & { type: NodeType }) {
  const count = ctx.counts[id];
  const dark = type === "trigger";
  return (
    <div className={`min-w-[210px] max-w-[240px] rounded-xl border px-3 py-2.5 text-left shadow-sm ${dark ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900" : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"} ${selected ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-950" : ""}`}>
      {type !== "trigger" && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-zinc-900 !bg-white dark:!border-white dark:!bg-zinc-900" />}
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-70">{ICON[type]} {L.types[type]}</div>
      {type !== "end" && <div className="mt-1 truncate text-sm font-medium">{summary(type, data)}</div>}
      {!!count && <div className="mt-1.5 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">{num(count)} {L.people}</div>}
      {type === "condition" ? (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "28%" }} className="!h-3 !w-3 !bg-zinc-900 dark:!bg-white" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "72%" }} className="!h-3 !w-3 !border-2 !border-zinc-900 !bg-white dark:!border-white" />
          <div className="mt-2 flex justify-between px-4 text-[11px] font-semibold"><span>{L.yes}</span><span>{L.no}</span></div>
        </>
      ) : type !== "end" ? (
        <Handle id="next" type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-zinc-900 dark:!bg-white" />
      ) : null}
    </div>
  );
}

const nodeTypes = Object.fromEntries((["trigger", "email", "wait", "condition", "tag", "end"] as NodeType[]).map((t) => [t, (p: NodeProps) => <Card {...p} type={t} />]));

const toRF = (g: FunnelGraph): { nodes: Node[]; edges: Edge[] } => ({
  nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, position: { x: n.x, y: n.y }, data: n.data as Record<string, unknown>, deletable: n.type !== "trigger" })),
  edges: g.edges.map((e) => edgeFor(e.id, e.from, e.handle, e.to)),
});
function edgeFor(id: string, source: string, handle: string, target: string): Edge {
  return {
    id, source, sourceHandle: handle, target, type: "smoothstep",
    label: handle === "yes" ? L.yes : handle === "no" ? L.no : undefined,
    labelStyle: { fontWeight: 600, fontSize: 11 }, labelBgPadding: [6, 3], labelBgBorderRadius: 6,
    style: { stroke: "#71717a", strokeWidth: 1.6, strokeDasharray: handle === "no" ? "6 4" : undefined },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a" },
  };
}
const fromRF = (nodes: Node[], edges: Edge[]): FunnelGraph => ({
  version: 1,
  nodes: nodes.map((n) => ({ id: n.id, type: n.type as NodeType, x: Math.round(n.position.x), y: Math.round(n.position.y), data: n.data } as FunnelNode)),
  edges: edges.map((e) => ({ id: e.id, from: e.source, handle: (e.sourceHandle ?? "next") as "next", to: e.target })),
});

function defaults(type: NodeType, templates: any[]): Record<string, unknown> {
  switch (type) {
    case "email": return { template_id: templates[0]?.id ?? "" };
    case "wait": return { minutes: 1440 };
    case "condition": return { kind: "opened" };
    case "tag": return { action: "add", tag: "engaged" };
    case "trigger": return { kind: "audience" };
    default: return {};
  }
}

const sel = "h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-900";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-zinc-500">{label}</span>{children}</label>;
}

function Inspector({ node, onChange, templates, audiences }: { node: Node; onChange: (d: Record<string, unknown>) => void; templates: any[]; audiences: any[] }) {
  const d = node.data as any;
  const set = (p: Record<string, unknown>) => onChange({ ...d, ...p });
  const listSel = (v: string, k = "audience_id") => (
    <select className={sel} value={v ?? ""} onChange={(e) => set({ [k]: e.target.value })}><option value="">—</option>{audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
  );
  switch (node.type as NodeType) {
    case "trigger":
      return (<>
        <Field label={L.types.trigger}><select className={sel} value={d.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(L.tkind).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {d.kind === "audience" && <Field label={L.list}>{listSel(d.audience_id)}</Field>}
        {d.kind === "tag" && <><Field label={L.tag}><Input value={d.tag ?? ""} onChange={(e) => set({ tag: e.target.value.toLowerCase() })} placeholder="purchased" /></Field><p className="text-xs text-zinc-500">{L.tagApi}</p></>}
        {d.kind === "api" && <p className="text-xs text-zinc-500">{L.api}</p>}
      </>);
    case "email":
      return (<>
        <Field label={L.template}><select className={sel} value={d.template_id ?? ""} onChange={(e) => set({ template_id: e.target.value })}><option value="">—</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label={L.subject}><Input value={d.subject ?? ""} onChange={(e) => set({ subject: e.target.value || undefined })} /></Field>
        <div className="flex gap-3 text-xs">
          {d.template_id && <a className="underline" href={`/templates/${d.template_id}`} onClick={(e) => (e.preventDefault(), navigate(`/templates/${d.template_id}`))}>✎ {L.template}</a>}
          <a className="underline" href="/templates" onClick={(e) => (e.preventDefault(), navigate("/templates"))}>+ {L.newTpl}</a>
        </div>
      </>);
    case "wait": {
      const m = d.minutes ?? 0;
      const dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
      const upd = (a: number, b: number, c: number) => set({ minutes: Math.max(1, a * 1440 + b * 60 + c) });
      return (
        <div className="grid grid-cols-3 gap-2">
          <Field label={L.days}><Input type="number" min={0} value={dd} onChange={(e) => upd(+e.target.value, h, mm)} /></Field>
          <Field label={L.hours}><Input type="number" min={0} max={23} value={h} onChange={(e) => upd(dd, +e.target.value, mm)} /></Field>
          <Field label={L.minutes}><Input type="number" min={0} max={59} value={mm} onChange={(e) => upd(dd, h, +e.target.value)} /></Field>
        </div>
      );
    }
    case "condition":
      return (<>
        <Field label={L.types.condition}><select className={sel} value={d.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(L.ckind).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {d.kind === "has_tag" && <Field label={L.tag}><Input value={d.tag ?? ""} onChange={(e) => set({ tag: e.target.value.toLowerCase() })} placeholder="purchased" /></Field>}
        {d.kind === "in_audience" && <Field label={L.list}>{listSel(d.audience_id)}</Field>}
      </>);
    case "tag":
      return (<>
        <Field label={L.types.tag}><select className={sel} value={d.action} onChange={(e) => set({ action: e.target.value })}><option value="add">{L.add}</option><option value="remove">{L.remove}</option></select></Field>
        <Field label={L.tag}><Input value={d.tag ?? ""} onChange={(e) => set({ tag: e.target.value.toLowerCase() })} /></Field>
      </>);
    default:
      return null;
  }
}

function Canvas({ id }: { id: string }) {
  const qc = useQueryClient();
  const rf = useReactFlow();
  const q = useQuery({ queryKey: ["funnel", id], queryFn: () => api(`/funnels/${id}`), refetchInterval: 30_000, refetchOnWindowFocus: false });
  const tpls = useQuery({ queryKey: ["templates"], queryFn: () => api("/templates") });
  const auds = useQuery({ queryKey: ["audiences"], queryFn: () => api("/audiences") });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [meta, setMeta] = useState({ name: "", from: "" });
  const [loaded, setLoaded] = useState(false);
  const [savedJson, setSavedJson] = useState("");
  const templates: any[] = tpls.data?.data ?? [];
  const audiences: any[] = auds.data?.data ?? [];
  ctx = { templates: new Map(templates.map((t) => [t.id, t.name])), audiences: new Map(audiences.map((a) => [a.id, a.name])), counts: q.data?.node_counts ?? {} };

  useEffect(() => {
    if (!q.data || loaded) return;
    const g = toRF(q.data.graph);
    setNodes(g.nodes);
    setEdges(g.edges);
    setMeta({ name: q.data.name, from: q.data.from });
    setSavedJson(JSON.stringify({ g: q.data.graph.nodes.map((n: any) => n.id).length, ...{} }));
    setLoaded(true);
    setTimeout(() => rf.fitView({ padding: 0.25, maxZoom: 1 }), 50);
  }, [q.data, loaded, rf, setNodes, setEdges]);

  const graph = useMemo(() => fromRF(nodes, edges), [nodes, edges]);
  // Unsaved = current graph + name/from differ from the last saved snapshot.
  const snapshot = useMemo(() => JSON.stringify({ graph, meta }), [graph, meta]);
  useEffect(() => {
    if (loaded && savedJson.startsWith("{\"g\"")) setSavedJson(snapshot);
  }, [loaded, savedJson, snapshot]);
  const dirty = loaded && snapshot !== savedJson;
  const issues = useMemo(() => validateGraph(graph, { templateIds: new Set(templates.map((t) => t.id)), audienceIds: new Set(audiences.map((a) => a.id)) }), [graph, templates, audiences]);
  const selected = nodes.find((n) => n.selected) ?? null;

  const save = useMutation({
    mutationFn: () => api(`/funnels/${id}`, { method: "PATCH", body: { name: meta.name, from: meta.from, graph } }),
    onSuccess: () => (setSavedJson(snapshot), qc.invalidateQueries({ queryKey: ["funnels"] })),
  });
  const act = useMutation({
    mutationFn: async (a: "activate" | "pause") => (dirty && (await save.mutateAsync()), api(`/funnels/${id}/${a}`, { method: "POST" })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel", id] }),
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === "s" && (e.preventDefault(), save.mutate());
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [save]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const handle = c.sourceHandle ?? "next";
      setEdges((es) => addEdge(edgeFor(`e_${c.source}_${handle}_${c.target}`, c.source, handle, c.target), es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === handle))));
    },
    [setEdges],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/nm-node") as NodeType;
    if (!type) return;
    if (type === "trigger" && nodes.some((n) => n.type === "trigger")) return;
    const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const nid = `${type}_${Math.random().toString(36).slice(2, 7)}`;
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: nid, type, position, data: defaults(type, templates), selected: true }]);
  };

  const status = q.data?.status ?? "draft";
  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <button onClick={() => navigate("/funnels")} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft size={15} /> {L.back}</button>
        <Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder={L.name} className="!w-56" />
        <Input value={meta.from} onChange={(e) => setMeta({ ...meta, from: e.target.value })} placeholder={L.from} className="!w-64" />
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium dark:bg-zinc-800">{L[status as "draft"] ?? status}</span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => save.mutate()} disabled={save.isPending}>{dirty ? L.save : L.saved}</Button>
        {status === "active" ? (
          <Button variant="ghost" onClick={() => act.mutate("pause")}><Pause size={14} /> {L.pause}</Button>
        ) : (
          <Button onClick={() => act.mutate("activate")} disabled={issues.length > 0 || act.isPending}><Play size={14} /> {L.activate}</Button>
        )}
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-48 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-[11px] text-zinc-500">{L.palette}</p>
          {(["trigger", "email", "wait", "condition", "tag", "end"] as NodeType[]).map((t) => (
            <div key={t} draggable onDragStart={(e) => e.dataTransfer.setData("application/nm-node", t)} className="flex cursor-grab items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm active:cursor-grabbing dark:border-zinc-800">
              {ICON[t]} {L.types[t]}
            </div>
          ))}
        </aside>
        <div className="relative flex-1" onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = "move"))} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(c) => c.source !== c.target && nodes.find((n) => n.id === c.target)?.type !== "trigger"}
            deleteKeyCode={["Backspace", "Delete"]}
            snapToGrid
            snapGrid={[20, 20]}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.type === "trigger" ? "#18181b" : "#d4d4d8")} />
            <Controls showInteractive={false} />
          </ReactFlow>
          <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-xl -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900/95">
            {issues.length ? (<><b>{L.fix}</b> {issues.slice(0, 3).map((i) => i.message).join(" · ")}{issues.length > 3 ? ` (+${issues.length - 3})` : ""}</>) : <b>✓ {L.ok}</b>}
          </div>
        </div>
        <aside className="hidden w-72 shrink-0 space-y-3 overflow-y-auto border-l border-zinc-200 bg-white p-4 md:block dark:border-zinc-800 dark:bg-zinc-900">
          {selected ? (
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold">{ICON[selected.type as NodeType]} {L.types[selected.type as NodeType]}</h3>
              <Inspector node={selected} templates={templates} audiences={audiences} onChange={(d) => setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: d } : n)))} />
            </>
          ) : (
            <p className="text-sm text-zinc-500">{L.select}</p>
          )}
          <ErrorText error={save.error ?? act.error} />
        </aside>
      </div>
    </div>
  );
}

export function FunnelCanvas({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <Canvas id={id} />
    </ReactFlowProvider>
  );
}
