"use strict";

/**
 * Shareable slips. Everything a shared link needs travels inside the link.
 *
 * The whole point is that a reader who builds something good can send it to
 * somebody, and what arrives is the slip itself rather than a bare booking
 * code that means nothing until it is pasted into a bookmaker.
 *
 * THE DESIGN CONSTRAINT, and it comes from a real incident. A slip leg in the
 * browser stores `{id, code, p}`, where `id` is the fid() hash of a fixture.
 * On 1 Sep 2026 FK Rostov v CSKA Moscow left the board while it was still
 * being played - SportyBet drops a match at kick-off and it is the only source
 * of cup ties - and every leg pointing at it became unresolvable. A share link
 * keyed on fixture ids would rot exactly the same way: silently, permanently,
 * and on somebody else's post. So a leg here carries its own teams, date,
 * market, odds and probability, and renders with no board at all.
 *
 * Encoding: fields joined by \x1f, legs by \x1e, the lot base64url. Control
 * characters cannot occur in a team name, so no delimiter can be smuggled in -
 * which is the entire class of bug that a "|" separator invites.
 *
 * THE PAYLOAD IS ATTACKER-CONTROLLED. Anyone can craft a link and share it as
 * though this site said it. Everything below therefore validates hard and
 * refuses rather than repairs, and every rendered field goes through esc().
 */

/* Only the escaper and the origin. The page shell here is its own: pages.js
   `staticPage` was written for privacy and terms, and a shared slip wearing it
   looked like a policy document. */
const { esc, ORIGIN } = require("./pages.js");

const FS = "\u001f";   // between fields
const RS = "\u001e";   // between legs

/* Only markets the builders actually offer. An unknown code is a crafted link,
   not a new feature, so it is refused. */
const MARKETS = {
  "1": "Home win", "2": "Away win", "X": "Draw",
  "1X": "Home or draw", "X2": "Draw or away", "12": "Home or away",
  "OVER_1.5": "Over 1.5 goals", "OVER_2.5": "Over 2.5 goals", "OVER_3.5": "Over 3.5 goals",
  "GG": "Both teams to score", "FH_OVER_0.5": "Goal in the first half",
  "HOME_OVER_0.5": "Home to score", "AWAY_OVER_0.5": "Away to score",
  "HOME_OVER_1.5": "Home over 1.5", "AWAY_OVER_1.5": "Away over 1.5",
};

const MAX_LEGS = 40;        // the builders' own ceiling
const MAX_NAME = 40;
const MIN_ODD = 1.01, MAX_ODD = 1000;

/* Control characters are the delimiters, so they are stripped on the way in
   rather than trusted to be absent. */
function clean(s) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME);
}

function encode(legs) {
  const rows = (legs || []).slice(0, MAX_LEGS).map((l) => [
    clean(l.home), clean(l.away), String(l.date || ""), String(l.code || ""),
    (+l.od).toFixed(2), Math.round((+l.p) * 100),
  ].join(FS));
  return Buffer.from(rows.join(RS), "utf8").toString("base64url");
}

/* Returns {ok:true, legs} or {ok:false, why}. Never a partial slip: a link
   that is wrong in one leg is wrong, and rendering the rest of it would put
   numbers on screen that nobody chose. */
function decode(p) {
  if (typeof p !== "string" || !p || p.length > 8000) return { ok: false, why: "no slip in that link" };
  let raw;
  try { raw = Buffer.from(p, "base64url").toString("utf8"); }
  catch (e) { return { ok: false, why: "that link is damaged" }; }
  if (!raw) return { ok: false, why: "that link is empty" };

  const rows = raw.split(RS);
  if (rows.length > MAX_LEGS) return { ok: false, why: "that slip has too many games" };

  const legs = [];
  for (const row of rows) {
    const f = row.split(FS);
    if (f.length !== 6) return { ok: false, why: "that link is damaged" };
    const [home, away, date, code, od, pc] = f;
    if (!home || !away || home.length > MAX_NAME || away.length > MAX_NAME)
      return { ok: false, why: "that link is damaged" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, why: "that link is damaged" };
    if (!Object.prototype.hasOwnProperty.call(MARKETS, code))
      return { ok: false, why: "that slip has a bet we do not offer" };
    const odd = Number(od), prob = Number(pc) / 100;
    if (!isFinite(odd) || odd < MIN_ODD || odd > MAX_ODD) return { ok: false, why: "that link is damaged" };
    if (!isFinite(prob) || prob < 0.02 || prob > 0.99) return { ok: false, why: "that link is damaged" };
    legs.push({ home, away, date, code, od: odd, p: prob });
  }
  if (!legs.length) return { ok: false, why: "that link is empty" };
  return { ok: true, legs };
}

