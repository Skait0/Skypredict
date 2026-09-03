"use strict";

/**
 * One static page per fixture, generated at build time.
 *
 * ## Why these exist
 *
 * The whole site is one URL. Every prediction we publish - 348 of them on an
 * ordinary day - lives behind JavaScript on `/`, so a search engine sees a
 * single page and none of the football on it. Somebody typing "Arsenal vs
 * Chelsea prediction" can never arrive, because there is nothing to arrive at.
 * These pages are that landing surface, and the data for them is already baked
 * into predictions.json - no new source, no new request.
 *
 * ## Not doorway pages
 *
 * A few hundred near-identical stubs is a recognised way to get a site buried
 * rather than ranked, so each page carries the things a reader actually wants
 * and that genuinely differ per match: the tip and its confidence, the model's
 * scoreline and expected goals, the full probability spread, and both sides'
 * recent form. If we would not read it, it should not be indexed.
 *
 * ## The URL outlives the match
 *
 * A fixture page becomes a result page when the match finishes, at the same
 * address. That matters twice over: a link shared before kick-off still works
 * afterwards, and the archive of "what we said, and what happened" grows by
 * itself. It is also the only place the record is legible to someone who has
 * not opened the app.
 */

const K = require("./key.js");

/* The canonical home. Deliberately not VERCEL_URL - that is the per-deployment
   hostname, and pointing a canonical tag at it would have every preview build
   competing with production for the same match. */
const ORIGIN = process.env.SITE_ORIGIN || "https://skypredict-theta.vercel.app";

const BRAND = "Soccerwizard";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Path only, so callers can join it to whatever origin they are writing for. */
function pagePath(f) {
  return "/m/" + K.slug(f.home) + "-vs-" + K.slug(f.away) + "-" + String(f.date || "");
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* Formatted from the ISO kickoff in UTC rather than from the build machine's
   clock, so the same payload always produces the same bytes. A three-line
   script on the page rewrites it to the reader's own zone; without JS the UTC
   label is still true, which is the right way round. */
function humanDate(iso, fallbackDate) {
  const d = new Date(iso || fallbackDate || "");
  if (isNaN(d.getTime())) return String(fallbackDate || "");
  return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] +
         " " + d.getUTCFullYear();
}
function humanTime(iso) {
  const d = new Date(iso || "");
  if (isNaN(d.getTime())) return "";
  return String(d.getUTCHours()).padStart(2, "0") + ":" +
         String(d.getUTCMinutes()).padStart(2, "0");
}

function pct(v) {
  return (v == null || isNaN(v)) ? null : Math.round(Number(v) * 100) + "%";
}

/* Home, draw and away are one split of one certainty, so the three printed
   numbers must add to a hundred. Rounding each alone does not: 36.6, 26.8 and
   36.6 total exactly 100 and print as 37, 27 and 37. Largest remainder - floor
   them all, then give the spare points to the biggest fractions. The double
   chances below are deliberately left out: they overlap, and three of them
   summing to 200 is correct rather than a bug. */
function split100(vals) {
  const raw0 = vals.map(v => (Number(v) || 0) * 100);
  const sum = raw0.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return vals.map(() => null);
  const raw = raw0.map(r => (r * 100) / sum);
  const out = raw.map(Math.floor);
  const left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }))
                   .sort((a, b) => b.frac - a.frac);
  for (let n = 0; n < left; n++) out[order[n % order.length].i]++;
  return out;
}

/* A row is dropped entirely when the model has no number for it, rather than
   printed as a dash. A page of dashes is the thin content we are trying not to
   publish. */
function rows(pairs) {
  return pairs.filter(p => p[1] != null)
    .map(p => "<tr><th>" + esc(p[0]) + "</th><td>" + esc(p[1]) + "</td></tr>")
    .join("");
}

function formRun(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map(r => {
    const c = r === "W" ? "w" : r === "L" ? "l" : "d";
    return "<i class='f f-" + c + "'>" + esc(r) + "</i>";
  }).join("");
}

