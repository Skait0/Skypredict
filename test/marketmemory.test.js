"use strict";

/**
 * The market chips survive a refresh.
 *
 * Reported 24 Sep: chips switched on or off went back to the defaults on
 * reload. Neither BUILD.mk nor WSP.mk was ever stored. These run the page's
 * own restore and save code against a fake localStorage, as two page loads.
 */

const test = require("node:test");
const assert = require("node:assert");
const { src, decl } = require("./books.js");

const start = src.indexOf('var MK_STORE="sw.mk";');
const end = src.indexOf("function saveMarkets(){");
assert.ok(start > 0 && end > start, "restore/save block not found");
let k = src.indexOf("{", end), d = 0;
for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
const block = src.slice(start, k + 1);

/* One page load: fresh BUILD and WSP from the page's own literals, then the
   restore, exactly as the script runs top to bottom. */
function load(store) {
  const localStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, v) => { store[key] = String(v); },
  };
  return new Function("localStorage",
    decl("BUILD") + "\n" + decl("WSP") + "\n" + block +
    "\nreturn {BUILD:BUILD, WSP:WSP, save:saveMarkets};")(localStorage);
}

test("a choice made before a refresh is still there after it", () => {
  const store = {};
  const a = load(store);
  a.BUILD.mk.o15 = false; a.WSP.mk.o15 = false;       // switched off
  a.BUILD.mk.both = true; a.WSP.mk.both = true;       // switched on
  a.WSP.mk.draw = true;                                // wizard-only
  a.save();
  const b = load(store);
  assert.strictEqual(b.BUILD.mk.o15, false);
  assert.strictEqual(b.BUILD.mk.both, true);
  assert.strictEqual(b.WSP.mk.o15, false);
  assert.strictEqual(b.WSP.mk.both, true);
  assert.strictEqual(b.WSP.mk.draw, true);
  assert.ok(!("draw" in b.BUILD.mk), "the slider never gains a draw key");
});

test("a first visit gets the defaults", () => {
  const fresh = load({});
  const defaults = load({ "sw.mk": "garbage{" });
  assert.deepStrictEqual(fresh.BUILD.mk, defaults.BUILD.mk);
  assert.strictEqual(fresh.BUILD.mk.wd, true);
});

test("stored data from another version cannot break the builder", () => {
  const store = { "sw.mk": JSON.stringify({
    b: { wd: false, out: "yes", retired: true },      // unknown key, non-boolean value
    w: { wd: false, any: false, out: false, o15: false, o25: false, o35: false, fh: false,
         tts: false, tts2: false, both: false, dro25: false, drgg: false, rsgg: false,
         rso25: false, dro15: false, rso15: false, weh: false, draw: false, corn: false,
         shots: false } }) };
  const s = load(store);
  assert.strictEqual(s.BUILD.mk.wd, false, "a real boolean is taken");
  assert.strictEqual(s.BUILD.mk.out, true, "a non-boolean keeps the default");
  assert.ok(!("retired" in s.BUILD.mk), "a key the page no longer has is ignored");
  assert.ok(Object.values(s.WSP.mk).some(Boolean),
    "a set with nothing on is refused - the builder cannot build from it");
});

test("the save runs from renderBuilder, which every toggle ends in", () => {
  const i = src.indexOf("function renderBuilder(){");
  assert.match(src.slice(i, i + 80), /saveMarkets\(\)/);
});

test("a drag does not rewrite storage every frame", () => {
  let writes = 0;
  const store = {};
  const localStorage = { getItem: (k) => store[k] || null,
    setItem: (k, v) => { writes++; store[k] = v; } };
  const s = new Function("localStorage", decl("BUILD") + "\n" + decl("WSP") + "\n" + block +
    "\nreturn {BUILD:BUILD, save:saveMarkets};")(localStorage);
  for (let n = 0; n < 60; n++) s.save();
  assert.strictEqual(writes, 1);
  s.BUILD.mk.o25 = true; s.save();
  assert.strictEqual(writes, 2);
});
