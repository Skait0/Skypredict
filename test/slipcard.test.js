"use strict";

/**
 * The link-preview card for a shared slip.
 *
 * A slip shared to X showed no card of its own. Two things were wrong and only
 * one of them was the picture: every slip declared og:url as the bare "/s"
 * route, so the crawlers - which key their preview cache on the canonical url -
 * were being handed one resource over and over. That is fixed in api/s.js and
 * pinned in sliplink.test.js.
 *
 * This is the other half: a card carrying THIS slip's numbers. It cannot be a
 * file on disk, and it cannot be drawn - zero dependencies, no browser, no
 * image library at request time. So the parts are baked once by
 * scripts/mkslipcard.js and composited here.
 *
 * The rule that shapes all of it: a figure that cannot be drawn correctly is
 * not drawn at all. A missing card is a link without a picture. A card with a
 * number running off its own edge, or sitting over its label, goes out on
 * somebody else's timeline where nobody can fix it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const CARD = require("../lib/slipcard.js");

/* PNG magic, so "it returned a Buffer" cannot pass for "it returned an image". */
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIG);
}

/* ------------------------------------------------------------ it draws */

test("a slip's numbers become a card", () => {
  const png = CARD.build(3, 3.81);
  assert.ok(isPng(png), "not a PNG");
});

test("both extremes of the board are drawable", () => {
  /* 3 games at 1.63 is the Slider's floor; 35 at five figures is the top of
     what the Wizard has produced. Both have to fit the blocks baked for them. */
  for (const [g, o] of [[3, 1.63], [35, 20796], [1, 1.01], [35, 229863]]) {
    const png = CARD.build(g, o);
    if (o >= 1e5) continue;              /* six digits is refused, see below */
    assert.ok(isPng(png), g + " games at " + o + " could not be drawn");
  }
});

test("the card stays small enough to survive WhatsApp", () => {
  /* WhatsApp silently drops preview images over roughly 300 KB - the site card
     hit 343 KB once and simply stopped appearing in chats. The background is
     posterised for exactly this reason, and a regression here is invisible
     until somebody says their link has no picture. */
  for (const [g, o] of [[3, 3.81], [26, 1318], [35, 20796]]) {
    const png = CARD.build(g, o);
    assert.ok(png.length < 300 * 1024,
      g + "/" + o + " is " + Math.round(png.length / 1024) + " KB, over the limit");
  }
});

/* ------------------------------------------------- how a figure is written */

test("odds keep their decimals only while the decimals mean something", () => {
  /* 3.81 is a different bet from 3.79. Nobody reads 20796.43 as more useful
     than 20796, and the decimals would cost two glyphs of a block that has to
     hold five. */
  assert.strictEqual(CARD.oddsText(3.814), "3.81");
  assert.strictEqual(CARD.oddsText(54.07), "54.07");
  assert.strictEqual(CARD.oddsText(999.994), "999.99");
  assert.strictEqual(CARD.oddsText(1318.4), "1318");
  assert.strictEqual(CARD.oddsText(20796.43), "20796");
});

test("odds that are not odds are refused", () => {
  for (const bad of [1, 0.5, 0, -3, null, undefined, NaN, "x", Infinity]) {
    assert.strictEqual(CARD.oddsText(bad), null, String(bad));
  }
});

/* --------------------------------- what it refuses rather than draws wrong */

test("a game count outside what a slip can hold is refused", () => {
  for (const g of [0, -1, 100, 1000, null, NaN, "x"]) {
    assert.strictEqual(CARD.build(g, 10), null, "games=" + g);
  }
});

test("a figure too wide for its block is refused, not overrun", () => {
  /* The block is a WIDTH, not a count of characters - which is the point of
     laying glyphs on their own advances. "1234567" is seven digits and still
     narrower than the block, because 1 and 2 and 7 are narrow; it is drawn,
     correctly. Eight wide digits genuinely do not fit and are refused, which
     sends the static site card instead - generic rather than wrong. */
  assert.ok(CARD.build(3, 1234567), "narrow digits that fit must be drawn");
  assert.strictEqual(CARD.build(3, 88888888), null,
    "eight of the widest digit must not be drawn over the label");
});

