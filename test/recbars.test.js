"use strict";
/* 23 Oct 2026, owner: "the bars on 'our record, graded honestly' doesnt allign". Each By market row is its
   own grid, and a max-content count column ("1127/1399" against "120/156") moved every row's bar. The count
   column has a fixed width, on phones too, so all the bars start at the same x. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("every By market grid has a fixed-width count column, so the bars line up", () => {
  const rules = [...HTML.matchAll(/\.rec-mk-row\{[^}]*grid-template-columns:([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(rules.length >= 2, "desktop and phone rules");
  for (const cols of rules) assert.doesNotMatch(cols.split(/\s+/).pop(), /content|auto|fr/, "count column must not size to its text: " + cols);
});
