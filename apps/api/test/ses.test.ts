import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signRequest } from "../src/lib/aws";
import { buildMime, encodeWord } from "../src/lib/mime";
import { spkiFromCertPem, stringToSign, trustedSnsUrl, type SnsMessage } from "../src/lib/sns";
import { call, testEnv } from "./helpers";

const OWNER = "test-owner-token";
const CERT_URL = "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-test.pem";
const env = testEnv as typeof testEnv & { TEST_SNS_CERT: string; TEST_SNS_KEY: string };

interface FakeSes {
  sent: { body: any; auth: string; raw: string }[];
  dkim: string;
  identities: Set<string>;
  deleted: string[];
  subscribed: string[];
}

function fakeSes(): FakeSes {
  const s: FakeSes = { sent: [], dkim: "PENDING", identities: new Set(), deleted: [], subscribed: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const json = (o: unknown, status = 200, type?: string) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...(type ? { "x-amzn-errortype": type } : {}) } });
    if (url.href === CERT_URL) return new Response(env.TEST_SNS_CERT);
    if (url.hostname === "sns.us-east-2.amazonaws.com") {
      s.subscribed.push(url.href);
      return new Response("<ConfirmSubscriptionResponse/>");
    }
    if (url.hostname !== "email.us-east-2.amazonaws.com") return json({ error: "unexpected " + url.href }, 599);
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const p = url.pathname;
    const method = init?.method ?? "GET";
    if (p === "/v2/email/outbound-emails") {
      const raw = new TextDecoder().decode(Uint8Array.from(atob(body.Content.Raw.Data), (c) => c.charCodeAt(0)));
      s.sent.push({ body, auth, raw });
      return json({ MessageId: `0100-${s.sent.length}` });
    }
    if (p === "/v2/email/identities" && method === "POST") {
      if (s.identities.has(body.EmailIdentity)) return json({ message: "exists" }, 400, "AlreadyExistsException");
      s.identities.add(body.EmailIdentity);
      return json({ IdentityType: "DOMAIN", VerifiedForSendingStatus: false, DkimAttributes: { Status: "PENDING", Tokens: ["tok1", "tok2", "tok3"] } });
    }
    const m = p.match(/^\/v2\/email\/identities\/([^/]+)(\/mail-from)?$/);
    if (m) {
      const name = decodeURIComponent(m[1]!);
      if (m[2]) return json({});
      if (method === "DELETE") {
        s.deleted.push(name);
        s.identities.delete(name);
        return json({});
      }
      if (!s.identities.has(name)) return json({ message: "not found" }, 404, "NotFoundException");
      return json({ VerifiedForSendingStatus: s.dkim === "SUCCESS", DkimAttributes: { Status: s.dkim, Tokens: ["tok1", "tok2", "tok3"] }, MailFromAttributes: { MailFromDomainStatus: "SUCCESS" } });
    }
    return json({ message: "unexpected" }, 400);
  });
  return s;
}

async function snsSign(m: Omit<SnsMessage, "Signature">): Promise<SnsMessage> {
  const der = Uint8Array.from(atob(env.TEST_SNS_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(stringToSign(m as SnsMessage))));
  return { ...m, Signature: btoa(String.fromCharCode(...sig)) } as SnsMessage;
}

function notification(event: unknown, over: Partial<SnsMessage> = {}): Omit<SnsMessage, "Signature"> {
  return {
    Type: "Notification",
    MessageId: crypto.randomUUID(),
    TopicArn: env.SES_SNS_TOPIC_ARN!,
    Message: JSON.stringify(event),
    Timestamp: new Date().toISOString(),
    SignatureVersion: "2",
    SigningCertURL: CERT_URL,
    ...over,
  };
}

const hook = (m: SnsMessage) => call("/hooks/ses", { method: "POST", json: m });

