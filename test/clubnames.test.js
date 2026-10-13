"use strict";
/* Full club names on screen (owner, 13 Oct 2026); the short names stay the key. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const src = html.slice(html.indexOf("function clubName("), html.indexOf("function fid("));
const clubName = new Function(src + "\nreturn clubName;")();

test("short names are drawn in full, everything else as it is", () => {
  assert.strictEqual(clubName("Ath Madrid"), "Atletico Madrid");
  assert.strictEqual(clubName("Man United"), "Manchester United");
  assert.strictEqual(clubName("Nott'm Forest"), "Nottingham Forest");
  assert.strictEqual(clubName("Arsenal"), "Arsenal");
  assert.strictEqual(clubName("constructor"), "constructor");
});

test("search finds a club by either name, and fid still keys on the short one", () => {
  assert.match(html, /\+" "\+clubName\(f\.home\)\+" "\+clubName\(f\.away\)\)\.toLowerCase\(\)/);
  assert.match(html, /function fid\(f\)\{return "m"\+\(f\.date\+f\.home\+f\.away\)/);
});