/* The label lib/grade.js understands, for each market code we encode.
   There is exactly one grader in this project on purpose - two of them
   disagreed once and started writing wrong rows into the record - so nothing
   here settles a market itself. It maps a code onto the label that grader
   already knows, and anything it cannot map stays ungraded.

   Team totals are absent deliberately. gradeLabel has no case for them, and
   adding one HERE would be a second grader by the back door. They come back
   null and are shown as not settled, which is the honest answer. Both builders
   have those markets off by default, so this is rare.

   First-half markets map to a label gradeLabel knows and refuses without a
   half-time score, which is correct: a full-time score cannot settle them. */
const GRADE_LABEL = {
  "1": "Home win", "2": "Away win", "X": "Draw", "GG": "Both teams score",
  "1X": "1X, home or draw", "X2": "X2, draw or away", "12": "12, home or away",
  "OVER_1.5": "Over 1.5", "OVER_2.5": "Over 2.5", "OVER_3.5": "Over 3.5",
  "FH_OVER_0.5": "First half goal",
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* Attach a verdict to any leg whose match we have a result for. Mutates
   nothing: returns a new array.

   A leg with no result is `null`, and a leg we cannot settle is `null` too.
   Callers must render both as "not settled" and NEVER as a loss - turning an
   unknown into a miss is precisely the bug that marked a live match lost in
   somebody's slip earlier the same day. */
function gradeLegs(legs, results) {
  let G;
  try { G = require("./grade.js"); } catch (e) { return legs.map((l) => Object.assign({}, l)); }
  const byKey = new Map();
  for (const r of (results || [])) {
    if (!r || r.hg == null || r.ag == null) continue;
    byKey.set(r.date + "|" + norm(r.home) + "|" + norm(r.away), r);
  }
  return legs.map((l) => {
    const r = byKey.get(l.date + "|" + norm(l.home) + "|" + norm(l.away));
    if (!r) return Object.assign({}, l, { won: null });
    const label = GRADE_LABEL[l.code];
    const won = label ? G.gradeLabel(label, Number(r.hg), Number(r.ag)) : null;
    return Object.assign({}, l, { won, hg: Number(r.hg), ag: Number(r.ag) });
  });
}

/* How a graded slip stands. `settled` is true only when every leg has a
   verdict: one unknown leg means the slip's fate is genuinely unknown, and
   saying otherwise would be a guess dressed as a result. */
function verdict(legs) {
  let won = 0, lost = 0, unknown = 0;
  for (const l of legs) {
    if (l.won === true) won++;
    else if (l.won === false) lost++;
    else unknown++;
  }
  return { won, lost, unknown,
    settled: unknown === 0 && (won + lost) > 0,
    /* One lost leg settles an accumulator; the rest cannot rescue it. That is
       true even with legs still unknown, so it is checked first. */
    slipWon: lost === 0 && unknown === 0 && won > 0,
    slipLost: lost > 0 };
}

/* Combined odds, and the chance every leg lands. The second number is the one
   people never see anywhere else and the reason this page is worth sharing. */
function totals(legs) {
  let od = 1, p = 1;
  for (const l of legs) { od *= l.od; p *= l.p; }
  return { odds: od, prob: p };
}

/* ------------------------------------------------------------- the page

   Written as its own document rather than through pages.js `staticPage`.
   That shell was built for the privacy and terms pages: a generic #6d3bf5
   purple, a cream ground, and a `.dot` placeholder circle standing in for a
   logo. A shared slip dressed in it looked like a policy page, because it was
   one. The palette below is the app's own - taken from index.html, not
   invented - so a link that leaves the site still looks like the site.

   The mark is the wizard's head, circle-cropped from the app icon. There was
   never a reason for a purple dot except that the legal shell had one. */

function money(n) {
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2);
}

