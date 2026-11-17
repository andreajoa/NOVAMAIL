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

describe("dashboard login (passwordless)", () => {
  async function systemSender() {
    const sys = await verifiedAccount(postal, "internal");
    testEnv.SYSTEM_ACCOUNT_ID = sys.id;
    testEnv.SYSTEM_FROM = "NovaMail <no-reply@example.com>";
    return sys;
  }
  const lastCode = () => {
    const m = String(postal.sent.at(-1)?.plain_body ?? "").match(/(\d{3}) (\d{3})/);
    return m ? m[1]! + m[2]! : "";
  };
  const cookieOf = (setCookie: string | null) => (setCookie ?? "").split(";")[0]!;

  async function login(email: string) {
    await call("/auth/start", { method: "POST", json: { email } });
    const ctxRes = await rawCall("/auth/verify", { method: "POST", json: { email, code: lastCode() } });
    return ctxRes;
  }
  async function rawCall(path: string, init: RequestInit & { json?: unknown } = {}) {
    const { app } = await import("../src/index");
    const { createExecutionContext, waitOnExecutionContext } = await import("cloudflare:test");
    const headers = new Headers(init.headers);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    const ctx = createExecutionContext();
    const res = await app.request(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    return { status: res.status, body: (await res.json()) as any, cookie: cookieOf(res.headers.get("set-cookie")) };
  }

  it("sends a code through NovaMail itself and signs up a Free account", async () => {
    await systemSender();
    const r = await call("/auth/start", { method: "POST", json: { email: "Nova.Cliente@Example.org" } });
    expect(r.body.sent).toBe(true);
    expect(postal.sent.at(-1).to).toEqual(["nova.cliente@example.org"]);
    expect(postal.sent.at(-1).subject).toMatch(/^\d{3} \d{3} é o seu código/);

    const v = await rawCall("/auth/verify", { method: "POST", json: { email: "nova.cliente@example.org", code: lastCode() } });
    expect(v.status).toBe(200);
    expect(v.body.new_account).toBe(true);
    expect(v.body.api_key).toMatch(/^nm_/);
    expect(v.cookie).toMatch(/^nm_session=/);

    const me = await rawCall("/me", { headers: { cookie: v.cookie } });
    expect(me.body.plan.id).toBe("free");
    expect(me.body.user.email).toBe("nova.cliente@example.org");
  });

  it("second login reuses the account and does not leak the key again", async () => {
    await systemSender();
    await login("again@example.org");
    const v = await login("again@example.org");
    expect(v.body.new_account).toBe(false);
    expect(v.body.api_key).toBeUndefined();
  });

  it("rejects wrong codes and locks after 5 attempts", async () => {
    await systemSender();
    await call("/auth/start", { method: "POST", json: { email: "brute@example.org" } });
    for (let i = 0; i < 5; i++) expect((await call("/auth/verify", { method: "POST", json: { email: "brute@example.org", code: "000000" } })).status).toBe(401);
    const r = await call("/auth/verify", { method: "POST", json: { email: "brute@example.org", code: lastCode() } });
    expect(r.status).toBe(429);
  });

  it("rate-limits code requests and refuses disposable inboxes", async () => {
    await systemSender();
    for (let i = 0; i < 3; i++) expect((await call("/auth/start", { method: "POST", json: { email: "spam@example.org" } })).status).toBe(200);
    expect((await call("/auth/start", { method: "POST", json: { email: "spam@example.org" } })).status).toBe(429);
    expect((await call("/auth/start", { method: "POST", json: { email: "x@mailinator.com" } })).status).toBe(422);
  });

  it("cookie mutations need the dashboard header (CSRF) and logout kills the session", async () => {
    await systemSender();
    const v = await login("csrf@example.org");
    const noHeader = await rawCall("/api-keys", { method: "POST", json: { name: "x" }, headers: { cookie: v.cookie } });
    expect(noHeader.status).toBe(403);
    const ok = await rawCall("/api-keys", { method: "POST", json: { name: "x" }, headers: { cookie: v.cookie, "x-novamail-client": "dashboard" } });
    expect(ok.status).toBe(201);
    await rawCall("/auth/logout", { method: "POST", headers: { cookie: v.cookie } });
    expect((await rawCall("/me", { headers: { cookie: v.cookie } })).status).toBe(401);
  });
});

describe("docs", () => {
  it("serves an OpenAPI 3.1 document covering every public route", async () => {
    const r = await call("/openapi.json");
    expect(r.body.openapi).toBe("3.1.0");
    for (const p of ["/emails", "/emails/batch", "/domains/{id}/verify", "/api-keys", "/webhooks", "/suppressions", "/usage"]) expect(r.body.paths[p]).toBeTruthy();
  });
});

describe("billing (Stripe)", () => {
  const WHSEC = "whsec_test_secret";
  beforeEach(() => {
    Object.assign(testEnv, { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PRICE_PRO: "price_pro", STRIPE_PRICE_SCALE: "price_scale", STRIPE_PRICE_EXTRA: "price_extra" });
  });
  afterEach(() => {
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_SCALE", "STRIPE_PRICE_EXTRA"]) delete (testEnv as any)[k];
  });
  async function stripeEvent(evt: unknown, secret = WHSEC) {
    const body = JSON.stringify(evt);
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return call("/hooks/stripe", { method: "POST", body, headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${mac}` } });
  }

  it("creates an embedded Checkout session with the add-on upsell", async () => {
    const acc = await newAccount();
    const r = await call("/billing/checkout", { method: "POST", token: acc.api_key, json: { plan: "pro" } });
    expect(r.body.client_secret).toBe("cs_test_1_secret_x");
    const sent = decodeURIComponent(postal.stripeCalls.find((x) => x.startsWith("/v1/checkout/sessions"))!);
    expect(sent).toContain(`client_reference_id=${acc.id}`);
    expect(sent).toContain("line_items[0][price]=price_pro");
    expect(sent).toContain("ui_mode=embedded");
    expect(sent).toContain("optional_items[0][price]=price_extra");
    expect(sent).toContain("optional_items[0][adjustable_quantity][enabled]=true");
    const yearly = await call("/billing/checkout", { method: "POST", token: acc.api_key, json: { plan: "pro", interval: "year" } });
    expect(yearly.status).toBe(503); // no yearly price configured in this test
  });

  it("upgrades on checkout.session.completed and downgrades on cancellation", async () => {
    const acc = await newAccount();
    const bad = await stripeEvent({ type: "checkout.session.completed", data: { object: {} } }, "wrong");
    expect(bad.status).toBe(400);

    await stripeEvent({ type: "checkout.session.completed", data: { object: { client_reference_id: acc.id, subscription: "sub_1", customer: "cus_1" } } });
    let u = await call("/usage", { token: acc.api_key });
    expect(u.body.plan).toBe("pro");
    const me = await call("/me", { token: acc.api_key });
    expect(me.body.plan.monthly).toBe(150_000); // Pro 50k + 2 add-on packs
    expect(me.body.plan.extra_packs).toBe(2);
    expect(postal.adminCalls).toContain("/v1/limits");

    const portal = await call("/billing/portal", { method: "POST", token: acc.api_key });
    expect(portal.body.url).toContain("billing.stripe.com");

    await stripeEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", metadata: { account_id: acc.id } } } });
    u = await call("/usage", { token: acc.api_key });
    expect(u.body.plan).toBe("free");
  });

  it("is a no-cost no-op until Stripe is configured", async () => {
    delete (testEnv as any).STRIPE_SECRET_KEY;
    delete (testEnv as any).STRIPE_PRICE_PRO;
    const acc = await newAccount();
    const plans = await call("/billing/plans", { token: acc.api_key });
    expect(plans.body.enabled).toBe(false);
    const r = await call("/billing/checkout", { method: "POST", token: acc.api_key, json: { plan: "pro" } });
    expect(r.status).toBe(503);
  });
});

describe("marketing: audiences, broadcasts, one-click unsubscribe", () => {
  it("imports contacts, sends a personalised broadcast with RFC 8058 headers, honours unsubscribes", async () => {
    const { processBroadcasts, BATCH_SIZE } = await import("../src/routes/marketing");
    const acc = await verifiedAccount(postal, "pro");
    const aud = await call("/audiences", { method: "POST", token: acc.api_key, json: { name: "Clientes" } });
    const imp = await call(`/audiences/${aud.body.id}/contacts`, {
      method: "POST",
      token: acc.api_key,
      json: [{ email: "Ana@x.com", first_name: "Ana" }, { email: "bia@x.com", first_name: "Bia" }, { email: "caio@x.com" }],
    });
    expect(imp.body.imported).toBe(3);

    const bc = await call("/broadcasts", { method: "POST", token: acc.api_key, json: { audience_id: aud.body.id, from: "Loja <news@example.com>", subject: "Oi {{first_name}}", html: '<p>Oi {{first_name}}</p><a href="{{unsubscribe_url}}">sair</a>' } });
    expect((await call(`/broadcasts/${bc.body.id}/send`, { method: "POST", token: acc.api_key })).body.status).toBe("sending");

    const before = postal.sent.length;
    const r = await processBroadcasts(testEnv);
    expect(r[0]).toMatchObject({ sent: 3, done: true });
    const batch = postal.sent.slice(before);
    const ana = batch.find((m) => m.to[0] === "ana@x.com");
    expect(ana.subject).toBe("Oi Ana");
    expect(ana.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const unsubUrl = ana.headers["List-Unsubscribe"].slice(1, -1) as string;
    expect(ana.html_body).toContain(unsubUrl);
    expect(BATCH_SIZE).toBeGreaterThan(0);

    // GET only shows a confirmation (link scanners must not unsubscribe people).
    const path = new URL(unsubUrl).pathname;
    const { app } = await import("../src/index");
    const get = await app.request(path, {}, testEnv);
    expect(await get.text()).toContain("<form method=\"post\">");
    const post = await app.request(path, { method: "POST" }, testEnv);
    expect(post.status).toBe(200);
    expect((await call("/suppressions", { token: acc.api_key })).body.data.map((s: any) => s.address)).toContain("ana@x.com");
    expect((await app.request("/u/forged.token", { method: "POST" }, testEnv)).status).toBe(404);

    const status = await call(`/broadcasts/${bc.body.id}`, { token: acc.api_key });
    expect(status.body).toMatchObject({ status: "sent", sent_count: 3 });

    // A second broadcast skips the unsubscribed contact.
    const bc2 = await call("/broadcasts", { method: "POST", token: acc.api_key, json: { audience_id: aud.body.id, from: "news@example.com", subject: "De novo", text: "oi" } });
    await call(`/broadcasts/${bc2.body.id}/send`, { method: "POST", token: acc.api_key });
    const r2 = await processBroadcasts(testEnv);
    expect(r2[0]).toMatchObject({ sent: 2 });
  });

  it("pauses a broadcast when the plan quota runs out", async () => {
    const { processBroadcasts } = await import("../src/routes/marketing");
    const acc = await verifiedAccount(postal);
    const day = new Date().toISOString().slice(0, 10);
    await testEnv.DB.prepare("INSERT INTO usage_daily (account_id, day, sent) VALUES (?,?,?)").bind(acc.id, day, 100).run();
    const aud = await call("/audiences", { method: "POST", token: acc.api_key, json: { name: "A" } });
    await call(`/audiences/${aud.body.id}/contacts`, { method: "POST", token: acc.api_key, json: { email: "z@x.com" } });
    const bc = await call("/broadcasts", { method: "POST", token: acc.api_key, json: { audience_id: aud.body.id, from: "a@example.com", subject: "s", text: "t" } });
    await call(`/broadcasts/${bc.body.id}/send`, { method: "POST", token: acc.api_key });
    await processBroadcasts(testEnv);
    const s = await call(`/broadcasts/${bc.body.id}`, { token: acc.api_key });
    expect(s.body.status).toBe("paused");
    expect(s.body.status_reason).toMatch(/Daily limit/);
  });
});

describe("feedback loops (ARF complaints)", () => {
  it("suppresses the complainer, marks the email and feeds the reputation guard", async () => {
    const acc = await verifiedAccount(postal);
    const s = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "angry@x.com", subject: "promo", text: "x" } });
    expect(postal.sent.at(-1).headers["Feedback-ID"]).toBe(`tx:${acc.id}:novamail`);
    const arf = [
      "Content-Type: multipart/report; report-type=feedback-report; boundary=b",
      "",
      "--b",
      "Content-Type: message/feedback-report",
      "",
      "Feedback-Type: abuse",
      "User-Agent: Yahoo!-Mail-Feedback/2.0",
      "Original-Rcpt-To: <angry@x.com>",
      "",
      "--b",
      "Content-Type: text/rfc822-headers",
      "",
      "From: a@example.com",
      "To: angry@x.com",
      `X-NovaMail-Id: ${s.body.id}`,
      "--b--",
    ].join("\r\n");
    const body = JSON.stringify({ id: 9, rcpt_to: "fbl@routes.test", mail_from: "fbl@yahoo.com", message: btoa(arf), base64: true, size: arf.length });
    const unsigned = await call("/hooks/fbl", { method: "POST", body, headers: { "content-type": "application/json" } });
    expect(unsigned.status).toBe(401);
    const r = await call("/hooks/fbl", { method: "POST", body, headers: { "content-type": "application/json", "x-postal-signature-256": await postalSign(body) } });
    expect(r.body.complaint).toBe(s.body.id);
    expect((await call(`/emails/${s.body.id}`, { token: acc.api_key })).body.last_event).toBe("complained");
    const sup = (await call("/suppressions", { token: acc.api_key })).body.data;
    expect(sup).toContainEqual(expect.objectContaining({ address: "angry@x.com", reason: "complaint" }));
    const again = await call("/emails", { method: "POST", token: acc.api_key, json: { from: "a@example.com", to: "angry@x.com", subject: "x", text: "x" } });
    expect(again.body.name).toBe("recipients_suppressed");
  });

  it("parses folded headers and ignores non-abuse reports", async () => {
    const { parseArf } = await import("../src/routes/fbl");
    expect(parseArf("Feedback-Type: abuse\r\nOriginal-Rcpt-To:\r\n <X@Y.com>\r\nX-NovaMail-Id: 01a1e7c3-6f03-78e6-8408-931371537412")).toEqual({ feedbackType: "abuse", recipient: "x@y.com", novamailId: "01a1e7c3-6f03-78e6-8408-931371537412" });
    expect(parseArf("Feedback-Type: not-spam\r\n").feedbackType).toBe("not-spam");
  });
});

describe("public site (SEO/GEO)", () => {
  const get = async (path: string, headers: Record<string, string> = {}) => {
    const { route } = await import("../src/index");
    const { createExecutionContext } = await import("cloudflare:test");
    const env = { ...testEnv, ASSETS: { fetch: async () => new Response("<div id=root></div>", { headers: { "content-type": "text/html" } }) } } as any;
    const r = await route(new Request(`https://app.novamail.nexaclouds.online${path}`, { headers }), env, createExecutionContext());
    return { status: r.status, type: r.headers.get("content-type") ?? "", text: await r.text() };
  };

  it("serves server-rendered, crawlable pages with structured data", async () => {
    const home = await get("/");
    expect(home.type).toContain("text/html");
    expect(home.text).toContain("<h1>Email marketing for your customers.");
    expect(home.text).toContain('"@type":"FAQPage"');
    expect(home.text).toContain('"@type":"SoftwareApplication"');
    expect(home.text).toContain('hreflang="pt-BR"');
    expect(home.text).toContain('<link rel="canonical" href="https://app.novamail.nexaclouds.online/">');
    expect(home.text).not.toContain("<script src");
    for (const p of ["/pricing", "/email-marketing", "/mailchimp-alternative", "/resend-alternative", "/guides/spf-dkim-dmarc", "/pt/", "/terms"]) {
      const r = await get(p);
      expect(r.status, p).toBe(200);
      expect(r.text, p).toMatch(/<title>[^<]{10,70}<\/title>/);
    }
  });

  it("signed-in users get the dashboard at /", async () => {
    const r = await get("/", { cookie: "nm_session=abc" });
    expect(r.text).toBe("<div id=root></div>");
  });

  it("publishes robots, sitemap, llms.txt and the IndexNow key", async () => {
    const robots = await get("/robots.txt");
    expect(robots.text).toContain("User-agent: GPTBot");
    expect(robots.text).toContain("Sitemap: https://app.novamail.nexaclouds.online/sitemap.xml");
    const sm = await get("/sitemap.xml");
    expect(sm.text).toContain("<loc>https://app.novamail.nexaclouds.online/mailchimp-alternative</loc>");
    expect((await get("/llms.txt")).text).toMatch(/^# NovaMail/);
    expect((await get("/llms-full.txt")).text).toContain("SPF, DKIM and DMARC");
    const { INDEXNOW_KEY } = await import("../src/site");
    expect((await get(`/${INDEXNOW_KEY}.txt`)).text).toBe(INDEXNOW_KEY);
  });
});

describe("templates, media and funnels", () => {
  it("renders presets and strips active content from any HTML", async () => {
    const { renderDesign, sanitizeHtml, TEMPLATES } = await import("@novamail/email");
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const t of TEMPLATES) {
      const html = renderDesign(t.design);
      expect(html).toContain("<!doctype html>");
      expect(html).not.toMatch(/<script/i);
    }
    const dirty = `<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://evil"></iframe><img src=x onerror=alert(1)>`;
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    expect(clean).toContain("<p>hi</p>");
  });

  it("creates a template from a design and sends a test only to the owner", async () => {
    const acc = await verifiedAccount(postal);
    const { TEMPLATES } = await import("@novamail/email");
    const t = await call("/templates", { method: "POST", token: acc.api_key, json: { name: "Welcome", subject: "Hi {{first_name}}", design: TEMPLATES.find((x) => x.id === "welcome")!.design } });
    expect(t.status).toBe(201);
    const got = await call(`/templates/${t.body.id}`, { token: acc.api_key });
    expect(got.body.html).toContain("Welcome aboard");
    expect(got.body.text).toContain("WELCOME ABOARD");
    const test = await call(`/templates/${t.body.id}/test`, { method: "POST", token: acc.api_key, json: { from: "a@example.com" } });
    expect(test.body.to).toMatch(/@example\.com$/);
    expect(postal.sent.at(-1).subject).toBe("[TEST] Hi Test");
  });

  it("detects real file types and refuses SVG", async () => {
    const { sniff } = await import("../src/routes/templates");
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniff(new TextEncoder().encode("GIF89a...."))).toBe("image/gif");
    expect(sniff(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
  });

  it("runs a funnel: enrolls on audience join, waits between steps, exits on unsubscribe", async () => {
    const { processFunnels } = await import("../src/routes/funnels");
    const acc = await verifiedAccount(postal, "pro");
    const t1 = await call("/templates", { method: "POST", token: acc.api_key, json: { name: "E1", subject: "Day 0 {{first_name}}", html: "<p>Hello {{first_name}}</p>" } });
    const t2 = await call("/templates", { method: "POST", token: acc.api_key, json: { name: "E2", subject: "Day 2", html: "<p>Second</p>" } });
    const aud = await call("/audiences", { method: "POST", token: acc.api_key, json: { name: "Leads" } });
    const f = await call("/funnels", { method: "POST", token: acc.api_key, json: { name: "Onboarding", audience_id: aud.body.id, from: "a@example.com", steps: [{ template_id: t1.body.id, wait_minutes: 0 }, { template_id: t2.body.id, wait_minutes: 2 * 24 * 60 }] } });
    expect(f.status).toBe(201);
    expect((await call(`/funnels/${f.body.id}/activate`, { method: "POST", token: acc.api_key })).body.status).toBe("active");

    await call(`/audiences/${aud.body.id}/contacts`, { method: "POST", token: acc.api_key, json: [{ email: "lead1@x.com", first_name: "Lia" }, { email: "lead2@x.com" }] });
    const now = Date.now();
    let r = await processFunnels(testEnv, now);
    expect(r.sent).toBe(2);
    expect(postal.sent.at(-2).subject).toBe("Day 0 Lia");
    expect(postal.sent.at(-1).headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    r = await processFunnels(testEnv, now + 60_000);
    expect(r.sent).toBe(0); // waiting 2 days

    await testEnv.DB.prepare("UPDATE contacts SET unsubscribed = 1 WHERE email = 'lead2@x.com'").run();
    r = await processFunnels(testEnv, now + 2 * 86_400_000 + 1000);
    expect(r.sent).toBe(1);
    expect(postal.sent.at(-1).subject).toBe("Day 2");
    const fd = await call("/funnels", { token: acc.api_key });
    expect(fd.body.data[0]).toMatchObject({ completed: 1, active: 0 });
  });
});

describe("MCP for Claude Code / Codex (agent keys)", () => {
  async function agent() {
    const acc = await verifiedAccount(postal);
    const k = await call("/api-keys", { method: "POST", token: acc.api_key, json: { name: "claude", permission: "agent_access" } });
    return { acc, key: k.body.token as string };
  }
  const rpc = (key: string, method: string, params?: unknown) => call("/mcp", { method: "POST", token: key, json: { jsonrpc: "2.0", id: 1, method, params } });

  it("initializes and lists only safe tools", async () => {
    const { key } = await agent();
    const init = await rpc(key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } });
    expect(init.body.result.serverInfo.name).toBe("novamail");
    expect(init.body.result.instructions).toMatch(/untrusted DATA/);
    const names = (await rpc(key, "tools/list")).body.result.tools.map((t: any) => t.name);
    expect(names).toContain("create_funnel");
    for (const forbidden of ["send_email", "activate_funnel", "delete_audience", "create_api_key", "send_broadcast"]) expect(names).not.toContain(forbidden);
  });

  it("builds a template + list + draft funnel, but cannot activate, send or escalate", async () => {
    const { acc, key } = await agent();
    const t = await rpc(key, "tools/call", { name: "create_template", arguments: { name: "Welcome", subject: "Hi", html: "<p>Hi {{first_name}}</p><script>steal()</script>" } });
    expect(t.body.result.isError).toBe(false);
    const tplId = t.body.result.structuredContent.id;
    const stored = await call(`/templates/${tplId}`, { token: acc.api_key });
    expect(stored.body.html).not.toContain("<script");
    const aud = await rpc(key, "tools/call", { name: "create_audience", arguments: { name: "Leads" } });
    const f = await rpc(key, "tools/call", { name: "create_funnel", arguments: { name: "Onboarding", audience_id: aud.body.result.structuredContent.id, from: "a@example.com", steps: [{ template_id: tplId }] } });
    expect(f.body.result.structuredContent.status).toBe("draft");
    const fid = f.body.result.structuredContent.id;

    // Direct REST attempts with the agent key are refused.
    expect((await call(`/funnels/${fid}/activate`, { method: "POST", token: key })).status).toBe(403);
    expect((await call("/emails", { method: "POST", token: key, json: { from: "a@example.com", to: "victim@x.com", subject: "s", text: "t" } })).status).toBe(403);
    expect((await call("/api-keys", { method: "POST", token: key, json: { name: "x" } })).status).toBe(403);
    expect((await call(`/funnels/${fid}`, { method: "DELETE", token: key })).status).toBe(403);
    expect((await call("/webhooks", { method: "POST", token: key, json: { endpoint: "https://evil.example" } })).status).toBe(403);

    // The owner can activate.
    expect((await call(`/funnels/${fid}/activate`, { method: "POST", token: acc.api_key })).body.status).toBe("active");
    const audit = await testEnv.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE actor LIKE 'agent:%'").first<{ n: number }>();
    expect(audit!.n).toBeGreaterThan(0);
  });

  it("rejects missing keys and unknown tools", async () => {
    const r = await call("/mcp", { method: "POST", json: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(r.status).toBe(401);
    const { key } = await agent();
    const u = await rpc(key, "tools/call", { name: "rm_rf", arguments: {} });
    expect(u.body.error.code).toBe(-32602);
  });
});
