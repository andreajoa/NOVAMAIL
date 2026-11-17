import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Ban, Bot, Contact as ContactIcon, Filter, ClipboardList, CreditCard, GitBranch, Globe, KeyRound, LayoutDashboard, LayoutTemplate, LogOut, Mail, Megaphone, Users, Webhook } from "lucide-react";
import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError } from "./api";
import { t } from "./i18n";
import { navigate } from "./nav";
import { Agents } from "./pages/Agents";
import { Contacts } from "./pages/Contacts";
import { Segments } from "./pages/Segments";
import { Forms } from "./pages/Forms";
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

const ROUTES: { path: string; label: string; icon: ComponentType<{ size?: number }>; page: ComponentType }[] = [
  { path: "/", label: t.overview, icon: LayoutDashboard, page: Overview },
  { path: "/contacts", label: t.lang === "pt" ? "Contatos (CRM)" : "Contacts (CRM)", icon: ContactIcon, page: Contacts },
  { path: "/segments", label: t.lang === "pt" ? "Segmentos" : "Segments", icon: Filter, page: Segments },
  { path: "/forms", label: t.lang === "pt" ? "Formulários" : "Forms", icon: ClipboardList, page: Forms },
  { path: "/emails", label: t.emails, icon: Mail, page: Emails },
  { path: "/domains", label: t.domains, icon: Globe, page: Domains },
  { path: "/templates", label: t.lang === "pt" ? "Modelos" : "Templates", icon: LayoutTemplate, page: Templates },
  { path: "/audiences", label: t.lang === "pt" ? "Públicos" : "Audiences", icon: Users, page: Audiences },
  { path: "/broadcasts", label: t.lang === "pt" ? "Campanhas" : "Broadcasts", icon: Megaphone, page: Broadcasts },
  { path: "/funnels", label: t.lang === "pt" ? "Funis" : "Funnels", icon: GitBranch, page: Funnels },
  { path: "/api-keys", label: t.apiKeys, icon: KeyRound, page: Keys },
  { path: "/webhooks", label: t.webhooks, icon: Webhook, page: Webhooks },
  { path: "/suppressions", label: t.suppressions, icon: Ban, page: Suppressions },
  { path: "/agents", label: "Claude Code / Codex", icon: Bot, page: Agents },
  { path: "/plan", label: t.plan, icon: CreditCard, page: Plan },
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
      <aside className="border-b border-zinc-200 bg-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-5 py-4">
          <a href="/" onClick={(e) => (e.preventDefault(), navigate("/"))} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><Activity size={15} /></span>
            NovaMail
          </a>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {ROUTES.map((r) => {
            const Icon = r.icon;
            const active = r.path === route.path;
            return (
              <a
                key={r.path}
                href={r.path}
                onClick={(e) => (e.preventDefault(), navigate(r.path))}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-white"}`}
              >
                <Icon size={16} />
                {r.label}
              </a>
            );
          })}
        </nav>
        <div className="hidden border-t border-zinc-100 px-5 py-4 text-xs text-zinc-500 md:absolute md:bottom-0 md:block md:w-60 dark:border-zinc-800">
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
