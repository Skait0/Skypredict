"use strict";
/* CHECK MY TICKET (SportyClaw review, 20 Oct 2026): results for any code, leg by leg, from the
   scores we bank (results table), graded by the server's own grader (lib/legrade.js). A leg
   with no score yet waits; it is never a miss. */
const test = require("node:test");
const assert = require("node:assert");
const T = require("../lib/ticket.js");

const R = (home, away, hg, ag, d) => ({ match_date: d || "2026-10-19", home, away, hg, ag });

test("a read-back leg finds its score by the club names, and refuses a guess", () => {
  const rs = [R("Fram", "IA Akranes", 2, 1), R("Ajax U21", "De Graafschap", 0, 3), R("Ajax", "PSV", 1, 1)];
  assert.strictEqual(T.findResult(rs, { home: "Fram Reykjavik", away: "IA Akranes" }).hg, 2);
  assert.strictEqual(T.findResult(rs, { home: "Jong Ajax Amsterdam", away: "PSV" }), null, "a reserve side never takes the first team's score");
  assert.strictEqual(T.findResult(rs, { home: "Nowhere", away: "Ghost" }), null);
});

test("legs grade won, lost, push or waiting, and the summary says which", () => {
  const rs = [R("Arsenal", "Chelsea", 2, 0), R("Lyon", "Nice", 0, 0)];
  const legs = [{ home: "Arsenal", away: "Chelsea", prediction: "1" }, { home: "Lyon", away: "Nice", prediction: "OVER_1.5" },
    { home: "Real Madrid", away: "Getafe", prediction: "1" }];
  const g = T.grade(legs, rs);
  assert.deepStrictEqual(g.rows.map((x) => x.won), [true, false, null]);
  assert.deepStrictEqual([g.won, g.lost, g.waiting], [1, 1, 1]);
  assert.strictEqual(g.done, false);
  const all = T.grade(legs.slice(0, 1), rs);
  assert.ok(all.done && all.landed);
  const text = T.text("ABC123", "SportyBet", g);
  assert.match(text, /✅[\s\S]*❌[\s\S]*⏳/);
  assert.match(T.text("ABC123", "SportyBet", all), /Landed/);
});

test("one leg off reads So close, with the count", () => {
  const rs = [R("A", "B", 1, 0), R("C", "D", 1, 0), R("E", "F", 0, 1)];
  const legs = [{ home: "A", away: "B", prediction: "1" }, { home: "C", away: "D", prediction: "1" }, { home: "E", away: "F", prediction: "1" }];
  assert.match(T.text("X1Y2Z3", "SportyBet", T.grade(legs, rs)), /So close 😤 - 2 of 3/);
});

test("a code whose games are all over is spotted from the book's own status", () => {
  assert.ok(T.allOver([{ status: "Ended" }, { status: "ended" }], Date.now()));
  assert.ok(!T.allOver([{ status: "Ended" }, { status: "H1" }], Date.now()), "a game still playing");
  const past = Date.now() - 3 * 36e5;
  assert.ok(T.allOver([{ kickoff: past - 2 * 36e5 }, { kickoff: past }], Date.now()), "kick-off times, 2h+ ago");
  assert.ok(!T.allOver([{ kickoff: "" }], Date.now()), "nothing to go on");
});

test("a part-finished code says how many games are over and points at Results", () => {
  /* Live, 21 Oct 2026: KLHGFR (4 ended, 1 playing, 3 to come) read as "None of these games are on
     our board" and nothing else, which looks broken. */
  const now = Date.now();
  const legs = [{ status: "Ended" }, { status: "Ended" }, { status: "H2" }, { status: "Not Start" }, { status: "" }];
  assert.match(T.startedLine(legs, now), /3 of 5 games have started or ended[\s\S]*Results/);
  assert.strictEqual(T.startedLine([{ status: "Not Start" }], now), "", "nothing started, nothing said");
  const src = require("fs").readFileSync(require("path").join(__dirname, "../api/tg.js"), "utf8");
  assert.ok(/TICKET\.startedLine\(/.test(src), "the read uses it");
});

test("an unreadable code says why in plain words", () => {
  assert.match(T.whyNot({ expired: true }, "Betway", "BW12345678"), /started or ended/);
  assert.match(T.whyNot({ notFound: true }, "Bet9ja", "5WGXDZD"), /Check the code[\s\S]*games are over/);
  assert.match(T.whyNot({}, "BetKing", "N41A67"), /try again/i);
});
