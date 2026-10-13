"use strict";
/* Manual kick-off overrides (owner, 13 Oct 2026: "add the manual kickoff
   override"). data/kickoff-overrides.json maps "Home|Away|feed date" to the real
   kick-off in UTC; lib/build.js applies it after the feed's own time. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "kickoff-overrides.json");

test("every override is Home|Away|YYYY-MM-DD -> an exact UTC instant", () => {
  const o = JSON.parse(fs.readFileSync(FILE, "utf8"));
  for (const [k, v] of Object.entries(o)) {
    assert.match(k, /^[^|]+\|[^|]+\|\d{4}-\d{2}-\d{2}$/, "key " + k);
    assert.match(v, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "value for " + k);
    assert.ok(!isNaN(Date.parse(v)));
  }
});

test("the build applies it to date, time and kickoff, keyed on the feed's date", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /KICKOFF_FIX\[`\$\{plainClub\(h\)\}\|\$\{plainClub\(a\)\}\|\$\{dateOut\}`\]/);
  assert.match(src, /date: dateOut,\s*\n\s*time: timeOut, kickoff: kickoff,/);
  assert.match(src, /catch \(e\) \{ KICKOFF_FIX = \{\}; \}/, "a broken file never fails the build");
});
