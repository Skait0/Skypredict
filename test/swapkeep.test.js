"use strict";

/**
 * A leg you changed is yours, and a shuffle must not take it back.
 *
 * Reported: "i changed an option, when i shuffled, it changed the game i
 * changed to the default one it initially predicted for me."
 *
 * Legs the builders put on the slip carry auto:true, and every refill starts by
 * dropping them:
 *
 *   MYSLIP = MYSLIP.filter(x => !x.auto).concat(fresh.map(... auto:true ...))
 *
 * The comment above that line has always said it "leaves anything hand-picked
 * alone". But swapMy rewrote code, label and p and left auto:true in place, so
 * an edited leg was still machine-picked as far as the refill was concerned:
 * the next conjure deleted it and put the model's original market back.
 *
 * These tests run the real swapMy out of index.html rather than a copy of it,
 * because the bug was never in the logic anyone would have transcribed - it was
 * in the one field that did not get written.
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

/* swapMy with everything it reaches for injected. The stubs are deliberately
   dumb - the only thing under test is what it writes into MYSLIP. */
function runSwap(slip, id, oldCode, newCode, opts) {
  const options = opts || [
    { code: "DC_1X", label: "Home or draw", p: 0.78 },
    { code: "OVER_1.5", label: "Over 1.5", p: 0.81 },
  ];
  const fn = new Function("MYSLIP", "OPTS", "OUT",
    "function fixtureById(){return {home:'A',away:'B'};}" +
    "function swapOptions(){return OPTS;}" +
    "function closeSwapMenu(){}" +
    "function myslipHas(id,code){return MYSLIP.some(function(x){return x.id===id&&x.code===code;});}" +
    "function saveMy(){OUT.saved=true;}" +
    "function renderFab(){}" +
    "function syncAddBtn(){}" +
    "function renderMySheet(){}" +
    "function $(){return null;}" +
    "var window={};" +
    grab("swapMy") +
    "\nreturn swapMy;");
  const out = {};
  fn(slip, options, out)(id, oldCode, newCode);
  return out;
}

const autoLeg = () => ({ id: "m1", code: "DC_1X", label: "Home or draw", p: 0.78, auto: true });

test("changing a leg's market rewrites the pick", () => {
  const slip = [autoLeg()];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");
  assert.strictEqual(slip[0].code, "OVER_1.5");
  assert.strictEqual(slip[0].label, "Over 1.5");
  assert.strictEqual(slip[0].p, 0.81);
});

test("and stops it being machine-picked", () => {
  /* The whole bug: this field stayed true, so the refill treated an edited leg
     as one of its own and overwrote it. */
  const slip = [autoLeg()];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");
  assert.notStrictEqual(slip[0].auto, true,
    "the edited leg is still flagged auto, so the next shuffle will replace it");
});

test("the edit survives a shuffle", () => {
  /* End to end, using the refill expression the builders actually run. */
  const slip = [autoLeg(), { id: "m2", code: "DC_1X", label: "Home or draw", p: 0.7, auto: true }];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");

  const fresh = [
    { id: "m1", code: "DC_1X", label: "Home or draw", p: 0.78, auto: true },  /* the model's original */
    { id: "m3", code: "DC_X2", label: "Draw or away", p: 0.72, auto: true },
  ];
  let after = slip.filter((x) => !x.auto).concat(fresh);
  const seen = {};
  after = after.filter((x) => { if (seen[x.id]) return false; seen[x.id] = 1; return true; });

  const kept = after.find((x) => x.id === "m1");
  assert.ok(kept, "the edited leg was dropped from the slip entirely");
  assert.strictEqual(kept.code, "OVER_1.5",
    "the shuffle put the model's original market back over the user's choice");
  assert.ok(after.some((x) => x.id === "m3"), "the shuffle should still add new games");
  assert.ok(!after.some((x) => x.id === "m2"),
    "an untouched machine leg should still be replaced");
});

test("an untouched leg is still replaced", () => {
  /* The flag has to keep meaning something, or a shuffle stops shuffling. */
  const slip = [autoLeg()];
  const kept = slip.filter((x) => !x.auto);
  assert.strictEqual(kept.length, 0);
});

test("swapping onto a market already on the slip changes nothing", () => {
  /* SportyBet takes one pick per match. The guard has to fire before the write,
     or the duplicate check passes and the leg is edited anyway. */
  const slip = [autoLeg(), { id: "m1", code: "OVER_1.5", label: "Over 1.5", p: 0.81, auto: true }];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");
  assert.strictEqual(slip[0].code, "DC_1X", "the leg was edited into a duplicate");
  assert.strictEqual(slip[0].auto, true, "and was un-flagged despite nothing changing");
});

test("swapping a leg to the market it already has is a no-op", () => {
  const slip = [autoLeg()];
  runSwap(slip, "m1", "DC_1X", "DC_1X");
  assert.strictEqual(slip[0].auto, true,
    "nothing changed, so the leg is still the machine's");
});

/* ------------------------------------------------------------ the callers */

test("every refill drops machine legs and keeps the rest", () => {
  /* Three places rebuild My slip: the slider's sync, the wizard's conjure, and
     Book all. All three have to honour the flag, or an edited leg survives one
     path and is overwritten by another. */
  const refills = [...src.matchAll(/MYSLIP=MYSLIP\.filter\(function\(x\)\{return !x\.auto;\}\)/g)];
  assert.strictEqual(refills.length, 3,
    "expected the slider sync, the conjure and Book all, found " + refills.length);
});

test("retained legs are concatenated before the fresh ones", () => {
  /* The de-dupe that follows keeps the FIRST leg for each fixture. If the
     fresh picks came first, a re-picked fixture would win and the edit would be
     silently discarded even though the flag was cleared. */
  const parts = src.split("MYSLIP=MYSLIP.filter(function(x){return !x.auto;})");
  assert.strictEqual(parts.length, 4);
  parts.slice(1).forEach((p, i) => {
    const head = p.slice(0, 200);
    assert.match(head, /^\s*\r?\n?\s*\.concat\(/,
      "refill #" + (i + 1) + " does not concat the fresh picks after the kept ones");
  });
});

test("the de-dupe keeps the first leg for each fixture", () => {
  const dedupes = [...src.matchAll(/if\(seen\[x\.id\]\)return false;seen\[x\.id\]=1;return true;/g)];
  assert.ok(dedupes.length >= 2,
    "the de-dupe that protects the kept leg is missing from a refill path");
});
