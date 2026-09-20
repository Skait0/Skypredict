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
/* The size the share card SHIPS at - lib/ogcard.js bakes 1568x772 and halves
   it on the way out, because WhatsApp drops a preview over roughly 300 KB.
   These pages declared the BAKED size, which is twice the file every scraper
   actually fetches. Read from the one function that knows. */
const CARD = require("./ogcard.js").cardSize();

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

/* Structured data. Kept to what we can actually stand behind.
 *
 * THE VENUE QUESTION, REOPENED WITH EVIDENCE. This said "no venue, because we
 * do not have one, and an invented one would be worse than its absence" - and
 * the second half of that is still right. But Google treats `location` as
 * required, and Search Console on 7 Sep 2026 reported every Event item on the
 * site as invalid for the want of it: 5 invalid, 0 valid, so no match page
 * could produce a rich result.
 *
 * There was a third option between inventing a stadium and saying nothing: a
 * home fixture IS played at the home club's ground, so naming the club as the
 * Place states something we already publish rather than guessing at a name we
 * do not know. No stadium is claimed, and a test asserts none appears.
 *
 * `offers` stays absent, deliberately. It is a warning rather than an error,
 * this site sells no tickets, and fabricating one to silence a warning is
 * exactly what the original objection was about. */
/* THE TRAIL A CRAWLER CAN SEE.
 *
 * The hierarchy exists now - hub, day, match - and nothing declared it, so
 * every match page read as an orphan three clicks deep. BreadcrumbList is the
 * cheapest way to say otherwise, and Google renders it in the result itself
 * instead of the bare URL. */
function breadcrumbs(items) {
  return safeJson({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: ORIGIN + it.path,
    })),
  });
}

/* JSON.stringify escapes quotes but not "</script>", and club names arrive
   from a feed rather than from us. Escaping the angle brackets keeps the JSON
   identical to a parser and inert to the HTML tokeniser. */
function safeJson(o) {
  return JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

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
  /* A date alone is valid ISO 8601 and valid to Google; emitting nothing at
     all is what made one item unusable. */
  o.startDate = f.kickoff || f.date || undefined;
  /* Ninety minutes plus the interval and stoppage. Only when there is a real
     kickoff to add it to - adding 105 minutes to a bare date would invent a
     start time we do not have. */
  if (f.kickoff) {
    const end = Date.parse(f.kickoff);
    if (isFinite(end)) o.endDate = new Date(end + 105 * 60000).toISOString();
  }
  /* Where a home fixture is played, said at the only resolution we have. */
  if (f.home) o.location = { "@type": "Place", name: f.home };
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
--accent:#F2B84B;--on-accent:#14120E;--brand:#E63946;--w:#2FD48A;--l:#E63946;--d:#5A5762;
--top-bg:rgba(13,13,15,.72);--top-hair:rgba(255,255,255,.07);
--top-fade:rgba(0,0,0,.38);--hero-glow:rgba(230,57,70,.17);
--hero-top:rgba(255,255,255,.045)}
@media (prefers-color-scheme:light){:root{--bg:#E9E4DA;--card:#F4F1EA;--card2:#EFEBE2;
--text:#1C1A18;--soft:#514C46;--faint:#7C756C;--line:#B3AA96;
--accent:#9A6B00;--on-accent:#FFFFFF;--brand:#C62330;--w:#0F6F40;--l:#C62330;
--top-bg:rgba(233,228,218,.75);--top-hair:rgba(30,25,20,.09);
--top-fade:rgba(30,25,20,.10);--hero-glow:rgba(230,57,70,.09);
--hero-top:rgba(255,255,255,.55)}}
*{box-sizing:border-box}
body{margin:0;color:var(--text);
background:radial-gradient(120% 150% at 14% 0%,var(--hero-glow) 0%,transparent 62%)
no-repeat top left / 100% 320px, var(--bg);
/* No overflow rule here on purpose. Nothing on these pages bleeds past the
   content box any more - the masthead is a full-width element rather than a
   680px one bleeding out with viewport units - so there is nothing to contain,
   and overflow-x:hidden would make body a scroll container, which breaks
   position:sticky for that very masthead. The app needs the clip because its
   hero band genuinely is 100vw; this does not. */
/* THE SAME TYPEFACE AS THE APP, because these are the same site.
   index.html has been in Plus Jakarta Sans since it was built and every
   static page was in the system stack, so a reader arriving on a match page
   or a how-to met different letterforms from the board they came for. The
   fallbacks stay: display=swap means the system stack draws first and the
   webfont replaces it, which is why the stack below has to be the app’s
   stack and not a different one. */
font:16px/1.55 'Plus Jakarta Sans',system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:20px 16px 56px}
a{color:var(--accent)}
/* THE SAME MASTHEAD THE APP HAS. These pages had a logo on a bare page and
   nothing else - no bar, no separation, no surface. They are also where search
   sends people, so for most readers this is the first Soccerwizard they see;
   it should not look like a different site from the one the link promised.
   The bar sits OUTSIDE the 680px column, which is the whole reason it can be
   full width without a trick. The first attempt kept it inside and bled the
   background out with left:50%;width:100vw - and 100vw counts the scrollbar,
   so the page gained eight pixels of horizontal scroll (1913 against 1905)
   that overflow-x:clip did not catch, because body's overflow propagates to
   the viewport when html's is visible. A full-width element belongs at full
   width; .top-in re-creates the column inside it so the logo still lines up
   with the prose below. */
.top{position:sticky;top:0;z-index:20;
background:var(--top-bg);
-webkit-backdrop-filter:blur(16px) saturate(150%);
backdrop-filter:blur(16px) saturate(150%);
box-shadow:inset 0 -1px 0 var(--top-hair);margin-bottom:22px}
.top-in{max-width:680px;margin:0 auto;padding:11px 16px;
display:flex;align-items:center;gap:8px}
/* The logo's own rules, which a careless block replacement removed while
   restyling the bar around them - the wordmark came back as a gold underlined
   link because the generic anchor rule was all that was left to match it.
   NO BACKTICKS IN HERE: this whole stylesheet is a template literal, and one
   in a comment ends it mid-sentence. */
.top a{text-decoration:none;color:var(--text);display:inline-flex;align-items:center;gap:8px}
.top b{font-size:15px;letter-spacing:-.01em;font-weight:800}
.top b i{font-style:normal;color:var(--brand)}
.top img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--line);background:var(--card);flex:none}
/* Where the edge stops being an edge. */
.top::after{content:"";position:absolute;left:0;right:0;top:100%;height:16px;
pointer-events:none;
background:linear-gradient(to bottom,var(--top-fade),transparent)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
.top{background:var(--bg)}}
/* THE SAME GLOW THE APP HAS, for the same reason and now by the same logic.
   It was left off once, on the argument that documents scroll content under
   the bar within a screen so the glass works unaided. Half true, and half a
   rationalisation of a technical failure: the first attempt needed viewport
   units to escape the 680px column and put 348px of horizontal scroll on all
   1,120 pages. That obstacle went away when the bar moved outside .wrap.
   Painted as a BACKGROUND LAYER on body rather than as an element. body is
   already full width, so the layer is sized in percentages and cannot overflow
   anything - no pseudo-element to stack, no viewport unit to miscount a
   scrollbar, and the sticky bar's blur picks it up because it sits above the
   page background it is part of. One property, and the same warmth at the top
   of a match page as at the top of the app. */
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
/* WHAT COLOUR THE TEXT ON THE ACCENT IS, PER THEME. It was #fff in both, and
   the dark theme's accent is a light gold: white on #F2B84B is about 1.9:1,
   which fails AA on the one button every page ends with. The light theme's
   accent is a dark gold and wants white, so this is a token rather than a
   colour. */
