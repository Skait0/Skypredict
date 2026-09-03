"use strict";

/**
 * What "How we did yesterday" is allowed to claim.
 *
 * Reported 3 Sep 2026: the panel is damning when the day is only half graded.
 * On 2 Sep the board carried 40 fixtures, 31 were graded, and a first-time
 * reader saw "18 of 31 tips landed, 58%" with nothing saying nine were still
 * out. The page already knows how to say "and N more are still being graded" -
 * it just had no way to know N. Its only site-wide source, pendingByDate,
 * counts rows the record HOLDS and cannot confirm, and a tip is filed only
 * while its fixture is still on the board, so a late game with no build before
 * midnight is never written down and never counted.
 *
 * publishedByDate closes that: the build records how many tips each day carried
 * and carries it forward, because the board holds today and onward and a day's
 * fixtures vanish when it rolls over.
 *
 * These drive yestCounts itself with the three sources in every combination,
 * rather than asserting the strings the panel builds from it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* `sticky` is what this reader's browser kept; DATA is what the build shipped. */
function counter({ sticky = null, published = null, pending = null } = {}) {
  const store = {};
  if (sticky != null) {
    store["sw.day.2026-09-02"] = JSON.stringify(new Array(sticky).fill(0));
  }
  return new Function("STORE", [
    'var STICKY_PFX="sw.day.";',
    'function isoOffset(){ return "2026-09-02"; }',
    "var localStorage={ getItem:function(k){ return (k in STORE)?STORE[k]:null; } };",
    "var DATA=" + JSON.stringify({
      publishedByDate: published || {},
      pendingByDate: pending || {},
    }) + ";",
    grab("yestCounts"),
    "return yestCounts;",
  ].join("\n"))(store);
}

/* ------------------------------------------------------ a half-graded day */

test("a first-time reader is told how many are still out", () => {
  /* The reported case exactly: no sticky copy, 40 published, 31 graded. */
  const f = counter({ published: { "2026-09-02": 40 } });
  const r = f(31);
  assert.strictEqual(r.pending, 9, "nine tips have not been graded");
  assert.strictEqual(r.predicted, 40, "out of the forty the day carried");
});

test("a returning reader's own copy is preferred when it knows more", () => {
  const f = counter({ sticky: 40, published: { "2026-09-02": 38 } });
  assert.deepStrictEqual(f(31), { predicted: 40, pending: 9 });
});

test("the build's figure is used when the reader has no copy of the board", () => {
  /* The whole point: this is most readers, and before publishedByDate they got
     nothing at all. */
  const f = counter({ sticky: null, published: { "2026-09-02": 40 } });
  assert.strictEqual(f(31).pending, 9);
});

test("pendingByDate still answers when it is the only source", () => {
  const f = counter({ pending: { "2026-09-02": 4 } });
  assert.deepStrictEqual(f(31), { predicted: 35, pending: 4 });
});

/* --------------------------------------------------------- a finished day */

test("a fully graded day claims nothing is outstanding", () => {
  const f = counter({ published: { "2026-09-02": 31 } });
  assert.deepStrictEqual(f(31), { predicted: 31, pending: 0 });
});

test("a stale published count below the graded total cannot go negative", () => {
  /* More results arrived than the board carried - a carried-forward figure can
     lag a late rebuild. It must read as finished, never as minus two. */
  const f = counter({ published: { "2026-09-02": 29 } });
  const r = f(31);
  assert.strictEqual(r.pending, 0, "never negative, got " + r.pending);
  assert.strictEqual(r.predicted, 31);
});

test("nothing graded yet still reports the whole day as outstanding", () => {
  const f = counter({ published: { "2026-09-02": 40 } });
  assert.deepStrictEqual(f(0), { predicted: 40, pending: 40 });
});

/* ------------------------------------------------------------ degradation */

test("no sources at all is silent rather than wrong", () => {
  /* An older payload with neither map, and a reader with no sticky copy. It
     must not invent a pending count. */
  const f = counter({});
  assert.deepStrictEqual(f(31), { predicted: 31, pending: 0 });
});

test("a junk published value is ignored, not coerced into a claim", () => {
  for (const bad of [null, "", "many", NaN, -5, {}]) {
    const f = counter({ published: { "2026-09-02": bad } });
    const r = f(31);
    assert.strictEqual(r.pending, 0, "value " + JSON.stringify(bad) + " must not produce a claim");
  }
});

test("the panel asks yestCounts rather than counting inline again", () => {
  /* Call-site assertion. The logic moved out of renderDaily so it could be
     driven here; a second inline copy would drift from it silently. */
  assert.match(src, /var _yc=yestCounts\(res\.length\)/,
    "renderDaily must use yestCounts");
  const daily = src.slice(src.indexOf("function renderDaily(){"),
                          src.indexOf("function renderDaily(){") + 2500);
  assert.ok(!/STICKY_PFX\+isoOffset\(-1\)/.test(daily),
    "renderDaily must not read the sticky board itself any more");
});
