// Builds an RFC 5322 / MIME message for Amazon SES raw sending.
// Bodies are base64 (safe for any charset and line length); headers use RFC 2047 when non-ASCII.

const enc = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n");

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 encoded-words, split on character boundaries so no word exceeds 75 chars. */
export function encodeWord(s: string): string {
  if (isAscii(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (enc.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${bytesToBase64(enc.encode(w))}?=`).join("\r\n ");
}

/** `Name <a@b.c>` → display name encoded when needed; bare addresses pass through. */
export function encodeAddress(v: string): string {
  const m = v.trim().match(/^(.*?)\s*<([^>]+)>$/);
  if (!m) return v.trim();
  const name = m[1]!.trim().replace(/^"(.*)"$/, "$1");
  if (!name) return `<${m[2]}>`;
  return isAscii(name) ? `"${name.replace(/(["\\])/g, "\\$1")}" <${m[2]}>` : `${encodeWord(name)} <${m[2]}>`;
}

// Headers the caller may not set: we build them, and SES rejects duplicates.
const RESERVED = new Set(["from", "to", "cc", "bcc", "subject", "reply-to", "date", "message-id", "mime-version", "content-type", "content-transfer-encoding", "return-path", "sender"]);
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,76}$/;

export interface MimeInput {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  /** content = base64 */
  attachments?: { name: string; content_type: string; data: string }[];
  date?: Date;
}

const boundary = () => `nm_${crypto.randomUUID().replace(/-/g, "")}`;

function part(contentType: string, body: string): string {
  return `Content-Type: ${contentType}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(bytesToBase64(enc.encode(body)))}`;
}

function alternative(text?: string, html?: string): string {
  if (text && html) {
    const b = boundary();
    return `Content-Type: multipart/alternative; boundary="${b}"\r\n\r\n--${b}\r\n${part("text/plain", text)}--${b}\r\n${part("text/html", html)}--${b}--\r\n`;
  }
  return html ? part("text/html", html) : part("text/plain", text ?? "");
}

const safeFilename = (n: string) => n.replace(/[\r\n"\\]/g, "_");

export function buildMime(m: MimeInput): string {
  const head: string[] = [
    `From: ${encodeAddress(m.from)}`,
    `To: ${m.to.map(encodeAddress).join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map(encodeAddress).join(", ")}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo.split(",").map((a) => encodeAddress(a)).join(", ")}`] : []),
    `Subject: ${encodeWord(m.subject.replace(/[\r\n]+/g, " "))}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
  ];
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    if (!HEADER_NAME.test(k) || RESERVED.has(k.toLowerCase())) continue;
    head.push(`${k}: ${encodeWord(String(v).replace(/[\r\n]+/g, " ").trim())}`);
  }

  let body: string;
  if (m.attachments?.length) {
    const b = boundary();
    const files = m.attachments
      .map((a) => {
        const name = safeFilename(a.name);
        const ct = /^[\w.+-]+\/[\w.+-]+$/.test(a.content_type) ? a.content_type : "application/octet-stream";
        return `--${b}\r\nContent-Type: ${ct}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(a.data.replace(/\s+/g, ""))}`;
      })
      .join("");
    body = `Content-Type: multipart/mixed; boundary="${b}"\r\n\r\n--${b}\r\n${alternative(m.text, m.html)}${files}--${b}--\r\n`;
  } else {
    body = alternative(m.text, m.html);
  }
  return `${head.join("\r\n")}\r\n${body}`;
}
