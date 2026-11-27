import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { prefixedId } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { planOf } from "../lib/plans";
import { postalAdmin, type DnsRecord } from "../lib/postal";
import { sesCreateIdentity, sesDeleteIdentity, sesGetIdentity, sesRecords } from "../lib/ses";

const viaSes = (env: AppEnv["Bindings"]) => env.SENDING_NODE === "ses";
/** SES identities live in our AWS account, so one domain can belong to only one NovaMail account. */
const SES_PREFIX = "ses:";

export const domains = new Hono<AppEnv>();

function isPlatformDomain(env: AppEnv["Bindings"], name: string): boolean {
  const own = [env.SYSTEM_FROM, env.PUBLIC_URL].filter(Boolean).map((v) => String(v).replace(/^.*@|^https?:\/\//g, "").replace(/[>/].*$/, "").replace(/^api\./, ""));
  return own.some((d) => d === name || d.endsWith(`.${name}`));
}

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Must be a valid domain name, e.g. mail.example.com"),
});

/** DMARC is not checked by Postal but Gmail/Yahoo require it for bulk senders. */
export function withDmarc(name: string, records: DnsRecord[]): DnsRecord[] {
  if (records.some((r) => r.record === "dmarc")) return records;
  return [...records, { record: "dmarc", type: "TXT", name: `_dmarc.${name}`, value: "v=DMARC1; p=none; adkim=r; aspf=r;", required: false }];
}

async function accountServer(c: { env: AppEnv["Bindings"] }, accountId: string) {
  const a = await c.env.DB.prepare("SELECT plan, postal_org, postal_server FROM accounts WHERE id = ?").bind(accountId).first<{ plan: string; postal_org: string | null; postal_server: string | null }>();
  if (!a?.postal_org || !a.postal_server) throw new ApiError(503, "account_not_provisioned", "Sending is being activated on NovaMail — domains can be connected as soon as it is live.");
  return a as { plan: string; postal_org: string; postal_server: string };
}

domains.post("/", async (c) => {
  const p = c.get("principal");
  const parsed = nameSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const name = parsed.data.name;
  const a = viaSes(c.env)
    ? ((await c.env.DB.prepare("SELECT plan FROM accounts WHERE id = ?").bind(p.accountId).first<{ plan: string }>()) ?? { plan: "free" })
    : await accountServer(c, p.accountId);
  const count = await c.env.DB.prepare("SELECT COUNT(*) n FROM domains WHERE account_id = ?").bind(p.accountId).first<{ n: number }>();
  const plan = planOf(a.plan);
  if ((count?.n ?? 0) >= plan.domains) throw errors.quota(`The ${plan.label} plan allows ${plan.domains} domain(s).`);
  const exists = await c.env.DB.prepare("SELECT id FROM domains WHERE account_id = ? AND name = ?").bind(p.accountId, name).first();
  if (exists) throw errors.conflict(`${name} was already added.`);

  let ref: string;
  let records: DnsRecord[];
  if (viaSes(c.env)) {
    // Parent or child of a domain owned by another account would let it send as that brand.
    const taken = await c.env.DB.prepare("SELECT 1 FROM domains WHERE account_id <> ? AND (name = ? OR ? LIKE '%.' || name OR name LIKE '%.' || ?) LIMIT 1")
      .bind(p.accountId, name, name, name)
      .first();
    if (taken) throw errors.conflict(`${name} is already connected to another NovaMail account.`);
    const tokens = await sesCreateIdentity(c.env, name);
    ref = `${SES_PREFIX}${name}`;
    records = withDmarc(name, sesRecords(c.env, name, tokens));
  } else {
    const pa = a as unknown as { postal_org: string; postal_server: string };
    const r = await postalAdmin.addDomain(c.env, { org: pa.postal_org, server: pa.postal_server, name });
    ref = r.uuid;
    records = withDmarc(name, r.records);
  }
  const id = prefixedId("dom");
  await c.env.DB.prepare("INSERT INTO domains (id, account_id, name, status, postal_uuid, records, created_at) VALUES (?,?,?, 'pending', ?,?,?)")
    .bind(id, p.accountId, name, ref, JSON.stringify(records), Date.now())
    .run();
  return c.json({ object: "domain", id, name, status: "pending", records }, 201);
});

