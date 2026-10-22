"use strict";
/* THE DAILY CODES CARD (owner, 22 Oct 2026: the 11:00 Merlin drop on Instagram, which takes no
 * post without a picture). Composited from parts baked by scripts/mkcodescard.js, the way
 * lib/slipcard.js does the win banners: the server has no browser and no image library.
 *
 * On the base (header, "Today's codes", footer) it writes the day, the x5 SportyBet code large,
 * what x5 pays, and one row per other rung: payout, games, Wizard Pass. Only the x5 code is shown,
 * as in the post (lib/ladder.js drop). Null without an x5 code. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { encodePng } = require("./ogcard.js");
const { asciiPick } = require("./slipcard.js");

const ASSETS = path.join(__dirname, "..", "assets");
let C = null;
function load() {
  if (C) return C;
  const meta = JSON.parse(fs.readFileSync(path.join(ASSETS, "codes-card.json"), "utf8"));
  C = { meta, base: zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "codes-base.z"))),
    text: zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "codes-text.z"))) };
  return C;
}
let SAFER_BASE = null;
const saferBase = () => SAFER_BASE || (SAFER_BASE = zlib.inflateSync(fs.readFileSync(path.join(ASSETS, "safer-base.z"))));
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
const WHITE = "#F2F1F0", GOLD = "#F2B84B", MUTE = "#A3A0A6", LINE = "#2A2A30";
const LEFT = 80, RIGHT = 1000;

function width(face, s) {
  const F = load().meta.faces[face], chars = load().meta.chars;
  let w = 0; for (const c of s) w += F.advances[chars.indexOf(c)] || 0; return w;
}
/* One line of text with its baseline at y, in one colour. Characters outside the atlas are dropped. */
function write(px, face, s, x, y, colour) {
  const { meta, text } = load(), F = meta.faces[face], [r, g, b] = rgb(colour);
  const cw = F.cell.w, ch = F.cell.h;
  let pen = x;
  for (const c of s) {
    const gi = meta.chars.indexOf(c);
    if (gi < 0) continue;
    const off = F.off + gi * cw * ch, left = Math.round(pen) - F.pad, top = y - F.baseline;
    for (let yy = 0; yy < ch; yy++) {
      const py = top + yy; if (py < 0 || py >= meta.h) continue;
      for (let xx = 0; xx < cw; xx++) {
        const a = text[off + yy * cw + xx]; if (!a) continue;
        const pxX = left + xx; if (pxX < 0 || pxX >= meta.w) continue;
        const i = (py * meta.w + pxX) * 4, k = a / 255;
        px[i] = Math.round(px[i] * (1 - k) + r * k); px[i + 1] = Math.round(px[i + 1] * (1 - k) + g * k);
        px[i + 2] = Math.round(px[i + 2] * (1 - k) + b * k); px[i + 3] = 255;
      }
    }
    pen += F.advances[gi];
  }
}
function rule(px, y) {
  const { meta } = load(), [r, g, b] = rgb(LINE);
  for (let t = 0; t < 2; t++) for (let x = LEFT; x < RIGHT; x++) { const i = ((y + t) * meta.w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }
}

/* What the card says, before any pixel: testable on its own. */
function lines(rows, day) {
  const by = {}; (rows || []).forEach((r) => { by[r.rung] = r; });
  const x5 = by[5], code = x5 && x5.codes && x5.codes.sporty && x5.codes.sporty.code;
  if (!code) return null;
  const n = (r) => (Array.isArray(r.legs) ? r.legs.length : 0) + " games";
  const d = new Date(day + "T12:00:00Z");
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return { date, code: asciiPick(code), x5: "x5 on SportyBet  ·  " + n(x5) + "  ·  pays x" + Number(x5.odds).toFixed(2),
    rungs: [10, 20, 30].filter((x) => by[x]).map((x) => ({ x: "x" + x, rest: n(by[x]) + "  ·  Wizard Pass" })) };
}

function build(rows, day) {
  const L = lines(rows, day);
  if (!L) return null;
  const { meta, base } = load(), px = Buffer.from(base);
  write(px, "small", L.date, LEFT, 395, MUTE);
  write(px, "small", L.x5, LEFT, 475, MUTE);
  write(px, "big", L.code, LEFT, 625, GOLD);
  if (width("big", L.code) > RIGHT - LEFT) return null;
  /* SportyBet's codes mix 0 and O, and this face draws them alike (as the post says). */
  if (/0/.test(L.code)) write(px, "small", "0 is a zero", LEFT + width("big", L.code) + 30, 625, MUTE);
  let y = 675;
  for (const r of L.rungs) {
    rule(px, y); y += 84;
    write(px, "mid", r.x, LEFT, y - 26, WHITE);
    write(px, "small", r.rest, LEFT + 150, y - 30, MUTE);
  }
  if (L.rungs.length) rule(px, y);
  return encodePng(px, meta.w, meta.h);
}

/* THE SAFER X20 CARD (owner, 22 Oct 2026): the 12:00 post's picture, so Instagram can carry it.
 * One row per bookie that booked the slip, in the site's order, each name in its own colours and
 * spelling (the owner's wordmark rule, as near as one-colour lettering gets), then its code. */
const ORDER = ["sporty", "bet9ja", "betking", "betpawa", "onexbet", "betway", "msport"];
const MARK = {
  sporty: [["SportyBet", "#E63946"]], bet9ja: [["bet", "#D42127"], ["9ja", "#14B151"]],
  betking: [["Bet", WHITE], ["King", "#FFC400"]], betpawa: [["bet", WHITE], ["Pawa", "#9CE800"]],
  onexbet: [["1X", WHITE], ["BET", "#14A0FF"]], betway: [["betway", WHITE]], msport: [["MSPORT", "#FFCA27"]],
};
function saferLines(row, day) {
  const n = (row && row.legs || []).length, codes = (row && row.codes) || {};
  const books = ORDER.filter((k) => codes[k] && codes[k].code).map((k) => ({ key: k, code: asciiPick(codes[k].code),
    note: codes[k].n && codes[k].n < n ? codes[k].n + " of " + n : "" }));
  if (!n || !books.length) return null;
  const d = new Date(day + "T12:00:00Z");
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return { date, sum: n + " games  ·  every pick 72%+  ·  pays x" + Number(row.odds).toFixed(2), books,
    zero: books.some((b) => /0/.test(b.code)) };
}
function buildSafer(row, day) {
  const L = saferLines(row, day);
  if (!L) return null;
  const { meta } = load(), px = Buffer.from(saferBase());
  write(px, "small", L.date, LEFT, 395, MUTE);
  write(px, "small", L.sum, LEFT, 475, MUTE);
  let y = 520;
  for (const b of L.books) {
    rule(px, y); y += 66;
    let x = LEFT;
    for (const [part, colour] of MARK[b.key]) { write(px, "mid", part, x, y - 18, colour); x += width("mid", part); }
    write(px, "mid", b.code, LEFT + 330, y - 18, GOLD);
    if (b.note) write(px, "small", b.note, LEFT + 340 + width("mid", b.code), y - 20, MUTE);
  }
  rule(px, y);
  if (L.zero) write(px, "small", "0 is a zero", LEFT, y + 48, MUTE);
  return encodePng(px, meta.w, meta.h);
}

module.exports = { build, lines, buildSafer, saferLines };