/* What the reader actually wants to know: how sure the model was, on average,
   across the games in the slip. The product of every probability - the chance
   every single leg lands - is mathematically honest and reads as discouraging
   nonsense on a long slip, where it is near zero however good the picks are. */
function avgConfidence(legs) {
  if (!legs.length) return 0;
  return legs.reduce((a, l) => a + l.p, 0) / legs.length;
}

/* A booking code travels beside the legs rather than inside them: it belongs
   to the slip, not to any one game, and keeping the row format untouched means
   every link already shared still opens. */
const BOOKS = {
  sporty: { name: "SportyBet", url: "https://www.sportybet.com/ng/?shareCode=" },
  bet9ja: { name: "Bet9ja", url: "https://sports.bet9ja.com/?bookABetCode=" },
};
function cleanCode(c) {
  const s = String(c == null ? "" : c).trim().toUpperCase();
  return /^[A-Z0-9-]{4,24}$/.test(s) ? s : null;
}
function bookOf(b) {
  return Object.prototype.hasOwnProperty.call(BOOKS, String(b || "")) ? String(b) : null;
}

function legRows(legs) {
  return legs.map((l) => {
    const mark = l.won === true ? '<b class="won">Won</b>'
      : l.won === false ? '<b class="lost">Lost</b>' : "";
    const score = (l.hg != null && l.ag != null)
      ? `<span class="sc">${esc(l.hg + "-" + l.ag)}</span>` : "";
    const meta = [esc(MARKETS[l.code]), mark, score].filter(Boolean).join(" ");
    return `
      <li>
        <div class="tm">${esc(l.home)} <i>v</i> ${esc(l.away)}</div>
        <div class="mk">${meta}</div>
        <div class="od"><b>${esc(l.od.toFixed(2))}</b><span>${Math.round(l.p * 100)}%</span></div>
      </li>`;
  }).join("");
}

function renderBody(legs, record, opts) {
  opts = opts || {};
  const t = totals(legs);
  const v = verdict(legs);
  const conf = Math.round(avgConfidence(legs) * 100);
  const code = cleanCode(opts.code);
  const book = BOOKS[bookOf(opts.book)] || BOOKS.sporty;

  const head = v.slipWon ? '<p class="vd won">Every game landed.</p>'
    : v.slipLost ? `<p class="vd lost">${v.lost} game${v.lost === 1 ? "" : "s"} missed.</p>`
    : (v.won || v.lost) ? `<p class="vd">${v.won} landed so far, ${v.unknown} still to play.</p>`
    : "";

  /* The reason to share, and the thing I left out of the first version: the
     code, and one tap to play it. A slip nobody can book is a screenshot. */
  const codeCard = code ? `
    <div class="code">
      <span class="k">${esc(book.name)} booking code</span>
      <b id="code">${esc(code)}</b>
      <div class="acts">
        <button type="button" id="copy">Copy code</button>
        <a class="go" href="${esc(book.url + encodeURIComponent(code))}"
           rel="noopener nofollow" target="_blank">Open in ${esc(book.name)}</a>
      </div>
    </div>` : "";

  const rec = record && record.total ? `
    <p class="rec">Soccerwizard has called <b>${record.correct} of ${record.total}</b>
    in the last ${record.days} days. The ones we got wrong are published too.</p>` : "";

  return `
<div class="hero">
  <span class="eyebrow">A slip from Soccerwizard</span>
  <h1>${legs.length} game${legs.length === 1 ? "" : "s"} at
      <em>${esc(money(t.odds))}</em> odds</h1>
  ${head}
</div>

<div class="sum">
  <div><span class="k">Games</span><b>${legs.length}</b></div>
  <div><span class="k">Total odds</span><b>${esc(money(t.odds))}</b></div>
  <div><span class="k">Average confidence</span><b class="cf">${conf}%</b></div>
</div>

${codeCard}

<ol class="legs">${legRows(legs)}</ol>

<p class="src">Every pick is Soccerwizard's own call, from our model. The reader
chose which of them to put together and what to aim for.</p>
${rec}

<a class="cta" href="/">Build your own slip</a>
<p class="fine">18+. Predictions are estimates, not certainties. Only stake what you can lose.</p>`;
}