domains.get("/", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id, name, status, created_at FROM domains WHERE account_id = ? ORDER BY created_at DESC").bind(c.get("principal").accountId).all();
  return c.json({ object: "list", data: rows.results.map((r) => ({ object: "domain", ...r, created_at: new Date(r.created_at as number).toISOString() })) });
});

domains.get("/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM domains WHERE id = ? AND account_id = ?").bind(c.req.param("id"), c.get("principal").accountId).first<Record<string, unknown>>();
  if (!r) throw errors.notFound("Domain");
  return c.json({ object: "domain", id: r.id, name: r.name, status: r.status, records: JSON.parse(r.records as string), checks: JSON.parse(r.checks as string), created_at: new Date(r.created_at as number).toISOString() });
});

domains.post("/:id/verify", async (c) => {
  const p = c.get("principal");
  const d = await c.env.DB.prepare("SELECT id, name, postal_uuid FROM domains WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<{ id: string; name: string; postal_uuid: string }>();
  if (!d) throw errors.notFound("Domain");
  let status: "verified" | "pending";
  let checks: Record<string, string | null>;
  let records: DnsRecord[];
  if (d.postal_uuid?.startsWith(SES_PREFIX)) {
    const idn = await sesGetIdentity(c.env, d.name);
    if (!idn) throw new ApiError(409, "domain_missing", `${d.name} is no longer registered for sending. Remove it and add it again.`);
    const dkim = idn.DkimAttributes?.Status ?? "NOT_STARTED";
    const mailFrom = idn.MailFromAttributes?.MailFromDomainStatus ?? "PENDING";
    // DKIM proves ownership and authenticates every message (DMARC-aligned); MAIL FROM only improves SPF alignment.
    status = idn.VerifiedForSendingStatus && dkim === "SUCCESS" ? "verified" : "pending";
    checks = { dkim: dkim === "SUCCESS" ? "OK" : dkim, return_path: mailFrom === "SUCCESS" ? "OK" : mailFrom };
    records = withDmarc(d.name, sesRecords(c.env, d.name, idn.DkimAttributes?.Tokens ?? []));
  } else {
    const a = await accountServer(c, p.accountId);
    const r = await postalAdmin.checkDomain(c.env, { org: a.postal_org, server: a.postal_server, uuid: d.postal_uuid });
    // A domain can send only when ownership is proven AND SPF + DKIM are correct.
    status = r.verified && r.dns_ok ? "verified" : "pending";
    checks = r.checks;
    records = withDmarc(d.name, r.records);
  }
  await c.env.DB.prepare("UPDATE domains SET status = ?, checks = ?, records = ?, verified_at = CASE WHEN ? = 'verified' THEN COALESCE(verified_at, ?) ELSE verified_at END WHERE id = ?")
    .bind(status, JSON.stringify(checks), JSON.stringify(records), status, Date.now(), d.id)
    .run();
  return c.json({ object: "domain", id: d.id, name: d.name, status, checks });
});

domains.delete("/:id", async (c) => {
  const p = c.get("principal");
  const d = await c.env.DB.prepare("SELECT id, postal_uuid FROM domains WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<{ id: string; postal_uuid: string }>();
  if (!d) throw errors.notFound("Domain");
  if (d.postal_uuid?.startsWith(SES_PREFIX)) {
    const name = d.postal_uuid.slice(SES_PREFIX.length);
    // The platform's own sender domain stays registered even if an account removes it.
    const shared = await c.env.DB.prepare("SELECT 1 FROM domains WHERE name = ? AND id <> ? LIMIT 1").bind(name, d.id).first();
    if (!shared && !isPlatformDomain(c.env, name)) await sesDeleteIdentity(c.env, name);
  } else {
    const a = await accountServer(c, p.accountId);
    await postalAdmin.removeDomain(c.env, { org: a.postal_org, server: a.postal_server, uuid: d.postal_uuid });
  }
  await c.env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(d.id).run();
  return c.json({ object: "domain", id: d.id, deleted: true });
});
