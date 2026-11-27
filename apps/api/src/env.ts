export interface Env {
  /** D1-compatible handle; backed by the NovaDB Durable Object (see lib/dodb.ts). */
  DB: D1Database;
  NOVADB: DurableObjectNamespace<import("./lib/dodb").NovaDB>;
  WEBHOOK_QUEUE?: Queue<WebhookJob>;
  /** Uploaded images/GIFs/MP4 for emails (Workers KV, free tier). */
  MEDIA?: KVNamespace;

  /** Public base URL of this API, e.g. https://novamail.nexaclouds.online */
  PUBLIC_URL: string;
  /** Postal web/API base URL, e.g. https://postal.novamail.nexaclouds.online */
  POSTAL_URL: string;
  /** "postal" when a sending node is live; absent = sending not available yet. */
  SENDING_NODE?: string;
  /** "true" while sending is not live: no new subscriptions are sold. */
  BILLING_PAUSED?: string;
  /** Internal Postal admin sidecar (behind the same Caddy, bearer-protected). */
  POSTAL_ADMIN_URL: string;

  /** Internal account + sender used for platform e-mails (login codes). */
  SYSTEM_ACCOUNT_ID?: string;
  SYSTEM_FROM?: string;
  /** Temporary platform-mail bridge (Resend) until outbound port 25 is open. */
  SYSTEM_RESEND_KEY?: string;
  SYSTEM_RESEND_FROM?: string;
  /** Dashboard origin, e.g. https://app.novamail.nexaclouds.online */
  APP_URL?: string;
  ASSETS?: Fetcher;

  // Secrets (wrangler secret put ...)
  POSTAL_ADMIN_TOKEN: string;
  POSTAL_WEBHOOK_PUBLIC_KEY: string; // PEM of Postal's signing.key public part
  ENCRYPTION_KEY: string; // seals Postal server credentials in D1
  STRIPE_PRICE_DEDICATED_IP?: string;
  STRIPE_PRICE_DEDICATED_IP_YEAR?: string;
  /** Workers AI (free daily allocation on the free plan). */
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<any> };
  OWNER_TOKEN: string; // platform-owner token for /admin routes
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_SCALE?: string;
  STRIPE_PRICE_PRO_YEAR?: string;
  STRIPE_PRICE_SCALE_YEAR?: string;
  STRIPE_PRICE_EXTRA?: string;
  STRIPE_PRICE_EXTRA_YEAR?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_AUTOMATIC_TAX?: string;
}

export interface WebhookJob {
  webhookId: string;
  msgId: string;
  body: string;
  attempt: number;
}

export interface Principal {
  accountId: string;
  apiKeyId: string | null;
  userId?: string;
  permission: "full" | "sending" | "agent";
  domainId: string | null;
  /** Dashboard sessions only: the user's role in this workspace. */
  role?: Role;
}

export type Role = "owner" | "admin" | "editor" | "viewer";

export type AppEnv = { Bindings: Env; Variables: { principal: Principal } };
