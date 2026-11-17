// AI writing assistant (Cloudflare Workers AI): full email drafts as editor blocks, subject
// lines + preheaders, and rewrites. Output is treated as untrusted text: escaped into blocks.
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { ApiError, errors, zodMessage } from "../lib/http";
import { isUnlimited, planOf } from "../lib/plans";

export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DAILY = { free: 15, paid: 200 };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Plain text → safe HTML paragraph (only **bold** survives, as <strong>). */
const para = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\{\{\s*(first_name|last_name|email)\s*\}\}/g, "{{$1}}");
const uid = () => Math.random().toString(36).slice(2, 10);

async function quota(env: Env, accountId: string) {
  const a = await env.DB.prepare("SELECT plan FROM accounts WHERE id = ?").bind(accountId).first<{ plan: string }>();
  const plan = planOf(a?.plan ?? "free");
  if (isUnlimited(plan)) return;
  const limit = plan.id === "free" ? DAILY.free : DAILY.paid;
  const w = Math.floor(Date.now() / 86_400_000);
  const r = await env.DB.prepare("INSERT INTO rate_limits (key_id, window, count) VALUES (?,?,1) ON CONFLICT(key_id, window) DO UPDATE SET count = count + 1 RETURNING count").bind(`ai:${accountId}`, w).first<{ count: number }>();
  if ((r?.count ?? 0) > limit) throw errors.quota(`Daily AI limit reached (${limit}/day on your plan).`);
}

/** Runs the model and returns parsed JSON (tolerates prose around the object). */
export async function askJson<T>(env: Env, system: string, user: string, maxTokens = 900): Promise<T> {
  if (!env.AI) throw new ApiError(503, "ai_unavailable", "AI is not available right now.");
  let out: any;
  try {
    out = await env.AI.run(AI_MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.7, response_format: { type: "json_object" } });
  } catch (e) {
    throw new ApiError(503, "ai_unavailable", `AI is busy — try again in a moment. (${String(e).slice(0, 80)})`);
  }
  const raw = out?.response;
  if (raw && typeof raw === "object") return raw as T;
  const text = String(raw ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new ApiError(502, "ai_bad_output", "The AI returned an unexpected answer. Try again.");
  try { return JSON.parse(m[0]) as T; } catch { throw new ApiError(502, "ai_bad_output", "The AI returned an unexpected answer. Try again."); }
}

const RULES = `Rules: write like a skilled human copywriter for small businesses. Concrete, specific, warm, no hype words ("revolutionary", "game-changer"), no ALL CAPS, at most one emoji per subject, never invent prices, discounts, dates or facts that are not in the brief. Avoid spam triggers ("free!!!", "act now", "$$$"). You may use {{first_name}} once for personalization.`;
const lang = (l?: string) => (l ? `Write in ${l}.` : "Write in the same language as the brief.");

export const ai = new Hono<AppEnv>();

