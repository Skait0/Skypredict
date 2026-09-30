"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "spell.js"), "utf8");
const S = require("../public/spell.js");

test("spell.js is ES5 and uses no raw colours", () => {
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`|\bclass\s/);
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => !/^#fff$/i.test(h));
  assert.deepStrictEqual(hex, [], "colours come from --si-* tokens");
});

test("the keeper holds the ball until the account is signed in", () => {
  assert.deepStrictEqual(S.nextBeat(0, 0, false), { hold: true });
  assert.deepStrictEqual(S.nextBeat(0, 1, false), { to: 1, kind: "pass" });
});

test("a long load circles the ball back through midfield instead of freezing", () => {
  assert.deepStrictEqual(S.nextBeat(4, 1, false), { to: 2, kind: "pass", loop: true });
});

test("once finishing: flick into 5, pass to 6, shot into the goal (7)", () => {
  assert.deepStrictEqual(S.nextBeat(4, 1, true), { to: 5, kind: "flick" });
  assert.deepStrictEqual(S.nextBeat(5, 2, true), { to: 6, kind: "pass" });
  assert.deepStrictEqual(S.nextBeat(6, 2, true), { to: 7, kind: "shot" });
  assert.deepStrictEqual(S.nextBeat(0, 0, true), { to: 1, kind: "pass" }, "finish before step(1) never deadlocks");
});

test("first names: Google's given name, else the email's local part, title-cased and short", () => {
  assert.strictEqual(S.firstName("tunde", "x@y.com"), "Tunde");
  assert.strictEqual(S.firstName("", "ade.bola99@gmail.com"), "Ade");
  assert.strictEqual(S.firstName("  ", "_@x.com"), "");
  assert.strictEqual(S.firstName("A".repeat(50), "").length, 20);
});

test("timing constants match the spec", () => {
  assert.strictEqual(S.MAX_MS, 20000);
  assert.strictEqual(S.HOLD_MS, 900);
  assert.strictEqual(S.MIN_MS, 1800);
});
