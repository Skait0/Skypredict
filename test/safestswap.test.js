"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

/* A LEG WITH NO EASIER VERSION OF ITSELF STILL HAS A SAFE BET ON ITS GAME.
   Owner, 14 Oct 2026: "instead of saying outright that we can't fix them, since
   we can read the fixtures, find markets that are very safe and use them.
   editing is all about safe games after all. just let the user know."
   saferSafest is what saferSwap falls back to. Pinned here: both sources (our
   model on a board game, the book's own price on a game we do not rate), the
   80% floor, the step-up rule, nearest qualifying first, and that the row says
   it is a different bet. */
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const lift = (env) => new Function("ENV",
  "var EDIT_SAFE_MIN=" + /var EDIT_SAFE_MIN=([\d.]+);/.exec(src)[1] + ";" +
  "var BOOK_SAFE=" + /var BOOK_SAFE=(\[[^\]]*\]);/.exec(src)[1] + ";" +
  "var FEED_RAW=ENV.FEED_RAW||{};" +
  "function saferDial(){return {gain:0.08,safe:ENV.SAFE===undefined?true:ENV.SAFE};}" +
  "function mProb(f,c){return (ENV.P||{})[c]==null?null:ENV.P[c];}" +
  "function swapOptions(){return Object.keys(ENV.P||{}).map(function(c){return {code:c,p:ENV.P[c]};});}" +
  "function bookAllows(c){return !(ENV.NOT||[]).includes(c);}" +
  "function bookVerdict(){return 'priced';}" +
  "function dcOk(f,c){return !(ENV.DC_BAD||[]).includes(c);}" +
  grab("feedRowOf") + grab("saferSafest") + "\nreturn saferSafest;")(env);
const B = { key: "betway", odds: "wyOdds", label: "Betway" };

test("a board game moves to the nearest very safe bet our model rates", () => {
  const f = { home: "Everton", away: "Chelsea",
    wyOdds: { "OVER_0.5": 1.05, "UNDER_4.5": 1.12, "OVER_1.5": 1.3, "X2": 1.4 } };
  const fn = lift({ P: { "1X": 0.57, "OVER_0.5": 0.93, "UNDER_4.5": 0.86, "OVER_1.5": 0.74, "X2": 0.62 } });
  const s = fn({ prediction: "1X", eventId: "1", odds: 1.6 }, B, f);
  // Under 4.5 (86%) would be nearest, but no Unders (owner, 22 Oct 2026): Over 0.5 (93%) is
  // next. Over 1.5 (74%) does not clear 80%.
  assert.deepStrictEqual([s.to, s.kind, s.src, s.pNew], ["OVER_0.5", "safe", "model", 0.93]);
  assert.strictEqual(s.oddNew, 1.05);
});

test("no Under is ever the safe bet, on the site or in the bot (owner, 22 Oct 2026)", () => {
  const f = { home: "A", away: "B", wyOdds: { "UNDER_3.5": 1.1, "UNDER_4.5": 1.05 } };
  assert.strictEqual(lift({ P: { "1X": 0.5, "UNDER_3.5": 0.9, "UNDER_4.5": 0.95 } })(
    { prediction: "1X", eventId: "1", odds: 2 }, B, f), null, "only Unders qualify, so nothing is offered");
  assert.ok(!/UNDER/.test(/var BOOK_SAFE=(\[[^\]]*\]);/.exec(src)[1]), "the book-price list carries no Under");
  const ask = fs.readFileSync(path.join(__dirname, "..", "lib", "ask.js"), "utf8");
  assert.ok(!/UNDER/.test(/const SAFE_TO = (\[[^\]]*\])/.exec(ask)[1]), "the bot's Make it safer moves nobody onto an Under");
});

test("only a market the book publishes a price for, and the double-chance rule holds", () => {
  const f = { home: "A", away: "B", wyOdds: { "OVER_0.5": 1.05 } };
  const fn = lift({ P: { "1X": 0.5, "UNDER_4.5": 0.86, "OVER_0.5": 0.93, "X2": 0.84 }, DC_BAD: ["X2"] });
  const s = fn({ prediction: "1X", eventId: "1", odds: 2 }, B, f);
  assert.strictEqual(s.to, "OVER_0.5", "UNDER_4.5 has no price and X2 fails dcOk");
});

