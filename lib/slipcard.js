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

/* Two card sets share this compositor: "slip" (the shared-slip preview) and "win"
   (the won-slip banner, one base per wizard rank - scripts/mkwincard.js). */
const CACHE = new Map();
function load(set, variant) {
  const s = set || "slip";
  const key = s + "|" + (variant || "");
  if (CACHE.has(key)) return CACHE.get(key);
  const meta = JSON.parse(fs.readFileSync(path.join(ASSETS, s + "-card.json"), "utf8"));
  const base = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, s + "-base" + (variant ? "-" + variant : "") + ".z")));
  /* "win-list" draws its figures with the short banner's glyphs (meta.glyphset)
     and its picks with a text atlas of its own (meta.text). */
  const glyphs = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, (meta.glyphset || s) + "-glyphs.z")));
  const text = meta.text ? zlib.inflateSync(fs.readFileSync(path.join(ASSETS, (meta.glyphset || s) + "-text.z"))) : null;
  const C = { meta, base, glyphs, text };
  CACHE.set(key, C);
  return C;
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
  const off = (styleIdx * meta.glyphs.length + glyphIdx) * cw * ch;
  const top = Math.round(meta.baseline - ch * 0.72);
  const cellX = Math.round(penX - (cw - advance) / 2);
  paint(px, meta, glyphs, off, cw, ch, cellX, top, rgb(meta.styles[styleIdx].color));
}

/* One mask (cw x ch, at `off` in `masks`) laid onto the card at (left, top) in one
   colour - the alpha composite blit() does for figures, shared with the list
   banner's text and row icons. */
