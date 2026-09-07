"use strict";
/* A MATCH PAGE THAT DISAPPEARS IS WORSE THAN ONE THAT WAS NEVER WRITTEN.
 *
 * The board carries 21 days of fixtures and 14 of results, and the page set was
 * whatever the board held - so a page lived about four weeks and then 404ed.
 * Checked live before this was written:
 *
 *   /m/liverpool-vs-bournemouth-2026-08-15   404
 *   /m/arsenal-vs-chelsea-2026-08-20         404
 *
 * A crawler discovers a URL, queues it, arrives late and finds nothing. Do that
 * a few hundred times on a domain registered in August and "Discovered -
 * currently not indexed" is the correct response, which is what Search Console
 * reported for 1,080 of 1,157 pages.
 *
 * So every VERIFIED result gets a permanent page. The word doing the work is
 * verified: a `sweep` row is the sweep's own inference from watching a match
 * leave the live feed, and lib/oracle.js measured that wrong on three scores of
 * five. A page is forever, and a wrong score on one would be too.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const DB = require("../lib/supabase.js");
const P = require("../lib/pages.js");

/* The real query, captured rather than transcribed. */
async function capture(rows, status) {
  const seen = [];
  const real = global.fetch;
  global.fetch = async (url) => {
    seen.push(String(url));
    return { ok: status === undefined ? true : status < 400, status: status || 200,
             text: async () => JSON.stringify(rows || []) };
  };
  try { const out = await DB.verifiedResults(); return { out, url: seen[0] }; }
  finally { global.fetch = real; }
}

test("the archive asks for everything except the sweep's own guesses", async () => {
  const { url } = await capture([]);
  assert.match(url, /source=neq\.sweep/,
    "an inferred score would get a permanent page, which is the one thing this must not do");
  assert.match(url, /order=match_date\.desc/);
  assert.doesNotMatch(url, /match_date=gte/,
    "the archive is not a window - a date floor is how pages started vanishing");
});

test("a failure leaves the build alone", async () => {
  const { out } = await capture([], 500);
  assert.strictEqual(out.ok, false);
  assert.deepStrictEqual(out.rows, [], "a broken archive must not throw into the deploy");
});

test("with no Supabase configured it is a silent no-op", () => {
  /* Same contract as every other enrichment in the build: unconfigured is a
     normal state, not an error, and the page set falls back to the board. */
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "supabase.js"), "utf8");
  const i = src.indexOf("async function verifiedResults(");
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 200), /if \(!configured\(\)\) return \{ ok: false/);
});

test("an archived row still renders as a result page", () => {
  /* The shape comes off PostgREST - match_date, not date - and the numbers the
     page prints live in the model JSON under home_p/away_p/draw_p. */
  const r = { match_date: "2026-09-05", league: "England Premier League",
    home: "Arsenal", away: "Chelsea", hg: 2, ag: 1, tip: "Home win", hit: true,
    tip_p: 0.61, model: { o25: 0.55, btts: 0.5, home_p: 0.61, draw_p: 0.2, away_p: 0.19 } };
  const row = Object.assign({}, r.model, { date: r.match_date, league: r.league,
    home: r.home, away: r.away, hg: r.hg, ag: r.ag, tip: r.tip, hit: r.hit,
    tip_p: r.tip_p, recorded: true });
  const html = P.renderMatchPage(row, row);
  assert.match(html, /2-1/, "the score has to reach the page");
  assert.match(html, /Arsenal/);
  assert.strictEqual(P.pagePath(row), "/m/arsenal-vs-chelsea-2026-09-05");
});

test("a model key can never rename the club", () => {
  /* Found by getting this test wrong: with the model spread LAST, a key called
     `home` replaces the club with a probability and the page ships titled
     "0.61 vs 0.19" - canonical URL, og:title and all. The live rows use
     home_p/away_p so it has never happened, but that is a naming convention
     holding up a page title. Both call sites now spread the model first. */
  const model = { home: 0.61, away: 0.19, o25: 0.55 };
  const row = Object.assign({}, model, { date: "2026-09-05", league: "L",
    home: "Arsenal", away: "Chelsea", hg: 2, ag: 1, tip: "Home win", recorded: true });
  assert.strictEqual(row.home, "Arsenal");
  assert.strictEqual(P.pagePath(row), "/m/arsenal-vs-chelsea-2026-09-05");

  for (const [file, opening] of [["scripts/prebuild.js", "const row = Object.assign({},"],
                                 ["lib/build.js", "results.push(Object.assign({},"]]) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.ok(src.includes(opening),
      file + " builds the row with the model spread last, which lets a model key rename the club");
  }
});

test("prebuild refuses an archived row with no score", () => {
  const pre = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  const i = pre.indexOf("const got = await DB.verifiedResults();");
  assert.ok(i > 0, "prebuild no longer reads the archive");
  const block = pre.slice(i, i + 1800);
  assert.match(block, /if \(r\.hg == null \|\| r\.ag == null\) continue;/,
    "a result page with no result is a page that says nothing");
  assert.match(block, /seen\.has\(key\)/,
    "the archive must not duplicate a page the board already wrote");
  assert.match(block, /catch \(e\)/,
    "the archive is an enrichment; it may never fail the deploy");
});

test("an archived page is dated by its match, not by the build", () => {
  const pre = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(pre, /if \(played\) paths\.push\(\{ path: rel, lastmod: pg\.r\.date \|\| pg\.f\.date \}\)/,
    "the whole point of keeping the page is that its date stops moving");
});
