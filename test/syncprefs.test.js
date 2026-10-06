"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Y = require("../lib/sync.js");

const pref = (v) => ({ v, at: 5 });
const val = (prefs) => Y.validate({ v: 1, prefs }).data.prefs;

test("avatar, name and theme sync", () => {
  const p = val({ avatar: pref("glass"), name: pref("Kayode"), theme: pref("light") });
  assert.deepStrictEqual(p, { avatar: pref("glass"), name: pref("Kayode"), theme: pref("light") });
});

test("only a free avatar is accepted for now", () => {
  assert.deepStrictEqual(Y.FREE_AVATARS, ["fire", "8bit", "2bit", "lino", "glass", "halo"]);
  assert.strictEqual(Y.AVATARS.length, 14);
  assert.deepStrictEqual(val({ avatar: pref("gold") }), {});        // locked skin
  assert.deepStrictEqual(val({ avatar: pref("../x") }), {});
});

test("a name is trimmed text, 24 chars at most, no markup", () => {
  assert.deepStrictEqual(val({ name: pref("  Ada  ") }), { name: pref("Ada") });
  assert.deepStrictEqual(val({ name: pref("x".repeat(25)) }), {});
  assert.deepStrictEqual(val({ name: pref("<b>hi</b>") }), {});
  assert.deepStrictEqual(val({ name: pref("   ") }), {});
});

test("theme is dark or light only", () => {
  assert.deepStrictEqual(val({ theme: pref("auto") }), {});
  assert.deepStrictEqual(val({ theme: pref("dark") }), { theme: pref("dark") });
});

test("the page syncs the same three keys", () => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  const m = /var PREFS=\{([\s\S]*?)\};/.exec(html);
  assert.ok(m);
  assert.match(m[1], /avatar:"sw\.avatar"/);
  assert.match(m[1], /name:"sw\.name"/);
  assert.match(m[1], /theme:"sw\.theme"/);
});
