#!/usr/bin/env node
// Notifies IndexNow (Bing, Yandex, Seznam, Naver…) about every public URL. Bing's index also
// feeds ChatGPT search and Copilot, so this speeds up both SEO and GEO. Run after each deploy.
const SITE = "https://app.novamail.nexaclouds.online";
const sm = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const key = "7c1f3a9e5b2d4c8a9f0e1d2c3b4a5f6e"; // must match apps/api/src/site/index.ts
const r = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${key}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${r.status} for ${urls.length} URLs`);
