export interface Env {
  /** D1-compatible handle; backed by the NovaDB Durable Object (see lib/dodb.ts). */
  DB: D1Database;
  NOVADB: DurableObjectNamespace<import("./lib/dodb").NovaDB>;
  WEBHOOK_QUEUE?: Queue<WebhookJob>;

  /** Public base URL of this API, e.g. https://novamail.nexaclouds.online */
  PUBLIC_URL: string;
  /** Postal web/API base URL, e.g. https://postal.novamail.nexaclouds.online */
  POSTAL_URL: string;
  /** Internal Postal admin sidecar (behind the same Caddy, bearer-protected). */
  POSTAL_ADMIN_URL: string;

  // Secrets (wrangler secret put ...)
  POSTAL_ADMIN_TOKEN: string;
  POSTAL_WEBHOOK_PUBLIC_KEY: string; // PEM of Postal's signing.key public part
  ENCRYPTION_KEY: string; // seals Postal server credentials in D1
  OWNER_TOKEN: string; // platform-owner token for /admin routes
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export interface WebhookJob {
  webhookId: string;
  msgId: string;
  body: string;
  attempt: number;
}

export interface Principal {
  accountId: string;
  apiKeyId: string;
  permission: "full" | "sending";
  domainId: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { principal: Principal } };
