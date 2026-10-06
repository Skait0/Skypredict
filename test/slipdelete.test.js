"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function load() {
  const m = /\/\* SWPEND \*\/([\s\S]*?)\/\* \/SWPEND \*\//.exec(html);
  assert.ok(m, "SWPEND block present");
  const calls = [], timers = [];
  const env = {
    removeSlip: (sid, q) => calls.push("rm " + sid + " " + q),
    clearSlips: () => calls.push("clear"),
    refreshSlipUI: () => calls.push("ui"),
    setTimeout: (f, ms) => { timers.push(f); return timers.length; },
    clearTimeout: () => {},
    showUndo: (msg) => calls.push("toast " + msg),
    hideUndo: () => calls.push("hide"),
  };
  const win = {};
  new Function("window", "removeSlip", "clearSlips", "refreshSlipUI", "setTimeout", "clearTimeout", "showUndo", "hideUndo", m[1])(
    win, env.removeSlip, env.clearSlips, env.refreshSlipUI, env.setTimeout, env.clearTimeout, env.showUndo, env.hideUndo);
  return { P: win.swPend, calls, fire: () => timers.splice(0).forEach((f) => f()) };
}

test("a delete only hides until the window ends; storage is untouched", () => {
  const { P, calls } = load();
  P.del("s1");
  assert.ok(P.hidden("s1"));
  assert.ok(!calls.some((c) => c.startsWith("rm")), "no removeSlip yet: a tombstone would beat Undo");
  assert.ok(calls.includes("toast Slip deleted"));
});

test("Undo restores and never touches storage", () => {
  const { P, calls, fire } = load();
  P.del("s1"); P.undo(); fire();
  assert.ok(!P.hidden("s1"));
  assert.ok(!calls.some((c) => c.startsWith("rm")));
});

test("when the window ends the delete is committed once", () => {
  const { P, calls, fire } = load();
  P.del("s1"); fire(); fire();
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm s1 true"]);
  assert.ok(!P.active());
});

test("a second delete commits the first at once", () => {
  const { P, calls } = load();
  P.del("s1"); P.del("s2");
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm s1 true"]);
  assert.ok(P.hidden("s2"));
});

test("leaving the page commits what is pending", () => {
  const { P, calls } = load();
  P.del("s1"); P.commit();
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm s1 true"]);
});

test("clear all hides only the slips present, then removes only those", () => {
  const { P, calls, fire } = load();
  P.clearAll(["a", "b"]);
  assert.ok(P.hidden("a") && P.hidden("b"));
  assert.ok(!P.hidden("late"), "a slip that arrives in the window stays visible");
  assert.ok(calls.includes("toast All slips cleared"));
  assert.ok(!calls.some((c) => c.startsWith("rm")));
  fire();
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm a true", "rm b true"]);
  assert.ok(!calls.includes("clear"));
});

test("the page commits on hide and the swipe ignores vertical drags", () => {
  assert.match(html, /visibilitychange[\s\S]{0,200}swPend\.commit\(\)/);
  const sw = /function swSwipe\(row,onDelete\)\{([\s\S]*?)\n\}/.exec(html);
  assert.ok(sw, "swSwipe present");
  assert.match(sw[1], /lock=Math\.abs\(mx\)>Math\.abs\(my\)\?"x":"y"/);
  assert.match(sw[1], /if\(lock!=="x"\) return;/);
});
