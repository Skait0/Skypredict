"use strict";
/* Owner, 12 Oct 2026, picking Champions League games: the Wizard offered Under 4.5 on
   Viking v Bayern - "these two teams are far apart. this is messed up". Then: "check for all
   the options also so we dont have this issue again". The audit found one more market of the
   same shape - the underdog's handicap, which loses only to a big win. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(n) {
  const i = src.search(new RegExp("(?:^|\\n)function " + n + "\\s*\\(", "m"));
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const judged = new Function("dogHcap", "HCAP_DOG_BAR", grab("judgedP") + "return judgedP;")(() => false, 0.02);

const vikingBayern = { lh: 1.3, la: 2.28, home_p: 0.206, away_p: 0.587, o45: 0.288 };

test("Under 4.5 is refused on a rout: Viking v Bayern as the board had it", () => {
  assert.ok(judged(vikingBayern, "UNDER_4.5", 0.712) < 0, "below every builder's floor");
});

test("a tight game keeps its Under 4.5, and other markets on a rout are untouched", () => {
  assert.strictEqual(judged({ lh: 1.1, la: 0.9 }, "UNDER_4.5", 0.9), 0.9);
  assert.strictEqual(judged(vikingBayern, "2", 0.587), 0.587);
});

test("high-scoring even games lose Under 4.5 too: 3+ goals expected", () => {
  assert.ok(judged({ lh: 1.6, la: 1.5 }, "UNDER_4.5", 0.75) < 0);
  assert.strictEqual(judged({ lh: 1.4, la: 1.5 }, "UNDER_4.5", 0.8), 0.8);
});

test("an underdog handicap is refused when the favourite can win big", () => {
  assert.ok(judged(vikingBayern, "AH_1_1.5", 0.62) < 0, "Viking +1.5");
  assert.ok(judged(vikingBayern, "AH_1_2.5", 0.8) < 0, "Viking +2.5");
  /* The favourite's own line, and a close game's underdog line, are untouched. */
  assert.strictEqual(judged(vikingBayern, "AH_2_1.5", 0.88), 0.88);
  assert.strictEqual(judged({ lh: 1.3, la: 1.5, home_p: 0.33, away_p: 0.40 }, "AH_1_1.5", 0.8), 0.8);
});

test("both builders send every leg through judgedP, so the guards reach them both", () => {
  assert.ok((src.match(/judgedP\(f,c,v0\)/g) || []).length >= 2, "the Slider");
  assert.match(src, /var vj=judgedP\(f,c,v\);/, "the Wizard");
});
