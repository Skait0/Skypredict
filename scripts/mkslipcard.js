/* One-time generator for the SHARED SLIP card's baked parts.
 *
 * Same trick as scripts/mkogbase.js and for the same reason: the build has no
 * browser and no image library, so a card cannot be drawn at request time. It
 * can be composited - lay glyph bitmaps into prepared cells and encode a PNG -
 * and that needs nothing but zlib.
 *
 * The difference from the site card is what varies. That one carries two
 * two-digit figures baked into one sentence. A slip carries two numbers of
 * genuinely different widths: 3 games or 35, and odds that run from 1.63 to
 * 20796. So this bakes a glyph set including the decimal point, reserves a
 * block of cells wide enough for the longest value either can take, and lets
 * the compositor CENTRE the actual string inside its block. The labels beneath
 * are baked centred under the block, so a short number and a long one both sit
 * right.
 *
 * Emits into assets/:
 *   slip-base.z     the card as deflated RGBA with both number blocks empty
 *   slip-glyphs.z   alpha masks for 0-9 and "." in the two number styles
 *   slip-card.json  cell size, the cells of each block, and each style's colour
 *
 * Glyphs are laid on a FIXED advance - the widest glyph's width used for all of
 * them - so nothing reflows and the figures are tabular.
 *
 * Run it with: node scripts/mkslipcard.js, then open the printed URL. Re-run
 * only to change the DESIGN; the numbers are filled in per request.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUB = path.join(__dirname, "..", "public");
const ASSETS = path.join(__dirname, "..", "assets");
const PORT = 8094;

const W = 1568, H = 772;

/* Longest value each block must hold. Games reach 35 on a full Saturday card;
   odds have run past 20000 in the Wizard, and "20796" is five glyphs while
   "3.81" is four - the block is sized for the worst case and the string is
   centred in it. */