.cta{display:block;text-align:center;background:var(--accent);color:var(--on-accent);
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
/* THE WAY OUT OF A MATCH PAGE THAT IS NOT THE HOME PAGE.
 *
 * A match page linked "/", "/matches" and the standing pages, and nothing
 * else. No link to its own day, none to any other match - so the only path
 * through the site ran one way, downwards, and every one of 1,200 pages was a
 * leaf. Crawlers read a leaf with no lateral links as a page nothing depends
 * on, which is most of what "Discovered - currently not indexed" means.
 *
 * Eight siblings, not the whole day: a hundred and sixty links here would
 * rebuild the wall of anchors that splitting the hub just took down. */
function sameDayBlock(f, sameDay, when) {
  const others = (sameDay || []).filter((x) =>
    x && x.home && x.away && pagePath(x) !== pagePath(f));
  if (!others.length) return "";
  const list = others.slice(0, 8).map((x) =>
    `<li><a href="${esc(pagePath(x))}">${esc(x.home)} v ${esc(x.away)}</a></li>`).join("");
  return `<h2>Also on ${esc(when)}</h2><ul class="mx-list">${list}</ul>` +
    `<p class="mx-back"><a href="${esc(matchesDayPath(f.date))}">` +
    `All ${others.length + 1} matches on ${esc(when)}</a></p>`;
}

/* WHY AN UNPLAYED FIXTURE IS NOINDEX, AND A PLAYED ONE IS NOT.
 *
 * Search Console: 84 pages indexed against 1,157 not, 1,080 of them
 * "Discovered - currently not indexed". At that ratio the verdict is about the
 * site, not about any page - a domain registered in August published 1,212
 * templated pages, and Google decided the set was not worth the crawl.
 *
 * The two halves of that set are not the same thing:
 *
 *   before kickoff   a tip and a table of probabilities, generated for every
 *                    fixture on the card, rewritten on every deploy, and stale
 *                    within days. Thousands of sites publish this page. We will
 *                    not outrank any of them for "X vs Y prediction" on a
 *                    one-month-old domain.
 *   after full time   the score, the tip we published BEFORE it, and whether it
 *                    landed. Nobody else has that page, because nobody else
 *                    wrote our tip down. It never changes again.
 *
 * So the second half is submitted and the first half is not. `follow` matters:
 * the links still carry, so the day pages still reach everything and nothing is
 * orphaned - this asks Google not to index the page, not to ignore the site.
 *
 * Reversible in one line, and it should be reversed once the domain has the
 * authority to compete for pre-match queries. Judged again when a meaningful
 * number of the graded pages are actually indexed.
 *
 * THE NARROW EXPERIMENT, OPENED 20 SEPTEMBER 2026. The rule above still holds
 * for 33 of the 40 leagues on the board. The seven below are the exception,
 * because the argument against a pre-match page is about competing for demand
 * that a new domain cannot win - and demand is not spread evenly. 83 of the
 * 323 upcoming fixtures sit in these seven, and under SITEMAP_DAYS the ask
 * rises by roughly 10 to 25 URLs at a time, not by 800.
 *
 * Judged around 18 October: are these leagues' unplayed pages INDEXED? If they
 * land in "Discovered - currently not indexed" with everything else, the
 * experiment failed and answered the wider question at the same time. Reverting
 * is deleting the Set. The names are the payload's own league strings, matched
 * exactly - a typo here is silent, it just indexes nothing. */
const INDEXED_UPCOMING = new Set([
  "England Premier League", "Spain La Liga 1", "Italy Serie A",
  "Germany Bundesliga 1", "France Ligue 1", "England Championship",
  "Netherlands Eredivisie",
]);
const indexableUpcoming = (f) => INDEXED_UPCOMING.has(String((f && f.league) || ""));

function renderMatchPage(f, result, sameDay) {
  const url = ORIGIN + pagePath(f);
  const played = !!(result && result.hg != null && result.ag != null);
  const vs = f.home + " vs " + f.away;
  const when = humanDate(f.kickoff, f.date);
  const at = humanTime(f.kickoff);

  /* Kept under about 60 characters, which is where a result page gets cut off.
     "prediction, tip and probabilities" spent 33 of them on words nobody
     searches for and pushed the club names past the truncation. */
  const title = played
    ? vs + " " + result.hg + "-" + result.ag + " - result and our tip"
    : vs + " prediction and tips";

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
${played || indexableUpcoming(f)
  ? `<link rel="canonical" href="${esc(url)}">`
  : '<meta name="robots" content="noindex,follow">'}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:image" content="${ORIGIN}/og-card.png">
<meta property="og:image:width" content="${CARD.w}">
<meta property="og:image:height" content="${CARD.h}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/og-card.png">
<link rel="icon" href="/icon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<script type="application/ld+json">${jsonLd(f, url)}</script>
<script type="application/ld+json">${breadcrumbs([
  { name: "Predictions", path: "/" },
  { name: "All matches", path: "/matches" },
  { name: when, path: matchesDayPath(f.date) },
  { name: vs, path: pagePath(f) },
])}</script>
<style>${CSS}</style>
</head>
<body>
<div class="top"><div class="top-in"><a href="/"><img src="/wiz-mark.png" alt="" width="30" height="30"><b>Soccer<i>wizard</i></b></a></div></div>
<div class="wrap">
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
  ${sameDayBlock(f, sameDay, when)}
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
/* The community, carried on every generated page - the standing pages, the 404
   and all 1,120 match pages. Those are what search sends people to, so a reader
   arriving on a single fixture from Google can find the group without first
   working out that there is a home page. Declared once here for the same reason
   CONTACT is: two copies of an address drift, and a test asserts there is one. */
const TELEGRAM = "https://t.me/soccerwizardTG";

function pageFooter() {
  return `<footer>
    <p class="links"><a href="/">Predictions</a> &middot; <a href="/matches">All matches</a> &middot; <a href="/how-it-works">How it works</a> &middot; <a href="/booking-codes">Booking codes</a> &middot; <a href="/convert-a-booking-code">Convert a code</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:${CONTACT}">Contact</a> &middot; <a href="${TELEGRAM}" rel="noopener">Telegram</a></p>
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
${o.noindex ? '<meta name="robots" content="noindex,follow">\n' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:image" content="${ORIGIN}/og-card.png">
<meta property="og:image:width" content="${CARD.w}">
<meta property="og:image:height" content="${CARD.h}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/og-card.png">
<link rel="icon" href="/icon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
${o.head || ""}
<style>${CSS}
.prose h2{margin:26px 0 8px;font-size:17px}
.prose p,.prose li{color:var(--soft);line-height:1.65}
.prose ul{margin:8px 0 0 18px;padding:0}
.prose li{margin:4px 0}
footer .links{margin:0 0 10px}
.updated{font-size:12.5px;opacity:.85}
.mx-day{margin:22px 0 6px;font-size:15px;font-weight:800}
.mx-days{margin:14px 0 0;padding:0;list-style:none}
.codes{margin:14px 0 6px;display:flex;flex-direction:column;gap:8px}
/* --r-md and --raise are the app’s tokens and the static shell does not
   define them; a var() that resolves to nothing here would have drawn a
   square-cornered box next to the rounded ones on every other page. */
.code-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.code-row b{min-width:88px}
.code-row code{font-size:19px;font-weight:800;letter-spacing:.08em}
.code-row a{margin-left:auto;font-weight:700}
.mx-days li{display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:9px 0;border-bottom:1px solid var(--line)}
.mx-days a{font-weight:700}
.mx-n{color:var(--faint);font-size:12.5px;font-variant-numeric:tabular-nums}
.mx-back{margin:22px 0 0;font-size:13.5px}
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
<div class="top"><div class="top-in"><a href="/"><img src="/wiz-mark.png" alt="" width="30" height="30"><b>Soccer<i>wizard</i></b></a></div></div>
<div class="wrap">
  <h1>${esc(o.h1 || o.title)}</h1>
  ${o.sub ? `<p class="meta">${esc(o.sub)}</p>` : ""}
  <div class="prose">${o.body}</div>
  ${pageFooter()}
</div>
</body>
</html>`;
}

/* THE PAGE NOBODY PLANS AND EVERYBODY REACHES.
   Vercel answers an unmatched route with a bare 79-byte default: no styling,
   no brand, and - the part that actually costs something - no way back. This
   site has 1,120 indexed match pages that go stale and disappear as fixtures
   age out, so a 404 here is not an exotic event. It is what a search result
   from three weeks ago now leads to.
   Two rules it must follow that an ordinary page must not:
     - noindex. A 404 that Google indexes is a 404 that Google shows people.
       `follow` stays, so the links out of it still pass authority to the
       pages that do exist.
     - no canonical. Pointing a missing page at itself invites it to be
       treated as a real one; that is what the noindex swap above is for. */
function renderNotFound() {
  const body = `
<p>The page you asked for is not here. That usually means one of two things.</p>
<ul>
  <li><strong>A match page that has aged out.</strong> Predictions are published
  for upcoming fixtures and retired once they are well past. A link from a few
  weeks ago will land here.</li>
  <li><strong>A mistyped address.</strong> Everything on this site is reachable
  from the pages below.</li>
</ul>
<h2>Where you probably meant to go</h2>
<ul>
  <li><a href="/">Today's predictions</a> - the day's card, with a tip and a
  confidence figure on every game.</li>
  <li><a href="/matches">Every match we have a prediction for</a>, by day.</li>
  <li><a href="/how-it-works">How the model works</a>, including how often it
  has been right.</li>
</ul>`;
  return staticPage({
    path: "/404", noindex: true,
    title: "Page not found",
    h1: "That page is not here",
    desc: "The page you asked for could not be found. Today's football " +
      "predictions and every published match page are one link away.",
    sub: "Error 404",
    body,
  });
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

/* The share-link formats, and they are not decoration: a code appended to one
   of these loads the slip. They are duplicated from public/index.html, which
   builds its "Open in" buttons from the same strings - and duplication is only
   safe because test/bookinglinks.test.js reads both files and fails when they
   stop matching. Bet9ja's parameter in particular was found by reading their
   bundle (it matches /[?&]bookABetCode=([\da-zA-Z]+)/), not guessed. */
const SPORTY_SHARE = "https://www.sportybet.com/ng/?shareCode=";
const B9_SHARE = "https://sports.bet9ja.com/?bookABetCode=";
const FOOTBALL_SHARE = "https://www.football.com/ng/m?shareCode=";

/* THE CODE PAGES, AND WHY THE ARCHIVE IS THE POINT.
 *
 * Every site in this niche publishes booking codes. sportpremi, betloy,
 * surecodes24, convertbetcodes, a Telegram channel - all of them post codes
 * daily and not one of them ever says what happened afterwards. A code expires
 * in hours, so a page of today's codes has nothing durable in it and nothing
 * anybody can check.
 *
 * So the hub carries today's code and the archive carries every day before it,
 * graded. A dated page never changes once its matches are settled, which makes
 * it worth indexing, and it accumulates - the same shape that finally worked
 * for the match pages.
 *
 * The grading is not a separate job. A leg is looked up in the results the
 * build already holds, by the same fixture key the rest of the site uses, so a
 * day page grades itself as the scores arrive.
 *
 * PER LEG, NOT JUST WIN OR LOSE. Five legs at eighty per cent is a slip that
 * loses more often than it wins, and reporting only the slip would bury five
 * honest calls under one red word. Both are printed: how each leg finished, and
 * whether the slip as a whole came in.
 */
function legVerdict(leg, resultOf) {
  const r = resultOf ? resultOf(leg) : null;
  if (!r || r.hg == null || r.ag == null) return { state: "pending" };
  return {
    state: r.hit == null ? "played" : (r.hit ? "hit" : "miss"),
    score: r.hg + "-" + r.ag,
  };
}

function codeLegs(legs, resultOf) {
  const rows = (legs || []).map((l) => {
    const v = legVerdict(l, resultOf);
    const mark = v.state === "hit" ? '<span class="verdict hit">landed</span>'
      : v.state === "miss" ? '<span class="verdict miss">missed</span>'
      : v.state === "played" ? '<span class="meta">' + esc(v.score) + "</span>"
      : "";
    return "<tr><td>" + esc(l.home) + " v " + esc(l.away) +
      '<span class="meta"> ' + esc(l.league || "") + "</span></td>" +
      "<td>" + esc(l.tip || "") + "</td>" +
      "<td>" + (l.tip_p != null ? pct(l.tip_p) : "") + "</td>" +
      "<td>" + (v.score ? esc(v.score) + " " : "") + mark + "</td></tr>";
  }).join("");
  return '<div class="cal-wrap"><table class="cal">' +
    "<tr><th>Match</th><th>Our tip</th><th>Confidence</th><th>Result</th></tr>" +
    rows + "</table></div>";
}

function codeSummary(legs, resultOf) {
  const v = (legs || []).map((l) => legVerdict(l, resultOf));
  const done = v.filter((x) => x.state === "hit" || x.state === "miss");
  if (!done.length) return null;
  const hit = v.filter((x) => x.state === "hit").length;
  return { hit: hit, of: done.length, all: done.length === v.length,
           slip: done.length === v.length && hit === v.length };
}

function codeBlock(entry) {
  const c = (entry && entry.codes) || {};
  const one = (label, code, url) => code
    ? '<div class="code-row"><b>' + esc(label) + "</b>" +
      "<code>" + esc(code) + "</code>" +
      '<a href="' + esc(url + code) + '" rel="noopener nofollow" target="_blank">Load it</a></div>'
    : "";
  /* BetKing loads a booking code from its own betslip box and from nowhere
     else - BK_URL is null in index.html for the same reason. Appending the
     code to their home page would look like a working link and drop the slip,
     so this row says what to do instead of pretending to do it. */
  const paste = (label, code) => code
    ? '<div class="code-row"><b>' + esc(label) + "</b>" +
      "<code>" + esc(code) + "</code>" +
      "<span>Paste it into the betslip</span></div>"
    : "";
  return '<div class="codes">' +
    one("SportyBet", c.sporty, SPORTY_SHARE) +
    one("Bet9ja", c.bet9ja, B9_SHARE) +
    paste("BetKing", c.betking) +
    "</div>";
}

function codesDayPath(date) { return "/booking-codes/" + String(date || ""); }

/* One day, permanently. This is the page the whole idea rests on: the code we
   published that morning, the five games in it, and how each one finished. */
function renderCodesDay(entry, resultOf) {
  const when = humanDate(null, entry.date);
  const sum = codeSummary(entry.legs, resultOf);
  const headline = sum
    ? sum.hit + " of " + sum.of + " landed" + (sum.all ? "" : " so far")
    : "Not settled yet";
  return staticPage({
    path: codesDayPath(entry.date),
    title: "Booking code for " + when + " - " + headline,
    desc: "The SportyBet and Bet9ja booking code " + BRAND + " published on " +
      when + ", the " + (entry.legs || []).length + " games in it, and how each one finished.",
    h1: "Booking code for " + when,
    sub: headline + (sum && sum.all ? (sum.slip ? " - the slip won." : " - the slip did not win.") : ""),
    head: '<script type="application/ld+json">' + breadcrumbs([
      { name: "Predictions", path: "/" },
      { name: "Booking codes", path: "/booking-codes" },
      { name: when, path: codesDayPath(entry.date) },
    ]) + "</script><style>" + PUSH_CSS + "</style>",
    body: codeBlock(entry) + pushControl() + codeLegs(entry.legs, resultOf) +
      '<div class="prose"><p>These were the ' + (entry.legs || []).length +
      " tips we were most confident about that day, booked as one slip on both " +
      "bookmakers. The result column is the same grading the rest of the site " +
      "uses: every tip is checked against the final score.</p>" +
      "<p>A booking code carries selections, not prices. The bookmaker prices " +
      "them again when the code is loaded, and an old code expires once its " +
      "matches have been played.</p></div>" +
      '<p class="mx-back"><a href="/booking-codes">Every day’s code</a> &middot; ' +
      '<a href="/how-to-load-a-booking-code">How to load a code</a></p>',
  });
}

/* THE HUB, AS SOMETHING WORTH LANDING ON.
   It was an h2, a code, a table and a list of links - correct, and flat as a
   receipt. The page carries the site's strongest claim (every code we ever
   published, every leg graded) and read like an appendix, which is part of why
   nobody, including us, ever went to it.
   Three things do the work now: the code is set as a ticket rather than as a
   row of a table; the claim is counted and animated, because "227 of 341 legs
   landed" is the argument and it should arrive as a number; and everything
   below the fold reveals as it is scrolled to, so the page has a rhythm.
   All of it is progressive. The CSS that hides a section is scoped to a class
   the script itself puts on <html>, so with JavaScript off nothing is hidden
   and nothing moves - the same page, still. Motion is off entirely under
   prefers-reduced-motion. */

/* Styling for the ask, shared by the hub (via CODES_CSS) and the day page
   (via its own `head`). Scoped under .ck-ask/.ck-askb/.ck-asknote so neither
   copy depends on which side of the shared sheet it lands on. */
const PUSH_CSS = `
.ck-ask{margin:14px 0 0}
.ck-ask[hidden]{display:none}
.ck-askb{display:inline-flex;align-items:center;gap:8px;cursor:pointer;
  font:inherit;font-size:13.5px;font-weight:700;color:var(--text);
  background:var(--card);border:1px solid var(--line);border-radius:99px;
  padding:9px 16px}
.ck-askb.on{color:var(--w);border-color:var(--w)}
/* .ck-asknote alone loses to the shared .prose p,.prose li rule on
   specificity (0,1,1 beats 0,1,0), which no amount of source order fixes. */
.ck-ask .ck-asknote{margin:0;font-size:12.5px;color:var(--faint)}
@media (hover:hover){
  .ck-askb:hover{border-color:var(--accent)}
}`;

const CODES_CSS = `
.ck-hero{position:relative;overflow:hidden;margin:18px 0 8px;padding:18px;
  border:1px solid var(--line);border-radius:14px;
  background:linear-gradient(180deg,var(--card2),var(--card))}
.ck-hero::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(58% 120% at 88% 0%,rgba(242,184,75,.14),transparent 62%)}
.ck-hero>*{position:relative;z-index:1}
.ck-eyebrow{font-size:11px;font-weight:800;letter-spacing:.06em;
  text-transform:uppercase;color:var(--accent)}
/* Scoped to the hero, and not because it needs to be: the shared CSS is
   injected AFTER this block, so a bare .ck-h loses every property it shares
   with the h2 rule and the headline renders as a small grey uppercase label. */
.ck-hero .ck-h{margin:7px 0 14px;font-size:21px;line-height:1.25;font-weight:800;
  color:var(--text);text-transform:none;letter-spacing:-.01em}
.ck-tix{display:flex;flex-direction:column;gap:10px}
.ck-t{display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.ck-bk{font-weight:800;min-width:86px;font-size:13.5px}
/* The code is the thing on this page. It is read aloud and typed into another
   app, so it is tabular, widely tracked, and a button - tapping the code is
   what a reader tries first, and it used to do nothing. */
.ck-copy{display:inline-flex;align-items:baseline;gap:10px;cursor:pointer;
  font:inherit;font-size:21px;font-weight:800;letter-spacing:.09em;
  font-variant-numeric:tabular-nums;background:none;border:0;padding:0;color:var(--accent)}
.ck-copy em{font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.05em;
  text-transform:uppercase;color:var(--faint)}
.ck-copy.done em{color:var(--w)}
.ck-copy:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
.ck-go{margin-left:auto;font-weight:700;font-size:13.5px}
.ck-paste{margin-left:auto;font-size:12.5px;color:var(--faint)}
.ck-note{margin:13px 0 0;font-size:12.5px;color:var(--faint)}
.ck-meter{margin:26px 0 6px}
.ck-big{font-size:31px;font-weight:800;letter-spacing:-.02em;line-height:1.1;
  font-variant-numeric:tabular-nums}
.ck-big small{font-size:14px;font-weight:700;letter-spacing:0;color:var(--soft)}
.ck-bar{height:8px;border-radius:99px;background:var(--card2);overflow:hidden;margin:11px 0 9px}
/* Scaled, not widened - animating width relayouts the bar on every frame,
   and a transform is composited. */
.ck-bar i{display:block;height:100%;width:100%;background:var(--w);
  transform:scaleX(0);transform-origin:left center;
  transition:transform 900ms cubic-bezier(.23,1,.32,1)}
.ck-under{font-size:12.5px;color:var(--soft);line-height:1.55}
.ck-days{margin:12px 0 0;padding:0;list-style:none}
.ck-day{border-bottom:1px solid var(--line)}
.ck-day a{display:flex;align-items:center;gap:12px;padding:11px 2px;
  text-decoration:none;color:var(--text)}
.ck-dd{font-weight:700;font-size:13.5px}
/* One dot per leg, in the order they were on the slip. A row of five dots says
   "four landed, one did not" faster than 4/5 does, and it says which one. */
.ck-pips{display:flex;gap:4px;margin-left:auto}
.ck-pips i{width:8px;height:8px;border-radius:50%;background:var(--d)}
.ck-pips i.w{background:var(--w)}
.ck-pips i.l{background:var(--l)}
.ck-dn{min-width:42px;text-align:right;font-size:12.5px;color:var(--faint);
  font-variant-numeric:tabular-nums}
@media (hover:hover){
  .ck-copy:hover em{color:var(--text)}
  .ck-t:hover{border-color:var(--accent)}
  .ck-day a:hover .ck-dd{text-decoration:underline}
  .ck-day a:hover{background:var(--card)}
}
.ck-anim .rv{opacity:0;transform:translateY(16px)}
.ck-anim .rv.in{opacity:1;transform:none;
  transition:opacity 620ms cubic-bezier(.23,1,.32,1),transform 620ms cubic-bezier(.23,1,.32,1)}
@media (prefers-reduced-motion:reduce){
  .ck-anim .rv,.ck-anim .rv.in{opacity:1;transform:none;transition:none}
  .ck-bar i{transition:none}
}` + PUSH_CSS;

/* Twenty-eight lines and no dependency on the app bundle, which this page does
   not load. Everything it does degrades to nothing: no observer, no clipboard,
   no script at all, and the page still reads. */
const CODES_JS = `
document.documentElement.className+=" ck-anim";
(function(){
  var slow=matchMedia("(prefers-reduced-motion: reduce)").matches;
  function count(el){
    var to=+el.getAttribute("data-to")||0;
    if(slow){ el.textContent=to; return; }
    var t0=0;
    requestAnimationFrame(function step(t){
      if(!t0) t0=t;
      var k=Math.min(1,(t-t0)/900);
      el.textContent=Math.round(to*(1-Math.pow(1-k,3)));
      if(k<1) requestAnimationFrame(step);
    });
  }
  function fill(el){
    var c=el.querySelectorAll?el.querySelectorAll("[data-to]"):[];
    for(var i=0;i<c.length;i++) count(c[i]);
    var b=el.querySelector&&el.querySelector(".ck-bar i");
    if(b) b.style.transform="scaleX("+(+b.getAttribute("data-p")||0)/100+")";
  }
  function show(el){ el.classList.add("in"); fill(el); }
  function start(){
    var els=[].slice.call(document.querySelectorAll(".rv"));
    if(!window.IntersectionObserver){ els.forEach(show); return; }
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ show(e.target); io.unobserve(e.target); } });
    },{rootMargin:"0px 0px -6% 0px"});
    els.forEach(function(el){ io.observe(el); });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start);
  else start();
  /* writeText rejects on a page that is not focused, and a rejected promise is
     not caught by try/catch - the same trap the app bundle documents. */
  document.addEventListener("click",function(e){
    var b=e.target.closest?e.target.closest(".ck-copy"):null;
    if(!b) return;
    try{
      var r=navigator.clipboard&&navigator.clipboard.writeText(b.getAttribute("data-code"));
      if(r&&r.catch) r.catch(function(){});
    }catch(err){}
    var t=b.querySelector("em"); if(!t) return;
    b.classList.add("done"); t.textContent="Copied";
    setTimeout(function(){ b.classList.remove("done"); t.textContent="Tap to copy"; },1600);
  });
})();`;

/* One dot per leg, same order as the slip. */
function codePips(legs, resultOf) {
  const dots = (legs || []).map((l) => {
    const v = legVerdict(l, resultOf);
    return '<i class="' + (v.state === "hit" ? "w" : v.state === "miss" ? "l" : "") + '"></i>';
  }).join("");
  return '<span class="ck-pips" aria-hidden="true">' + dots + "</span>";
}

/* The day's code as a ticket rather than as a table row. */
function codeTickets(entry) {
  const c = (entry && entry.codes) || {};
  const code = (v) => '<button class="ck-copy" type="button" data-code="' + esc(v) + '">' +
    esc(v) + "<em>Tap to copy</em></button>";
  const one = (label, v, url) => v
    ? '<div class="ck-t"><span class="ck-bk">' + esc(label) + "</span>" + code(v) +
      '<a class="ck-go" href="' + esc(url + v) + '" rel="noopener nofollow" target="_blank">Load it</a></div>'
    : "";
  /* BetKing has no deep link for a booked code - see codeBlock. */
  const paste = (label, v) => v
    ? '<div class="ck-t"><span class="ck-bk">' + esc(label) + "</span>" + code(v) +
      '<span class="ck-paste">Paste into the betslip</span></div>'
    : "";
  return '<div class="ck-tix">' +
    one("SportyBet", c.sporty, SPORTY_SHARE) +
    one("Bet9ja", c.bet9ja, B9_SHARE) +
    paste("BetKing", c.betking) +
    "</div>";
}

/* THE ASK, and the three times it must not appear.
 *
 * It sits under the code, because that is the one moment somebody has a reason
 * to want the next one. It is never shown on load and never asks for
 * permission until it is tapped: an unprompted dialog is how an origin gets
 * permanently blocked, and Chrome holds that against the site, not the page.
 *
 * Hidden entirely when the browser has no PushManager, and when permission is
 * already "denied" - that answer cannot be revisited from script, so a button
 * offering to try is a lie. On iOS outside a standalone window it becomes a
 * sentence instead of a button, because Apple requires the PWA to be installed
 * first and a dead button teaches people the site is broken.
 *
 * /booking-codes is a static page and never registers the service worker -
 * only index.html does. A reader who lands here from search has no
 * registration at all, so this draws its own with getRegistration() /
 * register() rather than waiting on navigator.serviceWorker.ready, which
 * would simply never resolve.
 */
function pushControl() {
  const KEY = process.env.VAPID_PUBLIC_KEY || "";
  if (!KEY) return "";          /* no key configured: ship no control at all */
  return '<div class="ck-ask" id="pushAsk" hidden></div>' +
    "<script>(function(){" +
    'var host=document.getElementById("pushAsk");' +
    'var KEY="' + KEY + '";' +
    'if(!host||!("PushManager" in window)||!("serviceWorker" in navigator)) return;' +
    'if(!("Notification" in window)||Notification.permission==="denied") return;' +
    'var ios=/iP(hone|ad|od)/.test(navigator.userAgent);' +
    'var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;' +
    "if(ios&&!standalone){" +
    'host.innerHTML="<p class=\'ck-asknote\'>Add Soccerwizard to your home screen first ' +
    '\\u2014 iPhone only allows this for installed apps.</p>";host.hidden=false;return;}' +
    "function key(s){var p=s.replace(/-/g,'+').replace(/_/g,'/');" +
    "var raw=atob(p+'='.repeat((4-p.length%4)%4));" +
    "var out=new Uint8Array(raw.length);" +
    "for(var i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);return out;}" +
    "function draw(on){host.innerHTML=on" +
    '?"<button class=\'ck-askb on\' type=\'button\'>Notifications on \\u00b7 turn off</button>"' +
    ':"<button class=\'ck-askb\' type=\'button\'>Tell me when the code is up</button>";' +
    "host.hidden=false;}" +
    /* No registration on a static-page landing: get one, or make one. */
    "navigator.serviceWorker.getRegistration().then(function(reg){" +
    'return reg||navigator.serviceWorker.register("/sw.js");' +
    "}).then(function(reg){" +
    "return reg.pushManager.getSubscription().then(function(sub){" +
    "draw(!!sub);" +
    'host.addEventListener("click",function(e){' +
    'if(!e.target.closest(".ck-askb")) return;' +
    "reg.pushManager.getSubscription().then(function(s){" +
    /* The endpoint is read BEFORE unsubscribe(), which invalidates the
       subscription object the row is keyed on. */
    "if(s){var ep=s.endpoint;return s.unsubscribe().then(function(){" +
    'return fetch("/api/push",{method:"DELETE",headers:{"content-type":"application/json"},' +
    "body:JSON.stringify({endpoint:ep})});" +
    "}).then(function(){draw(false);});}" +
    "return Notification.requestPermission().then(function(p){" +
    'if(p!=="granted") return;' +
    "return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(KEY)})" +
    ".then(function(ns){var j=ns.toJSON();" +
    'return fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},' +
    "body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});" +
    /* fetch() only rejects on a network failure - a 503 or 400 from the
       route resolves fine. Without checking r.ok the button would flip to
       "on" while Supabase never stored the row: subscribed-looking, silent
       forever. Leave it in its pre-click state instead of claiming success. */
    "}).then(function(r){draw(!!(r&&r.ok));});});" +
    "}).catch(function(){});" +
    "});});}).catch(function(){});" +
    "})();</script>";
}

/* Today at the top, every day before it underneath. */
function renderCodesHub(entries, resultOf) {
  const days = (entries || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = days[0];
  const rest = days.slice(1);
  const list = rest.length
    ? '<h2 class="rv">Every code before this one</h2><ul class="ck-days">' +
      rest.map((e) => {
        const s = codeSummary(e.legs, resultOf);
        return '<li class="ck-day rv"><a href="' + esc(codesDayPath(e.date)) + '">' +
          '<span class="ck-dd">' + esc(humanDate(null, e.date)) + "</span>" +
          codePips(e.legs, resultOf) +
          '<span class="ck-dn">' + (s ? s.hit + "/" + s.of : "pending") + "</span></a></li>";
      }).join("") + "</ul>"
    : "";
  /* The claim, counted. Every leg of every code we ever published, graded the
     same way the rest of the site grades - so this number moves against us on
     a bad week, which is the only reason it is worth printing. */
  let hit = 0, of = 0;
  for (const e of days) {
    const s = codeSummary(e.legs, resultOf);
    if (s) { hit += s.hit; of += s.of; }
  }
  const meter = of
    ? '<section class="ck-meter rv">' +
      '<div class="ck-big"><span data-to="' + hit + '">0</span> <small>of</small> ' +
      '<span data-to="' + of + '">0</span> <small>legs landed</small></div>' +
      '<div class="ck-bar"><i data-p="' + Math.round(100 * hit / of) + '"></i></div>' +
      '<p class="ck-under">Across ' + days.length + " published code" +
      (days.length === 1 ? "" : "s") + ", every leg checked against the final " +
      "score. Settled legs only - a game still being graded is counted by " +
      "neither side.</p></section>"
    : "";
  const top = latest
    ? '<section class="ck-hero">' +
      '<div class="ck-eyebrow">' + esc(humanDate(null, latest.date)) + "</div>" +
      '<h2 class="ck-h">' + (latest.legs || []).length +
      " games, one slip, free to load.</h2>" +
      codeTickets(latest) +
      (latest.firstKickoff
        ? '<p class="ck-note">First kick-off ' +
          esc(String(latest.firstKickoff).slice(11, 16)) + " UTC. A code stops " +
          "working once its matches start.</p>"
        : "") +
      "</section>" +
      '<div class="rv">' + codeLegs(latest.legs, resultOf) + "</div>"
    : "<p>No code published yet today.</p>";
  return staticPage({
    path: "/booking-codes",
    title: "Free SportyBet and Bet9ja booking codes, with the results",
    desc: "Today's booking code for SportyBet and Bet9ja, the games in it, and " +
      "how every previous day's code actually finished. Graded, not just posted.",
    h1: "Booking codes",
    sub: "One code a day, on both bookmakers - and what happened to every one before it.",
    head: '<script type="application/ld+json">' + breadcrumbs([
      { name: "Predictions", path: "/" },
      { name: "Booking codes", path: "/booking-codes" },
    ]) + "</script><style>" + CODES_CSS + "</style><script>" + CODES_JS + "</script>",
    body: top + pushControl() + meter +
      '<div class="prose rv"><p>Every site in this corner of the internet posts ' +
      "booking codes. Almost none of them ever say what happened next. Each code " +
      "here is the games " + BRAND + " was most confident about that morning, and " +
      "the day after, every leg is checked against the final score and the result " +
      "is left on the page - won or lost.</p>" +
      "<p>New to codes? <a href=\"/how-to-load-a-booking-code\">How to load one</a>." +
      "</p></div>" + list +
      '<a class="cta rv" href="/">Build your own slip</a>',
  });
}

/* THE PAGE FOR PEOPLE WHO HAVE A CODE AND DO NOT KNOW WHAT TO DO WITH IT.
 *
 * "How to load a booking code" is asked constantly and answered badly: the
 * results are four-minute videos and blog posts that describe a menu without
 * showing it. Meanwhile the site had the answer and never said it out loud -
 * `booking code` appeared on exactly one indexable page, the home page, twice.
 *
 * Everything here is taken from the integration that actually works rather
 * than from someone else's article: the two share-link formats are the same
 * constants the app builds its "Open in" buttons from, so if a bookmaker
 * changes one, this page breaks in the same commit the app does.
 *
 * Written for a reader first. It is a landing page, not a doorway - it answers
 * the question it was found for, and the way into the product is the last
 * thing on it rather than the first.
 */
function renderHowToCode() {
  const link = (href, label) =>
    `<a href="${esc(href)}" rel="noopener nofollow" target="_blank">${esc(label)}</a>`;
  return staticPage({
    path: "/how-to-load-a-booking-code",
    title: "How to load a booking code on SportyBet and Bet9ja",
    desc: "Load a booking code on SportyBet or Bet9ja in one tap with a link, " +
      "or by hand from the app menu. What the code does, and why the odds can move.",
    h1: "How to load a booking code",
    sub: "SportyBet, Bet9ja and football.com, by link or by hand.",
    head: `<script type="application/ld+json">${breadcrumbs([
      { name: "Predictions", path: "/" },
      { name: "How to load a booking code", path: "/how-to-load-a-booking-code" },
    ])}</script>`,
    body: `
<div class="prose">
  <p>A booking code is a short string of letters and numbers that stands for a
  whole bet slip. Whoever made the slip gets a code; anyone who enters that code
  gets the same selections loaded into their own slip, ready to stake. It saves
  finding a dozen matches by hand, and it is how a slip is shared at all.</p>

  <p>The code carries the <em>selections</em>. It does not carry a stake, and it
  does not carry the odds - see below.</p>

  <h2>The fast way: open the code as a link</h2>
  <p>SportyBet and Bet9ja accept the code in a URL, which means you never type it.
  Put the code on the end of the right address and the slip loads:</p>
  <ul>
    <li><b>SportyBet</b> &mdash; <code>${esc(SPORTY_SHARE)}YOURCODE</code></li>
    <li><b>Bet9ja</b> &mdash; <code>${esc(B9_SHARE)}YOURCODE</code></li>
    <li><b>football.com</b> &mdash; <code>${esc(FOOTBALL_SHARE)}YOURCODE</code>
      (a SportyBet code works here too)</li>
  </ul>
  <p><b>BetKing is the exception.</b> It has no address that loads a code, so a
  BetKing code is typed or pasted into the box on its own bet slip. Everything
  below about what a code does and does not carry applies to it in the same
  way.</p>
  <p>On a phone, opening one of those links hands the slip to the app if you
  have it installed, and to the website if you do not. This is what the
  <b>Open in</b> button does on every code ${BRAND} gives you.</p>

  <h2>By hand, on SportyBet</h2>
  <ol>
    <li>Open the SportyBet app or ${link("https://www.sportybet.com/ng/", "sportybet.com")} and sign in.</li>
    <li>Open the menu and choose <b>Load Booking Code</b>.</li>
    <li>Type or paste the code and confirm.</li>
    <li>The selections appear in your bet slip. Add your stake there.</li>
  </ol>

  <h2>By hand, on Bet9ja</h2>
  <ol>
    <li>Open the Bet9ja app or ${link("https://sports.bet9ja.com/", "sports.bet9ja.com")} and sign in.</li>
    <li>Go to <b>Check Bets</b>, then <b>Load Booking Code</b>.</li>
    <li>Enter the code and press <b>Book</b>.</li>
    <li>The slip loads with the selections on it. Add your stake.</li>
  </ol>

  <h2>Why the odds can be different from the ones you were shown</h2>
  <p>A booking code is a list of selections, not a price. The bookmaker prices
  them again at the moment you load the code, so if a price has moved since the
  slip was built, the total you see will not match the total that was quoted.
  That is the bookmaker's price changing, not the code failing.</p>

  <h2>When a code does not load</h2>
  <ul>
    <li><b>A match has kicked off.</b> Bookmakers drop selections once they
      start, and a slip can lose a leg or refuse to load.</li>
    <li><b>Wrong bookmaker.</b> A SportyBet code works on SportyBet and
      football.com. A Bet9ja code works on Bet9ja.</li>
    <li><b>Mistyped.</b> Codes are case-sensitive at both. Paste rather than
      type, or use the link above.</li>
    <li><b>Too old.</b> Codes are not kept for ever; an old one expires.</li>
  </ul>

  <h2>A code from the wrong bookmaker</h2>
  <p>A SportyBet code will not load on Bet9ja, or the other way round: they are
  separate systems and neither reads the other's codes. If somebody has sent you
  one for a book you do not use,
  <a href="/convert-a-booking-code">convert the booking code to the other
  bookmaker</a> and you get a code that will load.</p>

  <h2>Where to get a code</h2>
  <p>${BRAND} builds one for you. Say what you want to win, and it picks the
  games, prices every one of them, and gives you the code for SportyBet or
  Bet9ja. Every tip it publishes is checked against the final score afterwards,
  and the record is public.</p>
</div>
<a class="cta" href="/">Build a slip and get a code</a>`,
  });
}

/* THE CONVERTER, EXPLAINED WHERE A SEARCH CAN FIND IT.
 *
 * The converter itself is a panel on the home page and stays there - a second
 * implementation on a second page would drift from it, and the drift would
 * show up as a slip booked against a pairing we do not ship. So this page
 * carries the rules and sends the reader to the panel.
 *
 * Every rule below is one the code enforces, named here in the same words the
 * panel uses, because a page that describes a converter we do not have is
 * worse than no page: someone pastes a Bet9ja 1X2-or-Over/Under leg expecting
 * it to cross and is told it cannot.
 *
 * WHY THIS PAGE CARRIES CSS OF ITS OWN. The shared shell styles a page as an
 * article: one column, h2, paragraph, bullet list. That is right for the
 * privacy policy and wrong here - the first draft was nine headed paragraphs
 * of prose and every section looked identical, which is the shape a reader
 * skims and leaves. The rules on this page are comparisons and pairs, so they
 * are drawn as comparisons and pairs. The styles are scoped under .cv and the
 * tokens are the site's own; nothing here defines a colour, a radius or a
 * typeface of its own.
 */
function renderConvertPage() {
  /* THE PAGE IS THE TOOL, AND THE TOOL IS STILL THE PANEL.
     The form below posts nothing and converts nothing: it is a GET to the home
     page carrying the code and the book, which the builder picks up and reads.
     That keeps one converter on the site. A copy here would drift from it, and
     a drifted converter books somebody's slip against a pairing we do not ship.
     Everything a reader needs BEFORE pasting is above the fold; everything they
     need AFTER is said by the panel itself, leg by leg, on the slip in front of
     them. The rules that used to fill this page are folded underneath, open to
     anyone who wants them and to a crawler either way. */
  const css = `
.cv h2{margin:34px 0 12px;font-size:19px;line-height:1.3;letter-spacing:-.01em;
  color:var(--text);text-transform:none;font-weight:800}
.cv .lede{font-size:17px;line-height:1.6;color:var(--soft);margin:0 0 18px}

/* The tool. One field, one pair of buttons, one action. */
.cv .tool{border:1px solid var(--line);border-radius:12px;background:var(--card);
  padding:16px;margin:0}
.cv .tool legend{padding:0;font-size:13px;font-weight:700;color:var(--soft)}
.cv .tool fieldset{border:0;margin:0 0 12px;padding:0}
.cv .pick{display:flex;gap:8px;margin-top:8px}
/* The radio itself is the control; the label is what it looks like. Checked
   styling comes from :checked + span, so this works with no script at all -
   which it must, because this page ships none. */
.cv .pick input{position:absolute;opacity:0;width:0;height:0}
.cv .pick span{display:block;border:1px solid var(--line);border-radius:999px;
  padding:9px 16px;font-size:14px;font-weight:700;color:var(--soft);
  background:var(--card2);cursor:pointer;transition:color .12s,border-color .12s}
.cv .pick input:checked + span{color:var(--on-accent);background:var(--accent);
  border-color:var(--accent)}
.cv .pick input:focus-visible + span{outline:2px solid var(--accent);outline-offset:2px}
@media (hover:hover){.cv .pick input:not(:checked) + span:hover{color:var(--text)}}
.cv .field{display:flex;gap:8px;flex-wrap:wrap}
.cv .field input[type=text]{flex:1 1 200px;min-width:0;font:inherit;font-size:16px;
  padding:12px 14px;border-radius:12px;border:1px solid var(--line);
  background:var(--card2);color:var(--text);letter-spacing:.04em}
.cv .field input[type=text]::placeholder{color:var(--faint)}
.cv .field input[type=text]:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.cv .field button{font:inherit;font-size:15px;font-weight:800;padding:12px 22px;
  border:0;border-radius:12px;background:var(--accent);color:var(--on-accent);
  cursor:pointer}
/* The second action, which is the same journey minus the conversion. It is a
   button rather than a link because it submits the same code and the same
   book; making it look secondary is the only difference. */
.cv .field button.ghost{background:transparent;color:var(--soft);
  border:1px solid var(--line);font-weight:700}
@media (hover:hover){.cv .field button.ghost:hover{color:var(--text);border-color:var(--soft)}}
@media (hover:hover){.cv .field button:hover{filter:brightness(1.06)}}
.cv .field button:active{transform:scale(.99)}
.cv .after{margin:10px 0 0;font-size:13.5px;color:var(--faint);line-height:1.55}

/* Three things that happen to the slip, said once. */
.cv .steps{margin:0;padding:0;list-style:none;display:grid;gap:2px}
.cv .steps li{display:flex;gap:10px;align-items:baseline;color:var(--soft);
  font-size:14.5px;line-height:1.6}
.cv .jobs{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.cv .jobs li{border:1px solid var(--line);border-radius:12px;padding:12px 14px;
  background:var(--card);color:var(--soft);font-size:14.5px;line-height:1.55}
.cv .jobs b{color:var(--text)}
.cv .steps b{color:var(--accent);font-size:12.5px;font-weight:800;flex:none;
  font-variant-numeric:tabular-nums}

/* The reference, folded. */
.cv details{border:1px solid var(--line);border-radius:12px;background:var(--card);
  margin-top:8px;overflow:hidden}
.cv summary{padding:13px 15px;cursor:pointer;font-weight:700;font-size:14.5px;
  color:var(--text);list-style:none}
.cv summary::-webkit-details-marker{display:none}
.cv summary::after{content:"+";float:right;color:var(--faint);font-weight:700}
.cv details[open] summary::after{content:"\\2212"}
.cv details[open] summary{border-bottom:1px solid var(--line)}
.cv .body{padding:13px 15px}
.cv .body p{margin:0 0 10px;color:var(--soft);font-size:14.5px;line-height:1.6}
.cv .body p:last-child{margin:0}
.cv .body b{color:var(--text)}

.cv .books{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0}
.cv .books .row{display:grid;grid-template-columns:1.15fr 1fr 1fr;
  border-top:1px solid var(--line)}
.cv .books .row:first-child{border-top:0}
.cv .books .hd{background:var(--card2)}
.cv .books .c{padding:10px 12px;font-size:13.5px;line-height:1.45;color:var(--soft);
  border-left:1px solid var(--line);font-variant-numeric:tabular-nums}
.cv .books .c:first-child{border-left:0;color:var(--text);font-weight:600}
.cv .books .hd .c{color:var(--text);font-weight:700;font-size:13px}

.cv .swap{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 10px}
.cv .swap span{border:1px solid var(--line);border-radius:999px;padding:4px 11px;
  font-size:12.5px;color:var(--text);background:var(--card2);
  font-variant-numeric:tabular-nums}
.cv .swap span.to{border-color:var(--accent);color:var(--accent)}
.cv .swap i{font-style:normal;color:var(--faint);align-self:center;font-size:12.5px}

.cv .mk{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}
.cv .mk span{border:1px solid var(--line);border-radius:999px;padding:5px 11px;
  font-size:13px;color:var(--soft);background:var(--card2)}
.cv .mk span.on{color:var(--text);border-color:var(--accent)}

@media (max-width:560px){
  .cv .pick{flex-direction:column}
  .cv .pick span{text-align:center}
  .cv .books .row{grid-template-columns:1fr 1fr}
  .cv .books .row .c:first-child{grid-column:1 / -1;border-bottom:1px solid var(--line)}
  .cv .books .hd .c:first-child{display:none}
  .cv .books .hd .c:nth-child(2){border-left:0}
}`;

  const book = (what, sporty, b9) =>
    `<div class="row"><div class="c">${what}</div>` +
    `<div class="c">${sporty}</div><div class="c">${b9}</div></div>`;

  const market = (name, on) => `<span${on ? ' class="on"' : ""}>${name}</span>`;

  const fold = (q, body) =>
    `<details><summary>${q}</summary><div class="body">${body}</div></details>`;

  return staticPage({
    path: "/convert-a-booking-code",
    /* WHAT SOMEBODY TYPES, IN THE ORDER THEY TYPE IT. The old title ran to 66
       characters with the brand on it, so Google cut it, and it led with
       "Convert a booking code between" - three words before the first one
       anybody searches for. 49 characters now, both book names in the first
       forty. The description is 152: one sentence on what it does, one on
       what it costs, because a truncated description is a wasted one. */
    title: "Convert a SportyBet code to Bet9ja",
    desc: "Paste a SportyBet or Bet9ja booking code and get the same games as " +
      "a code for the other bookmaker. Free, no account, and it says what " +
      "cannot move.",
    h1: "Convert a SportyBet booking code to Bet9ja",
    sub: "And Bet9ja codes to SportyBet.",
    /* TWO BLOCKS, BOTH DESCRIBING WHAT IS ACTUALLY ON THE PAGE. The trail, and
       the fact that this page IS the tool rather than an article about one -
       WebApplication with a zero-price offer is the honest shape for a thing
       anybody can use without an account. No HowTo and no FAQPage: Google
       retired the first and restricted the second to health and government
       sites in 2023, so both would be schema nobody reads describing content
       shaped to fit it. */
    head: `<style>${css}</style>` +
      `<script type="application/ld+json">${breadcrumbs([
        { name: "Predictions", path: "/" },
        { name: "Convert a booking code", path: "/convert-a-booking-code" },
      ])}</script>` +
      `<script type="application/ld+json">${safeJson({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Booking code converter",
        url: ORIGIN + "/convert-a-booking-code",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript",
        description: "Reads a SportyBet or Bet9ja booking code and books the " +
          "same games at the other bookmaker.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "NGN" },
        publisher: { "@type": "Organization", name: BRAND, url: ORIGIN },
      })}</script>`,
    body: `
<div class="prose cv">
  <p class="lede">A booking code only works at the bookmaker that issued it.
  Paste one here and we can do three things with it: move it to the other
  bookie, cut it into smaller tickets, or fix the legs that look weak.</p>

  <form class="tool" action="/" method="get">
    <fieldset>
      <legend>Which book issued it</legend>
      <div class="pick">
        <label><input type="radio" name="book" value="sporty" checked><span>SportyBet</span></label>
        <label><input type="radio" name="book" value="bet9ja"><span>Bet9ja</span></label>
      </div>
    </fieldset>
    <div class="field">
      <input type="text" name="code" inputmode="latin" autocomplete="off"
        spellcheck="false" maxlength="16" pattern="[A-Za-z0-9]{4,16}"
        placeholder="Booking code" aria-label="Booking code" required>
      <button type="submit" name="go" value="convert">Convert it</button>
      <button class="ghost" type="submit" name="go" value="read">Just read it</button>
    </div>
    <p class="after">Both are free and book nothing: you see the games, and what
    can and cannot move, before any code is minted. Four or more games and the
    split into separate tickets is offered on the same screen.</p>
  </form>

  <h2>What happens next</h2>
  <ol class="steps">
    <li><b>1</b><span>We read the code and show you every game in it.</span></li>
    <li><b>2</b><span>Then three buttons wake up: <b>Edit for me</b>,
      <b>Convert</b> and <b>Split it</b>. Pick one.</span></li>
    <li><b>3</b><span>You see what changes before anything is booked. Press the
      button and you get a new code.</span></li>
  </ol>

  <h2>What each one does</h2>
  <ul class="jobs">
    <li><b>Edit for me.</b> We check every leg against our model. A hard leg
    becomes an easier bet on the same game - a win becomes a win or draw. You
    choose how far we go, and whether weak legs we cannot fix are taken out.
    Safer legs pay less, and both prices are on screen first.</li>
    <li><b>Convert.</b> The same games, as a code for the other bookie. Games
    they do not have are named and left out.</li>
    <li><b>Split it.</b> One long ticket becomes two, three or four shorter
    ones. They lose on their own instead of together.</li>
  </ul>

  <h2>What moves between SportyBet and Bet9ja</h2>
  ${fold("What gets left behind, and why", `
    <p><b>A game that has kicked off.</b> Neither book will take it, and one such
    leg refuses the whole ticket, so it comes out before we ask.</p>
    <p><b>A game the other book does not list.</b> Coverage is not identical.
    Bet9ja carries about 97% of what SportyBet does.</p>
    <p><b>A game that is not on our board.</b> Every board is a day's fixtures,
    so a code built a week ago will have games we no longer carry.</p>
    <p><b>A market only one of them sells.</b> A quarter handicap, a 6.5 corner
    line, a whole Over line. The table below has the ends of each card.</p>`)}

  ${fold("The lines that have to change to travel", `
    <div class="swap"><span>Over 2</span><i>becomes</i><span class="to">Over 1.5</span>
      <span>Over 3</span><i>becomes</i><span class="to">Over 2.5</span></div>
    <p><b>Whole Over/Under lines, and whole handicap lines.</b> SportyBet sells
    Over 2, Over 3 and a handicap of exactly one goal; Bet9ja and BetKing stop
    at the half lines. Over 2 returns your stake on exactly two goals where
    Over 1.5 has already won, and a one-goal handicap does the same on a
    one-goal win, so these are not the same bet. The leg moves to the nearest
    line the other book sells - always the side that cannot cost you the
    scoreline in question, so an over moves down and an under moves up - and
    every screen that shows it says it was changed.</p>
    <div class="swap"><span>1 or Over 1.5</span><i>becomes</i><span class="to">1 or Over 2.5</span></div>
    <p><b>1X2 or Over/Under.</b> All three books sell this at 2.5, so those legs
    cross untouched. Bet9ja and BetKing also sell 1.5 and 3.5, and SportyBet
    sells neither. Moving one of those is a whole goal, not a half, so it is
    offered with a switch rather than done for you.
    It moves only towards SportyBet, where each of those lines has
    exactly one place to go. The other direction would mean picking between 1.5
    and 3.5 on somebody else's money, so it is refused.</p>`)}

  ${fold("Where each card stops", `
    <div class="books">
      <div class="row hd"><div class="c">Market</div><div class="c">SportyBet</div><div class="c">Bet9ja</div></div>
      ${book("Over / Under", "0.5 to 5.5, plus whole lines", "0.5 to 5.5")}
      ${book("Asian handicap", "halves and wholes from -4.5 to 5", "-3 to 3, quarter lines too")}
      ${book("Total corners", "6.5 to 12.5", "7.5 to 14.5")}
      ${book("1X2 or Over / Under", "2.5 only", "1.5, 2.5 and 3.5")}
    </div>`)}

  ${fold("What a converted slip is worth", `
    <p>The price is the one the bookmaker taking it publishes, not the one on
    the code you pasted. Where that book has not published a price for a leg, a
    handicap or a corners line say, the panel says so and counts the legs it
    could price rather than printing a total that looks precise and is not.</p>
    <p><b>A converted slip is not the same bet as the one you pasted.</b> It is
    the same games, at another bookmaker's prices, minus whatever could not
    travel.</p>`)}

  ${fold("Markets that cross untouched", `
    <p>Markets we predict and price:</p>
    <div class="mk">
      ${market("1X2", true)}${market("Double chance", true)}${market("Over / Under 1.5", true)}
      ${market("Over / Under 2.5", true)}${market("Over / Under 3.5", true)}
      ${market("Both teams to score", true)}${market("Team totals", true)}
      ${market("First half goal", true)}
    </div>
    <p>Markets we move but never price, so they carry the bookmaker's odds and
    none of ours:</p>
    <div class="mk">
      ${market("Asian handicap")}${market("Total corners")}${market("Team cards")}
      ${market("Draw no bet")}${market("Win either half")}${market("1UP and 2UP")}
      ${market("1X2 or GG")}${market("Second-half double chance")}
    </div>`)}

  <p class="say">New to codes? <a href="/how-to-load-a-booking-code">How to load a
  booking code on SportyBet or Bet9ja</a>. Want one built for you instead?
  <a href="/booking-codes">Today's free booking codes</a> are published every
  morning with the games in them.</p>
</div>`,
  });
}

/* THE HUB, AND WHY IT IS NOW SEVERAL PAGES.
 *
 * A sitemap tells a crawler the pages exist; internal links tell it they
 * matter. This was one page carrying every link - 929 of them, 88 KB, and
 * itself linked once from the home page. Everything the site wants indexed
 * therefore hung off a single wall of near-identical anchors, which is a shape
 * crawlers discount: Search Console reported 1,080 pages "Discovered -
 * currently not indexed".
 *
 * So /matches is now a short index of DAYS, and each day is its own page. A day
 * page carries twenty to a hundred and fifty links instead of nine hundred, it
 * says what it is in its title, and - because a played match keeps its page now
 * - a past day stops changing and stays worth crawling.
 *
 * Both pages are built from the same rows, so they cannot disagree about what
 * exists.
 */
function matchesDayPath(date) {
  return "/matches/" + String(date || "");
}

function dayList(list) {
  return `<ul class="mx-list">` + list.slice().sort((a, b) =>
    String(a.league || "").localeCompare(String(b.league || "")) ||
    String(a.home || "").localeCompare(String(b.home || ""))
  ).map((f) =>
    `<li><a href="${esc(pagePath(f))}">${esc(f.home)} v ${esc(f.away)}</a></li>`
  ).join("") + "</ul>";
}

function groupByDate(fixtures) {
  const byDate = {};
  (fixtures || []).forEach((f) => {
    if (!f || !f.date) return;
    (byDate[f.date] = byDate[f.date] || []).push(f);
  });
  return byDate;
}

/* The index: one line per day, newest first, with a count so the link says
   what it is worth following for. */
function renderMatchesIndex(fixtures) {
  const byDate = groupByDate(fixtures);
  const days = Object.keys(byDate).sort().reverse();
  const body = days.length
    ? `<ul class="mx-days">` + days.map((d) =>
        `<li><a href="${esc(matchesDayPath(d))}">${esc(humanDate(null, d))}</a>` +
        `<span class="mx-n">${byDate[d].length}</span></li>`).join("") + "</ul>"
    : "<p>No matches on the card right now.</p>";
  return staticPage({
    path: "/matches",
    title: "All match predictions",
    desc: `Every fixture ${BRAND} has a prediction for, by date, each with its own tip and probabilities.`,
    h1: "All match predictions",
    sub: (fixtures || []).length + " matches across " + days.length + " days.",
    body: body,
  });
}

/* One day. Named by its date in the title, because "All match predictions" on
   thirty pages is thirty pages a crawler cannot tell apart. */
function renderMatchesDay(date, list) {
  const when = humanDate(null, date);
  return staticPage({
    path: matchesDayPath(date),
    title: "Football predictions for " + when,
    desc: `Every match ${BRAND} priced on ${when} - ${list.length} fixtures, each with its own tip, probabilities and result.`,
    h1: "Predictions for " + when,
    sub: list.length + (list.length === 1 ? " match." : " matches."),
    body: dayList(list) +
      `<p class="mx-back"><a href="/matches">All days</a></p>`,
    head:
      `<script type="application/ld+json">${breadcrumbs([
        { name: "Predictions", path: "/" },
        { name: "All matches", path: "/matches" },
        { name: when, path: matchesDayPath(date) },
      ])}</script>` +
      /* What the page actually is: a list of that day's matches, in the order
         it prints them. Only the fixtures themselves - the page makes no claim
         about scores it is not showing. */
      `<script type="application/ld+json">${safeJson({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Football predictions for " + when,
        numberOfItems: list.length,
        itemListElement: list.slice(0, 100).map((f, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: ORIGIN + pagePath(f),
          name: f.home + " vs " + f.away,
        })),
      })}</script>`,
  });
}

/* WHICH MATCH PAGES ARE WORTH ASKING GOOGLE TO CRAWL.
 *
 * Search Console, 13 Sep 2026: 84 pages indexed, 1,080 "Discovered - currently
 * not indexed". The sitemap was asking for 973 result pages of about 220 words
 * each, identical in shape and differing only in two team names and six
 * numbers. Google looked at that from a site with 189 clicks a month and
 * declined to spend the crawl, which is the correct call and not a bug to
 * argue with: a sitemap is a request, and a request for a thousand thin pages
 * is how a small site spends its budget on the pages it cares least about.
 *
 * So the ask is cut to where the demand actually is. "Club Brugge vs Antwerp
 * result" is searched for a day or two and then almost never; the day page that
 * lists all of them keeps its value for much longer and carries twenty to a
 * hundred and fifty results in one place. The day pages and the code days stay
 * in the sitemap whatever their age; a match page is submitted only inside the
 * window.
 *
 * TWO DAYS, AND THE NUMBER IS MEASURED RATHER THAN CHOSEN. The board carries
 * 47 leagues and the archive grows by about 66 results a day, so a fortnight
 * is 930 pages - the same ask that earned 1,080 "Discovered - currently not
 * indexed", with a different number on it. Two days is about 130, which is
 * within sight of the 84 pages this site has actually had indexed. Raise it
 * when the indexed count says there is room.
 *
 * NOTHING IS DELETED AND NOTHING IS NOINDEXED. Every page still exists, still
 * renders, and is still linked from its day page, so a reader following an old
 * link lands where they always did and Google can still crawl it whenever it
 * likes. This changes what we ASK for, which is the only part of it we control.
 */
const SITEMAP_DAYS = 2;

function inSitemapWindow(date, today, days) {
  const d = Date.parse(String(date || "") + "T00:00:00Z");
  const t = Date.parse(String(today || "") + "T00:00:00Z");
  if (!isFinite(d) || !isFinite(t)) return false;       /* a date we cannot read is not a page we submit */
  const span = (t - d) / 86400000;
  /* Future fixtures are inside it too: a page for tomorrow's game is the one
     with the most search demand of all. */
  return span <= (isFinite(days) ? days : SITEMAP_DAYS);
}

function renderSitemap(paths, lastmod) {
  const stamp = lastmod || new Date().toISOString().slice(0, 10);
  const ok = (d) => (typeof d === "string" && d.length === 10 &&
    d[4] === "-" && d[7] === "-" && !isNaN(Date.parse(d))) ? d : stamp;
  const urls = ["/"].concat(paths).map(e =>
    "  <url><loc>" + esc(ORIGIN + (typeof e === "string" ? e : (e && e.path))) +
      "</loc><lastmod>" + (typeof e === "string" ? stamp : ok(e && e.lastmod)) +
      "</lastmod></url>"
  ).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>\n";
}

function renderRobots() {
  return "User-agent: *\n" +
    "Allow: /\n" +
    /* THE CARD IMAGE LIVES UNDER /api AND CRAWLERS OBEY THIS FILE.
       This is why a shared slip showed no picture on X however correct its
       meta tags were: og:image points at /api/slipcard, Disallow: /api/ told
       Twitterbot not to fetch it, and a card with no image is not a card.
       Allow is matched by specificity, not by order, so the longer rule wins
       for this one path and everything else under /api stays closed.
       Anything else the crawlers must read has to be listed here too - a new
       image endpoint under /api is invisible by default. */
    "Allow: /api/slipcard\n" +
    "Disallow: /api/\n" +
    "\n" +
    "Sitemap: " + ORIGIN + "/sitemap.xml\n";
}

module.exports = { pagePath, renderMatchPage, renderSitemap, renderRobots, split100, ORIGIN, esc,
  inSitemapWindow, SITEMAP_DAYS, indexableUpcoming, INDEXED_UPCOMING,
  renderNotFound,
  renderPrivacy, renderTerms, renderHowItWorks, renderMatchesIndex,
  renderMatchesDay, matchesDayPath, groupByDate, renderHowToCode,
  renderConvertPage,
  renderCodesHub, renderCodesDay, codesDayPath, codeSummary, pushControl,
  SPORTY_SHARE, B9_SHARE, FOOTBALL_SHARE,
  pageFooter, staticPage, CONTACT, TELEGRAM };
