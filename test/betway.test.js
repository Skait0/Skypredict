"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { src, prelude } = require("./books.js");

/* The sixth book (14 Oct 2026), pinned where a silent omission would cost a
   reader: the deep link (Betway HAS one - any page with ?bookingCode= opens
   their betslip and loads the code; their own redirect uses
   /sport/soccer/?bookingCode=, read out of their Nuxt bundle), the skin that
   must not collide (bw is betPawa's, bt is taken, so wy), and the lists that
   decide whether the book is used. */
const books = () => new Function(prelude("betway") + "\nreturn BOOKS;")();
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("BOOKS.betway opens their slip by code", () => {
  const b = books().betway;
  assert.strictEqual(b.label, "Betway");
  assert.strictEqual(b.skin, "wy");
  assert.strictEqual(b.id, "wyEventId");
  assert.strictEqual(b.odds, "wyOdds");
  assert.strictEqual(b.open + encodeURIComponent("BW79B45CD9"),
    "https://www.betway.com.ng/sport/soccer/?bookingCode=BW79B45CD9");
  assert.match(String(b.sel), /bookIdOf\(c,BOOKS\.betway\)/);
  assert.strictEqual(b.codeOf({ code: "BWABC" }), "BWABC");
  // Their card sold half goal lines only on ten deep cards (14 Oct 2026).
  assert.strictEqual(b.wholeLines, false);
});

test("the book sits in the site-wide order and the feed loader", () => {
  assert.match(src, /var ORDER=\["sporty","bet9ja","betking","betpawa","onexbet","betway"\]/);
  assert.match(src, /k==="betway"\?loadBetway/);
  assert.match(src, /function loadBetway\(\)\{ return loadSecondBook\(BETWAY_FIXTURES,BOOKS\.betway\); \}/);
});

test("the wy class names are Betway's own", () => {
  const rules = [...new Set(src.match(/\.wy[a-z-]*\b/g) || [])];
  assert.ok(rules.length > 0);
  assert.ok(rules.every((r) => /^\.wym$|^\.wy-/.test(r)), rules.join(" "));
});

/* Brand read off their own assets on 14 Oct 2026: the app icon and the
   manifest theme are #000000 with a white mark; #00A826 is the green their
   stylesheets use most (27 times); #006B00 is their own darker green, used
   here for text on the light theme. */
