/* The booked-code modal's buttons.

   25 Sep 2026: the X pill was given class `code-x`, which is already the
   modal's close button. It picked up `position:absolute; top:8px; right:8px`
   and sat on top of "Your SportyBet booking code" and the close button, and
   its own black background rule restyled the close button in return. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the X pill does not share the close button's class", () => {
  const pill = html.match(/<a class='([^']*)' href='https:\/\/x\.com\/soccerwizardhq'/);
  assert.ok(pill, "the modal's X pill must still be findable");
  assert.ok(!pill[1].split(/\s+/).includes("code-x"),
    "code-x is the close button; on the pill it pins the pill over the title");
});

test("the pill's short label", () => {
  assert.match(html, /<span>Follow us on X<\/span><\/a>/);
});

test("the button says Make it safer, not Make it stronger", () => {
  /* "Stronger" read as bigger odds; the job is likelier to land at a lower
     price (owner, 25 Sep 2026). */
  assert.ok(!/>Make it stronger/.test(html), "Make it stronger is back somewhere");
  assert.ok((html.match(/&go=safer\\">Make it safer/g) || []).length >= 2,
    "both the booked-code modal and Your slips offer it");
});
