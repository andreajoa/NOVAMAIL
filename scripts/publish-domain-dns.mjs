#!/usr/bin/env node
// Publishes the DNS records NovaMail returns for a customer domain into a Cloudflare zone.
// usage: CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… node scripts/publish-domain-dns.mjs domain.json
import { readFileSync } from "node:fs";
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ZONE_ID: zone } = process.env;
const dom = JSON.parse(readFileSync(process.argv[2], "utf8"));
const cf = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const j = await r.json();
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
};
for (const rec of dom.records) {
  const existing = await cf(`/dns_records?type=${rec.type}&name=${encodeURIComponent(rec.name)}`);
  const prefix = rec.value.split(/[;\s]/)[0];
  const same = existing.find((e) => e.content.replace(/^"|"$/g, "") === rec.value);
  if (same) { console.log(`ok      ${rec.record}`); continue; }
  // Never overwrite someone else's record: if the name already has a record of the same kind
  // (e.g. a DMARC/SPF from Resend), keep it and report it so a human decides.
  const clash = rec.type === "TXT" ? existing.find((e) => e.content.replace(/^"/, "").startsWith(prefix)) : existing[0];
  if (clash && !process.env.ALLOW_REPLACE) { console.log(`KEPT    ${rec.record}: ${rec.name} already has "${clash.content.slice(0, 70)}" (set ALLOW_REPLACE=1 to replace)`); continue; }
  const body = JSON.stringify({ type: rec.type, name: rec.name, content: rec.value, ttl: 300, proxied: false, priority: rec.priority, comment: `NovaMail ${rec.record}` });
  if (clash) await cf(`/dns_records/${clash.id}`, { method: "PUT", body });
  else await cf(`/dns_records`, { method: "POST", body });
  console.log(`${clash ? "updated" : "created"} ${rec.record}`);
}
