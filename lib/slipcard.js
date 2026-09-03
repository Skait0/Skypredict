"use strict";

/**
 * The link-preview card for a shared slip, composited per request.
 *
 * A slip's card has to carry that slip's numbers, so it cannot be a file on
 * disk the way the site card is. It also cannot be DRAWN here: this project
 * carries zero dependencies, and the build has no browser and no image
 * library. What it can do is composite - lay glyph bitmaps into cells that
 * were prepared for them and encode a PNG, both reachable with zlib alone.
 *
 * scripts/mkslipcard.js bakes the parts, once, in a browser:
 *
 *   assets/slip-base.z     the finished card as deflated RGBA, with the two
 *                          number blocks left empty and everything else -
 *                          the round-cropped wizard head, the wordmark, the
 *                          labels, the line about the record - already drawn
 *   assets/slip-glyphs.z   alpha masks for 0-9 and "." in both number styles
 *   assets/slip-card.json  cell size, the cells of each block, and the colour
 *                          each style is drawn in
 *
 * WHY THE FIGURES ARE LAID OUT RATHER THAN SLOTTED.
 *
 * The site card carries two-digit figures inside a sentence, so it can put
 * every digit on the widest digit's advance and let the words around them stay
 * baked. Copying that here looked wrong the moment a decimal appeared: on a
 * full-width cell a decimal point is mostly empty space, and "3.81" rendered
 * as "3 . 81". "1318" was airy for the same reason, "1" being little more than
 * half the width of "0".
 *
 * So each glyph is placed on its OWN advance, and the string is centred about
 * the block's centre. The masks are still baked in identical cells - only
 * where they are put changed - so the compositor offsets each one by half the
 * difference between the cell and the glyph. The labels are baked centred
 * under the block, which is what lets "3.81" and "20796" both sit right.
 *
 * Anything that will not fit is refused rather than drawn wrong - see build().
 * A missing card is a link without a picture; a card with a number running off
 * the edge of it is worse, and it is the kind of thing nobody notices until it
 * is on somebody else's timeline.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* The PNG encoder is the site card's - one implementation, one place for a
   bug in it to be. */
const { encodePng } = require("./ogcard.js");

const ASSETS = path.join(__dirname, "..", "assets");

let CACHE = null;
function load() {
  if (CACHE) return CACHE;
  const meta = JSON.parse(fs.readFileSync(path.join(ASSETS, "slip-card.json"), "utf8"));
  const base = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "slip-base.z")));
  const glyphs = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "slip-glyphs.z")));
  CACHE = { meta, base, glyphs };
  return CACHE;
}

function rgb(hex) {
  const h = String(hex).replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* One glyph, at one pen position, in one style's colour.
 *
 * `penX` is where this glyph's advance begins. The mask is centred in a cell
 * wider than the glyph, so the cell is drawn half the surplus to the left of
 * the pen. The mask's baseline sits at 72% of cell height.
 *
 * Alpha-composited rather than written flat: these are antialiased edges over
 * a shaded ground, and writing the colour straight in would leave every figure
 * with a hard fringe. */
function blit(px, C, styleIdx, glyphIdx, penX, advance) {
  const { meta, glyphs } = C;
  const cw = meta.cell.w, ch = meta.cell.h;
  const per = cw * ch;
  const off = (styleIdx * meta.glyphs.length + glyphIdx) * per;
  const [r, g, b] = rgb(meta.styles[styleIdx].color);
  const top = Math.round(meta.baseline - ch * 0.72);
  const cellX = Math.round(penX - (cw - advance) / 2);

  for (let y = 0; y < ch; y++) {
    const py = top + y;
    if (py < 0 || py >= meta.h) continue;
    for (let x = 0; x < cw; x++) {
      const a = glyphs[off + y * cw + x];
      if (!a) continue;
      const pxX = cellX + x;
      if (pxX < 0 || pxX >= meta.w) continue;
      const i = (py * meta.w + pxX) * 4;
      const k = a / 255;
      px[i]     = Math.round(px[i]     * (1 - k) + r * k);
      px[i + 1] = Math.round(px[i + 1] * (1 - k) + g * k);
      px[i + 2] = Math.round(px[i + 2] * (1 - k) + b * k);
      px[i + 3] = 255;
    }
  }
}

/* How a figure is written on the card.
 *
 * Games is a plain count. Odds keeps two decimals while it is small enough for
 * them to mean anything and drops them once it is not: "3.81" is a different
 * bet from "3.79", but nobody reads "20796.43" as more informative than
 * "20796", and the decimals would cost two of the six cells. */
function oddsText(odds) {
  const n = Number(odds);
  if (!isFinite(n) || n <= 1) return null;
  return n >= 1000 ? String(Math.round(n)) : n.toFixed(2);
}

/* The width a figure will occupy, or null when a glyph is not in the baked
   set - which would otherwise leave a hole where a character should be. */
function textWidth(C, s) {
  let w = 0;
  for (const ch of s) {
    const a = C.meta.advances[ch];
    if (a == null) return null;
    w += a;
  }
  return w;
}

/**
 * The card for a slip, as a PNG buffer, or null when it cannot be drawn
 * correctly. Callers fall back to the static site card rather than serving
 * something wrong.
 */
/* Built cards, by the two numbers that decide them.
 *
 * Compositing and deflating 1568x772 costs about 1.3 seconds, which is fine
 * once and wasteful three times - and crawlers fetch a preview in bursts, X
 * and WhatsApp and the sender's own client all pulling the same URL within
 * seconds of a link being posted. The edge cache catches most of it; this
 * catches the rest, for as long as the container lives.
 *
 * Small on purpose: a handful of slips are being shared at any moment, and a
 * card is 130 KB. */
const MEMO = new Map();
const MEMO_MAX = 12;

function build(games, odds) {
  const key = String(games) + "|" + String(odds);
  if (MEMO.has(key)) return MEMO.get(key);
  const out = draw(games, odds);
  if (MEMO.size >= MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  MEMO.set(key, out);
  return out;
}

function draw(games, odds) {
  const C = load();
  const g = Number(games);
  if (!isFinite(g) || g < 1 || g > 99) return null;

  const gs = String(Math.round(g));
  const os = oddsText(odds);
  if (!os) return null;

  /* Every glyph has to exist in the baked set, or a hole appears where a
     character was. textWidth returns null when one does not. */
  const gw = textWidth(C, gs), ow = textWidth(C, os);
  if (gw == null || ow == null) return null;

  /* Refused rather than drawn over its own label. */
  if (gw > C.meta.widths.games || ow > C.meta.widths.odds) return null;

  const px = Buffer.from(C.base);          /* a copy: the base is reused */
  const run = (s, styleIdx, centre, width) => {
    let pen = centre - width / 2;
    for (const ch of s) {
      const a = C.meta.advances[ch];
      blit(px, C, styleIdx, C.meta.glyphs.indexOf(ch), pen, a);
      pen += a;
    }
  };
  run(gs, 0, C.meta.centres.games, gw);
  run(os, 1, C.meta.centres.odds, ow);
  return encodePng(px, C.meta.w, C.meta.h);
}

function cardSize() {
  const C = load();
  return { w: C.meta.w, h: C.meta.h };
}

module.exports = { build, oddsText, textWidth, cardSize };