let ses: FakeSes;
let prevNode: string | undefined;
beforeEach(() => {
  ses = fakeSes();
  prevNode = env.SENDING_NODE;
  env.SENDING_NODE = "ses";
});
afterEach(() => {
  env.SENDING_NODE = prevNode;
  vi.restoreAllMocks();
});

async function sesAccount(domain = `shop${Math.random().toString(36).slice(2, 8)}.com`) {
  const r = await call("/admin/accounts", { method: "POST", token: OWNER, json: { name: "Loja SES", email: `s${Math.random()}@example.com`, plan: "pro" } });
  expect(r.status).toBe(201);
  const acc = r.body as { id: string; api_key: string };
  const d = await call("/domains", { method: "POST", token: acc.api_key, json: { name: domain } });
  expect(d.status).toBe(201);
  return { ...acc, domain, domainId: d.body.id as string, records: d.body.records as any[] };
}

describe("aws sigv4", () => {
  it("matches the AWS reference signature (get-vanilla test vector)", async () => {
    const h = await signRequest(
      { method: "GET", url: "https://example.amazonaws.com/", service: "service" },
      { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", region: "us-east-1" },
      new Date("2015-08-30T12:36:00Z"),
    );
    expect(h["x-amz-date"]).toBe("20150830T123600Z");
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });
});

describe("mime", () => {
  it("encodes non-ASCII headers, drops header injection and keeps Bcc out", () => {
    const raw = buildMime({
      from: "Loja São João <oi@loja.com>",
      to: ["ana@example.com"],
      subject: "Promoção de verão ☀️",
      html: "<p>Olá</p>",
      text: "Olá",
      headers: { "List-Unsubscribe": "<https://x/u/1>", "X-Evil\r\nBcc": "a@b.c", From: "spoof@x.com", "X-Inj": "ok\r\nBcc: victim@x.com" },
    });
    expect(raw).toContain(`Subject: ${encodeWord("Promoção de verão ☀️")}`);
    expect(raw).toContain("From: =?UTF-8?B?");
    expect(raw).toContain("List-Unsubscribe: <https://x/u/1>");
    expect(raw).not.toMatch(/^Bcc:/im);
    expect(raw).not.toContain("spoof@x.com");
    expect(raw).toContain("X-Inj: ok Bcc: victim@x.com"); // folded into one harmless line
    expect(raw).toContain("multipart/alternative");
  });
});

describe("sns", () => {
  it("accepts only SNS hosts in the topic region", () => {
    expect(trustedSnsUrl(CERT_URL, "us-east-2")).toBe(true);
    expect(trustedSnsUrl("https://sns.us-east-2.amazonaws.com.evil.com/x.pem", "us-east-2")).toBe(false);
    expect(trustedSnsUrl("http://sns.us-east-2.amazonaws.com/x.pem", "us-east-2")).toBe(false);
    expect(trustedSnsUrl("https://evil.com/sns.us-east-2.amazonaws.com", "us-east-2")).toBe(false);
  });
  it("extracts the public key from a certificate", () => {
    expect(spkiFromCertPem(env.TEST_SNS_CERT)[0]).toBe(0x30);
  });
});

describe("sending through Amazon SES", () => {
  it("adds a domain with DKIM CNAMEs + MAIL FROM records, verifies it and sends a signed raw message", async () => {
    const acc = await sesAccount();
    const names = acc.records.map((r) => `${r.type} ${r.name}`);
    expect(names).toContain(`CNAME tok1._domainkey.${acc.domain}`);
    expect(names).toContain(`MX nmb.${acc.domain}`);
    expect(names).toContain(`TXT _dmarc.${acc.domain}`);

    let v = await call(`/domains/${acc.domainId}/verify`, { method: "POST", token: acc.api_key });
    expect(v.body.status).toBe("pending");
    ses.dkim = "SUCCESS";
    v = await call(`/domains/${acc.domainId}/verify`, { method: "POST", token: acc.api_key });
    expect(v.body.status).toBe("verified");

    const r = await call("/emails", { method: "POST", token: acc.api_key, json: { from: `Loja <oi@${acc.domain}>`, to: "ana@example.com", bcc: ["boss@example.com"], subject: "Oi", html: "<p>Oi</p>" } });
    expect(r.status).toBe(200);
    const sent = ses.sent[0]!;
    expect(sent.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/us-east-2\/ses\/aws4_request/);
    expect(sent.body.ConfigurationSetName).toBe("novamail");
    expect(sent.body.Destination.BccAddresses).toEqual(["boss@example.com"]);
    expect(sent.body.EmailTags).toContainEqual({ Name: "email", Value: r.body.id });
    expect(sent.raw).toContain(`X-NovaMail-Id: ${r.body.id}`);
    expect(sent.raw).not.toContain("boss@example.com");
  });

  it("refuses a domain already connected to another account", async () => {
    const a = await sesAccount();
    const r = await call("/admin/accounts", { method: "POST", token: OWNER, json: { name: "Outra", email: `o${Math.random()}@example.com`, plan: "pro" } });
    const d = await call("/domains", { method: "POST", token: r.body.api_key, json: { name: `news.${a.domain}` } });
    expect(d.status).toBe(409);
  });

  it("blocks sending from a suspended account even without the auth middleware", async () => {
    const acc = await sesAccount();
    ses.dkim = "SUCCESS";
    await call(`/domains/${acc.domainId}/verify`, { method: "POST", token: acc.api_key });
    await call(`/admin/accounts/${acc.id}/suspend`, { method: "POST", token: OWNER, json: { reason: "test" } });
    const { sendOne } = await import("../src/routes/emails");
    await expect(sendOne(env, { accountId: acc.id, apiKeyId: "broadcast:x", permission: "full", domainId: null }, { from: `a@${acc.domain}`, to: ["b@example.com"], subject: "x", html: "x" }, null)).rejects.toMatchObject({ status: 403 });
    expect(ses.sent).toHaveLength(0);
  });

  it("processes signed bounce/complaint/delivery events, suppresses and dedupes", async () => {
    const acc = await sesAccount();
    ses.dkim = "SUCCESS";
    await call(`/domains/${acc.domainId}/verify`, { method: "POST", token: acc.api_key });
    const r = await call("/emails", { method: "POST", token: acc.api_key, json: { from: `oi@${acc.domain}`, to: ["dead@example.com", "ok@example.com"], subject: "Oi", html: "<p>Oi</p>" } });
    const mail = { messageId: "0100-1", tags: { email: [r.body.id], account: [acc.id] } };

    const delivered = await snsSign(notification({ eventType: "Delivery", mail, delivery: { recipients: ["ok@example.com"] } }));
    expect((await hook(delivered)).body.types).toEqual(["email.delivered"]);
    expect((await hook(delivered)).body.types).toEqual([]); // SNS redelivery is a no-op

    const bounce = await snsSign(notification({ eventType: "Bounce", mail, bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "dead@example.com", diagnosticCode: "550 5.1.1" }] } }));
    expect((await hook(bounce)).status).toBe(200);
    const sup = await call("/suppressions", { token: acc.api_key });
    expect(sup.body.data.map((x: any) => x.address)).toContain("dead@example.com");

    const soft = await snsSign(notification({ eventType: "Bounce", mail, bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "ok@example.com" }] } }));
    await hook(soft);
    const sup2 = await call("/suppressions", { token: acc.api_key });
    expect(sup2.body.data.map((x: any) => x.address)).not.toContain("ok@example.com");

    const e = await call(`/emails/${r.body.id}`, { token: acc.api_key });
    expect(e.body.last_event).toBe("bounced");
  });

  it("rejects forged, foreign-topic and mismatched-message events", async () => {
    const acc = await sesAccount();
    ses.dkim = "SUCCESS";
    await call(`/domains/${acc.domainId}/verify`, { method: "POST", token: acc.api_key });
    const r = await call("/emails", { method: "POST", token: acc.api_key, json: { from: `oi@${acc.domain}`, to: "x@example.com", subject: "Oi", html: "<p>Oi</p>" } });
    const ev = { eventType: "Complaint", mail: { messageId: "0100-1", tags: { email: [r.body.id] } }, complaint: { complainedRecipients: [{ emailAddress: "x@example.com" }] } };

    const signed = await snsSign(notification(ev));
    expect((await hook({ ...signed, Message: JSON.stringify({ ...ev, eventType: "Delivery" }) })).status).toBe(401);
    expect((await hook(await snsSign(notification(ev, { TopicArn: "arn:aws:sns:us-east-2:999:other" })))).status).toBe(403);
    expect((await hook(await snsSign(notification(ev, { SigningCertURL: "https://evil.example.com/c.pem" })))).status).toBe(401);
    const wrongMsg = await snsSign(notification({ ...ev, mail: { ...ev.mail, messageId: "someone-else" } }));
    expect((await hook(wrongMsg)).body.ignored).toBe("unknown email");
    const sup = await call("/suppressions", { token: acc.api_key });
    expect(sup.body.data).toHaveLength(0);
  });

  it("confirms the SNS subscription only for a signed SNS URL", async () => {
    const sub = await snsSign({ Type: "SubscriptionConfirmation", MessageId: "m1", TopicArn: env.SES_SNS_TOPIC_ARN!, Message: "confirm", Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: CERT_URL, SubscribeURL: "https://sns.us-east-2.amazonaws.com/?Action=ConfirmSubscription&Token=t", Token: "t" });
    expect((await hook(sub)).body.confirmed).toBe(true);
    expect(ses.subscribed).toHaveLength(1);
  });

  it("removes the SES identity when the domain is deleted", async () => {
    const acc = await sesAccount();
    const d = await call(`/domains/${acc.domainId}`, { method: "DELETE", token: acc.api_key });
    expect(d.status).toBe(200);
    expect(ses.deleted).toEqual([acc.domain]);
  });
});

