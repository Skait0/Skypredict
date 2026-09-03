"use strict";

/**
 * The score oracle, and the matcher it rests on.
 *
 * Reported twice: "why is bayern munich reporting 1-0 when the scores is 4-1?"
 * and then, a day later, the same match still reading "1-0 Miss" on the past
 * results page.
 *
 * The first report was diagnosed as a scraper bug and the scraper was fixed.
 * That was necessary and it was not the cause. The cause is that a final score
 * was being INFERRED - the sweep remembered the last score it saw and treated
 * it as final once the match dropped out of the live feed past the 80th
 * minute. Checked against an authoritative source for 28 Aug 2026, three of
 * five banked scores were wrong and two verdicts with them, and both wrong
 * verdicts were hits published as misses.
 *
 * The tell that it is not a scraper bug: Milan v Venezia was banked 1-0 when
 * half time was 0-0 and full time was 2-0. That is not a half-time score, it
 * is a snapshot taken before the end. About a fifth of goals arrive after the
 * 80th minute, so the inference cannot be repaired - only replaced.
 *
 * These tests cover the replacement. The matcher gets the most attention,
 * because a wrong pairing writes a wrong score and that is the exact failure
 * being fixed.
 */

const test = require("node:test");
const assert = require("node:assert");

const O = require("../lib/oracle.js");

/* ------------------------------------------------------------- the matcher */

/* Real pairings, taken from a live comparison of our board against the API on
   2026-08-29. Every one of these must resolve, because each is a fixture we
   would otherwise publish no result for. */
const SAME = [
  ["FC Koln", "1. FC Köln"],
  ["M'gladbach", "Borussia Mönchengladbach"],
  ["Ein Frankfurt", "Eintracht Frankfurt"],
  ["Nott'm Forest", "Nottingham Forest"],
  ["Peterboro", "Peterborough"],
  ["Sheffield United", "Sheffield Utd"],
  ["Dundee United", "Dundee Utd"],
  ["Queen of Sth", "Queen of the South"],
  ["Dortmund", "Borussia Dortmund"],
  ["Hamburg", "Hamburger SV"],
  ["Nurnberg", "1. FC Nürnberg"],
  ["Bielefeld", "Arminia Bielefeld"],
  ["Cambridge", "Cambridge United"],
  ["RAAL La Louviere", "RAAL La Louvière"],
  ["Mechelen", "KV Mechelen"],
  ["Man City", "Manchester City"],
  ["Bayern Munich", "Bayern München"],
  ["Stuttgart", "VfB Stuttgart"],
  ["Paris SG", "Paris Saint Germain"],
  ["Milan", "AC Milan"],
];

test("names for the same club resolve to a full match", () => {
  for (const [ours, theirs] of SAME) {
    assert.strictEqual(O.similarity(ours, theirs), 1,
      `"${ours}" should match "${theirs}" (got ${O.similarity(ours, theirs)})`);
  }
});

test("accents and punctuation are not a difference", () => {
  assert.strictEqual(O.similarity("Malmo FF", "Malmö FF"), 1);
  assert.strictEqual(O.similarity("Queen's Park", "Queens Park"), 1);
});

/* Two clubs that merely share a word must not be confused. similarity() is the
   lenient half of the matcher by design - a club's own name is usually the
   short one - so the bar these have to clear is the one findMatch applies. */
const DIFFERENT = [
  ["Manchester City", "Manchester United"],
  ["Sheffield United", "Sheffield Wednesday"],
  ["Nottingham Forest", "Nottingham"],
  ["Bayern Munich", "Bayern Hof"],
  ["Real Madrid", "Real Sociedad"],
  ["Atletico Madrid", "Athletic Bilbao"],
];

test("clubs that only share a word do not match", () => {
  for (const [a, b] of DIFFERENT) {
    assert.ok(O.similarity(a, b) < 1,
      `"${a}" must not fully match "${b}" (got ${O.similarity(a, b)})`);
  }
});

/* The reserve-team trap, which is what actually threatens the data: a second
   XI carries the first team's name, and writing its score onto a first-team
   prediction is exactly the failure this file exists to prevent. */
