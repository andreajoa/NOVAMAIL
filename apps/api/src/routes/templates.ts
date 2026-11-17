// Email templates (visual designs or raw HTML) and media uploads (images, GIFs, MP4).
import { designToText, normalizeDesign, renderDesign, sanitizeHtml, TEMPLATES } from "@novamail/email";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env, Principal } from "../env";
import { prefixedId, randomToken } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { planOf } from "../lib/plans";
import { sendOne } from "./emails";

const actor = (p: Principal) => (p.permission === "agent" ? `agent:${p.apiKeyId}` : p.userId ? "user" : "api");

const tplSchema = z
  .object({
    name: z.string().min(1).max(120),
    subject: z.string().max(998).default(""),
    design: z.unknown().optional(),
    html: z.string().max(1_000_000).optional(),
  })
  .refine((v) => v.design !== undefined || v.html !== undefined, { message: "Provide `design` or `html`.", path: ["design"] });

export function buildTemplate(input: { name: string; design?: unknown; html?: string }) {
  if (input.design !== undefined) {
    const design = normalizeDesign(input.design);
    return { design: JSON.stringify(design), html: renderDesign(design, { title: input.name }), text: designToText(design) };
  }
  const html = sanitizeHtml(input.html!);
  return { design: null, html, text: html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20_000) };
}

export const templates = new Hono<AppEnv>();

templates.get("/presets", (c) => c.json({ object: "list", data: TEMPLATES }));

templates.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name, subject, created_by, created_at, updated_at, design IS NOT NULL AS visual FROM templates WHERE account_id = ? ORDER BY updated_at DESC LIMIT 200").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results.map((t) => ({ ...t, visual: !!t.visual })) });
});

