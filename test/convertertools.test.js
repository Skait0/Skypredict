"use strict";
/* The converter's Trim to odds and Change markets tabs (owner, 28 Sep 2026:
 * "you can add the trim to user odds to the converter also"; "change market
 * also can be incorporated into the converter"), and the Slider switch that
 * jumped the page to the top. */
const test = require("node:test");
const assert = require("node:assert");
const { src, fn } = require("./books.js");

test("the converter offers Trim to odds and Change markets, only when they can act", () => {
  assert.match(src, /data-job="trim"/);
  assert.match(src, /data-job="change"/);
  const pj = fn("paintJobs");
  assert.match(pj, /trim:usable\.length>=3/);
  assert.match(pj, /change:changeOptions\(usable\)\.length>0/, "no Change tab when nothing on the slip can move");
  const rs = fn("renderStage");
  assert.match(rs, /job==="trim"[\s\S]*wireTrimTo\(st,usable,B\); wireTrim\(st,usable,B\);/,
    "the trim tab carries the target box and the old drop-N buttons, both wired");
  assert.match(rs, /job==="change"[\s\S]*wireChange\(st,usable,B\)/);
});

test("both tabs book through the shared refusal loop and show the book's own total", () => {
  const bl = fn("bookLegs");
  assert.match(bl, /bookRounds\(picks,B,src,outId,/);
  assert.match(bl, /showCode\(code,outId,null,B,sent,d\)/);
  assert.match(bl, /showBookErr\(outId,/);
  assert.match(fn("wireTrimTo"), /trimToOdds\(rows,t\)/, "the shared trim, not a copy");
  assert.match(fn("wireTrimTo"), /bookLegs\(kept,B,"trim"/);
  assert.match(fn("wireChange"), /changeAllPlan\(legs,from\.value,to\.value\)/);
  assert.match(fn("wireChange"), /bookLegs\(r\.legs,B,"change"/);
});

test("a leg the board does not carry still books, under the book's own id", () => {
  const legPick = new Function("fixtureByLeg", "fid", "mProb", fn("legPick") + "\nreturn legPick;")(
    () => null, () => "f", () => 0.7);
  const p = legPick({ eventId: "sr:match:9", prediction: "1X" }, { id: "eventId" });
  assert.strictEqual(p.eventId, "sr:match:9");
  assert.strictEqual(p.code, "1X");
  assert.strictEqual(p.id, "leg:sr:match:9");
});

test("switching builder moves only as far as the new panel, never to the top", () => {
  assert.doesNotMatch(src, /bldToTop/, "centring the tabs read as a jump to the top");
  const b = fn("bldToPanel");
  assert.match(b, /block:"nearest"/);
  assert.match(b, /BUILD\.mode==="slider"\?"sliderPanel":"wizardPanel"/);
  assert.match(src, /\.bld-panel\{scroll-margin-top:\d+px\}/, "clear of the sticky header");
});
