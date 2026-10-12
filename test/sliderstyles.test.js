"use strict";

/**
 * Best chance has no meaning in the Slider (owner, 11 Oct 2026: "if it ignores
 * the slider, then it should be turned off"). sliderStyle() reads its 1.55 as
 * neutral, so it built exactly the Even slip under a different name.
 */

const test = require("node:test");
const assert = require("node:assert");
const { src, fn } = require("./books.js");

const decl = (re) => src.match(re)[0];
const api = new Function(
  "var WSP={};" + decl(/var BANKERS=[^;]+;/) + decl(/var BEST_CHANCE=[^;]+;/) + decl(/var SLIP_STYLES=[^\n]+/) + "\n" +
  fn("sliderStyles") + fn("sliderStyleOn") + "return {WSP:WSP, sliderStyles:sliderStyles, sliderStyleOn:sliderStyleOn, BEST_CHANCE:BEST_CHANCE};")();

test("the Slider offers every slip style except Best chance", () => {
  const names = api.sliderStyles().map((s) => s[1]);
  assert.ok(!names.includes("Best chance"));
  assert.deepStrictEqual(names, ["Bankers", "More games", "Balanced", "Fewer games"]);
});

test("with Best chance chosen in the Wizard, the Slider shows Balanced, which is what it builds", () => {
  api.WSP.legodd = api.BEST_CHANCE;
  assert.strictEqual(api.sliderStyleOn(1.4), true);
  assert.strictEqual(api.sliderStyleOn(1.7), false);
  api.WSP.legodd = 1.7;
  assert.strictEqual(api.sliderStyleOn(1.7), true);
  assert.strictEqual(api.sliderStyleOn(1.4), false);
});