ai.post("/write", async (c) => {
  const p = c.get("principal");
  const b = z.object({ brief: z.string().min(5).max(2000), tone: z.enum(["friendly", "professional", "playful", "urgent", "luxury"]).default("friendly"), language: z.string().max(30).optional(), cta_url: z.string().url().startsWith("https://").optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  await quota(c.env, p.accountId);
  const r = await askJson<{ subject?: string; preheader?: string; headline?: string; paragraphs?: string[]; cta?: string; ps?: string }>(
    c.env,
    `You write marketing emails. ${RULES} Tone: ${b.data.tone}. ${lang(b.data.language)} Return ONLY JSON: {"subject": string (max 60 chars), "preheader": string (max 90 chars, complements the subject), "headline": string (max 70 chars), "paragraphs": string[] (2-3 paragraphs of 25-60 words each: open with the reader's situation, then what's new and why it matters, then what to do), "cta": string (2-4 words, starts with a verb), "ps": string (a one-line P.S. ONLY if it restates a fact that is literally in the brief; otherwise "")}. Every claim must come from the brief — no guarantees, prices, trials, "no credit card", shipping or deadlines unless the brief says so.`,
    `Brief: ${b.data.brief}`,
  );
  const blocks = [
    r.headline && { id: uid(), type: "heading", text: String(r.headline).slice(0, 120) },
    ...(Array.isArray(r.paragraphs) ? r.paragraphs.slice(0, 5) : []).map((t) => ({ id: uid(), type: "text", html: `<p>${para(String(t).slice(0, 800))}</p>` })),
    r.cta && { id: uid(), type: "button", text: String(r.cta).slice(0, 40), href: b.data.cta_url ?? "https://" },
    r.ps && { id: uid(), type: "text", html: `<p><em>P.S. ${para(String(r.ps).replace(/^P\.?S\.?:?\s*/i, "").slice(0, 300))}</em></p>` },
  ].filter(Boolean);
  if (!blocks.length) throw new ApiError(502, "ai_bad_output", "The AI returned an empty draft. Try a more detailed brief.");
  return c.json({ object: "ai_draft", subject: String(r.subject ?? "").slice(0, 120), preheader: String(r.preheader ?? "").slice(0, 150), blocks });
});

ai.post("/subjects", async (c) => {
  const p = c.get("principal");
  const b = z.object({ brief: z.string().min(3).max(4000), n: z.number().int().min(2).max(6).default(5), language: z.string().max(30).optional(), current: z.string().max(200).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  await quota(c.env, p.accountId);
  const brief = b.data.brief.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500);
  const r = await askJson<{ subjects?: { subject: string; preheader?: string; angle?: string }[] }>(
    c.env,
    `You write email subject lines that get opened. ${RULES} ${lang(b.data.language)} Give ${b.data.n} clearly different angles (curiosity, benefit, urgency without hype, personal, question, number). Max 55 characters each. Return ONLY JSON: {"subjects":[{"subject": string, "preheader": string (max 90 chars), "angle": string (one word)}]}.`,
    `${b.data.current ? `Current subject: ${b.data.current}\n` : ""}Email content: ${brief}`,
    600,
  );
  const list = (r.subjects ?? []).filter((x) => x?.subject).slice(0, b.data.n).map((x) => ({ subject: String(x.subject).slice(0, 120), preheader: String(x.preheader ?? "").slice(0, 150), angle: String(x.angle ?? "").slice(0, 20) }));
  if (!list.length) throw new ApiError(502, "ai_bad_output", "No subject lines came back. Try again.");
  return c.json({ object: "ai_subjects", subjects: list });
});

ai.post("/rewrite", async (c) => {
  const p = c.get("principal");
  const b = z.object({ text: z.string().min(1).max(4000), action: z.enum(["shorter", "longer", "friendlier", "more_professional", "more_urgent", "fix_grammar", "translate"]), language: z.string().max(30).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  if (b.data.action === "translate" && !b.data.language) throw errors.validation("`language` is required to translate.");
  await quota(c.env, p.accountId);
  const what = { shorter: "Make it about 40% shorter, same meaning.", longer: "Expand it a little with one concrete detail from the text itself (invent nothing).", friendlier: "Make it warmer and more conversational.", more_professional: "Make it more polished and professional.", more_urgent: "Add gentle urgency without hype or invented deadlines.", fix_grammar: "Fix grammar, spelling and punctuation only.", translate: `Translate it to ${b.data.language}, natural and idiomatic.` }[b.data.action];
  const plain = b.data.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const r = await askJson<{ text?: string }>(c.env, `You edit marketing email copy. ${RULES} ${what} Keep {{merge_tags}} unchanged. Return ONLY JSON: {"text": string}.`, plain, 700);
  if (!r.text) throw new ApiError(502, "ai_bad_output", "The AI returned an empty answer. Try again.");
  return c.json({ object: "ai_rewrite", text: String(r.text).slice(0, 6000), html: `<p>${para(String(r.text).slice(0, 6000))}</p>` });
});
