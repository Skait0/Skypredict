// Tests for the SportyBet matching logic that lives inline in index.html.
// We extract the real normTeam/tokset/simTeams/attachEventIds source and eval
// it with stubs, so we're testing the SHIPPED code, not a reimplementation.
//
// Run:  node --test        (from repo root)  or  npm test

const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

// Slice from `var BOOKS={` through the end of attachEventIds().
//
// It used to start at TEAM_ALIASES. BOOKS sits above that - it is the table
// telling the matcher which bookmaker's fields it is filling in - and leaving
// it out made every test here die on "BOOKS is not defined". The fix is to
// widen the slice rather than hand the factory a BOOKS of our own: a
// hand-written one would be a reimplementation, and the point of this file is
// to run the code the site ships.
const start = html.indexOf("var BOOKS={");
const anchor = html.indexOf("return hits;", start);
const end = html.indexOf("}", anchor) + 1;
if (start < 0 || anchor < 0) throw new Error("could not locate matching code in index.html");
const slice = html.slice(start, end);

// Build a factory that closes over injected DATA + blendFixture stub and returns
// the real functions. attachEventIds reads DATA.fixtures and calls blendFixture.
const factory = new Function(
  "DATA", "blendFixture",
  slice + "\nreturn { normTeam, tokset, simTeams, attachEventIds, BOOKS };"
);
function makeApi(fixtures) {
  const DATA = { fixtures };
  return { DATA, api: factory(DATA, function () {}) };
}
const { api } = makeApi([]);

const TS = new Date("2026-08-24T12:00:00Z").getTime();  // start time within the window

test("normTeam folds Scandinavian transliteration variants", () => {
  assert.equal(api.normTeam("Brondby"), api.normTeam("Broendby IF"));
  assert.equal(api.normTeam("Valerenga"), api.normTeam("Vaalerenga IF"));
  assert.equal(api.normTeam("Bodo/Glimt"), api.normTeam("Bodoe/Glimt"));
});

test("normTeam folds spelling variants (RU/AR)", () => {
  assert.equal(api.normTeam("Dynamo Moscow"), api.normTeam("FK Dinamo Moscow"));
  assert.equal(api.normTeam("Akron Togliatti"), api.normTeam("FK Akron Tolyatti"));
  assert.equal(api.normTeam("Argentinos Jrs"), api.normTeam("Argentinos Juniors"));
  assert.equal(api.normTeam("Athletico-PR"), api.normTeam("CA Paranaense PR"));
});

test("simTeams: exact=2.0, substring high, unrelated low", () => {
  assert.equal(api.simTeams("Arsenal", "Arsenal"), 2.0);
  assert.ok(api.simTeams("Bayern", "Bayern Munich") >= 1.8);
  assert.ok(api.simTeams("Arsenal", "Chelsea") < 0.6);
});

test("normTeam does NOT collapse distinct clubs (no false alias)", () => {
  // Atletico (no h) vs Athletico (Brazilian) vs Athletic (Bilbao) stay distinct
  assert.notEqual(api.normTeam("Atletico Madrid"), api.normTeam("Athletico Paranaense"));
  assert.notEqual(api.normTeam("Athletic Bilbao"), api.normTeam("Athletico Paranaense"));
});

// The 17 real no-match pairs from production logs: [ourH, ourA, sportyH, sportyA, shouldMatch]
const PAIRS = [
  ["Racing Club","Boca Juniors","Gimnasia y Esgrima Mendoza","Boca Juniors", false],
  ["Lanus","Argentinos Jrs","CA Lanus","Argentinos Juniors", true],
  ["Botafogo RJ","Athletico-PR","Botafogo FR RJ","CA Paranaense PR", true],
  ["Brondby","Silkeborg","Broendby IF","Silkeborg IF", true],
  ["Atl. San Luis","Pachuca","San Luis de Quillota","Santiago Wanderers", false],
  ["UNAM Pumas","Necaxa","Fulham","Chelsea", false],
  ["Atlanta Utd","Sporting Kansas City","Atlanta United FC","Charlotte FC", false],
  ["Valerenga","Molde","Vaalerenga IF","Molde", true],
  ["Bodo/Glimt","Rosenborg","Bodoe/Glimt","Rosenborg BK", true],
  ["Lillestrom","Fredrikstad","Lille","PSG", false],
  ["Hacken","Vasteras SK","BK Hacken","Vasteraas SK", true],
  ["Akron Togliatti","CSKA Moscow","FK Akron Tolyatti","CSKA Moscow", true],
  ["Lokomotiv Moscow","Dynamo Moscow","Lokomotiv Moscow","FK Dinamo Moscow", true],
  ["Orenburg","Akron Togliatti","FC Orenburg","FK Akron Tolyatti", true],
  ["Dynamo Moscow","Spartak Moscow","FK Dinamo Moscow","FK Spartak Moscow", true],
  ["Nordsjaelland","Brondby","Nordsjaelland","Broendby IF", true],
  ["Akron Togliatti","Lokomotiv Moscow","FK Akron Tolyatti","Lokomotiv Moscow", true],
];

test("attachEventIds: 12 recover, 5 different-games correctly skipped (no mis-book)", () => {
  let recovered = 0, skipped = 0;
  for (const [oh, oa, sh, sa, should] of PAIRS) {
    const { DATA, api: a } = makeApi([{ home: oh, away: oa, date: "2026-08-24" }]);
    const sporty = [{ eventId: "sr:evt:1", homeTeam: sh, awayTeam: sa, startTime: TS, odds: {} }];
    a.attachEventIds(sporty);
    const matched = DATA.fixtures[0].eventId === "sr:evt:1";
    assert.equal(matched, should, `${oh} v ${oa} -> ${sh} v ${sa}: expected match=${should}`);
    if (should) recovered++; else skipped++;
  }
  assert.equal(recovered, 12);
  assert.equal(skipped, 5);
});