/* Structured data. Kept to what we can actually stand behind - the teams, the
   competition and the start time. No venue, because we do not have one, and an
   invented one would be worse than its absence. */
function jsonLd(f, url) {
  const o = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: f.home + " vs " + f.away,
    url: url,
    sport: "Association football",
    competitor: [
      { "@type": "SportsTeam", name: f.home },
      { "@type": "SportsTeam", name: f.away },
    ],
  };
  if (f.kickoff) o.startDate = f.kickoff;
  if (f.league) o.superEvent = { "@type": "SportsOrganization", name: f.league };
  /* JSON.stringify escapes quotes but not "</script>", and these names arrive
     from a feed rather than from us. Without this, a club called
     `A</script><script>...` would close this block and open its own. Escaping
     the angle brackets as \u003c/\u003e keeps the JSON identical to a parser
     and inert to the HTML tokeniser. */
  return JSON.stringify(o)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/* These pages were written with their own palette and drifted from the app:
   a cool grey ground under pure-white cards, where the site itself is warm.
   They are now the same surfaces as [data-theme="light"] in public/index.html
   - both because a reader arriving from search should not land on a visibly
   different site, and because #fff cards were the brightest thing we shipped.
   Keep the two in step if either moves. */
/* The app's own palette, lifted from index.html rather than invented. These
   pages used a #6d3bf5 purple that appears nowhere in the product, so every
   footer page and all ~578 match pages looked like somebody else's site.
   Gold marks what we favour and comes out of the logo; red is the brand. */
const CSS = `:root{--bg:#0D0D0F;--card:#161619;--card2:#1E1E22;--text:#F2F1F0;
--soft:#A3A0A6;--faint:#6F6C74;--line:#2A2A30;
--accent:#F2B84B;--brand:#E63946;--w:#2FD48A;--l:#E63946;--d:#5A5762}
@media (prefers-color-scheme:light){:root{--bg:#E9E4DA;--card:#F4F1EA;--card2:#EFEBE2;
--text:#1C1A18;--soft:#514C46;--faint:#7C756C;--line:#B3AA96;
--accent:#9A6B00;--brand:#C62330;--w:#0F6F40;--l:#C62330}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:20px 16px 56px}
a{color:var(--accent)}
.top{display:flex;align-items:center;gap:8px;margin-bottom:22px}
.top a{text-decoration:none;color:var(--text);display:inline-flex;align-items:center;gap:8px}
.top b{font-size:15px;letter-spacing:-.01em}
.top img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--line);background:var(--card);flex:none}
.top b i{font-style:normal;color:var(--brand)}
.top b{font-weight:800}
h1{font-size:26px;line-height:1.22;letter-spacing:-.02em;margin:0 0 6px}
.meta{color:var(--soft);font-size:14px;margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;
padding:16px;margin:0 0 16px}
.tip i{display:block;font-style:normal;font-size:11px;font-weight:700;
letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.tip b{display:block;font-size:21px;letter-spacing:-.01em;margin:3px 0 2px}
.tip span{color:var(--soft);font-size:14px}
.score{font-size:34px;font-weight:800;letter-spacing:-.02em;margin:0}
.verdict{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;
padding:4px 11px;margin-top:8px}
.hit{background:rgba(18,137,79,.14);color:var(--w)}
.miss{background:rgba(200,16,46,.13);color:var(--l)}
h2{font-size:13px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
color:var(--soft);margin:24px 0 9px}
table{width:100%;border-collapse:collapse;font-size:15px}
th{text-align:left;font-weight:400;color:var(--soft);padding:7px 0;
border-bottom:1px solid var(--line)}
td{text-align:right;font-weight:600;padding:7px 0;border-bottom:1px solid var(--line);
font-variant-numeric:tabular-nums}
tr:last-child th,tr:last-child td{border-bottom:0}
.form{display:flex;align-items:center;gap:9px;padding:7px 0}
.form em{font-style:normal;flex:1;font-size:15px}
.f{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:5px;
font-style:normal;font-size:11px;font-weight:700;color:#fff;margin-left:3px}
.f-w{background:var(--w)}.f-l{background:var(--l)}.f-d{background:var(--d)}
.cta{display:block;text-align:center;background:var(--accent);color:#fff;
text-decoration:none;font-weight:700;padding:14px;border-radius:12px;margin:26px 0 0}
.note{color:var(--soft);font-size:13px;margin:22px 0 0}
footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);
color:var(--soft);font-size:12.5px}`;

