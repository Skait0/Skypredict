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

/* Owner, 30 Sep 2026, on SportyBet code T74M6R: "the edit function ... could
 * only edit 3 games tops". 32 of its 36 open legs were women's, reserves and
 * lower-league games the board does not carry, so Edit had no numbers for
 * them - true, but the panel never said so and it read as broken. */
test("Edit for me says how many games it cannot judge, and names the leagues", () => {
  const note = new Function("fixtureByLeg", "legStarted", "esc",
    fn("offBoardNote") + "\nreturn offBoardNote;")(
    (l) => (l.on ? {} : null), () => false, (s) => String(s));
  const legs = [
    { prediction: "1X", on: true },
    { prediction: "OVER_1.5", league: "UEFA Champions League Women" },
    { prediction: "GG", league: "UEFA Champions League Women" },
    { prediction: "1", league: "Swiss 1. Liga" },
  ];
  const h = note(legs, {});
  assert.match(h, /3 of these 4 games/);
  assert.match(h, /UEFA Champions League Women \(2\)/, "the biggest league first, counted");
  assert.match(h, /the other 1/);
  assert.strictEqual(note([{ prediction: "1X", on: true }], {}), "", "nothing to say when we cover them all");
  assert.match(fn("saferBoxInner"), /offBoardNote\(legs,B\)/);
});

test("the Convert card names every bookie it can convert to, not just the first", () => {
  const line = new Function("otherBooks", fn("convTargetsLine") + "\nreturn convTargetsLine;")(
    () => [{ label: "Bet9ja" }, { label: "BetKing" }, { label: "betPawa" }, { label: "1xBet" }]);
  assert.strictEqual(line({}), "To Bet9ja, BetKing, betPawa or 1xBet");
  const pj = fn("paintJobs");
  assert.doesNotMatch(pj, /"Convert to "\+convTarget/, "the card named only the default target");
  assert.match(pj, /convTargetsLine\(B\)/);
});
