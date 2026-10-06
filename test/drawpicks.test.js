"use strict";
/* "WHEN I CLICK ON THE DRAW PICKS, ALL THE GAMES DONT PREDICT DRAWS."
 *
 * Owner, 6 Oct 2026. The "Draw picks" chip filters on f.draw_watch, but every
 * card kept leading with its usual tip, so "Add to slip" from that view put a
 * 1X or an away win on the slip. The owner's call: in that view each card leads
 * with the Draw, its chance and the book's draw price, and adding it adds X.
 *
 * Driven through the real renderers - matchHTML (cards), listRowHTML (rows) -
 * and the chip's own key out of CATS, then read back off the markup the click
 * handlers read: data-code / data-p on the button are what toggleMy receives.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const re = new RegExp("(?:^|\\n)((?:var|const|function)\\s+" + name + "\\b)", "m");
  const m = re.exec(src);
  assert.ok(m, "not found in index.html: " + name);
  const i = m.index + m[0].indexOf(m[1]);
  const isFn = m[1].startsWith("function");
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") { depth++; started = true; }
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (isFn && started && depth === 0 && c === "}") return src.slice(i, k + 1);
    } else if (c === ";" && depth === 0 && !isFn) return src.slice(i, k + 1);
  }
  assert.fail("could not find the end of " + name);
}

const real = ["P0", "esc", "fid", "tipEval", "scoreSurvives", "mirrorScore", "reconcileScore", "conf", "verdict", "plainTip", "whyLine", "tipCode", "boardPick",
  "legOdd", "oddOf", "opt", "bestPriceHTML", "moreHTML", "countMarkets", "matchHTML", "listRowHTML", "CATS"]
  .map(grab).join("\n");
const stubs = `
  var V={cat:"all"}, LOPEN={}, POTD_ID=null, PLUS="+";
  var BOOKS={sporty:{key:"sporty",label:"SportyBet",odds:"sportyOdds"}};
  function curBook(){return BOOKS.sporty;}
  function bookFeedPending(){return false;}
  function myslipHas(){return false;}
  function isFav(){return false;} function countryOf(){return "";} function isValue(){return false;}
  function scoreLine(f){return f.score;}
  function split100(v){return v.map(function(x){return Math.round(x*100);});}
  function formHTML(){return "";} function statusSlot(){return "";} function valPill(){return "";}
  function kickTime(){return "18:00";}
`;
const H = new Function(stubs + real + "\nreturn {V:V,CATS:CATS,matchHTML:matchHTML,listRowHTML:listRowHTML,moreHTML:moreHTML};")();

const fx = (o) => Object.assign({
  date: "2026-10-08", home: "Lugano", away: "Thun", league: "Switzerland Super League",
  lh: 1.3, la: 1.25, home_p: 0.36, draw_p: 0.31, away_p: 0.33,
  dc1x: 0.67, dcx2: 0.64, dc12: 0.69, o15: 0.7, o25: 0.45, btts: 0.55, fh_o05: 0.68,
  form_home: [], form_away: [],
  tip: "1X, home or draw", tip_p: 0.67, draw_watch: true, score: "2-1",
  sportyOdds: { "1": 2.6, "X": 3.25, "2": 2.8, "1X": 1.42 },
}, o);

const attr = (html, cls, a) => {
  const m = new RegExp("<button class='" + cls + "'[^>]*?" + a + "=(?:'([^']*)'|\"([^\"]*)\")").exec(html);
  return m && (m[1] != null ? m[1] : m[2]);
};
const drawKey = () => {
  const c = H.CATS.filter((x) => x.label === "Draw picks")[0];
  assert.ok(c, "the Draw picks chip is gone from CATS");
  return c.k;
};

test("the Draw picks chip filters on draw_watch", () => {
  const c = H.CATS.filter((x) => x.k === drawKey())[0];
  assert.strictEqual(c.test(fx()), true);
  assert.ok(!c.test(fx({ draw_watch: false })));
});

test("in the Draw picks view a card leads with the draw and adds X to the slip", () => {
  H.V.cat = drawKey();
  const html = H.matchHTML(fx());
  assert.match(html, /<span class='v'>Draw<\/span>/, "card does not lead with Draw");
  assert.match(html, /x3\.25/, "the book's draw price is not on the card");
  assert.match(html, /<b>31<\/b>/, "the draw chance is not in the ring");
  assert.strictEqual(attr(html, "m-add", "data-code"), "X", "Add to slip would not add the draw");
  assert.strictEqual(attr(html, "m-add", "data-p"), "0.310");
  assert.strictEqual(attr(html, "m-add", "data-label"), "Draw");
  assert.doesNotMatch(html, /Lugano or Draw/, "the usual tip is still the card's call");
});

test("in the Draw picks view a list row leads with the draw and its price", () => {
  H.V.cat = drawKey();
  const html = H.listRowHTML(fx());
  assert.match(html, /<span class='tx' title="Draw">Draw<\/span><i class='todd num'>x3\.25<\/i><i class='grade'>31%<\/i>/);
  assert.match(html, /Best price for Draw<\/h3><p class='bp-l'><b>x3\.25 on SportyBet/,
    "the expanded row prices the usual tip, not the draw");
});

test("no book price, no number pretending to be one", () => {
  H.V.cat = drawKey();
  const html = H.matchHTML(fx({ sportyOdds: null }));
  assert.match(html, /<span class='v'>Draw<\/span>/);
  assert.doesNotMatch(html, /todd/, "a model estimate was shown as the bookmaker's draw price");
  assert.strictEqual(attr(html, "m-add", "data-code"), "X");
});

test("every other view keeps the usual tip", () => {
  for (const k of H.CATS.map((c) => c.k).filter((k) => k !== drawKey())) {
    H.V.cat = k;
    const html = H.matchHTML(fx());
    assert.strictEqual(attr(html, "m-add", "data-code"), "1X", k);
    assert.match(html, /Lugano or Draw/, k);
    assert.doesNotMatch(html, /todd/, k);
    assert.match(H.listRowHTML(fx()), /Best price for 1X, home or draw/, k);
  }
});

test("Add all tips to slip in the Draw picks view adds the draws", () => {
  /* The board's book-all button reads bookAllPicks, which "reuses the same
     picks the cards show" - so it has to follow the card, not tipCode. */
  const run = (cat) => new Function(stubs + real + grab("bookAllPicks") +
    "\nfunction notStarted(){return true;} function shown(){return L;}" +
    "\nreturn function(l){L=l;V.cat=" + JSON.stringify(cat) + ";return bookAllPicks();}; var L;")();
  const list = [fx(), fx({ home: "Basel", away: "Servette", draw_watch: false, tip: "Home win", tip_p: 0.62, home_p: 0.62 })];
  const draw = run(drawKey())(list.filter((f) => f.draw_watch));
  assert.deepStrictEqual(draw.map((c) => [c.code, c.p]), [["X", 0.31]]);
  const all = run("all")(list);
  assert.deepStrictEqual(all.map((c) => c.code), ["1X", "1"]);
});

