// Artwork for email templates: each piece is HTML/CSS rendered to JPEG.
// Deterministic pseudo-random helpers keep confetti/snow/stars identical between renders.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const scatter = (n, f) => Array.from({ length: n }, (_, i) => f(i, rnd(), rnd(), rnd())).join("");

const confetti = (n, colors) =>
  scatter(n, (i, a, b, c) => `<i style="position:absolute;left:${(a * 100).toFixed(1)}%;top:${(b * 100).toFixed(1)}%;width:${8 + c * 10}px;height:${4 + c * 6}px;background:${colors[i % colors.length]};transform:rotate(${Math.round(c * 360)}deg);border-radius:2px;opacity:${0.6 + c * 0.4}"></i>`);
const dots = (n, color, max = 6) =>
  scatter(n, (i, a, b, c) => `<i style="position:absolute;left:${(a * 100).toFixed(1)}%;top:${(b * 100).toFixed(1)}%;width:${2 + c * max}px;height:${2 + c * max}px;border-radius:50%;background:${color};opacity:${0.35 + c * 0.65}"></i>`);
const stars = (n, color) =>
  scatter(n, (i, a, b, c) => `<b style="position:absolute;left:${(a * 100).toFixed(1)}%;top:${(b * 100).toFixed(1)}%;color:${color};font-size:${10 + c * 22}px;opacity:${0.5 + c * 0.5}">★</b>`);
const burst = (x, y, r, color) =>
  Array.from({ length: 18 }, (_, i) => `<i style="position:absolute;left:${x}px;top:${y}px;width:${r}px;height:3px;background:linear-gradient(90deg,transparent,${color});transform-origin:0 50%;transform:rotate(${i * 20}deg);border-radius:3px"></i>`).join("") +
  `<i style="position:absolute;left:${x - 5}px;top:${y - 4}px;width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 24px ${color}"></i>`;
const center = "display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;position:relative;z-index:2";

