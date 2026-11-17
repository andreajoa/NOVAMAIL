// Renders the template artwork (pure HTML/CSS → JPEG via headless Chrome/CDP). Run: node render.mjs
// Output: apps/web/public/tpl/<name>.jpg — royalty-free, generated in-house.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ART } from "./art.mjs";

const OUT = path.join(import.meta.dirname, "../../apps/web/public/tpl");
mkdirSync(OUT, { recursive: true });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9336", `--user-data-dir=${process.env.TMPDIR}nm-art-profile`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 60; i++) { try { ws = (await (await fetch("http://127.0.0.1:9336/json")).json()).find((x) => x.type === "page").webSocketDebuggerUrl; break; } catch { await sleep(250); } }
const s = new WebSocket(ws); await new Promise((r) => (s.onopen = r)); let id = 0; const p = new Map();
s.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); s.send(JSON.stringify({ id: i, method, params })); });
const only = process.argv.slice(2);
for (const [name, a] of Object.entries(ART)) {
  if (only.length && !only.includes(name)) continue;
  const [w, h] = a.size ?? [1200, 600];
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Great+Vibes&family=Inter:wght@400;600;800;900&family=Space+Grotesk:wght@500;700&family=DM+Serif+Display:ital@0;1&display=block" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:${w}px;height:${h}px;overflow:hidden}body{font-family:Inter,sans-serif;position:relative}${a.css}</style></head><body>${a.html}</body></html>`;
  await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
  await sleep(1800);
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 84 });
  writeFileSync(path.join(OUT, `${name}.jpg`), Buffer.from(r.result.data, "base64"));
  console.log(name);
}
chrome.kill();
process.exit(0);
