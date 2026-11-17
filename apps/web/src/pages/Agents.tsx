import { useMutation } from "@tanstack/react-query";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { lang } from "../i18n";
import { Button, Card, CopyButton, ErrorText, PageTitle, Secret } from "../ui";

const pt = lang === "pt";
const MCP = "https://api.novamail.nexaclouds.online/mcp";
const L = pt
  ? { title: "Claude Code e Codex", lead: "Conecte o Claude Code, o Codex ou qualquer cliente MCP para a IA montar seus modelos, listas e funis. Ela usa uma chave de agente que só consegue construir — enviar e ativar continua sendo com você.", create: "Gerar chave de agente", can: "A IA pode", cannot: "A IA não pode", canList: ["Ver plano, uso e domínios", "Criar e editar modelos (design ou HTML)", "Criar listas e importar até 200 contatos por vez", "Montar funis como rascunho e pausar funis", "Preparar campanhas como rascunho", "Enviar teste só para o seu e-mail"], cannotList: ["Enviar e-mail para qualquer pessoa", "Disparar campanhas ou ativar funis", "Apagar listas, funis ou modelos", "Criar chaves, webhooks, domínios ou mexer na cobrança", "Passar de 120 ações por minuto"], claude: "Claude Code (terminal)", codex: "Codex (~/.codex/config.toml)", env: "Defina a variável com a chave antes de abrir o Codex:", audit: "Toda ação da IA fica registrada. Revogue a chave em Chaves de API quando quiser." }
  : { title: "Claude Code & Codex", lead: "Connect Claude Code, Codex or any MCP client so AI can build your templates, lists and funnels. It uses an agent key that can only build — sending and activating stay with you.", create: "Create agent key", can: "The AI can", cannot: "The AI cannot", canList: ["Read plan, usage and domains", "Create and edit templates (design or HTML)", "Create lists and import up to 200 contacts per call", "Build funnels as drafts and pause funnels", "Prepare campaigns as drafts", "Send a test only to your own inbox"], cannotList: ["Email arbitrary people", "Send campaigns or activate funnels", "Delete lists, funnels or templates", "Create keys, webhooks, domains or touch billing", "Exceed 120 actions per minute"], claude: "Claude Code (terminal)", codex: "Codex (~/.codex/config.toml)", env: "Set the key in your environment before starting Codex:", audit: "Every AI action is logged. Revoke the key under API keys anytime." };

export function Agents() {
  const [key, setKey] = useState<string | null>(null);
  const create = useMutation({ mutationFn: () => api("/api-keys", { body: { name: "AI agent (MCP)", permission: "agent_access" } }), onSuccess: (r) => setKey(r.token) });
  const k = key ?? "nm_YOUR_AGENT_KEY";
  const claude = `claude mcp add --transport http novamail ${MCP} --header "Authorization: Bearer ${k}"`;
  const codex = `[mcp_servers.novamail]\nurl = "${MCP}"\nbearer_token_env_var = "NOVAMAIL_AGENT_KEY"`;
  return (
    <>
      <PageTitle>{L.title}</PageTitle>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{L.lead}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><ShieldCheck size={16} /> {L.can}</span>}>
          <ul className="space-y-1.5 text-sm">{L.canList.map((x) => <li key={x} className="flex gap-2"><Check size={16} className="shrink-0 text-emerald-600" />{x}</li>)}</ul>
        </Card>
        <Card title={<span className="flex items-center gap-2"><X size={16} /> {L.cannot}</span>}>
          <ul className="space-y-1.5 text-sm">{L.cannotList.map((x) => <li key={x} className="flex gap-2"><X size={16} className="shrink-0 text-red-600" />{x}</li>)}</ul>
        </Card>
      </div>
      <Card className="mt-4" title={<span className="flex items-center gap-2"><Bot size={16} /> MCP</span>} action={!key && <Button onClick={() => create.mutate()} disabled={create.isPending}>{L.create}</Button>}>
        {key && <div className="mb-4"><Secret label="Agent key" value={key} /></div>}
        <ErrorText error={create.error} />
        <h3 className="mb-1 text-sm font-semibold">{L.claude}</h3>
        <div className="flex items-start gap-2"><pre className="flex-1 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-100"><code>{claude}</code></pre><CopyButton value={claude} label={false} /></div>
        <h3 className="mb-1 mt-4 text-sm font-semibold">{L.codex}</h3>
        <div className="flex items-start gap-2"><pre className="flex-1 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-100"><code>{codex}</code></pre><CopyButton value={codex} label={false} /></div>
        <p className="mt-2 text-xs text-zinc-500">{L.env} <code>export NOVAMAIL_AGENT_KEY={k}</code></p>
        <p className="mt-4 text-xs text-zinc-500">{L.audit}</p>
      </Card>
    </>
  );
}