test("in the Draw picks view the score beside Draw is a draw", () => {
  /* The published score is sampled for the usual tip - 2-1 for a 1X - so it
     sat beside "Draw" as "2-1 could end". reconcileScore gives the likeliest
     draw from the same lh/la; a score that already is a draw is kept. */
  H.V.cat = drawKey();
  const sc = (html) => (/<b class='num'>(\d+-\d+)<\/b><i>could end/.exec(html) || [])[1];
  assert.strictEqual(sc(H.matchHTML(fx())), "1-1", "card");
  assert.match(H.listRowHTML(fx()), /not the most likely score'>1-1<\/span>/, "list row");
  assert.strictEqual(sc(H.matchHTML(fx({ score: "2-2" }))), "2-2", "a published draw is kept");
  assert.strictEqual(sc(H.matchHTML(fx({ score: "0-1", lh: 0.6, la: 0.6 }))), "0-0", "low-scoring sides draw 0-0");
  for (const k of H.CATS.map((c) => c.k).filter((k) => k !== drawKey())) {
    H.V.cat = k;
    assert.strictEqual(sc(H.matchHTML(fx())), "2-1", k + " keeps the published score");
  }
});

test("the Add all button says draws in the Draw picks view, tips elsewhere", () => {
  const btn = () => {
    const tx2 = { textContent: "tips to slip" }, n = { textContent: "" };
    const b = { classList: { toggle() {} }, querySelector: (q) => (q === ".ba-tx2" ? tx2 : null) };
    return { b, tx2, n };
  };
  const run = (cat) => {
    const d = btn();
    new Function("D", stubs + real + grab("bookAllPicks") + grab("renderBookAll") +
      "\nfunction notStarted(){return true;} function shown(){return [D.f];}" +
      "\nfunction bookTakes(){return true;}" +
      "\nfunction $(id){return id==='bookAll'?D.b:id==='bookAllN'?D.n:null;}" +
      "\nV.cat=" + JSON.stringify(cat) + "; renderBookAll();")(Object.assign(d, { f: fx() }));
    return d;
  };
  const d = run(drawKey());
  assert.strictEqual(d.tx2.textContent, "draws to slip");
  assert.strictEqual(d.n.textContent, 1);
  for (const k of H.CATS.map((c) => c.k).filter((k) => k !== drawKey())) {
    assert.strictEqual(run(k).tx2.textContent, "tips to slip", k);
  }
});
