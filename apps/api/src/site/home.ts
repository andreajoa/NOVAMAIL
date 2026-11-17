// Home page: a narrative where each section answers the question the previous one raises.
// Animations are CSS-only (no JS, CSP-safe): load-in stagger, a live-looking inbox, a flowing funnel
// line, and scroll-driven reveals (animation-timeline: view()) with a static fallback.
// Everything is disabled under prefers-reduced-motion.
import { API_DOCS, esc } from "./layout";

export const HOME_CSS = `
.h-grid>*,.two>*,.steps>*,.big>*{min-width:0}pre{max-width:100%}main{overflow-x:clip}
:root{--accent:#2563eb;--accent-soft:#dbeafe;--ok:#059669}
@media(prefers-color-scheme:dark){:root{--accent:#60a5fa;--accent-soft:#172554;--ok:#34d399}}
.h-grid{display:grid;gap:48px;align-items:center;padding:48px 0 24px}@media(min-width:960px){.h-grid{grid-template-columns:1.05fr .95fr;padding:72px 0 40px}}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:6px 12px;border-radius:999px;margin-bottom:22px}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:pulse 2s ease-in-out infinite}
.h-title{font-size:clamp(38px,6.4vw,68px);line-height:1.02;letter-spacing:-.035em;margin:0 0 22px;font-weight:720}
.h-title em{font-style:normal;background:linear-gradient(90deg,var(--accent),#7c3aed 60%,var(--accent));background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shine 6s linear infinite}
.h-lead{font-size:clamp(17px,2.1vw,20px);color:var(--mut);max-width:560px;margin:0 0 30px}
.h-proof{display:flex;flex-wrap:wrap;gap:18px;margin-top:26px;font-size:14px;color:var(--mut)}.h-proof span::before{content:"✓";color:var(--ok);font-weight:700;margin-right:6px}
.in{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.2,1) forwards}.d1{animation-delay:.08s}.d2{animation-delay:.18s}.d3{animation-delay:.3s}.d4{animation-delay:.42s}
.inbox{position:relative;background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:0 30px 80px -30px rgba(15,23,42,.35);padding:18px 18px 34px}
.inbox-top{display:flex;align-items:center;gap:6px;padding:2px 4px 14px;border-bottom:1px solid var(--line);margin-bottom:10px}.inbox-top b{margin-left:8px;font-size:14px}.dot{width:10px;height:10px;border-radius:50%;background:var(--line)}
.mail{display:grid;grid-template-columns:38px 1fr auto;gap:12px;align-items:center;padding:12px 10px;border-radius:12px;opacity:0;transform:translateY(14px);animation:mailin .7s cubic-bezier(.2,.7,.2,1) forwards}
.mail+.mail{border-top:1px solid var(--line)}.mail:nth-child(2){animation-delay:.6s}.mail:nth-child(3){animation-delay:1.3s}.mail:nth-child(4){animation-delay:2s}.mail:nth-child(5){animation-delay:2.7s}
.av{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:15px}
.mail p{margin:0;font-size:14px;color:var(--fg);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mail small{display:block;color:var(--mut);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-size:11.5px;font-weight:650;color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent);padding:4px 8px;border-radius:999px;white-space:nowrap}
.float{position:absolute;left:-22px;bottom:-22px;background:var(--fg);color:var(--bg);border-radius:14px;padding:12px 16px;font-size:13px;box-shadow:0 16px 40px -12px rgba(0,0,0,.4);opacity:0;animation:pop .6s 3.4s cubic-bezier(.2,.9,.3,1.3) forwards}
.float b{display:block;font-size:22px;letter-spacing:-.02em}
.band{border:1px solid var(--line);border-radius:24px;background:var(--card);margin:40px 0;padding:0 clamp(20px,4vw,48px)}
.story{padding:72px 0}.story .k{font-size:13px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
.story h2{font-size:clamp(28px,4.2vw,44px);line-height:1.08;letter-spacing:-.03em;margin:0 0 16px;max-width:760px}.story .sub{font-size:18px;color:var(--mut);max-width:640px;margin:0 0 36px}
.big{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.big div{border:1px solid var(--line);border-radius:16px;padding:22px;background:var(--bg)}.big b{display:block;font-size:40px;letter-spacing:-.03em;line-height:1}.big span{color:var(--mut);font-size:15px}
.steps{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));counter-reset:s}.steps div{position:relative;border:1px solid var(--line);border-radius:16px;padding:24px;background:var(--card)}
.steps div::before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--fg);color:var(--bg);font-weight:700;margin-bottom:14px}.steps h3{margin:0 0 6px;font-size:18px}.steps p{margin:0}
.two{display:grid;gap:40px;align-items:center}@media(min-width:900px){.two{grid-template-columns:1fr 1fr}}
.ed{border:1px solid var(--line);border-radius:18px;background:var(--card);display:grid;grid-template-columns:110px 1fr;overflow:hidden;box-shadow:0 24px 60px -30px rgba(15,23,42,.3)}
.ed-pal{border-right:1px solid var(--line);padding:12px;display:grid;gap:8px;align-content:start}.ed-pal span{font-size:12px;border:1px solid var(--line);border-radius:8px;padding:7px 8px;color:var(--mut)}
.ed-pal span.drag{color:var(--fg);border-color:var(--accent);animation:dragit 4s ease-in-out infinite}
.ed-can{padding:16px;background:var(--bg);display:grid;gap:10px}.ed-can .blk{border-radius:10px;background:var(--card);border:1px solid var(--line);padding:12px}
.ed-can .hero-img{height:92px;border-radius:10px;background:linear-gradient(120deg,#c7d2fe,#fbcfe8,#fde68a);background-size:200% 200%;animation:grad 6s ease infinite}
.ed-can .l{height:10px;border-radius:6px;background:var(--line);margin:6px 0}.ed-can .l.s{width:60%}.ed-can .btnm{display:inline-block;background:var(--fg);color:var(--bg);font-size:12px;font-weight:600;padding:7px 12px;border-radius:8px}
.ed-can .drop{border:2px dashed var(--accent);border-radius:10px;height:0;opacity:0;animation:dropz 4s ease-in-out infinite}
ul.ticks{list-style:none;padding:0;margin:0;display:grid;gap:12px}ul.ticks li{padding-left:30px;position:relative;color:var(--mut)}ul.ticks li strong{color:var(--fg)}ul.ticks li::before{content:"✓";position:absolute;left:0;top:0;width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:12px;background:var(--accent-soft);color:var(--accent);font-weight:700}
.funnel svg{width:100%;height:auto;max-width:880px;display:block;margin:0 auto}.flow{stroke:var(--accent);stroke-width:3;fill:none;stroke-dasharray:8 10;animation:flow 1.2s linear infinite}
.node rect{fill:var(--card);stroke:var(--line)}.node text{fill:var(--fg);font:600 15px ui-sans-serif,system-ui,-apple-system,sans-serif}.node .t2{fill:var(--mut);font-weight:400;font-size:13px}.node.acc rect{stroke:var(--accent);stroke-width:2}
.pkt{fill:var(--accent);animation:travel 4s linear infinite}
.seals{display:flex;flex-wrap:wrap;gap:12px}.seal{display:flex;align-items:center;gap:10px;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:14px 16px;font-weight:600}.seal i{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok);font-style:normal}
.final{text-align:center;padding:88px 0 40px}.final h2{margin-left:auto;margin-right:auto}.final .sub{margin-left:auto;margin-right:auto}.final .cta{justify-content:center}
.reveal{opacity:1}
@supports (animation-timeline: view()){.reveal{animation:rise linear both;animation-timeline:view();animation-range:entry 5% cover 28%}}
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes mailin{to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.85) translateY(10px)}to{opacity:1;transform:none}}
@keyframes pulse{50%{opacity:.35}}
@keyframes shine{to{background-position:200% center}}
@keyframes grad{50%{background-position:100% 50%}}
@keyframes flow{to{stroke-dashoffset:-36}}
@keyframes dragit{0%,15%{transform:none}45%,60%{transform:translate(140px,64px) rotate(-2deg);box-shadow:0 10px 24px -8px rgba(0,0,0,.3)}80%,100%{transform:none}}
@keyframes dropz{0%,35%{height:0;opacity:0}45%,62%{height:34px;opacity:1}75%,100%{height:0;opacity:0}}
@keyframes travel{0%{transform:translateX(0);opacity:0}6%{opacity:1}94%{opacity:1}100%{transform:translateX(720px);opacity:0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important}.in,.mail,.float{opacity:1;transform:none}.ed-can .drop{display:none}}
`;