test("Betway colours are theirs", () => {
  assert.match(src, /--wy-green:\s*#00A826/i);
  assert.match(src, /\[data-theme="light"\]\{--wy-hi:#006B00\}/i);
});

function lum(hex) {
  const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("the green is readable where it is used as text", () => {
  assert.ok(ratio("006B00", "FFFFFF") >= 4.5, "light: " + ratio("006B00", "FFFFFF"));
  assert.ok(ratio("00A826", "111111") >= 4.5, "dark: " + ratio("00A826", "111111"));
});

test("every sentence that lists the books names Betway", () => {
  const lists = src.match(/SportyBet, Bet9ja, BetKing(?: or|,) betPawa[^"<]{0,30}/g) || [];
  assert.ok(lists.length > 0);
  for (const l of lists) assert.match(l, /Betway/, l);
});

test("every wordmark selector list that names betPawa names Betway", () => {
  const lists = src.match(/[^{}\n]*\.bwm[^{}\n]*\{/g) || [];
  for (const l of lists.filter((x) => /\.sbm/.test(x))) assert.match(l, /\.wym/, l);
});

test("the entry screen names Betway (owner-facing first screen, missed by the sweep, caught driving the page)", () => {
  assert.match(src, /<p class="sw-g-sub">[^<]*(?:<[^>]+>[^<]*)*<span class="wym">betway<\/span> code\.<\/p>/);
});

test("the header cycle, the builder and the code card carry Betway", () => {
  assert.match(src, /<i class="bkc-i[^"]*" data-bk="wy"/);
  assert.match(src, /<button class="byo-b" type="button" data-book="betway"/);
  assert.match(src, /\.code-card--wy /);
});

const ONLY = () => new Function("return " + src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";")();
const HCAP = () => new Function("return " + src.match(/var HCAP_CODES=(\[[^\]]*\]);/)[1] + ";")();

test("the handicap chip offers Betway its half lines and never its whole ones", () => {
  /* Betway sells no Asian handicap, but a half-line Asian bet wins on exactly
     the scores one three-way outcome does, so betway.py books the half lines
     there (AH_VIA_EH, owner's call 14 Oct 2026, 12/12 price checks). Whole
     lines push, so they stay with the three books that sell them. */
  const only = ONLY();
  for (const c of HCAP()) {
    const whole = !/\.5$/.test(c);
    if (whole) assert.ok(only[c] && !only[c].includes("betway"), c);
    else assert.ok(!only[c] || only[c].includes("betway"), c + " keeps Betway out");
  }
});

test("Betway is in the OR family it sells and nowhere it does not", () => {
  /* Its "X Or Over 2.5" (854-859) and "X Or Both Teams To Score" (860-862)
     are OR bets - priced below both parts on 18 of 18 checks, 14 Oct 2026 -
     unlike betPawa's and 1xBet's AND bets. Sold at 2.5 only. */
  const only = ONLY();
  for (const c of ["MIX_1_OV_2.5", "MIX_X_OV_2.5", "MIX_2_OV_2.5", "MIXGG_1", "MIXGG_X", "MIXGG_2"]) {
    assert.ok(only[c].includes("betway"), c);
  }
  for (const c of ["MIX_1_OV_1.5", "MIX_X_OV_1.5", "MIX_2_OV_1.5", "CORNERS_OV_7.5",
                   "CORNERS_H_OV_4.5", "SHOTS_OV_21.5", "AH_1_-1", "NR3_ANY"]) {
    assert.ok(!only[c].includes("betway"), c);
  }
});

test("the converter, the bot and the daily code know the sixth book", () => {
  assert.match(read("lib/convert.js"), /betway: "\/api\/betway"/);
  assert.strictEqual(require("../lib/doctor.js").BOOK_NAMES.betway, "Betway");
  assert.match(read("lib/bigodds.js"), /\["betway", "Betway"\]/);
  assert.match(read("scripts/mkcode.js"), /for \(const bk of \[[^\]]*"betway"\]\)[\s\S]*codes\[bk\] = /);
  assert.match(read("scripts/namesaudit.js"), /betway: "\/api\/betway"/);
  assert.match(read("lib/slipwatch.js"), /betway: "Betway"/);
});

/* Copy and Share use their darker #008600: white on the #00A826 accent is
   3.2:1, on #008600 4.8:1 (caught writing the card, 14 Oct 2026). */
test("the Betway code card is built like the other books'", () => {
  const rule = (sel) => {
    const i = src.indexOf(sel + "{");
    assert.ok(i >= 0, "missing rule: " + sel);
    return src.slice(i, src.indexOf("}", i));
  };
  const ground = rule(".code-card--wy,[data-theme=\"light\"] .code-card--wy");
  assert.match(ground, /radial-gradient\([^)]*rgba\(0,168,38/);
  assert.match(rule(".code-card--wy .code-open"), /background:#fff/);
  assert.match(rule(".code-card--wy .code-open .wym"), /color:#000/);
  assert.match(src, /\.code-card--wy \.code-acts \.code-copy,\r?\n\.code-card--wy \.code-acts \.share-btn\{\r?\n  background:#008600/);
  assert.ok(ratio("008600", "FFFFFF") >= 4.5);
});

test("the converter's bookmaker row wraps rather than hiding a book off a phone screen", () => {
  /* Six wordmarks are 440px on one line; at 375px Betway sat past the edge
     (owner, 14 Oct 2026: "its not in the converter bookie selection tab"). */
  const rule = src.match(/\n\.byo-book\{[^}]*\}/)[0];
  assert.match(rule, /flex-wrap:wrap/);
  assert.match(rule, /max-width:100%/);
});