test("a reserve or youth side never answers for the first team", () => {
  const rows = [
    { home: "Stuttgart II", away: "Bayern Munich II", hg: 3, ag: 0 },
    { home: "Arsenal U21", away: "Chelsea U21", hg: 1, ag: 1 },
    { home: "Barcelona Women", away: "Real Madrid Women", hg: 4, ag: 0 },
  ];
  assert.strictEqual(O.findMatch(rows, "Stuttgart", "Bayern Munich"), null,
    "the reserves' result must not be read as the first team's");
  assert.strictEqual(O.findMatch(rows, "Arsenal", "Chelsea"), null);
  assert.strictEqual(O.findMatch(rows, "Barcelona", "Real Madrid"), null);
  /* And the reverse: a first-team row must not answer for the reserves. */
  assert.strictEqual(O.findMatch([{ home: "Stuttgart", away: "Bayern Munich", hg: 1, ag: 1 }],
    "Stuttgart II", "Bayern Munich II"), null);
});

test("the exact club wins over one that merely contains its name", () => {
  const rows = [
    { home: "Inter Miami", away: "Orlando City", hg: 3, ag: 1 },
    { home: "Inter", away: "Roma", hg: 2, ag: 0 },
  ];
  const m = O.findMatch(rows, "Inter", "Roma");
  assert.ok(m, "Inter v Roma should resolve");
  assert.strictEqual(m.home, "Inter");
  assert.strictEqual(m.hg, 2, "and must not pick up Inter Miami's score");
});

test("an ambiguous pairing is refused rather than guessed", () => {
  /* Two rows fitting equally well: no answer is the safe answer. */
  const rows = [
    { home: "Arsenal", away: "Chelsea", hg: 1, ag: 0 },
    { home: "Arsenal", away: "Chelsea", hg: 2, ag: 2 },
  ];
  assert.strictEqual(O.findMatch(rows, "Arsenal", "Chelsea"), null);
});

test("a pairing needs BOTH clubs, not one", () => {
  const rows = [{ home: "Manchester City", away: "Arsenal", hg: 2, ag: 1 }];
  /* Home is right, away is a different club: no match at all. */
  assert.strictEqual(O.findMatch(rows, "Man City", "Aston Villa"), null);
  /* Both right: matched. */
  assert.ok(O.findMatch(rows, "Man City", "Arsenal"));
});

test("nothing matches an empty or absent name", () => {
  assert.strictEqual(O.similarity("", "Arsenal"), 0);
  assert.strictEqual(O.similarity(null, "Arsenal"), 0);
  assert.strictEqual(O.similarity("Arsenal", undefined), 0);
  assert.strictEqual(O.findMatch([], "Arsenal", "Chelsea"), null);
  assert.strictEqual(O.findMatch(null, "Arsenal", "Chelsea"), null);
});

/* ------------------------------------------------------------- parsing */

/* The API always sends a `score` block alongside `goals`, so a fixture built
   without one is not a shape this parser ever meets. `score.fulltime` defaults
   to `goals` here, which is the FT case; a cup tie passes its own. */
function fx(short, hg, ag, home, away, score) {
  return { fixture: { status: { short } }, goals: { home: hg, away: ag },
           score: score || { halftime: { home: null, away: null },
                             fulltime: { home: hg, away: ag },
                             extratime: { home: null, away: null },
                             penalty: { home: null, away: null } },
           teams: { home: { name: home }, away: { name: away } },
           league: { name: "Test League" } };
}

test("only finished matches are treated as results", () => {
  const rows = O.parseFixtures({ response: [
    fx("FT", 2, 1, "A", "B"),
    fx("AET", 3, 2, "C", "D"),
    fx("PEN", 1, 1, "E", "F"),
    fx("1H", 1, 0, "G", "H"),      // in play
    fx("HT", 1, 0, "I", "J"),      // half time
    fx("PST", null, null, "K", "L"), // postponed
    fx("ABD", 1, 0, "M", "N"),     // abandoned
  ]});
  assert.deepStrictEqual(rows.map(r => r.home), ["A", "C", "E"],
    "an in-play or abandoned match is not a final score");
});

test("a finished match with no goals recorded is not a result", () => {
  const rows = O.parseFixtures({ response: [fx("FT", null, null, "A", "B")] });
  assert.deepStrictEqual(rows, []);
});

test("junk in gives nothing out rather than throwing", () => {
  assert.deepStrictEqual(O.parseFixtures(null), []);
  assert.deepStrictEqual(O.parseFixtures({}), []);
  assert.deepStrictEqual(O.parseFixtures({ response: null }), []);
  assert.deepStrictEqual(O.parseFixtures({ response: [null, {}] }), []);
});


/* --------------------------------------------- 90 minutes, not 120 or a shootout

   Every market on the board settles on the 90-minute score. `goals` is the
   score the fixture ENDED on, so reading it graded cup ties against extra time
   and wrote wrong rows into the record. */

