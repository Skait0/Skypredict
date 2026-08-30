"use strict";

/**
 * Saving or deleting a slip has to redraw everything that reads SLIPS.
 *
 * Reported: "sometimes when i click on save your slip, it doesnt show on the
 * home page till i refresh. also, in the your slip, when i delete the last
 * ticket, it still shows that i have a slip till i refresh."
 *
 * One omission behind both. `renderMyResults()` draws the home-page card — the
 * one that answers "did mine come in?" — and it was called exactly once, at
 * startup, plus once more when the coach note is dismissed. Nothing called it
 * again.
 *
 * So `rememberSlip` pushed the slip, persisted it, and returned: the card
 * stayed absent until a reload rebuilt the page from storage. And `removeSlip`
 * redrew the sheet and the record but not the card, which is exactly why the
 * sheet looked right while the home page went on claiming a slip that was gone.
 *
 * The fix is one function called from all three mutation sites. It is
 * deliberately NOT folded into `saveSlips()`, tempting as that single
 * chokepoint looks: `renderRecord()` itself calls `saveSlips()` when grading
 * changes something, so a redraw hung there would recurse.
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

test("refreshSlipUI redraws the home card, the record and the sheet", () => {
  const fn = grab("refreshSlipUI");
  ["renderMyResults", "renderRecord", "renderSlipsSheet"].forEach((r) => {
    assert.match(fn, new RegExp(r + "\\(\\)"),
      r + " must be redrawn - it reads SLIPS");
  });
});

test("each redraw is isolated, so one failure does not strand the others", () => {
  /* The home card is the one the user complained about. If renderRecord threw
     first it would take the card with it, which is the same stale-UI bug in a
     different coat. */
  const fn = grab("refreshSlipUI");
  const guards = fn.match(/try\{[^}]*\}catch\(e\)\{\}/g) || [];
  assert.ok(guards.length >= 3,
    "expected each render wrapped separately, found " + guards.length);
});

test("every function that mutates SLIPS refreshes the UI", () => {
  /* The actual bug: two of these three did not. */
  ["rememberSlip", "removeSlip", "clearSlips"].forEach((name) => {
    const fn = grab(name);
    assert.match(fn, /refreshSlipUI\(\)/,
      name + " changes SLIPS and must redraw what reads it");
  });
});

test("the refresh is not hung off saveSlips", () => {
  /* renderRecord calls saveSlips when grading settles something. Hanging the
     redraw there would call renderRecord from inside renderRecord. */
  const fn = grab("saveSlips");
  assert.doesNotMatch(fn, /refreshSlipUI/,
    "saveSlips is reached from inside renderRecord - redrawing there recurses");
});

test("and it is re-entrancy guarded anyway", () => {
  const fn = grab("refreshSlipUI");
  assert.match(fn, /if\(SLIPUI_BUSY\) return;/,
    "a redraw that re-enters must return rather than recurse");
  assert.match(fn, /SLIPUI_BUSY=true/);
  assert.match(fn, /SLIPUI_BUSY=false/,
    "and the flag has to be cleared, or the UI freezes after one refresh");
});

test("the home card still clears itself when the last slip goes", () => {
  /* Redrawing is only half of it - renderMyResults has to empty the host when
     there is nothing left, or the card keeps its last contents forever. */
  const fn = grab("renderMyResults");
  assert.match(fn, /if\(!SLIPS\.length\)\{\s*host\.innerHTML="";\s*return;\s*\}/,
    "an empty SLIPS must blank the card, not leave the previous render");
});
