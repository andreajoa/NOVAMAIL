// @novamail/email — the email design format, sanitizer and renderer shared by the
// dashboard editor (live preview) and the API (templates created by agents/integrations).
// Output is email-safe HTML: table layout, inline styles, Outlook (MSO) fallbacks, dark-mode meta.

export type Align = "left" | "center" | "right";

export type Block =
  | { id: string; type: "heading"; text: string; size?: number; align?: Align; color?: string }
  | { id: string; type: "text"; html: string; align?: Align; size?: number; color?: string }
  | { id: string; type: "image"; src: string; alt?: string; href?: string; width?: number; align?: Align; radius?: number }
  | { id: string; type: "video"; gif: string; href: string; mp4?: string; alt?: string; width?: number }
  | { id: string; type: "button"; text: string; href: string; bg?: string; color?: string; align?: Align; radius?: number; full?: boolean }
  | { id: string; type: "image_text"; src: string; alt?: string; href?: string; html: string; imageSide?: "left" | "right" }
  | { id: string; type: "divider"; color?: string }
  | { id: string; type: "spacer"; height?: number }
  | { id: string; type: "html"; html: string }
  | { id: string; type: "footer"; html: string; unsubscribe?: boolean };

export interface Theme {
  background: string;
  content: string;
  text: string;
  muted: string;
  accent: string;
  font: string;
  width: number;
  radius: number;
}

export interface Design {
  version: 1;
  preheader?: string;
  theme: Theme;
  blocks: Block[];
}

export const FONTS: Record<string, string> = {
  System: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  Helvetica: "Helvetica,Arial,sans-serif",
  Georgia: "Georgia,'Times New Roman',serif",
  Verdana: "Verdana,Geneva,sans-serif",
  Trebuchet: "'Trebuchet MS',Arial,sans-serif",
};

export const DEFAULT_THEME: Theme = { background: "#f4f4f5", content: "#ffffff", text: "#18181b", muted: "#71717a", accent: "#18181b", font: "System", width: 600, radius: 12 };

// ---------------------------------------------------------------- safety

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const color = (c: string | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback);
const clamp = (n: unknown, min: number, max: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d);