templates.get("/:id", async (c) => {
  const t = await c.env.DB.prepare("SELECT * FROM templates WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).first<Record<string, unknown>>();
  if (!t) throw errors.notFound("Template");
  return c.json({ object: "template", ...t, design: t.design ? JSON.parse(t.design as string) : null });
});

templates.post("/", async (c) => {
  const p = c.get("principal");
  const b = tplSchema.safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM templates WHERE account_id = ?").bind(p.accountId).first<{ n: number }>();
  if ((n?.n ?? 0) >= 500) throw errors.quota("Template limit reached (500).");
  const built = buildTemplate(b.data);
  const id = prefixedId("tpl");
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO templates (id, account_id, name, subject, design, html, text, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.accountId, b.data.name, b.data.subject, built.design, built.html, built.text, actor(p), now, now)
    .run();
  return c.json({ object: "template", id, name: b.data.name }, 201);
});

templates.patch("/:id", async (c) => {
  const p = c.get("principal");
  const cur = await c.env.DB.prepare("SELECT id, name, subject FROM templates WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<{ id: string; name: string; subject: string }>();
  if (!cur) throw errors.notFound("Template");
  const b = z.object({ name: z.string().min(1).max(120).optional(), subject: z.string().max(998).optional(), design: z.unknown().optional(), html: z.string().max(1_000_000).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const name = b.data.name ?? cur.name;
  const built = b.data.design !== undefined || b.data.html !== undefined ? buildTemplate({ name, design: b.data.design, html: b.data.html }) : null;
  await c.env.DB.prepare(
    `UPDATE templates SET name = ?, subject = ?, design = CASE WHEN ? THEN ? ELSE design END, html = COALESCE(?, html), text = COALESCE(?, text), updated_at = ? WHERE id = ?`,
  )
    .bind(name, b.data.subject ?? cur.subject, built ? 1 : 0, built?.design ?? null, built?.html ?? null, built?.text ?? null, Date.now(), cur.id)
    .run();
  return c.json({ object: "template", id: cur.id, updated: true });
});

templates.delete("/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM templates WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  if (!r.meta.changes) throw errors.notFound("Template");
  return c.json({ id: c.req.param("id"), deleted: true });
});

/** Sends the template to the signed-in user (or the account e-mail) so they can see it in a real inbox. */
templates.post("/:id/test", async (c) => {
  const p = c.get("principal");
  const b = z.object({ from: z.string().min(3).max(320) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  const t = await c.env.DB.prepare("SELECT subject, html, text FROM templates WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<{ subject: string; html: string; text: string | null }>();
  if (!t) throw errors.notFound("Template");
  // Test sends only ever go to the owner — never to an arbitrary address (agents included).
  const to = p.userId
    ? (await c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(p.userId).first<{ email: string }>())?.email
    : (await c.env.DB.prepare("SELECT email FROM accounts WHERE id = ?").bind(p.accountId).first<{ email: string }>())?.email;
  if (!to) throw errors.notFound("Owner e-mail");
  const vars = { first_name: "Test", last_name: "", email: to, unsubscribe_url: "#" };
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k as keyof typeof vars] : m));
  const r = await sendOne(c.env, p, { from: b.data.from, to: [to], subject: `[TEST] ${fill(t.subject || "Template preview")}`, html: fill(t.html), text: t.text ? fill(t.text) : undefined, tags: [{ name: "category", value: "test" }] }, null);
  return c.json({ ...r, to });
});

// ---------------------------------------------------------------- media

const STORAGE_MB: Record<string, number> = { free: 50, pro: 1024, scale: 5120, internal: 102_400 };
const MAX_BYTES: Record<string, number> = { "image/png": 5e6, "image/jpeg": 5e6, "image/webp": 5e6, "image/gif": 10e6, "video/mp4": 20e6 };
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4" };

/** Detects the real file type from magic bytes (the browser-declared type is not trusted; SVG is never accepted). */
export function sniff(b: Uint8Array): string | null {
  const s = (o: number, str: string) => [...str].every((ch, i) => b[o + i] === ch.charCodeAt(0));
  if (b[0] === 0x89 && s(1, "PNG")) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (s(0, "GIF87a") || s(0, "GIF89a")) return "image/gif";
  if (s(0, "RIFF") && s(8, "WEBP")) return "image/webp";
  if (s(4, "ftyp")) return "video/mp4";
  return null;
}

export const media = new Hono<AppEnv>();

media.post("/", async (c) => {
  if (!c.env.MEDIA) throw new ApiError(503, "media_disabled", "Uploads are not enabled.");
  const p = c.get("principal");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw errors.validation("Send a file in the `file` field (multipart/form-data).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw errors.validation("Only PNG, JPEG, WebP, GIF and MP4 files are accepted.");
  if (bytes.length > MAX_BYTES[type]!) throw errors.validation(`File too large: max ${Math.round(MAX_BYTES[type]! / 1e6)} MB for ${type}.`);
  const acc = await c.env.DB.prepare("SELECT plan, (SELECT COALESCE(SUM(size),0) FROM media WHERE account_id = ?1) AS used FROM accounts WHERE id = ?1").bind(p.accountId).first<{ plan: string; used: number }>();
  const limit = (STORAGE_MB[acc?.plan ?? "free"] ?? 50) * 1e6;
  if ((acc?.used ?? 0) + bytes.length > limit) throw errors.quota(`Storage limit reached (${Math.round(limit / 1e6)} MB on the ${planOf(acc?.plan ?? "free").label} plan).`);
  const id = `m_${randomToken(12)}.${EXT[type]}`;
  await c.env.MEDIA.put(id, bytes, { metadata: { type, account: p.accountId } });
  await c.env.DB.prepare("INSERT INTO media (id, account_id, name, content_type, size, created_at) VALUES (?,?,?,?,?,?)").bind(id, p.accountId, (file.name || id).slice(0, 200), type, bytes.length, Date.now()).run();
  return c.json({ object: "media", id, url: `${c.env.PUBLIC_URL}/m/${id}`, content_type: type, size: bytes.length }, 201);
});

media.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name, content_type, size, created_at FROM media WHERE account_id = ? ORDER BY created_at DESC LIMIT 200").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: r.results.map((m) => ({ ...m, url: `${c.env.PUBLIC_URL}/m/${m.id}` })) });
});

media.delete("/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM media WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).run();
  if (!r.meta.changes) throw errors.notFound("Media");
  await c.env.MEDIA?.delete(c.req.param("id"));
  return c.json({ id: c.req.param("id"), deleted: true });
});

/** Public, immutable media URLs used inside emails, cached at the edge. */
export async function serveMedia(env: Env, req: Request, id: string, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  if (!/^m_[\w-]{10,40}\.(png|jpg|webp|gif|mp4)$/.test(id) || !env.MEDIA) return new Response("Not found", { status: 404 });
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(req);
  if (hit) return hit;
  const obj = await env.MEDIA.getWithMetadata<{ type: string }>(id, "arrayBuffer");
  if (!obj.value || !obj.metadata) return new Response("Not found", { status: 404 });
  const res = new Response(obj.value, {
    headers: {
      "content-type": obj.metadata.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "access-control-allow-origin": "*",
    },
  });
  ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}
