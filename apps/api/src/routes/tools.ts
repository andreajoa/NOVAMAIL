// Pre-send check (also used by agents over MCP): content + sender-domain authentication.
import { preflight } from "@novamail/email";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { errors, zodMessage } from "../lib/http";

export const tools = new Hono<AppEnv>();

tools.post("/preflight", async (c) => {
  const p = c.get("principal");
  const b = z.object({ subject: z.string().max(998).default(""), preheader: z.string().max(500).optional(), html: z.string().max(2_000_000).optional(), template_id: z.string().max(64).optional(), from: z.string().max(320).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) throw errors.validation(zodMessage(b.error));
  let { subject, html } = b.data;
  if (b.data.template_id) {
    const t = await c.env.DB.prepare("SELECT subject, html FROM templates WHERE id = ? AND account_id = ?").bind(b.data.template_id, p.accountId).first<{ subject: string; html: string }>();
    if (!t) throw errors.notFound("Template");
    subject ||= t.subject;
    html ??= t.html;
  }
  const r = preflight({ subject, preheader: b.data.preheader, html: html ?? "", from: b.data.from });
  const domain = (b.data.from?.match(/<([^>]+)>/)?.[1] ?? b.data.from)?.split("@")[1]?.toLowerCase();
  if (domain) {
    const doms = await c.env.DB.prepare("SELECT name, status, checks FROM domains WHERE account_id = ?").bind(p.accountId).all<{ name: string; status: string; checks: string }>();
    const d = doms.results.find((x) => domain === x.name || domain.endsWith(`.${x.name}`));
    if (!d || d.status !== "verified") r.findings.unshift({ id: "domain_unverified", severity: "error", area: "sender", message: `${domain} is not a verified sending domain.`, fix: "Add it under Domains and publish the DNS records." });
    else {
      const checks = JSON.parse(d.checks || "{}") as Record<string, string | null>;
      if (checks.dmarc && checks.dmarc !== "OK") r.findings.push({ id: "dmarc_missing", severity: "warning", area: "sender", message: `No DMARC record on ${d.name}.`, fix: "Gmail and Yahoo require DMARC for bulk senders: add v=DMARC1; p=none (then tighten)." });
    }
    r.score = Math.max(0, 100 - r.findings.reduce((s, x) => s + ({ error: 22, warning: 9, tip: 2 } as const)[x.severity], 0));
  }
  return c.json({ object: "preflight", ...r });
});
