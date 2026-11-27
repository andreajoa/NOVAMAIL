// Amazon SNS HTTPS message verification (SignatureVersion 2 = RSA-SHA256).
// https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html

export interface SnsMessage {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
}

/** Only certificates served by SNS itself, over HTTPS, in the topic's region. */
export function trustedSnsUrl(url: string, region: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === `sns.${region}.amazonaws.com` && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

export function stringToSign(m: SnsMessage): string {
  const keys =
    m.Type === "Notification"
      ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.map((k) => `${k}\n${(m as unknown as Record<string, string>)[k] ?? ""}\n`).join("");
}

// ---- minimal DER walk: Certificate → tbsCertificate → subjectPublicKeyInfo ----
interface Tlv { tag: number; start: number; hdr: number; end: number }

function tlv(b: Uint8Array, off: number): Tlv {
  const tag = b[off]!;
  let len = b[off + 1]!;
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error("bad DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[off + 2 + i]!;
    hdr = 2 + n;
  }
  const end = off + hdr + len;
  if (end > b.length) throw new Error("truncated DER");
  return { tag, start: off, hdr, end };
}

function children(b: Uint8Array, t: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let p = t.start + t.hdr; p < t.end; ) {
    const c = tlv(b, p);
    out.push(c);
    p = c.end;
  }
  return out;
}

export function spkiFromCertPem(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const cert = tlv(der, 0);
  const tbs = children(der, cert)[0]!;
  const f = children(der, tbs);
  // [0] version is optional; then serial, signature, issuer, validity, subject, subjectPublicKeyInfo.
  const spki = f[f[0]!.tag === 0xa0 ? 6 : 5];
  if (!spki || spki.tag !== 0x30) throw new Error("no public key in certificate");
  return der.slice(spki.start, spki.end);
}

const keyCache = new Map<string, CryptoKey>();

export async function verifySns(m: SnsMessage, region: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (m.SignatureVersion !== "2" || !m.Signature || !trustedSnsUrl(m.SigningCertURL, region)) return false;
  let key = keyCache.get(m.SigningCertURL);
  if (!key) {
    const res = await fetcher(m.SigningCertURL);
    if (!res.ok) return false;
    key = await crypto.subtle.importKey("spki", spkiFromCertPem(await res.text()), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    keyCache.set(m.SigningCertURL, key);
  }
  const sig = Uint8Array.from(atob(m.Signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(stringToSign(m)));
}
