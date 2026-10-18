"use strict";
/* Sentry, 18 Oct 2026: "'.byo-book:not(.byo-to .byo-book) .byo-b' is not a valid selector".
   A combinator inside :not() is Selectors Level 4; older phone browsers reject the whole
   selector and querySelectorAll throws, so the click it sat in stopped half way. No
   selector the page builds may put a combinator inside :not(). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("no querySelector puts a combinator inside :not()", () => {
  const bad = [];
  for (const f of ["index.html", "account-ui.js", "messages.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8");
    for (const m of src.matchAll(/querySelector(?:All)?\((["'])((?:(?!\1).)*)\1\)/g))
      if (/:not\([^)]*[\s>+~][^)]*\)/.test(m[2])) bad.push(f + ": " + m[2]);
  }
  assert.deepStrictEqual(bad, []);
});
