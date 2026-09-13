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
  assert.equal(P.inSitemapWindow("2026-09-01", today), true, "twelve days back");
  assert.equal(P.inSitemapWindow("2026-08-20", today), false, "three weeks back");
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
