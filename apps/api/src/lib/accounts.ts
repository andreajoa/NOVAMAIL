import { tierPool } from "./ip-pools";
import type { Env } from "../env";
import { createApiKey } from "./auth";
import { prefixedId, seal } from "./crypto";
import { errors } from "./http";
import { PLANS, planOf, type PlanId } from "./plans";
import { postalAdmin } from "./postal";

export const poolFor = (plan: PlanId, override?: string) => override ?? tierPool(plan);

/** Creates the Postal org+server for an account and stores its sealed API key. */
export async function provisionAccount(env: Env, accountId: string, fetcher?: typeof fetch) {
  const a = await env.DB.prepare("SELECT id, name, plan, ip_pool FROM accounts WHERE id = ?").bind(accountId).first<{ id: string; name: string; plan: PlanId; ip_pool: string }>();
  if (!a) throw errors.notFound("Account");
  const r = await postalAdmin.provision(
    env,
    { account_id: a.id, name: a.name, hourly_limit: planOf(a.plan).hourly || null, ip_pool: a.ip_pool, webhook_url: `${env.PUBLIC_URL}/hooks/postal/${a.id}` },
    fetcher,
  );
  await env.DB.prepare("UPDATE accounts SET postal_org = ?, postal_server = ?, postal_server_key = ?, updated_at = ? WHERE id = ?")
    .bind(r.org, r.server, await seal(r.api_key, env.ENCRYPTION_KEY), Date.now(), a.id)
    .run();
  return r;
}

/** Account + Postal provisioning + first API key. SMTP password is returned once, never stored in clear. */
export async function createAccount(env: Env, input: { name: string; email: string; plan: PlanId; ipPool?: string; actor: string }) {
  const id = prefixedId("acc");
  const now = Date.now();
  await env.DB.prepare("INSERT INTO accounts (id, name, email, plan, ip_pool, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, input.name, input.email.toLowerCase(), input.plan, poolFor(input.plan, input.ipPool), now, now)
    .run();
  // No sending node right now (AWS node removed 26/11/2026): the account is created and can set
  // everything up; it is provisioned when a sending backend exists (SENDING_NODE=postal).
  const prov = env.SENDING_NODE === "postal" ? await provisionAccount(env, id) : null;
  const key = await createApiKey(env.DB, id, "Default");
  await env.DB.prepare("INSERT INTO audit_log (account_id, actor, action, detail, created_at) VALUES (?, ?, 'create_account', ?, ?)").bind(id, input.actor, input.plan, now).run();
  return {
    id,
    plan: input.plan,
    api_key: key.token,
    smtp: prov ? { host: new URL(env.POSTAL_URL).hostname, port: 587, username: prov.smtp_username, password: prov.smtp_password } : null,
  };
}
