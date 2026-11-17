import { Check, Copy } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { t } from "./i18n";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
        variant === "ghost" && "border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        variant === "danger" && "border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40",
        className,
      )}
    />
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx(
        "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-300",
        p.className,
      )}
    />
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

const TONE: Record<string, string> = {
  delivered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  verified: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  OK: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  opened: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400",
  clicked: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400",
  bounced: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  complained: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  suspended: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  Invalid: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  delayed: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  held: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  Missing: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
};

export function Badge({ value }: { value: string | null | undefined }) {
  const v = value ?? "—";
  return <span className={cx("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", TONE[v] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")}>{v}</span>;
}

export function CopyButton({ value, label = true }: { value: string; label?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      aria-label={t.copy}
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
      {label && (ok ? t.copied : t.copy)}
    </button>
  );
}

export function Secret({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <code className="truncate font-mono text-sm">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-base font-semibold">{title}</h2>
        <div className="space-y-4">{children}</div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>{t.done}</Button>
        </div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  return <p className="py-8 text-center text-sm text-zinc-500">{children ?? t.noItems}</p>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{error instanceof Error ? error.message : t.error}</p>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-100 dark:border-zinc-800">
            {head.map((h, i) => (
              <th key={i} className="px-5 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={cx("px-5 py-3 align-middle", className)}>{children}</td>;
