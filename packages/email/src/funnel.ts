// Funnel graphs (node-based automations), shared by the dashboard canvas, the API and the engine.

export type NodeType = "trigger" | "email" | "wait" | "condition" | "tag" | "end";

export type FunnelNode =
  | { id: string; type: "trigger"; x: number; y: number; data: { kind: "audience" | "api" | "tag"; audience_id?: string; tag?: string } }
  | { id: string; type: "email"; x: number; y: number; data: { template_id: string; subject?: string } }
  | { id: string; type: "wait"; x: number; y: number; data: { minutes: number } }
  | { id: string; type: "condition"; x: number; y: number; data: { kind: "opened" | "clicked" | "has_tag" | "in_audience"; tag?: string; audience_id?: string } }
  | { id: string; type: "tag"; x: number; y: number; data: { action: "add" | "remove"; tag: string } }
  | { id: string; type: "end"; x: number; y: number; data: Record<string, never> };

/** `handle` is "next" for every node except conditions, which use "yes" / "no". */
export interface FunnelEdge {
  id: string;
  from: string;
  handle: "next" | "yes" | "no";
  to: string;
}

export interface FunnelGraph {
  version: 1;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
}

export const MAX_NODES = 100;
export const TAG_RE = /^[a-z0-9][a-z0-9_.:-]{0,39}$/;

export interface GraphIssue {
  node?: string;
  message: string;
}

/** Structural validation. `templateIds`/`audienceIds` (when given) must contain every referenced id. */
export function validateGraph(g: FunnelGraph, refs: { templateIds?: Set<string>; audienceIds?: Set<string> } = {}): GraphIssue[] {
  const issues: GraphIssue[] = [];
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return [{ message: "Invalid graph." }];
  if (g.nodes.length > MAX_NODES) issues.push({ message: `At most ${MAX_NODES} nodes.` });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  if (byId.size !== g.nodes.length) issues.push({ message: "Duplicate node ids." });
  const triggers = g.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) issues.push({ message: "A funnel needs exactly one trigger." });

  const out = new Map<string, FunnelEdge[]>();
  for (const e of g.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) {
      issues.push({ message: "An arrow points to a missing step." });
      continue;
    }
    if (e.to === triggers[0]?.id) issues.push({ node: e.from, message: "Nothing can point back to the trigger." });
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
  }
  for (const n of g.nodes) {
    const outs = out.get(n.id) ?? [];
    if (n.type === "condition") {
      if (!outs.some((e) => e.handle === "yes") || !outs.some((e) => e.handle === "no")) issues.push({ node: n.id, message: "A condition needs both a Yes and a No path." });
      if (outs.length > 2 || outs.some((e) => e.handle === "next")) issues.push({ node: n.id, message: "A condition has only Yes and No outputs." });
      if (n.data.kind === "has_tag" && !TAG_RE.test(n.data.tag ?? "")) issues.push({ node: n.id, message: "Choose a valid tag." });
      if (n.data.kind === "in_audience" && !n.data.audience_id) issues.push({ node: n.id, message: "Choose a list." });
    } else {
      if (outs.length > 1 || outs.some((e) => e.handle !== "next")) issues.push({ node: n.id, message: "This step can have only one next step." });
      if (n.type === "end" && outs.length) issues.push({ node: n.id, message: "End has no next step." });
    }
    if (n.type === "email") {
      if (!n.data.template_id) issues.push({ node: n.id, message: "Choose a template." });
      else if (refs.templateIds && !refs.templateIds.has(n.data.template_id)) issues.push({ node: n.id, message: "Template not found." });
    }
    if (n.type === "wait" && !(Number.isInteger(n.data.minutes) && n.data.minutes >= 1 && n.data.minutes <= 525_600)) issues.push({ node: n.id, message: "Wait between 1 minute and 1 year." });
    if (n.type === "tag" && !TAG_RE.test(n.data.tag ?? "")) issues.push({ node: n.id, message: "Tags use lowercase letters, numbers, -, _, . or :" });
    if (n.type === "trigger") {
      if (n.data.kind === "audience" && !n.data.audience_id) issues.push({ node: n.id, message: "Choose the list that starts this funnel." });
      if (n.data.kind === "tag" && !TAG_RE.test(n.data.tag ?? "")) issues.push({ node: n.id, message: "Choose the tag that starts this funnel." });
    }
    for (const a of [n.type === "trigger" || n.type === "condition" ? (n.data as { audience_id?: string }).audience_id : undefined]) {
      if (a && refs.audienceIds && !refs.audienceIds.has(a)) issues.push({ node: n.id, message: "List not found." });
    }
  }
  // No cycles (an automation must always terminate).
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const e of out.get(id) ?? []) if (visit(e.to)) return true;
    state.set(id, 2);
    return false;
  };
  if (triggers[0] && visit(triggers[0].id)) issues.push({ message: "Arrows form a loop — automations must end." });
  if (triggers[0] && !(out.get(triggers[0].id) ?? []).length) issues.push({ node: triggers[0].id, message: "Connect the trigger to the first step." });
  return issues;
}

export function nextOf(g: FunnelGraph, from: string, handle: "next" | "yes" | "no" = "next"): FunnelNode | null {
  const e = g.edges.find((x) => x.from === from && x.handle === handle);
  return e ? g.nodes.find((n) => n.id === e.to) ?? null : null;
}

/** Converts a legacy linear funnel (steps) into a graph, laid out top-to-bottom. */
export function stepsToGraph(trigger: { kind: "audience" | "api"; audience_id?: string | null }, steps: { template_id: string; wait_minutes: number; subject?: string | null }[]): FunnelGraph {
  const nodes: FunnelNode[] = [{ id: "trigger", type: "trigger", x: 0, y: 0, data: { kind: trigger.kind, audience_id: trigger.audience_id ?? undefined } }];
  const edges: FunnelEdge[] = [];
  let prev = "trigger";
  let y = 0;
  steps.forEach((s, i) => {
    if (s.wait_minutes > 0) {
      const w = `wait${i}`;
      nodes.push({ id: w, type: "wait", x: 0, y: (y += 140), data: { minutes: s.wait_minutes } });
      edges.push({ id: `e${prev}-${w}`, from: prev, handle: "next", to: w });
      prev = w;
    }
    const m = `email${i}`;
    nodes.push({ id: m, type: "email", x: 0, y: (y += 140), data: { template_id: s.template_id, subject: s.subject ?? undefined } });
    edges.push({ id: `e${prev}-${m}`, from: prev, handle: "next", to: m });
    prev = m;
  });
  return { version: 1, nodes, edges };
}
