// NovaMail's own lifecycle email: welcome on signup, plan confirmation on payment, and a
// free→paid nurture funnel that runs on NovaMail's own funnel engine (dogfooding).
import { designToText, renderDesign, type Block, type Design } from "@novamail/email";
import type { Env } from "../env";
import { prefixedId } from "./crypto";
import { EXTRA_PACK, planOf, type PlanId } from "./plans";
import { sendSystemEmail } from "./system-mail";

const APP = "https://app.novamail.nexaclouds.online";
const theme = { background: "#f4f4f5", content: "#ffffff", text: "#09090b", muted: "#71717a", accent: "#09090b", font: "System", width: 600, radius: 14 };
const logo: Block = { id: "logo", type: "heading", text: "✉ NovaMail", size: 20 };
const foot = (unsub = true): Block => ({ id: "foot", type: "footer", html: "NovaMail · Email marketing that reaches the inbox", unsubscribe: unsub });
const design = (preheader: string, blocks: Block[], unsub = true): Design => ({ version: 1, preheader, theme, blocks: [logo, ...blocks, foot(unsub)] });
const render = (subject: string, d: Design) => ({ subject, html: renderDesign(d, { title: subject }), text: designToText(d) });

export function welcomeEmail() {
  return render(
    "Welcome to NovaMail — your first campaign in 4 steps",
    design("Here's how to send your first campaign today.", [
      { id: "h", type: "heading", text: "Welcome aboard 👋", size: 32 },
      { id: "t", type: "text", html: "Your account is ready. Set up your domain, contacts, templates and funnels now — when you're ready to send, plans start at <strong>$12/month for 10,000 emails</strong>. Here's the fastest path to your first campaign:" },
      { id: "s", type: "text", html: "<strong>1. Add your domain</strong> — send as hello@yourbrand.com.<br><strong>2. Import your contacts</strong> — paste a list or upload a CSV.<br><strong>3. Pick a template</strong> — 30 ready-made designs, including every US holiday.<br><strong>4. Pick a plan and press send</strong> — and watch opens and clicks in real time." },
      { id: "b", type: "button", text: "Open my dashboard", href: `${APP}/`, full: true },
      { id: "x", type: "text", html: "Questions? Just reply to this email — a human reads every message.", size: 14, color: "#71717a" },
    ], false),
  );
}

export function planEmail(plan: PlanId, interval: string | null, packs: number) {
  const p = planOf(plan);
  if (plan === "free") {
    return render(
      "Your NovaMail subscription ended",
      design("Your subscription ended — your data and contacts are safe.", [
        { id: "h", type: "heading", text: "Your subscription has ended", size: 28 },
        { id: "t", type: "text", html: "Everything you built — contacts, templates, funnels — is still here, but sending is paused. Pick a plan any time to start sending again." },
        { id: "b", type: "button", text: "See plans", href: `${APP}/plan` },
      ], false),
    );
  }
  return render(
    `You're on NovaMail ${p.label} 🎉`,
    design(`Your ${p.label} plan is active — new limits apply now.`, [
      { id: "h", type: "heading", text: `Welcome to ${p.label}`, size: 32 },
      { id: "t", type: "text", html: `Thank you for subscribing${interval === "year" ? " for the year (you pay 10 months and get 12)" : ""}. Your new limits are already active:` },
      { id: "l", type: "text", html: `<strong>${(p.monthly + packs * EXTRA_PACK.monthly).toLocaleString("en-US")}</strong> emails per month<br><strong>${(p.daily + packs * EXTRA_PACK.daily).toLocaleString("en-US")}</strong> emails per day<br><strong>${p.domains}</strong> sending domains` },
      { id: "b", type: "button", text: "Send something great", href: `${APP}/broadcasts`, full: true },
      { id: "x", type: "text", html: "Invoices and card details live in <em>Plan → Manage subscription</em>. Stripe also emails you a receipt.", size: 14, color: "#71717a" },
    ], false),
  );
}

// ---------------------------------------------------------------- nurture funnel (free → paid)

