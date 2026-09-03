"use strict";

/**
 * The slip card, checked on the pixels it actually draws.
 *
 * test/slipcard.test.js has thirteen tests and none of them renders anything.
 * They assert on the baked advances in assets/slip-card.json and on textWidth,
 * which is the DATA and the WIDTH HELPER - the inputs to the layout, not the
 * layout. Mutation-tested 3 Sep: changing `pen += a` to `pen += 0` in the blit
 * loop, so every glyph is drawn at the same x and the figures collapse into an
 * overlapping smear, survives all thirteen.
 *
 * That is the exact bug the per-glyph advance exists to prevent - the first
 * version put every digit on the widest digit's advance and rendered "3.81" as
 * "3 . 81" - and nothing was watching the one place it can go wrong.
 *
 * So this renders and measures ink. The base image is available raw
 * (assets/slip-base.z inflates to RGBA), so "ink" is any pixel the render
 * changed, and the PNG is decoded rather than trusted: the encoder picks a
 * filter per scanline, so the bytes cannot be read without undoing them.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CARD = require("../lib/slipcard.js");
const ASSETS = path.join(__dirname, "..", "assets");
const META = JSON.parse(fs.readFileSync(path.join(ASSETS, "slip-card.json"), "utf8"));
const BASE = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "slip-base.z")));

/* ------------------------------------------------------------ PNG decoding */

/* Minimal decoder for what encodePng emits: 8-bit truecolour, no interlace,
   one filter byte per scanline. Written out rather than eyeballed because a
   decoder that quietly returns the wrong pixels would make every assertion
   below meaningless while they all still passed. */
function decodePng(buf) {
  assert.ok(buf && buf.length > 8, "no PNG produced");
  assert.strictEqual(buf.readUInt32BE(0), 0x89504e47, "not a PNG");
  let off = 8, w = 0, h = 0, bitDepth = 0, colour = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  assert.strictEqual(bitDepth, 8, "expected 8-bit samples");
  assert.strictEqual(colour, 2, "expected truecolour RGB");
  assert.strictEqual(interlace, 0, "expected no interlacing");

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 3, stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, up = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[up + i] : 0;
      const c = (i >= bpp && y > 0) ? out[up + i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) v = x + paeth(a, b, c);
      else assert.fail("unknown PNG filter " + f + " on row " + y);
      out[dst + i] = v & 0xff;
    }
  }
  return { w, h, px: out };
}

/* Columns the render changed, inside one block of the card. The base is RGBA
   and the render is RGB, so they are compared channel by channel. */
function inkColumns(img, x0, x1) {
  const cols = [];
  for (let x = x0; x < x1; x++) {
    let touched = false;
    for (let y = 0; y < img.h && !touched; y++) {
      const d = (y * img.w + x) * 3, s = (y * img.w + x) * 4;
      if (Math.abs(img.px[d] - BASE[s]) > 8 ||
          Math.abs(img.px[d + 1] - BASE[s + 1]) > 8 ||
          Math.abs(img.px[d + 2] - BASE[s + 2]) > 8) touched = true;
    }
    if (touched) cols.push(x);
  }
  return cols;
}
const span = (cols) => (cols.length ? cols[cols.length - 1] - cols[0] + 1 : 0);

/* The games block, generously bounded - the figure is centred in it. */
const GX0 = META.centres.games - META.widths.games,
      GX1 = META.centres.games + META.widths.games;

function render(games, odds) {
  const png = CARD.build(games, odds);
  assert.ok(png, "build returned nothing for " + games + " / " + odds);
  return decodePng(png);
}

/* ------------------------------------------------------------- the layout */

test("the decoder agrees with the card it is reading", () => {
  /* If this drifts from encodePng every measurement below is fiction. */
  const img = render(2, 3.81);
  assert.strictEqual(img.w, META.w);
  assert.strictEqual(img.h, META.h);
  assert.ok(inkColumns(img, GX0, GX1).length > 0,
    "a rendered figure must change some pixels, or nothing here measures anything");
});

test("a second digit is drawn beside the first, not on top of it", () => {
  /* THE ONE THAT `pen += 0` FAILS. Two digits must occupy about twice the
     width of one. Drawn at the same pen they collapse onto a single glyph and
     the span stays one digit wide. */
  const one = span(inkColumns(render(1, 3.81), GX0, GX1));
  const two = span(inkColumns(render(11, 3.81), GX0, GX1));
  assert.ok(one > 0 && two > 0, "both figures must draw something");
  assert.ok(two > one * 1.6,
    "'11' spans " + two + "px against '1' at " + one + "px - the second digit " +
    "is being drawn over the first rather than after it");
});

test("each glyph sits on its own advance, not a shared one", () => {
  /* "11" and "10" differ only in a digit whose advance differs: 1 is 55 and 0
     is 92. On one shared advance both figures would span the same width. */
  const ones = span(inkColumns(render(11, 3.81), GX0, GX1));
  const tens = span(inkColumns(render(10, 3.81), GX0, GX1));
  assert.ok(tens > ones,
    "'10' spans " + tens + "px and '11' spans " + ones + "px; a zero is wider " +
    "than a one, so these must differ");
});

test("the figure stays centred on the point it was baked for", () => {
  /* What lets a narrow figure and a wide one sit under one baked label. */
  for (const g of [1, 7, 11, 40]) {
    const cols = inkColumns(render(g, 3.81), GX0, GX1);
    const mid = (cols[0] + cols[cols.length - 1]) / 2;
    assert.ok(Math.abs(mid - META.centres.games) <= 6,
      "games=" + g + " centres its ink at " + Math.round(mid) +
      ", not " + META.centres.games);
  }
});

test("a wider figure grows both ways, rather than running off one end", () => {
  const narrow = inkColumns(render(1, 3.81), GX0, GX1);
  const wide = inkColumns(render(40, 3.81), GX0, GX1);
  assert.ok(wide[0] < narrow[0], "the wider figure must start further left");
  assert.ok(wide[wide.length - 1] > narrow[narrow.length - 1],
    "and end further right");
});

test("the odds block draws its own figure, independently", () => {
  const OX0 = META.centres.odds - META.widths.odds / 2,
        OX1 = META.centres.odds + META.widths.odds / 2;
  const a = span(inkColumns(render(2, 3.81), OX0, OX1));
  const b = span(inkColumns(render(2, 20796), OX0, OX1));
  assert.ok(a > 0 && b > 0, "both odds must draw");
  assert.ok(b > a, "x20796 must span more than x3.81, got " + b + " vs " + a);
});
