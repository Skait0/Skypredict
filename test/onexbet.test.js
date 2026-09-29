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

/* Brand read off their own icon (#276BA6 on white, 256px webp) and logo SVG
   (#14A0FF) on 29 Sep 2026. Pinned so a "tidy-up" cannot drift it. */
test("1xBet colours are theirs", () => {
  assert.match(src, /--xb-blue:\s*#276BA6/i);
  assert.match(src, /\.xbm \.xbb\{[^}]*color:\s*#14A0FF/i);
});

function lum(hex) {
  const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("the blue is readable on white", () => {
  assert.ok(ratio("276BA6", "FFFFFF") >= 4.5, String(ratio("276BA6", "FFFFFF")));
});

test("every sentence that lists the books names 1xBet", () => {
  const lists = src.match(/SportyBet, Bet9ja, BetKing(?: or|,) betPawa[^"<]{0,20}/g) || [];
  assert.ok(lists.length > 0);
  for (const l of lists) assert.match(l, /1xBet/, l);
});

test("every wordmark selector list that names betPawa names 1xBet", () => {
  const lists = src.match(/[^{}\n]*\.bwm[^{}\n]*\{/g) || [];
  for (const l of lists.filter((x) => /\.sbm/.test(x))) assert.match(l, /\.xbm/, l);
});

test("the header cycle, the builder and the code card carry 1xBet", () => {
  assert.match(src, /<i class="bkc-i[^"]*" data-bk="xb"/);
  assert.match(src, /<button class="byo-b" type="button" data-book="onexbet"/);
  assert.match(src, /\.code-card--xb /);
});

test("the bot's start link opens a 1xBet code on 1xBet", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  const asked = [];
  const real = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/slip?")) { asked.push(u); return { json: async () => ({ success: false }) }; }
    return { json: async () => ({ ok: true, result: {} }) };
  };
  try {
    delete require.cache[require.resolve("../api/tg.js")];
    const tg = require("../api/tg.js");
    await tg({ method: "POST", headers: { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") },
      body: { message: { message_id: 1, chat: { id: 5, type: "private" }, text: "/start onexbet_ABCDE" } } },
      { status() { return this; }, json() { return this; } });
    assert.deepStrictEqual(asked.map((u) => /book=(\w+)&code=(\w+)/.exec(u).slice(1).join(":")), ["onexbet:ABCDE"]);
  } finally { global.fetch = real; delete process.env.TELEGRAM_BOT_TOKEN; }
});

test("the converter, the bot and the daily code know the fifth book", () => {
  const convert = require("../lib/convert.js");
  const fs = require("node:fs");
  const read = (p) => fs.readFileSync(require("node:path").join(__dirname, "..", p), "utf8");
  assert.match(read("lib/convert.js"), /onexbet: "\/api\/onexbet"/);
  assert.match(read("lib/doctor.js"), /onexbet: "1xBet"/);
  assert.match(read("lib/bigodds.js"), /\["onexbet", "1xBet"\]/);
  assert.match(read("scripts/mkcode.js"), /codes\.onexbet = /);
  assert.match(read("scripts/namesaudit.js"), /onexbet: "\/api\/onexbet"/);
  assert.match(read("scripts/pushcode.js"), /c\.onexbet/);
  assert.ok(convert);
});