/* The app's palette, straight out of index.html. Gold marks what we favour and
   comes out of the logo; red is the brand; green is kept for probabilities
   strong enough to stand on their own. */
const PAGE_CSS = `
:root{
  --bg:#0D0D0F; --card:#161619; --card2:#1E1E22; --line:#2A2A30;
  --text:#F2F1F0; --soft:#A3A0A6; --faint:#6F6C74;
  --red:#E63946; --green:#2FD48A; --win:#F2B84B; --cream:#DCD8D2;
}
@media (prefers-color-scheme: light){
  :root{
    --bg:#E9E4DA; --card:#F4F1EA; --card2:#EFEBE2; --line:#B3AA96;
    --text:#1C1A18; --soft:#514C46; --faint:#7C756C;
    --red:#C62330; --green:#0F6F40; --win:#9A6B00; --cream:#3A352F;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:520px;margin:0 auto;padding:22px 16px 60px}

.top{display:flex;align-items:center;gap:10px;margin-bottom:26px;text-decoration:none;color:inherit}
.top img{width:34px;height:34px;border-radius:50%;object-fit:cover;
  border:1px solid var(--line);background:var(--card);flex:none}
.top b{font-size:17px;font-weight:800;letter-spacing:-.02em}
.top b i{font-style:normal;color:var(--red)}

.eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--faint)}
.hero h1{font-size:31px;line-height:1.1;letter-spacing:-.025em;margin:7px 0 0;font-weight:800}
.hero h1 em{font-style:normal;color:var(--win)}
.vd{font-size:14px;font-weight:700;margin:10px 0 0}
.vd.won{color:var(--green)} .vd.lost{color:var(--red)}

.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:22px 0 0}
.sum div{background:var(--card);padding:13px 12px;display:flex;flex-direction:column;gap:5px;min-width:0}
.k{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.sum b{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.sum .cf{color:var(--green)}

.code{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:16px;margin:14px 0 0;text-align:center}
.code b{display:block;font-size:29px;font-weight:800;letter-spacing:.11em;
  margin:7px 0 14px;color:var(--win);font-variant-numeric:tabular-nums}
.acts{display:flex;gap:9px}
.acts button,.acts .go{flex:1;border-radius:999px;font-size:14px;font-weight:800;
  padding:12px 10px;cursor:pointer;text-decoration:none;text-align:center;
  border:1px solid var(--line);background:var(--card2);color:var(--text)}
.acts .go{background:var(--red);border-color:var(--red);color:#fff}
@media (hover:hover){
  .acts button:hover{border-color:var(--win);color:var(--win)}
  .acts .go:hover{filter:brightness(1.08)}
}
.acts button:focus-visible,.acts .go:focus-visible{outline:2px solid var(--win);outline-offset:2px}

.legs{list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;
  counter-reset:leg}
.legs li{background:var(--card);padding:12px 14px;display:grid;
  grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;align-items:center}
.tm{font-size:14.5px;font-weight:700;min-width:0;letter-spacing:-.01em}
.tm i{font-style:normal;color:var(--faint);font-weight:400;margin:0 3px}
.mk{grid-column:1;font-size:12.5px;color:var(--soft)}
.mk .won{color:var(--green)} .mk .lost{color:var(--red)}
.mk b{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-left:4px}
.mk .sc{color:var(--faint);font-variant-numeric:tabular-nums;margin-left:4px}
.od{grid-column:2;grid-row:1 / span 2;text-align:right;display:flex;flex-direction:column;gap:2px}
.od b{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--win)}
.od span{font-size:11.5px;color:var(--faint);font-variant-numeric:tabular-nums}

.src{font-size:12.5px;color:var(--faint);margin:15px 0 0;line-height:1.55}
.rec{font-size:13px;color:var(--soft);margin:10px 0 0;line-height:1.55}
.rec b{color:var(--text)}
.cta{display:block;text-align:center;background:var(--win);color:#17140C;
  text-decoration:none;font-weight:800;font-size:15px;padding:14px;
  border-radius:999px;margin:22px 0 0}
@media (hover:hover){.cta:hover{filter:brightness(1.06)}}
.fine{font-size:11.5px;color:var(--faint);margin:14px 0 0;text-align:center}
footer{margin-top:26px;padding-top:15px;border-top:1px solid var(--line);
  color:var(--faint);font-size:12px;text-align:center}
footer a{color:var(--soft)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

function shell(o) {
  const url = ORIGIN + (o.path || "/s");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} | Soccerwizard</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="noindex,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Soccerwizard">
<meta property="og:image" content="${esc(o.image || (ORIGIN + "/og-card.png"))}">
<meta property="og:image:width" content="1568">
<meta property="og:image:height" content="772">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(o.image || (ORIGIN + "/og-card.png"))}">
<link rel="icon" href="/icon-32.png">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <a class="top" href="/">
    <img src="/icon-192.png" alt="" width="34" height="34">
    <b>Soccer<i>wizard</i></b>
  </a>
  ${o.body}
  <footer>
    <a href="/">Predictions</a> &middot; <a href="/how-it-works">How it works</a>
    &middot; <a href="/terms">Terms</a><br>
    18+. Please gamble responsibly &middot;
    <a href="https://www.begambleaware.org" rel="noopener nofollow">BeGambleAware.org</a>
  </footer>
</div>
<script>
(function(){
  var b=document.getElementById("copy"), c=document.getElementById("code");
  if(!b||!c) return;
  b.addEventListener("click",function(){
    var t=c.textContent.trim();
    function done(){ b.textContent="Copied"; setTimeout(function(){b.textContent="Copy code";},1600); }
    try{ navigator.clipboard.writeText(t).then(done,sel); }catch(e){ sel(); }
    function sel(){
      try{
        var r=document.createRange(); r.selectNodeContents(c);
        var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
        b.textContent="Selected"; setTimeout(function(){b.textContent="Copy code";},1600);
      }catch(e){}
    }
  });
})();
</script>
</body>
</html>`;
}

