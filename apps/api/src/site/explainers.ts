// Animated explainers (CSS only, black & white): how NovaMail turns a visitor into revenue,
// and why pricing by emails beats pricing by contacts. Respects prefers-reduced-motion.

export const EXPLAIN_CSS = `
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.xp{margin:56px 0;padding:28px;border:1px solid var(--line);border-radius:22px;background:var(--card);overflow:hidden}
.xp h2{margin:0 0 6px}.xp .sub{margin:0 0 26px;color:var(--mut)}
.flow{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding-top:6px}
.flow .rail{position:absolute;left:10%;right:10%;top:34px;height:2px;background:var(--line)}
.flow .rail i{position:absolute;top:-5px;left:0;width:12px;height:12px;border-radius:50%;background:var(--fg);box-shadow:0 0 0 6px color-mix(in srgb,var(--fg) 12%,transparent);animation:xp-run 10s linear infinite}
.flow .st{position:relative;text-align:center;font-size:13px;color:var(--mut)}
.flow .st b{display:block;margin-top:10px;color:var(--fg);font-size:14px}
.flow .ic{position:relative;z-index:1;width:56px;height:56px;margin:6px auto 0;border-radius:16px;border:1px solid var(--line);background:var(--bg);display:grid;place-items:center;font-size:22px;animation:xp-lit 10s linear infinite}
.flow .st:nth-child(3) .ic{animation-delay:2s}.flow .st:nth-child(4) .ic{animation-delay:4s}.flow .st:nth-child(5) .ic{animation-delay:6s}.flow .st:nth-child(6) .ic{animation-delay:8s}
.flow .tag{display:inline-block;margin-top:8px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);font-size:11px;opacity:0;animation:xp-tag 10s linear infinite}
.flow .st:nth-child(3) .tag{animation-delay:2s}.flow .st:nth-child(4) .tag{animation-delay:4s}.flow .st:nth-child(5) .tag{animation-delay:6s}.flow .st:nth-child(6) .tag{animation-delay:8s}
.rev{display:flex;align-items:baseline;justify-content:center;gap:10px;margin-top:26px;font-size:14px;color:var(--mut)}
.rev strong{font-size:34px;letter-spacing:-.02em;color:var(--fg);font-variant-numeric:tabular-nums}
.rev strong{display:inline-flex;align-items:flex-start;line-height:1.2}
.rev .ctr{display:inline-block;height:1.2em;overflow:hidden}
.rev .ctr span{display:block;line-height:1.2em;animation:xp-count 10s steps(1) infinite}
@keyframes xp-run{0%{left:0}100%{left:calc(100% - 12px)}}
@keyframes xp-lit{0%,14%{background:var(--bg);color:var(--fg);transform:none}2%,10%{background:var(--fg);color:var(--bg);transform:scale(1.08)}}
@keyframes xp-tag{0%,1%{opacity:0;transform:translateY(4px)}4%,95%{opacity:1;transform:none}100%{opacity:0}}
@keyframes xp-count{0%{transform:translateY(0)}20%{transform:translateY(-1.2em)}40%{transform:translateY(-2.4em)}60%{transform:translateY(-3.6em)}80%{transform:translateY(-4.8em)}}
.cost{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;align-items:end;height:220px;padding:0 4px;border-bottom:1px solid var(--line)}
.cost .m{display:flex;gap:4px;align-items:end;justify-content:center;height:100%}
.cost .b{width:42%;max-width:34px;border-radius:6px 6px 0 0;transform-origin:bottom;animation:xp-grow 1.1s cubic-bezier(.2,.8,.2,1) both}
@supports (animation-timeline: view()){.cost .b{animation-timeline:view();animation-range:entry 20% cover 45%;animation-delay:0s!important}.cost .m:nth-child(n) .b.c{animation-range:entry 20% cover 45%}}
.cost .b.c{background:repeating-linear-gradient(135deg,var(--mut) 0 2px,transparent 2px 6px);border:1px solid var(--mut)}
.cost .b.n{background:var(--fg)}
.cost .m:nth-child(2) .b{animation-delay:.25s}.cost .m:nth-child(3) .b{animation-delay:.5s}.cost .m:nth-child(4) .b{animation-delay:.75s}.cost .m:nth-child(5) .b{animation-delay:1s}.cost .m:nth-child(6) .b{animation-delay:1.25s}
.cost-x{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;padding:8px 4px 0;font-size:12px;color:var(--mut);text-align:center}
.legend{display:flex;flex-wrap:wrap;gap:18px;margin-top:18px;font-size:13px;color:var(--mut)}
.legend i{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-right:6px}
.legend .c{background:repeating-linear-gradient(135deg,var(--mut) 0 2px,transparent 2px 6px);border:1px solid var(--mut)}.legend .n{background:var(--fg)}
.cost-note{margin-top:14px;font-size:14px}
@keyframes xp-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.cost .b.n{box-shadow:0 0 0 0 color-mix(in srgb,var(--fg) 30%,transparent);animation:xp-grow 1.1s cubic-bezier(.2,.8,.2,1) both,xp-pulse 2.4s 1.4s ease-in-out infinite}
@keyframes xp-pulse{50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--fg) 0%,transparent)}}
@media(max-width:720px){.flow{grid-template-columns:1fr;gap:18px}.flow .rail{left:39px;right:auto;top:20px;bottom:20px;width:2px;height:auto}.flow .rail i{animation-name:xp-down;left:-5px}.flow .st{display:grid;grid-template-columns:72px 1fr;text-align:left;align-items:center}.flow .st b{margin-top:0}.flow .ic{margin:0}.cost{height:170px;gap:8px}.cost-x{gap:8px}}
@keyframes xp-down{0%{top:0}100%{top:calc(100% - 12px)}}
@media(prefers-reduced-motion:reduce){.flow .rail i,.flow .ic,.flow .tag,.rev .ctr span,.cost .b{animation:none!important;opacity:1}.rev .ctr span{transform:translateY(-4.8em)}}
`;

