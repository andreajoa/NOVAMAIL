#!/usr/bin/env node
// Upserts NovaMail platform DNS records in Cloudflare (never proxied: SMTP needs the real IP).
// env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, MAIL_DOMAIN, SERVER_IP, DKIM_PUB (PEM), DRY_RUN=1
import { platformRecords } from "./records.mjs";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ZONE_ID: zone, MAIL_DOMAIN, SERVER_IP, DKIM_PUB, DRY_RUN } = process.env;
for (const [k, v] of Object.entries({ CLOUDFLARE_ZONE_ID: zone, MAIL_DOMAIN, SERVER_IP, DKIM_PUB })) if (!v) throw new Error(`${k} is required`);

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${init.method ?? "GET"} ${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
};

for (const rec of platformRecords({ mailDomain: MAIL_DOMAIN, ip: SERVER_IP, dkimPublicKeyPem: DKIM_PUB })) {
  const existing = await api(`/dns_records?type=${rec.type}&name=${encodeURIComponent(rec.name)}`);
  // SPF/DKIM/DMARC TXT: one record per name, replace content. MX/A/CNAME: same.
  const same = existing.find((e) => e.content.replace(/^"|"$/g, "") === rec.content);
  const body = { ...rec, proxied: false, ttl: 300 };
  if (same) { console.log(`ok      ${rec.type.padEnd(5)} ${rec.name}`); continue; }
  if (DRY_RUN) { console.log(`would   ${rec.type.padEnd(5)} ${rec.name} -> ${rec.content.slice(0, 60)}`); continue; }
  const target = rec.type === "TXT" ? existing.find((e) => e.content.split(/[;\s]/)[0] === rec.content.split(/[;\s]/)[0]) : existing[0];
  if (target) await api(`/dns_records/${target.id}`, { method: "PUT", body: JSON.stringify(body) });
  else await api(`/dns_records`, { method: "POST", body: JSON.stringify(body) });
  console.log(`${target ? "updated" : "created"} ${rec.type.padEnd(5)} ${rec.name}`);
}
