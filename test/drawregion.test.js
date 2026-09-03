"use strict";

/**
 * A draw reopens South America and Asia - for the draw, and nothing else.
 *
 * Reported: "the asian and south american rule set in place when it comes to
 * picking games affects draw picks as im barely seeing any of those there...
 * when draw option is picked, open the rules."
 *
 * Right, and stronger than a penalty. With a full European card `saMode` and
 * `asiaMode` both settle on "exclude", so those fixtures were dropped from the
 * pool BEFORE ranking - not weighted down, removed. Only two or three shuffles
 * undid it. Turning `saWeight` off changed nothing, which is what pointed at
 * the filter rather than the weight.
 *
 * The exclusion is right for what it was written for: these leagues grind, and
 * they are a poor source of the goals markets this builder mostly buys. For a
 * DRAW the same grinding is the merit. Measured on a 409-fixture board:
 * South American fixtures average a draw probability of 0.298 against 0.262
 * everywhere else, and 86% clear the draw floor against 58% of the rest. They
 * are the most draw-prone region on the card and they were the one region
 * guaranteed not to appear.
 *
 * Measured after, on 405 upcoming fixtures, seed fixed:
 *   draw only, all upcoming   0 -> 3 South American, 0 -> 3 Asian
 *   draw only, x100           0 -> 1 South American
 *   draw OFF (control)        0 and 0, unchanged
 *   draw + normal markets     0 and 0, and zero non-draw legs from a barred
 *                             region - the door does not leak
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The real door, lifted with everything it closes over injected. The bug this
   guards against is a filter behaving differently from how it reads, so a
   re-implementation would be marking its own homework. */
function liftDoor() {
  const start = src.indexOf("  var drawsOn=!!(WSP.mk&&WSP.mk.draw);");
  assert.ok(start > 0, "the draw door must exist in wspBuild");
  const end = src.indexOf("  });", src.indexOf("all.forEach(function(c){", start));
  assert.ok(end > start, "the door's forEach must be findable");
  const body = src.slice(start, end + 5);
  return new Function("WSP", "all", "saMode", "asiaMode",
    "isSouthAmerican", "isAsian", body + "\nreturn poolList;");
}
const door = liftDoor();

const EU = { league: "England Premier League" };
const SA = { league: "Argentina Liga Profesional" };
const AS = { league: "Japan J1 League" };
const isSA = (f) => f.league.indexOf("Argentina") === 0 || f.league.indexOf("Brazil") === 0;
const isAS = (f) => f.league.indexOf("Japan") === 0 || f.league.indexOf("China") === 0;

/* A pool entry as wspBuild builds it: a chosen best, plus every candidate. */
function entry(f, codes) {
  const cands = codes.map((c) => ({ f, id: f.league, code: c, p: 0.3, od: 3.2 }));
  return { f, id: f.league, code: cands[0].code, p: 0.3, od: 3.2, cands };
}
const run = (drawOn, all) =>
  door({ mk: { draw: drawOn } }, all, "exclude", "exclude", isSA, isAS);

/* ------------------------------------------------- closed unless asked for */

test("with draws off, the exclusion is exactly as it was", () => {
  const pool = run(false, [entry(EU, ["1X"]), entry(SA, ["X", "1X"]), entry(AS, ["X"])]);
  assert.deepStrictEqual(pool.map((c) => c.f.league), ["England Premier League"],
    "a market the user did not ask for must not change which fixtures qualify");
});

test("with draws on, a barred region comes back", () => {
  const pool = run(true, [entry(EU, ["1X"]), entry(SA, ["X", "1X"]), entry(AS, ["X"])]);
  assert.deepStrictEqual(pool.map((c) => c.f.league).sort(),
    ["Argentina Liga Profesional", "England Premier League", "Japan J1 League"]);
});

test("but only a fixture that actually offers a draw", () => {
  /* The door is for draws. A barred fixture whose draw probability never
     cleared the floor has no draw candidate and no reason to be readmitted. */
  const pool = run(true, [entry(SA, ["1X", "OVER_1.5"])]);
  assert.deepStrictEqual(pool, [],
    "no draw candidate means no draw, and no way back in");
});

/* ------------------------------------------------------ and it cannot leak */

test("a fixture readmitted for the draw cannot be spent on anything else", () => {
  /* The failure this is really guarding: open the door for draws, and a South
     American fixture walks in and gets picked for Over 1.5 because that scored
     better. Then the exclusion has been undone for every market through a door
     opened for one. It comes back carrying ONLY its draw. */
  const pool = run(true, [entry(SA, ["X", "1X", "OVER_1.5", "HOME_OVER_0.5"])]);
  assert.strictEqual(pool.length, 1);
  assert.deepStrictEqual(pool[0].cands.map((c) => c.code), ["X"],
    "every other market must be stripped from a fixture admitted by the door");
  assert.strictEqual(pool[0].code, "X", "and its chosen leg is the draw");
});

test("a fixture that was never barred keeps all of its markets", () => {
  /* The stripping applies to the readmitted only. Narrowing an ordinary
     fixture to its draw would be a far worse bug than the one being fixed. */
  const pool = run(true, [entry(EU, ["1X", "X", "OVER_1.5"])]);
  assert.deepStrictEqual(pool[0].cands.map((c) => c.code), ["1X", "X", "OVER_1.5"]);
});

/* ------------------------------------------------------------- the weight */

test("a draw pays no regional penalty", () => {
  /* And leaving this to saWeight would have been worse than useless: it waives
     the penalty for fixtures the model expects GOALS in, so on a draw slip it
     would rank the high-scoring South American games ABOVE the grinding ones -
     the exact opposite of what a draw wants. */
  const w = /function w\(c\)\{([\s\S]*?)\n    \}/.exec(src);
  assert.ok(w, "the region weight must still exist");
  assert.match(w[1], /if\(c\.code==="X"\) return 1;/,
    "a draw must short-circuit the regional weight");
  /* Order matters, and the comment above the guard names saWeight while
     explaining why it must not run - so the ordering check reads the code
     with comments stripped, or it finds the word in the prose and passes on
     a file where the guard sits in the wrong place. */
  const code = w[1].replace(/\/\*[\s\S]*?\*\//g, " ");
  const idx = code.indexOf('c.code==="X"');
  assert.ok(idx >= 0 && idx < code.indexOf("saWeight"),
    "the draw guard must come BEFORE saWeight, or the backwards preference " +
    "still runs and the slip prefers the high-scoring South American games");
});

test("the exclusion itself is untouched for every other market", () => {
  /* This change adds a door; it must not have widened the room. */
  assert.match(src, /var saMode=\(euro\.length<SA_MIN_EURO\)\?"fill":\(shuffles>=2\?"mix":"exclude"\);/,
    "South America's own rule is unchanged");
  assert.match(src, /var asiaMode=\(euro\.length<ASIA_MIN_EURO\)\?"fill":\(shuffles>=3\?"mix":"exclude"\);/,
    "and so is Asia's");
});
