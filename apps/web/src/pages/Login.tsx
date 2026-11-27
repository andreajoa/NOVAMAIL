import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { Button, ErrorText, Input, Modal, Secret } from "../ui";

export function Login({ onDone, embedded = false }: { onDone: () => void; embedded?: boolean }) {
  // Step + e-mail survive a remount/reload of the tab (kept only in this tab's sessionStorage).
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("nm_login") ?? "{}") as { step?: "email" | "code"; email?: string; at?: number }; } catch { return {}; } })();
  const fresh = saved.at && Date.now() - saved.at < 10 * 60_000;
  const [step, setStepRaw] = useState<"email" | "code">(fresh && saved.step === "code" && saved.email ? "code" : "email");
  const [email, setEmail] = useState(fresh ? (saved.email ?? "") : "");
  const setStep = (s: "email" | "code") => {
    setStepRaw(s);
    try { s === "code" ? sessionStorage.setItem("nm_login", JSON.stringify({ step: s, email, at: Date.now() })) : sessionStorage.removeItem("nm_login"); } catch { /* private mode */ }
  };
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [welcome, setWelcome] = useState<{ api_key: string; smtp: { host: string; port: number; username: string; password: string } | null } | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "" : "grid min-h-full place-items-center px-4 py-16"}>
      <div className="w-full max-w-sm">
        <div className={embedded ? "hidden" : "mb-8 text-center"}>
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><Mail size={20} /></div>
          <h1 className="text-2xl font-semibold tracking-tight">NovaMail</h1>
          <p className="mt-2 text-sm text-zinc-500">{t.tagline}</p>
        </div>

        {step === "email" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/auth/start", { body: { email } });
                setStep("code");
              });
            }}
          >
            <label className="block text-sm font-medium" htmlFor="email">{t.email}</label>
            <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            <Button className="w-full" disabled={busy}>{t.sendCode}</Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await api("/auth/verify", { body: { email: email.trim(), code: code.replace(/\D/g, "") } });
                try { sessionStorage.removeItem("nm_login"); } catch { /* private mode */ }
                if (r.new_account) setWelcome({ api_key: r.api_key, smtp: r.smtp ?? null });
                else onDone();
              });
            }}
          >
            <p className="text-sm text-zinc-500">
              {t.codeSent} <span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span>
            </p>
            <label className="block text-sm font-medium" htmlFor="code">{t.code}</label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{3} ?\d{3}"
              maxLength={7}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
            <Button className="w-full" disabled={busy}>{t.enter}</Button>
            <button type="button" onClick={() => (setStep("email"), setCode(""))} className="mx-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              <ArrowLeft size={12} /> {t.wrongEmail}
            </button>
          </form>
        )}
        <div className="mt-3"><ErrorText error={error} /></div>
      </div>

      {welcome && (
        <Modal title={t.welcome} onClose={onDone}>
          <p className="text-sm text-zinc-500">{t.welcomeHint}</p>
          <Secret label="API key" value={welcome.api_key} />
          {welcome.smtp && <><Secret label={t.host} value={welcome.smtp.host} />
          <Secret label={`${t.port} (STARTTLS)`} value={String(welcome.smtp.port)} />
          <Secret label={t.user} value={welcome.smtp.username} />
          <Secret label={t.smtpPassword} value={welcome.smtp.password} /></>}
        </Modal>
      )}
    </div>
  );
}
