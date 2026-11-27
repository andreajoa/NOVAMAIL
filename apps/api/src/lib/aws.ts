// AWS Signature Version 4 with WebCrypto (no SDK: Workers stay small and dependency-free).
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html

const enc = new TextEncoder();

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

/** RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone). */
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SignedRequest {
  method: string;
  url: string;
  service: string;
  body?: string;
}

/** Returns the headers (incl. Authorization) for a JSON request to an AWS REST endpoint. */
export async function signRequest(req: SignedRequest, creds: AwsCredentials, now = new Date()): Promise<Record<string, string>> {
  const u = new URL(req.url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const day = amzDate.slice(0, 8);
  const body = req.body ?? "";
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = { host: u.host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
  if (body) headers["content-type"] = "application/json";
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonicalHeaders = names.map((k) => `${k}:${headers[k]!.trim()}\n`).join("");
  // Non-S3 services: each path segment is encoded twice (it is already encoded once in the URL).
  const canonicalUri = u.pathname.split("/").map(rfc3986).join("/") || "/";
  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [req.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${day}/${creds.region}/${req.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  let key = await hmac(enc.encode(`AWS4${creds.secretAccessKey}`), day);
  key = await hmac(key, creds.region);
  key = await hmac(key, req.service);
  key = await hmac(key, "aws4_request");
  const signature = hex(await hmac(key, stringToSign));

  const { host: _host, ...rest } = headers; // fetch sets Host itself
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

export async function awsFetch(req: SignedRequest, creds: AwsCredentials, fetcher: typeof fetch = fetch): Promise<Response> {
  const headers = await signRequest(req, creds);
  return fetcher(req.url, { method: req.method, headers, body: req.body || undefined });
}
