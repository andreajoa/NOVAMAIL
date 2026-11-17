#!/usr/bin/env node
// Ensures the D1 database and the webhook queue exist in the Cloudflare account and
// writes the real D1 id into wrangler.jsonc (in the CI checkout only).
// env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
import { readFileSync, writeFileSync } from "node:fs";

const [, , wranglerPath] = process.argv;
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!token || !account) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");

const cf = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
};

const dbs = await cf(`/d1/database?name=novamail`);
let db = dbs.find((d) => d.name === "novamail");
if (!db) db = await cf(`/d1/database`, { method: "POST", body: JSON.stringify({ name: "novamail", primary_location_hint: "enam" }) });
console.log(`D1 novamail: ${db.uuid}`);

const queues = await cf(`/queues`);
if (!queues.some((q) => q.queue_name === "novamail-webhooks")) {
  await cf(`/queues`, { method: "POST", body: JSON.stringify({ queue_name: "novamail-webhooks" }) });
  console.log("queue novamail-webhooks created");
} else console.log("queue novamail-webhooks ok");

const src = readFileSync(wranglerPath, "utf8");
writeFileSync(wranglerPath, src.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${db.uuid}"`));
