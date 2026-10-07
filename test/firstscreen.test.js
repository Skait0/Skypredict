"use strict";

/**
 * The first screen and the booked-code sheet (Task 5, 7 Oct 2026).
 *
 * Critique 6 Oct 2026: on a 360px phone the first game sat at 1,143px behind
 * the install bar, the live row and a 224px offer card; slip of the day and
 * the record ran full width under every game while the desktop rail stood
 * empty; the builder's filters stood open between a phone and the dial; and
 * the booked-code sheet gave ten actions equal voice, with the white
 * "Open in" louder than the code.
 *
 * The filters default and the sheet are driven through their real code (the
 * filters block run against a stub page, showCode with its helpers stubbed);
 * the layout facts are read from the markup the rail is built from.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* ---- builder filters: shut on a phone, open on a wide screen, stored choice wins ---- */
const FILTERS = (() => {
  const a = src.indexOf("// Filters collapse");
  const b = src.indexOf("})();", a);
  assert.ok(a > 0 && b > a, "the filters-collapse block must still be findable");
  return src.slice(a, b + 5);
})();

function runFilters(phone, stored) {
  const body = { hidden: false }, toggle = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} };
  const ctx = {
    document: { getElementById: (id) => (id === "filtersToggle" ? toggle : id === "filtersBody" ? body : null) },
    window: { matchMedia: (q) => ({ matches: phone && /max-width:560px/.test(q) }) },
    localStorage: { getItem: () => (stored === undefined ? null : stored), setItem() {} },
  };
  vm.runInNewContext(FILTERS, ctx);
  return { open: !body.hidden, expanded: toggle.attrs["aria-expanded"] };
}

test("builder filters start shut on a phone and open on a wide screen", () => {
  assert.deepStrictEqual(runFilters(true), { open: false, expanded: "false" });
  assert.deepStrictEqual(runFilters(false), { open: true, expanded: "true" });
});

test("a stored filters choice wins on both sizes", () => {
  assert.strictEqual(runFilters(true, "1").open, true);
  assert.strictEqual(runFilters(false, "0").open, false);
});

/* ---- the booked-code sheet ---- */
function sheetHTML(book, save) {
  let html = "";
  const stub = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const ctx = {
    $: () => null,
    document: {
      getElementById: () => null,
      createElement: () => ({ set innerHTML(v) { html = v; }, get innerHTML() { return html; },
        addEventListener() {}, querySelector() { return stub; }, remove() {} }),
      body: { appendChild() {} },
    },
    curBook: () => book, footballLink: () => ({ href: "https://www.football.com/", blank: true }),
    codeTotHTML: () => "", quotaNoteHTML: () => "", splitBoxHTML: () => "", esc: (s) => String(s),
    scrollLock() {}, rememberShortLink() {}, wireSplit() {}, saferHere() {},
    reconcileCode: () => new Promise(() => {}), SW_QUOTA_LEFT: null,
  };
  vm.runInNewContext(grab("showCode") + "\nshowCode('SB7XK2Q9','bookResult'," + (save ? "function(){}" : "null") + ",curBook(),[],null);", ctx);
  return html;
}
const SPORTY = { key: "sporty", skin: "sb", mark: "<span class='sbm'>SportyBet</span>", open: "https://www.sportybet.com/?shareCode=" };

test("the sheet has one primary action: Copy alone in its row, Open in under it", () => {
  const h = sheetHTML(SPORTY, true);
  const acts = /<div class='code-acts'>([\s\S]*?)<\/div>/.exec(h);
  assert.ok(acts, "the primary row is gone");
  assert.strictEqual((acts[1].match(/<button/g) || []).length, 1, "only Copy belongs in the primary row");
  assert.match(acts[1], /class='code-copy'/);
  assert.ok(h.indexOf("code-opens") > h.indexOf("code-acts"), "Open in comes after Copy");
  assert.ok(h.indexOf("code-opens") < h.indexOf("code-next"), "and before the quiet next steps");
});

test("Save and Share stay reachable as the quiet pair; Share without Save too", () => {
  const withSave = sheetHTML(SPORTY, true), noSave = sheetHTML(SPORTY, false);
  assert.match(withSave, /<div class='code-next'><button class='code-save'[^>]*>Save to Your slips<\/button><button class='share-btn'[^>]*data-sh='1'/);
  assert.match(noSave, /<div class='code-next'><button class='share-btn'/);
});

test("Telegram and X are the sheet's last line, not part of the peak", () => {
  const h = sheetHTML(SPORTY, true);
  const f = h.indexOf("<div class='code-follow'>");
  assert.ok(f > 0, "the follow line is gone");
  for (const cls of ["code-safer", "code-also", "code-opens", "code-acts"]) {
    assert.ok(h.indexOf(cls) < f, cls + " should come before the follow line");
  }
  assert.ok(h.indexOf("t.me/Soccerwizardhqbot") > f && h.indexOf("x.com/soccerwizardhq") > f);
});

test("the code is gold and the largest type on the sheet", () => {
  assert.match(src, /\.code-card\.code-card--modal>b\{font-size:34px;color:var\(--accent-on-dark\)/);
  assert.match(src, /--accent-on-dark:#F2B84B;/);
});

/* ---- where the rail's cards live ---- */
test("slip of the day and the record ride in the desktop rail", () => {
  const a = src.indexOf('<aside class="home-rail">'), b = src.indexOf("</aside>", a);
  const rail = src.slice(a, b);
  for (const id of ["sotd", "record", "instBar"]) {
    assert.ok(rail.includes('id="' + id + '"'), id + " must be inside the rail");
  }
  assert.strictEqual((src.match(/<div id="sotd">/g) || []).length, 1, "one slip of the day, not a copy");
});

test("on a phone they follow the capped first screen of games, ahead of the pick", () => {
  const order = (id) => +new RegExp("\\.home-grid>\\.home-rail>#" + id + "\\{order:(\\d+)").exec(src)[1];
  const main = +/\.home-grid>\.home-main\{order:(\d+)\}/.exec(src)[1];
  assert.ok(order("sotd") > main && order("record") > order("sotd") && order("potd") > order("record"));
  assert.ok(order("instBar") > order("daily"), "the install offer waits under the day's cards");
});

test("the fixed Build me a slip button only exists where the rail column can hold it", () => {
  assert.match(src, /@media\(min-width:1060px\)\{ \.ctafab\{display:inline-flex\} \}/);
  assert.ok(!/@media\(min-width:721px\)\{ \.ctafab\{display:inline-flex\} \}/.test(src));
});