const NURTURE: { key: string; subject: string; design: Design }[] = [
  {
    key: "n1-domain",
    subject: "{{first_name}}, one step makes your emails land in the inbox",
    design: design("Connect your domain in 2 minutes.", [
      { id: "h", type: "heading", text: "Send from your own domain", size: 28 },
      { id: "t", type: "text", html: "Emails from <strong>hello@yourbrand.com</strong> reach the inbox far more often than emails from shared addresses. Add your domain, copy 4 records into your DNS and click Verify — NovaMail checks SPF, DKIM and DMARC live." },
      { id: "b", type: "button", text: "Add my domain", href: `${APP}/domains` },
    ]),
  },
  {
    key: "n2-templates",
    subject: "30 templates ready for your next campaign",
    design: design("Black Friday, Christmas, welcome series and more.", [
      { id: "h", type: "heading", text: "Your next campaign is already designed", size: 28 },
      { id: "i", type: "image", src: `${APP}/tpl/black-friday.jpg`, alt: "Black Friday template", width: 100, radius: 10 },
      { id: "t", type: "text", html: "Pick from 30 ready-made templates — every US holiday plus everyday designs. Click any text to rewrite it, drag a new photo on top of an image to swap it, and send." },
      { id: "b", type: "button", text: "Browse templates", href: `${APP}/templates` },
    ]),
  },
  {
    key: "n3-funnels",
    subject: "Let your emails sell while you sleep",
    design: design("Build an automation by dragging boxes.", [
      { id: "h", type: "heading", text: "Funnels + CRM, built in", size: 28 },
      { id: "t", type: "text", html: "Drag steps onto a canvas — <em>joined list → welcome → wait 2 days → clicked? offer : reminder</em>. Every contact gets a profile with their opens, clicks, tags and score, so you always know who's ready to buy." },
      { id: "b", type: "button", text: "Build my first funnel", href: `${APP}/funnels` },
    ]),
  },
  {
    key: "n4-upgrade",
    subject: "{{first_name}}, start sending from $12/month",
    design: design("Starter: 10,000 emails/month for $12. Yearly: pay 10 months, get 12.", [
      { id: "h", type: "heading", text: "Ready to send?", size: 30 },
      { id: "t", type: "text", html: "Everything you set up is waiting. <strong>Starter</strong> sends <strong>10,000 emails a month for $12</strong>, <strong>Pro</strong> 30,000 for $25 and <strong>Scale</strong> 100,000 for $79 — every feature on every plan. Pay yearly: <strong>10 months for 12</strong>." },
      { id: "b", type: "button", text: "Choose my plan", href: `${APP}/plan`, full: true },
      { id: "x", type: "text", html: "Unlimited contacts on every plan. Cancel any time.", size: 14, color: "#71717a" },
    ]),
  },
];

const AUDIENCE = "NovaMail · Free users"; // name kept: existing audience on the system account (= accounts without a plan)

