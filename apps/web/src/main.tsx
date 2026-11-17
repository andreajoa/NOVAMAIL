import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Ban, Bot, Contact as ContactIcon, Filter, ClipboardList, BarChart3, UsersRound, ShoppingBag, CreditCard, GitBranch, Globe, KeyRound, LayoutDashboard, LayoutTemplate, LogOut, Mail, Megaphone, Users, Webhook } from "lucide-react";
import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError } from "./api";
import { t } from "./i18n";
import { navigate } from "./nav";
import { Agents } from "./pages/Agents";
import { Contacts } from "./pages/Contacts";
import { Segments } from "./pages/Segments";
import { Forms } from "./pages/Forms";
import { Reports } from "./pages/Reports";
import { Team } from "./pages/Team";
import { Stores } from "./pages/Stores";
import { Audiences } from "./pages/Audiences";
import { Editor } from "./pages/Editor";
import { FunnelCanvas } from "./pages/FunnelCanvas";
import { Funnels } from "./pages/Funnels";
import { Templates } from "./pages/Templates";
import { Broadcasts } from "./pages/Broadcasts";
import { Domains } from "./pages/Domains";
import { Emails } from "./pages/Emails";
import { Keys } from "./pages/Keys";
import { Login } from "./pages/Login";
import { Legal } from "./pages/Legal";
import { Overview } from "./pages/Overview";
import { Plan } from "./pages/Plan";
import { Suppressions } from "./pages/Suppressions";
import { Webhooks } from "./pages/Webhooks";
import "./styles.css";
import { Badge } from "./ui";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
});

const P = t.lang === "pt";
type R = { path: string; label: string; icon: ComponentType<{ size?: number }>; page: ComponentType; group: string };
const ROUTES: R[] = [
  { path: "/", label: t.overview, icon: LayoutDashboard, page: Overview, group: "" },
  { path: "/reports", label: P ? "Relatórios" : "Reports", icon: BarChart3, page: Reports, group: "" },
  { path: "/broadcasts", label: P ? "Campanhas" : "Campaigns", icon: Megaphone, page: Broadcasts, group: P ? "Marketing" : "Marketing" },
  { path: "/funnels", label: P ? "Funis" : "Funnels", icon: GitBranch, page: Funnels, group: "Marketing" },
  { path: "/templates", label: P ? "Modelos" : "Templates", icon: LayoutTemplate, page: Templates, group: "Marketing" },
  { path: "/forms", label: P ? "Formulários" : "Forms", icon: ClipboardList, page: Forms, group: "Marketing" },
  { path: "/stores", label: P ? "Lojas" : "Stores", icon: ShoppingBag, page: Stores, group: "Marketing" },
  { path: "/contacts", label: P ? "Contatos (CRM)" : "Contacts (CRM)", icon: ContactIcon, page: Contacts, group: P ? "Público" : "Audience" },
  { path: "/segments", label: P ? "Segmentos" : "Segments", icon: Filter, page: Segments, group: P ? "Público" : "Audience" },
  { path: "/audiences", label: P ? "Listas" : "Lists", icon: Users, page: Audiences, group: P ? "Público" : "Audience" },
  { path: "/suppressions", label: t.suppressions, icon: Ban, page: Suppressions, group: P ? "Público" : "Audience" },
  { path: "/emails", label: t.emails, icon: Mail, page: Emails, group: P ? "Envio" : "Sending" },
  { path: "/domains", label: t.domains, icon: Globe, page: Domains, group: P ? "Envio" : "Sending" },
  { path: "/api-keys", label: t.apiKeys, icon: KeyRound, page: Keys, group: P ? "Envio" : "Sending" },
  { path: "/webhooks", label: t.webhooks, icon: Webhook, page: Webhooks, group: P ? "Envio" : "Sending" },
  { path: "/agents", label: "Claude Code / Codex", icon: Bot, page: Agents, group: P ? "Envio" : "Sending" },
  { path: "/team", label: P ? "Equipe" : "Team", icon: UsersRound, page: Team, group: P ? "Conta" : "Account" },
  { path: "/plan", label: t.plan, icon: CreditCard, page: Plan, group: P ? "Conta" : "Account" },
];

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return path;
}

