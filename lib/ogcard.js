"use strict";

/**
 * The share card, rebuilt on every deploy so its figures cannot drift.
 *
 * The card used to be drawn by hand in a browser and committed as a JPEG. That
 * worked exactly once: within a day of shipping it the image said "45 leagues"
 * while the board carried 47, and the only way to notice was to look at the
 * picture. A number baked into pixels is a number nobody maintains.
 *
 * The build has no browser and no image library — this project carries zero
 * dependencies — so the card cannot be *drawn* here. It can be *composited*
 * here, which is enough:
 *
 *   assets/og-base.z     the finished card as deflated RGBA, with the digits
 *                        missing and everything else already drawn
 *   assets/og-digits.z   alpha masks for 0-9 in the two styles that carry a
 *                        number
 *   assets/og-card.json  cell size, cell positions, and each style's colour
 *
 * All this file does is lay the right digits into the right cells and encode a
 * PNG, both of which need nothing but zlib. Re-running scripts/mkogbase.js in a
 * browser is what changes the card's DESIGN; changing its NUMBERS is what
 * happens here, automatically, every build.
 *
 * Digits were baked on a fixed advance — the widest digit's width, used for all
 * ten — so "47" and "11" occupy identical space. That is what lets the words
 * around them stay baked into the background: nothing reflows, and the line
 * stays centred whatever the number is.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ASSETS = path.join(__dirname, "..", "assets");

/* Each style's slots were baked for a two-digit number. Anything else would
   either overflow the cells or leave a visible hole, so it is refused rather
   than rendered wrong — see buildCard. */
const DIGITS = 2;

let CACHE = null;
function load() {
  if (CACHE) return CACHE;
  const meta = JSON.parse(fs.readFileSync(path.join(ASSETS, "og-card.json"), "utf8"));
  const base = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "og-base.z")));
  const masks = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "og-digits.z")));

  if (base.length !== meta.w * meta.h * 4) {
    throw new Error("og-base.z is " + base.length + " bytes, expected " +
      meta.w * meta.h * 4 + " for " + meta.w + "x" + meta.h);
  }

  /* The masks arrive as one run of bytes. Each style owns ten of them, and the
     styles have different cell widths, so a style's byte offset is the total
     size of every style baked before it. */
  const order = Object.keys(meta.styles).sort((a, b) => meta.styles[a].offset - meta.styles[b].offset);
  let at = 0;
  for (const name of order) {
    const s = meta.styles[name];
    s.byteAt = at;
    s.cellBytes = s.cellW * meta.cellH;
    at += 10 * s.cellBytes;
  }
  if (at !== masks.length) {
    throw new Error("og-digits.z is " + masks.length + " bytes, expected " + at);
  }

  CACHE = { meta, base, masks };
  return CACHE;
}

function rgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* One digit, alpha-composited over whatever the background already holds. The
   masks are colourless, so the same ten bitmaps serve any style. */
function blit(px, meta, style, slot, digit) {
  const { masks } = load();
  const [x0, y0] = style.slots[slot];
  const [r, g, b] = rgb(style.color);
  const src = style.byteAt + digit * style.cellBytes;
  for (let y = 0; y < meta.cellH; y++) {
    const py = y0 + y;
    if (py < 0 || py >= meta.h) continue;
    for (let x = 0; x < style.cellW; x++) {
      const a = masks[src + y * style.cellW + x];
      if (!a) continue;
      const px2 = x0 + x;
      if (px2 < 0 || px2 >= meta.w) continue;
      const i = (py * meta.w + px2) * 4;
      const inv = 255 - a;
      px[i]     = (px[i]     * inv + r * a) / 255;
      px[i + 1] = (px[i + 1] * inv + g * a) / 255;
      px[i + 2] = (px[i + 2] * inv + b * a) / 255;
    }
  }
}

/* ------------------------------------------------------------------- PNG */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* Colour type 2 - RGB with no alpha. The card is fully opaque, so carrying an
   alpha channel would add a quarter to the size for a column of 255s. */
