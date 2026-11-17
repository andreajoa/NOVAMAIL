import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import type { Env } from "../src/env";
import { app } from "../src/index";
import { openDb } from "../src/lib/dodb";

export const testEnv = { ...env, DB: openDb(env.NOVADB) } as unknown as Env & { TEST_POSTAL_PRIVATE_KEY: string };

/** Calls the Hono app in-process with real D1 and waits for waitUntil() work. */
export async function call(path: string, init: RequestInit & { json?: unknown; token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const ctx = createExecutionContext();
  const res = await app.request(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as any };
}

export interface FakePostal {
  sent: any[];
  domainVerified: boolean;
  nextId: number;
  adminCalls: string[];
}

/** Replaces global fetch with an in-memory Postal (send API + admin sidecar). */
export function fakePostal(): FakePostal {
  const state: FakePostal = { sent: [], domainVerified: false, nextId: 1000, adminCalls: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/api/v1/send/message") {
      state.sent.push(body);
      const rcpts = [...(body.to ?? []), ...(body.cc ?? []), ...(body.bcc ?? [])];
      const messages = Object.fromEntries(rcpts.map((r: string) => [r, { id: state.nextId++, token: "tok" }]));
      return json({ status: "success", time: 0.01, flags: {}, data: { message_id: `<${crypto.randomUUID()}@rp.test>`, messages } });
    }
    if (url.pathname.startsWith("/_novamail/")) {
      const path = url.pathname.replace("/_novamail", "");
      state.adminCalls.push(path);
      const auth = new Headers(init?.headers).get("authorization");
      if (auth !== "Bearer test-admin-token") return json({ ok: false, error: "unauthorized" }, 401);
      const records = [
        { record: "verification", type: "TXT", name: body.name ?? "example.com", value: "postal-verification abc", required: true },
        { record: "spf", type: "TXT", name: body.name ?? "example.com", value: "v=spf1 a mx include:spf.novamail.test ~all", required: true },
        { record: "dkim", type: "TXT", name: "postal-ABC123._domainkey.example.com", value: "v=DKIM1; t=s; h=sha256; p=MIIB", required: true },
        { record: "return_path", type: "CNAME", name: "psrp.example.com", value: "rp.novamail.test", required: false },
      ];
      switch (path) {
        case "/v1/provision":
          return json({ ok: true, org: body.account_id.toLowerCase().replace(/_/g, "-"), server: "main", api_key: "postal-server-key", smtp_username: "acc", smtp_password: "smtp-secret" });
        case "/v1/domains/add":
          return json({ ok: true, uuid: crypto.randomUUID(), records });
        case "/v1/domains/check":
          return json({ ok: true, verified: state.domainVerified, dns_ok: state.domainVerified, checks: { spf: state.domainVerified ? "OK" : "Missing", dkim: state.domainVerified ? "OK" : "Missing" }, records });
        default:
          return json({ ok: true });
      }
    }
    return json({ error: "unexpected fetch " + url.href }, 599);
  });
  return state;
}

/** Signs a body exactly like Postal does (RSA PKCS#1 v1.5 + SHA-256, base64). */
export async function postalSign(body: string): Promise<string> {
  const der = Uint8Array.from(atob(testEnv.TEST_POSTAL_PRIVATE_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...sig));
}
