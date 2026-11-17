// Platform e-mails (login codes, alerts) are sent through NovaMail itself, from the
// internal system account (dogfooding: the product proves itself on every login).
import type { Env } from "../env";
import { sendOne } from "../routes/emails";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, image-free, solid-colour layout that renders the same in Gmail, Outlook and Apple Mail. */
export function layout(opts: { preheader: string; title: string; body: string; footer?: string }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><title>${esc(opts.title)}</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:700;letter-spacing:-0.01em">NovaMail</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.6">${opts.body}</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#71717a">${opts.footer ?? "Você recebeu este e-mail porque alguém pediu acesso ao NovaMail com este endereço. Se não foi você, ignore."}</p>
</td></tr></table></body></html>`;
}

export function loginCodeEmail(code: string) {
  const spaced = code.replace(/(\d{3})(\d{3})/, "$1 $2");
  return {
    subject: `${spaced} é o seu código do NovaMail`,
    text: `Seu código de acesso ao NovaMail: ${spaced}\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.`,
    html: layout({
      preheader: `Código ${spaced} — vale por 10 minutos`,
      title: "Seu código do NovaMail",
      body: `<p style="margin:0 0 16px">Use este código para entrar:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:0.12em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${spaced}</p>
<p style="margin:0;color:#52525b">Ele vale por 10 minutos e só pode ser usado uma vez.</p>`,
    }),
  };
}

export async function sendSystemEmail(env: Env, to: string, msg: { subject: string; html: string; text: string }, category = "system") {
  // Temporary bridge while the node's outbound port 25 is still blocked by the cloud
  // provider: platform mail only (never customer mail). Remove the secret to switch back.
  if (env.SYSTEM_RESEND_KEY && env.SYSTEM_RESEND_FROM) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.SYSTEM_RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.SYSTEM_RESEND_FROM, to: [to], subject: msg.subject, html: msg.html, text: msg.text, tags: [{ name: "category", value: category }] }),
    });
    if (!r.ok) throw new Error(`system mail bridge failed: ${r.status}`);
    return { id: ((await r.json()) as { id: string }).id };
  }
  if (!env.SYSTEM_ACCOUNT_ID || !env.SYSTEM_FROM) throw new Error("SYSTEM_ACCOUNT_ID / SYSTEM_FROM not configured");
  return sendOne(
    env,
    { accountId: env.SYSTEM_ACCOUNT_ID, apiKeyId: "system", permission: "full", domainId: null },
    { from: env.SYSTEM_FROM, to: [to], subject: msg.subject, html: msg.html, text: msg.text, tags: [{ name: "category", value: category }] },
    null,
  );
}