/** Visitor → contact → automation → order, with revenue attributed. */
export function howItWorks() {
  const steps: [string, string, string, string][] = [
    ["◎", "A visitor arrives", "Your store or site", "popup at exit-intent"],
    ["✎", "They subscribe", "Form + double opt-in", "consent recorded"],
    ["◉", "A CRM profile", "Score, tags, timeline", "hot lead"],
    ["✉", "The right message", "Email · SMS · WhatsApp", "sent at their best hour"],
    ["$", "They buy", "Shopify · WooCommerce", "revenue attributed"],
  ];
  return `<section class="xp" aria-label="How NovaMail works">
<h2>How NovaMail turns visitors into sales</h2>
<p class="sub">In NovaMail every step is built in and shares one contact record — so you can see exactly which email made the sale.</p>
<div class="flow"><div class="rail" aria-hidden="true"><i></i></div>
${steps.map(([ic, t, s, tag]) => `<div class="st"><div class="ic" aria-hidden="true">${ic}</div><div><b>${t}</b>${s}<br><span class="tag">${tag}</span></div></div>`).join("")}
</div>
<div class="rev" aria-label="Example: revenue attributed to email grows with every sale">Revenue attributed to email <strong>$<span class="ctr"><span>0<br>129<br>418<br>977<br>1,240<br>1,240</span></span></strong></div>
</section>`;
}

/** List grows every month: contact-priced bills rise, NovaMail's (priced by emails) stays flat. */
export function costChart(name?: string) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const perContact = [30, 42, 56, 70, 86, 100]; // grows with the list (illustrative)
  const nova = [24, 24, 24, 24, 24, 24]; // same sends → same bill
  return `<section class="xp" aria-label="Pricing by emails versus pricing by contacts">
<h2>Your list grows. Your bill shouldn't.</h2>
<p class="sub">Illustration: a list that grows every month and is emailed the same number of times. Pricing by contacts climbs with the list; NovaMail prices by emails sent, so it stays flat — and every feature is already included.</p>
<div class="cost" role="img" aria-label="Six months: contact-based bill rises each month, NovaMail bill stays the same">
${months.map((m, i) => `<div class="m"><span class="b c" style="height:${perContact[i]}%"></span><span class="b n" style="height:${nova[i]}%"></span></div>`).join("")}
</div>
<div class="cost-x" aria-hidden="true">${months.map((m) => `<span>${m}</span>`).join("")}</div>
<div class="legend"><span><i class="c"></i>Priced by number of contacts${name ? ` (how ${name} plans are priced — see their pricing page for amounts)` : ""}</span><span><i class="n"></i>NovaMail — priced by emails sent</span></div>
<p class="cost-note"><strong>Pro is $15/month for 50,000 emails</strong> with unlimited contacts, or $12.50/month billed yearly. <a href="/login">Start free — no card</a>.</p>
<table class="sr-only"><caption>Illustrative relative monthly cost</caption><thead><tr><th>Month</th><th>Priced by contacts</th><th>NovaMail</th></tr></thead><tbody>${months.map((m, i) => `<tr><td>${m}</td><td>${perContact[i]}</td><td>${nova[i]}</td></tr>`).join("")}</tbody></table>
</section>`;
}
