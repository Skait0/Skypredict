"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../lib/codescard.js");

/* The safer x20 card (owner, 22 Oct 2026): the 12:00 post's picture, so Instagram carries it too.
   One row per bookie that booked the slip, in the site's order; a short book says how many. */
const ROW = { legs: Array(12), odds: 20.55, codes: {
  msport: { code: "B2ZD615", n: 12 }, sporty: { code: "Y5NEDC", n: 12 }, betking: { code: "NT28RY", n: 11 } } };

test("the card says the day, the price and every bookie's code, in the site's order", () => {
  const L = C.saferLines(ROW, "2026-10-22");
  assert.strictEqual(L.date, "Thursday 22 October");
  assert.strictEqual(L.sum, "12 games  ·  every pick 72%+  ·  pays x20.55");
  assert.deepStrictEqual(L.books.map((b) => [b.key, b.code, b.note]),
    [["sporty", "Y5NEDC", ""], ["betking", "NT28RY", "11 of 12"], ["msport", "B2ZD615", ""]]);
  assert.strictEqual(L.zero, false);
  assert.strictEqual(C.saferLines({ legs: [], codes: {} }, "2026-10-22"), null, "nothing to draw, no card");
});

test("it draws a real PNG on the baked base", () => {
  const png = C.buildSafer(ROW, "2026-10-22");
  assert.ok(png && png.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
});

test("the route draws only safer x20 days, and the 12:00 post carries the card everywhere", () => {
  const route = fs.readFileSync(path.join(__dirname, "..", "api", "slipcard.js"), "utf8");
  assert.match(route, /if \(day >= require\("\.\.\/lib\/safer20\.js"\)\.FIRST_DAY\)/, "never a Big odds row drawn as a safer x20");
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.match(social, /const safeDue = \["x", "fb", "tg", "ig"\]/);
  assert.match(social, /const safeUrl = SITE \+ "\/api\/slipcard\?s=" \+ day;/);
  assert.match(social, /else if \(safeCard\) items\.push\(\{ key: safeKey\(ch\), kind: "safe20", channel: ch, image: safeCard,/,
    "Instagram only with the picture");
});
