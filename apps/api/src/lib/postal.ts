// Thin clients for Postal's send API and our Postal admin sidecar (infra/postal/admin).

import type { Env } from "../env";

export class UpstreamError extends Error {
  constructor(message: string, readonly status = 502, readonly code = "upstream_error") {
    super(message);
  }
}

export interface PostalSendInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tag?: string;
  headers?: Record<string, string>;
  attachments?: { name: string; content_type: string; data: string }[];
}

export interface PostalSendResult {
  messageId: string;
  recipients: Record<string, { id: number; token: string }>;
}

export async function postalSend(env: Env, serverKey: string, input: PostalSendInput, fetcher: typeof fetch = fetch): Promise<PostalSendResult> {
  const res = await fetcher(`${env.POSTAL_URL}/api/v1/send/message`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-server-api-key": serverKey },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html_body: input.html,
      plain_body: input.text,
      reply_to: input.replyTo,
      tag: input.tag,
      headers: input.headers,
      attachments: input.attachments,
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { status: string; data?: { message_id?: string; messages?: Record<string, { id: number; token: string }>; code?: string; message?: string } }
    | null;
  if (!json || json.status !== "success" || !json.data?.message_id) {
    const code = json?.data?.code ?? `http_${res.status}`;
    throw new UpstreamError(`Postal rejected the message: ${json?.data?.message ?? code}`, 422, code);
  }
  return { messageId: json.data.message_id, recipients: json.data.messages ?? {} };
}

// ---- admin sidecar ----

async function admin<T>(env: Env, path: string, body: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  const res = await fetcher(`${env.POSTAL_ADMIN_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.POSTAL_ADMIN_TOKEN}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } & T;
  if (!res.ok || !json?.ok) throw new UpstreamError(`Postal admin ${path} failed: ${json?.error ?? res.status}`);
  return json;
}

export interface ProvisionResult {
  org: string;
  server: string;
  api_key: string;
  smtp_username: string;
  smtp_password: string;
}

export const postalAdmin = {
  provision: (env: Env, b: { account_id: string; name: string; hourly_limit: number; ip_pool: string; webhook_url: string }, f?: typeof fetch) =>
    admin<ProvisionResult>(env, "/v1/provision", b, f),
  setLimits: (env: Env, b: { org: string; server: string; hourly_limit: number; ip_pool: string }, f?: typeof fetch) =>
    admin<{}>(env, "/v1/limits", b, f),
  suspend: (env: Env, b: { org: string; reason: string }, f?: typeof fetch) => admin<{}>(env, "/v1/suspend", b, f),
  unsuspend: (env: Env, b: { org: string }, f?: typeof fetch) => admin<{}>(env, "/v1/unsuspend", b, f),
  addDomain: (env: Env, b: { org: string; server: string; name: string }, f?: typeof fetch) =>
    admin<{ uuid: string; records: DnsRecord[] }>(env, "/v1/domains/add", b, f),
  checkDomain: (env: Env, b: { org: string; server: string; uuid: string }, f?: typeof fetch) =>
    admin<{ verified: boolean; dns_ok: boolean; checks: Record<string, string | null>; records: DnsRecord[] }>(env, "/v1/domains/check", b, f),
  fbl: (env: Env, b: { org: string; server: string; domain: string; url: string }, f?: typeof fetch) => admin<{ address: string }>(env, "/v1/fbl", b, f),
  removeDomain: (env: Env, b: { org: string; server: string; uuid: string }, f?: typeof fetch) => admin<{}>(env, "/v1/domains/remove", b, f),
};

export interface DnsRecord {
  record: "verification" | "spf" | "dkim" | "return_path" | "dmarc" | "mx";
  type: "TXT" | "CNAME" | "MX";
  name: string;
  value: string;
  priority?: number;
  required: boolean;
}
