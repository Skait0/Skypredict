"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { src, prelude } = require("./books.js");

/* The fifth book, pinned where a silent omission would cost a reader: the
   deep link (1xBet HAS one - ?coupon-code=, read out of their betting app's
   restoreSharedCoupon and confirmed in a browser 29 Sep 2026), the skin that
   must not collide, and the lists that decide whether the book is used. */
const books = () => new Function(prelude("onexbet") + "\nreturn BOOKS;")();

test("BOOKS.onexbet opens their slip by code", () => {
  const b = books().onexbet;
  assert.strictEqual(b.label, "1xBet");
  assert.strictEqual(b.skin, "xb");
  assert.strictEqual(b.id, "xbEventId");
  // `open` is a prefix the call sites append the code to, as for SportyBet.
  assert.strictEqual(b.open + encodeURIComponent("ABCDE"), "https://1xbet.ng/en?coupon-code=ABCDE");
  // sel resolves the fixture through the page's index (bookIdOf), which this
  // harness does not lift - so pin that it asks for THIS book's id.
  assert.match(String(b.sel), /bookIdOf\(c,BOOKS\.onexbet\)/);
  assert.strictEqual(b.codeOf({ code: "ABCDE" }), "ABCDE");
});

test("the book sits in the site-wide order and the feed loader", () => {
  assert.match(src, /var ORDER=\["sporty","bet9ja","betking","betpawa","onexbet"\]/);
  assert.match(src, /k==="onexbet"\?loadOnexbet/);
  assert.match(src, /function loadOnexbet\(\)\{ return loadSecondBook\(ONEXBET_FIXTURES,BOOKS\.onexbet\); \}/);
});

test("the xb class names are 1xBet's own", () => {
  // Grep before naming a class (skill §1): every .xb* rule is this book's.
  const rules = [...new Set(src.match(/\.xb[a-z-]*\b/g) || [])];
  assert.ok(rules.every((r) => /^\.xb(m|b)?$|^\.xb-/.test(r)), rules.join(" "));
});
