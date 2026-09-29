"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Y = require("../lib/sync.js");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const block = /<script id="swAccount">([\s\S]*?)<\/script>/.exec(html);

function load() {
  // vm.runInNewContext would run this in a separate V8 realm, so every object
  // literal it builds (prefs, tombstones, ...) would carry a different
  // Object.prototype than the ones this test file builds, and
  // assert.deepStrictEqual would fail on prototype identity alone, whatever
  // the values are. runInThisContext shares this realm and still isolates
  // the block's vars from this file (nothing here declares `var KEYS` etc.).
  const module = { exports: {} };
  global.module = module;
  try {
    vm.runInThisContext(block[1]);
  } finally {
    delete global.module;
  }
  return module.exports;
}
function store(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const NOW = Date.UTC(2026, 8, 29, 10);
const slip = (sid, at, over) => Object.assign({ sid, at, code: null, book: "sporty", legs: [{ id: "f1", code: "OV_1.5", p: 0.8, odd: 1.3 }],
  odds: 1.3, settled: false, won: null, hits: 0, graded: 0 }, over || {});

test("the account block exists, is ES5 and is not the big app script", () => {
  assert.ok(block, '<script id="swAccount"> present');
  assert.doesNotMatch(block[1], /=>|\blet\s|\bconst\s|`/);
  assert.ok(block[1].length < 40000);
});

test("first sign-in: everything on the device goes up, and passes the server's validator", () => {
  const A = load();
  const ls = store({ "sw.slips.v1": JSON.stringify([slip("s1", "2026-09-28T10:00:00.000Z")]), "sw.myslip": JSON.stringify([{ id: "f2", code: "1", p: 0.6 }]),
    "sw.livefav": JSON.stringify({ m9: 1 }), "formline.favs.v1": JSON.stringify({ "Spain La Liga 1": 1 }), "sw.risk": "3", "sw.view": "list" });
  const d = A.collect(ls, NOW);
  assert.deepStrictEqual(Object.keys(d.slips.items), ["s1"]);
  assert.strictEqual(d.myslip.items.length, 1);
  assert.ok(d.livefav.items.m9); assert.ok(d.leaguefav.items["Spain La Liga 1"]);
  assert.strictEqual(d.prefs.risk.v, "3");
  assert.strictEqual(d.prefs.risk.at, 1, "on first sign-in a device's prefs yield to the account's");
  assert.strictEqual(JSON.stringify(d).includes("sw.view"), false, "display settings stay on the device");
  assert.strictEqual(Y.validate(d).ok, true);
});

test("apply then collect with no change sends the same stamps back (no churn)", () => {
  const A = load();
  const ls = store({ "sw.slips.v1": JSON.stringify([slip("s1", "2026-09-28T10:00:00.000Z")]), "sw.risk": "3" });
  const merged = Y.merge(null, Y.validate(A.collect(ls, NOW)).data, NOW);
  A.apply(ls, merged, 1);
  const again = A.collect(ls, NOW + 60e3);
  assert.deepStrictEqual(again.slips.items.s1.updatedAt, merged.slips.items.s1.updatedAt);
  assert.deepStrictEqual(again.prefs, merged.prefs);
  assert.deepStrictEqual(Y.merge(merged, Y.validate(again).data, NOW + 60e3), merged);
});

test("a deleted slip becomes a tombstone; one pushed out by the 60-slip cap does not", () => {
  const A = load();
  const list = [];
  for (let i = 0; i < A.SLIPS_KEEP; i++) list.push(slip("s" + i, new Date(NOW - i * 60e3).toISOString()));
  const ls = store({ "sw.slips.v1": JSON.stringify(list) });
  A.apply(ls, Y.merge(null, Y.validate(A.collect(ls, NOW)).data, NOW), 1);
  // The reader deletes s0 (newest); the app also saved a new slip, pushing the oldest (s59) out of 60.
  const now = JSON.parse(ls.getItem("sw.slips.v1")).filter((s) => s.sid !== "s0" && s.sid !== "s59");
  now.unshift(slip("n1", new Date(NOW + 1000).toISOString()), slip("n2", new Date(NOW + 2000).toISOString()));
  ls.setItem("sw.slips.v1", JSON.stringify(now.slice(0, A.SLIPS_KEEP)));
  const d = A.collect(ls, NOW + 5000);
  assert.ok(d.slips.tomb.s0, "deleted");
  assert.strictEqual(d.slips.tomb.s59, undefined, "trimmed, not deleted");
});

test("an unfollowed match and a changed pref carry fresh stamps", () => {
  const A = load();
  const ls = store({ "sw.livefav": JSON.stringify({ m1: 1, m2: 1 }), "sw.risk": "2" });
  A.apply(ls, Y.merge(null, Y.validate(A.collect(ls, NOW)).data, NOW), 1);
  ls.setItem("sw.livefav", JSON.stringify({ m1: 1 })); ls.setItem("sw.risk", "5");
  const d = A.collect(ls, NOW + 9000);
  assert.strictEqual(d.livefav.tomb.m2, NOW + 9000);
  assert.deepStrictEqual(d.prefs.risk, { v: "5", at: NOW + 9000 });
});

test("signing out clears the synced things and nothing else", () => {
  const A = load();
  const keep = { "sw.view": "list", "sw.age18": "1", "sw.theme": "dark" };
  const ls = store(Object.assign({ "sw.slips.v1": "[]", "sw.myslip": "[]", "sw.livefav": "{}", "formline.favs.v1": "{}",
    "sw.risk": "3", "sw.legodd": "1.4", "sw.sync.meta": "{}" }, keep));
  A.clearSynced(ls);
  assert.deepStrictEqual(Object.fromEntries(ls.m), keep);
});

test("the page wires it up: button, reload hook, slip style remembered", () => {
  assert.match(html, /<button class="tgl hsoc" id="hdAccount" type="button" aria-label="Sign in" hidden>/);
  assert.match(html, /window\.swReloadSynced=function\(\)/);
  assert.match(html, /localStorage\.getItem\("sw\.legodd"\)/);
  assert.strictEqual((html.match(/localStorage\.setItem\("sw\.legodd"/g) || []).length, 2);
});

test("the sync client guards against lost in-flight edits, stale tabs and a defeated backoff", () => {
  // The browser half of the block (sync/watch/boot) never runs in Node - no
  // DOM, no XMLHttpRequest - so this only checks the source for the fixes;
  // the logic itself is hand-traced in code review, not executed here.
  assert.match(block[1], /j\.signedIn===true/, "boot only treats a 200 as signed in when the server says so");
  assert.match(block[1], /st\.nextAt/, "watch() must respect a pending backoff instead of restarting it every 5s");
  assert.match(block[1], /rawNow\(\)!==sent/, "sync() must not apply a stale server answer over an in-flight local edit");
});

test("sign-out with no connection says still signed in, rather than claiming success", () => {
  const m = /\$\("acctOut"\)\.onclick=function\(\)\{([\s\S]*?)\};/.exec(block[1]);
  assert.ok(m, "the acctOut click handler");
  assert.match(m[1], /code===200\|\|code===401/, "only a real 200/401 answer may say signed out; anything else (0, 5xx) must not");
});

test("boot() never calls /api/me when the page carries no sw-auth meta (AUTH_ENABLED off)", () => {
  const m = /function boot\(\)\{([\s\S]*?)\n\s*var b=\$\("hdAccount"\)/.exec(block[1]);
  assert.ok(m, "boot() function body up to its first statement");
  assert.match(m[1], /if\(!d\.querySelector\('meta\[name="sw-auth"\]'\)\)\s*return;/,
    "boot() must bail before touching the DOM or the network when the meta guard is absent");
});

test("the storage listener never schedules a sync itself, so two tabs cannot ping-pong forever", () => {
  const m = /addEventListener\("storage",function\(e\)\{([\s\S]*?)\n\s*\}\);/.exec(block[1]);
  assert.ok(m, "the storage listener");
  const body = m[1];
  assert.match(body, /st\.raw=rawNow\(\)/, "a META write from another tab updates st.raw so this tab does not think it has something new");
  assert.doesNotMatch(body, /schedule\(/, "the listener must never schedule a sync itself - watch() alone decides, or two tabs re-sync each other forever");
});
