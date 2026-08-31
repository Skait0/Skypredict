"use strict";

/**
 * Ask for x50, get x50. Not x70.
 *
 * Reported: "if the odds are being picked like that to meet the target payout,
 * you have room to reduce the odds payout a little. i asked for 50 odds, it
 * gave me 70. theres no need to over compensate and pick crazy games like so...
 * users are complaining about the wizard picking unfavourable teams."
 *
 * The two halves of that are one bug. Phase 2 of the fill already took the leg
 * that cleared the target by the least, and its comment records why: across 105
 * slips the old "biggest odds first" rule never undershot, beat the target by
 * more than 10% on 79 of them, and cost 31% of the chance of landing.
 *
 * But phase 1 never got the same treatment, and phase 1 is where most slips
 * actually finish. It took its best-RANKED leg every time, so sitting on x45
 * against a x50 target it would happily take a 1.55 and hand back x70. Phase 2,
 * with all its care, then had nothing left to do.
 *
 * That overshoot is what dragged in the unfavourable teams. Beating a target by
 * 40% means reaching through longer legs than the payout ever needed, and on a
 * lopsided fixture the only long market is the weaker side to score. Ipswich at
 * Anfield, someone away at Barcelona. Fix the overshoot and the reach goes with
 * it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The phase 1 loop, lifted out of wspBuild with everything it closes over
   injected. Running the real loop matters here: the bug was a rule that existed
   a few lines further down and simply was not applied up here, which a
   re-implementation would have quietly "fixed" while writing it. */
function phase1(opts) {
  const start = src.indexOf("    while(picks.length<want && (WSP.everyGame||WSP.odds==null||prod<T)){");
  assert.ok(start > 0, "the phase 1 loop is gone from index.html");
  let d = 0, k = src.indexOf("{", start);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  const loop = src.slice(start, k + 1);

  const state = { picks: [], prod: opts.prod, used: {}, lc: {} };
  const fn = new Function("S", "chosen", "want", "T", "WSP", "LEAGUE_PEN",
    "var picks=S.picks, prod=S.prod, used=S.used, lc=S.lc;" +
    "function lgOf(c){return c.lg||'x';}" +
    "function take(c){used[c.id]=1;picks.push(c);prod*=c.od;lc[lgOf(c)]=(lc[lgOf(c)]||0)+1;}" +
    loop +
    "\nS.prod=prod; return S;");
  return fn(state, opts.chosen, opts.want, opts.T, { odds: opts.T }, 0.30);
}

/* _cost is minimised, so a LOWER number is a better-ranked leg. */
const leg = (id, od, cost) => ({ id, od, _cost: cost, lg: "L" + id });

test("a single leg that finishes the slip is chosen for fit, not for rank", () => {
  /* At x45 against x50 the slip needs 1.112 more. The best-ranked leg is a
     1.55, which would land it on x69.75. A 1.15 also clears, at x51.75. */
  const out = phase1({
    prod: 45, T: 50, want: 20,
    chosen: [leg("best", 1.55, 0.20), leg("fits", 1.15, 0.90), leg("mid", 1.40, 0.50)],
  });
  assert.deepStrictEqual(out.picks.map((p) => p.id), ["fits"],
    "took the best-ranked leg and overshot instead of the one that fits");
  assert.ok(out.prod >= 50, "the target must still be reached");
  assert.ok(out.prod < 55, "landed on x" + out.prod.toFixed(1) + ", which is still an overshoot");
});

test("the target is never undershot to get a tidier number", () => {
  /* "At least what you asked for" is the promise. A 1.05 that lands on x47.25
     is closer to x50 than a 1.15, and must still be refused. */
  const out = phase1({
    prod: 45, T: 50, want: 20,
    chosen: [leg("under", 1.05, 0.10), leg("fits", 1.15, 0.90)],
  });
  assert.ok(out.prod >= 50, "landed on x" + out.prod.toFixed(1) + ", below the target");
  assert.strictEqual(out.picks[0].id, "fits");
});

test("while no single leg can finish, the best-ranked one is still taken", () => {
  /* Far from the target, fit is meaningless and quality is everything. This is
     the behaviour that was already right and must not have been traded away. */
  const out = phase1({
    prod: 1, T: 50, want: 2,
    chosen: [leg("good", 1.30, 0.10), leg("poor", 1.90, 0.90), leg("mid", 1.50, 0.50)],
  });
  assert.strictEqual(out.picks[0].id, "good",
    "stopped ranking by quality while still far from the target");
});

test("it stops the moment the target is met", () => {
  const out = phase1({
    prod: 1, T: 2, want: 10,
    chosen: [leg("a", 2.10, 0.10), leg("b", 1.30, 0.20), leg("c", 1.30, 0.30)],
  });
  assert.strictEqual(out.picks.length, 1, "kept adding legs after the target was reached");
});

test("want is still a ceiling", () => {
  /* Slip style asks for a leg count and it is not to be exceeded, even if the
     target has not been reached - phase 2 handles that case. */
  const out = phase1({
    prod: 1, T: 1000, want: 3,
    chosen: [leg("a", 1.2, 0.1), leg("b", 1.2, 0.2), leg("c", 1.2, 0.3), leg("d", 1.2, 0.4)],
  });
  assert.strictEqual(out.picks.length, 3);
});

test("running out of candidates ends the loop rather than hanging", () => {
  const out = phase1({ prod: 1, T: 500, want: 10, chosen: [leg("a", 1.2, 0.1)] });
  assert.strictEqual(out.picks.length, 1);
});

test("with no payout to aim at, fit is not consulted at all", () => {
  /* everyGame and the no-target preview both run this loop with T null. Asking
     "does this leg finish the slip" against a null target would be nonsense. */
  const state = { picks: [], prod: 1, used: {}, lc: {} };
  const start = src.indexOf("    while(picks.length<want && (WSP.everyGame||WSP.odds==null||prod<T)){");
  let d = 0, k = src.indexOf("{", start);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  const fn = new Function("S", "chosen", "want", "T", "WSP", "LEAGUE_PEN",
    "var picks=S.picks, prod=S.prod, used=S.used, lc=S.lc;" +
    "function lgOf(c){return c.lg||'x';}" +
    "function take(c){used[c.id]=1;picks.push(c);prod*=c.od;lc[lgOf(c)]=(lc[lgOf(c)]||0)+1;}" +
    src.slice(start, k + 1) + "\nS.prod=prod; return S;");
  const out = fn(state, [leg("good", 1.30, 0.10), leg("long", 9.0, 0.90)], 2, null,
                 { everyGame: true, odds: null }, 0.30);
  assert.strictEqual(out.picks[0].id, "good",
    "with no target, legs must still be ranked by quality");
});

/* ------------------------------------------------------- what it is worth */

test("the overshoot rule is the same one phase 2 uses", () => {
  /* Two different rules for the same question is how they drift apart. Both
     score a finishing leg by log(odds/need) plus the league nudge. */
  const uses = [...src.matchAll(/Math\.log\(c2?\.od\/need1?\)\+pen1?/g)];
  assert.strictEqual(uses.length, 2,
    "expected both phases to score overshoot identically, found " + uses.length);
});