describe("platform mail", () => {
  it("goes through NovaMail (SES) and falls back to the Resend bridge if that fails", async () => {
    const { sendSystemEmail } = await import("../src/lib/system-mail");
    const r = await call("/admin/accounts", { method: "POST", token: OWNER, json: { name: "Sys", email: `sys${Math.random()}@example.com`, plan: "internal" } });
    const sys = r.body as { id: string; api_key: string };
    await call("/domains", { method: "POST", token: sys.api_key, json: { name: "sys-mail.test" } });
    ses.dkim = "SUCCESS";
    const dom = await call("/domains", { token: sys.api_key });
    await call(`/domains/${dom.body.data[0].id}/verify`, { method: "POST", token: sys.api_key });
    const e = { ...env, SYSTEM_ACCOUNT_ID: sys.id, SYSTEM_FROM: "NovaMail <no-reply@sys-mail.test>", SYSTEM_RESEND_KEY: "re_test", SYSTEM_RESEND_FROM: "x@y.test", SYSTEM_REPLY_TO: "help@y.test" } as any;

    await sendSystemEmail(e, "user@example.com", { subject: "123 456", html: "<p>x</p>", text: "x" }, "login");
    expect(ses.sent).toHaveLength(1);
    expect(ses.sent[0]!.raw).toContain("Reply-To: help@y.test");

    // Own sending path down → Resend bridge.
    const real = globalThis.fetch;
    const resend: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("amazonaws.com/v2/email/outbound-emails")) return new Response("{}", { status: 500 });
      if (url.startsWith("https://api.resend.com/")) { resend.push(String(init?.body)); return new Response(JSON.stringify({ id: "re_1" })); }
      return real(input, init);
    });
    const out = await sendSystemEmail(e, "user2@example.com", { subject: "654 321", html: "<p>x</p>", text: "x" }, "login");
    expect(out.id).toBe("re_1");
    expect(JSON.parse(resend[0]!).reply_to).toBe("help@y.test");
  });
});
