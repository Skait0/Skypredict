/* One-time generator for the share card's baked parts.
 *
 * The build has no browser and no image library - the project carries zero
 * dependencies - so the card cannot be drawn at deploy time the way it was
 * drawn by hand. What CAN happen at deploy time is compositing: lay a few digit
 * bitmaps onto a prepared background and encode a PNG, both of which are
 * reachable with zlib alone.
 *
 * So this runs once, in a browser, and emits three things into assets/:
 *
 *   og-base.z     the whole card as deflated RGBA, with the number positions
 *                 left blank (the pill and the surrounding words are baked in,
 *                 only the digits are missing)
 *   og-digits.z   alpha masks for 0-9, in the two styles that carry a number
 *   og-card.json  the metrics the compositor needs: cell size, cell positions,
 *                 and the colour each style is drawn in
 *
 * Digits are laid out on a FIXED advance - the widest digit's width, used for
 * all ten. That is what makes the baked text valid for any number: "47" and
 * "11" occupy exactly the same width, so the words on either side never need
 * to move, and the line stays centred. It also looks better, being what a
 * typographer would call tabular figures.
 *
 * Re-run this only to change the card's DESIGN. Changing the NUMBERS is what
 * the build does on its own.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PUB = "C:/Users/DELL/Desktop/skypredict/public";
const ASSETS = "C:/Users/DELL/Desktop/skypredict/assets";
const PORT = 8093;

const W = 1568, H = 772;

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

/* The two styles that contain a number. Everything else on the card is baked
   into the background and never changes. */
const STYLES = {
  leagues: { font: "600 36px 'Plus Jakarta Sans', system-ui, sans-serif", color: "#a8adb6" },
  pct:     { font: "700 30px 'Plus Jakarta Sans', system-ui, sans-serif", color: "#3ddc84" },
};

function advanceOf(ctx, font) {
  ctx.font = font;
  let a = 0;
  for (let d = 0; d <= 9; d++) a = Math.max(a, ctx.measureText(String(d)).width);
  return Math.ceil(a);
}

