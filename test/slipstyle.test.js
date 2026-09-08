"use strict";

/**
 * "More games" must not return more games than "Fewer games".
 *
 * Reported with two screenshots of the same board at the same payout: More
 * games gave 17 legs, Fewer games gave 20. Reproduced on the live board at
 * x100 - 1.25 built 20 legs, 1.4 built 16, and 1.7 built 20 with a geometric
 * mean leg of 1.267, SHORTER than Balanced's 1.334. The chips were inverted in
 * fact, not just in name.
 *
 * The mechanism is the order of the two ways a slip can reach its target.
 * `want` is ceil(log T / log per), so Fewer games stopped phase 1 at nine legs;
 * nine legs at what that board paid reached about x38 of x100, and phase 2 then
 * padded the rest with eleven legs of about 1.05 - eleven more results that
 * have to come in, for four per cent of odds each.
 *
 * Lengthening the legs it already has is what "Fewer games, bigger odds"
 * means, and the loop that does it already existed - it just ran after the
 * padding, as a last resort for a thin card. This pins the order.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The real fill, lifted out of wspBuild with everything it closes over injected
   - the same approach as test/overshoot-target.test.js, and for the same
   reason: the bug was an ordering between two blocks that both already worked,
   which any re-implementation would silently get right. */
function fill(opts) {
  const from = src.indexOf("    if(picks.length>=want) lengthenToTarget();");
  assert.ok(from > 0, "the pre-padding lengthen call is gone from wspBuild");
  const anchor = src.indexOf("    lengthenToTarget();", from + 10);
  assert.ok(anchor > from, "the final lengthen call is gone from wspBuild");
  const body = src.slice(from, anchor + "    lengthenToTarget();".length);

  const state = { picks: opts.picks.slice(), prod: opts.prod };
  const fn = new Function(
    "S", "chosen", "want", "T", "cap", "WSP", "LEAGUE_PEN", "PROVEN",
    "var picks=S.picks, prod=S.prod, used=S.used||{}, lc={}, mc={};" +
    "function lgOf(c){return c.lg||'x';}" +
    "function hasReal(){return true;}" +
    "function isProven(){return true;}" +
    "function marketFor(c){return c;}" +
    "function take(c){used[c.id]=1;picks.push(c);prod*=c.od;lc[lgOf(c)]=(lc[lgOf(c)]||0)+1;}" +
    body +
    "\nS.prod=prod; return S;");
  return fn(state, opts.chosen, opts.want, opts.T, opts.cap || 40,
            { odds: opts.T, everyGame: false }, 0.30, {});
}

/* A leg already on the slip, with a longer market available on the same game. */
const leg = (id, od, p, alts) => ({ id, od, p, lg: "L" + id, _alts: alts || [] });
/* A candidate still on the board. */
const spare = (id, od) => ({ id: "s" + id, od, p: 0.8, lg: "S" + id, _cost: 1 });

test("the target is reached by lengthening the legs the style asked for", () => {
  /* Four legs at 1.5 is x5.06 against a x20 target. Each can be lengthened to
     2.6, so three swaps clear it - and there are twenty spare games on the
     board that padding could have used instead. */
  const picks = [1, 2, 3, 4].map((i) =>
    leg(i, 1.5, 0.7, [{ code: "b", od: 2.6, p: 0.5 }]));
  const chosen = Array.from({ length: 20 }, (_, i) => spare(i, 1.2));
  const out = fill({ picks, prod: Math.pow(1.5, 4), chosen, want: 4, T: 20 });

  assert.equal(out.picks.length, 4, "no leg may be added while the legs it has can still stretch");
  assert.ok(out.prod >= 20, "and the payout is still reached: " + out.prod.toFixed(2));
});

test("padding still happens when the legs cannot stretch far enough", () => {
  /* Same four legs with nothing longer to swap to. The board has to make up
     the difference, which is what phase 2 is for. */
  const picks = [1, 2, 3, 4].map((i) => leg(i, 1.5, 0.7, []));
  const chosen = Array.from({ length: 20 }, (_, i) => spare(i, 1.4));
  const out = fill({ picks, prod: Math.pow(1.5, 4), chosen, want: 4, T: 20 });

  assert.ok(out.picks.length > 4, "with no longer market available the slip must still reach the target");
  assert.ok(out.prod >= 20);
});

test("a slip that has not filled its style's count is not lengthened first", () => {
  /* want is 8 and phase 1 only managed 4 - the board is thin, not the style.
     Adding the games it has not used yet comes first; stretching four legs to
     cover eight legs' worth of payout is how a slip ends up on markets nobody
     asked for. */
  const picks = [1, 2, 3, 4].map((i) =>
    leg(i, 1.5, 0.7, [{ code: "b", od: 2.0, p: 0.5 }]));
  const chosen = Array.from({ length: 20 }, (_, i) => spare(i, 1.4));
  const out = fill({ picks, prod: Math.pow(1.5, 4), chosen, want: 8, T: 20 });

  assert.ok(out.picks.length > 4, "the unused games on the board come first");
});

/* ------------------------------------------------------- the invariant --- */

test("the styles are ordered: fewer games never returns more legs", () => {
  /* The report, in one assertion. Each style is given the same board and the
     same target; what changes is `want`, which is what the chip actually sets.
     A longer style asks for fewer legs, so it must not come back with more. */
  const board = () => Array.from({ length: 30 }, (_, i) => spare(i, 1.25));
  const legsFor = (want) => {
    const picks = Array.from({ length: Math.min(want, 6) }, (_, i) =>
      leg(i, 1.4, 0.7, [{ code: "b", od: 1.9, p: 0.55 }]));
    const prod = picks.reduce((a, l) => a * l.od, 1);
    return fill({ picks, prod, chosen: board(), want, T: 100 }).picks.length;
  };
  const more = legsFor(21), balanced = legsFor(14), fewer = legsFor(9);
  assert.ok(fewer <= balanced, "fewer(" + fewer + ") must not exceed balanced(" + balanced + ")");
  assert.ok(balanced <= more, "balanced(" + balanced + ") must not exceed more(" + more + ")");
});