test("a cup tie won in extra time is a DRAW to every market we grade", () => {
  const rows = O.parseFixtures({ response: [
    fx("AET", 3, 1, "Basel", "Servette", {
      halftime:  { home: 0, away: 0 },
      fulltime:  { home: 1, away: 1 },   // level after 90 - the score that settles
      extratime: { home: 3, away: 1 },
      penalty:   { home: null, away: null },
    }),
  ]});
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].hg, 1, "the home side did not score 3 inside 90 minutes");
  assert.strictEqual(rows[0].ag, 1);
});

test("a shootout does not decide a 1X2 - the 90-minute score does", () => {
  const rows = O.parseFixtures({ response: [
    fx("PEN", 0, 0, "Zurich", "Lugano", {
      halftime:  { home: 0, away: 0 },
      fulltime:  { home: 0, away: 0 },
      extratime: { home: 0, away: 0 },
      penalty:   { home: 4, away: 2 },   // 4-2 on penalties settles NOTHING we offer
    }),
  ]});
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].hg, 0, "a shootout was counted as a goal");
  assert.strictEqual(rows[0].ag, 0);
});

test("an ordinary FT match is unchanged - goals and fulltime agree", () => {
  const rows = O.parseFixtures({ response: [fx("FT", 2, 1, "A", "B")] });
  assert.strictEqual(rows[0].hg, 2);
  assert.strictEqual(rows[0].ag, 1);
});

test("FT still reads a score when the API sends no score block at all", () => {
  const bare = { fixture: { status: { short: "FT" } }, goals: { home: 2, away: 1 },
                 teams: { home: { name: "A" }, away: { name: "B" } },
                 league: { name: "Test League" } };
  const rows = O.parseFixtures({ response: [bare] });
  assert.deepStrictEqual([rows.length, rows[0].hg, rows[0].ag], [1, 2, 1]);
});

test("a cup tie with no 90-minute score is dropped, never guessed from goals", () => {
  const noFt = { fixture: { status: { short: "AET" } }, goals: { home: 3, away: 1 },
                 teams: { home: { name: "A" }, away: { name: "B" } },
                 league: { name: "Test League" } };
  assert.deepStrictEqual(O.parseFixtures({ response: [noFt] }), [],
    "guessing 3-1 here would settle an over line on extra-time goals");
});

test("ninety() reads fulltime ahead of goals", () => {
  assert.deepStrictEqual(O.ninety(fx("AET", 3, 1, "A", "B",
    { fulltime: { home: 1, away: 1 } })), [1, 1]);
  assert.strictEqual(O.ninety({ fixture: { status: { short: "PEN" } },
    goals: { home: 1, away: 1 } }), null);
  assert.strictEqual(O.ninety(null), null);
});

/* ------------------------------------------------------------- degradation */

test("with no key configured, every call is a polite no-op", async () => {
  const had = process.env.APISPORTS_KEY;
  delete process.env.APISPORTS_KEY;
  try {
    assert.strictEqual(O.configured(), false);
    const r = await O.resultsFor("2026-08-29");
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.why, "not configured");
    assert.deepStrictEqual(r.rows, []);
  } finally {
    if (had !== undefined) process.env.APISPORTS_KEY = had;
  }
});

/* ------------------------------------------------- the reported fixtures */

/* The five matches from the report, with the score the sweep banked and the
   score they actually finished on. This pins the thing the whole change is
   for: given the real final score, our own grader returns the right verdict. */
test("the reported matches grade correctly off a real final score", () => {
  const G = require("../lib/grade.js");
  const cases = [
    // tip,                banked,  actual, what the page showed, the truth
    ["Over 1.5",           [1, 0],  [5, 1], false, true],   // Bayern v Stuttgart
    ["X2, draw or away",   [2, 1],  [2, 2], false, true],   // Lille v Paris SG
    ["1X, home or draw",   [1, 0],  [2, 0], true,  true],   // Milan v Venezia
    ["X2, draw or away",   [1, 4],  [1, 4], true,  true],   // Crystal Palace v Man City
    ["X2, draw or away",   [1, 0],  [1, 0], false, false],  // Alaves v Villarreal
  ];
  for (const [tip, banked, actual, shown, truth] of cases) {
    assert.strictEqual(G.gradeLabel(tip, banked[0], banked[1]), shown,
      `precondition: ${tip} on ${banked.join("-")} is what the page printed`);
    assert.strictEqual(G.gradeLabel(tip, actual[0], actual[1]), truth,
      `${tip} on the real ${actual.join("-")} should be ${truth}`);
  }
});
