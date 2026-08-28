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

const CSS = `:root{--bg:#f6f7f9;--card:#fff;--text:#14161a;--soft:#5b626e;--line:#e3e6ea;
--accent:#6d3bf5;--w:#12894f;--l:#c8102e;--d:#8a8f98}
:root:not([data-theme=light]){}
@media (prefers-color-scheme:dark){:root{--bg:#0d0d0f;--card:#16171b;--text:#f2f3f5;
--soft:#9aa1ad;--line:#26282e;--accent:#9b7bff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:20px 16px 56px}
a{color:var(--accent)}
.top{display:flex;align-items:center;gap:8px;margin-bottom:22px}
.top a{text-decoration:none;color:var(--text);display:inline-flex;align-items:center;gap:8px}
.top b{font-size:15px;letter-spacing:-.01em}
.top .dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
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
      (f.score ? ", most likely score <strong>" + esc(f.score) + "</strong>" : "") + "</p>"
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
<meta name="twitter:card" content="summary">
<link rel="icon" href="/icon-32.png">
<script type="application/ld+json">${jsonLd(f, url)}</script>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="top"><a href="/"><span class="dot"></span><b>${BRAND}</b></a></div>
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
  <footer>
    <p>${BRAND} publishes football predictions for information only. 18+. Please gamble responsibly &middot; <a href="https://www.begambleaware.org" rel="noopener nofollow">BeGambleAware.org</a></p>
  </footer>
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

module.exports = { pagePath, renderMatchPage, renderSitemap, renderRobots, split100, ORIGIN, esc };
