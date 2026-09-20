"use strict";

/**
 * The head tags that decide whether anyone finds this site.
 *
 * Two of them were missing and it took a full audit to notice, because nothing
 * breaks when they are absent - the site works perfectly and simply ranks worse.
 *
 * The canonical matters more here than on an ordinary site. Every view is the
 * same URL with different state: board, builder, live scores and results are
 * all "/", and the day picker and share links hang query strings off it. With
 * no canonical, a crawler treats each of those as a separate page competing
 * with the others and splits the ranking of the one page that matters.
 *
 * The fragile part, and the reason this file exists rather than a one-time
 * check: scripts/prebuild.js extracts the BIGGEST inline <script> into a
 * hashed asset. The JSON-LD block is a <script>. It survives today only
 * because it is 400 bytes against 317KB - so the guard is not "is it there" but
 * "does it still survive the split".
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const IDX = path.join(__dirname, "..", "public", "index.html");
const html = fs.readFileSync(IDX, "utf8");

/* The prebuild's own helper, so this tracks it rather than guessing. */
function biggest(s, re) {
  let m, best = null; re.lastIndex = 0;
  while ((m = re.exec(s))) { if (!best || m[1].length > best[1].length) best = m; }
  return best;
}
function afterSplit(src) {
  let out = src;
  const style = biggest(out, /<style[^>]*>([\s\S]*?)<\/style>/g);
  if (style) out = out.replace(style[0], '<link rel="stylesheet" href="/app.x.css">');
  const script = biggest(out, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g);
  if (script) out = out.replace(script[0], '<script defer src="/app.x.js"></script>');
  return out;
}

test("the source carries the tags that decide discoverability", () => {
  for (const [what, re] of [
    ["canonical",        /<link[^>]+rel="canonical"[^>]+href="https?:\/\/[^"]+"/],
    ["og:url",           /<meta[^>]+property="og:url"[^>]+content="https?:\/\/[^"]+"/],
    ["og:title",         /property="og:title"/],
    ["og:image",         /property="og:image"/],
    ["twitter:card",     /name="twitter:card"/],
    ["description",      /<meta[^>]+name="description"/],
    ["viewport",         /name="viewport"/],
    ["JSON-LD",          /<script type="application\/ld\+json">/],
  ]) {
    assert.match(html, re, what + " is missing from index.html");
  }
});

test("the JSON-LD is valid and describes the site", () => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, "no JSON-LD block");
  let data;
  assert.doesNotThrow(() => { data = JSON.parse(m[1]); },
    "JSON-LD must parse - a malformed block is worse than none, it is ignored silently");
  assert.strictEqual(data["@context"], "https://schema.org");
  assert.ok(data["@type"], "needs an @type");
  assert.ok(data.url && /^https?:\/\//.test(data.url), "needs an absolute url");
});

/* The one that will actually catch a regression. */
test("the SEO tags survive the asset split", () => {
  const built = afterSplit(html);
  assert.match(built, /rel="canonical"/,
    "the canonical was lost when the page was built");
  assert.match(built, /property="og:url"/);
  assert.match(built, /<script type="application\/ld\+json">/,
    "the JSON-LD was extracted into the JS bundle, where no crawler will read it");
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(built);
  assert.doesNotThrow(() => JSON.parse(m[1]), "JSON-LD must still parse after the split");
});

test("the split takes the big application script, not a metadata block", () => {
  const script = biggest(html, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g);
  assert.ok(script[1].length > 100000,
    "the biggest inline script should be the app bundle; if it is not, the split " +
    "is about to extract the wrong thing");
});

test("every absolute URL in the head points at one origin", () => {
  /* applyOrigin() rewrites by plain string replace, so a stray second origin
     would survive a deploy and point somewhere wrong. */
  const head = html.slice(0, html.indexOf("</head>"));
  const origins = new Set();
  const re = /https?:\/\/[a-z0-9.-]+/gi;
  let m;
  while ((m = re.exec(head))) {
    const o = m[0].toLowerCase();
    /* Third-party references, not our own URLs: vocabularies, font and script
       CDNs, and the Sentry ingest host (the DSN is a URL and is public by
       design - it is in the shipped page already). */
    if (/schema\.org|w3\.org|googleapis|gstatic|fonts\.|sentry/.test(o)) continue;
    if (/^https:\/\/[0-9a-f]{32}$/.test(o)) continue;   // Sentry DSN public key
    origins.add(o);
  }
  assert.strictEqual(origins.size, 1,
    "head references more than one of our origins: " + [...origins].join(", "));
});

/* ------------------------------------------- what we ask Google to crawl */