/** Creates (idempotently) the nurture audience, templates and funnel on the system account. */
export async function setupNurture(env: Env) {
  const acc = env.SYSTEM_ACCOUNT_ID;
  if (!acc || !env.SYSTEM_FROM) throw new Error("system account not configured");
  const now = Date.now();
  let aud = await env.DB.prepare("SELECT id FROM audiences WHERE account_id = ? AND name = ?").bind(acc, AUDIENCE).first<{ id: string }>();
  if (!aud) {
    aud = { id: prefixedId("aud") };
    await env.DB.prepare("INSERT INTO audiences (id, account_id, name, created_at) VALUES (?,?,?,?)").bind(aud.id, acc, AUDIENCE, now).run();
  }
  const tplIds: string[] = [];
  for (const n of NURTURE) {
    const name = `Nurture · ${n.key}`;
    const html = renderDesign(n.design, { title: n.subject });
    const existing = await env.DB.prepare("SELECT id FROM templates WHERE account_id = ? AND name = ?").bind(acc, name).first<{ id: string }>();
    if (existing) {
      await env.DB.prepare("UPDATE templates SET subject = ?, design = ?, html = ?, text = ?, updated_at = ? WHERE id = ?").bind(n.subject, JSON.stringify(n.design), html, designToText(n.design), now, existing.id).run();
      tplIds.push(existing.id);
    } else {
      const id = prefixedId("tpl");
      await env.DB.prepare("INSERT INTO templates (id, account_id, name, subject, design, html, text, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?, 'system', ?, ?)")
        .bind(id, acc, name, n.subject, JSON.stringify(n.design), html, designToText(n.design), now, now)
        .run();
      tplIds.push(id);
    }
  }
  const n = (id: string, type: string, y: number, data: Record<string, unknown> = {}, x = 0) => ({ id, type, x, y, data });
  const e = (from: string, to: string, handle = "next") => ({ id: `${from}-${handle}-${to}`, from, handle, to });
  const graph = {
    version: 1,
    nodes: [
      n("t", "trigger", 0, { kind: "audience", audience_id: aud.id }),
      n("w0", "wait", 140, { minutes: 1440 }), n("m1", "email", 280, { template_id: tplIds[0] }),
      n("w1", "wait", 420, { minutes: 2880 }), n("c1", "condition", 560, { kind: "has_tag", tag: "paid" }), n("end1", "end", 720, {}, -200),
      n("m2", "email", 720, { template_id: tplIds[1] }, 200),
      n("w2", "wait", 860, { minutes: 4320 }, 200), n("c2", "condition", 1000, { kind: "has_tag", tag: "paid" }, 200), n("end2", "end", 1160, {}, 0),
      n("m3", "email", 1160, { template_id: tplIds[2] }, 400),
      n("w3", "wait", 1300, { minutes: 4320 }, 400), n("c3", "condition", 1440, { kind: "has_tag", tag: "paid" }, 400), n("end3", "end", 1600, {}, 200),
      n("m4", "email", 1600, { template_id: tplIds[3] }, 600), n("end4", "end", 1740, {}, 600),
    ],
    edges: [e("t", "w0"), e("w0", "m1"), e("m1", "w1"), e("w1", "c1"), e("c1", "end1", "yes"), e("c1", "m2", "no"), e("m2", "w2"), e("w2", "c2"), e("c2", "end2", "yes"), e("c2", "m3", "no"), e("m3", "w3"), e("w3", "c3"), e("c3", "end3", "yes"), e("c3", "m4", "no"), e("m4", "end4")],
  };
  const f = await env.DB.prepare("SELECT id FROM funnels WHERE account_id = ? AND name = 'NovaMail nurture (free → paid)'").bind(acc).first<{ id: string }>();
  const fid = f?.id ?? prefixedId("fn");
  const replyTo = env.SYSTEM_REPLY_TO ?? null;
  if (f) await env.DB.prepare("UPDATE funnels SET graph = ?, trigger = 'audience', audience_id = ?, reply_to = ?, status = 'active', updated_at = ? WHERE id = ?").bind(JSON.stringify(graph), aud.id, replyTo, now, fid).run();
  else
    await env.DB.prepare("INSERT INTO funnels (id, account_id, name, trigger, audience_id, from_addr, reply_to, status, graph, created_by, created_at, updated_at) VALUES (?,?, 'NovaMail nurture (free → paid)', 'audience', ?, ?, ?, 'active', ?, 'system', ?, ?)")
      .bind(fid, acc, aud.id, env.SYSTEM_FROM, replyTo, JSON.stringify(graph), now, now)
      .run();
  // Backfill: everyone already on the Free plan enters the nurture too.
  const free = await env.DB.prepare("SELECT u.email FROM users u JOIN accounts a ON a.id = u.account_id WHERE a.plan = 'free'").all<{ email: string }>();
  const { uuidv7 } = await import("./crypto");
  for (const u of free.results) await env.DB.prepare("INSERT OR IGNORE INTO contacts (id, account_id, audience_id, email, unsubscribed, created_at) VALUES (?,?,?,?,0,?)").bind(`con_${uuidv7()}`, acc, aud.id, u.email, now).run();
  if (free.results.length) {
    const { onAudienceJoin } = await import("../routes/funnels");
    await onAudienceJoin(env, acc, aud.id, free.results.map((u) => u.email));
  }
  return { audience_id: aud.id, funnel_id: fid, templates: tplIds, backfilled: free.results.length };
}

/** New signup → welcome email now + enter the nurture funnel. */
export async function onSignup(env: Env, email: string) {
  await sendSystemEmail(env, email, welcomeEmail(), "welcome").catch((e) => console.error(JSON.stringify({ level: "error", where: "welcome", message: String(e) })));
  const acc = env.SYSTEM_ACCOUNT_ID;
  if (!acc) return;
  const aud = await env.DB.prepare("SELECT id FROM audiences WHERE account_id = ? AND name = ?").bind(acc, AUDIENCE).first<{ id: string }>();
  if (!aud) return;
  const { uuidv7 } = await import("./crypto");
  await env.DB.prepare("INSERT OR IGNORE INTO contacts (id, account_id, audience_id, email, unsubscribed, created_at) VALUES (?,?,?,?,0,?)").bind(`con_${uuidv7()}`, acc, aud.id, email, Date.now()).run();
  const { onAudienceJoin } = await import("../routes/funnels");
  await onAudienceJoin(env, acc, aud.id, [email]);
}

/** Plan change → confirmation email + tag the customer so the nurture stops. */
export async function onPlanChange(env: Env, accountEmail: string, plan: PlanId, interval: string | null, packs: number, previous: PlanId) {
  await sendSystemEmail(env, accountEmail, planEmail(plan, interval, packs), "billing").catch((e) => console.error(JSON.stringify({ level: "error", where: "plan-email", message: String(e) })));
  if (env.SYSTEM_ACCOUNT_ID && plan !== "free") {
    const { applyTags } = await import("../routes/funnels");
    await applyTags(env, env.SYSTEM_ACCOUNT_ID, accountEmail, ["paid"], []);
  }
}
