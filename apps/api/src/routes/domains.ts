import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { prefixedId } from "../lib/crypto";
import { ApiError, errors, zodMessage } from "../lib/http";
import { planOf } from "../lib/plans";
import { postalAdmin, type DnsRecord } from "../lib/postal";

export const domains = new Hono<AppEnv>();

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
  if (!a?.postal_org || !a.postal_server) throw new ApiError(503, "account_not_provisioned", "Sending is not provisioned for this account yet.");
  return a as { plan: string; postal_org: string; postal_server: string };
}

domains.post("/", async (c) => {
  const p = c.get("principal");
  const parsed = nameSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw errors.validation(zodMessage(parsed.error));
  const name = parsed.data.name;
  const a = await accountServer(c, p.accountId);
  const count = await c.env.DB.prepare("SELECT COUNT(*) n FROM domains WHERE account_id = ?").bind(p.accountId).first<{ n: number }>();
  const plan = planOf(a.plan);
  if ((count?.n ?? 0) >= plan.domains) throw errors.quota(`The ${plan.label} plan allows ${plan.domains} domain(s).`);
  const exists = await c.env.DB.prepare("SELECT id FROM domains WHERE account_id = ? AND name = ?").bind(p.accountId, name).first();
  if (exists) throw errors.conflict(`${name} was already added.`);

  const r = await postalAdmin.addDomain(c.env, { org: a.postal_org, server: a.postal_server, name });
  const id = prefixedId("dom");
  const records = withDmarc(name, r.records);
  await c.env.DB.prepare("INSERT INTO domains (id, account_id, name, status, postal_uuid, records, created_at) VALUES (?,?,?, 'pending', ?,?,?)")
    .bind(id, p.accountId, name, r.uuid, JSON.stringify(records), Date.now())
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
  const a = await accountServer(c, p.accountId);
  const r = await postalAdmin.checkDomain(c.env, { org: a.postal_org, server: a.postal_server, uuid: d.postal_uuid });
  // A domain can send only when ownership is proven AND SPF + DKIM are correct.
  const status = r.verified && r.dns_ok ? "verified" : "pending";
  await c.env.DB.prepare("UPDATE domains SET status = ?, checks = ?, records = ?, verified_at = CASE WHEN ? = 'verified' THEN COALESCE(verified_at, ?) ELSE verified_at END WHERE id = ?")
    .bind(status, JSON.stringify(r.checks), JSON.stringify(withDmarc(d.name, r.records)), status, Date.now(), d.id)
    .run();
  return c.json({ object: "domain", id: d.id, name: d.name, status, checks: r.checks });
});

domains.delete("/:id", async (c) => {
  const p = c.get("principal");
  const d = await c.env.DB.prepare("SELECT id, postal_uuid FROM domains WHERE id = ? AND account_id = ?").bind(c.req.param("id"), p.accountId).first<{ id: string; postal_uuid: string }>();
  if (!d) throw errors.notFound("Domain");
  const a = await accountServer(c, p.accountId);
  await postalAdmin.removeDomain(c.env, { org: a.postal_org, server: a.postal_server, uuid: d.postal_uuid });
  await c.env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(d.id).run();
  return c.json({ object: "domain", id: d.id, deleted: true });
});