type Copy = {
  eyebrow: string; title: [string, string, string]; lead: string; cta: string; cta2: string; proof: string[];
  inbox: string; mails: [string, string, string, string][]; float: [string, string];
  p_k: string; p_h: string; p_sub: string; stats: [string, string][];
  how_k: string; how_h: string; how_sub: string; steps: [string, string][];
  ed_k: string; ed_h: string; ed_sub: string; ed_list: [string, string][]; pal: string[];
  fn_k: string; fn_h: string; fn_sub: string; fn_nodes: [string, string][];
  dl_k: string; dl_h: string; dl_sub: string; seals: string[];
  dev_k: string; dev_h: string; dev_sub: string; dev_list: [string, string][];
  pr_k: string; pr_h: string; plans: [string, string, string, string][]; pr_note: string;
  fin_h: string; fin_sub: string;
};

const EN: Copy = {
  eyebrow: "Free plan · no credit card",
  title: ["Turn your customer list into ", "sales", " — with emails that reach the inbox."],
  lead: "NovaMail lets any business send beautiful newsletters, promotions and automatic follow-ups from its own domain. Pick a template, import your customers, press send.",
  cta: "Start free",
  cta2: "See how it works",
  proof: ["3,000 emails/month free", "Drag-and-drop editor", "One-click unsubscribe built in"],
  inbox: "Inbox",
  mails: [
    ["Y", "Your Store", "20% off ends tonight, Ana", "#dc2626"],
    ["Y", "Your Store", "Welcome aboard — here's your gift", "#2563eb"],
    ["Y", "Your Store", "You left something in your cart", "#059669"],
    ["Y", "Your Store", "New collection just dropped", "#7c3aed"],
  ],
  float: ["Delivered", "4 / 4 in the inbox"],
  p_k: "The opportunity",
  p_h: "Your customers already gave you their email. Most businesses never use it.",
  p_sub: "Social reach goes up and down with the algorithm. An email list is yours: no one can turn it off, and it reaches people who already chose you.",
  stats: [["You own it", "No algorithm decides who sees your message"], ["Repeat sales", "Bring back customers who already bought once"], ["On autopilot", "Welcome, follow-up and win-back emails send themselves"]],
  how_k: "How it works",
  how_h: "From zero to your first campaign in four steps.",
  how_sub: "No designer, no developer, no contract. If you can write an email, you can use NovaMail.",
  steps: [["Create your free account", "Sign in with your email. No password, no card."], ["Connect your domain", "Send as hello@yourbrand.com. We give you the records and check them live."], ["Import your customers", "Paste a list or upload a CSV from your store or spreadsheet."], ["Send your campaign", "Choose a template, write your message, press Send."]],
  ed_k: "Create",
  ed_h: "Emails that look professional — built with your mouse.",
  ed_sub: "Start from a ready-made design or a blank page. Everything you need is one drag away.",
  ed_list: [["8 ready-made templates", "newsletter, sale, launch, welcome, event, abandoned cart, plain text, receipt"], ["Drag, drop, replace", "drop a new photo or GIF on any image to swap it"], ["Video that plays", "your video becomes a looping, silent GIF that works in every inbox"], ["Or paste your HTML", "bring designs from any tool"]],
  pal: ["Heading", "Text", "Image", "Button", "Video"],
  fn_k: "Automate",
  fn_h: "Then let it sell while you sleep.",
  fn_sub: "Funnels send a sequence automatically: someone joins your list, gets the welcome email, and the follow-ups arrive on schedule. Unsubscribers leave on their own.",
  fn_nodes: [["Joins your list", "trigger"], ["Welcome email", "right away"], ["Wait 2 days", ""], ["Best sellers", "email 2"], ["Wait 3 days", ""], ["10% coupon", "email 3"]],
  dl_k: "Deliverability",
  dl_h: "Built so your emails land in the inbox — not in spam.",
  dl_sub: "Gmail, Yahoo and Outlook check these things on every message. NovaMail does all of them for you, on every send.",
  seals: ["SPF", "DKIM 2048-bit", "DMARC", "One-click unsubscribe", "Bounce & complaint protection", "TLS 1.3"],
  dev_k: "For developers & AI",
  dev_h: "Already have an app? Plug it in.",
  dev_sub: "Order confirmations and password resets go through the same platform.",
  dev_list: [["Resend-compatible API", "change only the base URL in your code"], ["SMTP on port 587", "for WordPress, CRMs and any system"], ["Claude Code & Codex", "let your AI agent build templates and funnels safely over MCP"], ["Signed webhooks", "delivered, bounced and complained events"]],
  pr_k: "Pricing",
  pr_h: "Start free. Upgrade when it pays for itself.",
  plans: [["Free", "$0", "3,000 emails/month · 1 domain", ""], ["Pro", "$15/mo", "50,000 emails/month · 10 domains", "or $150/yr — 2 months free"], ["Scale", "$60/mo", "250,000 emails/month · 100 domains", "or $600/yr — 2 months free"]],
  pr_note: "Unlimited contacts on every plan. Need more? Add +50,000 emails for $10/month at checkout.",
  fin_h: "Your next sale is one email away.",
  fin_sub: "Create your free account in under a minute and send your first campaign today.",
};

