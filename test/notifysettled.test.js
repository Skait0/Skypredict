"use strict";
/* Owner, 16 Oct 2026: "it gives a barrage of n of n landed, your slip is settled ...
   the one that should come by default is a landed slip". index.html notifySettled. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function run(list) {
  const shown = []; let saves = 0;
  function Notification(title, opts) { shown.push({ title, opts }); }
  Notification.permission = "granted";
  const window = { Notification }, navigator = {};
  new Function("window", "navigator", "Notification", "saveSlips", grab("notifySettled") + "; notifySettled(arguments[4]);")(
    window, navigator, Notification, () => { saves++; }, list);
  return { shown, saves };
}
const slip = (sid, won, n, odds) => ({ sid, code: "C" + sid, won, legs: Array(n).fill({}), hits: won ? n : n - 1, odds });

test("a lost or part-landed slip settles quietly", () => {
  const r = run([slip(1, false, 5, 12), slip(2, false, 3, 4)]);
  assert.equal(r.shown.length, 0);
  assert.equal(r.saves, 1, "still marked as told, so it is never announced later");
});

test("one landed slip is one notification, tagged by its code like the server push", () => {
  const r = run([slip(1, true, 4, 7.5), slip(2, false, 6, 30)]);
  assert.equal(r.shown.length, 1);
  assert.match(r.shown[0].title, /^Your slip landed!/);
  assert.equal(r.shown[0].opts.tag, "slip-C1");
  assert.match(r.shown[0].opts.body, /All 4 landed\. That paid ×7\.50\./);
});

test("several wins at once are one notification, not a barrage", () => {
  const r = run([slip(1, true, 3, 2), slip(2, true, 5, 9), slip(3, true, 2, 1.5)]);
  assert.equal(r.shown.length, 1);
  assert.match(r.shown[0].title, /^3 of your slips landed!/);
});

test("nothing is announced twice", () => {
  const s = slip(1, true, 3, 2);
  run([s]);
  assert.equal(run([s]).shown.length, 0);
});
