/* One-time generator for the WON SLIP banner's baked parts (owner, 12 Oct 2026:
 * "make telegram bot post wins to tg channel and twitter ... a banner that shows
 * won tickets without exposing the actual ticket owner").
 *
 * Same trick as scripts/mkslipcard.js: the build has no browser and no image
 * library, so the banner is drawn here once, in a browser, and composited per
 * request by lib/slipcard.js (games + "×odds" laid into prepared blocks).
 *
 * What varies by rank is only the headline ("A SORCERER JUST LANDED"), so there is
 * one base per rank and one shared glyph set. No owner, no code: the rank is the
 * credit (lib/winpost.js decides it from the odds).
 *
 * Emits into assets/:
 *   win-base-<rank>.z  the banner as deflated RGBA, number blocks empty
 *   win-glyphs.z       alpha masks for 0-9 "." and "×" in the two number styles
 *   win-card.json      cell size, block centres/widths, styles, advances, ranks
 *
 * And the taller LIST banner (owner, 12 Oct 2026: list the games on the slip): the
 * same top half with a panel of eight empty rows under it. The rows are baked empty
 * because a 3-game slip and an 8-game slip share one base; the compositor ticks and
 * writes only the rows it uses, from a proportional text atlas baked here too:
 *   win-list-base-<rank>.z  the 1568x1360 banner, number blocks and rows empty
 *   win-text.z              alpha masks for ASCII 32-126 and "…" at 700 34px, then
 *                           the row icon (green disc, dark tick) as two masks
 *   win-list-card.json      the number layout for this base, the rows (x, baseline,
 *                           max width) and the text atlas's cell, advances and icon
 *
 * Run: node scripts/mkwincard.js   (opens a headless Chrome itself, then exits)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUB = path.join(__dirname, "..", "public");
const ASSETS = path.join(__dirname, "..", "assets");
const PORT = 8095;
const W = 1568, H = 772, LIST_H = 1360;
const GAMES_CELLS = 2;
const ODDS_CELLS = 7;      /* "×" plus up to six: "×20796" or "×124.50" */
const RANKS = [
  ["apprentice", "AN APPRENTICE"],
  ["sorcerer", "A SORCERER"],
  ["archmage", "AN ARCHMAGE"],
  ["grandwizard", "A GRAND WIZARD"],
];

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>body{margin:0;background:#111;color:#ccc;font:14px system-ui}canvas{display:block;width:784px}</style>
</head><body><canvas id="c" width="${W}" height="${H}"></canvas><p id="s">rendering…</p>
<script>
const W = ${W}, H = ${H}, LIST_H = ${LIST_H}, GAMES_CELLS = ${GAMES_CELLS}, ODDS_CELLS = ${ODDS_CELLS};
const RANKS = ${JSON.stringify(RANKS)};
const INK = "#0D0D0F", RED = "#E63946", GOLD = "#F2B84B", GREEN = "#2FD48A", TEXT = "#F4F5F7", MUTE = "#9AA0AA";
const GLYPHS = "0123456789.×";
const STYLES = {
  games: { font: "800 132px 'Plus Jakarta Sans', system-ui, sans-serif", color: TEXT },
  odds:  { font: "800 132px 'Plus Jakarta Sans', system-ui, sans-serif", color: GOLD },
};
function advanceOf(ctx, font) { ctx.font = font; let a = 0; for (const g of GLYPHS) a = Math.max(a, ctx.measureText(g).width); return Math.ceil(a); }

(async function(){
  for (const w of ["800 132px", "800 62px", "800 58px", "700 34px", "600 30px", "700 26px"]) await document.fonts.load(w + " 'Plus Jakarta Sans'");
  await document.fonts.ready;
  const head = new Image();
  await new Promise((ok, no) => { head.onload = ok; head.onerror = no; head.src = "/head.png"; });
  const c = document.getElementById("c"), x = c.getContext("2d");
  const adv = Math.max(advanceOf(x, STYLES.games.font), advanceOf(x, STYLES.odds.font));

  const blockGap = 130;
  const gamesW = GAMES_CELLS * adv, oddsW = ODDS_CELLS * adv;
  const startX = (W - (gamesW + blockGap + oddsW)) / 2;
  const oddsX = startX + gamesW + blockGap;
  const numY = 498;
  const centres = { games: Math.round(startX + gamesW / 2), odds: Math.round(oddsX + oddsW / 2) };

  /* The list banner's panel: under the labels (baseline numY + 62), eight rows, the
     footer moved below it. Text starts on the number blocks' left edge, so the list
     hangs off the same column as the figures above it. */
  const ROWS = 8, ROW_H = 70, ICON = 44, DISC = 20;
  const panel = { x: 200, y: 604, w: W - 400, pad: 18 };
  panel.h = panel.pad * 2 + ROWS * ROW_H;
  const textX = Math.round(startX), discX = textX - DISC - 22;
  const TEXT_FONT = "700 34px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.font = TEXT_FONT; const capH = x.measureText("H").actualBoundingBoxAscent;
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const cy = panel.y + panel.pad + ROW_H * i + ROW_H / 2;
    rows.push({ x: textX, y: Math.round(cy + capH / 2), w: panel.x + panel.w - 40 - textX, cy: Math.round(cy) });
  }
  const listFootY = panel.y + panel.h + 58;

  /* Both banners from one drawing pass, so the list's top half cannot drift from
     the short banner's. The short one keeps its exact size and footer. */
  for (const [kind, H, footY] of [["base", ${H}, 660], ["list-base", LIST_H, listFootY]])
  for (const [id, title] of RANKS) {
    if (c.height !== H) c.height = H;
    /* ground: matte black, a green win glow where the site card has red */
    x.fillStyle = INK; x.fillRect(0, 0, W, H);
    const rule = x.createLinearGradient(0, 0, W, 0);
    rule.addColorStop(0, "rgba(242,184,75,0)"); rule.addColorStop(0.5, "rgba(242,184,75,.8)"); rule.addColorStop(1, "rgba(242,184,75,0)");
    x.fillStyle = rule; x.fillRect(0, 0, W, 4);
    const g1 = x.createRadialGradient(784, 470, 40, 784, 470, 820);
    g1.addColorStop(0, "rgba(47,212,138,.16)"); g1.addColorStop(1, "rgba(47,212,138,0)");
    x.fillStyle = g1; x.fillRect(0, 0, W, H);
    const g2 = x.createRadialGradient(784, 0, 40, 784, 0, 700);
    g2.addColorStop(0, "rgba(230,57,70,.12)"); g2.addColorStop(1, "rgba(230,57,70,0)");
    x.fillStyle = g2; x.fillRect(0, 0, W, H);
    const bg = x.getImageData(0, 0, W, H);
    for (let i = 0; i < bg.data.length; i += 4) { bg.data[i] = (bg.data[i] >> 2) << 2; bg.data[i+1] = (bg.data[i+1] >> 2) << 2; bg.data[i+2] = (bg.data[i+2] >> 2) << 2; }
    x.putImageData(bg, 0, 0);

    /* lockup */
    const HEAD = 76, wordFont = "800 50px 'Plus Jakarta Sans', system-ui, sans-serif";
    x.font = wordFont; const wA = x.measureText("Soccer").width, wB = x.measureText("wizard").width;
    const lockX = (W - (HEAD + 18 + wA + wB)) / 2, lockY = 52;
    x.save(); x.beginPath(); x.arc(lockX + HEAD/2, lockY + HEAD/2, HEAD/2, 0, Math.PI*2); x.clip();
    x.drawImage(head, lockX, lockY, HEAD, HEAD); x.restore();
    x.textAlign = "left"; x.textBaseline = "alphabetic"; x.font = wordFont;
    x.fillStyle = TEXT; x.fillText("Soccer", lockX + HEAD + 18, lockY + HEAD/2 + 17);
    x.fillStyle = RED; x.fillText("wizard", lockX + HEAD + 18 + wA, lockY + HEAD/2 + 17);

    /* headline: <RANK> JUST LANDED, with a drawn check (no emoji font needed) */
    x.font = "800 58px 'Plus Jakarta Sans', system-ui, sans-serif";
    const rest = " JUST LANDED";
    const tW = x.measureText(title).width, rW = x.measureText(rest).width, CK = 58, ckGap = 22;
    const hx = (W - (CK + ckGap + tW + rW)) / 2, hy = 262;
    x.fillStyle = GREEN; x.beginPath(); x.arc(hx + CK/2, hy - 21, CK/2, 0, Math.PI*2); x.fill();
    x.strokeStyle = INK; x.lineWidth = 8; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(hx + 15, hy - 21); x.lineTo(hx + 25, hy - 10); x.lineTo(hx + 44, hy - 33); x.stroke();
    x.fillStyle = GOLD; x.fillText(title, hx + CK + ckGap, hy);
    x.fillStyle = TEXT; x.fillText(rest, hx + CK + ckGap + tW, hy);

    /* labels under the two blocks */
    x.textAlign = "center"; x.font = "700 34px 'Plus Jakarta Sans', system-ui, sans-serif"; x.fillStyle = MUTE;
    x.fillText("GAMES", startX + gamesW/2, numY + 62);
    x.fillStyle = GREEN; x.fillText("TOTAL ODDS · EVERY LEG WON", oddsX + oddsW/2, numY + 62);

    /* the list panel: a faint raised slab, its rows left empty for the compositor */
    if (kind === "list-base") {
      x.save(); x.beginPath(); x.roundRect(panel.x, panel.y, panel.w, panel.h, 28);
      x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 36; x.shadowOffsetY = 12;
      x.fillStyle = "#16161A"; x.fill(); x.restore();
      x.lineWidth = 2; x.strokeStyle = "rgba(255,255,255,.07)"; x.stroke();
    }

    x.font = "600 30px 'Plus Jakarta Sans', system-ui, sans-serif"; x.fillStyle = MUTE;
    x.fillText("Built by the Wizard in one tap. Name your payout, or slide your risk.", 784, footY);
    /* URL and age line measured and centred as a pair: at fixed x they touched ("live·18+"). */
    const urlF = "700 28px 'Plus Jakarta Sans', system-ui, sans-serif", ageF = "700 24px 'Plus Jakarta Sans', system-ui, sans-serif";
    x.font = urlF; const uW = x.measureText("soccerwizard.live").width; x.font = ageF; const aW = x.measureText("· 18+").width;
    const fx = (W - (uW + 14 + aW)) / 2; x.textAlign = "left";
    x.font = urlF; x.fillStyle = RED; x.fillText("soccerwizard.live", fx, footY + 54);
    x.font = ageF; x.fillStyle = MUTE; x.fillText("· 18+", fx + uW + 14, footY + 54);
    x.textAlign = "center";

    await fetch("/base?kind=" + kind + "&rank=" + id, { method: "POST", body: new Uint8Array(x.getImageData(0, 0, W, H).data) });
  }

  const cell = document.createElement("canvas"); cell.width = adv; cell.height = Math.ceil(adv * 2.2);
  const cx = cell.getContext("2d"); const names = Object.keys(STYLES);
  const flat = new Uint8Array(names.length * GLYPHS.length * cell.width * cell.height); let o = 0;
  for (const n of names) { cx.font = STYLES[n].font;
    for (const gch of GLYPHS) { cx.clearRect(0, 0, cell.width, cell.height); cx.fillStyle = "#fff"; cx.textAlign = "center"; cx.textBaseline = "alphabetic";
      cx.fillText(gch, cell.width/2, cell.height*0.72); const d = cx.getImageData(0, 0, cell.width, cell.height).data; for (let i = 3; i < d.length; i += 4) flat[o++] = d[i]; } }
  await fetch("/glyphs", { method: "POST", body: flat });
  const advances = {}; x.font = STYLES.odds.font; for (const gch of GLYPHS) advances[gch] = Math.round(x.measureText(gch).width);
  const meta = { w: W, h: H, cell: { w: cell.width, h: cell.height }, baseline: numY, glyphs: GLYPHS, advances,
    styles: names.map((n) => ({ name: n, color: STYLES[n].color })), centres, widths: { games: gamesW, odds: oddsW },
    ranks: RANKS.map((r) => r[0]) };
  await fetch("/meta", { method: "POST", body: JSON.stringify(meta) });

  /* The text atlas. Picks are words, so unlike the figures each glyph keeps its own
     measured advance (fractional; the compositor rounds once per glyph). Every mask
     sits in one cell size, drawn PAD in from the left so a negative side bearing
     ("j") is not cut off, with the baseline under the tallest ascent. */
  let CHARS = ""; for (let k = 32; k <= 126; k++) CHARS += String.fromCharCode(k); CHARS += "…";
  x.font = TEXT_FONT; x.textAlign = "left"; let asc = 0, desc = 0, right = 0; const tadv = [];
  for (const ch of CHARS) {
    const m = x.measureText(ch);
    asc = Math.max(asc, m.actualBoundingBoxAscent); desc = Math.max(desc, m.actualBoundingBoxDescent);
    right = Math.max(right, m.actualBoundingBoxRight); tadv.push(Math.round(m.width * 100) / 100);
  }
  const PAD = 6, tcw = Math.ceil(right) + PAD * 2, tbase = Math.ceil(asc) + 2, tch = tbase + Math.ceil(desc) + 2;
  const tc = document.createElement("canvas"); tc.width = Math.max(tcw, ICON); tc.height = Math.max(tch, ICON);
  const tx = tc.getContext("2d");
  const tflat = new Uint8Array(CHARS.length * tcw * tch + 2 * ICON * ICON); let t = 0;
  const grab = (w, h) => { const d = tx.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4) tflat[t++] = d[i]; };
  for (const ch of CHARS) {
    tx.clearRect(0, 0, tc.width, tc.height); tx.font = TEXT_FONT; tx.fillStyle = "#fff"; tx.textAlign = "left"; tx.textBaseline = "alphabetic";
    tx.fillText(ch, PAD, tbase); grab(tcw, tch);
  }
  /* the row icon: the headline's check scaled to a 20px radius, disc and tick as
     separate masks so each keeps its own colour over the panel */
  const k = DISC / 29, ic = ICON / 2;
  tx.clearRect(0, 0, tc.width, tc.height); tx.fillStyle = "#fff"; tx.beginPath(); tx.arc(ic, ic, DISC, 0, Math.PI * 2); tx.fill(); grab(ICON, ICON);
  tx.clearRect(0, 0, tc.width, tc.height); tx.strokeStyle = "#fff"; tx.lineWidth = 8 * k; tx.lineCap = "round"; tx.lineJoin = "round";
  tx.beginPath(); tx.moveTo(ic - 14 * k, ic); tx.lineTo(ic - 4 * k, ic + 11 * k); tx.lineTo(ic + 15 * k, ic - 12 * k); tx.stroke(); grab(ICON, ICON);
  await fetch("/text", { method: "POST", body: tflat });

  /* The list base's meta: the short banner's number layout (same blocks, same
     glyphs - "glyphset" points at win-glyphs.z) plus the rows and the atlas. */
  const listMeta = Object.assign({}, meta, { h: LIST_H, glyphset: "win", rows, disc: { x: discX, size: ICON },
    text: { cell: { w: tcw, h: tch }, baseline: tbase, pad: PAD, chars: CHARS, advances: tadv, icons: CHARS.length * tcw * tch,
      colors: { text: TEXT, muted: MUTE, disc: GREEN, tick: INK } } });
  await fetch("/listmeta", { method: "POST", body: JSON.stringify(listMeta) });
  document.getElementById("s").textContent = "done";
})().catch((e) => { document.getElementById("s").textContent = "error " + e; });
</script></body></html>`;

const body = (req) => new Promise((ok) => { const p = []; req.on("data", (d) => p.push(d)); req.on("end", () => ok(Buffer.concat(p))); });
fs.mkdirSync(ASSETS, { recursive: true });

const server = http.createServer(async (req, res) => {
  if (req.method === "POST") {
    const buf = await body(req);
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/base") {
      const rank = u.searchParams.get("rank"), kind = u.searchParams.get("kind") === "list-base" ? "list-base" : "base";
      if (!RANKS.some((r) => r[0] === rank)) { res.writeHead(400); return res.end("bad rank"); }
      const z = zlib.deflateSync(buf, { level: 9 });
      fs.writeFileSync(path.join(ASSETS, "win-" + kind + "-" + rank + ".z"), z);
      console.log(kind + " " + rank + " -> " + z.length + " bytes");
    } else if (u.pathname === "/text") {
      fs.writeFileSync(path.join(ASSETS, "win-text.z"), zlib.deflateSync(buf, { level: 9 }));
      console.log("text " + buf.length + " raw");
    } else if (u.pathname === "/listmeta") {
      fs.writeFileSync(path.join(ASSETS, "win-list-card.json"), buf);
      console.log("list meta written");
    } else if (u.pathname === "/glyphs") {
      fs.writeFileSync(path.join(ASSETS, "win-glyphs.z"), zlib.deflateSync(buf, { level: 9 }));
      console.log("glyphs " + buf.length + " raw");
    } else if (u.pathname === "/meta") {
      fs.writeFileSync(path.join(ASSETS, "win-card.json"), buf);
      console.log("meta written");
    }
    res.writeHead(200); return res.end("ok");
  }
  if (req.url === "/head.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(fs.readFileSync(path.join(PUB, "wiz-mark.png"))); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE);
});

server.listen(PORT, async () => {
  console.log("win card builder on http://localhost:" + PORT);
  /* Drive it headless when puppeteer-core is around; otherwise open the URL by hand. */
  let puppeteer;
  try { puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core"); } catch (e) { return; }
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const p = await b.newPage();
  await p.goto("http://localhost:" + PORT, { waitUntil: "networkidle0" });
  await p.waitForFunction(() => /done|error/.test(document.getElementById("s").textContent), { timeout: 60000 });
  console.log(await p.$eval("#s", (e) => e.textContent));
  await b.close(); server.close();
});
