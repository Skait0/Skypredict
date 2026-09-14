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