(async function(){
  for (const w of ["800 104px", "600 36px", "700 30px", "600 26px", "700 28px"]) {
    await document.fonts.load(w + " 'Plus Jakarta Sans'");
  }
  await document.fonts.ready;

  const sig = new Image();
  await new Promise((ok, no) => { sig.onload = ok; sig.onerror = no; sig.src = "/wiz-sig.png"; });

  const c = document.getElementById("c"), x = c.getContext("2d");

  const advL = advanceOf(x, STYLES.leagues.font);
  const advP = advanceOf(x, STYLES.pct.font);

  /* ------------------------------------------------------------ background */
  x.fillStyle = "#0e1013"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#e63946"; x.fillRect(0, 0, W, 10);

  const g = x.createRadialGradient(784, 300, 60, 784, 300, 780);
  g.addColorStop(0, "rgba(230,57,70,.13)");
  g.addColorStop(1, "rgba(230,57,70,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  /* Posterise the background, and only the background.
   *
   * Canvas dithers a gradient - it scatters +/-1 noise so the eye does not see
   * bands. That is right on screen and ruinous in a PNG: noise is the one thing
   * deflate cannot compress, and it was costing about 0.3 bytes per pixel
   * across the WHOLE card, flat corners included. The card came to 343 KB, and
   * WhatsApp silently drops preview images over roughly 300 KB, so the link was
   * showing no card at all in chats.
   *
   * Snapping each channel to a multiple of 4 removes the dither and leaves
   * broad flat regions that deflate collapses. At 13% opacity over a near-black
   * ground the steps are far below anything visible.
   *
   * Done HERE, before the logo and the wordmark are drawn, so their smooth
   * shading and antialiased edges are untouched. */
  const bg = x.getImageData(0, 0, W, H);
  for (let i = 0; i < bg.data.length; i += 4) {
    bg.data[i]     = (bg.data[i]     >> 2) << 2;
    bg.data[i + 1] = (bg.data[i + 1] >> 2) << 2;
    bg.data[i + 2] = (bg.data[i + 2] >> 2) << 2;
  }
  x.putImageData(bg, 0, 0);

  /* ---------------------------------- the lockup, at the masthead's ratios */
  const WORD = 104, track = -0.025 * WORD;
  const sigH = WORD * (42 / 19);
  const sigW = sigH * (sig.naturalWidth / sig.naturalHeight);
  const gap  = WORD * (9 / 19);

  x.textBaseline = "alphabetic";
  x.textAlign = "left";
  x.font = "800 " + WORD + "px 'Plus Jakarta Sans', system-ui, sans-serif";
  const runW = (s) => x.measureText(s).width + track * s.length;
  const A = "Soccer", B = "wizard";
  const totalW = sigW + gap + runW(A) + runW(B);
  const left = (W - totalW) / 2, midY = 300;

  x.drawImage(sig, left, midY - sigH / 2, sigW, sigH);
  const draw = (s, sx, col) => {
    x.fillStyle = col;
    let p = sx;
    for (const ch of s) { x.fillText(ch, p, midY + WORD * 0.34); p += x.measureText(ch).width + track; }
    return p;
  };
  draw(B, draw(A, left + sigW + gap, "#f4f5f7"), "#e63946");

  /* --------------------------------------------- line one, with a number in it
     Drawn in three pieces so a fixed-width gap can be left where the digits
     go. The gap is two cells wide whatever the number turns out to be. */
  const slots = { leagues: [], pct: [] };

  x.font = STYLES.leagues.font;
  x.fillStyle = STYLES.leagues.color;
  const pre = "Football predictions across ", post = " leagues";
  const lineW = x.measureText(pre).width + 2 * advL + x.measureText(post).width;
  let lx = (W - lineW) / 2;
  const baseY1 = 470;
  x.fillText(pre, lx, baseY1); lx += x.measureText(pre).width;
  slots.leagues.push(Math.round(lx), Math.round(lx + advL));
  lx += 2 * advL;
  x.fillText(post, lx, baseY1);

  x.textAlign = "center";
  /* "Free" came off the card on 3 Sep, with the same line on the page: it
     may not be free later, and a promise that has to be withdrawn is worth
     less than one never made. Both books are named now because the site
     books both, and the summary beside this card says so too. */
  x.fillText("SportyBet or Bet9ja code in one tap", 784, 520);
  x.textAlign = "left";

  /* ------------------------------------------------------------- the chip
     Same trick: the pill is sized around a two-cell gap, so it never has to
     resize and the note beside it never has to move. */
  x.font = STYLES.pct.font;
  const chipPost = "% of tips landed";
  const chipW = 2 * advP + x.measureText(chipPost).width;
  x.font = "600 26px 'Plus Jakarta Sans', system-ui, sans-serif";
  const note = "last 21 days · every one checked";
  const noteW = x.measureText(note).width;

  const padX = 26, inner = 22, boxH = 60;
  const boxW = chipW + padX * 2;
  const bx = 784 - (boxW + inner + noteW) / 2, by = 578;

  x.beginPath();
  if (x.roundRect) x.roundRect(bx, by, boxW, boxH, 999); else x.rect(bx, by, boxW, boxH);
  x.fillStyle = "rgba(46,196,120,.15)"; x.fill();
  x.strokeStyle = "rgba(46,196,120,.45)"; x.lineWidth = 2; x.stroke();

  const chipBaseY = by + 40;
  let cx2 = bx + padX;
  slots.pct.push(Math.round(cx2), Math.round(cx2 + advP));
  cx2 += 2 * advP;
  x.font = STYLES.pct.font; x.fillStyle = STYLES.pct.color;
  x.fillText(chipPost, cx2, chipBaseY);

  x.font = "600 26px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.fillStyle = "#8b9099";
  x.fillText(note, bx + boxW + inner, chipBaseY);

  /* ----------------------------------------------------------- the footing */
  x.font = "700 28px 'Plus Jakarta Sans', system-ui, sans-serif";
  x.fillStyle = "#6b717a";
  x.fillText("soccerwizard.live", 62, 722);
  x.textAlign = "right";
  x.fillText("18+ · Estimates, not certainties", 1506, 722);

  /* ------------------------------------------------------- ship the base */
  const base = x.getImageData(0, 0, W, H).data;
  await fetch("/base", { method: "POST", body: base });

  /* ------------------------------------------------- ship the digit masks
     Each digit is drawn centred in a cell and reduced to its alpha channel;
     the colour is applied by the compositor, so one mask serves any colour. */
  const cellH = 60, ascent = 44;   /* generous enough for any digit at 36px */
  const masks = [];
  const meta = { w: W, h: H, cellH: cellH, styles: {} };

  for (const [name, st] of Object.entries(STYLES)) {
    const adv = name === "leagues" ? advL : advP;
    const cv = document.createElement("canvas");
    cv.width = adv; cv.height = cellH;
    const g2 = cv.getContext("2d");
    const start = masks.length;
    for (let d = 0; d <= 9; d++) {
      g2.clearRect(0, 0, adv, cellH);
      g2.font = st.font; g2.fillStyle = "#fff";
      g2.textAlign = "center"; g2.textBaseline = "alphabetic";
      g2.fillText(String(d), adv / 2, ascent);
      const px = g2.getImageData(0, 0, adv, cellH).data;
      const m = new Uint8Array(adv * cellH);
      for (let i = 0; i < m.length; i++) m[i] = px[i * 4 + 3];
      masks.push(m);
    }
    meta.styles[name] = {
      cellW: adv, offset: start, color: st.color,
      /* where the cell's top-left lands, given the baseline used above */
      slots: (name === "leagues" ? slots.leagues : slots.pct)
        .map((sx) => [sx, Math.round((name === "leagues" ? baseY1 : chipBaseY) - ascent)]),
    };
  }

  const flat = new Uint8Array(masks.reduce((n, m) => n + m.length, 0));
  let o = 0; for (const m of masks) { flat.set(m, o); o += m.length; }
  await fetch("/digits", { method: "POST", body: flat });
  const r = await fetch("/meta", { method: "POST", body: JSON.stringify(meta) });
  document.getElementById("s").textContent = await r.text();
})().catch(e => { document.getElementById("s").textContent = "FAILED: " + e.message; });
</script></body></html>`;

const zlib = require("zlib");
function body(req) {
  return new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
}

fs.mkdirSync(ASSETS, { recursive: true });

http.createServer(async (req, res) => {
  if (req.method === "POST") {
    const buf = await body(req);
    if (req.url === "/base") {
      const z = zlib.deflateSync(buf, { level: 9 });
      fs.writeFileSync(path.join(ASSETS, "og-base.z"), z);
      console.log("base   " + buf.length + " raw -> " + z.length + " deflated");
    } else if (req.url === "/digits") {
      const z = zlib.deflateSync(buf, { level: 9 });
      fs.writeFileSync(path.join(ASSETS, "og-digits.z"), z);
      console.log("digits " + buf.length + " raw -> " + z.length + " deflated");
    } else if (req.url === "/meta") {
      fs.writeFileSync(path.join(ASSETS, "og-card.json"), buf);
      console.log("meta   " + buf.toString());
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok " + req.url + " " + buf.length);
    return;
  }
  if (req.url === "/wiz-sig.png") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(fs.readFileSync(path.join(PUB, "wiz-sig.png")));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
}).listen(PORT, () => console.log("base builder on http://localhost:" + PORT));
