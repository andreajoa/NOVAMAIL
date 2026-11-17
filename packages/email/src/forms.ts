// Signup forms: one renderer shared by the hosted landing page, the embed/popup script
// (inside a Shadow DOM) and the dashboard's live preview, so all three look identical.

export type FormKind = "embed" | "popup" | "page";
export type FormField = "email" | "first_name" | "last_name";

export interface FormConfig {
  title: string;
  text: string;
  button: string;
  success: string;
  fields: FormField[];
  consent_text: string;
  image?: string;
  theme: { bg: string; fg: string; accent: string; button_fg: string; radius: number; font: "system" | "serif" | "mono" };
  popup: { trigger: "delay" | "scroll" | "exit"; delay: number; scroll: number; frequency_days: number; position: "center" | "bottom-right" | "bottom-bar" };
  tags: string[];
  redirect_url?: string;
  confirm_subject: string;
  confirm_text: string;
  from?: string;
}

export const DEFAULT_FORM: FormConfig = {
  title: "Get 10% off your first order",
  text: "Join the list for early access to new drops and members-only offers. No spam — unsubscribe anytime.",
  button: "Subscribe",
  success: "Almost there — check your inbox to confirm.",
  fields: ["email", "first_name"],
  consent_text: "By subscribing you agree to receive marketing emails. You can unsubscribe at any time.",
  theme: { bg: "#ffffff", fg: "#09090b", accent: "#09090b", button_fg: "#ffffff", radius: 16, font: "system" },
  popup: { trigger: "delay", delay: 6, scroll: 50, frequency_days: 7, position: "center" },
  tags: [],
  confirm_subject: "Please confirm your subscription",
  confirm_text: "Tap the button below to confirm you want to hear from us.",
};

const FONTS = {
  system: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  serif: "ui-serif,Georgia,'Times New Roman',serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,monospace",
};

const LABELS: Record<FormField, [string, string, string]> = {
  email: ["email", "Email address", "email"],
  first_name: ["text", "First name", "given-name"],
  last_name: ["text", "Last name", "family-name"],
};

export const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const color = (c: string, fb: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fb);
const safeUrl = (u?: string) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : undefined);

/** Scoped CSS for the form card (works inside a Shadow DOM or a full page). */
export function formCss(cfg: FormConfig) {
  const t = cfg.theme;
  const bg = color(t.bg, "#ffffff"), fg = color(t.fg, "#09090b"), ac = color(t.accent, "#09090b"), bf = color(t.button_fg, "#ffffff");
  const r = Math.max(0, Math.min(32, Number(t.radius) || 0));
  return `.nm-card{box-sizing:border-box;width:100%;max-width:440px;background:${bg};color:${fg};border-radius:${r}px;overflow:hidden;font-family:${FONTS[t.font] ?? FONTS.system};box-shadow:0 30px 80px -30px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.06);position:relative}
.nm-card *{box-sizing:border-box}.nm-img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.nm-body{padding:28px}.nm-title{margin:0 0 8px;font-size:24px;line-height:1.15;font-weight:700;letter-spacing:-.02em}
.nm-text{margin:0 0 18px;font-size:15px;line-height:1.55;opacity:.78}
.nm-form{display:grid;gap:10px}.nm-in{width:100%;font:inherit;font-size:15px;padding:13px 14px;border-radius:${Math.min(r, 12)}px;border:1px solid color-mix(in srgb,${fg} 18%,transparent);background:color-mix(in srgb,${bg} 92%,${fg});color:${fg};outline:none;transition:border-color .15s,box-shadow .15s}
.nm-in:focus{border-color:${ac};box-shadow:0 0 0 3px color-mix(in srgb,${ac} 22%,transparent)}
.nm-btn{font:inherit;font-weight:650;font-size:15px;padding:13px 16px;border:0;border-radius:${Math.min(r, 12)}px;background:${ac};color:${bf};cursor:pointer;transition:transform .12s,opacity .15s}
.nm-btn:hover{transform:translateY(-1px)}.nm-btn:active{transform:none}.nm-btn[disabled]{opacity:.6;cursor:wait}
.nm-legal{margin:12px 0 0;font-size:12px;line-height:1.5;opacity:.6}.nm-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}
.nm-msg{margin:0;font-size:16px;line-height:1.5;font-weight:600;animation:nm-in .35s ease}.nm-err{margin:4px 0 0;font-size:13px;color:#dc2626}
.nm-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:color-mix(in srgb,${bg} 70%,transparent);color:${fg};font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);z-index:2}
.nm-brand{display:block;margin-top:14px;font-size:11px;opacity:.45;color:inherit;text-decoration:none}
@keyframes nm-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.nm-msg{animation:none}.nm-btn{transition:none}}`;
}

/** The form card's markup. `action` is the submit URL (works without JavaScript too). */
export function formHtml(cfg: FormConfig, opts: { action: string; closable?: boolean; branding?: boolean }) {
  const fields = (cfg.fields.includes("email") ? cfg.fields : ["email" as FormField, ...cfg.fields])
    .map((f) => {
      const [type, label, ac] = LABELS[f];
      return `<label style="display:block"><span class="nm-hp">${label}</span><input class="nm-in" type="${type}" name="${f}" placeholder="${label}" autocomplete="${ac}" ${f === "email" ? "required" : ""} maxlength="200"></label>`;
    })
    .join("");
  const img = safeUrl(cfg.image);
  return `<div class="nm-card" role="dialog" aria-label="${escHtml(cfg.title)}">${opts.closable ? '<button class="nm-x" type="button" aria-label="Close">×</button>' : ""}${img ? `<img class="nm-img" src="${escHtml(img)}" alt="">` : ""}<div class="nm-body">
<h2 class="nm-title">${escHtml(cfg.title)}</h2>${cfg.text ? `<p class="nm-text">${escHtml(cfg.text)}</p>` : ""}
<form class="nm-form" method="post" action="${escHtml(opts.action)}" novalidate>${fields}<input class="nm-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="hidden" name="t" value="${Date.now()}"><button class="nm-btn" type="submit">${escHtml(cfg.button)}</button><p class="nm-err" role="alert" hidden></p></form>
${cfg.consent_text ? `<p class="nm-legal">${escHtml(cfg.consent_text)}</p>` : ""}${opts.branding !== false ? '<a class="nm-brand" href="https://app.novamail.nexaclouds.online/?ref=form" target="_blank" rel="noopener">Powered by NovaMail</a>' : ""}</div></div>`;
}