test("attachEventIds sets sportyOdds on a real match", () => {
  const { DATA, api: a } = makeApi([{ home: "Brondby", away: "Silkeborg", date: "2026-08-24" }]);
  a.attachEventIds([{ eventId: "sr:evt:9", homeTeam: "Broendby IF", awayTeam: "Silkeborg IF",
                      startTime: TS, odds: { "1": 2.0 } }]);
  assert.equal(DATA.fixtures[0].eventId, "sr:evt:9");
  assert.deepEqual(DATA.fixtures[0].sportyOdds, { "1": 2.0 });
});

/* --------------------------------------------------- the second bookmaker */

const B9EV = (id, o) => [{ eventId: id, homeTeam: "Broendby IF",
                           awayTeam: "Silkeborg IF", startTime: TS, odds: o || {} }];
const ONE = () => [{ home: "Brondby", away: "Silkeborg", date: "2026-08-24" }];

test("a Bet9ja pairing lands in its own fields and leaves SportyBet's alone", () => {
  const { DATA, api: a } = makeApi(ONE());
  a.attachEventIds(B9EV("b9:1", { "1": 2.4 }), a.BOOKS.bet9ja);
  const f = DATA.fixtures[0];
  assert.equal(f.b9EventId, "b9:1");
  assert.deepEqual(f.b9Odds, { "1": 2.4 });
  assert.equal(f.eventId, undefined, "a Bet9ja match must not claim the SportyBet id");
  assert.equal(f.sportyOdds, undefined);
});

test("both bookmakers can hold the same fixture at once", () => {
  const { DATA, api: a } = makeApi(ONE());
  a.attachEventIds(B9EV("sr:evt:9", { "1": 2.0 }), a.BOOKS.sporty);
  a.attachEventIds(B9EV("b9:1", { "1": 2.4 }), a.BOOKS.bet9ja);
  const f = DATA.fixtures[0];
  assert.equal(f.eventId, "sr:evt:9");
  assert.equal(f.b9EventId, "b9:1");
  assert.deepEqual(f.sportyOdds, { "1": 2.0 });
  assert.deepEqual(f.b9Odds, { "1": 2.4 });
});

test("only the bookmaker we price from moves the model", () => {
  /* Bet9ja covers 96.6% of the board to SportyBet's 100%, and its league
     listing carries no team-goals price at all. Folding it into the blend
     would be a modelling change dressed up as an integration.

     Measured 2 Sep 2026, and the measurement settles it. Across 54 top-flight
     games both books price, their de-vigged home-win probabilities differ by
     0.53 points on average and by more than three points on NONE of them. On
     the same games the model sits ten to twenty points from both - Celtic v
     Aberdeen 59.3 against 75.6, Levante v Barcelona 29.8 against 10.6.

     So the two books are one opinion, not two. Blending the second adds no
     information, and the blend exists to pull the model toward market
     consensus - which SportyBet alone already supplies.

     There is also a trap waiting for anyone who flips BOOKS.bet9ja.blend on:
     blendFixture reads f.sportyOdds unconditionally and ignores the book it
     was called for, so turning it on runs the SportyBet blend TWICE, taking
     the market weight from 30% to about 51% while never touching a Bet9ja
     price. Make blendFixture book-aware first, and only if the numbers above
     ever start to diverge. */
  const blended = [];
  const DATA = { fixtures: ONE() };
  const a = factory(DATA, function (f) { blended.push(f.home); });
  a.attachEventIds(B9EV("b9:1"), a.BOOKS.bet9ja);
  assert.deepEqual(blended, [], "Bet9ja must not reach blendFixture");
  a.attachEventIds(B9EV("sr:evt:9"), a.BOOKS.sporty);
  assert.deepEqual(blended, ["Brondby"], "SportyBet still blends");
});

test("defaulting to SportyBet keeps every existing caller working", () => {
  /* attachEventIds is called from five places and only two pass a book. */
  const { DATA, api: a } = makeApi(ONE());
  a.attachEventIds(B9EV("sr:evt:9"));
  assert.equal(DATA.fixtures[0].eventId, "sr:evt:9");
});

test("Bet9ja's Atletico Rosario is Rosario Central", () => {
  /* Their feed keeps the wrong two words of "Club Atletico Rosario Central".
     Identified from the fixture rather than the name: it is against Newell's
     Old Boys - the Rosario derby - at the same minute as ours, and there is no
     club called Atletico Rosario in the Argentine top flight. */
  assert.equal(api.normTeam("Atletico Rosario"), api.normTeam("Rosario Central"));
  assert.equal(api.simTeams("Atletico Rosario", "Rosario Central"), 2.0);
});

test("that alias does not swallow the other Atleticos", () => {
  /* "atl" is expanded to "atletico" upstream, so several clubs arrive here
     carrying the word. The alias is a whole-name match, not a token rule, and
     these have to stay apart. */
  for (const other of ["Atl. Tucuman", "Atletico Madrid", "Atletico Mineiro",
                       "Ind. Rivadavia", "Newells Old Boys"]) {
    assert.ok(api.simTeams("Atletico Rosario", other) < 0.6,
      `Atletico Rosario must not match ${other}`);
  }
});
