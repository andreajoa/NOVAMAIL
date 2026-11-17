import { preflight } from "@novamail/email";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useMemo } from "react";
import { lang } from "./i18n";

const pt = lang === "pt";
const L = pt
  ? { title: "Checagem antes do envio", inbox: "Na caixa de entrada", phone: "Celular", desktop: "Computador", ok: "Tudo certo — nada a corrigir.", sender: "Você" }
  : { title: "Pre-send check", inbox: "In the inbox", phone: "Phone", desktop: "Desktop", ok: "All good — nothing to fix.", sender: "You" };

/** Instant, in-browser pre-send check: score, inbox preview and actionable fixes. */
export function Preflight({ subject, preheader, html, from }: { subject: string; preheader?: string; html: string; from?: string }) {
  const r = useMemo(() => preflight({ subject, preheader, html, from }), [subject, preheader, html, from]);
  const name = (from?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? from?.split("@")[0] ?? L.sender).trim();
  const ring = 2 * Math.PI * 22;
  const icon = { error: <XCircle size={15} />, warning: <AlertTriangle size={15} />, tip: <Info size={15} /> };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Score ${r.score}/100`}>
          <circle cx="28" cy="28" r="22" fill="none" strokeWidth="5" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <circle cx="28" cy="28" r="22" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(r.score / 100) * ring} ${ring}`} transform="rotate(-90 28 28)" className="stroke-zinc-900 transition-all dark:stroke-white" />
          <text x="28" y="33" textAnchor="middle" className="fill-zinc-900 text-[15px] font-semibold dark:fill-white">{r.score}</text>
        </svg>
        <div><div className="font-semibold">{L.title}</div><div className="text-xs text-zinc-500 tabular-nums">{r.stats.words} words · {r.stats.images} images · {r.stats.links} links · {r.stats.html_kb} KB</div></div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-zinc-500">{L.inbox}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([[L.phone, r.inbox.mobile_subject, 70], [L.desktop, r.inbox.desktop_subject, 120]] as const).map(([k, subj, n]) => (
            <div key={k} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">{k}</div>
              <div className="flex items-center justify-between text-sm"><b className="truncate">{name}</b><span className="text-[11px] text-zinc-400">9:41</span></div>
              <div className="truncate text-sm font-medium">{subj || "—"}</div>
              <div className="line-clamp-2 text-xs text-zinc-500">{r.inbox.preview.slice(0, n)}</div>
            </div>
          ))}
        </div>
      </div>
      {r.findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 size={16} /> {L.ok}</p>
      ) : (
        <ul className="space-y-2">
          {r.findings.map((f) => (
            <li key={f.id} className={`flex gap-2.5 rounded-xl border p-3 text-sm ${f.severity === "error" ? "border-zinc-900 dark:border-white" : "border-zinc-200 dark:border-zinc-800"}`}>
              <span className={`mt-0.5 shrink-0 ${f.severity === "tip" ? "text-zinc-400" : ""}`}>{icon[f.severity]}</span>
              <span><b className="font-medium">{f.message}</b><span className="block text-xs text-zinc-500">{f.fix}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