const PT: Copy = {
  eyebrow: "Plano grátis · sem cartão",
  title: ["Transforme sua lista de clientes em ", "vendas", " — com e-mails que chegam na caixa de entrada."],
  lead: "O NovaMail deixa qualquer empresa enviar newsletters, promoções e acompanhamentos automáticos bonitos, com o próprio domínio. Escolha um modelo, importe seus clientes e envie.",
  cta: "Comece grátis",
  cta2: "Veja como funciona",
  proof: ["3.000 e-mails/mês grátis", "Editor de arrastar e soltar", "Descadastro em 1 clique incluso"],
  inbox: "Caixa de entrada",
  mails: [
    ["S", "Sua Loja", "20% OFF termina hoje, Ana", "#dc2626"],
    ["S", "Sua Loja", "Boas-vindas — tem um presente aqui", "#2563eb"],
    ["S", "Sua Loja", "Você esqueceu algo no carrinho", "#059669"],
    ["S", "Sua Loja", "A nova coleção chegou", "#7c3aed"],
  ],
  float: ["Entregues", "4 / 4 na caixa de entrada"],
  p_k: "A oportunidade",
  p_h: "Seus clientes já te deram o e-mail. A maioria das empresas nunca usa.",
  p_sub: "O alcance nas redes sobe e desce com o algoritmo. A lista de e-mails é sua: ninguém desliga, e ela fala com quem já escolheu você.",
  stats: [["É sua", "Nenhum algoritmo decide quem vê sua mensagem"], ["Venda de novo", "Traga de volta quem já comprou uma vez"], ["No automático", "Boas-vindas, acompanhamento e reativação se enviam sozinhos"]],
  how_k: "Como funciona",
  how_h: "Do zero à primeira campanha em quatro passos.",
  how_sub: "Sem designer, sem programador, sem contrato. Se você sabe escrever um e-mail, sabe usar o NovaMail.",
  steps: [["Crie sua conta grátis", "Entre com seu e-mail. Sem senha e sem cartão."], ["Conecte seu domínio", "Envie como contato@suamarca.com. Mostramos os registros e verificamos na hora."], ["Importe seus clientes", "Cole a lista ou envie um CSV da sua loja ou planilha."], ["Envie sua campanha", "Escolha um modelo, escreva e clique em Enviar."]],
  ed_k: "Crie",
  ed_h: "E-mails com cara profissional — feitos com o mouse.",
  ed_sub: "Comece de um modelo pronto ou de uma página em branco. Tudo a um arrastar de distância.",
  ed_list: [["8 modelos prontos", "newsletter, promoção, lançamento, boas-vindas, evento, carrinho, texto, recibo"], ["Arraste, solte, troque", "solte uma foto ou GIF em cima de qualquer imagem"], ["Vídeo que roda", "seu vídeo vira um GIF em loop, sem som, que funciona em qualquer e-mail"], ["Ou cole seu HTML", "traga designs de qualquer ferramenta"]],
  pal: ["Título", "Texto", "Imagem", "Botão", "Vídeo"],
  fn_k: "Automatize",
  fn_h: "Depois, deixe vendendo enquanto você dorme.",
  fn_sub: "Funis enviam uma sequência sozinhos: a pessoa entra na lista, recebe as boas-vindas e os próximos e-mails chegam no dia certo. Quem se descadastra sai sozinho.",
  fn_nodes: [["Entra na lista", "gatilho"], ["Boas-vindas", "na hora"], ["Espera 2 dias", ""], ["Mais vendidos", "e-mail 2"], ["Espera 3 dias", ""], ["Cupom de 10%", "e-mail 3"]],
  dl_k: "Entregabilidade",
  dl_h: "Feito para cair na caixa de entrada — não no spam.",
  dl_sub: "Gmail, Yahoo e Outlook conferem estes itens em toda mensagem. O NovaMail faz todos por você, em todo envio.",
  seals: ["SPF", "DKIM 2048 bits", "DMARC", "Descadastro em 1 clique", "Proteção contra devoluções e spam", "TLS 1.3"],
  dev_k: "Para quem programa e para a IA",
  dev_h: "Já tem um app? É só conectar.",
  dev_sub: "Confirmações de pedido e recuperação de senha passam pela mesma plataforma.",
  dev_list: [["API compatível com Resend", "troque só a URL base no seu código"], ["SMTP na porta 587", "para WordPress, CRMs e qualquer sistema"], ["Claude Code e Codex", "sua IA monta modelos e funis com segurança via MCP"], ["Webhooks assinados", "entregue, devolvido e reclamação"]],
  pr_k: "Preços",
  pr_h: "Comece grátis. Suba de plano quando já estiver se pagando.",
  plans: [["Free", "US$0", "3.000 e-mails/mês · 1 domínio", ""], ["Pro", "US$15/mês", "50.000 e-mails/mês · 10 domínios", "ou US$150/ano — 2 meses grátis"], ["Scale", "US$60/mês", "250.000 e-mails/mês · 100 domínios", "ou US$600/ano — 2 meses grátis"]],
  pr_note: "Contatos ilimitados em todos os planos. Precisa de mais? Adicione +50.000 e-mails por US$10/mês no checkout.",
  fin_h: "Sua próxima venda está a um e-mail de distância.",
  fin_sub: "Crie sua conta grátis em menos de um minuto e envie sua primeira campanha hoje.",
};

