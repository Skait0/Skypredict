"use strict";
/* Task 6b (7 Oct 2026): an upcoming match page links to /?add=<fid> and the
   app puts that game's tip on My slip. Runs the real addFromLink -> toggleMy
   path out of public/index.html, and the real link out of lib/pages.js. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../lib/pages.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The whole function, brace-matched. The LAST declaration, because that is the
   one a browser runs (fixtureById is declared twice). */
function grab(name) {
  const re = new RegExp("(?:^|\\n)(?:async )?function " + name + "\\s*\\(", "g");
  let i = -1, m;
  while ((m = re.exec(src))) i = m.index;
  if (i < 0) throw new Error(name + " has gone from index.html");
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

const FNS = ["fid", "fixtureById", "tipCode", "plainTip", "isUpcoming", "notStarted",
  "kickoffOf", "myslipHas", "toggleMy", "addFromLink"];

const soon = new Date(Date.now() + 3 * 3600e3).toISOString();
const gone = new Date(Date.now() - 3600e3).toISOString();
const FX = [
  { date: soon.slice(0, 10), kickoff: soon, home: "Arsenal", away: "Leeds", tip: "1X, home or draw", tip_p: 0.81, eventId: "sr:1" },
  { date: gone.slice(0, 10), kickoff: gone, home: "Aston Villa", away: "Brentford", tip: "Over 1.5", tip_p: 0.77, eventId: "sr:2" },
];

function app(search, opts) {
  opts = opts || {};
  const timers = [];
  const cls = new Set(opts.gate ? ["sw-gate-on"] : []);
  const ctx = {
    DATA: { fixtures: FX }, MYSLIP: opts.slip || [], toasts: [], opened: 0, url: null, saves: 0,
    location: { search, pathname: "/", hash: "" },
    history: { state: null, replaceState(s, t, u) { ctx.url = u; } },
    document: { documentElement: { classList: { contains: (c) => cls.has(c) } } },
    setTimeout: (fn) => timers.push(fn),
    URLSearchParams,
    $: () => null, saveMy() { ctx.saves++; }, renderFab() {}, syncAddBtn() {}, flyToSlip() {},
    openMySheet() { ctx.opened++; }, loadSporty() {}, repaintAfterMatch() {},
    dayOff: () => 0, fDay: () => 0,
  };
  ctx.window = { swToast: (m) => ctx.toasts.push(m) };
  vm.createContext(ctx);
  vm.runInContext(FNS.map(grab).join("\n"), ctx);
  ctx.passGate = () => { cls.delete("sw-gate-on"); while (timers.length) timers.shift()(); };
  ctx.tick = () => { const t = timers.splice(0); t.forEach((f) => f()); };
  return ctx;
}
const id = (f) => "m" + (f.date + f.home + f.away).replace(/[^a-zA-Z0-9]/g, "");

test("?add=<id> adds that card's tip once, opens My slip, and leaves the address bar", () => {
  const a = app("?add=" + id(FX[0]) + "&x=1");
  vm.runInContext("addFromLink()", a);
  assert.strictEqual(a.MYSLIP.length, 1);
  const leg = a.MYSLIP[0];
  assert.strictEqual(leg.id, id(FX[0]));
  assert.strictEqual(leg.code, "1X", "the same market the card's Add to slip uses");
  assert.strictEqual(leg.label, "Arsenal or Draw");
  assert.strictEqual(leg.p, 0.81);
  assert.strictEqual(leg.via, "match", "a booking of it reports src=match");
  assert.strictEqual(a.opened, 1, "the slip opens so the reader sees it land");
  assert.strictEqual(a.url, "/?x=1", "add= is gone, the rest of the query stays");
  assert.deepStrictEqual(a.toasts, []);
});

test("a game already on the slip is not added twice", () => {
  const a = app("?add=" + id(FX[0]), { slip: [{ id: id(FX[0]), code: "OVER_1.5", label: "x", p: 0.7 }] });
  vm.runInContext("addFromLink()", a);
  assert.strictEqual(a.MYSLIP.length, 1);
  assert.strictEqual(a.MYSLIP[0].code, "OVER_1.5", "the reader's own market is kept");
  assert.strictEqual(a.opened, 1);
});

test("kicked off or unknown: a toast, the slip untouched", () => {
  for (const q of ["?add=" + id(FX[1]), "?add=mNoSuchGame"]) {
    const a = app(q);
    vm.runInContext("addFromLink()", a);
    assert.strictEqual(a.MYSLIP.length, 0, q);
    assert.strictEqual(a.opened, 0, q);
    assert.strictEqual(a.toasts.length, 1, q);
    assert.ok(!/—/.test(a.toasts[0]), "no em dash");
    assert.strictEqual(a.url, "/", q);
  }
});

test("no param, nothing happens", () => {
  const a = app("?x=1");
  vm.runInContext("addFromLink()", a);
  assert.strictEqual(a.url, null);
  assert.strictEqual(a.MYSLIP.length, 0);
});

test("behind the entry gate the add waits until the board shows", () => {
  const a = app("?add=" + id(FX[0]), { gate: true });
  vm.runInContext("addFromLink()", a);
  a.tick(); a.tick();
  assert.strictEqual(a.MYSLIP.length, 0, "nothing lands while the gate is up");
  assert.strictEqual(a.opened, 0);
  a.passGate();
  assert.strictEqual(a.MYSLIP.length, 1);
  assert.strictEqual(a.opened, 1);
});

test("load() runs it once the payload is in", () => {
  const body = grab("load");
  const at = body.indexOf("addFromLink()");
  assert.ok(at > body.indexOf("DATA=got.payload") && at > body.indexOf("paint()"), "after the board is painted");
});

test("the match page links with the id the app's card uses, for every real fixture", () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(grab("fid"), ctx);
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "predictions.json"), "utf8"));
  const tipped = (data.fixtures || []).filter((f) => f.tip).slice(0, 200);
  assert.ok(tipped.length > 0);
  for (const f of tipped.concat([{ date: "2026-10-07", home: "Atlético Mineiro", away: "São Paulo", tip: "Home win" }])) {
    const h = P.renderMatchPage(f, null, []);
    const m = /<p class='tip-go'><a href='\/\?add=([^']+)'>Add this game to my slip<\/a>/.exec(h);
    assert.ok(m, f.home + " v " + f.away);
    assert.strictEqual(m[1], ctx.fid(f), f.home + " v " + f.away);
  }
});
