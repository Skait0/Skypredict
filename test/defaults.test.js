"use strict";

/**
 * What a fresh visit starts with.
 *
 * Two defaults, both asked for directly: the market chips a slip is built from,
 * and how wide the ticket window is.
 *
 * Neither is a value anything computes, so nothing else in the suite would
 * notice them changing. They are also easy to move by accident - the market set
 * is written out twice, once for each builder, and a change to one is a change
 * nobody sees until the two builders start producing different slips from the
 * same settings.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const index = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* Every default market set in the file, parsed rather than string-matched, so
   the assertions are about which markets are on and not about spacing. */
function marketSets() {
  return [...index.matchAll(/mk:\{([^}]+)\}/g)].map((m) => {
    const out = {};
    m[1].split(",").forEach((pair) => {
      const [k, v] = pair.split(":");
      out[k.trim()] = v.trim() === "true";
    });
    return out;
  });
}

const WANTED = ["wd", "out", "o15", "tts"];

test("a fresh visit starts on four markets", () => {
  /* Asked for: "reduce the default markets to just win or draw, over 1.5 and
     outright win and team 0.5". */
  const sets = marketSets();
  assert.ok(sets.length > 0, "no default market set found at all");
  sets.forEach((set, i) => {
    const on = Object.keys(set).filter((k) => set[k]).sort();
    assert.deepStrictEqual(on, [...WANTED].sort(),
      "market set #" + (i + 1) + " starts on [" + on.join(", ") + "]");
  });
});

test("both builders start from the same markets", () => {
  /* The slider and the wizard each carry their own copy. They are synced on
     every toggle, so starting them apart means the first slip built in one
     mode differs from the same slip built in the other. */
  const sets = marketSets();
  assert.strictEqual(sets.length, 2,
    "expected the slider's set and the wizard's, found " + sets.length);
  assert.deepStrictEqual(sets[0], sets[1],
    "the slider and the wizard start on different markets");
});

test("the riskier markets are off, not missing", () => {
  /* Off by default is not the same as gone. The chips have to stay available,
     or this is a removal rather than a default. */
  const set = marketSets()[0];
  ["any", "o25", "o35", "fh", "tts2", "both"].forEach((k) => {
    assert.strictEqual(set[k], false, k + " should start off");
  });
  /* Each one still has a chip in the palette. */
  ["any", "o25", "o35", "fh", "tts2", "both"].forEach((k) => {
    assert.ok(new RegExp('\\{k:"' + k + '"').test(index),
      k + " has no chip left in MKT_CFG, so it cannot be switched back on");
  });
});

test("the ticket window starts on a single day", () => {
  /* Asked for: "defaul to today only also". A slip whose legs span three days
     cannot settle in one evening. */
  assert.match(index, /var SCOPE="day";/,
    'SCOPE should start as "day"');
  assert.match(index, /var SDAY=0;/,
    'and on offset 0 - today, not tomorrow');
});

test("the new window reaches people who already saved the old one", () => {
  /* SCOPE is persisted, so changing the literal alone would only ever be seen
     by first-time visitors - the change would look like it had not taken.
     A one-time clear moves everyone over once. */
  const i = index.indexOf('var SCOPE="day";');
  const win = index.slice(i, i + 700);
  assert.match(win, /localStorage\.removeItem\("sw\.scope"\)/,
    "nothing clears the stored window, so returning visitors keep the old default");
  assert.match(win, /sw\.scopedflt2/, "the clear is not guarded by a flag");
  /* Guarded, or the stored preference is wiped on every load and choosing the
     wide window could never stick. */
  assert.match(win, /if\(!localStorage\.getItem\("sw\.scopedflt2"\)\)/,
    "the reset must run once, not on every visit");
  assert.match(win, /localStorage\.setItem\("sw\.scopedflt2"/,
    "the flag is never set, so the reset repeats forever");
  /* And the read has to come after the clear, or it reads the value about to
     be removed and the reset does nothing on the visit that performs it. */
  const clear = index.indexOf('localStorage.removeItem("sw.scope")', i);
  const read = index.indexOf('localStorage.getItem("sw.scope")', i);
  assert.ok(clear > 0 && read > clear,
    "the stored window is read before it is cleared, so the reset has no effect " +
    "on the visit that runs it");
});

test("the new key is namespaced like every other", () => {
  /* The privacy page describes sw.* storage and nothing else. */
  assert.match(index, /"sw\.scopedflt2"/);
});