function funnelSvg(nodes: [string, string][]) {
  // Six nodes on a single row (wraps visually via viewBox scaling on small screens).
  const w = 880, y = 40, nw = 128, gap = (w - nodes.length * nw) / (nodes.length - 1);
  const xs = nodes.map((_, i) => i * (nw + gap));
  const lines = xs.slice(0, -1).map((x) => `<path class="flow" d="M${x + nw} ${y + 30} H${x + nw + gap}"/>`).join("");
  const boxes = nodes
    .map(([a, b], i) => {
      const wait = !b;
      return `<g class="node${i === 0 ? " acc" : ""}"><rect x="${xs[i]}" y="${y}" width="${nw}" height="60" rx="14" ${wait ? 'stroke-dasharray="4 4"' : ""}/><text x="${xs[i]! + nw / 2}" y="${y + (b ? 27 : 35)}" text-anchor="middle">${esc(a)}</text>${b ? `<text class="t2" x="${xs[i]! + nw / 2}" y="${y + 46}" text-anchor="middle">${esc(b)}</text>` : ""}</g>`;
    })
    .join("");
  return `<svg viewBox="-4 0 ${w + 8} 140" role="img" aria-label="Email funnel">${lines}<circle class="pkt" cx="${nw}" cy="${y + 30}" r="6"/>${boxes}</svg>`;
}

