"use strict";
/* Owner, 17 Oct 2026 ("go 2"): the feed proxies pair our fixtures with each
   book's events once, with the page's own matcher, instead of every phone. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("lib/pairmatch.js is the page's matcher, byte for byte", () => {
  const { buildPairing } = require("../scripts/mkteammatch.js");
  const lf = (s) => s.replace(/\r\n/g, "\n");
  const src = lf(fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8"));
  assert.strictEqual(lf(fs.readFileSync(path.join(__dirname, "..", "lib", "pairmatch.js"), "utf8")), buildPairing(src),
    "lib/pairmatch.js is stale - run: node scripts/mkteammatch.js");
});

const KO = "2026-10-18T14:00:00.000Z", T = Date.parse(KO);
const preds = { generatedAt: "2026-10-18T05:00:00Z", fixtures: [
  { date: "2026-10-18", home: "Arsenal", away: "Leeds United", kickoff: KO, league: "England Premier League" },
  { date: "2026-10-18", home: "Real Betis", away: "Barcelona", kickoff: KO, league: "Spain La Liga" },
  { date: "2026-10-18", home: "Nowhere FC", away: "Ghost Town", kickoff: KO, league: "England Premier League" }] };
const sporty = { matches: [
  { eventId: "sr:match:11", homeTeam: "Arsenal", awayTeam: "Leeds United", startTime: T, league: "England Premier League" },
  { eventId: "sr:match:22", homeTeam: "Betis", awayTeam: "FC Barcelona", startTime: T, league: "Spain LaLiga" }] };

function withFetch(routes, fn) {
  const real = global.fetch;
  global.fetch = async (url) => {
    const body = routes[String(url).replace("https://x.test", "")];
    return { ok: !!body, status: body ? 200 : 404, json: async () => body };
  };
  return fn().finally(() => { global.fetch = real; });
}

test("SportyBet's events are paired once, keyed by fixture, unpaired ones as null", async () => {
  await withFetch({ "/predictions.json": preds }, async () => {
    const { pairsFor } = require("../lib/pairs.js");
    const p = await pairsFor("fixtures", sporty, "https://x.test");
    assert.strictEqual(p.for, preds.generatedAt, "stamped with the predictions it was made from");
    assert.deepStrictEqual(p.ids, { m20261018ArsenalLeedsUnited: "sr:match:11", m20261018RealBetisBarcelona: "sr:match:22", m20261018NowhereFCGhostTown: null });
  });
});

test("another book is paired after SportyBet, the way the page does it", async () => {
  const bet9ja = { matches: { 7: { eventId: 7, teams: "Arsenal - Leeds", kickoff: KO, league: "England Premier League" } } };
  await withFetch({ "/predictions.json": preds, "/api/fixtures": sporty }, async () => {
    const { pairsFor } = require("../lib/pairs.js");
    const p = await pairsFor("bet9ja", bet9ja, "https://x.test");
    assert.strictEqual(p.ids.m20261018ArsenalLeedsUnited, 7);
    assert.strictEqual(p.ids.m20261018RealBetisBarcelona, null);
  });
});

test("no predictions, no table: the page matches as before", async () => {
  await withFetch({}, async () => {
    const { pairsFor } = require("../lib/pairs.js");
    await assert.rejects(pairsFor("fixtures", sporty, "https://y.test"));
    assert.strictEqual(await pairsFor("nope", sporty, "https://x.test"), null);
  });
});

test("the page uses the table only for its own predictions", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(src, /if\(!ids\|\|!DATA\|\|pairs\.for!==DATA\.generatedAt\) return attachEventIds\(rows,B,sliced\);/);
  assert.match(src, /attachWithPairs\(rows,B,d&&d\.pairs,true\)/, "second books");
});
