"use strict";
/**
 * National teams: the file needs three things before the fit can use it, and
 * each one fails quietly if it is missed. See lib/internationals.js.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const I = require("../lib/internationals.js");
const M = require("../lib/model.js");
const B = require("../lib/build.js");

const HEAD = "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral";

test("a neutral-venue match goes in both ways round, at half weight each", () => {
  /* The fit gives the home side home advantage. At a neutral venue there is
     no home side, so each orientation counts half and the term cancels. */
  const rows = I.parse([HEAD,
    "2026-06-20,Brazil,Morocco,2,1,FIFA World Cup,Houston,United States,TRUE"].join("\n"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.home, r.away, r.hg, r.ag, r.weight]),
    [["Brazil", "Morocco", 2, 1, 0.5], ["Morocco", "Brazil", 1, 2, 0.5]]);
});

test("a home match goes in once, at full weight", () => {
  const rows = I.parse([HEAD,
    "2025-09-05,Scotland,Denmark,1,1,FIFA World Cup qualification,Glasgow,Scotland,FALSE"].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weight, 1);
});

test("a friendly counts half, and half again at a neutral venue", () => {
  const rows = I.parse([HEAD,
    "2025-10-10,Japan,Paraguay,2,2,Friendly,Osaka,Japan,FALSE",
    "2025-11-14,Ghana,Japan,0,1,Friendly,London,England,TRUE"].join("\n"));
  assert.equal(rows[0].weight, 0.5);
  assert.equal(rows[1].weight, 0.25);
  assert.equal(rows[2].weight, 0.25);
});

test("the file's spellings become SportyBet's, which is what fixtures arrive with", () => {
  const rows = I.parse([HEAD,
    "2025-10-14,United States,South Korea,2,0,Friendly,Nashville,United States,FALSE",
    "2025-10-14,Turkey,Czech Republic,1,0,FIFA World Cup qualification,Istanbul,Turkey,FALSE"].join("\n"));
  assert.deepEqual([rows[0].home, rows[0].away, rows[1].home, rows[1].away],
    ["USA", "Korea Republic", "Turkiye", "Czechia"]);
});

test("unplayed fixtures and anything before the cutoff are left out", () => {
  const rows = I.parse([HEAD,
    "2022-03-24,Italy,North Macedonia,0,1,FIFA World Cup qualification,Palermo,Italy,FALSE",
    "2026-10-09,Wales,Belgium,NA,NA,FIFA World Cup qualification,Cardiff,Wales,FALSE"].join("\n"),
    "2023-07-01");
  assert.equal(rows.length, 0);
});

test("the fit honours a row's weight", () => {
  /* Without this the half-weights above are decoration: a neutral match would
     count twice and a friendly as much as a qualifier. The same 1-0 results,
     once at full weight and once at a tenth, must not produce the same
     ratings. */
  const base = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + i * 3));
    base.push({ date: d, league: "International", home: "Aland", away: "Borduria", hg: 1, ag: 0 });
    base.push({ date: d, league: "International", home: "Borduria", away: "Aland", hg: 1, ag: 1 });
  }
  const heavy = M.fitModel(base, { iters: 200 });
  const light = M.fitModel(base.map((m, i) => i % 2 ? m : Object.assign({}, m, { weight: 0.1 })), { iters: 200 });
  const a = (mdl) => mdl.att[mdl.index.tIdx.Aland];
  assert.notEqual(a(heavy).toFixed(4), a(light).toFixed(4));
});

test("national friendlies are rated but never published", () => {
  assert.equal(B.isUnratedCompetition("International Int. Friendly Games", null), true);
  assert.equal(B.isUnratedCompetition("International UEFA Nations League", null), false);
});

test("the committed copy is readable, recent, and big enough to fit", () => {
  const text = zlib.gunzipSync(fs.readFileSync(
    path.join(__dirname, "..", "data", "internationals", "results.csv.gz"))).toString("utf8");
  const rows = I.parse(text, "2023-07-01");
  assert.ok(rows.length > 2000, `only ${rows.length} rows since 2023-07-01`);
});

test("only senior men's national competitions go to the international fit", () => {
  /* The club and youth competitions share the "International" prefix. This
     regex was written once with a word boundary that a shell heredoc turned
     into a backspace character, and every one of these passed. */
  const yes = ["International UEFA Nations League", "International CONCACAF Nations League",
               "International Africa Cup of Nations Qualification"];
  const no = ["International Clubs UEFA Champions League", "International Clubs Club Friendly Games",
              "International Youth U21 UEFA European Championship, Qualification",
              "International Int. Friendly Games, Women",
              "Simulated Reality League UEFA Nations League SRL", "England Premier League"];
  for (const l of yes) assert.equal(I.isNationalCompetition(l), true, l);
  for (const l of no) assert.equal(I.isNationalCompetition(l), false, l);
});

test("no control characters hide in the module's source", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "internationals.js"), "utf8");
  assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(src), "a control character is in lib/internationals.js");
});

test("a national-team fixture never takes the pick from a club game", () => {
  /* Bahamas v Saint-Martin took the Pick of the day on 23 Sep 2026: a
     minnow tie's 90%, on 21 matches of Saint-Martin history. */
  const day = "2026-10-10", ko = "2026-10-10T18:00:00.000Z", now = Date.parse("2026-10-10T08:00:00Z");
  const fx = (home, away, p, extra) => Object.assign(
    { date: day, kickoff: ko, home, away, league: "X", tip: "1X", tip_p: p, tier: 1 }, extra || {});
  const club = fx("Arsenal", "Leeds", 0.80);
  const intl = fx("Bahamas", "Saint-Martin", 0.95, { intl: 1, league: "International CONCACAF Nations League" });
  const pick = B.choosePotd([intl, club], null, now);
  assert.equal(pick.home, "Arsenal", "a 95% minnow international outranked a club game");
  /* And on a day of internationals only, one of them still leads. */
  assert.equal(B.choosePotd([intl], null, now).home, "Bahamas");
});

test("an internationals-only day hands the pick to the next day's club game", () => {
  /* 23 Sep 2026: the rest of the day was internationals and the demerit had
     nothing to reorder, so Bahamas v Saint-Martin took the headline anyway. */
  const now = Date.parse("2026-09-23T15:00:00Z");
  const intl = { date: "2026-09-23", kickoff: "2026-09-23T22:00:00.000Z", home: "Bahamas",
                 away: "Saint-Martin", league: "International CONCACAF Nations League",
                 tip: "2", tip_p: 0.90, tier: 1, intl: 1 };
  const club = { date: "2026-09-24", kickoff: "2026-09-24T02:30:00.000Z", home: "Seattle Sounders",
                 away: "Real Salt Lake", league: "USA MLS", tip: "1X", tip_p: 0.74, tier: 1 };
  assert.equal(B.choosePotd([intl, club], null, now).home, "Seattle Sounders");
});