export function home(lang: "en" | "pt-BR") {
  const c = lang === "en" ? EN : PT;
  const heroHtml = `<section class="h-grid">
<div>
  <div class="eyebrow in"><i></i>${esc(c.eyebrow)}</div>
  <h1 class="h-title in d1">${esc(c.title[0])}<em>${esc(c.title[1])}</em>${esc(c.title[2])}</h1>
  <p class="h-lead in d2">${esc(c.lead)}</p>
  <div class="cta in d3"><a class="btn" href="/login">${esc(c.cta)} →</a><a class="btn g" href="#how">${esc(c.cta2)}</a></div>
  <div class="h-proof in d4">${c.proof.map((p) => `<span>${esc(p)}</span>`).join("")}</div>
</div>
<div class="inbox in d2" aria-hidden="true">
  <div class="inbox-top"><span class="dot"></span><span class="dot"></span><span class="dot"></span><b>${esc(c.inbox)}</b></div>
  ${c.mails.map(([i, from, sub, col]) => `<div class="mail"><div class="av" style="background:${col}">${esc(i)}</div><div><p>${esc(sub)}</p><small>${esc(from)}</small></div><span class="badge">✓ ${lang === "en" ? "Delivered" : "Entregue"}</span></div>`).join("")}
  <div class="float"><b>${esc(c.float[0])}</b>${esc(c.float[1])}</div>
</div>
</section>`;

  const body = `
<section class="story reveal"><p class="k">${esc(c.p_k)}</p><h2>${esc(c.p_h)}</h2><p class="sub">${esc(c.p_sub)}</p>
<div class="big">${c.stats.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div></section>

<section class="story reveal" id="how"><p class="k">${esc(c.how_k)}</p><h2>${esc(c.how_h)}</h2><p class="sub">${esc(c.how_sub)}</p>
<div class="steps">${c.steps.map(([h, p]) => `<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></section>

<section class="story reveal"><div class="two"><div><p class="k">${esc(c.ed_k)}</p><h2>${esc(c.ed_h)}</h2><p class="sub">${esc(c.ed_sub)}</p>
<ul class="ticks">${c.ed_list.map(([b, s]) => `<li><strong>${esc(b)}</strong> — ${esc(s)}</li>`).join("")}</ul></div>
<div class="ed" aria-hidden="true"><div class="ed-pal">${c.pal.map((p, i) => `<span class="${i === 3 ? "drag" : ""}">${esc(p)}</span>`).join("")}</div>
<div class="ed-can"><div class="hero-img"></div><div class="blk"><div class="l"></div><div class="l s"></div></div><div class="drop"></div><div class="blk"><span class="btnm">${lang === "en" ? "Shop now" : "Comprar"}</span></div><div class="blk"><div class="l s"></div></div></div></div></div></section>

<section class="story reveal funnel"><p class="k">${esc(c.fn_k)}</p><h2>${esc(c.fn_h)}</h2><p class="sub">${esc(c.fn_sub)}</p>${funnelSvg(c.fn_nodes)}</section>

<div class="band"><section class="story reveal w" style="padding-left:0;padding-right:0"><p class="k">${esc(c.dl_k)}</p><h2>${esc(c.dl_h)}</h2><p class="sub">${esc(c.dl_sub)}</p>
<div class="seals">${c.seals.map((s) => `<div class="seal"><i>✓</i>${esc(s)}</div>`).join("")}</div></section></div>

<section class="story reveal"><div class="two"><div><p class="k">${esc(c.dev_k)}</p><h2>${esc(c.dev_h)}</h2><p class="sub">${esc(c.dev_sub)}</p>
<ul class="ticks">${c.dev_list.map(([b, s]) => `<li><strong>${esc(b)}</strong> — ${esc(s)}</li>`).join("")}</ul><p style="margin-top:20px"><a href="${API_DOCS}">${lang === "en" ? "API reference" : "Documentação da API"} →</a> · <a href="/ai-agents">Claude Code &amp; Codex →</a></p></div>
<pre><code>${esc(`curl https://api.novamail.nexaclouds.online/emails \\
  -H "Authorization: Bearer nm_..." \\
  -d '{"from":"hello@mail.yourstore.com",
       "to":"customer@example.com",
       "subject":"Your order is confirmed",
       "html":"<p>Thanks!</p>"}'`)}</code></pre></div></section>

<section class="story reveal"><p class="k">${esc(c.pr_k)}</p><h2>${esc(c.pr_h)}</h2>
<div class="steps" style="counter-reset:none">${c.plans.map(([n, p, d, y]) => `<div style="padding-top:22px"><h3>${esc(n)}</h3><p class="price">${esc(p)}</p><p>${esc(d)}</p>${y ? `<p style="color:var(--ok);font-size:14px">${esc(y)}</p>` : ""}</div>`).join("")}</div>
<p style="margin-top:16px">${esc(c.pr_note)}</p></section>`;

  const finale = `<section class="final reveal"><h2 style="font-size:clamp(30px,4.6vw,48px);letter-spacing:-.03em;line-height:1.05;max-width:720px">${esc(c.fin_h)}</h2><p class="sub" style="font-size:18px;color:var(--mut);max-width:560px">${esc(c.fin_sub)}</p><div class="cta"><a class="btn" href="/login">${esc(c.cta)} →</a></div></section>`;
  return { heroHtml, body, finale };
}