/**
 * One match page.
 *
 * @param f       the fixture as published (may carry the model's numbers)
 * @param result  the graded result, when the match has been played
 */
function renderMatchPage(f, result) {
  const url = ORIGIN + pagePath(f);
  const played = !!(result && result.hg != null && result.ag != null);
  const vs = f.home + " vs " + f.away;
  const when = humanDate(f.kickoff, f.date);
  const at = humanTime(f.kickoff);

  const title = played
    ? vs + " - " + result.hg + "-" + result.ag + " result and our prediction"
    : vs + " prediction, tip and probabilities";

  const desc = played
    ? vs + " finished " + result.hg + "-" + result.ag + ". We tipped " +
      (result.tip || f.tip || "") + " - see how the prediction held up."
    : "Our prediction for " + vs + " in the " + (f.league || "league") + " on " +
      when + (f.tip ? ": " + f.tip : "") +
      (f.tip_p != null ? " at " + pct(f.tip_p) + " confidence." : ".");

  const tip = result && result.tip ? result.tip : f.tip;

  let head = "";
  if (played) {
    head =
      "<div class='card'><p class='score'>" + esc(f.home) + " " + result.hg +
      "-" + result.ag + " " + esc(f.away) + "</p>" +
      (tip
        ? "<p class='meta' style='margin:8px 0 0'>We tipped <strong>" + esc(tip) +
          "</strong></p>" +
          (result.hit == null ? ""
            : "<span class='verdict " + (result.hit ? "hit" : "miss") + "'>" +
              (result.hit ? "Tip landed" : "Tip missed") + "</span>")
        : "") +
      "</div>";
  } else if (tip) {
    head =
      "<div class='card tip'><i>Our tip</i><b>" + esc(tip) + "</b>" +
      (f.tip_p != null ? "<span>" + pct(f.tip_p) + " confidence</span>" : "") +
      "</div>";
  }

  /* Null when the model gave us nothing, so the rows drop out as before. */
  const three = (f.home_p != null && f.draw_p != null && f.away_p != null)
    ? split100([f.home_p, f.draw_p, f.away_p]).map(n => n + "%")
    : [pct(f.home_p), pct(f.draw_p), pct(f.away_p)];
  const outcome = rows([
    [f.home + " win", three[0]],
    ["Draw", three[1]],
    [f.away + " win", three[2]],
    [f.home + " or draw", pct(f.dc1x)],
    ["Either team to win", pct(f.dc12)],
    ["Draw or " + f.away, pct(f.dcx2)],
  ]);

  const goals = rows([
    ["Over 1.5 goals", pct(f.o15)],
    ["Over 2.5 goals", pct(f.o25)],
    ["Over 3.5 goals", pct(f.o35)],
    ["Both teams to score", pct(f.btts)],
    ["A goal in the first half", pct(f.fh_o05)],
  ]);

  const hasForm = (f.form_home && f.form_home.length) || (f.form_away && f.form_away.length);
  const expected = (f.lh != null && f.la != null)
    ? "<p class='meta' style='margin:0'>Expected goals " + Number(f.lh).toFixed(2) +
      " - " + Number(f.la).toFixed(2) +
      /* NOT "most likely score". scoreForTip draws a representative scoreline
         from the fixture's own distribution - see the long note above it in
         lib/build.js, which says in terms that this must not be labelled as the
         mode. The mode really is 1-1 on most of the card and was reverted for
         being right and useless. Calling a drawn scoreline "most likely" reads
         as a claim the model never made, and a reader who checks it against the
         real result concludes the site got the score wrong. */
      (f.score ? ", one way it could finish <strong>" + esc(f.score) + "</strong>" : "") + "</p>"
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${BRAND}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:image" content="${ORIGIN}/og-card.png">
<meta property="og:image:width" content="1568">
<meta property="og:image:height" content="772">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/og-card.png">
<link rel="icon" href="/icon-32.png">
<script type="application/ld+json">${jsonLd(f, url)}</script>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="top"><a href="/"><img src="/icon-192.png" alt="" width="30" height="30"><b>Soccer<i>wizard</i></b></a></div>
  <h1>${esc(vs)}${played ? " result" : " prediction"}</h1>
  <p class="meta">${esc(f.league || "")}${f.league && when ? " &middot; " : ""}<time datetime="${esc(f.kickoff || "")}">${esc(when)}${at ? ", " + at + " UTC" : ""}</time></p>
  ${head}
  ${outcome ? "<h2>Match outcome</h2><table>" + outcome + "</table>" : ""}
  ${goals ? "<h2>Goals</h2><table>" + goals + "</table>" : ""}
  ${expected ? "<h2>Model</h2>" + expected : ""}
  ${hasForm ? `<h2>Recent form</h2>
  <div class="form"><em>${esc(f.home)}</em>${formRun(f.form_home)}</div>
  <div class="form"><em>${esc(f.away)}</em>${formRun(f.form_away)}</div>` : ""}
  ${(outcome || goals) ? `<p class="note">Percentages are our model's own estimates from team ratings, recent form and expected goals. They are not odds, and they are not certainties.</p>` : ""}
  <a class="cta" href="/">See today's predictions</a>
  ${pageFooter()}
</div>
<script>
/* Show the kick-off in the reader's own zone. The UTC text stays correct if
   this never runs, so there is nothing to fall back to. */
(function(){try{var t=document.querySelector("time[datetime]");if(!t)return;
var d=new Date(t.getAttribute("datetime"));if(isNaN(d))return;
t.textContent=d.toLocaleString([],{weekday:"long",day:"numeric",month:"long",
year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(e){}})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------ static pages
   The site had no contact route, no privacy policy and no terms, and the match
   pages the build generates were linked from nowhere - a sitemap alone is a
   much weaker signal than real internal links. These close all four.

   The privacy text is written from an actual inventory of what this site does,
   not from a template: the Sentry init (errors only - replay and tracing are
   both off), the Vercel analytics script, the sixteen localStorage keys and the
   booking call. A privacy policy describing something else is worse than none. */
const CONTACT = "hello@soccerwizard.live";

function pageFooter() {
  return `<footer>
    <p class="links"><a href="/">Predictions</a> &middot; <a href="/matches">All matches</a> &middot; <a href="/how-it-works">How it works</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:${CONTACT}">Contact</a></p>
    <p>${BRAND} publishes football predictions for information only. 18+. Please gamble responsibly &middot; <a href="https://www.begambleaware.org" rel="noopener nofollow">BeGambleAware.org</a></p>
  </footer>`;
}

/* Shared shell, so a static page cannot drift from the match pages in styling,
   metadata or footer. */
function staticPage(o) {
  const url = ORIGIN + o.path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} | ${BRAND}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:image" content="${ORIGIN}/og-card.png">
<meta property="og:image:width" content="1568">
<meta property="og:image:height" content="772">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/og-card.png">
<link rel="icon" href="/icon-32.png">
<style>${CSS}
.prose h2{margin:26px 0 8px;font-size:17px}
.prose p,.prose li{color:var(--soft);line-height:1.65}
.prose ul{margin:8px 0 0 18px;padding:0}
.prose li{margin:4px 0}
footer .links{margin:0 0 10px}
.updated{font-size:12.5px;opacity:.85}
.mx-day{margin:22px 0 6px;font-size:15px;font-weight:800}
.mx-list{margin:0;padding:0;list-style:none}
@media(min-width:640px){.mx-list{column-count:2;column-gap:26px}}
@media(min-width:980px){.mx-list{column-count:3}}
.mx-list li{margin:0 0 5px;break-inside:avoid;font-size:13.5px}
/* Calibration table. Scrolls inside itself on a narrow screen rather than
   pushing the whole page sideways. */
.cal-wrap{overflow-x:auto;margin:14px 0 6px}
.cal{border-collapse:collapse;width:100%;min-width:460px;font-size:13.5px}
.cal th,.cal td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line)}
.cal th:first-child,.cal td:first-child{text-align:left}
.cal th{color:var(--faint);font-weight:700;font-size:12px;letter-spacing:.03em;text-transform:uppercase}
.cal td{color:var(--soft)}
.cal td.mk,.cal td.hit{color:var(--text);font-weight:700}
.cal .gap{font-variant-numeric:tabular-nums}
.cal .over{color:#3ddc84}
.cal .under{color:var(--red)}
.cal-note{font-size:12.5px;color:var(--faint);margin:2px 0 0}
</style>
</head>
<body>
<div class="wrap">
  <div class="top"><a href="/"><img src="/icon-192.png" alt="" width="30" height="30"><b>Soccer<i>wizard</i></b></a></div>
  <h1>${esc(o.h1 || o.title)}</h1>
  ${o.sub ? `<p class="meta">${esc(o.sub)}</p>` : ""}
  <div class="prose">${o.body}</div>
  ${pageFooter()}
</div>
</body>
</html>`;
}

function renderPrivacy(updated) {
  const body = `
<p>${BRAND} does not ask who you are. There is no account, no sign-up, and no
form on this site that collects personal details.</p>

<h2>What stays in your browser</h2>
<p>Your slips, your risk setting, your league and market choices, your theme and
the tab you were last on are kept in your browser's own storage. They never
leave your device and we cannot read them. Clearing your browser data, or using
the Clear buttons on the site, removes them for good.</p>

<h2>What leaves your browser</h2>
<ul>
  <li><strong>Error reports.</strong> When something breaks, an automatic report
  goes to Sentry so it can be fixed. It carries the error, the page it happened
  on, and your browser and operating system version. Session replay and
  performance tracing are both switched off, so what you do on the site is not
  recorded.</li>
  <li><strong>Page views.</strong> Vercel Analytics counts visits in aggregate.
  It sets no cookies and does not follow you to other sites.</li>
  <li><strong>Odds and booking codes.</strong> Live scores and SportyBet prices
  come from our own server. When you tap Get code, the games and markets you
  picked are sent there and passed to SportyBet, which returns a booking code.
  Nothing about you goes with them.</li>
</ul>

<h2>What we do not do</h2>
<p>We do not sell or share data, we run no advertising trackers, and we build no
profile of you. There are no third-party cookies on this site.</p>

<h2>Your rights</h2>
<p>Because there is no account and no personal record, there is normally nothing
of yours for us to retrieve or delete. If you believe an error report contains
something identifying, write to <a href="mailto:${CONTACT}">${CONTACT}</a> and it
will be removed.</p>

<h2>Changes</h2>
<p>If this policy changes, the date below changes with it.</p>
<p class="updated">Last updated ${esc(updated)}.</p>`;
  return staticPage({
    path: "/privacy",
    title: "Privacy",
    desc: `What ${BRAND} does and does not collect. No accounts, no advertising trackers, nothing sold.`,
    sub: "What we collect, in plain words.",
    body,
  });
}

function renderTerms(updated) {
  const body = `
<h2>What this site is</h2>
<p>${BRAND} publishes statistical football predictions. They are estimates
produced by a model from past results, and they are here for information only.
Nothing on this site is betting advice, financial advice, or a recommendation to
place any bet.</p>

<h2>No guarantee</h2>
<p>No prediction is ever certain. The model cannot see injuries, suspensions,
team news, motivation or weather. The percentages shown are its own estimates -
they are not odds, and they are not promises. Past accuracy does not predict
future accuracy.</p>

<h2>Odds and booking codes</h2>
<p>Some odds shown here are our own estimates. Where a real SportyBet price is
available we use it, but prices move, and the price you are shown at SportyBet
is the one that counts. A booking code loads a selection into your SportyBet
slip - it does not place a bet, and we never place one for you.</p>

<h2>Not affiliated</h2>
<p>${BRAND} is independent. It is not affiliated with, endorsed by, or partnered
with SportyBet or any other bookmaker.</p>

<h2>Age and responsibility</h2>
<p>This site is for over-18s. Betting carries a real risk of loss. Only stake
what you can afford to lose, and if it stops being fun, step away and find
support at
<a href="https://www.begambleaware.org" rel="noopener nofollow">BeGambleAware.org</a>.
You are responsible for any bet you place, and for following the law where you
live.</p>

<h2>Liability</h2>
<p>The site is provided as it is, without warranty. To the extent the law
allows, we are not liable for losses arising from use of this site, from
reliance on a prediction, or from any interruption or error in the service.</p>

<h2>Contact</h2>
<p>Questions about these terms: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<p class="updated">Last updated ${esc(updated)}.</p>`;
  return staticPage({
    path: "/terms",
    title: "Terms",
    desc: `Terms of use for ${BRAND}: predictions are estimates published for information only, not betting advice. 18+.`,
    sub: "The short version: these are estimates, not promises.",
    body,
  });
}

/* One row per market: how many held-out matches it was graded on, what we said
   would happen, and what did. Only markets with a real sample are shown - a
   thin row invites exactly the false confidence this table exists to prevent. */
function calibrationTable(rows) {
  const ok = (rows || []).filter((r) => r && r.total >= 200 && typeof r.exp === "number");
  if (!ok.length) return "";
  const pct = (x) => Math.round(x * 100) + "%";
  const body = ok.map((r) => {
    const said = r.exp / r.total, act = r.correct / r.total;
    const gap = (act - said) * 100;
    return "<tr><td class='mk'>" + esc(r.market) + "</td>" +
      "<td>" + r.total.toLocaleString("en-GB") + "</td>" +
      "<td>" + pct(said) + "</td>" +
      "<td class='hit'>" + pct(act) + "</td>" +
      "<td class='gap " + (gap >= 0 ? "over" : "under") + "'>" +
        (gap >= 0 ? "+" : "") + gap.toFixed(1) + "</td></tr>";
  }).join("");
  return "<div class='cal-wrap'><table class='cal'>" +
    "<thead><tr><th>Market</th><th>Games</th><th>We said</th><th>Landed</th>" +
    "<th>Diff</th></tr></thead><tbody>" + body + "</tbody></table></div>" +
    "<p class='cal-note'>Graded on " + ok[0].total.toLocaleString("en-GB") +
    " matches the model had not seen when it made the call. “We said” is " +
    "the average confidence we published; “landed” is how often it " +
    "actually happened.</p>";
}

function renderHowItWorks(stats) {
  const n = stats && stats.results;
  const lg = stats && stats.leagues;
  const body = `
<h2>Where the numbers come from</h2>
<p>Every morning the model is rebuilt from scratch out of past results${
  n ? ` - ${Number(n).toLocaleString("en-GB")} of them` : ""}${
  lg ? ` across ${lg} leagues` : ""}. Nothing is hand-picked, and no tip is
written by a person.</p>

<h2>The model</h2>
<p>Each team carries an attack and a defence rating, fitted by a time-weighted
regression over results with a 200-day half-life - so last week counts for more
than last autumn, without last autumn counting for nothing. Ratings are centred
<em>within</em> each league, because a mid-table side in one division is not the
same animal as a mid-table side in another. Fixtures across divisions are handled
with an explicit tier ladder, and where two leagues cannot honestly be compared
the fixture is skipped rather than guessed at.</p>
<p>Those ratings give an expected goals figure for each side. From that pair every
market on the page is derived as one coherent set - match outcome, double chance,
over and under, both teams to score, team totals - which is why the numbers on a
match page agree with one another.</p>

<h2>What the percentages mean</h2>
<p>They are the model's estimate of how often that outcome happens in games like
this one. They are not odds. A bookmaker's price carries their margin; ours does
not, which is why the two rarely match exactly.</p>

<h2>It learns from being wrong</h2>
<p>Results are graded against an authoritative source, and the published
confidence is corrected from the model's own record: where a market has been
landing more or less often than claimed, the shift is measured and applied,
shrunk toward no correction while the sample is still small. The more games that
are played, the better calibrated the numbers become.</p>

<h2>The record, market by market</h2>
<p>Every market is graded against the final score on matches the model had not
seen when it made the call. Not only the tip we lead with - all of them,
including the ones we get least right.</p>
${calibrationTable(stats && stats.markets)}

<h2>What it cannot do</h2>
<p>It cannot see injuries, suspensions, team news, a manager resting a squad, or
the weather. It has no opinion on motivation. On any single match it can be
comfortably wrong, and sometimes will be. What it offers is consistency across a
lot of matches, not certainty about one.</p>

<p><a class="cta" href="/">See today's predictions</a></p>`;
  return staticPage({
    path: "/how-it-works",
    title: "How it works",
    desc: `How ${BRAND} builds football predictions: time-weighted team ratings, expected goals, and confidence corrected from its own results.`,
    h1: "How the predictions are made",
    sub: "The method, without the marketing.",
    body,
  });
}

/* The hub that makes the match pages reachable. A sitemap tells a crawler the
   pages exist; internal links tell it they matter - and a reader can use them. */
function renderMatchesIndex(fixtures) {
  const byDate = {};
  fixtures.forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  const days = Object.keys(byDate).sort();
  const body = days.map((d) => {
    const list = byDate[d].slice().sort((a, b) =>
      String(a.league || "").localeCompare(String(b.league || "")) ||
      String(a.home || "").localeCompare(String(b.home || "")));
    return `<h2 class="mx-day">${esc(humanDate(null, d))}</h2><ul class="mx-list">` +
      list.map((f) =>
        `<li><a href="${esc(pagePath(f))}">${esc(f.home)} v ${esc(f.away)}</a></li>`
      ).join("") + "</ul>";
  }).join("");
  return staticPage({
    path: "/matches",
    title: "All match predictions",
    desc: `Every fixture ${BRAND} has a prediction for, listed by date, each with its own tip and probabilities.`,
    h1: "All match predictions",
    sub: fixtures.length + " matches with a page of their own.",
    body: body || "<p>No matches on the card right now.</p>",
  });
}

function renderSitemap(paths, lastmod) {
  const stamp = lastmod || new Date().toISOString().slice(0, 10);
  const urls = ["/"].concat(paths).map(p =>
    "  <url><loc>" + esc(ORIGIN + p) + "</loc><lastmod>" + stamp + "</lastmod></url>"
  ).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>\n";
}

function renderRobots() {
  return "User-agent: *\n" +
    "Allow: /\n" +
    "Disallow: /api/\n" +
    "\n" +
    "Sitemap: " + ORIGIN + "/sitemap.xml\n";
}

module.exports = { pagePath, renderMatchPage, renderSitemap, renderRobots, split100, ORIGIN, esc,
  renderPrivacy, renderTerms, renderHowItWorks, renderMatchesIndex,
  pageFooter, staticPage, CONTACT };
