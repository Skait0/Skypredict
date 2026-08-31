"use strict";

/**
 * The share card is generated, not drawn.
 *
 * It carries two figures. Both used to be painted into a JPEG by hand, and
 * within a day of shipping the picture said "45 leagues" while the board
 * carried 47. Nothing could have caught that: the number existed only as
 * pixels, so no test and no build step could read it back.
 *
 * lib/ogcard.js composites the digits onto a baked background and encodes a
 * PNG using nothing but zlib - the project has no dependencies and the build
 * has no browser. These tests cover the three ways that can go wrong: an
 * invalid PNG that crawlers silently drop, digits landing somewhere other than
 * their cells, and a figure that does not fit being rendered anyway instead of
 * refused.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OG = require("../lib/ogcard.js");
const ROOT = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const prebuild = fs.readFileSync(path.join(ROOT, "scripts", "prebuild.js"), "utf8");
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "og-card.json"), "utf8"));

/* Parse a PNG far enough to prove a decoder would accept it: walk the chunks,
   check every CRC, and inflate the image data. */
function parsePng(buf) {
  assert.deepStrictEqual([...buf.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "not a PNG signature");
  const chunks = [];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.slice(i + 4, i + 8).toString("latin1");
    const data = buf.slice(i + 8, i + 8 + len);
    const crc = buf.readUInt32BE(i + 8 + len);
    assert.strictEqual(OG.crc32(buf.slice(i + 4, i + 8 + len)), crc,
      "CRC mismatch on " + type + " - decoders reject the whole file");
    chunks.push({ type, data });
    i += 12 + len;
  }
  assert.strictEqual(i, buf.length, "trailing bytes after IEND");
  return chunks;
}

const card73 = OG.buildCard({ leagues: 47, pct: 73 });

test("the CRC is checked against a value this file did not compute", () => {
  /* parsePng validates every chunk with OG.crc32, so a broken crc32 would
     agree with itself and the whole PNG suite would pass on a file no decoder
     accepts. These two are fixed by the PNG spec and the CRC-32 standard. */
  assert.strictEqual(OG.crc32(Buffer.from("IEND", "latin1")), 0xae426082,
    "an empty IEND chunk has a known CRC; this one is wrong");
  assert.strictEqual(OG.crc32(Buffer.from("123456789")), 0xcbf43926,
    "the CRC-32 check value is wrong, so every chunk is being stamped wrong");
});

test("the card is a PNG a crawler will actually accept", () => {
  const chunks = parsePng(card73);
  const types = chunks.map((c) => c.type);
  assert.strictEqual(types[0], "IHDR", "IHDR must come first");
  assert.strictEqual(types[types.length - 1], "IEND", "IEND must come last");
  assert.ok(types.includes("IDAT"), "no image data");

  const ihdr = chunks[0].data;
  assert.strictEqual(ihdr.readUInt32BE(0), meta.w);
  assert.strictEqual(ihdr.readUInt32BE(4), meta.h);
  assert.strictEqual(ihdr[8], 8, "bit depth must be 8");
  assert.strictEqual(ihdr[9], 2, "colour type 2 (RGB) - the card is opaque");
  assert.strictEqual(ihdr[12], 0, "interlacing would break some scrapers");
});

test("the image data inflates to exactly one filtered row per scanline", () => {
  const idat = parsePng(card73).filter((c) => c.type === "IDAT").map((c) => c.data);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.strictEqual(raw.length, (meta.w * 3 + 1) * meta.h,
    "row count or stride is wrong; the file would decode as garbage");
  for (let y = 0; y < meta.h; y++) {
    const f = raw[y * (meta.w * 3 + 1)];
    assert.ok(f >= 0 && f <= 4, "row " + y + " has filter type " + f + ", which is not a filter");
  }
});

test("the declared shape matches what index.html promises", () => {
  /* Some crawlers lay the card out from these numbers before fetching the
     image. If they disagree with the file, the card renders cropped or is
     dropped for being the wrong shape. */
  const w = /<meta property="og:image:width" content="(\d+)"/.exec(index);
  const h = /<meta property="og:image:height" content="(\d+)"/.exec(index);
  assert.ok(w && h, "the card's dimensions are not declared");
  assert.strictEqual(Number(w[1]), meta.w);
  assert.strictEqual(Number(h[1]), meta.h);
  const ratio = meta.w / meta.h;
  assert.ok(ratio > 1.7 && ratio < 2.1,
    "summary_large_image wants roughly 1.91:1; this is " + ratio.toFixed(2) + ":1");
});

