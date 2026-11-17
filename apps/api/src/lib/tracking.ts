// First-party open/click tracking served by the Worker (no per-customer DNS or MTA config).
// Links are rewritten to signed redirects; a 1×1 pixel records opens. Tokens are HMAC-signed so
// nobody can forge events or turn the redirector into an open redirect.
import type { Env } from "../env";
import { b64decode, base64url, safeEqual } from "./crypto";

const enc = new TextEncoder();

async function sig(env: Env, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(`${env.ENCRYPTION_KEY}:track`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))).slice(0, 12));
}

export async function trackToken(env: Env, payload: { e: string; u?: string }) {
  const body = base64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await sig(env, body)}`;
}

export async function readTrackToken(env: Env, token: string): Promise<{ e: string; u?: string } | null> {
  const [body, s] = token.split(".");
  if (!body || !s || !safeEqual(s, await sig(env, body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64decode(body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4))));
    return typeof p?.e === "string" ? p : null;
  } catch {
    return null;
  }
}

/** Rewrites http(s) links (except unsubscribe links) and appends an open pixel. */
export async function addTracking(env: Env, html: string, emailId: string): Promise<string> {
  const base = env.PUBLIC_URL;
  const cache = new Map<string, string>();
  const urls = [...new Set([...html.matchAll(/href\s*=\s*"(https?:\/\/[^"]+)"/gi)].map((m) => m[1]!))];
  for (const u of urls) {
    if (u.startsWith(`${base}/u/`) || /unsubscribe/i.test(u) || u.length > 1800) continue;
    cache.set(u, `${base}/t/c/${await trackToken(env, { e: emailId, u })}`);
  }
  let out = html.replace(/href\s*=\s*"(https?:\/\/[^"]+)"/gi, (m, u: string) => (cache.has(u) ? `href="${cache.get(u)}"` : m));
  const pixel = `<img src="${base}/t/o/${await trackToken(env, { e: emailId })}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" aria-hidden="true">`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${pixel}</body>`) : out + pixel;
  return out;
}

export const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
