"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "..", "public", "account-ui.js"), "utf8");

function fn(name) {
  const i = html.indexOf("function " + name + "(");
  assert.ok(i >= 0, name);
  let d = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") d++;
    else if (html[k] === "}" && --d === 0) return html.slice(i, k + 1);
  }
}

test("1 avatar is the last header item, after X and Telegram", () => {
  const hd = html.indexOf('id="hdAccount"');
  assert.ok(hd > html.indexOf("hsoc-tg"), "hdAccount after the Telegram link");
  assert.ok(hd > html.indexOf("hsoc-x"));
  assert.match(html, /@media\(max-width:420px\)\{#hdAccount\.ac-on\{width:34px/);
});

test("3 menu and resume open My slips on All", () => {
  assert.match(ui, /openSlipsSheet\("all"\)/);
  assert.match(html, /slips:function\(\)\{openSlipsSheet\("all"\);\}/);
});

test("4 system Back closes the account views via history", () => {
  assert.match(ui, /pushState/);
  assert.match(ui, /history\.back\(\)/);
  assert.match(html, /popstate",function\(\)\{\s*if\(window\.swAccountUI&&swAccountUI\.eatPop\(\)\) return;/);
  // behaviour: fake window/document
  const calls = [];
  const cls = {}; const stub = () => new Proxy(function () {}, { get: (_, k) => (k === "classList" ? { add() {}, remove() {}, contains: () => false } : stub()), set: () => true, apply: () => stub() });
  const mk = () => ({ classList: { add: (c) => { cls[c] = 1; }, remove: (c) => { delete cls[c]; }, contains: (c) => !!cls[c] }, setAttribute() {}, querySelector: () => stub(), querySelectorAll: () => [], addEventListener() {}, appendChild() {} });
  const doc = { createElement: mk, head: mk(), body: mk(), documentElement: mk(), getElementById: () => null, addEventListener() {}, activeElement: null, querySelector: () => null };
  const win = { document: doc, history: { pushState: () => calls.push("push"), back: () => calls.push("back") }, swAcct: { st: { email: "" }, req() {} }, localStorage: { getItem: () => null, setItem() {} } };
  new Function("window", "module", ui.replace(/\}\)\(typeof window!=="undefined"\?window:this\);\s*$/, "})(window);"))(win, undefined);
  const U = win.swAccountUI;
  U.settings(); assert.deepStrictEqual(calls.filter((c) => c === "push"), ["push"]);
  assert.strictEqual(U.eatPop(), true, "system Back is consumed by the open view");
  assert.ok(!calls.includes("back"), "system Back must not push another history step");
  assert.strictEqual(U.eatPop(), false);
  calls.length = 0; U.settings(); U.closeView();
  assert.deepStrictEqual(calls, ["push", "back"], "button close pops its own entry");
  assert.strictEqual(U.eatPop(), true, "that pop is swallowed");
  assert.strictEqual(U.eatPop(), false);
});

test("5 menu slip count is the visible count", () => {
  assert.match(html, /window\.swSlipCount=function\(\)\{return slipCounts\(\)\.all;\};/);
});

test("6 Clear all clears and counts only the supplied slips", () => {
  const cleared = [];
  const slot = { innerHTML: "", firstChild: {}, querySelector: (q) => (q === ".ys-yes" ? { focus() {}, set onclick(f) { slot.yes = f; } } : { set onclick(f) {} }) };
  const win = { swPend: { hidden: () => false, clearAll: (a) => cleared.push(a) } };
  const mk = new Function("window", "SLIPS", fn("visibleSids") + fn("clearAllControl") + "return clearAllControl;");
  const ctl = mk(win, [{ sid: "a" }, { sid: "b" }, { sid: "c" }]);
  ctl(slot, () => ["b"]);
  slot.firstChild.onclick();
  assert.match(slot.innerHTML, /Clear 1\?/);
  slot.yes();
  assert.deepStrictEqual(cleared, [["b"]]);
  ctl(slot); slot.firstChild.onclick();
  assert.match(slot.innerHTML, /Clear 3\?/, "Home keeps everything visible");
  assert.match(html, /clearAllControl\(body\.querySelector\("\.ys-clr"\),function\(\)\{ return shown\.map/);
});

test("12 slip menu dispatches on data-act, not label text", () => {
  assert.match(html, /data-act='"\+\(l==="Delete"\?"del":"win"\)/);
  assert.match(html, /getAttribute\("data-act"\)==="del"/);
  assert.doesNotMatch(html, /\/Delete\/\.test\(b\.textContent\)/);
});

test("14 brand is one word in user-visible strings", () => {
  assert.doesNotMatch(html, /title:"SoccerWizard|Notification\("SoccerWizard/);
});
