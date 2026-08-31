"use strict";

/**
 * Eight tickets sharing a leg are one bet with extra steps.
 *
 * Reported: "how do we make sure our website gives different users different
 * game varieties? i had one game spoil 8 of my tickets yesterday because it was
 * everywhere. im sure you say i should have shuffled eh?"
 *
 * Two separate questions in there, and only one of them was a real fault.
 *
 * Across USERS there was never a problem: both builders seed from
 * Math.random() on every page load, so two people opening the site get
 * different games.
 *
 * Across your OWN tickets there was. Measured on a live board, building eight
 * tickets the way a person does — conjure, not shuffle — four games appeared in
 * all eight and eight games appeared in six or more. Neither builder had ever
 * looked at SLIPS, so every build was independent and the best legs went into
 * every one of them.
 *
 * And no, shuffling was not the answer. Shuffling rearranges one ticket; it
 * knows nothing about the other seven. The escalating shuffle jitter added
 * earlier that day helps within a shuffle sequence and does nothing here,
 * because a fresh conjure resets the counter by design.
 *
 * The fix is a penalty, not a ban: a fixture already sitting in a slip that is
 * still running is pushed down the ranking in both builders, bounded so a
 * clearly better leg still wins. Same shape as the league and market spreads it
 * sits beside. On a thin board, or when the game really is the best thing
 * available, it can still come through — you just stop stacking it by accident.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function konst(name) {
  const m = new RegExp("(?:^|\\n)(?:const|var|let)\\s+" + name + "\\s*=\\s*([^;]+);").exec(src);
  if (!m) throw new Error("constant not found: " + name);
  return Function("return " + m[1].trim())();
}

/* slipUse with everything it consults injected. MYSLIP was missing at first,
   and that mattered: it is read inside its own try/catch, so a ReferenceError
   would have been swallowed and these tests would have passed while measuring
   nothing. */
function useWith(slips, current, started) {
  return new Function("SLIPS", "MYSLIP", "STARTED",
    "function fixtureById(id){return {id:id};}" +
    "function notStarted(f){return !STARTED[f.id];}" +
    grab("slipUse") + "\nreturn slipUse();")(slips, current || [], started || {});
}

const slip = (settled, ids) => ({ settled, legs: ids.map((id) => ({ id })) });

test("a fixture in one running slip is counted once", () => {
  assert.deepStrictEqual(useWith([slip(false, ["a", "b"])]), { a: 1, b: 1 });
});

test("and the count rises with each slip holding it", () => {
  const u = useWith([slip(false, ["a"]), slip(false, ["a"]), slip(false, ["a", "b"])]);
  assert.strictEqual(u.a, 3, "three open tickets already carry it");
  assert.strictEqual(u.b, 1);
});

test("settled slips carry no risk, so they do not count", () => {
  /* Spreading away from a game whose slip is already decided protects nothing
     and would quietly shrink the pool for no reason. */
  const u = useWith([slip(true, ["a"]), slip(false, ["b"])]);
  assert.strictEqual(u.a, undefined);
  assert.strictEqual(u.b, 1);
});

test("a game already under way is not worth avoiding either", () => {
  /* The exposure exists and cannot be undone by leaving it out of a new slip. */
  const u = useWith([slip(false, ["kicked", "later"])], [], { kicked: true });
  assert.strictEqual(u.kicked, undefined);
  assert.strictEqual(u.later, 1);
});

test("malformed history never throws", () => {
  /* SLIPS comes out of localStorage, which anyone can edit and older versions
     of the site wrote differently. */
  assert.doesNotThrow(() => useWith([null, { settled: false }, { settled: false, legs: [null, {}] }]));
  assert.deepStrictEqual(useWith([]), {});
});

/* ------------------------------------------------------------ the wiring */

test("both builders consult it", () => {
  const slider = grab("buildPicks");
  assert.match(slider, /var _use=slipUse\(\);/, "the slider does not read your slips");
  assert.match(slider, /Math\.pow\(SPREAD_MULT,_use\[a\.id\]\|\|0\)/,
    "and does not apply the penalty to its ranking key");
  assert.match(src, /\+SPREAD_PEN\*\(_use\[c\.id\]\|\|0\)/,
    "the wizard does not apply the penalty to its cost");
});

test("the wizard reads it before it uses it", () => {
  /* First attempt defined _use after the loop that reads it. `var` hoists, so
     it was undefined rather than a ReferenceError inside the page - it threw
     only under the test harness, which is the one place it was visible. */
  const i = src.indexOf("var _use=slipUse();\r\n    chosen.forEach");
  const j = src.indexOf("+SPREAD_PEN*(_use[c.id]||0)");
  assert.ok(i > 0, "the wizard's _use is not defined before its loop");
  assert.ok(j > i, "_use is read before it is assigned");
});

test("the penalty is a nudge, not a ban", () => {
  const pen = konst("SPREAD_PEN"), mult = konst("SPREAD_MULT");
  /* The wizard's whole candidate cost spread measured about 0.883 end to end.
     A penalty near that would exclude outright rather than deprioritise. */
  assert.ok(pen > 0 && pen <= 0.3,
    `SPREAD_PEN is ${pen}; above ~0.3 a single prior use effectively bans a leg`);
  assert.ok(mult > 0.6 && mult < 1,
    `SPREAD_MULT is ${mult}; it must reduce the key without erasing it`);
});

test("with no history, nothing changes at all", () => {
  /* The penalty must be inert for a first-time visitor, or it would be
     reshaping every slip on the site to solve a problem nobody has yet. */
  const u = useWith([]);
  assert.deepStrictEqual(u, {});
  assert.strictEqual(Math.pow(konst("SPREAD_MULT"), u.anything || 0), 1);
  assert.strictEqual(konst("SPREAD_PEN") * (u.anything || 0), 0);
});

/* -------------------------------------------- the slip already on screen */

/**
 * Reported after the first version shipped: "i tested it now and some games
 * kept coming up, are you sure the changes took?"
 *
 * The changes had taken; they just did nothing. slipUse read SLIPS alone, and
 * SLIPS only fills when a ticket is SAVED - a deliberate, separate step. So
 * anyone building several tickets in a row without saving got no spread at all.
 * Reproduced on the live site: six conjures, eleven games, identical every
 * time, with slipUse returning an empty map.
 *
 * wspConjure calls wspBuild before it replaces MYSLIP, so during the build the
 * previous conjure is still sitting there. Counting it is what makes a
 * re-conjure move off the games in front of you.
 */
test("the slip currently on screen counts, saved or not", () => {
  const u = useWith([], [{ id: "a" }, { id: "b" }]);
  assert.deepStrictEqual(u, { a: 1, b: 1 },
    "with nothing saved, the on-screen slip must still be avoided");
});

test("saved and on-screen add up", () => {
  /* A game in a running ticket AND in the slip you are looking at is the one
     you are most exposed to, so it should be pushed hardest. */
  const u = useWith([slip(false, ["a"])], [{ id: "a" }, { id: "b" }]);
  assert.strictEqual(u.a, 2);
  assert.strictEqual(u.b, 1);
});

test("a started game on screen is still not worth avoiding", () => {
  const u = useWith([], [{ id: "kicked" }, { id: "later" }], { kicked: true });
  assert.strictEqual(u.kicked, undefined);
  assert.strictEqual(u.later, 1);
});

test("a malformed on-screen slip never throws", () => {
  assert.doesNotThrow(() => useWith([], [null, {}, { id: "ok" }]));
  assert.deepStrictEqual(useWith([], []), {});
});
