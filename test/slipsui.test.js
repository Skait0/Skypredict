"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = html.indexOf("function " + name + "(");
  assert.ok(i >= 0, name);
  let depth = 0;
  for (let k = html.indexOf("{", i); k < html.length; k++) {
    if (html[k] === "{") depth++; else if (html[k] === "}" && --depth === 0) return html.slice(i, k + 1);
  }
}

test("states: running, lost, won", () => {
  const f = new Function(grab("slipState") + "; return slipState;")();
  assert.strictEqual(f({ settled: false }), "run");
  assert.strictEqual(f({ settled: true, won: false }), "lost");
  assert.strictEqual(f({ settled: true, won: true }), "won");
});

test("counts skip a slip that is waiting on Undo", () => {
  const f = new Function("SLIPS", "window", grab("slipState") + grab("slipCounts") + "; return slipCounts;");
  const S = [{ sid: "a", settled: false }, { sid: "b", settled: true, won: true }, { sid: "c", settled: true, won: false }];
  const w = { swPend: { hidden: (sid) => sid === "a" } };
  assert.deepStrictEqual(f(S, w)(), { all: 2, run: 0, lost: 1, won: 1 });
});

test("copy: Lost not Cut, no em dashes in the new slips UI", () => {
  const r = grab("renderMyResults") + grab("renderSlipsSheet");
  assert.doesNotMatch(r, /\bCut\b|—/);
  assert.match(r, /Lost/);
  assert.doesNotMatch(r, /-game slip · ×/, "the old one-slip summary is gone");
});

