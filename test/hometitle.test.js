"use strict";
/* Owner, 18 Oct 2026: the homepage title said "free SportyBet codes", but the site has a paywall
   and the rule is never "free" in marketing. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("the homepage title never says free", () => {
  const t = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8").match(/<title>([^<]*)<\/title>/)[1];
  assert.doesNotMatch(t, /\bfree\b/i);
  assert.match(t, /SportyBet booking codes/);
});
