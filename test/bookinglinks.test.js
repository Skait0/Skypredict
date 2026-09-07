"use strict";
/* THE SHARE LINKS ARE WRITTEN DOWN TWICE, SO THEY ARE CHECKED HERE.
 *
 * /how-to-load-a-booking-code tells a reader that appending a code to a URL
 * loads the slip, and prints those URLs. The app builds its "Open in" buttons
 * from the same strings, in public/index.html. Two copies of a fact drift, and
 * this one drifts silently: the page would go on confidently printing an
 * address that no longer works, which is worse than not having the page.
 *
 * Bet9ja's parameter is the reason this matters. It is `bookABetCode`, found by
 * reading their bundle - the earlier guess, "BookABet", loaded their home page
 * with the code ignored and looked like it had worked.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const P = require("../lib/pages.js");

const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the page prints the same share links the app opens", () => {
  for (const [name, url] of [["SportyBet", P.SPORTY_SHARE],
                             ["Bet9ja", P.B9_SHARE],
                             ["football.com", P.FOOTBALL_SHARE]]) {
    assert.ok(idx.includes('"' + url + '"'),
      name + ": lib/pages.js prints " + url + " but public/index.html no longer " +
      "opens that address. One of the two has moved.");
  }
});

test("the how-to actually contains the links, not just a description of them", () => {
  const html = P.renderHowToCode();
  for (const url of [P.SPORTY_SHARE, P.B9_SHARE, P.FOOTBALL_SHARE]) {
    assert.ok(html.includes(url), "the page does not print " + url);
  }
});

test("the how-to is a page we ask to have indexed", () => {
  const html = P.renderHowToCode();
  assert.match(html, /rel="canonical" href="[^"]*\/how-to-load-a-booking-code"/);
  assert.doesNotMatch(html, /noindex/);
  assert.strictEqual((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /<title>How to load a booking code on SportyBet and Bet9ja/);
});

test("it is reachable, or it is a doorway", () => {
  /* A page built for search that no user path reaches is a doorway page, which
     Google names and penalises. The footer carries /booking-codes on every page
     of the site, and the codes hub carries this one - so the path from any page
     is two clicks, and both links are ones a reader would actually follow. */
  assert.match(P.pageFooter(), /href="\/booking-codes"/,
    "the footer no longer reaches the codes hub");
  const hub = P.renderCodesHub([{ date: "2026-09-08", legs: [], codes: {} }], null);
  assert.match(hub, /href="\/how-to-load-a-booking-code"/,
    "the hub no longer links the how-to, which leaves it reachable from nowhere");
});

test("the build writes it and lists it", () => {
  const pre = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.ok(pre.includes('["/how-to-load-a-booking-code"'),
    "prebuild does not write the page, so the footer links a 404");
});

test("it says the odds can move, because they do", () => {
  /* The code carries selections, not a price - the bookmaker re-prices on load.
     A page that skipped this would be setting up the complaint it exists to
     prevent. */
  const html = P.renderHowToCode();
  assert.match(html, /prices\s+them\s+again/i,
    "the re-pricing warning is gone from the page");
});