test("the sitemap asks for recent match pages, not every one ever played", () => {
  /* Search Console, 13 Sep 2026: 84 indexed, 1,080 "Discovered - currently not
     indexed". The sitemap was asking for 973 result pages of about 220 words
     each, identical in shape. A sitemap is a request, and a request for a
     thousand thin pages is how a small site spends its crawl budget on the
     pages it cares least about. */
  const P = require("../lib/pages.js");
  const today = "2026-09-13";
  assert.equal(P.inSitemapWindow("2026-09-13", today), true, "today");
  assert.equal(P.inSitemapWindow("2026-09-11", today), true, "two days back");
  assert.equal(P.inSitemapWindow("2026-09-08", today), false, "five days back");
  /* The number is measured, not chosen: the archive grows by about 66 results
     a day, so every extra day is another 66 thin pages on the ask. */
  assert.ok(P.SITEMAP_DAYS <= 3, "the window is back to asking for hundreds of pages");
  /* A fixture that has not been played yet is the page with the most demand of
     all, so the window does not close in front of it. */
  assert.equal(P.inSitemapWindow("2026-09-20", today), true, "next week");
  /* An unreadable date is not a page we submit. */
  assert.equal(P.inSitemapWindow("", today), false);
  assert.equal(P.inSitemapWindow("not-a-date", today), false);
});

test("the build applies the window to match pages and to nothing else", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(src, /if \(played && P\.inSitemapWindow\(dated, todayISO\)\)/);
  /* Day pages and code days are the durable unit - one page carrying twenty to
     a hundred and fifty results - so they stay in the sitemap at any age. */
  const day = src.slice(src.indexOf("const byDay"), src.indexOf("standingWritten"));
  assert.doesNotMatch(day, /inSitemapWindow/,
    "the day pages have been put behind the window too");
});

test("seven leagues are indexed before kickoff, and the other thirty-three are not", () => {
  /* The narrow experiment opened 20 Sep 2026 - see INDEXED_UPCOMING in
     lib/pages.js for what it asks and when it is judged. The point of pinning
     it is that a league name here is matched EXACTLY against the payload's own
     string: a rename or a typo fails silently, indexing nothing, and looks
     exactly like an experiment that did not work. */
  const P = require("../lib/pages.js");
  const f = (league) => ({ date: "2026-09-25", league,
    home: "Arsenal", away: "Chelsea" });

  const top = P.renderMatchPage(f("England Premier League"), null, []);
  assert.doesNotMatch(top, /noindex/, "a top-league fixture is still noindexed before kickoff");
  assert.match(top, /rel="canonical"/, "an indexable page must state its canonical");

  const rest = P.renderMatchPage(f("Denmark Superliga"), null, []);
  assert.match(rest, /<meta name="robots" content="noindex,follow">/,
    "the experiment has leaked to leagues it was never about");
  assert.doesNotMatch(rest, /rel="canonical"/);

  /* Every name is one the live payload actually publishes. */
  for (const l of P.INDEXED_UPCOMING) {
    assert.ok(P.indexableUpcoming({ league: l }), l + " does not match itself");
  }
  assert.equal(P.indexableUpcoming({ league: "England Premier league" }), false,
    "the match is case-insensitive, so a payload rename would pass unnoticed");
  assert.equal(P.indexableUpcoming({}), false);
  assert.equal(P.indexableUpcoming(null), false);
});

test("an indexable unplayed page is submitted, and dated today rather than by its kickoff", () => {
  const P = require("../lib/pages.js");
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(src, /P\.indexableUpcoming\(pg\.f\) &&\s*\n?\s*P\.inSitemapWindow\(todayISO, dated\)/,
    "the forward window is gone, so every upcoming fixture in these leagues is submitted");
  /* Measured, not assumed: asked the usual way round it was 182 extra URLs,
     because inSitemapWindow lets ANY future date through. */
  assert.equal(P.inSitemapWindow("2026-09-20", "2026-09-21"), true, "tomorrow");
  assert.equal(P.inSitemapWindow("2026-09-20", "2026-09-27"), false, "next week");
  /* `dated` is the fixture's date and it is in the FUTURE. A lastmod we have
     not reached yet is a claim about a page that does not exist; renderSitemap
     stamps a bare string with the build date instead. */
  assert.match(src, /paths\.push\(rel\);/,
    "an unplayed page carries a lastmod, which would be a future date");
  const xml = P.renderSitemap(["/m/arsenal-vs-chelsea-2026-09-25"], "2026-09-20");
  assert.match(xml, /2026-09-25<\/loc><lastmod>2026-09-20</);
});
