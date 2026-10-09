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

test("builder filters start open on every screen (owner, 9 Oct 2026: shut by default confused people)", () => {
  assert.deepStrictEqual(runFilters(true), { open: true, expanded: "true" });
  assert.deepStrictEqual(runFilters(false), { open: true, expanded: "true" });
});

test("shut, the filters bar says so with a filled Show filters pill; Top flight only is the default", () => {
  assert.match(FILTERS, /hint\.textContent=open\?"Hide":"Show filters"/);
  assert.match(src, /\.filters-toggle\[aria-expanded="false"\] \.ft-hint\{background:var\(--accent\)/);
  assert.match(src, /var TOP_ONLY=true; try\{var _to=localStorage\.getItem\("sw\.toponly"\); if\(_to!==null\) TOP_ONLY=_to==="1";\}/);
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

/* ---- the shut filters bar names every filter that is not the default ---- */
const SUM_SRC = ["updateFiltersSum", "scopeLabel", "leagueCount", "leagueAllowed", "leagueDefault",
  "leaguePicksTouched", "marketCount", "spanName"].map(grab).join("\n");
const TOD_LABEL = { early: "Early", mid: "Mid day", late: "Late" };

function filtersSum(state) {
  const el = { textContent: "" };
  const LEAGUES = (state && state.LEAGUES) || ["Premier League", "La Liga", "Serie A", "National League"];
  const ctx = Object.assign({
    document: {
      getElementById: (id) => (id === "filtersSum" ? el : null),
      querySelector: (s) => { const m = /data-tod='(\w+)'/.exec(s); return m ? { textContent: TOD_LABEL[m[1]] } : null; },
    },
    SCOPE: "day", SDAY: 0, TOD: "all", SPAN: 3, TOP_ONLY: false, VOL_IN: false, BLD_PICK: {},
    BUILD: { mk: { wd: true, o15: true, o25: true, tts: true } },
    dayName: (o) => (o === 1 ? "Tomorrow" : "Saturday"),
    isVolatile: (l) => l === "National League",
    leaguesOnBoard: () => LEAGUES.map((league) => ({ league, n: 3 })),
  }, state);
  vm.runInNewContext(SUM_SRC + "\nupdateFiltersSum();", ctx);
  return el.textContent;
}

/* A board with no volatile league on it: the untouched default is every league. */
const TOP3 = ["Premier League", "La Liga", "Serie A"];

test("filters summary: the untouched default", () => {
  assert.strictEqual(filtersSum({ LEAGUES: TOP3 }), "All leagues · 4 markets");
});

test("filters summary: benched volatile leagues are counted out, as the picker counts them", () => {
  /* National League sits on the bench by default; the line must not claim
     "All leagues" while the picker button says 3 of 4. */
  assert.strictEqual(filtersSum({}), "3 of 4 leagues · 4 markets");
  assert.strictEqual(filtersSum({ SCOPE: "wknd" }), "Weekend · 3 of 4 leagues · 4 markets");
});

test("filters summary: leagues taken out, or the volatile ones let in", () => {
  assert.strictEqual(filtersSum({ BLD_PICK: { "La Liga": 0 } }), "2 of 4 leagues · 4 markets");
  assert.strictEqual(filtersSum({ VOL_IN: true }), "4 of 4 leagues · 4 markets");
});

test("filters summary: the weekend, a single day with a time, all upcoming", () => {
  const L = { LEAGUES: TOP3 };
  assert.strictEqual(filtersSum({ ...L, SCOPE: "wknd" }), "Weekend · All leagues · 4 markets");
  assert.strictEqual(filtersSum({ ...L, SDAY: 5, TOD: "late" }), "Saturday · Late · All leagues · 4 markets");
  assert.strictEqual(filtersSum({ ...L, TOD: "early" }), "Today only · Early · All leagues · 4 markets");
  assert.strictEqual(filtersSum({ ...L, SCOPE: "span" }), "Next 3 days · All leagues · 4 markets");
  assert.strictEqual(filtersSum({ ...L, SCOPE: "all" }), "All upcoming · All leagues · 4 markets");
});

test("filters summary: top flight, alone and with leagues narrowed", () => {
  /* Top flight drops lower leagues from the board itself, volatile ones included. */
  assert.strictEqual(filtersSum({ LEAGUES: TOP3, TOP_ONLY: true }), "Top flight · 4 markets");
  assert.strictEqual(filtersSum({ TOP_ONLY: true, BLD_PICK: { "Serie A": 0 }, BUILD: { mk: { wd: true } } }),
    "Top flight · 2 of 4 leagues · 1 market");
});

/* ---- the sheet for every bookmaker ---- */
const BOOKS5 = [
  { key: "sporty", skin: "sb", mark: "<span class='sbm'>SportyBet</span>", open: "https://www.sportybet.com/?shareCode=" },
  { key: "bet9ja", skin: "b9", mark: "<span class='b9m'><span class='b9r'>bet</span><span class='b9g'>9ja</span></span>", open: "https://sports.bet9ja.com/?bookABetCode=" },
  { key: "betking", skin: "bk", mark: "<span class='bkm'><span class='bkk'>Bet</span><span class='bkg'>King</span></span>", open: null },
  { key: "betpawa", skin: "bw", mark: "<span class='bwm'><span class='bwb'>bet</span><span class='bwp'>Pawa</span></span>", open: "https://www.betpawa.ng/?code=" },
  { key: "onexbet", skin: "xb", mark: "<span class='xbm'>1X<span class='xbb'>BET</span></span>", open: "https://1xbet.ng/?code=" },
];

test("every bookmaker's sheet: its skin, Copy alone as the primary, then Open in or the paste sentence", () => {
  for (const B of BOOKS5) {
    const h = sheetHTML(B, true);
    assert.match(h, new RegExp("code-card--modal code-card--" + B.skin + "'"), B.key + " skin");
    const acts = /<div class='code-acts'>([\s\S]*?)<\/div>/.exec(h)[1];
    assert.strictEqual((acts.match(/<button/g) || []).length, 1, B.key + ": one primary");
    if (B.open) assert.ok(h.includes("<a class='code-open' href='" + B.open + "SB7XK2Q9'") && h.includes(">Open in " + B.mark + "</a>"), B.key + " opens");
    else assert.match(h, /<span class='code-paste'>Paste this code/, B.key + " has no deep link, so it says where to paste");
    assert.ok(h.indexOf("code-follow") > h.indexOf("code-next"), B.key + ": follow line last");
  }
});

test("on the outlined Open in, 1xBet and betPawa marks take their card colours, not the white button's ink", () => {
  assert.match(src, /\.code-card\.code-card--modal\.code-card--xb \.code-opens \.code-open \.xbm\{color:#fff\}/);
  assert.match(src, /\.code-card\.code-card--modal\.code-card--xb \.code-opens \.code-open \.xbm \.xbb\{color:#14A0FF\}/);
  assert.match(src, /\.code-card\.code-card--modal\.code-card--bw \.code-opens \.code-open \.bwm \.bwp\{color:#9CE800\}/);
});
