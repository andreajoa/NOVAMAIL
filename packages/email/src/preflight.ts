// Pre-send check: deliverability and rendering problems that hurt inbox placement or clicks.
// Pure function (runs in the Worker and in the browser). Findings are actionable, not a "spam score" myth.

export type Severity = "error" | "warning" | "tip";
export interface Finding { id: string; severity: Severity; area: "subject" | "content" | "links" | "images" | "sender" | "size"; message: string; fix: string }
export interface PreflightInput { subject: string; preheader?: string; html: string; from?: string }
export interface PreflightResult { score: number; findings: Finding[]; stats: { html_kb: number; text_chars: number; images: number; links: number; words: number }; inbox: { mobile_subject: string; desktop_subject: string; preview: string } }

const SPAMMY = ["free!!!", "100% free", "act now", "buy now!!!", "cash bonus", "click here", "congratulations", "double your", "earn money", "guaranteed", "no catch", "no credit check", "risk-free", "winner", "you have been selected", "urgent!!!", "this isn't spam", "lowest price", "make money", "$$$", "viagra", "casino", "crypto giveaway", "act immediately", "limited time only!!!"];
const SHORTENERS = /(^|\/\/)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at)\//i;

const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, "x").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function preflight(input: PreflightInput): PreflightResult {
  const f: Finding[] = [];
  const add = (x: Finding) => f.push(x);
  const subject = input.subject ?? "";
  const html = input.html ?? "";
  const text = strip(html);
  const words = text ? text.split(" ").length : 0;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1]!, text: strip(m[2]!) }));
  const kb = new TextEncoder().encode(html).length / 1024;

  // Subject
  if (!subject.trim()) add({ id: "subject_empty", severity: "error", area: "subject", message: "The subject is empty.", fix: "Write a subject that says what's inside." });
  if (subject.length > 60) add({ id: "subject_long", severity: "warning", area: "subject", message: `Subject is ${subject.length} characters — phones cut it around 35–40.`, fix: "Put the most important words first or shorten it." });
  if (subject.length > 0 && subject.length < 8) add({ id: "subject_short", severity: "tip", area: "subject", message: "Very short subject.", fix: "Add a concrete benefit or detail." });
  const caps = subject.split(/\s+/).filter((w) => w.length > 3 && /[A-Z]/.test(w) && w === w.toUpperCase());
  if (caps.length >= 2 || (subject.length > 10 && subject === subject.toUpperCase() && /[A-Z]/.test(subject))) add({ id: "subject_caps", severity: "warning", area: "subject", message: "Too many words in ALL CAPS.", fix: "Use normal capitalization — caps read as shouting and trigger filters." });
  if (/[!?]{2,}|\${2,}/.test(subject)) add({ id: "subject_punct", severity: "warning", area: "subject", message: "Repeated punctuation (!!, ??, $$).", fix: "Use at most one exclamation mark." });
  const emoji = (subject.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji > 1) add({ id: "subject_emoji", severity: "tip", area: "subject", message: `${emoji} emojis in the subject.`, fix: "One emoji is plenty; some clients show boxes." });
  if (/^\s*(re|fwd?)\s*:/i.test(subject)) add({ id: "subject_fake_reply", severity: "error", area: "subject", message: "Subject pretends to be a reply or forward.", fix: "Remove RE:/FWD: — it's deceptive and penalized." });
  const lower = `${subject} ${text}`.toLowerCase();
  const spam = SPAMMY.filter((w) => lower.includes(w));
  if (spam.length) add({ id: "spam_phrases", severity: spam.length > 2 ? "warning" : "tip", area: "content", message: `Phrases filters dislike: ${spam.slice(0, 4).map((w) => `“${w}”`).join(", ")}.`, fix: "Say the same thing in plain, specific words." });

  // Preheader
  if (!input.preheader?.trim()) add({ id: "preheader_missing", severity: "tip", area: "subject", message: "No preheader — the inbox will show the first text it finds.", fix: "Add a preheader that complements the subject (40–90 characters)." });
  else if (input.preheader.trim().toLowerCase() === subject.trim().toLowerCase()) add({ id: "preheader_dup", severity: "tip", area: "subject", message: "Preheader repeats the subject.", fix: "Use it to add a second reason to open." });

  // Content & images
  if (words < 20 && imgs.length > 0) add({ id: "image_only", severity: "error", area: "images", message: "Mostly images, almost no text.", fix: "Add real text: image-only emails land in spam and are invisible when images are off." });
  else if (imgs.length > 0 && words / imgs.length < 25) add({ id: "image_ratio", severity: "warning", area: "images", message: "Low text-to-image ratio.", fix: "Aim for roughly 60% text, 40% images." });
  const noAlt = imgs.filter((i) => !/\balt\s*=\s*["'][^"']+["']/i.test(i) && !/width\s*=\s*["']?1["']?/.test(i)).length;
  if (noAlt) add({ id: "alt_missing", severity: "warning", area: "images", message: `${noAlt} image(s) without alt text.`, fix: "Describe each image — shown when images are blocked and read by screen readers." });
  if (imgs.some((i) => /src\s*=\s*["']http:\/\//i.test(i))) add({ id: "image_http", severity: "warning", area: "images", message: "Images loaded over http://.", fix: "Use https:// image URLs." });
  if (/<(script|form|iframe|object|embed)\b/i.test(html)) add({ id: "unsafe_tags", severity: "error", area: "content", message: "Scripts, forms or iframes in the HTML.", fix: "Remove them — email clients block them and filters penalize them." });
  if (/font-size\s*:\s*[0-7]px|display\s*:\s*none[^"]*["'][^>]*>[^<]{40,}/i.test(html)) add({ id: "hidden_text", severity: "warning", area: "content", message: "Tiny or hidden text detected.", fix: "Hidden text looks like a filter-evasion trick; remove it." });
  if (!/\{\{\s*(unsubscribe_url|preferences_url)\s*\}\}/.test(html)) add({ id: "unsub_auto", severity: "tip", area: "content", message: "No visible unsubscribe link in the design.", fix: "NovaMail adds one-click unsubscribe headers automatically; a visible link in the footer also lowers spam complaints." });

  // Links
  if (links.length > 25) add({ id: "too_many_links", severity: "warning", area: "links", message: `${links.length} links.`, fix: "Keep it focused — many links look promotional." });
  if (links.some((l) => SHORTENERS.test(l.href))) add({ id: "shorteners", severity: "error", area: "links", message: "URL shorteners (bit.ly, etc.).", fix: "Link to your own domain — shorteners are heavily abused by spammers." });
  if (links.some((l) => /^http:\/\//i.test(l.href))) add({ id: "links_http", severity: "warning", area: "links", message: "Links using http://.", fix: "Use https:// links." });
  const mismatch = links.filter((l) => /^(https?:\/\/|www\.)\S+\.\S+/i.test(l.text) && (() => { try { return new URL(l.text.startsWith("http") ? l.text : `https://${l.text}`).hostname.replace(/^www\./, "") !== new URL(l.href).hostname.replace(/^www\./, ""); } catch { return false; } })());
  if (mismatch.length) add({ id: "link_mismatch", severity: "error", area: "links", message: "A link shows one address but goes to another.", fix: "Make the visible URL match the destination — this is a classic phishing signal." });
  if (links.some((l) => l.href === "https://" || l.href === "#" || l.href === "")) add({ id: "link_empty", severity: "warning", area: "links", message: "A button or link has no destination.", fix: "Set the link URL." });

  // Size (Gmail clips messages above ~102 KB, hiding the footer and unsubscribe link)
  if (kb > 102) add({ id: "gmail_clip", severity: "error", area: "size", message: `HTML is ${kb.toFixed(0)} KB — Gmail clips emails over 102 KB.`, fix: "Remove unused code or split the content." });
  else if (kb > 80) add({ id: "size_near_clip", severity: "tip", area: "size", message: `HTML is ${kb.toFixed(0)} KB, close to Gmail's 102 KB limit.`, fix: "Keep an eye on size after tracking links are added." });

  // Sender
  if (input.from && /@(gmail|yahoo|outlook|hotmail|icloud|aol)\./i.test(input.from)) add({ id: "free_sender", severity: "error", area: "sender", message: "Sending from a free mailbox domain.", fix: "Use your own domain — Gmail/Yahoo DMARC policies reject bulk mail from their domains via other servers." });

  const weight = { error: 22, warning: 9, tip: 2 } as const;
  const score = Math.max(0, 100 - f.reduce((s, x) => s + weight[x.severity], 0));
  const order = { error: 0, warning: 1, tip: 2 } as const;
  f.sort((a, b) => order[a.severity] - order[b.severity]);
  const preview = (input.preheader?.trim() || text).slice(0, 140);
  return { score, findings: f, stats: { html_kb: Math.round(kb * 10) / 10, text_chars: text.length, images: imgs.length, links: links.length, words }, inbox: { mobile_subject: clip(subject, 38), desktop_subject: clip(subject, 78), preview } };
}