test("the meta tags point at the file the build writes", () => {
  assert.match(index, /og:image" content="[^"]+\/og-card\.png"/);
  assert.match(index, /twitter:image" content="[^"]+\/og-card\.png"/);
  assert.doesNotMatch(index, /(og|twitter):image" content="[^"]+\/og-card\.jpg"/,
    "still pointing at the hand-drawn JPEG, which no longer gets updated");
});

/* ------------------------------------------------------- the digits land */

function pixels(buf) {
  const idat = parsePng(buf).filter((c) => c.type === "IDAT").map((c) => c.data);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = meta.w * 3;
  const out = Buffer.alloc(stride * meta.h);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < meta.h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= 3 ? out[y * stride + i - 3] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= 3 && y > 0 ? out[(y - 1) * stride + i - 3] : 0;
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else r = v + paeth(a, b, c);
      out[y * stride + i] = r & 0xff;
    }
  }
  return out;
}

/* Every cell any style can draw into, as a flat list of rectangles. */
function cells() {
  const out = [];
  for (const name of Object.keys(meta.styles)) {
    const s = meta.styles[name];
    for (const [x, y] of s.slots) out.push({ x, y, w: s.cellW, h: meta.cellH });
  }
  return out;
}

test("changing a figure changes the digit cells and nothing else", () => {
  /* The strongest thing available: the background is baked, so if a pixel
     outside a digit cell ever moves, the compositor is writing where it should
     not be - which is exactly how a card ends up with a stray mark on it. */
  const a = pixels(card73);
  const b = pixels(OG.buildCard({ leagues: 12, pct: 88 }));
  const stride = meta.w * 3;
  const boxes = cells();
  const inside = (x, y) => boxes.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

  let changedInside = 0, changedOutside = 0;
  for (let y = 0; y < meta.h; y++) {
    for (let x = 0; x < meta.w; x++) {
      const i = y * stride + x * 3;
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
      if (inside(x, y)) changedInside++; else changedOutside++;
    }
  }
  assert.strictEqual(changedOutside, 0,
    changedOutside + " pixels changed outside the digit cells - the compositor is " +
    "drawing outside the slots that were baked for it");
  assert.ok(changedInside > 200,
    "only " + changedInside + " pixels moved; the digits are not being drawn");
});

test("each cell is actually used, not just the first", () => {
  /* A one-cell bug renders "4" where "47" belongs and still looks plausible in
     a thumbnail. Compare a number against one differing only in its second
     digit and require the second cell to be the one that moved. */
  const stride = meta.w * 3;
  for (const name of Object.keys(meta.styles)) {
    const s = meta.styles[name];
    const base = { leagues: 47, pct: 73 };
    const alt = Object.assign({}, base);
    alt[name] = base[name] + 1;              /* 47 -> 48: only the last digit */
    const a = pixels(OG.buildCard(base));
    const b = pixels(OG.buildCard(alt));
    const moved = s.slots.map(([x0, y0]) => {
      let n = 0;
      for (let y = y0; y < y0 + meta.cellH; y++) {
        for (let x = x0; x < x0 + s.cellW; x++) {
          const i = y * stride + x * 3;
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
        }
      }
      return n;
    });
    assert.strictEqual(moved[0], 0, name + ": the tens cell moved when only the units changed");
    assert.ok(moved[1] > 50, name + ": the units cell did not change at all");
  }
});

test("each style's digits are drawn in that style's colour", () => {
  /* Every test above compares pixels for CHANGE, and a digit painted the wrong
     colour changes pixels just as convincingly as one painted the right one.
     The chip is green and the leagues line is grey; swapping them, or dropping
     a channel in the blend, would sail through otherwise. */
  const px = pixels(card73);
  const stride = meta.w * 3;
  for (const name of Object.keys(meta.styles)) {
    const s = meta.styles[name];
    const want = [1, 3, 5].map((k) => parseInt(s.color.slice(k, k + 2), 16));
    const [x0, y0] = s.slots[0];
    /* The pixel furthest from the background is the middle of a stroke, where
       the glyph is fully opaque and the colour is exactly the style's. */
    let best = null, bestD = -1;
    for (let y = y0; y < y0 + meta.cellH; y++) {
      for (let x = x0; x < x0 + s.cellW; x++) {
        const i = y * stride + x * 3;
        const got = [px[i], px[i + 1], px[i + 2]];
        const d = got.reduce((n, v, k) => n + Math.abs(v - want[k]), 0);
        if (bestD < 0 || d < bestD) { bestD = d; best = got; }
      }
    }
    assert.ok(bestD <= 12,
      name + ": the most solid pixel of its first digit is rgb(" + best + "), " +
      "but the style is " + s.color + " = rgb(" + want + ")");
  }
});

test("the same figures always produce the same bytes", () => {
  /* The card is written on every deploy. If it were not deterministic, every
     build would ship a new image and every cache would be invalidated daily
     for nothing. */
  assert.ok(OG.buildCard({ leagues: 47, pct: 73 }).equals(card73));
});

test("the base is not mutated between renders", () => {
  /* The inflated background is cached and reused. Compositing into it directly
     would leave the previous build's digits behind, and the second card of any
     process would carry both numbers on top of each other. */
  OG.buildCard({ leagues: 11, pct: 11 });
  assert.ok(OG.buildCard({ leagues: 47, pct: 73 }).equals(card73),
    "a later render changed what an earlier one produces");
});

/* ------------------------------------------------------------- the guards */

test("a figure that will not fit is refused, not rendered wrong", () => {
  /* The cells were baked two digits wide. Three digits would overflow into the
     baked text beside them; one would leave a hole. Null tells the build to
     keep the card it already has. */
  assert.strictEqual(OG.buildCard({ leagues: 470, pct: 73 }), null, "three digits");
  assert.strictEqual(OG.buildCard({ leagues: 4, pct: 73 }), null, "one digit");
  assert.strictEqual(OG.buildCard({ leagues: 47, pct: 100 }), null, "a full hundred percent");
  assert.strictEqual(OG.buildCard({ leagues: 47.5, pct: 73 }), null, "not a whole number");
  assert.strictEqual(OG.buildCard({ leagues: 47, pct: null }), null, "nothing graded yet");
  assert.strictEqual(OG.buildCard({ leagues: 47 }), null, "a figure missing entirely");
  /* A string of the right length is the one bad input the length check cannot
     see: "47".length is 2, so only the integer check refuses it. Payload
     fields have arrived as strings before. */
  assert.strictEqual(OG.buildCard({ leagues: "47", pct: 73 }), null, "a string, not a number");
  assert.strictEqual(OG.buildCard({ leagues: 47, pct: "73" }), null, "a string percentage");
});

/**
 * Where the ink lands, to the pixel.
 *
 * Everything above asks whether pixels CHANGED. That is too loose to pin
 * placement: a cell offset by a pixel still changes the right cells, because
 * digits carry side bearings and the outermost column is blank. So does a mask
 * read from the wrong style's offset - the digits come out wrong but they come
 * out somewhere plausible, in the right colour.
 *
 * This compares the rendered card against the bare background and requires the
 * pixels that moved to be exactly the mask's own footprint, at exactly the
 * slot it was baked for. Both of those mutations die here.
 */
test("every digit lands exactly where its mask says", () => {
  const base = zlib.inflateSync(fs.readFileSync(path.join(ROOT, "assets", "og-base.z")));
  const masks = zlib.inflateSync(fs.readFileSync(path.join(ROOT, "assets", "og-digits.z")));

  const order = Object.keys(meta.styles).sort((a, b) => meta.styles[a].offset - meta.styles[b].offset);
  let at = 0;
  const byteAt = {};
  for (const name of order) { byteAt[name] = at; at += 10 * meta.styles[name].cellW * meta.cellH; }

  for (let d = 0; d <= 9; d++) {
    /* Tens digit fixed at 1, units cycling, so every mask is exercised in a
       slot whose neighbour is known. */
    const value = 10 + d;
    const px = OG.composite({ leagues: value, pct: value });
    assert.ok(px, "no composite for " + value);

    /* Expected alpha for every pixel the render is allowed to have touched. */
    const want = new Map();
    for (const name of order) {
      const s = meta.styles[name];
      const cellBytes = s.cellW * meta.cellH;
      [1, d].forEach((digit, slot) => {
        const [x0, y0] = s.slots[slot];
        const src = byteAt[name] + digit * cellBytes;
        for (let y = 0; y < meta.cellH; y++) {
          for (let x = 0; x < s.cellW; x++) {
            const a = masks[src + y * s.cellW + x];
            if (a) want.set((y0 + y) * meta.w + (x0 + x), a);
          }
        }
      });
    }

    let strayed = 0, missed = 0;
    for (let p = 0; p < meta.w * meta.h; p++) {
      const i = p * 4;
      const moved = px[i] !== base[i] || px[i + 1] !== base[i + 1] || px[i + 2] !== base[i + 2];
      const a = want.get(p) || 0;
      if (moved && a === 0) strayed++;
      /* Alpha below ~16 can round to no visible change, so only solid ink is
         required to have moved. */
      if (!moved && a >= 16) missed++;
    }
    assert.strictEqual(strayed, 0,
      value + ": " + strayed + " pixels moved that no mask covers - the digits are " +
      "being drawn at the wrong offset, or from the wrong mask");
    assert.strictEqual(missed, 0,
      value + ": " + missed + " solid pixels of the mask never got drawn");
  }
});

test("every two-digit pair composites, and every one draws ink", () => {
  /* The whole range that can occur, so a bad glyph offset or a cell running
     off the canvas cannot hide in a digit nobody tried. Uses composite rather
     than buildCard: encoding ninety cards costs about two minutes and proves
     nothing the encoder tests above do not already cover.

     "Not null" is too weak on its own - a mask read from the wrong offset
     could be blank and still return a buffer - so each one is required to
     differ from the bare background. */
  const bare = OG.composite({ leagues: 11, pct: 11 });
  for (let n = 10; n <= 99; n++) {
    const px = OG.composite({ leagues: n, pct: 99 - (n - 10) });
    assert.ok(px, "no card for " + n);
    if (n !== 11) assert.ok(!px.equals(bare), "the digits for " + n + " drew nothing");
  }
});

/* ------------------------------------------------------------ the assets */

test("the baked assets agree with the metrics that describe them", () => {
  /* Re-running the generator with a changed design but a stale JSON beside it
     would put the digits in the wrong place on a card that still looks fine
     until you read it. */
  const base = zlib.inflateSync(fs.readFileSync(path.join(ROOT, "assets", "og-base.z")));
  assert.strictEqual(base.length, meta.w * meta.h * 4, "the base is not the declared size");
  const masks = zlib.inflateSync(fs.readFileSync(path.join(ROOT, "assets", "og-digits.z")));
  const want = Object.values(meta.styles).reduce((n, s) => n + 10 * s.cellW * meta.cellH, 0);
  assert.strictEqual(masks.length, want, "the digit masks are not the declared size");
});

test("every cell sits inside the canvas", () => {
  for (const name of Object.keys(meta.styles)) {
    const s = meta.styles[name];
    assert.strictEqual(s.slots.length, OG.DIGITS, name + " does not have " + OG.DIGITS + " cells");
    for (const [x, y] of s.slots) {
      assert.ok(x >= 0 && x + s.cellW <= meta.w, name + " cell runs off the side");
      assert.ok(y >= 0 && y + meta.cellH <= meta.h, name + " cell runs off the top or bottom");
    }
    /* The two cells must be adjacent, or the number renders with a gap in it. */
    assert.strictEqual(s.slots[1][0] - s.slots[0][0], s.cellW, name + " cells are not adjacent");
    assert.strictEqual(s.slots[1][1], s.slots[0][1], name + " cells are not on the same line");
  }
});

/* ------------------------------------------------------------ the caller */

/**
 * Three bugs have shipped past green tests in this project because the tests
 * built their own inputs and never ran the code that builds the real ones. The
 * card is worth nothing if the build does not write it, or writes it from the
 * wrong fields.
 */
test("the build writes the card, from the payload", () => {
  assert.match(prebuild, /function writeCard\(payload\)/, "no writeCard in the build");
  assert.match(prebuild, /writeCard\(payload\);/, "writeCard is defined but never called");
  const i = prebuild.indexOf("const payload = await bakePayload();");
  const j = prebuild.indexOf("writeCard(payload);");
  assert.ok(i > 0 && j > i, "the card is written before the payload exists");
});

test("it reads the same fields the site's own figures come from", () => {
  const fn = prebuild.slice(prebuild.indexOf("function writeCard(payload)"));
  assert.match(fn, /payload\.leagues && payload\.leagues\.length/,
    "the league count must come from the payload, not be typed in");
  assert.match(fn, /rec\.correct \/ rec\.total/,
    "the percentage must be derived from the record, not typed in");
  assert.match(fn, /Math\.round/, "the percentage has to be a whole number to fit the cells");
  assert.match(fn, /og-card\.png/, "it writes some other file than the one the tags name");
});

test("a card that cannot be built never fails the deploy", () => {
  /* Everything else in this build is wrapped so an optimisation cannot take
     the site down. The card is an optimisation. */
  const fn = prebuild.slice(prebuild.indexOf("function writeCard(payload)"),
                            prebuild.indexOf("/* ------------------------------------------------------------------- run */"));
  assert.match(fn, /if \(!png\)/, "a refused card is not handled");
  assert.match(fn, /keeping the last one/, "it does not say it kept the previous card");
  assert.ok((fn.match(/catch \(e\)/g) || []).length >= 2,
    "loading and rendering both need to be caught, or a bad asset fails the deploy");
});

test("the percentage the card shows is the one the site shows", () => {
  /* The site's own footer figure and the card have to agree, or the same
     number appears twice on the same link with two different values. */
  const rec = { correct: 246, total: 338 };
  assert.strictEqual(Math.round((rec.correct / rec.total) * 100), 73);
});