/** Workspace picker (only when the user belongs to more than one) + pending invite acceptance. */
function WorkspaceSwitcher() {
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ["workspaces"], queryFn: () => api("/team/workspaces"), retry: false });
  useEffect(() => {
    let tok: string | null = null;
    try { tok = sessionStorage.getItem("nm_invite") ?? new URLSearchParams(location.search).get("invite"); sessionStorage.removeItem("nm_invite"); } catch { /* */ }
    if (tok) api("/team/invites/accept", { body: { token: tok } }).then(() => qc.invalidateQueries()).catch(() => undefined);
  }, [qc]);
  const list: any[] = ws.data?.data ?? [];
  if (list.length < 2) return null;
  return (
    <div className="px-3 pb-2">
      <select value={ws.data.current} onChange={async (e) => { await api("/team/switch", { body: { account_id: e.target.value } }); qc.clear(); location.href = "/"; }} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
        {list.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}
      </select>
    </div>
  );
}

function Shell() {
  const path = usePath();
  const qc = useQueryClient();
  const legal = ({ "/terms": "terms", "/aup": "aup", "/privacy": "privacy" } as const)[path as "/terms"];
  // Never refetch while signed out: a refetch on tab focus (user went to copy the code) would
  // unmount the login form and reset it to the e-mail step.
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me"), enabled: !legal, refetchOnWindowFocus: (q) => q.state.status !== "error" });

  if (legal) return <Legal doc={legal} />;

  if (me.isLoading && !me.isRefetchError) return <div className="grid h-full place-items-center text-sm text-zinc-500">{t.loading}</div>;
  if (me.error instanceof ApiError && me.error.status === 401) {
    const sp = new URLSearchParams(location.search);
    if (sp.get("invite")) try { sessionStorage.setItem("nm_invite", sp.get("invite")!); } catch { /* private mode */ }
    if (sp.get("plan")) try { sessionStorage.setItem("nm_intent", JSON.stringify({ plan: sp.get("plan"), interval: sp.get("interval") ?? "month" })); } catch { /* private mode */ }
    return <Login onDone={() => { let intent = false; try { intent = !!sessionStorage.getItem("nm_intent"); } catch { /* */ } history.replaceState(null, "", intent ? "/plan" : location.pathname === "/login" ? "/" : location.pathname); qc.invalidateQueries(); }} />;
  }

  const editorId = path.match(/^\/templates\/([\w-]+)$/)?.[1];
  if (editorId) return <Editor id={editorId} />;
  const funnelId = path.match(/^\/funnels\/([\w-]+)$/)?.[1];
  if (funnelId) return <FunnelCanvas id={funnelId} />;
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0]!;
  const Page = route.page;
  const account = me.data?.account;

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="border-b border-zinc-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-5 py-4">
          <a href="/" onClick={(e) => (e.preventDefault(), navigate("/"))} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><Activity size={15} /></span>
            NovaMail
          </a>
        </div>
        <WorkspaceSwitcher />
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto md:pb-6">
          {ROUTES.map((r, i) => {
            const Icon = r.icon;
            const active = r.path === route.path;
            const head = r.group && r.group !== ROUTES[i - 1]?.group;
            return (
              <div key={r.path} className="contents">
                {head && <div className="hidden px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 md:block">{r.group}</div>}
                <a
                  href={r.path}
                  onClick={(e) => (e.preventDefault(), navigate(r.path))}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${active ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-white"}`}
                >
                  <Icon size={16} />
                  {r.label}
                </a>
              </div>
            );
          })}
        </nav>
        <div className="hidden border-t border-zinc-100 px-5 py-4 text-xs text-zinc-500 md:block dark:border-zinc-800">
          <div className="truncate font-medium text-zinc-700 dark:text-zinc-300">{me.data?.user?.email}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge value={me.data?.plan?.label} />
            {account?.status !== "active" && <Badge value="suspended" />}
          </div>
          <button
            className="mt-3 inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-white"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              qc.clear();
              location.href = "/";
            }}
          >
            <LogOut size={13} /> {t.logout}
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-10">
        <Page />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  </StrictMode>,
);
