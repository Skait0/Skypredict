"use strict";
/* THE HARVEST, AND THE ONE MISTAKE IT MUST NEVER MAKE.
 *
 * lib/liveresults.js turns SoccerVista's day into rows the model is fitted on.
 * Everything here is about club identity: a name resolved to the wrong club
 * writes a real result onto somebody else's rating and nothing downstream
 * reports it, while a name we cannot place costs exactly one match. So the
 * tests below check that it resolves what it should, and refuses - loudly and
 * countably - everything else.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../lib/model.js");
const B = require("../lib/build.js");
const L = require("../lib/liveresults.js");

const D = new Date("2026-09-05T00:00:00Z");
const m = (league, home, away) => ({ date: D, league, home, away, hg: 1, ag: 0 });

/* An index shaped like the real one: several divisions per country, and a club
   sitting in the division it played in LAST season. */
const idx = M.buildIndex([
  m("England Premier League", "Nott'm Forest", "Arsenal"),
  m("England Championship", "Sheffield Weds", "Leicester"),
  m("England League 1", "Peterboro", "Wigan"),
  m("Spain La Liga 1", "Girona", "Real Madrid"),
  m("Spain La Liga 2", "Sp Gijon", "Mirandes"),
]);
const allowed = new Set([].concat(
  Object.values(B.MAIN),
  Object.keys(B.EXTRA).map((c) => c + " " + B.EXTRA[c]),
  L.HARVEST_EXTRA));
const warming = new Set(L.HARVEST_EXTRA);

const row = (league, home, away) => ({ league, home, away, hg: 2, ag: 1 });

test("a club in the league the feed names resolves", () => {
  const out = L.resolve([row("England Premier League", "Arsenal", "Nott'm Forest")],
    idx, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 1);
  assert.deepStrictEqual(
    [out.matches[0].home, out.matches[0].away, out.matches[0].league],
    ["Arsenal", "Nott'm Forest", "England Premier League"]);
});

test("a relegated club is still the same club, and keeps the feed's league", () => {
  /* The failure this exists for: on 5 Sep 2026 the index had Sheffield
     Wednesday and Leicester in the Championship because football-data was down
     and last season is all the floor holds. Every promoted and relegated side
     failed to resolve - 65 of 258 rows - and they are the clubs we have the
     most history for. */
  const out = L.resolve([row("England League 1", "Leicester", "Sheffield Weds")],
    idx, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 1, JSON.stringify(out.dropped));
  assert.strictEqual(out.matches[0].league, "England League 1",
    "the feed describes this season; the index remembers last one");
});

test("a name that fits two clubs in two divisions is refused, not guessed", () => {
  /* Synthetic spellings, because a real collision is rare - and catastrophic
     when it happens, which is the whole reason the widened search demands a
     unique hit. Both index names below clear matchTeam's 0.82 bar against the
     feed's name, in different divisions of the same country. */
  const collide = M.buildIndex([
    m("Scotland Premiership", "Athletic Rangers FC", "Celtic"),
    m("Scotland League 1", "Athletic Rangers AC", "Falkirk"),
    m("Scotland Championship", "Ayr", "Morton"),
  ]);
  const out = L.resolve([row("Scotland Championship", "Athletic Rangers", "Ayr")],
    collide, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 0);
  assert.strictEqual(out.dropped.club, 1);
});

test("an alias outranks a closer-looking club in the same country", () => {
  /* Gijon is one edit closer to Girona than to Sp Gijon. Without the alias
     table this row lands on the wrong club, in the wrong division, silently. */
  const out = L.resolve([row("Spain La Liga 2", "Gijon", "Mirandes")],
    idx, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 1, JSON.stringify(out.dropped));
  assert.strictEqual(out.matches[0].home, "Sp Gijon");
});

