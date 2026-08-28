"use strict";

const test = require("node:test");
const assert = require("node:assert");

const P = require("../lib/pages.js");

/* A fixture as the payload actually carries it, trimmed to the fields the
   page reads. */
function fixture(extra) {
  return Object.assign({
    date: "2026-08-29",
    time: "14:00",
    kickoff: "2026-08-29T14:00:00.000Z",
    league: "Belgium Pro League",
    home: "RAAL La Louviere",
    away: "Mechelen",
    form_home: ["W", "L", "L", "L", "L"],
    form_away: ["L", "D", "D", "L", "W"],
    lh: 1.49, la: 1.2, score: "1-1",
    home_p: 0.4325, draw_p: 0.2692, away_p: 0.2983,
    dc1x: 0.7017, dc12: 0.7308, dcx2: 0.5675,
    o15: 0.7473, o25: 0.4987, o35: 0.2839, btts: 0.5435, fh_o05: 0.7121,
    tip: "1X, home or draw", tip_p: 0.7017,
  }, extra || {});
}

test("the url is stable, lowercase and carries the date", () => {
  assert.strictEqual(P.pagePath(fixture()),
    "/m/raal-la-louviere-vs-mechelen-2026-08-29");
});

/* Two matches between the same clubs in one season must not collide, or the
   second would overwrite the first's page. */
test("the same tie on another date is a different page", () => {
  const a = P.pagePath(fixture());
  const b = P.pagePath(fixture({ date: "2027-01-11" }));
  assert.notStrictEqual(a, b);
});

test("an upcoming match leads with the tip and its confidence", () => {
  const html = P.renderMatchPage(fixture(), null);
  assert.match(html, /1X, home or draw/);
  assert.match(html, /70% confidence/);
  assert.match(html, /<h1>RAAL La Louviere vs Mechelen prediction<\/h1>/);
});

test("the numbers a reader came for are all on the page", () => {
  const html = P.renderMatchPage(fixture(), null);
  for (const s of ["43%", "27%", "30%", "75%", "50%", "28%", "54%"]) {
    assert.ok(html.includes(s), "missing " + s);
  }
  assert.match(html, /1\.49/);        // expected goals
  assert.match(html, /Recent form/);
});

/* The whole point of the archive: the fixture URL keeps working and turns
   into the result, rather than 404ing or going stale. */
test("a played match becomes a result page at the same url", () => {
  const f = fixture();
  const r = { date: f.date, home: f.home, away: f.away, hg: 2, ag: 3,
              tip: "1X, home or draw", hit: false };
  const html = P.renderMatchPage(f, r);
  assert.match(html, /RAAL La Louviere 2-3 Mechelen/);
  assert.match(html, /Tip missed/);
  assert.match(html, /<h1>RAAL La Louviere vs Mechelen result<\/h1>/);
  assert.ok(!html.includes("Tip landed"));
});

test("a tip that landed says so", () => {
  const f = fixture();
  const html = P.renderMatchPage(f, { hg: 1, ag: 1, tip: f.tip, hit: true });
  assert.match(html, /Tip landed/);
  assert.ok(!html.includes("Tip missed"));
});

/* A result row carries no probabilities. Those sections must disappear rather
   than print a table of blanks. */
test("a match with no model numbers drops the tables instead of printing dashes", () => {
  const bare = { date: "2026-08-25", home: "Botafogo RJ", away: "Athletico-PR",
                 league: "Brazil Serie A" };
  const html = P.renderMatchPage(bare, { hg: 2, ag: 3, tip: "1X, home or draw", hit: false });
  assert.ok(!html.includes("Match outcome"));
  assert.ok(!html.includes("Recent form"));
  assert.ok(!html.includes("undefined"));
  /* Scoped to rendered values: the page's own script legitimately says
     isNaN(), so a bare search for "NaN" reports itself. */
  assert.ok(!/>NaN|NaN%/.test(html));
  assert.match(html, /Botafogo RJ 2-3 Athletico-PR/);
});

/* A club name is not ours to trust - it arrives from a feed. */
test("club names are escaped, not injected", () => {
  const html = P.renderMatchPage(fixture({ home: 'A<script>alert(1)</script>' }), null);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("every page states its own canonical url", () => {
  const f = fixture();
  const html = P.renderMatchPage(f, null);
  assert.ok(html.includes('rel="canonical" href="' + P.ORIGIN + P.pagePath(f) + '"'));
});

test("the structured data parses and names both sides", () => {
  const html = P.renderMatchPage(fixture(), null);
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, "no ld+json block");
  const ld = JSON.parse(m[1]);
  assert.strictEqual(ld["@type"], "SportsEvent");
  assert.strictEqual(ld.startDate, "2026-08-29T14:00:00.000Z");
  assert.deepStrictEqual(ld.competitor.map(c => c.name), ["RAAL La Louviere", "Mechelen"]);
});

/* Built on one machine, deployed from another: the same payload has to give
   the same bytes, or every build churns every page. */
test("rendering is deterministic", () => {
  assert.strictEqual(P.renderMatchPage(fixture(), null), P.renderMatchPage(fixture(), null));
});

test("the description is filled in and a sensible length", () => {
  const html = P.renderMatchPage(fixture(), null);
  const m = html.match(/<meta name="description" content="([^"]*)"/);
  assert.ok(m, "no description");
  assert.ok(m[1].length > 60 && m[1].length < 320, "length was " + m[1].length);
  assert.ok(!m[1].includes("undefined"));
});

test("the sitemap lists the home page and every match, absolute", () => {
  const xml = P.renderSitemap(["/m/a-vs-b-2026-08-29", "/m/c-vs-d-2026-08-29"], "2026-08-28");
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.ok(xml.includes("<loc>" + P.ORIGIN + "/</loc>"));
  assert.ok(xml.includes("<loc>" + P.ORIGIN + "/m/a-vs-b-2026-08-29</loc>"));
  assert.strictEqual((xml.match(/<url>/g) || []).length, 3);
});

test("robots points at the sitemap and keeps crawlers out of the api", () => {
  const txt = P.renderRobots();
  assert.match(txt, /Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  assert.match(txt, /Disallow: \/api\//);
});

/* The note explains the percentage tables. On a result page there are none,
   and a disclaimer about numbers that are not there reads as a template
   showing through. */
test("the percentages note only appears where there are percentages", () => {
  const rich = P.renderMatchPage(fixture(), null);
  assert.match(rich, /Percentages are our model/);
  const bare = P.renderMatchPage(
    { date: "2026-08-25", home: "A", away: "B", league: "L" },
    { hg: 1, ag: 0, tip: "1", hit: true });
  assert.ok(!bare.includes("Percentages are our model"));
});