function paint(px, meta, masks, off, cw, ch, left, top, [r, g, b]) {
  for (let y = 0; y < ch; y++) {
    const py = top + y;
    if (py < 0 || py >= meta.h) continue;
    for (let x = 0; x < cw; x++) {
      const a = masks[off + y * cw + x];
      if (!a) continue;
      const pxX = left + x;
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

function draw(games, odds, set, variant) {
  const C = load(set, variant);
  const px = figures(C, games, odds, set === "win");
  return px && encodePng(px, C.meta.w, C.meta.h);
}

/* The base with both figures laid in, as raw RGBA, or null when they cannot be
   drawn - shared by the cards and both win banners. */
function figures(C, games, odds, win) {
  const g = Number(games);
  if (!isFinite(g) || g < 1 || g > 99) return null;

  const gs = String(Math.round(g));
  const ot = oddsText(odds);
  if (!ot) return null;
  const os = win ? "×" + ot : ot;

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
  return px;
}

/* The won-slip banner for one wizard rank (lib/winpost.js rankOf). Null for a rank
   that was not baked, or figures that will not fit - the caller posts text only. */
function buildWin(rank, games, odds) {
  const ranks = load("win", "sorcerer").meta.ranks || [];
  if (!ranks.includes(rank)) return null;
  const key = "win|" + rank + "|" + games + "|" + odds;
  if (MEMO.has(key)) return MEMO.get(key);
  const out = draw(games, odds, "win", rank);
  if (MEMO.size >= MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  MEMO.set(key, out);
  return out;
}

/* THE LIST BANNER (owner, 12 Oct 2026: the win banner lists the games on the slip).
 *
 * The short banner's top half on a taller base (scripts/mkwincard.js), with up to
 * eight picks under it, each a green tick and a line of cream text. The text atlas
 * holds printable ASCII and "…" only, so a pick is folded to ASCII first. */

/* Letters NFD cannot split into a base and a mark ("Bodø/Glimt", "Łódź"). Dropping
   them would leave "Bod/Glimt", so they get their usual Latin spelling. */
const FOLD = { "ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ß": "ss",
  "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ð": "d", "þ": "th", "ı": "i" };

/* A pick as the atlas can draw it: diacritics stripped, curly quotes and dashes
   made straight, anything else outside ASCII dropped, spaces collapsed. */
function asciiPick(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’‚‛′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-").replace(/…/g, "...")
    .replace(/[^\x00-\x7f]/g, (c) => FOLD[c] || (/\s/.test(c) ? " " : ""))
    .replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
}

/* Pen width of a string in the atlas; every character in it must be in the atlas. */
function textRun(T, s) {
  let w = 0;
  for (const ch of s) w += T.advances[T.chars.indexOf(ch)];
  return w;
}

/* What each row will say, before anything is drawn - the layout on its own, so it
 * can be checked without decoding pixels.
 *
 * Eight rows. More picks than that: seven, and the eighth says how many more, muted
 * - the same rule as the Telegram caption. A pick too long for its row is cut at
 * the last character that leaves room for "…". */
function listRows(picks) {
  const M = load("win-list", "sorcerer").meta, T = M.text, rows = M.rows;
  /* A pick is a string, or { text, push } for a leg that pushed: drawn muted, no tick. */
  const all = (picks || []).map((p) => (p && typeof p === "object" ? { s: asciiPick(p.text) + (p.push ? " (voided)" : ""), push: !!p.push } : { s: asciiPick(p), push: false }))
    .filter((p) => p.s);
  const shown = all.length > rows.length ? all.slice(0, rows.length - 1) : all;
  const out = shown.map((p, i) => {
    const max = rows[i].w, s = p.s;
    if (textRun(T, s) <= max) return { text: s, muted: p.push };
    const ell = textRun(T, "…");
    let cut = s;
    while (cut && textRun(T, cut.trimEnd()) + ell > max) cut = cut.slice(0, -1);
    return { text: cut.trimEnd() + "…", muted: p.push };
  });
  if (all.length > shown.length) out.push({ text: "and " + (all.length - shown.length) + " more", muted: true });
  return out;
}

/* The list banner as a PNG, or null - for a rank that was not baked or figures
   that will not fit, as buildWin. Memoised on everything that changes the picture. */
/* The green line under the odds is baked as "TOTAL ODDS · EVERY LEG WON". A slip with
   pushes did not win every leg (owner, 18 Oct 2026), so `label` repaints that strip:
   the background is filled back in column by column, blending the pixel rows just
   above and below it (the base is a smooth gradient there), then the label is written
   in the row atlas, which is the same 700 34px face, centred under the odds. */
const LABEL_TOP = 526, LABEL_BOTTOM = 576, LABEL_HALF = 345;
function relabel(px, M, C, label) {
  const T = M.text, cw = T.cell.w, ch = T.cell.h, cx = M.centres.odds;
  const x0 = Math.max(0, cx - LABEL_HALF), x1 = Math.min(M.w - 1, cx + LABEL_HALF);
  for (let x = x0; x <= x1; x++) {
    const a = ((LABEL_TOP - 1) * M.w + x) * 4, b = ((LABEL_BOTTOM + 1) * M.w + x) * 4;
    for (let y = LABEL_TOP; y <= LABEL_BOTTOM; y++) {
      const k = (y - LABEL_TOP + 1) / (LABEL_BOTTOM - LABEL_TOP + 2), i = (y * M.w + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[a + c] * (1 - k) + px[b + c] * k);
      px[i + 3] = 255;
    }
  }
  const text = asciiPick(label).toUpperCase(), colour = rgb(T.colors.disc);
  let pen = cx - textRun(T, text) / 2;
  for (const c of text) {
    const gi = T.chars.indexOf(c);
    if (gi < 0) continue;
    paint(px, M, C.text, gi * cw * ch, cw, ch, Math.round(pen) - T.pad, M.baseline + 62 - T.baseline, colour);
    pen += T.advances[gi];
  }
}

function buildWinList(rank, games, odds, picks, label) {
  const ranks = load("win", "sorcerer").meta.ranks || [];
  if (!ranks.includes(rank)) return null;
  const rows = listRows(picks);
  const key = "winlist|" + rank + "|" + games + "|" + odds + "|" + (label || "") + "|" + JSON.stringify(rows);
  if (MEMO.has(key)) return MEMO.get(key);
  const C = load("win-list", rank);
  const px = figures(C, games, odds, true);
  let out = null;
  if (px) {
    const M = C.meta, T = M.text, cw = T.cell.w, ch = T.cell.h, ic = M.disc.size;
    if (label) relabel(px, M, C, label);
    rows.forEach((r, i) => {
      const row = M.rows[i];
      if (!r.muted) {
        const left = M.disc.x - ic / 2, top = row.cy - ic / 2;
        paint(px, M, C.text, T.icons, ic, ic, left, top, rgb(T.colors.disc));
        paint(px, M, C.text, T.icons + ic * ic, ic, ic, left, top, rgb(T.colors.tick));
      }
      const colour = rgb(r.muted ? T.colors.muted : T.colors.text);
      let pen = row.x;
      for (const c of r.text) {
        const gi = T.chars.indexOf(c);
        paint(px, M, C.text, gi * cw * ch, cw, ch, Math.round(pen) - T.pad, row.y - T.baseline, colour);
        pen += T.advances[gi];
      }
    });
    out = encodePng(px, M.w, M.h);
  }
  if (MEMO.size >= MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  MEMO.set(key, out);
  return out;
}

function cardSize() {
  const C = load();
  return { w: C.meta.w, h: C.meta.h };
}

module.exports = { build, buildWin, buildWinList, listRows, asciiPick, oddsText, textWidth, cardSize };
