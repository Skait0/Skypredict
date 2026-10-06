"use strict";
/* My slips sheet and the phone's Back button: executes the real functions. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(start, endMarker) {
  const i = html.indexOf(start); assert.ok(i >= 0, start);
  return html.slice(i, html.indexOf(endMarker, i));
}
function world() {
  const on = { scrim: 0, slipsSheet: 0, mySheet: 0, sheet: 0 };
  const el = k => ({ classList: { add() { on[k] = 1; }, remove() { on[k] = 0; }, contains() { return !!on[k]; } } });
  const els = {}; Object.keys(on).forEach(k => els[k] = el(k));
  const hist = { stack: 1, pending: 0, pushes: 0 };
  const listeners = [];
  const win = { addEventListener: (_, fn) => listeners.push(fn), swAccountUI: { eaten: false, eatPop() { return this.eaten; } } };
  const history = {
    pushState() { hist.stack++; hist.pushes++; },
    back() { hist.pending++; hist.stack--; setImmediate(() => { hist.pending--; listeners[0](); }); }
  };
  const doc = { documentElement: { classList: { contains() { return false; } } } };
  assert.match(grab("function openSlipsSheet", "function closeSlipsSheet"), /if\(!SLIPS_PUSHED\)\{ SLIPS_PUSHED=true; pushOverlay\(\); \}/);
  const src = grab("var SLIPS_PUSHED", "/* A booked slip is a record")
    + grab("function anyOverlayOpen", "function pushOverlay")
    + 'function openSlipsSheet(){$("scrim").classList.add("on");$("slipsSheet").classList.add("on");lockBody(true);'
    + "if(!SLIPS_PUSHED){ SLIPS_PUSHED=true; history.pushState({sw:1},''); }}"
    + "return {open:openSlipsSheet,close:closeSlipsSheet};";
  const api = new Function("$", "lockBody", "history", "window", "swAccountUI", "closeSheet", "closeMySheet", "document", "setView", src)(
    k => els[k], () => {}, history, win, win.swAccountUI, () => {}, () => {}, doc, () => {});
  api.pop = () => listeners[0]();
  return { api, on, hist, win };
}

test("system Back closes My slips and stays on the page", () => {
  const w = world(); w.api.open();
  assert.strictEqual(w.on.slipsSheet, 1);
  w.hist.stack--; w.api.pop();            // browser pops, then fires popstate
  assert.strictEqual(w.on.slipsSheet, 0);
  assert.strictEqual(w.hist.pending, 0, "no extra history.back on a popstate close");
});

test("own close pops its entry and the resulting popstate is ignored", async () => {
  const w = world(); w.api.open();
  assert.strictEqual(w.hist.stack, 2);
  w.api.close();
  await new Promise(r => setImmediate(() => setImmediate(r)));
  assert.strictEqual(w.hist.stack, 1, "no stale entry");
  assert.strictEqual(w.on.slipsSheet, 0);
});

test("reopening does not stack entries; account view takes precedence on Back", () => {
  const w = world(); w.api.open(); w.api.open();
  assert.strictEqual(w.hist.pushes, 1);
  w.win.swAccountUI.eaten = true;
  w.hist.stack--; w.api.pop();
  assert.strictEqual(w.on.slipsSheet, 1, "eatPop consumed the Back; sheet untouched");
});

test("source: anyOverlayOpen includes slipsSheet", () => {
  assert.match(grab("function anyOverlayOpen", "window.addEventListener"), /slipsSheet/);
});