export const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s), mailto, tel and our personalization tokens are allowed in links/images. */
export function safeUrl(u: string | undefined, allowMailto = true): string {
  const v = String(u ?? "").trim();
  if (/^\{\{\s*\w+\s*\}\}$/.test(v)) return v;
  if (/^https?:\/\//i.test(v)) return v.replace(/"/g, "%22");
  if (allowMailto && /^(mailto|tel):/i.test(v)) return v.replace(/"/g, "%22");
  return "";
}

/**
 * Strips active content from user HTML (text blocks, pasted HTML, templates from the API):
 * scripts, iframes, objects, forms, event handlers, javascript:/data: URLs, <base>, <meta refresh>.
 * Mail clients sanitise too, but the dashboard preview and our own pages must never run it.
 */
export function sanitizeHtml(html: string): string {
  let s = String(html ?? "");
  s = s.replace(/<!--(?!\[if)[\s\S]*?-->/g, "");
  s = s.replace(/<\s*(script|iframe|object|embed|applet|form|frame|frameset|noscript|template|portal)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*\/?\s*(script|iframe|object|embed|applet|form|input|button|select|textarea|frame|frameset|base|link|meta|portal)\b[^>]*>/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/\s(href|src|action|formaction|background|poster|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'\s>]*\2?/gi, "");
  s = s.replace(/expression\s*\(/gi, "(");
  return s;
}

/** Inline-only HTML for text blocks: b/strong/i/em/u/a/br/span/p/ul/ol/li. */
export function sanitizeInline(html: string): string {
  return sanitizeHtml(html).replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, (_m, close: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!["b", "strong", "i", "em", "u", "a", "br", "span", "p", "ul", "ol", "li", "s"].includes(t)) return "";
    if (close) return `</${t}>`;
    if (t === "a") {
      const href = safeUrl(attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? attrs.match(/href\s*=\s*'([^']*)'/i)?.[1]);
      return href ? `<a href="${href}" target="_blank" style="color:inherit;text-decoration:underline">` : "<a>";
    }
    const style = attrs.match(/style\s*=\s*"([^"]*)"/i)?.[1];
    return style && /^[\w\s:;#%.,()-]*$/.test(style) ? `<${t} style="${style}">` : `<${t}>`;
  });
}

/** Validates/normalises an untrusted design (from the editor, the API or an AI agent). */
export function normalizeDesign(input: unknown): Design {
  const d = (input ?? {}) as Partial<Design>;
  const th = { ...DEFAULT_THEME, ...(d.theme ?? {}) } as Theme;
  const theme: Theme = {
    background: color(th.background, DEFAULT_THEME.background),
    content: color(th.content, DEFAULT_THEME.content),
    text: color(th.text, DEFAULT_THEME.text),
    muted: color(th.muted, DEFAULT_THEME.muted),
    accent: color(th.accent, DEFAULT_THEME.accent),
    font: th.font in FONTS ? th.font : "System",
    width: clamp(th.width, 480, 720, 600),
    radius: clamp(th.radius, 0, 24, 12),
  };
  const blocks = (Array.isArray(d.blocks) ? d.blocks : []).slice(0, 80).filter((b): b is Block => !!b && typeof b === "object" && typeof (b as Block).type === "string");
  return { version: 1, preheader: String(d.preheader ?? "").slice(0, 200), theme, blocks: blocks.map((b, i) => ({ ...b, id: String(b.id ?? `b${i}`).slice(0, 40) })) };
}

// ---------------------------------------------------------------- render

const pad = (inner: string, p = "12px 32px") => `<tr><td style="padding:${p}">${inner}</td></tr>`;

function renderBlock(b: Block, t: Theme): string {
  const font = FONTS[t.font];
  switch (b.type) {
    case "heading": {
      const size = clamp(b.size, 18, 44, 28);
      return pad(`<h1 style="margin:0;font-family:${font};font-size:${size}px;line-height:1.2;font-weight:700;letter-spacing:-0.01em;color:${color(b.color, t.text)};text-align:${b.align ?? "left"}">${esc(b.text)}</h1>`, "20px 32px 8px");
    }
    case "text": {
      const size = clamp(b.size, 13, 22, 16);
      return pad(`<div style="font-family:${font};font-size:${size}px;line-height:1.6;color:${color(b.color, t.text)};text-align:${b.align ?? "left"}">${sanitizeInline(b.html)}</div>`);
    }
    case "image": {
      const src = safeUrl(b.src, false);
      if (!src) return "";
      const w = Math.round((clamp(b.width, 10, 100, 100) / 100) * (t.width - 64));
      const img = `<img src="${src}" width="${w}" alt="${esc(b.alt ?? "")}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:${clamp(b.radius, 0, 32, 8)}px;${b.align === "center" ? "margin:0 auto;" : b.align === "right" ? "margin-left:auto;" : ""}">`;
      const href = safeUrl(b.href);
      return pad(href ? `<a href="${href}" target="_blank">${img}</a>` : img);
    }
    case "video": {
      // Animated GIF plays (muted, looped) in every client; it links to the full video.
      const gif = safeUrl(b.gif, false);
      if (!gif) return "";
      const w = Math.round((clamp(b.width, 30, 100, 100) / 100) * (t.width - 64));
      const href = safeUrl(b.href) || safeUrl(b.mp4, false);
      const img = `<img src="${gif}" width="${w}" alt="${esc(b.alt ?? "Video")}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:8px;margin:0 auto">`;
      return pad(href ? `<a href="${href}" target="_blank">${img}</a>` : img);
    }
    case "button": {
      const href = safeUrl(b.href);
      const bg = color(b.bg, t.accent);
      const fg = color(b.color, "#ffffff");
      const r = clamp(b.radius, 0, 40, 8);
      const align = b.align ?? "left";
      return pad(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${align === "center" ? 'align="center"' : align === "right" ? 'align="right"' : ""} style="${b.full ? "width:100%" : ""}"><tr><td align="center" bgcolor="${bg}" style="border-radius:${r}px;background:${bg}">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:44px;v-text-anchor:middle;width:220px" arcsize="${Math.round((r / 44) * 100)}%" fillcolor="${bg}" stroke="f"><center style="color:${fg};font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${esc(b.text)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" target="_blank" style="display:${b.full ? "block" : "inline-block"};padding:13px 24px;font-family:${font};font-size:16px;font-weight:600;line-height:1;color:${fg};text-decoration:none;border-radius:${r}px;background:${bg}">${esc(b.text)}</a><!--<![endif]-->
</td></tr></table>`, "16px 32px");
    }
    case "image_text": {
      const src = safeUrl(b.src, false);
      const href = safeUrl(b.href);
      const img = src ? `<img src="${src}" width="${Math.round((t.width - 64) * 0.45)}" alt="${esc(b.alt ?? "")}" style="display:block;width:100%;height:auto;border:0;border-radius:8px">` : "";
      const imgCell = `<td class="nm-col" width="45%" valign="top" style="padding:0 ${b.imageSide === "right" ? "0 0 12px" : "12px 0 0"}">${href ? `<a href="${href}">${img}</a>` : img}</td>`;
      const txtCell = `<td class="nm-col" width="55%" valign="middle" style="font-family:${font};font-size:16px;line-height:1.6;color:${t.text};padding:0 ${b.imageSide === "right" ? "12px 0 0" : "0 0 12px"}">${sanitizeInline(b.html)}</td>`;
      return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${b.imageSide === "right" ? txtCell + imgCell : imgCell + txtCell}</tr></table>`);
    }
    case "divider":
      return pad(`<div style="height:1px;line-height:1px;font-size:0;background:${color(b.color, "#e4e4e7")}">&nbsp;</div>`, "16px 32px");
    case "spacer":
      return `<tr><td style="height:${clamp(b.height, 4, 120, 24)}px;line-height:1px;font-size:0">&nbsp;</td></tr>`;
    case "html":
      return pad(sanitizeHtml(b.html), "0");
    case "footer":
      return pad(`<div style="font-family:${font};font-size:12px;line-height:1.6;color:${t.muted};text-align:center">${sanitizeInline(b.html)}${b.unsubscribe !== false ? `<br><a href="{{unsubscribe_url}}" style="color:${t.muted};text-decoration:underline">Unsubscribe</a>` : ""}</div>`, "24px 32px 32px");
  }
}

/** Renders a design into a complete, email-client-safe HTML document. */
export function renderDesign(input: Design | unknown, opts: { title?: string; bare?: boolean } = {}): string {
  const d = normalizeDesign(input);
  const t = d.theme;
  const rows = d.blocks.map((b) => renderBlock(b, t)).join("\n");
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(opts.title ?? "")}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body{margin:0;padding:0;width:100%!important}img{-ms-interpolation-mode:bicubic}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media (max-width:520px){.nm-wrap{width:100%!important}.nm-col{display:block!important;width:100%!important;padding:0 0 12px!important}}</style></head>
<body style="margin:0;padding:0;background:${t.background}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(d.preheader ?? "")}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.background}"><tr><td align="center" style="padding:${opts.bare ? "0" : "24px 12px"}">
<!--[if mso]><table role="presentation" width="${t.width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="nm-wrap" width="${t.width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${t.width}px;background:${t.content};border-radius:${t.radius}px;overflow:hidden">
${rows}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

/** Plain-text alternative (improves deliverability and accessibility). */
export function designToText(input: Design | unknown): string {
  const d = normalizeDesign(input);
  const strip = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div)>/gi, "\n").replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  const out: string[] = [];
  for (const b of d.blocks) {
    if (b.type === "heading") out.push(b.text.toUpperCase());
    else if (b.type === "text" || b.type === "image_text") out.push(strip(b.html));
    else if (b.type === "button") out.push(`${b.text}: ${safeUrl(b.href)}`);
    else if (b.type === "video") out.push(`Watch: ${safeUrl(b.href) || safeUrl(b.mp4, false)}`);
    else if (b.type === "footer") out.push(`${strip(b.html)}${b.unsubscribe !== false ? "\nUnsubscribe: {{unsubscribe_url}}" : ""}`);
    else if (b.type === "divider") out.push("---");
  }
  return out.filter(Boolean).join("\n\n");
}

/** One block rendered alone (editor canvas preview, shown in a script-less sandboxed iframe). */
export function renderBlockDocument(block: Block, theme: Theme): string {
  return renderDesign({ version: 1, theme: { ...theme, background: theme.content, radius: 0 }, blocks: [block] }, { bare: true });
}

export { TEMPLATES, type TemplatePreset } from "./templates";
export * from "./funnel";
export * from "./forms";
