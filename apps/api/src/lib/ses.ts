// Amazon SES (API v2) transport: raw sending, per-customer domain identities (Easy DKIM +
// custom MAIL FROM) and account status. Events come back through SNS (routes/ses-hooks.ts).
import type { Env } from "../env";
import { awsFetch, type AwsCredentials } from "./aws";
import { ApiError } from "./http";
import { bytesToBase64 } from "./mime";
import type { DnsRecord } from "./postal";
import { UpstreamError } from "./postal";

export const sesRegion = (env: Env) => env.SES_REGION ?? "us-east-2";
const base = (env: Env) => `https://email.${sesRegion(env)}.amazonaws.com/v2/email`;
export const MAIL_FROM_LABEL = "nmb";

function creds(env: Env): AwsCredentials {
  if (!env.AWS_SES_ACCESS_KEY_ID || !env.AWS_SES_SECRET_ACCESS_KEY) throw new ApiError(503, "sending_not_configured", "Sending is being activated on NovaMail and is not available yet.");
  return { accessKeyId: env.AWS_SES_ACCESS_KEY_ID, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY, region: sesRegion(env) };
}

interface CallResult<T> {
  status: number;
  json: T & { message?: string; Message?: string };
  /** AWS error type, e.g. "AlreadyExistsException" ("" on success). */
  type: string;
}

async function call<T>(env: Env, method: string, path: string, body: unknown, fetcher: typeof fetch = fetch): Promise<CallResult<T>> {
  const res = await awsFetch({ method, url: `${base(env)}${path}`, service: "ses", body: body === undefined ? undefined : JSON.stringify(body) }, creds(env), fetcher);
  const json = (await res.json().catch(() => ({}))) as CallResult<T>["json"] & { __type?: string };
  if (!json.message && json.Message) json.message = json.Message;
  const type = res.ok ? "" : (res.headers.get("x-amzn-errortype") ?? json.__type ?? "").split(":")[0]!.split("#").pop()!;
  return { status: res.status, json, type };
}

export interface SesSendInput {
  raw: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  tags: Record<string, string>;
}

/** Sends a raw MIME message; returns the SES MessageId. */
export async function sesSend(env: Env, m: SesSendInput, fetcher: typeof fetch = fetch): Promise<string> {
  const r = await call<{ MessageId?: string }>(
    env,
    "POST",
    "/outbound-emails",
    {
      Destination: { ToAddresses: m.to, CcAddresses: m.cc ?? [], BccAddresses: m.bcc ?? [] },
      Content: { Raw: { Data: bytesToBase64(new TextEncoder().encode(m.raw)) } },
      ConfigurationSetName: env.SES_CONFIGURATION_SET ?? "novamail",
      EmailTags: Object.entries(m.tags)
        .map(([Name, v]) => ({ Name, Value: v.replace(/[^A-Za-z0-9_.@-]/g, "_").slice(0, 256) }))
        .filter((t) => t.Value),
    },
    fetcher,
  );
  if (r.status === 200 && r.json.MessageId) return r.json.MessageId;
  const type = r.type;
  if (r.status === 429 || /TooManyRequests|LimitExceeded|Throttl/.test(type)) throw new ApiError(429, "rate_limited", "Sending is momentarily throttled. The rest will go out on the next run.");
  if (/SendingPaused|AccountSuspended/.test(type)) throw new ApiError(503, "sending_paused", "Sending is temporarily paused on NovaMail.");
  throw new UpstreamError(`The message was rejected: ${r.json.message ?? type ?? r.status}`, 422, type || `http_${r.status}`);
}

interface SesIdentity {
  VerifiedForSendingStatus?: boolean;
  DkimAttributes?: { Status?: string; Tokens?: string[] };
  MailFromAttributes?: { MailFromDomain?: string; MailFromDomainStatus?: string };
}

const idPath = (domain: string) => `/identities/${encodeURIComponent(domain)}`;

/** DNS records a customer publishes for a domain identity: 3 DKIM CNAMEs + MAIL FROM (SPF alignment). */
export function sesRecords(env: Env, domain: string, tokens: string[]): DnsRecord[] {
  const mailFrom = `${MAIL_FROM_LABEL}.${domain}`;
  return [
    ...tokens.map((t) => ({ record: "dkim" as const, type: "CNAME" as const, name: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com`, required: true })),
    // Custom MAIL FROM (bounce domain): makes SPF align with the customer's domain for DMARC.
    { record: "return_path", type: "MX", name: mailFrom, value: `feedback-smtp.${sesRegion(env)}.amazonses.com`, priority: 10, required: false },
    { record: "return_path", type: "TXT", name: mailFrom, value: "v=spf1 include:amazonses.com ~all", required: false },
  ];
}

export async function sesGetIdentity(env: Env, domain: string, fetcher?: typeof fetch): Promise<SesIdentity | null> {
  const r = await call<SesIdentity>(env, "GET", idPath(domain), undefined, fetcher);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new UpstreamError(`SES identity lookup failed: ${r.json.message ?? r.status}`);
  return r.json;
}

/** Creates (or reuses) the domain identity and its custom MAIL FROM; returns the DKIM tokens. */
export async function sesCreateIdentity(env: Env, domain: string, fetcher?: typeof fetch): Promise<string[]> {
  const r = await call<SesIdentity>(env, "POST", "/identities", { EmailIdentity: domain, ConfigurationSetName: env.SES_CONFIGURATION_SET ?? "novamail" }, fetcher);
  let tokens = r.json.DkimAttributes?.Tokens;
  if (r.status !== 200) {
    if (!/AlreadyExists/.test(r.type)) throw new UpstreamError(`SES could not add ${domain}: ${r.json.message ?? r.status}`);
    tokens = (await sesGetIdentity(env, domain, fetcher))?.DkimAttributes?.Tokens;
  }
  const mf = await call(env, "PUT", `${idPath(domain)}/mail-from`, { MailFromDomain: `${MAIL_FROM_LABEL}.${domain}`, BehaviorOnMxFailure: "USE_DEFAULT_VALUE" }, fetcher);
  if (mf.status !== 200) throw new UpstreamError(`SES could not set the bounce domain for ${domain}: ${mf.json.message ?? mf.status}`);
  return tokens ?? [];
}

export async function sesDeleteIdentity(env: Env, domain: string, fetcher?: typeof fetch): Promise<void> {
  const r = await call(env, "DELETE", idPath(domain), undefined, fetcher);
  if (r.status !== 200 && r.status !== 404) throw new UpstreamError(`SES could not remove ${domain}: ${r.json.message ?? r.status}`);
}

export interface SesAccount {
  ProductionAccessEnabled?: boolean;
  SendingEnabled?: boolean;
  EnforcementStatus?: string;
  SendQuota?: { Max24HourSend?: number; MaxSendRate?: number; SentLast24Hours?: number };
}

export async function sesAccount(env: Env, fetcher?: typeof fetch): Promise<SesAccount | null> {
  const r = await call<SesAccount>(env, "GET", "/account", undefined, fetcher).catch(() => null);
  return r?.status === 200 ? r.json : null;
}