function encodePng(px, w, h) {
  const stride = w * 3;
  /* One filter byte per scanline, then the filtered bytes. Each row is tried
     under all five filters and the one with the smallest sum of absolute
     signed deviations is kept - the heuristic the PNG spec itself suggests,
     and worth a lot on a card that is part flat colour and part photograph. */
  const raw = Buffer.alloc((stride + 1) * h);
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride),
                Buffer.alloc(stride), Buffer.alloc(stride)];

  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = x * 3;
      cur[d] = px[s]; cur[d + 1] = px[s + 1]; cur[d + 2] = px[s + 2];
    }
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? cur[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        let v;
        if (f === 0) v = cur[i];
        else if (f === 1) v = cur[i] - a;
        else if (f === 2) v = cur[i] - b;
        else if (f === 3) v = cur[i] - ((a + b) >> 1);
        else v = cur[i] - paeth(a, b, c);
        v &= 0xff;
        out[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
    cur.copy(prev);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 2;   /* colour type: truecolour */
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ api */

/**
 * Render the card for a given pair of figures.
 *
 * Returns a PNG buffer, or null when a number will not fit the cells that were
 * baked for it. Null rather than a throw, and rather than a card with a hole in
 * it: the build should keep yesterday's card and say so, not fail the deploy
 * and not publish something wrong. A league count outside 10-99 means the feed
 * has changed shape enough to want a look anyway.
 */
/* WHATSAPP FETCHES THE PREVIEW FROM THE SENDER'S PHONE, not from a server, and
   its on-device fetcher gives up on an image every server-side crawler takes
   happily. Measured 3 Sep by sharing three otherwise identical pages:

     207KB PNG 1568x772   no preview
      87KB JPEG           preview
      87KB PNG  784x386   preview

   So it is the WEIGHT, not the format - PNG is fine at a size it will fetch.
   That mattered, because the alternative reading would have meant writing a
   JPEG encoder with no dependencies, and this project has already shipped one
   silently broken image (a bad CRC that Chrome rendered anyway) to know how
   that goes.

   The card is composited at full size so the baked glyphs stay crisp, then
   halved. An integer factor is an exact pixel mean - no resampling weights, no
   ringing on the text edges - and 784x386 is still well clear of the 300x200
   every platform wants for a large card. */
const SHRINK = 2;

function buildCard(figures) {
  const px = composite(figures);
  if (!px) return null;
  const { meta } = load();
  const small = shrink(px, meta.w, meta.h, SHRINK);
  return encodePng(small.px, small.w, small.h);
}

/* Box downscale of an RGBA buffer by an integer factor. */
function shrink(px, w, h, f) {
  if (f <= 1) return { px: px, w: w, h: h };
  const W = Math.floor(w / f), H = Math.floor(h / f);
  const out = Buffer.alloc(W * H * 4);
  const n = f * f;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < f; j++) {
        const row = (y * f + j) * w;
        for (let i = 0; i < f; i++) {
          const sIdx = (row + x * f + i) * 4;
          r += px[sIdx]; g += px[sIdx + 1]; b += px[sIdx + 2];
        }
      }
      const d = (y * W + x) * 4;
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
      out[d + 3] = 255;
    }
  }
  return { px: out, w: W, h: H };
}

/**
 * The digits laid onto a copy of the background, before encoding.
 *
 * Split out because encoding is by far the expensive half - a level-9 deflate
 * of 3.6 MB, about a second - while compositing is close to free. Tests that
 * sweep every number the card can hold use this and stay fast; the encoder is
 * orthogonal and covered on its own.
 */
function composite(figures) {
  const { meta, base } = load();

  for (const name of Object.keys(meta.styles)) {
    const v = figures[name];
    if (!Number.isInteger(v)) return null;
    if (String(v).length !== DIGITS) return null;
  }

  /* Copied only once both figures are known good, so a refusal costs nothing
     and the cached base is never touched. */
  const px = Buffer.from(base);
  for (const name of Object.keys(meta.styles)) {
    const s = String(figures[name]);
    const style = meta.styles[name];
    for (let i = 0; i < DIGITS; i++) blit(px, meta, style, i, s.charCodeAt(i) - 48);
  }
  return px;
}

/* The size of the file that SHIPS, which is the baked size divided by SHRINK.
   Reporting the baked size here would put the wrong numbers in og:image:width
   and og:image:height - and some crawlers lay the card out from those before
   fetching it, so a card that disagrees with them renders cropped or is
   dropped for being the wrong shape. */
function cardSize() {
  const { meta } = load();
  return { w: Math.floor(meta.w / SHRINK), h: Math.floor(meta.h / SHRINK) };
}

module.exports = { buildCard, composite, cardSize, encodePng, crc32, DIGITS,
  shrink, SHRINK };
