"use strict";

/**
 * A watched result has to survive a refresh.
 *
 * Reported: Finnish games showed their scores on the card hours after full
 * time, then "after the push, i refreshed and they were gone."
 *
 * Nothing had gone wrong with the build. The live feed has no full time - a
 * match is in it, then it is not - so the client writes down the last score it
 * saw and treats it as final once the match was watched past the 80th minute.
 * That is what was on screen. But LIVE_LAST was a bare object, so a reload
 * emptied it, and someone arriving after the whistle never had those scores at
 * all.
 *
 * The durable fix is the score oracle enriching fixtures at build time, which
 * now bakes them properly. This is the other half: what one browser watched
 * should not be lost the moment that browser reloads.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* A fake localStorage, so the round trip is exercised rather than described. */
function store() {
  const mem = {};
  return { getItem: (k) => (k in mem ? mem[k] : null),
           setItem: (k, v) => { mem[k] = String(v); },
           removeItem: (k) => { delete mem[k]; },
           _mem: mem };
}

function saver(LIVE_LAST, localStorage) {
  return new Function("LIVE_LAST", "localStorage", "LIVE_LAST_KEY",
    grab("saveLiveLast") + "\nreturn saveLiveLast;")(LIVE_LAST, localStorage, "sw.livelast");
}

test("it writes down the score, the minute, and nothing else", () => {
  const ls = store();
  const LIVE_LAST = { m1: { hg: 1, ag: 2, minute: 88, f: { home: "Ilves", huge: "x".repeat(500) } } };
  saver(LIVE_LAST, ls)();
  const saved = JSON.parse(ls.getItem("sw.livelast"));
  assert.deepStrictEqual(saved.at.m1, { hg: 1, ag: 2, minute: 88 });
  assert.ok(!JSON.stringify(saved).includes("Ilves"),
    "the fixture object is never read back and must not be stored");
});

test("a half-written entry is not stored", () => {
  const ls = store();
  saver({ a: { hg: 1, ag: null, minute: 90 }, b: null, c: { hg: 0, ag: 0, minute: 85 } }, ls)();
  const at = JSON.parse(ls.getItem("sw.livelast")).at;
  assert.deepStrictEqual(Object.keys(at), ["c"]);
});

test("a 0-0 is stored, not treated as missing", () => {
  /* AC Oulu v SJK finished 0-0 and our tip hit on it. A falsy check instead of
     a null check would have thrown that away. */
  const ls = store();
  saver({ m: { hg: 0, ag: 0, minute: 90 } }, ls)();
  assert.deepStrictEqual(JSON.parse(ls.getItem("sw.livelast")).at.m, { hg: 0, ag: 0, minute: 0 + 90 });
});

test("it is stamped with the day", () => {
  const ls = store();
  saver({ m: { hg: 1, ag: 0, minute: 90 } }, ls)();
  assert.match(JSON.parse(ls.getItem("sw.livelast")).day, /^\d{4}-\d{2}-\d{2}$/,
    "without a day stamp the store grows for ever and yesterday's scores linger");
});

test("storage never throws out of the save", () => {
  /* Private windows and full quotas both throw on setItem. Losing a cached
     score is nothing; breaking the live poll that calls this is not. */
  const bad = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); },
                removeItem: () => {} };
  assert.doesNotThrow(() => saver({ m: { hg: 1, ag: 1, minute: 90 } }, bad)());
});

/* ------------------------------------------------------------ the wiring */

test("the score is saved every time the live poll notes one", () => {
  const fn = grab("noteLiveSeen");
  assert.match(fn, /saveLiveLast\(\);/,
    "nothing persists it, so it is still lost on refresh");
  assert.ok(fn.indexOf("LIVE_LAST[id]=") < fn.indexOf("saveLiveLast()"),
    "it must be saved after the scores are recorded, not before");
});

test("it is restored on load, and only for today", () => {
  const i = src.indexOf("function restoreLiveLast()");
  assert.ok(i > 0, "nothing reads the store back, so saving it achieves nothing");
  const fn = src.slice(i, i + 700);
  assert.match(fn, /o\.day!==new Date\(\)\.toISOString\(\)\.slice\(0,10\)/,
    "yesterday's watched scores are the build's job by then and must be dropped");
  assert.match(fn, /localStorage\.removeItem\(LIVE_LAST_KEY\)/,
    "a stale day should be cleared, not just ignored");
  assert.match(fn, /\}catch\(e\)\{\}/, "a corrupt store must not break the page");
});

test("the key is namespaced like every other", () => {
  /* The privacy page describes sw.* storage and nothing else. */
  assert.match(src, /var LIVE_LAST_KEY="sw\.livelast"/);
});

test("a server-graded score still wins over a watched one", () => {
  /* The order matters. The build's score is authoritative; this cache is only
     the stopgap for the hours before a build runs. */
  const fn = grab("fixtureState");
  assert.ok(fn.indexOf("potdResult(f,f)") < fn.indexOf("LIVE_LAST"),
    "the graded result must be consulted before the watched one");
});