function renderPage(legs, record, path, opts) {
  const t = totals(legs);
  const n = legs.length;
  const title = `${n} game${n === 1 ? "" : "s"} at ${money(t.odds)} odds`;
  return shell({
    path, title,
    desc: `${title}, built on Soccerwizard from our own predictions. Name what you want to win and it finds the games.`,
    /* This slip's own card, carrying this slip's numbers. Composited per
       request - see lib/slipcard.js - because a picture on disk can only ever
       say what the site is, not what was shared. */
    image: `${ORIGIN}/api/slipcard?g=${encodeURIComponent(n)}&o=${encodeURIComponent(t.odds.toFixed(2))}`,
    body: renderBody(legs, record, opts),
  });
}

function renderError(why) {
  return shell({
    path: "/s",
    title: "That slip could not be opened",
    desc: "Build your own football slip on Soccerwizard.",
    body: `<div class="hero"><span class="eyebrow">Soccerwizard</span>
      <h1>That slip could not be opened</h1></div>
      <p class="src">${esc(why)}. Links get cut short when they are copied out of a
      chat. Nothing is lost - a new one takes a few seconds to build.</p>
      <a class="cta" href="/">Build a slip</a>`,
  });
}

module.exports = { encode, decode, totals, gradeLegs, verdict, GRADE_LABEL,
  avgConfidence, cleanCode, bookOf, BOOKS,
  renderBody, renderPage, renderError,
  MARKETS, MAX_LEGS, ORIGIN };
