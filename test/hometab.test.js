"use strict";
/* Owner, 13 Oct 2026: "when i click on the home button on the penalty game, it
   take me to the livescore page". The remembered tab comes back only on a reload
   or Back/Forward; a link to "/" is the front door. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the remembered tab returns on reload or Back, never on a link to home", () => {
  const i = html.indexOf('sessionStorage.getItem("sw.viewtab")');
  assert.ok(i > 0);
  const near = html.slice(i - 300, i + 60);
  assert.match(near, /_nav==="reload"\|\|_nav==="back_forward"/);
  assert.match(near, /performance\.getEntriesByType\("navigation"\)/);
});