test("Recent row copy: no possessive, no ', last', singular game", () => {
  const src = grab("slipState") + grab("slipCounts") + grab("bookMark") + grab("renderMyResults");
  function row(s, when) {
    let out = "";
    const host = { set innerHTML(v) { out = v; }, querySelectorAll() { return []; }, querySelector() { return null; } };
    const f = new Function("SLIPS", "window", "BOOKS", "esc", "$", "slipWhen", "swSwipe", "clearAllControl", "BIN_SVG", "SL_PEEKED", "openSlipsSheet", "slipWhenPlain",
      src + "; return renderMyResults;");
    const mockSlipWhenPlain = (iso) => when === "last" ? "" : when.replace(/'s$/, "");
    f([s], { swPend: { hidden: () => false } }, { sporty: { label: "SportyBet" } }, (x) => x, () => host, () => when, null, () => {}, "", true, null, mockSlipWhenPlain)();
    return out;
  }
  const base = { sid: "a", settled: false, code: "X1", book: "sporty", odds: 2, at: "x" };
  assert.match(row({ ...base, legs: [1, 2, 3] }, "today's"), /SportyBet, 3 games, today<\/small>/);
  assert.match(row({ ...base, legs: [1] }, "Saturday's"), /1 game, Saturday<\/small>/);
  assert.match(row({ ...base, legs: [1] }, "last"), /SportyBet, 1 game<\/small>/);
});

test("sheet meta copy: no possessive, no ', last'", () => {
  const src = grab("dayOff") + grab("dayName") + grab("slipWhen") + grab("slipWhenPlain");
  const f = new Function(src + "; return slipWhenPlain;")();
  const badIso = "baddate";
  assert.strictEqual(f(badIso), "", "slipWhenPlain returns empty for invalid dates (slipWhen returns last)");
});

test("the sheet: filters with counts, top actions, gold code, progress, no avatar", () => {
  const r = grab("renderSlipsSheet") + grab("progressWords");
  for (const w of ["All", "Running", "Lost", "Won", "Share", "Rebuild", "Copy", "Show ", "landed", "to play"]) assert.match(r, new RegExp(w), w);
  assert.match(r, /data-slsafe/, "Make it safer stays, only when running");
  assert.match(r, /swSwipe\(/); assert.match(r, /clearAllControl\(/);
  const sheet = /<div class="sheet slips-sheet" id="slipsSheet"[\s\S]*?id="slipsBody"/.exec(html)[0];
  assert.doesNotMatch(sheet, /\/av\//);
  assert.doesNotMatch(r, /Clear slip history|askRemoveSlip/);
});

test("progress words", () => {
  const f = new Function(grab("progressWords") + "; return progressWords;")();
  assert.strictEqual(f([{ res: "win" }, { res: "win" }, {}, {}]), "<b>2</b> landed, 2 to play");
  assert.strictEqual(f([{ res: "win" }, { res: "lose" }]), "<b>1</b> landed, <b>1</b> lost");
  assert.strictEqual(f([{}, {}]), "<b>0</b> landed, 2 to play");
});

const SHEET_FNS = ["slipWhen", "slipWhenPlain", "slipState", "slipCounts", "progressWords", "renderSlipsSheet", "wireSlipButtons", "slipToggle"];
const NAMES = ["SLIPS", "window", "document", "BOOKS", "esc", "$", "slipWhen", "swSwipe", "clearAllControl", "BIN_SVG", "SHARE_SVG", "SAFE_SVG", "RB_SVG", "COPY_SVG", "CHEV_SVG", "bookMark", "isJackpotSlip", "shareWin", "SLOPEN"];
const SHEET_SRC = SHEET_FNS.map(grab).join("\n") + "; return {renderSlipsSheet, wireSlipButtons, slipToggle, slopen: function () { return SLOPEN; }};";
function mkSheet(vals) {
  return new Function(...NAMES, SHEET_SRC)(...NAMES.map((n) => vals[n]));
}
const baseVals = (o) => Object.assign({ SLIPS: [], window: { swPend: { hidden: () => false } }, document: {}, BOOKS: { sporty: { label: "S" } }, esc: (x) => x, $: () => null, slipWhen: () => "today's", swSwipe() {}, clearAllControl() {}, BIN_SVG: "", SHARE_SVG: "", SAFE_SVG: "", RB_SVG: "", COPY_SVG: "", CHEV_SVG: "", bookMark: () => "", isJackpotSlip: () => false, shareWin() {}, SLOPEN: null }, o);

function drawSheet(slip) {
  let out = "";
  const body = { set innerHTML(v) { out = v; }, querySelectorAll() { return []; }, querySelector() { return null; } };
  mkSheet(baseVals({ SLIPS: [slip], $: () => body })).renderSlipsSheet();
  return out;
}

test("the sheet draws; no more menu; delete is a round icon button; Share win for a won slip", () => {
  const won = drawSheet({ sid: "a", settled: true, won: true, code: "X1", book: "sporty", odds: 2, at: "x", legs: [{ res: "win" }, {}] });
  assert.match(won, /data-slcp/);
  assert.match(won, /class='sl2-a del'[^>]*data-sldel='a'[^>]*aria-label='Delete slip'/);
  assert.match(won, /Share win/);
  assert.doesNotMatch(won, /data-slmore|sl2-pop|sl2-mib/);
  const run = drawSheet({ sid: "b", settled: false, code: "X1", book: "sporty", odds: 2, at: "x", legs: [{}] });
  assert.doesNotMatch(run, /Share win/);
  assert.match(run, /sl2-a safer/);
  for (const n of ["slipMoreMenu", "slipMenuItems", "SL_POP_CLOSE", "sl2-pop", "sl2-mi"]) assert.ok(!new RegExp(n + "\b").test(html), n + " removed");
});

test("Safer is the neutral pill, the sheet code is not gold, games show instantly", () => {
  assert.doesNotMatch(html, /\.sl2-a\.safer\{[^}]*--accent/);
  assert.match(html, /\.sl2-a\.safer svg\{color:var\(--green-ink\)\}/);
  assert.match(html, /\.sl2-code \.num\{[^}]*color:var\(--text\)/);
  assert.match(html, /\.sl2-od\{[^}]*color:var\(--accent\)/, "odds stay gold");
  assert.match(html, /\.sl2-legs\{display:none\}\.sl2\.open \.sl2-legs\{display:block\}/);
  assert.match(html, /\.sl2-a\{[^}]*gap:5px;height:32px;padding:0 9px/);
});

test("Delete icon calls swPend.del; Share on a won slip calls shareWin", () => {
  const handlers = {};
  const body = {
    set innerHTML(v) {}, querySelector() { return null; },
    querySelectorAll(sel) {
      const m = /^\[data-(sldel|slsh)\]$/.exec(sel);
      return m ? [{ dataset: { [m[1]]: "a" }, set onclick(f) { handlers[m[1]] = f; } }] : [];
    },
  };
  const calls = [];
  const slip = { sid: "a", settled: true, won: true, code: "X1", book: "sporty", odds: 2, at: "x", legs: [{}] };
  mkSheet(baseVals({ SLIPS: [slip], $: () => body, window: { swPend: { hidden: () => false, del: (s) => calls.push("del " + s) } }, shareWin: (sp) => calls.push("win " + sp.sid) })).renderSlipsSheet();
  handlers.sldel(); handlers.slsh();
  assert.deepStrictEqual(calls, ["del a", "win a"]);
});

test("Show/Hide games toggles in place: no re-render, one card open, SLOPEN synced", () => {
  const mkCard = (sid, open) => {
    const cls = new Set(open ? ["open"] : []);
    const tog = { firstChild: { textContent: "" }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    return { sid, cls, tog, top: 0, scrolled: 0,
      classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
      querySelector: () => tog, querySelectorAll: () => [1, 2, 3], getBoundingClientRect() { return { top: this.top }; }, scrollIntoView(o) { this.scrolled = o; } };
  };
  const a = mkCard("a", true), b = mkCard("b", false);
  const toggles = {};
  const btn = (card) => ({ dataset: { slop: card.sid }, closest: () => card, set onclick(f) { toggles[card.sid] = f; } });
  let draws = 0;
  const body = {
    set innerHTML(v) { draws++; }, getBoundingClientRect: () => ({ top: 100 }), querySelector: () => null,
    querySelectorAll(sel) {
      if (sel === "[data-slop]") return [btn(a), btn(b)];
      if (sel === ".sl2.open") return [a, b].filter((c) => c.cls.has("open"));
      return [];
    },
  };
  const f = mkSheet(baseVals({ SLIPS: [{ sid: "a", odds: 2, legs: [] }, { sid: "b", odds: 2, legs: [] }], $: () => body, SLOPEN: "a" }));
  f.renderSlipsSheet(); const drawn = draws;
  toggles.b();
  assert.strictEqual(draws, drawn, "no full re-render");
  assert.ok(!a.cls.has("open") && b.cls.has("open"), "other card closed, this one open");
  assert.strictEqual(b.tog.firstChild.textContent, "Hide games");
  assert.strictEqual(b.tog.attrs["aria-expanded"], "true");
  assert.strictEqual(a.tog.firstChild.textContent, "Show 3 games");
  assert.strictEqual(f.slopen(), "b");
  b.top = 20; toggles.b();
  assert.ok(!b.cls.has("open")); assert.strictEqual(f.slopen(), "");
  assert.deepStrictEqual(b.scrolled, { block: "nearest" }, "scrolls into view when its top is above the sheet");
  toggles.b(); b.scrolled = 0; b.top = 150; toggles.b();
  assert.strictEqual(b.scrolled, 0, "no scroll when it is still in view");
});

test("Home Recent row: tap opens My slips with that slip open; a swipe is not a tap", () => {
  const card = { dataset: {}, listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  const row = { getAttribute: () => "a", querySelector: (s) => (s === ".sw-card" ? card : null) };
  const scrolled = [];
  const slipsBody = { querySelector: () => ({ scrollIntoView: (o) => scrolled.push(o) }) };
  const host = { set innerHTML(v) { this.html = v; }, querySelectorAll: (s) => (s === ".sw-swipe" ? [row] : []), querySelector: () => null };
  const src = ["slipState", "slipCounts", "bookMark", "renderMyResults"].map(grab).join("\n") + "; return {run: renderMyResults, slopen: function () { return SLOPEN; }};";
  const opened = []; let seen = null, fns;
  const slip = { sid: "a", settled: false, code: "X1", book: "sporty", odds: 2, at: "x", legs: [1] };
  fns = new Function("SLIPS", "window", "BOOKS", "esc", "$", "swSwipe", "clearAllControl", "BIN_SVG", "SL_PEEKED", "openSlipsSheet", "slipWhenPlain", "SLOPEN", src)(
    [slip], { swPend: { hidden: () => false } }, { sporty: { label: "S" } }, (x) => x,
    (id) => (id === "myres" ? host : id === "slipsBody" ? slipsBody : null), () => {}, () => {}, "", true,
    (flt) => { opened.push(flt); seen = fns.slopen(); }, () => "", null);
  fns.run();
  assert.match(host.html, /sw-card ys-row' role='button' tabindex='0'/);
  card.listeners.click();
  assert.deepStrictEqual(opened, ["all"]);
  assert.strictEqual(seen, "a", "SLOPEN set before the sheet draws");
  assert.deepStrictEqual(scrolled, [{ block: "nearest" }]);
  card.dataset.swiped = "1"; card.listeners.click();
  assert.strictEqual(opened.length, 1, "ignored after a swipe");
  delete card.dataset.swiped;
  card.listeners.keydown({ key: "Enter", preventDefault() {} });
  assert.strictEqual(opened.length, 2, "Enter opens");
  card.listeners.keydown({ key: "x", preventDefault() {} });
  assert.strictEqual(opened.length, 2);
});

test("swSwipe marks a horizontal drag as swiped for ~300ms", () => {
  assert.match(grab("swSwipe"), /if\(lock==="x"\)\{ card\.dataset\.swiped="1"; setTimeout\(function\(\)\{ delete card\.dataset\.swiped; \},300\); \}/);
});

test("the red swipe bin is painted only while a card is off its rest", () => {
  const css = /\.sw-bin\{[^}]*\}/.exec(html)[0];
  assert.match(css, /visibility:hidden/, "hidden under a resting card: it bled red through the corners on Show/Hide");
  assert.match(html, /\.sw-swipe\.sw-live \.sw-bin\{visibility:visible\}/);
  const cls = () => { const s = new Set(); return { add: (...a) => a.forEach((x) => s.add(x)), remove: (...a) => a.forEach((x) => s.delete(x)), toggle: (x, on) => (on ? s.add(x) : s.delete(x)), contains: (x) => s.has(x), s }; };
  const card = { dataset: {}, style: {}, offsetWidth: 300, classList: cls(), on: {}, addEventListener(t, f) { this.on[t] = f; }, setPointerCapture() {} };
  const bin = { classList: cls(), style: { setProperty() {} } };
  const row = { classList: cls(), style: {}, offsetHeight: 80, querySelector: (s) => (s === ".sw-card" ? card : bin) };
  const timers = [];
  new Function("setTimeout", "navigator", grab("swSwipe") + "; return swSwipe;")((f) => timers.push(f), {})(row, () => {});
  const ev = (x, y, tgt) => ({ clientX: x, clientY: y, pointerId: 1, target: { closest: () => tgt || null } });
  // a tap on Show/Hide games (a button) never shows the bin
  card.on.pointerdown(ev(100, 10, {})); card.on.pointerup(ev(100, 10));
  assert.ok(!row.classList.contains("sw-live"));
  // a vertical drag (scrolling the sheet) never shows it
  card.on.pointerdown(ev(100, 10)); card.on.pointermove(ev(102, 40)); card.on.pointerup(ev(102, 40));
  timers.splice(0).forEach((f) => f());
  assert.ok(!row.classList.contains("sw-live"));
  // a short horizontal drag shows it, and it goes once the card has snapped back
  card.on.pointerdown(ev(200, 10)); card.on.pointermove(ev(180, 11));
  assert.ok(row.classList.contains("sw-live"), "visible while swiping");
  card.on.pointerup(ev(180, 11));
  assert.ok(row.classList.contains("sw-live"), "still visible during the snap back");
  timers.splice(0).forEach((f) => f());
  assert.ok(!row.classList.contains("sw-live"), "hidden again at rest");
});