test("a competition we hold no ratings for is dropped as a league, not a club", () => {
  const out = L.resolve([row("England NPL Premier Division", "Buxton", "Marine")],
    idx, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 0);
  assert.strictEqual(out.dropped.league, 1);
  assert.strictEqual(out.dropped.club, 0);
});

test("a row with no score, or a club against itself, never reaches the fit", () => {
  const out = L.resolve([
    { league: "England Premier League", home: "Arsenal", away: "Nott'm Forest", hg: null, ag: 1 },
    { league: "England Premier League", home: "Arsenal", away: "Arsenal", hg: 1, ag: 1 },
  ], idx, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 0);
  assert.strictEqual(out.dropped.malformed, 2);
});

test("their league names still map to ours", () => {
  /* If they rename a league this is the only thing that notices: an unmapped
     name is not an error anywhere, it is simply a division that stops being
     harvested. */
  for (const [theirs, ours] of Object.entries(L.LEAGUE_ALIAS)) {
    assert.ok(allowed.has(ours),
      `${theirs} maps to ${ours}, which is not a league the build fits on`);
  }
});

test("what the script writes is what the build reads back", () => {
  /* The contract between scripts/mkresults.js and lib/build.js is a CSV in the
     generic layout. Round-tripping it here is what stops a change to either
     side quietly halving the corpus. */
  const written = L.toCSV([
    { date: "2026-09-05", league: "England Premier League",
      home: "Nott'm Forest", away: "Arsenal", hg: 2, ag: 1 },
  ]);
  const res = M.normalise(M.parseCSV(written));
  assert.ok(!res.error, res.error);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].home, "Nott'm Forest");
  assert.strictEqual(res.matches[0].league, "England Premier League");
  assert.strictEqual(res.matches[0].hg, 2);
  assert.strictEqual(res.matches[0].date.toISOString().slice(0, 10), "2026-09-05");
});

test("the committed harvest is readable and lands in the fit", () => {
  /* Drives the real file through the real loader, because a corpus that is
     present but unreadable looks exactly like no outage at all. */
  const dir = path.join(__dirname, "..", "data", "results");
  const live = fs.readdirSync(dir).filter((n) => /^live_.+\.csv(\.gz)?$/.test(n));
  assert.ok(live.length, "no harvested season committed - run scripts/mkresults.js");
  const floor = B.loadFloorMatches();
  const newest = floor.reduce((a, x) => (x.date > a ? x.date : a), new Date(0));
  assert.ok(newest.getTime() > Date.parse("2026-08-31"),
    "the floor plus the harvest should reach past the last football-data day");
});

test("prebuild's whitelist prints the harvest line", () => {
  /* Same trap as the committed-floor line before it: build.js said
     "unreachable" while the filter tested for "unavailable", so the most
     important diagnostic in the build printed into a void. */
  const script = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  const found = script.match(/\.filter\(\(l\) => (\/.+\/i)\.test\(l\)\)/);
  assert.ok(found, "the build-log whitelist must still be findable in prebuild.js");
  const whitelist = eval(found[1]);
  assert.ok(whitelist.test("+317 harvested results through 2026-09-07 (scripts/mkresults.js)"));
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.ok(build.includes("harvested results through"),
    "build.js no longer emits the line the whitelist is keyed on");
});

/* ------------------------------------------------- leagues with no history */

test("a warming league starts itself: unknown clubs are taken at the feed's spelling", () => {
  /* Without this the first harvest of Netherlands Eerste Divisie dropped all
     22 rows, and would have every week forever - findClub asks the index and
     the index has nothing. The league could never begin. */
  const out = L.resolve([row("Netherlands Eerste Divisie", "FC Emmen", "Helmond Sport")],
    idx, allowed, "2026-09-05", warming);
  assert.strictEqual(out.matches.length, 1, JSON.stringify(out.dropped));
  assert.deepStrictEqual([out.matches[0].home, out.matches[0].away],
    ["FC Emmen", "Helmond Sport"]);
});

