"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { src, prelude } = require("./books.js");

/* The seventh book (22 Oct 2026), pinned where a silent omission would cost a reader: the
   deep link (MSport HAS one - /ng?code= loads the code into their betslip, checked to survive
   the redirect to /ng/web), the skin that must not collide (.ms- is My slip's, so mp), the
   wordmark, and the lists that decide whether the book is used. Its ids are Sportradar's,
   written as SportyBet writes them, so it pairs by srId. */
const books = () => new Function(prelude("msport") + "\nreturn BOOKS;")();
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("BOOKS.msport opens their slip by code and books on its own route", () => {
  const b = books().msport;
  assert.strictEqual(b.label, "MSport");
  assert.strictEqual(b.skin, "mp");
  assert.strictEqual(b.id, "mpEventId");
  assert.strictEqual(b.odds, "mpOdds");
  assert.strictEqual(b.open + "B2YTV99", "https://www.msport.com/ng?code=B2YTV99");
  assert.match(src, /const MP_BOOK_URL="\/api\/book\?book=msport";/);
  assert.strictEqual(b.codeOf({ code: "B2YTV99" }), "B2YTV99");
  // total=0.5..6.5 only on eight deep cards; 50 selections per their own betslip.
  assert.strictEqual(b.wholeLines, false);
  assert.strictEqual(b.max, 50);
});

test("the book sits in the order, the feed loader and every proxy", () => {
  assert.match(src, /var ORDER=\["sporty","bet9ja","betking","betpawa","onexbet","betway","msport"\]/);
  assert.match(src, /k==="msport"\?loadMsport/);
  assert.match(src, /function loadMsport\(\)\{ return loadSecondBook\(MSPORT_FIXTURES,BOOKS\.msport\); \}/);
  assert.strictEqual(require("../lib/bookproxy.js").BOOKS.msport, "/api/msport/booking-code");
  assert.match(read("api/msport.js"), /makeHandler\("msport"\)/);
  assert.match(read("api/slip.js"), /"betway", "msport"\]/);
  assert.ok(JSON.parse(read("vercel.json")).functions["api/msport.js"], "the feed route has its own limits");
  assert.strictEqual(require("../lib/books.js").NAMES.msport, "MSport");
});

test("the wordmark, the code card and the brand colour are MSport's own", () => {
  assert.match(src, /:root\{--mp-yellow:#FFCA27;--mp-hi:#FFCA27\}/);
  assert.match(src, /\[data-theme="light"\]\{--mp-hi:#7A5C00\}/, "yellow on white is 1.5:1; the light theme takes dark gold");
  assert.match(src, /<button class="byo-b" type="button" data-book="msport"/);
  assert.match(src, /<i class="bkc-i" data-bk="mp">MSport<\/i>/);
  assert.match(src, /\.code-card--mp,\[data-theme="light"\] \.code-card--mp\{/);
  // Copy and Share on their yellow carry dark ink: white on #FFCA27 is 1.6:1.
  assert.match(src, /background:#FFCA27;color:#111;/);
  const rules = [...new Set(src.match(/\.mp[a-z-]*\b/g) || [])];
  assert.ok(rules.every((r) => /^\.mpm$|^\.mp-/.test(r)), rules.join(" "));
});

test("it sells only what its cards priced, and it is never handed what it does not", () => {
  const ONLY = new Function("return " + src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";")();
  const sells = Object.keys(ONLY).filter((k) => ONLY[k].includes("msport")).sort();
  assert.deepStrictEqual(sells, ["CORNERS_OV_7.5", "FH_UNDER_2.5", "SH_OVER_0.5", "SH_UNDER_2.5", "WTN_A_N", "WTN_H_N"]);
  for (const k of ["MIX_1_OV_2.5", "GG2_Y", "SHOTS_OV_24.5", "CORNERS_H_OV_4.5", "AH_1_1"]) {
    assert.ok(!ONLY[k].includes("msport"), k + " is not on MSport's cards");
  }
});