export const ART = {
  "black-friday": {
    css: `body{background:#0a0a0a;color:#fff}.stripes{position:absolute;inset:0;background:repeating-linear-gradient(-45deg,transparent 0 38px,rgba(255,255,255,.035) 38px 76px)}
h1{font:400 190px/0.82 'Bebas Neue';letter-spacing:2px}h1 span{color:#facc15}.tag{margin-top:26px;background:#facc15;color:#0a0a0a;font:900 40px Inter;padding:14px 34px;transform:rotate(-2deg);box-shadow:8px 8px 0 #fff}
.glow{position:absolute;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,rgba(250,204,21,.22),transparent 65%);left:250px;top:-60px}`,
    html: `<div class="stripes"></div><div class="glow"></div><div style="${center}"><h1>BLACK<br><span>FRIDAY</span></h1><div class="tag">UP TO 50% OFF</div></div>`,
  },
  "cyber-monday": {
    css: `body{background:linear-gradient(180deg,#0b0420,#1e0b4b 60%,#3b0a6b);color:#fff;overflow:hidden}
.grid{position:absolute;left:-30%;right:-30%;bottom:-40%;height:80%;background-image:linear-gradient(#22d3ee55 2px,transparent 2px),linear-gradient(90deg,#22d3ee55 2px,transparent 2px);background-size:60px 60px;transform:perspective(500px) rotateX(62deg)}
.sun{position:absolute;left:50%;top:44%;width:360px;height:360px;margin-left:-180px;border-radius:50%;background:linear-gradient(#f472b6,#a855f7);opacity:.55;filter:blur(2px)}
h1{font:700 120px/0.9 'Space Grotesk';letter-spacing:-3px;text-shadow:0 0 24px #22d3ee,0 0 60px #a855f7}p{font:500 30px 'Space Grotesk';margin-top:16px;color:#a5f3fc;letter-spacing:6px}`,
    html: `<div class="sun"></div><div class="grid"></div><div style="${center};justify-content:flex-start;padding-top:110px"><h1>CYBER<br>MONDAY</h1><p>ONLINE ONLY · 24 HOURS</p></div>`,
  },
  christmas: {
    css: `body{background:radial-gradient(circle at 50% 30%,#b91c1c,#7f1d1d 70%);color:#fef3c7}
.tree{position:absolute;bottom:0;width:0;height:0;border-left:90px solid transparent;border-right:90px solid transparent;border-bottom:220px solid #14532d}
h1{font:italic 700 118px/1 'Playfair Display';color:#fde68a;text-shadow:0 4px 0 #78350f40}p{font:600 26px Inter;letter-spacing:8px;margin-top:18px;color:#fff}`,
    html: `${dots(140, "#fff", 7)}<div class="tree" style="left:40px;transform:scale(1.2)"></div><div class="tree" style="left:150px;transform:scale(.8);transform-origin:bottom"></div><div class="tree" style="right:60px;transform:scale(1.3)"></div><div class="tree" style="right:190px;transform:scale(.75);transform-origin:bottom"></div>
<div style="${center}"><h1>Merry Christmas</h1><p>GIFTS · JOY · SAVINGS</p></div>`,
  },
  "new-year": {
    css: `body{background:radial-gradient(circle at 50% 120%,#1e3a8a,#020617 70%);color:#fde68a}
h1{font:900 210px/0.85 'Playfair Display';background:linear-gradient(180deg,#fef3c7,#d4a017 60%,#a16207);-webkit-background-clip:text;color:transparent}p{font:400 64px 'Great Vibes';color:#fff;margin-bottom:-6px}`,
    html: `${confetti(120, ["#facc15", "#fde68a", "#fff", "#d4a017"])}${burst(170, 140, 120, "#facc15")}${burst(1030, 170, 110, "#fde68a")}<div style="${center}"><p>Happy New Year</p><h1>2027</h1></div>`,
  },
  valentines: {
    css: `body{background:linear-gradient(135deg,#fff1f2,#fecdd3);color:#9f1239}
.h{position:absolute;width:var(--s);height:var(--s);background:var(--c);transform:rotate(45deg)}.h::before,.h::after{content:"";position:absolute;width:100%;height:100%;border-radius:50%;background:inherit}.h::before{left:-50%}.h::after{top:-50%}
h1{font:400 150px/1 'Great Vibes';color:#be123c}p{font:800 24px Inter;letter-spacing:10px;margin-top:6px}`,
    html: `${scatter(16, (i, a, b, c) => `<i class="h" style="--s:${24 + c * 60}px;--c:${["#fb7185", "#f43f5e", "#fda4af"][i % 3]};left:${(a * 92).toFixed(1)}%;top:${(b * 85).toFixed(1)}%;opacity:${0.5 + c * 0.5}"></i>`)}<div style="${center}"><h1>Be Mine</h1><p>VALENTINE'S DAY</p></div>`,
  },
  "st-patricks": {
    css: `body{background:linear-gradient(160deg,#065f46,#022c22);color:#ecfccb}
.c{position:absolute;width:var(--s);height:var(--s)}.c i{position:absolute;width:50%;height:50%;border-radius:50% 50% 50% 0;background:#4ade80}
.c i:nth-child(1){left:0;top:0;transform:rotate(-45deg)}.c i:nth-child(2){right:0;top:0;transform:rotate(45deg)}.c i:nth-child(3){left:0;bottom:0;transform:rotate(-135deg)}.c i:nth-child(4){right:0;bottom:0;transform:rotate(135deg)}
h1{font:400 160px/0.9 'Bebas Neue';color:#fde047;letter-spacing:4px}p{font:700 28px Inter;letter-spacing:6px}`,
    html: `${scatter(9, (i, a, b, c) => `<span class="c" style="--s:${50 + c * 70}px;left:${(a * 90).toFixed(1)}%;top:${(b * 80).toFixed(1)}%;opacity:${0.35 + c * 0.5};transform:rotate(${Math.round(c * 90)}deg)"><i></i><i></i><i></i><i></i></span>`)}<div style="${center}"><h1>Lucky Deals</h1><p>ST. PATRICK'S DAY · 17% OFF</p></div>`,
  },
  easter: {
    css: `body{background:linear-gradient(180deg,#fef9c3,#e0f2fe);color:#6d28d9}
.egg{position:absolute;bottom:40px;width:var(--w);height:calc(var(--w)*1.3);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:repeating-linear-gradient(180deg,var(--a) 0 22px,var(--b) 22px 36px);box-shadow:inset -10px -14px 0 #0000001a}
h1{font:italic 700 120px/1 'DM Serif Display';color:#7c3aed}p{font:600 24px Inter;letter-spacing:6px;color:#0369a1;margin-top:10px}`,
    html: `<i class="egg" style="--w:130px;--a:#f9a8d4;--b:#fde68a;left:70px"></i><i class="egg" style="--w:100px;--a:#a5f3fc;--b:#c4b5fd;left:210px"></i><i class="egg" style="--w:120px;--a:#bbf7d0;--b:#fbcfe8;right:220px"></i><i class="egg" style="--w:150px;--a:#c4b5fd;--b:#fef08a;right:60px"></i>
<div style="${center};justify-content:flex-start;padding-top:120px"><h1>Happy Easter</h1><p>A BASKET FULL OF OFFERS</p></div>`,
  },
  "mothers-day": {
    css: `body{background:#fdf2f8;color:#831843}.f{position:absolute;width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle,#fde68a 0 18%,var(--c) 19% 100%);box-shadow:0 0 0 calc(var(--s)*.12) var(--c2)}
h1{font:400 92px/1.05 'DM Serif Display';color:#9d174d}h1 em{font-family:'Great Vibes';font-size:120px;color:#db2777}p{font:600 22px Inter;letter-spacing:7px;margin-top:16px}`,
    html: `${scatter(14, (i, a, b, c) => `<i class="f" style="--s:${40 + c * 90}px;--c:${["#f9a8d4", "#fbcfe8", "#f472b6"][i % 3]};--c2:${["#fce7f3", "#fdf2f8", "#fbcfe8"][i % 3]};left:${(a * 95).toFixed(1)}%;top:${(b * 90).toFixed(1)}%;opacity:${i % 2 ? 0.9 : 0.55}"></i>`)}<div style="${center}"><h1>For <em>Mom</em>,<br>with love</h1><p>MOTHER'S DAY</p></div>`,
  },
  "memorial-day": {
    css: `body{background:#0b1f44;color:#fff}.st{position:absolute;inset:0 0 auto 0;height:100%;background:repeating-linear-gradient(180deg,#b91c1c 0 46px,#f8fafc 46px 92px);clip-path:polygon(62% 0,100% 0,100% 100%,52% 100%);opacity:.9}
h1{font:400 128px/0.9 'Bebas Neue';letter-spacing:3px}p{font:600 24px Inter;letter-spacing:6px;margin-top:14px;color:#cbd5e1}`,
    html: `<div class="st"></div>${stars(40, "#fff")}<div style="${center};align-items:flex-start;padding-left:90px;text-align:left"><h1>Honor &amp;<br>Remember</h1><p>MEMORIAL DAY</p></div>`,
  },
  "fathers-day": {
    css: `body{background:linear-gradient(135deg,#1e293b,#0f172a);color:#f8fafc}.tie{position:absolute;right:140px;top:70px;width:120px;height:400px;background:repeating-linear-gradient(-35deg,#2563eb 0 22px,#1d4ed8 22px 44px);clip-path:polygon(35% 0,65% 0,70% 12%,58% 18%,85% 85%,50% 100%,15% 85%,42% 18%,30% 12%)}
h1{font:900 112px/0.95 Inter;letter-spacing:-4px}h1 span{color:#60a5fa}p{font:600 24px Inter;margin-top:18px;color:#94a3b8;letter-spacing:5px}`,
    html: `<div class="tie"></div><div style="${center};align-items:flex-start;padding-left:90px;text-align:left"><h1>Gifts<br>for <span>Dad</span></h1><p>FATHER'S DAY · JUNE 20</p></div>`,
  },
  "fourth-of-july": {
    css: `body{background:radial-gradient(circle at 50% 100%,#1e3a8a,#020617 75%);color:#fff}
h1{font:400 150px/0.9 'Bebas Neue';letter-spacing:4px}h1 span{color:#ef4444}p{font:700 26px Inter;letter-spacing:8px;margin-top:10px;color:#93c5fd}`,
    html: `${burst(220, 150, 140, "#ef4444")}${burst(980, 130, 130, "#ffffff")}${burst(620, 70, 90, "#60a5fa")}${burst(120, 430, 80, "#ffffff")}${burst(1080, 440, 90, "#ef4444")}<div style="${center}"><h1>Happy <span>4th</span><br>of July</h1><p>STARS · STRIPES · SAVINGS</p></div>`,
  },
  "labor-day": {
    css: `body{background:linear-gradient(180deg,#f97316,#fb923c 40%,#fde68a);color:#431407}.sun{position:absolute;left:50%;bottom:-260px;width:620px;height:620px;margin-left:-310px;border-radius:50%;background:#fff7ed;opacity:.55}
.hills{position:absolute;bottom:0;left:0;right:0;height:160px;background:#7c2d12;clip-path:polygon(0 60%,20% 30%,40% 55%,60% 20%,80% 50%,100% 25%,100% 100%,0 100%)}
h1{font:400 150px/0.9 'Bebas Neue';color:#431407;letter-spacing:3px}p{font:800 26px Inter;letter-spacing:6px}`,
    html: `<div class="sun"></div><div class="hills"></div><div style="${center};justify-content:flex-start;padding-top:110px"><h1>Labor Day Sale</h1><p>LAST CALL FOR SUMMER</p></div>`,
  },
  halloween: {
    css: `body{background:radial-gradient(circle at 78% 22%,#fef3c7 0 70px,#1c1917 71px);color:#fb923c}
.p{position:absolute;bottom:50px;width:var(--w);height:calc(var(--w)*.8);border-radius:50%;background:repeating-linear-gradient(90deg,#ea580c 0 18%,#f97316 18% 33%);box-shadow:inset -12px -10px 0 #9a3412}.p::after{content:"";position:absolute;left:46%;top:-14%;width:10%;height:22%;background:#14532d;border-radius:4px}
h1{font:400 160px/0.88 'Bebas Neue';color:#fb923c;letter-spacing:4px;text-shadow:0 0 30px #ea580c88}p{font:700 24px Inter;letter-spacing:8px;color:#e7e5e4}`,
    html: `<i class="p" style="--w:170px;left:70px"></i><i class="p" style="--w:120px;left:250px"></i><i class="p" style="--w:150px;right:90px"></i>${dots(40, "#fef3c7", 3)}<div style="${center};align-items:flex-start;padding-left:430px;text-align:left;justify-content:flex-start;padding-top:120px"><h1>Spooky<br>Savings</h1><p>HALLOWEEN</p></div>`,
  },
  thanksgiving: {
    css: `body{background:linear-gradient(160deg,#fff7ed,#fed7aa);color:#7c2d12}.l{position:absolute;width:var(--s);height:var(--s);background:var(--c);border-radius:0 70% 0 70%;transform:rotate(var(--r))}
h1{font:italic 700 120px/1 'Playfair Display';color:#9a3412}p{font:600 24px Inter;letter-spacing:7px;margin-top:16px;color:#c2410c}`,
    html: `${scatter(26, (i, a, b, c) => `<i class="l" style="--s:${24 + c * 46}px;--c:${["#ea580c", "#b45309", "#dc2626", "#ca8a04"][i % 4]};--r:${Math.round(c * 360)}deg;left:${(a * 96).toFixed(1)}%;top:${(b * 92).toFixed(1)}%;opacity:${0.45 + c * 0.5}"></i>`)}<div style="${center}"><h1>Give Thanks</h1><p>THANKSGIVING · GRATEFUL FOR YOU</p></div>`,
  },
  restaurant: {
    css: `body{background:#14281d;color:#f5f5f4}.plate{position:absolute;right:110px;top:90px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,#fafaf9 0 52%,#e7e5e4 53% 62%,#fafaf9 63%);box-shadow:0 30px 60px #0008}
.food{position:absolute;right:210px;top:190px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#84cc16 0 18%,transparent 19%),radial-gradient(circle at 65% 40%,#dc2626 0 14%,transparent 15%),radial-gradient(circle at 50% 65%,#f59e0b 0 22%,transparent 23%),radial-gradient(circle,#a16207 0 60%,transparent 61%)}
h1{font:italic 400 96px/1 'DM Serif Display';color:#fef3c7}p{font:600 22px Inter;letter-spacing:6px;margin-top:16px;color:#a8a29e}`,
    html: `<div class="plate"></div><div class="food"></div><div style="${center};align-items:flex-start;padding-left:90px;text-align:left"><h1>Tonight's<br>Menu</h1><p>CHEF'S SPECIALS</p></div>`,
  },
  "real-estate": {
    css: `body{background:linear-gradient(180deg,#bae6fd,#e0f2fe 60%,#86efac 60%,#4ade80);color:#0f172a}
.house{position:absolute;right:170px;bottom:120px;width:380px;height:220px;background:#f8fafc;box-shadow:0 20px 40px #0003}.roof{position:absolute;right:140px;bottom:340px;width:0;height:0;border-left:220px solid transparent;border-right:220px solid transparent;border-bottom:130px solid #334155}
.door{position:absolute;right:330px;bottom:120px;width:60px;height:110px;background:#92400e}.win{position:absolute;bottom:230px;width:70px;height:60px;background:#7dd3fc;border:6px solid #e2e8f0}
.tag{position:absolute;left:90px;top:70px;background:#0f172a;color:#fff;font:800 22px Inter;letter-spacing:5px;padding:12px 20px}h1{font:900 96px/0.95 Inter;letter-spacing:-3px}p{font:600 26px Inter;margin-top:14px}`,
    html: `<div class="roof"></div><div class="house"></div><div class="door"></div><div class="win" style="right:200px"></div><div class="win" style="right:440px"></div><div class="tag">JUST LISTED</div><div style="${center};align-items:flex-start;padding-left:90px;text-align:left;padding-top:40px"><h1>Your next<br>home</h1><p>3 bd · 2 ba · $649,000</p></div>`,
  },
  fitness: {
    css: `body{background:#0a0a0a;color:#fff;overflow:hidden}.slash{position:absolute;right:-100px;top:-50px;width:620px;height:800px;background:#bef264;transform:rotate(14deg)}
h1{font:400 170px/0.82 'Bebas Neue';letter-spacing:2px}h1 span{color:#bef264}p{font:800 24px Inter;letter-spacing:6px;margin-top:20px;color:#a3a3a3}.big{position:absolute;right:60px;top:110px;font:400 380px/1 'Bebas Neue';color:#0a0a0a}`,
    html: `<div class="slash"></div><div class="big">GO</div><div style="${center};align-items:flex-start;padding-left:80px;text-align:left"><h1>NEW<br><span>CLASSES</span></h1><p>HIIT · YOGA · STRENGTH</p></div>`,
  },
  "saas-update": {
    css: `body{background:#fafafa;background-image:radial-gradient(#d4d4d8 1px,transparent 1px);background-size:22px 22px;color:#18181b}
.ui{position:absolute;right:80px;top:80px;width:520px;height:440px;border-radius:18px;background:#fff;box-shadow:0 40px 80px -20px #0003;border:1px solid #e4e4e7;overflow:hidden}.bar{height:44px;border-bottom:1px solid #e4e4e7;display:flex;gap:8px;align-items:center;padding-left:16px}.bar i{width:12px;height:12px;border-radius:50%;background:#e4e4e7}
.row{margin:18px 22px;height:16px;border-radius:8px;background:#f4f4f5}.row.a{width:60%;background:#18181b}.chart{margin:24px 22px;height:180px;display:flex;align-items:flex-end;gap:14px;padding:0 6px;border-bottom:2px solid #e4e4e7}.chart b{flex:1;border-radius:6px 6px 0 0;background:#d4d4d8}.chart b.on{background:#18181b}
h1{font:800 84px/1 Inter;letter-spacing:-3px}.pill{display:inline-block;background:#18181b;color:#fff;font:700 18px Inter;padding:8px 16px;border-radius:999px;margin-bottom:22px}`,
    html: `<div class="ui"><div class="bar"><i></i><i></i><i></i></div><div class="row a"></div><div class="row"></div><div class="chart">${[38, 52, 46, 64, 58, 76, 70, 92].map((h, i) => `<b class="${i > 5 ? "on" : ""}" style="height:${h}%"></b>`).join("")}</div><div class="row" style="width:40%"></div></div><div style="${center};align-items:flex-start;padding-left:80px;text-align:left"><span class="pill">NEW · v2.0</span><h1>What's<br>new this<br>month</h1></div>`,
  },
  webinar: {
    css: `body{background:linear-gradient(135deg,#4c1d95,#1e1b4b);color:#fff}.screen{position:absolute;right:90px;top:110px;width:460px;height:290px;border-radius:16px;background:#0f0a2a;border:10px solid #312e81;box-shadow:0 30px 60px #0007}
.screen::after{content:"";position:absolute;left:50%;top:50%;margin:-34px 0 0 -26px;border-left:62px solid #c4b5fd;border-top:36px solid transparent;border-bottom:36px solid transparent}.live{position:absolute;right:120px;top:140px;background:#ef4444;font:800 16px Inter;padding:5px 12px;border-radius:6px;z-index:3}
h1{font:800 92px/0.98 Inter;letter-spacing:-3px}p{font:600 24px Inter;margin-top:18px;color:#c4b5fd}`,
    html: `<div class="screen"></div><div class="live">● LIVE</div><div style="${center};align-items:flex-start;padding-left:80px;text-align:left"><h1>Free live<br>webinar</h1><p>Thursday · 2 PM ET</p></div>`,
  },
  review: {
    css: `body{background:#fffbeb;color:#18181b}.stars{font-size:110px;letter-spacing:10px;color:#f59e0b;text-shadow:0 6px 0 #b4530933}h1{font:800 86px/1 Inter;letter-spacing:-3px;margin-top:10px}p{font:500 26px Inter;color:#78716c;margin-top:14px}`,
    html: `<div style="${center}"><div class="stars">★★★★★</div><h1>How did we do?</h1><p>It takes 30 seconds and helps a lot.</p></div>`,
  },
  birthday: {
    css: `body{background:linear-gradient(135deg,#fdf4ff,#e0e7ff);color:#3730a3}.gift{position:absolute;right:150px;bottom:110px;width:280px;height:230px;background:#6366f1;border-radius:10px}.gift::before{content:"";position:absolute;left:115px;top:-50px;width:50px;height:280px;background:#f472b6}
.lid{position:absolute;right:130px;bottom:330px;width:320px;height:60px;background:#818cf8;border-radius:10px}.bow{position:absolute;right:240px;bottom:380px;width:100px;height:60px;border-radius:50%;border:16px solid #f472b6}
h1{font:400 120px/1 'Great Vibes';color:#4f46e5}p{font:800 26px Inter;letter-spacing:6px;color:#db2777}`,
    html: `${confetti(80, ["#f472b6", "#818cf8", "#facc15", "#34d399"])}<div class="gift"></div><div class="lid"></div><div class="bow"></div><div style="${center};align-items:flex-start;padding-left:90px;text-align:left"><h1>Happy<br>Birthday!</h1><p>A GIFT INSIDE</p></div>`,
  },
  shipped: {
    css: `body{background:#f4f4f5;color:#18181b}.box{position:absolute;right:150px;top:150px;width:300px;height:240px;background:#d6a76c;border-radius:6px;box-shadow:0 30px 50px -10px #0004}.box::before{content:"";position:absolute;left:125px;top:0;width:50px;height:100%;background:#c49256}
.lid{position:absolute;right:140px;top:110px;width:320px;height:60px;background:#e0b67f;border-radius:6px}.road{position:absolute;left:0;right:0;bottom:70px;height:4px;background:repeating-linear-gradient(90deg,#a1a1aa 0 40px,transparent 40px 70px)}
h1{font:800 96px/0.98 Inter;letter-spacing:-3px}p{font:600 26px Inter;margin-top:16px;color:#71717a}`,
    html: `<div class="road"></div><div class="box"></div><div class="lid"></div><div style="${center};align-items:flex-start;padding-left:90px;text-align:left"><h1>It's on<br>its way!</h1><p>Arriving in 2–4 days</p></div>`,
  },
  // Square product shots (800×800) used inside image+text blocks.
  "product-bottle": {
    size: [800, 800],
    css: `body{background:radial-gradient(circle at 50% 40%,#fafaf9,#e7e5e4)}.b{position:absolute;left:310px;top:150px;width:180px;height:470px;border-radius:40px 40px 30px 30px;background:linear-gradient(90deg,#1c1917,#44403c 45%,#1c1917)}.cap{position:absolute;left:350px;top:90px;width:100px;height:80px;border-radius:12px;background:#a8a29e}
.lab{position:absolute;left:330px;top:330px;width:140px;height:160px;background:#f5f5f4;border-radius:6px;font:800 26px Inter;color:#1c1917;display:grid;place-items:center;letter-spacing:3px}.sh{position:absolute;left:250px;top:630px;width:300px;height:30px;border-radius:50%;background:#0002;filter:blur(6px)}`,
    html: `<div class="sh"></div><div class="cap"></div><div class="b"></div><div class="lab">BRAND</div>`,
  },
  "product-bag": {
    size: [800, 800],
    css: `body{background:radial-gradient(circle at 50% 40%,#fdf2f8,#fbcfe8)}.bag{position:absolute;left:220px;top:250px;width:360px;height:380px;border-radius:24px;background:linear-gradient(160deg,#be185d,#831843)}.h{position:absolute;left:310px;top:150px;width:180px;height:180px;border-radius:50%;border:22px solid #9d174d;clip-path:inset(0 0 45% 0)}
.sh{position:absolute;left:200px;top:640px;width:400px;height:30px;border-radius:50%;background:#0002;filter:blur(6px)}.t{position:absolute;left:220px;top:400px;width:360px;text-align:center;font:400 46px 'DM Serif Display';color:#fdf2f8}`,
    html: `<div class="sh"></div><div class="h"></div><div class="bag"></div><div class="t">New Season</div>`,
  },
  "product-box": {
    size: [800, 800],
    css: `body{background:radial-gradient(circle at 50% 40%,#f8fafc,#e2e8f0)}.f{position:absolute;left:220px;top:290px;width:360px;height:320px;background:linear-gradient(90deg,#0f172a,#1e293b)}.t{position:absolute;left:220px;top:210px;width:360px;height:90px;background:#334155;transform:skewX(-20deg);transform-origin:bottom}
.r{position:absolute;left:380px;top:210px;width:40px;height:400px;background:#eab308}.sh{position:absolute;left:200px;top:620px;width:420px;height:30px;border-radius:50%;background:#0002;filter:blur(6px)}`,
    html: `<div class="sh"></div><div class="f"></div><div class="t"></div><div class="r"></div>`,
  },
};
