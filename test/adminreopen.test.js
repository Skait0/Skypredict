"use strict";
const test = require("node:test");
const assert = require("node:assert");
const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "public", "account-ui.js"), "utf8");

/* Owner, 22 Oct 2026: "after i manually check a leg and click on won, it collapses the ticket".
   Setting a leg redraws the win list folded; the ticket that was open opens again. */
test("setting a leg by hand keeps that ticket open after the list redraws", () => {
  assert.match(src, /hitsOpen=id; hitsLoad\(\);/, "the fixed ticket is remembered before the redraw");
  assert.match(src, /if\(hitsOpen\)\{ var reopen=box\.querySelector\("\[data-chk='"\+hitsOpen\+"'\]"\); hitsOpen=null; if\(reopen\) reopen\.click\(\); \}/,
    "and opened again once the list is drawn");
});