test("a game we do not rate uses the bookmaker's own price, with margin off", () => {
  const FEED_RAW = { betway: [{ eventId: "74560556", odds: { "OVER_0.5": 1.04, "1X": 1.18, "OVER_1.5": 1.35 } }] };
  const fn = lift({ FEED_RAW });
  const s = fn({ prediction: "GG", eventId: "74560556", odds: 1.8, home: "Slovan U19", away: "Stuttgart U19" }, B, null);
  // 1/1.18/1.05 = 80.7% clears the floor and is nearer than Over 0.5 (91.6%);
  // Over 1.5 at 70.5% does not clear it.
  assert.deepStrictEqual([s.to, s.src, s.kind], ["1X", "book", "safe"]);
  assert.strictEqual(s.pNew, null, "a book price is never shown as our probability");
  assert.deepStrictEqual(s.f, { home: "Slovan U19", away: "Stuttgart U19" });
});

test("nothing very safe on sale means no swap, and the leg stays a cut candidate", () => {
  const fn = lift({ P: { "1X": 0.57, "OVER_1.5": 0.74 } });
  assert.strictEqual(fn({ prediction: "1X", eventId: "1", odds: 1.6 }, B, { wyOdds: { "OVER_1.5": 1.3 } }), null);
  assert.strictEqual(lift({})({ prediction: "1X", eventId: "9", odds: 1.6 }, B, null), null, "no feed row");
});

test("a leg already safer than the offer is left alone", () => {
  const fn = lift({ P: { "OVER_0.5": 0.9, "UNDER_4.5": 0.86 } });
  assert.strictEqual(fn({ prediction: "OVER_0.5", eventId: "1", odds: 1.05 }, B,
    { wyOdds: { "UNDER_4.5": 1.12 } }), null);
});

test("the panel tells the reader it is a different bet, in the book's own wordmark", () => {
  assert.match(src, /had no easier version of the same bet, so we moved/);
  assert.match(src, /That is a different bet: <b>Keep<\/b> puts the original back\./);
  assert.match(src, /we don't rate this game<\/i>/);
  assert.match(src, /if\(!opts\.length\) return saferSafest\(l,B,f\);/);
  assert.match(src, /if\(!f\) return saferSafest\(l,B,null\);/);
  // and the off-board note no longer promises to leave those games alone
  assert.doesNotMatch(src, /Edit leaves them as they are/);
  assert.match(src, /prices a very safe bet "\s*\+\s*"on one of these, we use its own price/);
});

test("the level decides who may be moved to a different bet (owner, 14 Oct 2026: x770 came back x25)", () => {
  const f = { home: "Everton", away: "Chelsea", wyOdds: { "OVER_0.5": 1.05, "UNDER_4.5": 1.12 } };
  const P = { "1X": 0.57, "OVER_0.5": 0.93, "UNDER_4.5": 0.86 };
  const leg = { prediction: "1X", eventId: "1", odds: 1.6 };
  assert.strictEqual(lift({ P, SAFE: false })(leg, B, f), null, "Light touch never swaps to an unrelated bet");
  assert.strictEqual(lift({ P, SAFE: 0.60 })(leg, B, f).to, "OVER_0.5", "Balanced: a leg we rate under 60% may move (Unders never - owner, 22 Oct 2026)");
  assert.strictEqual(lift({ P: Object.assign({}, P, { "1X": 0.66 }), SAFE: 0.60 })(leg, B, f), null,
    "Balanced: a leg we rate 60%+ stays as it is");
  assert.strictEqual(lift({ P: Object.assign({}, P, { "1X": 0.66 }), SAFE: true })(leg, B, f).to, "OVER_0.5", "Safest moves it");
  const FEED_RAW = { betway: [{ eventId: "7", odds: { "1X": 1.18 } }] };
  assert.strictEqual(lift({ FEED_RAW, SAFE: 0.60 })({ prediction: "GG", eventId: "7", odds: 1.4 }, B, null), null,
    "off the board, the book's own price (1/1.4 less margin = 68%) is the leg's chance");
  const dial = src.slice(src.indexOf("var SAFER_STRENGTH={"), src.indexOf("function saferDial"));
  assert.match(dial, /light:{[^}]*safe:false}/);
  assert.match(dial, /normal:{[^}]*safe:0.60}/);
  assert.match(dial, /strong:{[^}]*safe:true}/);
});
