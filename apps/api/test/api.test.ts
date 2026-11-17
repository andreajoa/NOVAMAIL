import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open, standardWebhookSignature, uuidv7 } from "../src/lib/crypto";
import { GUARD } from "../src/lib/usage";
import { call, fakePostal, postalSign, testEnv, type FakePostal } from "./helpers";

const OWNER = "test-owner-token";

async function newAccount(plan = "free") {
  const r = await call("/admin/accounts", { method: "POST", token: OWNER, json: { name: "Loja Teste", email: `t${Math.random()}@example.com`, plan } });
  expect(r.status).toBe(201);
  return r.body as { id: string; api_key: string; smtp: { username: string; password: string } };
}

async function verifiedAccount(postal: FakePostal, plan = "free") {
  const acc = await newAccount(plan);
  const d = await call("/domains", { method: "POST", token: acc.api_key, json: { name: "example.com" } });
  expect(d.status).toBe(201);
  postal.domainVerified = true;
  const v = await call(`/domains/${d.body.id}/verify`, { method: "POST", token: acc.api_key });
  expect(v.body.status).toBe("verified");
  return acc;
}

async function postalHook(accountId: string, event: string, payload: unknown, sign = true) {
  const body = JSON.stringify({ event, timestamp: Date.now() / 1000, uuid: crypto.randomUUID(), payload });
  return call(`/hooks/postal/${accountId}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-postal-signature-256": sign ? await postalSign(body) : "bm9wZQ==" },
  });
}

let postal: FakePostal;
beforeEach(() => {
  postal = fakePostal();
});
afterEach(() => vi.restoreAllMocks());

describe("platform", () => {
  it("health reports the database", async () => {
    const r = await call("/health");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it("rejects admin calls without the owner token", async () => {
    expect((await call("/admin/accounts")).status).toBe(401);
    expect((await call("/admin/accounts", { token: "nope" })).status).toBe(401);
  });

  it("provisions a Postal server and seals its key", async () => {
    const acc = await newAccount();
    expect(acc.api_key).toMatch(/^nm_/);
    expect(acc.smtp.password).toBe("smtp-secret");
    const row = await testEnv.DB.prepare("SELECT postal_server_key FROM accounts WHERE id = ?").bind(acc.id).first<{ postal_server_key: string }>();
    expect(row!.postal_server_key).not.toContain("postal-server-key");
    expect(await open(row!.postal_server_key, testEnv.ENCRYPTION_KEY)).toBe("postal-server-key");
  });
});

describe("sending (Resend-compatible)", () => {
  it("requires an API key", async () => {
    const r = await call("/emails", { method: "POST", json: {} });
    expect(r.status).toBe(401);
    expect(r.body.name).toBe("missing_api_key");
  });

  it("refuses unverified sender domains", async () => {
    const acc = await newAccount();
    const r = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@nope.com", to: "b@x.com", subject: "hi", html: "<p>hi</p>" } });
    expect(r.status).toBe(403);
    expect(r.body.name).toBe("invalid_from_address");
  });

  it("adds DMARC guidance to domain records", async () => {
    const acc = await newAccount();
    const d = await call("/domains", { method: "POST", token: acc.api_key, json: { name: "Example.COM" } });
    expect(d.body.name).toBe("example.com");
    expect(d.body.records.map((r: any) => r.record)).toEqual(["verification", "spf", "dkim", "return_path", "dmarc"]);
  });

  it("sends, records usage and honours idempotency", async () => {
    const acc = await verifiedAccount(postal);
    const msg = { from: "Loja <oi@news.example.com>", to: ["Cliente@Gmail.com"], subject: "Pedido", html: "<b>ok</b>", tags: [{ name: "category", value: "order" }] };
    const a = await call("/emails", { method: "POST", token: acc.api_key, json: msg, headers: { "idempotency-key": "order-1" } });
    expect(a.status).toBe(200);
    const b = await call("/emails", { method: "POST", token: acc.api_key, json: msg, headers: { "idempotency-key": "order-1" } });
    expect(b.body.id).toBe(a.body.id);
    expect(postal.sent).toHaveLength(1);
    expect(postal.sent[0].tag).toBe("order");
    expect(postal.sent[0].headers["X-NovaMail-Id"]).toBe(a.body.id);

    const got = await call(`/emails/${a.body.id}`, { token: acc.api_key });
    expect(got.body).toMatchObject({ object: "email", subject: "Pedido", last_event: "queued" });
    const u = await call("/usage", { token: acc.api_key });
    expect(u.body.usage).toEqual({ today: 1, month: 1 });

    const list = await call("/emails?limit=10", { token: acc.api_key });
    expect(list.body.data).toHaveLength(1);
  });

  it("enforces the free daily quota", async () => {
    const acc = await verifiedAccount(postal);
    const to = Array.from({ length: 50 }, (_, i) => `u${i}@example.org`);
    for (let i = 0; i < 2; i++) {
      const r = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to, subject: "x", text: "x" } });
      expect(r.status).toBe(200);
    }
    const over = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "one@example.org", subject: "x", text: "x" } });
    expect(over.status).toBe(429);
    expect(over.body.name).toBe("quota_exceeded");
  });

  it("validates payloads", async () => {
    const acc = await verifiedAccount(postal);
    const r = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "b@x.com", subject: "x" } });
    expect(r.status).toBe(422);
    const bad = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "not-an-email", subject: "x", text: "x" } });
    expect(bad.status).toBe(422);
  });

  it("sending-only keys cannot manage domains", async () => {
    const acc = await verifiedAccount(postal);
    const k = await call("/api-keys", { method: "POST", token: acc.api_key, json: { name: "app", permission: "sending_access" } });
    expect((await call("/domains", { token: k.body.token })).status).toBe(403);
    const s = await call("/emails", { method: "POST", token: k.body.token, json: { from: "a@example.com", to: "b@x.com", subject: "x", text: "x" } });
    expect(s.status).toBe(200);
  });
});

describe("Postal webhooks", () => {
  it("rejects unsigned events", async () => {
    const acc = await newAccount();
    const r = await postalHook(acc.id, "MessageSent", {}, false);
    expect(r.status).toBe(401);
  });

  it("tracks delivery, bounces and suppresses bounced addresses", async () => {
    const acc = await verifiedAccount(postal);
    const s = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "dead@x.com", subject: "x", text: "x" } });
    const postalId = postal.nextId - 1;
    const message = { id: postalId, to: "dead@x.com", from: "a@example.com", subject: "x" };

    await postalHook(acc.id, "MessageSent", { message, status: "Sent" });
    expect((await call(`/emails/${s.body.id}`, { token: acc.api_key })).body.last_event).toBe("delivered");

    await postalHook(acc.id, "MessageBounced", { original_message: message, bounce: { id: 1 } });
    expect((await call(`/emails/${s.body.id}`, { token: acc.api_key })).body.last_event).toBe("bounced");

    // An open after a bounce must not overwrite the terminal state.
    await postalHook(acc.id, "MessageLoaded", { message });
    expect((await call(`/emails/${s.body.id}`, { token: acc.api_key })).body.last_event).toBe("bounced");

    const again = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "dead@x.com", subject: "x", text: "x" } });
    expect(again.status).toBe(422);
    expect(again.body.name).toBe("recipients_suppressed");
  });

  it("dedupes retried webhooks by uuid", async () => {
    const acc = await newAccount();
    const body = JSON.stringify({ event: "MessageSent", timestamp: 1, uuid: "same-uuid", payload: { message: { id: 1, to: "a@b.c", from: "x", subject: "s" } } });
    const h = { "content-type": "application/json", "x-postal-signature-256": await postalSign(body) };
    await call(`/hooks/postal/${acc.id}`, { method: "POST", body, headers: h });
    const r = await call(`/hooks/postal/${acc.id}`, { method: "POST", body, headers: h });
    expect(r.body.duplicate).toBe(true);
  });

  it("suspends free accounts whose bounce rate breaches the guard", async () => {
    const acc = await verifiedAccount(postal);
    const day = new Date().toISOString().slice(0, 10);
    await testEnv.DB.prepare("INSERT INTO usage_daily (account_id, day, sent, bounced) VALUES (?,?,?,?)").bind(acc.id, day, GUARD.minVolume, 0).run();
    for (let i = 0; i < Math.ceil(GUARD.minVolume * GUARD.maxBounceRate) + 1; i++) {
      await postalHook(acc.id, "MessageBounced", { original_message: { id: 50_000 + i, to: `x${i}@y.com`, from: "a@example.com", subject: "s" } });
    }
    const r = await call("/usage", { token: acc.api_key });
    expect(r.status).toBe(403);
    expect(r.body.name).toBe("account_suspended");
    expect(postal.adminCalls).toContain("/v1/suspend");
  });
});

describe("primitives", () => {
  it("signs customer webhooks per the Standard Webhooks test vector", async () => {
    const sig = await standardWebhookSignature("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}');
    expect(sig).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("uuidv7 is time ordered", () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
    expect(a[14]).toBe("7");
  });
});