const GAMES_CELLS = 2;
const ODDS_CELLS = 6;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>body{margin:0;background:#111;color:#ccc;font:14px system-ui}
canvas{display:block;margin:20px auto;width:784px;height:386px;border:1px solid #333}</style>
</head><body>
<canvas id="c" width="${W}" height="${H}"></canvas>
<p id="s" style="text-align:center">rendering…</p>
<script>
const W = ${W}, H = ${H};
const GAMES_CELLS = ${GAMES_CELLS}, ODDS_CELLS = ${ODDS_CELLS};

/* The site's own palette. Matte black ground, red for the brand, gold for the
   figure that carries the slip. */
const INK = "#0D0D0F", RED = "#E63946", GOLD = "#F2B84B",
      TEXT = "#F4F5F7", MUTE = "#9AA0AA";

const GLYPHS = "0123456789.";
const STYLES = {
  games: { font: "800 132px 'Plus Jakarta Sans', system-ui, sans-serif", color: TEXT },
  odds:  { font: "800 132px 'Plus Jakarta Sans', system-ui, sans-serif", color: GOLD },
};

function advanceOf(ctx, font) {
  ctx.font = font;
  let a = 0;
  for (const g of GLYPHS) a = Math.max(a, ctx.measureText(g).width);
  return Math.ceil(a);
}

(async function(){
  for (const w of ["800 132px", "800 104px", "700 34px", "600 30px", "700 26px"]) {
    await document.fonts.load(w + " 'Plus Jakarta Sans'");
  }
  await document.fonts.ready;

  const head = new Image();
  await new Promise((ok, no) => { head.onload = ok; head.onerror = no; head.src = "/icon-192.png"; });

  const c = document.getElementById("c"), x = c.getContext("2d");
  const advG = advanceOf(x, STYLES.games.font);
  const advO = advanceOf(x, STYLES.odds.font);
  const adv = Math.max(advG, advO);   /* one cell size for both blocks */

  /* ------------------------------------------------------------ background */
  x.fillStyle = INK; x.fillRect(0, 0, W, H);
  x.fillStyle = RED; x.fillRect(0, 0, W, 10);

  const g = x.createRadialGradient(784, 330, 60, 784, 330, 820);
  g.addColorStop(0, "rgba(230,57,70,.14)");
  g.addColorStop(1, "rgba(230,57,70,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  /* Posterise the background only. Canvas dithers gradients with +/-1 noise,
     which deflate cannot compress; the site card hit 343 KB that way and
     WhatsApp drops previews over roughly 300 KB. Snapping each channel to a
     multiple of 4 leaves flat regions that compress, and at 14% over
     near-black the steps are invisible. Done before anything with an
     antialiased edge is drawn. */
  const bg = x.getImageData(0, 0, W, H);
  for (let i = 0; i < bg.data.length; i += 4) {
    bg.data[i]     = (bg.data[i]     >> 2) << 2;
    bg.data[i + 1] = (bg.data[i + 1] >> 2) << 2;
    bg.data[i + 2] = (bg.data[i + 2] >> 2) << 2;
  }
  x.putImageData(bg, 0, 0);

  /* ------------------------------------------- the lockup: round head + word */
  const HEAD = 92;
  const wordFont = "800 62px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.font = wordFont;
  const A = "Soccer", B = "wizard";
  const wordW = x.measureText(A).width + x.measureText(B).width;
  const gap = 22;
  const lockW = HEAD + gap + wordW;
  const lockX = (W - lockW) / 2, lockY = 112;

  /* Circle-cropped, the way the wordmark carries it everywhere else. */
  x.save();
  x.beginPath();
  x.arc(lockX + HEAD / 2, lockY + HEAD / 2, HEAD / 2, 0, Math.PI * 2);
  x.closePath();
  x.clip();
  x.drawImage(head, lockX, lockY, HEAD, HEAD);
  x.restore();

  x.textBaseline = "alphabetic";
  x.textAlign = "left";
  x.font = wordFont;
  const wordY = lockY + HEAD / 2 + 21;
  x.fillStyle = TEXT; x.fillText(A, lockX + HEAD + gap, wordY);
  x.fillStyle = RED;
  x.fillText(B, lockX + HEAD + gap + x.measureText(A).width, wordY);

  /* ------------------------------------------------- the two number blocks */
  const blockGap = 150;
  const gamesW = GAMES_CELLS * adv, oddsW = ODDS_CELLS * adv;
  const totalW = gamesW + blockGap + oddsW;
  const startX = (W - totalW) / 2;
  const numY = 430;                       /* baseline of the figures */

  const oddsX = startX + gamesW + blockGap;
  /* Centres, not cells. The figures are laid out proportionally about these -
     see the advances below - so a block only has to say where its middle is. */
  const centres = {
    games: Math.round(startX + gamesW / 2),
    odds:  Math.round(oddsX + oddsW / 2),
  };

  /* Labels, baked, centred under each block. */
  x.textAlign = "center";
  x.font = "700 34px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.fillStyle = MUTE;
  x.fillText("GAMES", startX + gamesW / 2, numY + 62);
  x.fillText("TOTAL ODDS", oddsX + oddsW / 2, numY + 62);

  /* The line that says what this is, and why it can be checked. */
  x.font = "600 30px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.fillStyle = MUTE;
  x.fillText("Built from our own predictions. Every result public, misses included.", 784, 620);

  x.font = "700 26px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.fillStyle = RED;
  x.fillText("soccerwizard.live", 784, 676);
  x.textAlign = "left";

  /* ------------------------------------------------------------- ship it */
  const base = new Uint8Array(x.getImageData(0, 0, W, H).data);
  await fetch("/base", { method: "POST", body: base });

  /* Glyph masks: alpha only, one cell each, in style order then glyph order. */
  const cell = document.createElement("canvas");
  cell.width = adv; cell.height = Math.ceil(adv * 2.2);
  const cx = cell.getContext("2d");
  const styleNames = Object.keys(STYLES);
  const flat = new Uint8Array(styleNames.length * GLYPHS.length * cell.width * cell.height);
  let o = 0;
  for (const sName of styleNames) {
    cx.font = STYLES[sName].font;
    for (const gch of GLYPHS) {
      cx.clearRect(0, 0, cell.width, cell.height);
      cx.fillStyle = "#fff";
      cx.textAlign = "center";
      cx.textBaseline = "alphabetic";
      cx.fillText(gch, cell.width / 2, cell.height * 0.72);
      const d = cx.getImageData(0, 0, cell.width, cell.height).data;
      for (let i = 3; i < d.length; i += 4) flat[o++] = d[i];
    }
  }
  await fetch("/glyphs", { method: "POST", body: flat });

  /* EACH GLYPH'S OWN WIDTH.
   *
   * The first version laid every glyph on the widest one's advance, the way
   * the site card does. That is right for a two-digit figure inside a sentence
   * and wrong here: "3.81" came out as "3 . 81", because a full-width cell
   * around a decimal point is mostly empty, and "1318" was airy for the same
   * reason. Real advances, laid about a centre, read as a number. The masks
   * are still baked in identical cells - only where they are PUT changes. */
  const advances = {};
  x.font = STYLES.odds.font;
  for (const gch of GLYPHS) advances[gch] = Math.round(x.measureText(gch).width);

  const meta = {
    w: W, h: H,
    cell: { w: cell.width, h: cell.height },
    /* The mask was drawn with its baseline at 72% of cell height, and its ink
       centred in the cell, so the compositor offsets by (cell.w - advance)/2. */
    baseline: numY,
    glyphs: GLYPHS,
    advances: advances,
    styles: styleNames.map(function(n){ return { name: n, color: STYLES[n].color }; }),
    centres: centres,
    /* What each block was sized for, so the compositor can refuse a figure
       that would overrun it rather than drawing over a label. */
    widths: { games: gamesW, odds: oddsW },
  };
  const r = await fetch("/meta", { method: "POST", body: JSON.stringify(meta) });
  document.getElementById("s").textContent = "done - " + (await r.text());
})();
</script></body></html>`;

function body(req) {
  return new Promise((ok) => {
    const parts = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => ok(Buffer.concat(parts)));
  });
}

fs.mkdirSync(ASSETS, { recursive: true });

http.createServer(async (req, res) => {
  if (req.method === "POST") {
    const buf = await body(req);
    if (req.url === "/base") {
      const z = zlib.deflateSync(buf, { level: 9 });
      fs.writeFileSync(path.join(ASSETS, "slip-base.z"), z);
      console.log("base   " + buf.length + " raw -> " + z.length + " deflated");
    } else if (req.url === "/glyphs") {
      const z = zlib.deflateSync(buf, { level: 9 });
      fs.writeFileSync(path.join(ASSETS, "slip-glyphs.z"), z);
      console.log("glyphs " + buf.length + " raw -> " + z.length + " deflated");
    } else if (req.url === "/meta") {
      fs.writeFileSync(path.join(ASSETS, "slip-card.json"), buf);
      console.log("meta   " + buf.toString().slice(0, 400));
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok " + req.url + " " + buf.length);
    return;
  }
  if (req.url === "/icon-192.png") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(fs.readFileSync(path.join(PUB, "icon-192.png")));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
}).listen(PORT, () => console.log("slip card builder on http://localhost:" + PORT));