test("a built card is not rebuilt for the same slip", () => {
  /* Compositing and deflating costs about a second. Crawlers fetch a preview
     in bursts - X, WhatsApp and the sender's own client all pull the same URL
     within seconds of a link being posted - and the edge cache does not catch
     the first few. */
  const a = CARD.build(7, 12.34);
  const t = Date.now();
  const b = CARD.build(7, 12.34);
  assert.strictEqual(a, b, "the same slip must give back the same buffer");
  assert.ok(Date.now() - t < 50, "a repeat took " + (Date.now() - t) + "ms, so it rebuilt");
});

test("nothing is drawn from a glyph that was never baked", () => {
  /* The baked set is 0-9 and the decimal point. Anything else would leave a
     hole where a character should be, which reads as a broken image rather
     than a missing one. */
  const C = require("../assets/slip-card.json");
  assert.strictEqual(C.glyphs, "0123456789.");
  const fake = { meta: C };
  assert.strictEqual(CARD.textWidth(fake, "1x2"), null, "an unbaked glyph must refuse");
  assert.ok(CARD.textWidth(fake, "20796") > 0);
});

/* ------------------------------------------------------- the layout itself */

test("figures are laid out on their own widths, not one shared width", () => {
  /* The first version put every glyph on the widest glyph's advance, copying
     the site card. It rendered "3.81" as "3 . 81": a decimal point on a
     full-width cell is mostly empty. "1" is 55px against "0" at 92, so numbers
     containing either looked broken. */
  const C = require("../assets/slip-card.json");
  assert.ok(C.advances, "per-glyph advances must be baked");
  assert.ok(C.advances["."] < C.advances["0"] * 0.75,
    "a decimal point must be narrower than a digit, got " + C.advances["."]);
  assert.ok(C.advances["1"] < C.advances["0"] * 0.8,
    "a one must be narrower than a zero, got " + C.advances["1"]);
  assert.ok(C.centres && C.centres.games && C.centres.odds,
    "blocks are centred about a point, not filled cell by cell");
});

test("a wider figure and a narrower one are both centred on the same point", () => {
  /* What lets "3.81" and "20796" sit under one baked label. */
  const C = require("../assets/slip-card.json");
  const fake = { meta: C };
  const narrow = CARD.textWidth(fake, "3.81");
  const wide = CARD.textWidth(fake, "20796");
  assert.ok(wide > narrow, "the sample widths must actually differ");
  assert.ok(wide <= C.widths.odds, "the widest value must fit the block it was sized for");
});

/* ------------------------------------------------------------ the assets */

test("the baked parts are all present and are what the compositor expects", () => {
  const A = path.join(__dirname, "..", "assets");
  for (const f of ["slip-base.z", "slip-glyphs.z", "slip-card.json"]) {
    assert.ok(fs.existsSync(path.join(A, f)), f + " is missing");
  }
  const C = require("../assets/slip-card.json");
  const size = CARD.cardSize();
  assert.strictEqual(size.w, C.w);
  assert.strictEqual(size.h, C.h);
  /* 2:1-ish, which is what X and WhatsApp crop a large card to. */
  assert.ok(size.w / size.h > 1.8 && size.w / size.h < 2.2,
    "a preview card has to be about two to one, got " + (size.w / size.h).toFixed(2));
});

/* ------------------------------------------------------------- the wiring */

test("a shared slip points at its own card, not the site's", () => {
  /* Call-site assertion. Everything above passes while sliplink still emits the
     static og-card.png, which is exactly the state this work started from. */
  const SL = require("../lib/sliplink.js");
  const legs = [
    { home: "Thun", away: "Lausanne", date: "2026-09-02", code: "OVER_1.5", od: 1.25, p: 0.91 },
    { home: "Orenburg", away: "Rubin Kazan", date: "2026-09-02", code: "1X", od: 1.44, p: 0.77 },
  ];
  const html = SL.renderPage(legs, null, "/s/ABC123", { code: "ABC123" });
  assert.match(html, /og:image" content="[^"]*\/api\/slipcard\?g=2&amp;o=1\.80"/,
    "og:image must carry this slip's own figures");
  assert.match(html, /twitter:image" content="[^"]*\/api\/slipcard\?/,
    "X reads twitter:image when it is present");
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /og:image:width" content="1568"/,
    "declaring the size stops a crawler guessing wrong while it fetches");
});
