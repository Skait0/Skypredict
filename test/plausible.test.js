"use strict";

/**
 * A published scoreline has to be plausible for ITS OWN fixture.
 *
 * Reported: "im also seeing alot of scorelines with 4 in them? alot with 3-3
 * also 5 nil on an argentina game" and then, plainly, "5 nil in an argentinian
 * game is almost impossible".
 *
 * Both true, and the aggregate figures said otherwise - which is the trap this
 * file exists to close. Sampling the whole score distribution sized the tail
 * correctly ACROSS the card: games of five or more goals were 19% of the board
 * against 17% of real results. Statistically defensible, and it still put 4-3
 * on a fixture expecting 2.85 goals, 3-3 on Napoli v Como at 2.47, and a 5-0
 * in a league that averages 2.25.
 *
 * A reader looks at one match. "The tail is correctly sized across the other
 * 287" is not an answer to them, so an aggregate check would have passed while
 * the site looked broken. The guard has to be per fixture.
 *
 * The rule: what we print cannot sit far above what the model expects from
 * that game. Sampling now draws from the cells covering 80% of the
 * probability, so the tail is unreachable - and this fails if that ever stops
 * being true.
 */

const test = require("node:test");
const assert = require("node:assert");

/* Goals a scoreline adds up to. */
const goals = (s) => s.split("-").map(Number).reduce((a, b) => a + b, 0);

function payload() {
  try { return require("../public/predictions.json"); } catch (e) { return null; }
}
function scored(p) {
  return (p.fixtures || []).filter(f => /^\d+-\d+$/.test(f.score || "") && f.lh != null && f.la != null);
}

/* Measured on a real board after the fix: worst overshoot +2.05, p95 +1.42.
   Three goals above expectation is comfortably outside anything the bulk of a
   distribution produces, and it is exactly where the reported cases sat - a
   5-0 on a 2.0-goal game is +3.0. */
const MAX_OVER = 3.0;

test("no fixture is given a scoreline far above what it expects", () => {
  const p = payload();
  if (!p) return;
  const fx = scored(p);
  if (fx.length < 50) return;

  const bad = fx
    .map(f => ({ over: goals(f.score) - (f.lh + f.la), f }))
    .filter(x => x.over > MAX_OVER)
    .map(x => `${x.f.home} v ${x.f.away} [${x.f.league}]: printed ${x.f.score} ` +
              `on ${(x.f.lh + x.f.la).toFixed(2)} expected goals (+${x.over.toFixed(2)})`);

  assert.deepStrictEqual(bad, [],
    bad.length + " fixture(s) given a scoreline their own numbers do not support");
});

test("a low-scoring fixture never gets a high-scoring line", () => {
  /* The reported case in its own right. Argentina's top flight runs about 2.25
     goals a game; a 5-0 there is not a long shot, it is not a prediction. */
  const p = payload();
  if (!p) return;
  const fx = scored(p);
  if (fx.length < 50) return;

  const quiet = fx.filter(f => (f.lh + f.la) < 2.4);
  if (!quiet.length) return;
  const loud = quiet.filter(f => goals(f.score) >= 5)
    .map(f => `${f.home} v ${f.away}: ${f.score} on ${(f.lh + f.la).toFixed(2)} expected`);

  assert.deepStrictEqual(loud, [],
    loud.length + " quiet fixture(s) printed as a goal glut");
});

test("nothing on the board is a rout", () => {
  const p = payload();
  if (!p) return;
  const fx = scored(p);
  if (fx.length < 50) return;
  const worst = Math.max(...fx.map(f => goals(f.score)));
  assert.ok(worst <= 6,
    `the biggest scoreline on the board totals ${worst} goals; the bulk of a ` +
    `distribution does not reach there and a reader would not accept it`);
});

/* The other half. Cutting the tail must not collapse the board back onto a
   handful of safe lines - that was the bug BEFORE this one, when rounding the
   mean gave five scorelines and no draws at all. */
test("cutting the tail has not flattened the board", () => {
  const p = payload();
  if (!p) return;
  const fx = scored(p);
  if (fx.length < 50) return;

  const c = {};
  fx.forEach(f => { c[f.score] = (c[f.score] || 0) + 1; });
  const counts = Object.values(c).sort((a, b) => b - a);

  assert.ok(Object.keys(c).length >= 12,
    `only ${Object.keys(c).length} distinct scorelines - the tail cut has gone too far`);
  assert.ok(counts[0] / fx.length < 0.35,
    `one scoreline is ${Math.round(counts[0] / fx.length * 100)}% of the board`);

  const draws = fx.filter(f => { const [h, a] = f.score.split("-").map(Number); return h === a; }).length;
  assert.ok(draws / fx.length > 0.12,
    `draws are ${Math.round(draws / fx.length * 100)}% of the board; real football is near 29%`);
});

/* ------------------------------------------------- the model's own verdict */

/**
 * A scoreline must not contradict the model that produced it.
 *
 * Reported: Real Madrid, whom the model makes 68% to win with 2.34 expected
 * goals against 0.93, published as 2-2. And Napoli v Como at 41/28/31 and 2.47
 * expected goals, published as 3-0.
 *
 * Both sat inside the distribution, and both read as the site arguing with
 * itself - a reader sees "68% home win" beside a drawn scoreline.
 *
 * The old rule forced the scoreline onto whichever outcome was likeliest,
 * which is why draws disappeared entirely: in a Poisson model the draw is
 * almost never the single most likely outcome even when it is a real
 * possibility. So the gate is relative. An outcome stays in play while it is
 * at least a third as likely as the favourite - which keeps the draw on a
 * 41/28/31 fixture and removes it from a 68/19/13 one.
 */
test("no scoreline contradicts a clear favourite", () => {
  const p = payload();
  if (!p) return;
  const fx = (p.fixtures || []).filter(
    f => /^\d+-\d+$/.test(f.score || "") && f.home_p != null && f.draw_p != null && f.away_p != null);
  if (fx.length < 50) return;

  const FLOOR = 0.35;
  const bad = [];
  for (const f of fx) {
    const [h, a] = f.score.split("-").map(Number);
    const shown = h > a ? "home" : (h < a ? "away" : "draw");
    const P = { home: f.home_p, draw: f.draw_p, away: f.away_p };
    const best = Math.max(P.home, P.draw, P.away);
    if (P[shown] < best * FLOOR) {
      bad.push(`${f.home} v ${f.away}: ${f.score} shows a ${shown} the model gives ` +
        `${Math.round(P[shown] * 100)}% against a best of ${Math.round(best * 100)}%`);
    }
  }
  assert.deepStrictEqual(bad, [],
    bad.length + " scoreline(s) argue with the model that produced them");
});

test("but a genuinely close fixture can still be drawn", () => {
  /* The other half. The gate must not quietly become "always show the
     favourite", which is the rule it replaced and which gave 0% draws. */
  const p = payload();
  if (!p) return;
  const fx = (p.fixtures || []).filter(f => /^\d+-\d+$/.test(f.score || ""));
  if (fx.length < 50) return;
  const draws = fx.filter(f => { const [h, a] = f.score.split("-").map(Number); return h === a; });
  assert.ok(draws.length / fx.length > 0.12,
    `draws are ${Math.round(draws.length / fx.length * 100)}% of the board; ` +
    `the outcome gate has gone from filtering to censoring`);
});
