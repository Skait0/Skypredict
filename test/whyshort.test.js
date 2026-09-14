"use strict";
/* WHY THE SLIDER BUILT A SHORT SLIP, AND WHY IT USED TO SAY NOTHING.
 *
 * Reported: with Over 2.5 and Both to score on, "it doesnt pick more than 2
 * odds while the wizard hits it". Both were behaving correctly - the Slider
 * will not go below the confidence floor its dial sets, the wizard is aiming
 * at a payout - but nothing on screen said so. Measured on the live board that
 * day, Today + top flight, 24 games: Balanced (71%) cleared 1, Bold (65%)
 * cleared 1, Risky (60%) cleared 3.
 *
 * The sentence that should have explained it existed and was DEAD: emptyWhy
 * read MKT_CFG, which was declared with `var` inside renderShared, so every
 * call threw ReferenceError into its own try/catch and returned "". Every
 * reader got the generic "No games match. Adjust risk or markets." instead.
 * That is what these pin - the scope of the table, and that both the empty and
 * the short case have somewhere to print.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the chip table is reachable from the code that explains an empty slip", () => {
  const decls = src.match(/var MKT_CFG\s*=/g) || [];
  assert.equal(decls.length, 1, "MKT_CFG is declared " + decls.length + " times");
  const declAt = src.indexOf("var MKT_CFG");
  const usedAt = src.indexOf("function emptyWhy(");
  assert.ok(declAt >= 0 && usedAt >= 0);
  assert.ok(declAt < usedAt,
    "emptyWhy reads MKT_CFG, so the declaration has to be above it and outside renderShared");
  /* The assignment inside renderShared must NOT reintroduce a local. */
  const shared = src.slice(src.indexOf("function renderShared("));
  const inner = shared.slice(0, shared.indexOf("function renderBuilderOutput("));
  assert.doesNotMatch(inner, /var MKT_CFG\s*=/,
    "renderShared has taken the table back into its own scope");
  assert.match(inner, /\n\s*MKT_CFG\s*=\s*\[/, "renderShared no longer fills the table");
});

test("a short slip has an element to explain itself in", () => {
  assert.match(src, /id="bldShort"/, "the short-slip note is gone from the page");
  /* Written by the output renderer, next to the slip it is about. */
  assert.match(src, /\$\("bldShort"\)/, "nothing ever writes to it");
});

test("the pool is counted in games, not game-market pairs", () => {
  /* The builder takes one leg per match, so counting a fixture twice because
     two of its markets clear the floor would report a pool bigger than the
     slip could ever be - and the sentence would never fire. */
  const fn = src.slice(src.indexOf("function floorGap("));
  const body = fn.slice(0, fn.indexOf("\nfunction emptyWhy("));
  assert.match(body, /fx\.forEach/, "floorGap no longer walks the fixtures itself");
  assert.match(body, /if\(hit\) over\+\+/, "the count is not per fixture any more");
});

/* ------------------------------- the locked chip that moves the dial itself */

function grabFn(src, name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* A board where Over 2.5 climbs with the dial: nothing at the safe floors, a
   handful in the middle, plenty at the bottom. */
function sandbox(probs) {
  const env = {
    riskParams: (r) => ({ minConf: 0.82 - 0.22 * (r / 100), tier: r < 33 ? 0 : (r < 66 ? 1 : 2) }),
    allowedMarkets: (tier) => (tier === 0 ? ["OVER_1.5"] : ["OVER_1.5", "OVER_2.5"]),
    MKT_BY_CHIP: { o25: ["OVER_2.5"], o15: ["OVER_1.5"] },
    bookAllows: () => true,
    curBook: () => ({ key: "sporty" }),
    scopeFixtures: () => probs.map((p, i) => ({ id: i, p })),
    mProb: (f, code) => (code === "OVER_2.5" ? f.p : 0.9),
    BUILD: { mode: "slider", risk: 25 },
  };
  const names = Object.keys(env);
  const body = grabFn(src, "chipGames") + "\n" + grabFn(src, "riskThatFills") +
    "\nreturn {chipGames, riskThatFills, BUILD};";
  return new Function(...names, body)(...names.map((n) => env[n]));
}

test("a tier-locked chip is not disabled, or the tap never arrives", () => {
  /* This was the whole bug in the first cut: a disabled <button> fires no
     click at all, so the branch that moves the dial was dead code. The
     wrong-book chips had been left enabled for exactly this reason. */
  assert.doesNotMatch(src, /\(locked&&!wrongBook\)\?"disabled":""/,
    "a tier-locked chip is disabled again and can no longer be tapped");
  assert.match(src, /riskThatFills\(k\)/, "nothing looks for a setting that fills");
  assert.match(src, /slideRisk\(toR\)/, "the dial is never actually moved");
});

test("the dial moves as little as it has to, and only for three legs", () => {
  /* Sliding the whole dial to produce one leg is a worse trade than staying
     put, so three is the bar - with one accepted only when three is
     unreachable. */
  const api = sandbox([0.72, 0.70, 0.69, 0.66, 0.62]);
  /* floors: risk 50 -> 0.71, risk 75 -> 0.655, risk 100 -> 0.60 */
  assert.equal(api.chipGames("o25", 25), 0, "tier 0 does not allow it at all");
  assert.equal(api.chipGames("o25", 50), 1);
  const got = api.riskThatFills("o25");
  assert.ok(api.chipGames("o25", got) >= 3, got + " does not actually fill");
  assert.ok(api.chipGames("o25", got - 5) < 3,
    "the dial moved further than it had to: " + (got - 5) + " already filled");
});

test("one reachable game is taken only when nothing reaches three", () => {
  const api = sandbox([0.72, 0.40, 0.40]);
  assert.equal(api.riskThatFills("o25"), 50, "the single-game fallback");
});

test("a market no setting reaches asks for nothing", () => {
  const api = sandbox([0.30, 0.28]);
  assert.equal(api.riskThatFills("o25"), null,
    "a dial that moves and still builds nothing is worse than a refusal");
});

test("the wizard has no dial, so nothing is moved there", () => {
  const api = sandbox([0.72, 0.71, 0.70, 0.69]);
  api.BUILD.mode = "wizard";
  assert.equal(api.riskThatFills("o25"), null);
});

test("the swap menu does not offer the draw", () => {
  /* Every other option in that menu is a shade of the same bet; the draw is a
     different one, and the builders stop and ask before switching it on. A
     dropdown cannot ask. */
  const i = src.indexOf("function swapOptions(");
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf("function renderFab(", i));
  assert.doesNotMatch(body, /\{code:"X"/, "the draw is back in the swap list");
  /* And the markets that only one book sells never belonged here either. */
  assert.doesNotMatch(body, /_OV_1\.5/, "a Bet9ja-only line is offered to every reader");
  assert.match(body, /bookAllows\(o\.code\)/, "nothing filters by what the chosen book takes");
  /* The eight both books sell are the point of the change. */
  ["MIXGG_1", "MIXGG_2", "MIXGG_X", "MIX_1_OV_2.5", "MIX_2_OV_2.5", "MIX_X_OV_2.5",
   "WINHALF_H_Y", "WINHALF_A_Y"].forEach((c) =>
    assert.ok(body.includes(c), c + " is missing from the swap menu"));
});
