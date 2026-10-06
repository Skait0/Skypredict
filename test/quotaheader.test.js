"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const proxy = fs.readFileSync(path.join(__dirname, "..", "lib", "bookproxy.js"), "utf8");

test("the proxy tells the page its limit as well as what is left", () => {
  assert.match(proxy, /X-Sw-Quota-Limit/);
});

function load(store, nowMs) {
  const m = /\/\* SWQUOTA \*\/([\s\S]*?)\/\* \/SWQUOTA \*\//.exec(html);
  assert.ok(m, "SWQUOTA block present");
  const win = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  new Function("window", "localStorage", "Date", m[1])(win, ls, { now: () => nowMs });
  return win;
}
const hdr = (o) => ({ get: (k) => (o[k.toLowerCase()] == null ? null : o[k.toLowerCase()]) });
const NOON = Date.UTC(2026, 9, 6, 11);

test("a counted booking is remembered for today, in Lagos days", () => {
  const s = {}; const w = load(s, NOON);
  w.swNoteQuota(hdr({ "x-sw-quota-remaining": "7", "x-sw-quota-limit": "10" }));
  assert.deepStrictEqual(w.swQuotaToday(), { used: 3, limit: 10 });
});

test("unknown means null, never a guess", () => {
  const s = {}; const w = load(s, NOON);
  assert.strictEqual(w.swQuotaToday(), null);
  w.swNoteQuota(hdr({}));                                         // limit off or counter down
  assert.strictEqual(w.swQuotaToday(), null);
  w.swNoteQuota(hdr({ "x-sw-quota-remaining": "x", "x-sw-quota-limit": "10" }));
  assert.strictEqual(w.swQuotaToday(), null);
});

test("yesterday's count is not today's", () => {
  const s = { "sw.quota": JSON.stringify({ day: "2026-10-05", left: 2, limit: 10 }) };
  assert.strictEqual(load(s, NOON).swQuotaToday(), null);
});

test("23:30 UTC is already tomorrow in Lagos", () => {
  const s = { "sw.quota": JSON.stringify({ day: "2026-10-06", left: 2, limit: 10 }) };
  assert.strictEqual(load(s, Date.UTC(2026, 9, 6, 23, 30)).swQuotaToday(), null);
});