test("a club relegated into a warming league is recognised, not minted twice", () => {
  /* The whole risk of minting: the same club under two spellings, each with
     half its history and neither with a usable rating. findClub runs first. */
  const relegated = M.buildIndex([
    m("Netherlands Eredivisie", "Volendam", "Ajax"),
  ]);
  const out = L.resolve([row("Netherlands Eerste Divisie", "Volendam", "Helmond Sport")],
    relegated, allowed, "2026-09-05", warming);
  assert.strictEqual(out.matches.length, 1, JSON.stringify(out.dropped));
  assert.strictEqual(out.matches[0].home, "Volendam");
  assert.strictEqual(out.matches[0].league, "Netherlands Eerste Divisie");
});

test("minting never invents a youth or reserve side", () => {
  /* This is the one path that skips matchTeam, and matchTeam is what normally
     refuses these. A youth game priced off the first team is the worst thing
     this codebase can publish. */
  const out = L.resolve([
    row("Netherlands Eerste Divisie", "Jong Ajax", "Helmond Sport"),
    row("Netherlands Eerste Divisie", "FC Emmen U21", "Helmond Sport"),
  ], idx, allowed, "2026-09-05", warming);
  assert.strictEqual(out.matches.length, 0);
  assert.strictEqual(out.dropped.club, 2);
});

test("without the warming set, an unknown league is still refused", () => {
  const out = L.resolve([row("Netherlands Eerste Divisie", "FC Emmen", "Helmond Sport")],
    idx, allowed, "2026-09-05");
  assert.strictEqual(out.matches.length, 0);
  assert.strictEqual(out.dropped.league, 1);
});

test("a warming league is harvested but stays out of the fit until it is thick enough", () => {
  /* The gate is minLeagueMatches, which already existed - warming needs no
     switch of its own. This applies the build's own thin-league rule to the
     real corpus: a league below the line must not survive into the fit, and
     one above it must. */
  const all = B.loadFloorMatches();
  const counts = {};
  for (const x of all) counts[x.league] = (counts[x.league] || 0) + 1;
  const fitted = all.filter((x) => counts[x.league] >= B.DEFAULTS.minLeagueMatches);
  const index = M.buildIndex(fitted);
  let seen = 0;
  for (const league of L.HARVEST_EXTRA) {
    const n = counts[league] || 0;
    if (n === 0) continue;
    seen++;
    if (n < B.DEFAULTS.minLeagueMatches) {
      assert.strictEqual(index.lIdx[league], undefined,
        league + " has only " + n + " results and is being fitted anyway");
    } else {
      assert.notStrictEqual(index.lIdx[league], undefined,
        league + " has " + n + " results and should now be fitted");
    }
  }
  assert.ok(seen > 0, "no warming league has been harvested at all - check mkresults.js");
});

test("every warming league has a rung, or its cup ties are refused", () => {
  /* tierEdge returns null for a league with no rung and the fixture is dropped
     as "tiers not comparable". Listing the league without laddering it would
     publish nothing and explain nothing. */
  for (const league of L.HARVEST_EXTRA) {
    assert.notStrictEqual(B.rungOf(league), null,
      league + " has no rung: every cup tie touching it would be refused");
  }
});

test("the senior-league exclusion lets go once we actually rate the league", () => {
  /* UNRATED_LEAGUES is a statement about our data. Deleting an entry by hand
     when results arrive is the step that gets forgotten. */
  assert.strictEqual(B.isUnratedCompetition("Denmark 1. Division"), true,
    "with no ratings it must still be refused");
  const rated = M.buildIndex([m("Denmark 1. Division", "Hobro", "Hvidovre IF")]);
  assert.strictEqual(B.isUnratedCompetition("Denmark 1. Division", rated), false,
    "once fitted, the exclusion has to release on its own");
  assert.strictEqual(B.isUnratedCompetition("Germany Amateur Frauen Bundesliga", rated), true,
    "the youth and women's rule is not a data statement and never releases");
});
