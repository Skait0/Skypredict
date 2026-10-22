"use strict";
/* Bakes the daily codes card's parts (owner, 22 Oct 2026: the 11:00 Merlin drop on Instagram,
 * which takes no post without a picture). Run once, by hand, after a design change:
 *
 *   node scripts/mkcodescard.js
 *
 * The server has no browser and no image library (lib/slipcard.js says why), so the card is
 * composited there from what is baked here, in Chrome:
 *
 *   assets/codes-base.z    the 1080x1350 card as deflated RGBA: header, headline, footer
 *   assets/codes-text.z    alpha masks for ASCII 32-126 and "·" in three faces (big, mid, small)
 *   assets/codes-card.json each face's cell, baseline and advances, and the card's size
 *
 * lib/codescard.js writes the date, the x5 code and the rungs onto the base.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ASSETS = path.join(__dirname, "..", "assets");
const W = 1080, H = 1350;
const FACES = {
  big: "800 150px 'Saira Condensed'",
  mid: "800 50px 'Plus Jakarta Sans'",
  small: "600 32px 'Plus Jakarta Sans'",
};

const BASE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Saira+Condensed:wght@700;800&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:#0D0D0F}
.c{width:${W}px;height:${H}px;box-sizing:border-box;padding:84px 80px 70px;background:#0D0D0F;color:#F2F1F0;font-family:'Plus Jakarta Sans',sans-serif;display:flex;flex-direction:column;position:relative;overflow:hidden}
.c:before{content:"";position:absolute;right:-180px;top:-200px;width:720px;height:720px;border-radius:50%;background:radial-gradient(closest-side,rgba(242,184,75,.16),transparent)}
.top{display:flex;align-items:center;gap:22px}
.hat{width:72px;height:72px;border-radius:14px;background:rgba(59,130,246,.18);display:grid;place-items:center;color:#7DB3FF}
.hat svg{width:42px;height:42px}
.k{font:800 34px/1 'Saira Condensed';letter-spacing:.02em;color:#A3A0A6;text-transform:uppercase}
h1{margin:34px 0 0;font:800 128px/0.92 'Saira Condensed';text-transform:uppercase}
h1 em{font-style:normal;color:#F2B84B}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:28px;font-weight:700;color:#A3A0A6}
.foot b{color:#F2F1F0;font-size:34px}
.r{color:#E63946}
</style></head><body>
<div class="c" id="card">
  <div class="top"><span class="hat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5L6.5 17.5h11z"/><path d="M3 20.5c3-1.4 15-1.4 18 0"/><path d="M12 9.2l.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2z" fill="currentColor" stroke-width="1"/></svg></span>
  <span class="k">Merlin's Pick</span></div>
  <h1>Today's<br><em>codes</em></h1>
  <div class="foot"><span><b>soccerwizard.live</b><br>All six bookies</span><span><span class="r">18+</span> &middot; Play responsibly</span></div>
</div></body></html>`;

(async () => {
  const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const pg = await b.newPage();
  await pg.setViewport({ width: W, height: H });
  await pg.setContent(BASE, { waitUntil: "networkidle0" });
  await pg.evaluate(async (faces) => { for (const f of Object.values(faces)) await document.fonts.load(f); await document.fonts.ready; }, FACES);
  const png = await (await pg.$("#card")).screenshot({ type: "png" });

  const out = await pg.evaluate(async (pngB64, faces, W, H) => {
    const img = new Image(); img.src = "data:image/png;base64," + pngB64; await img.decode();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
    const base = b64(new Uint8Array(x.getImageData(0, 0, W, H).data.buffer));
    let CHARS = ""; for (let k = 32; k <= 126; k++) CHARS += String.fromCharCode(k); CHARS += "·";
    const meta = { chars: CHARS, faces: {} }, parts = [];
    let off = 0;
    for (const [name, font] of Object.entries(faces)) {
      x.font = font; let asc = 0, desc = 0, right = 0; const adv = [];
      for (const ch of CHARS) { const m = x.measureText(ch); asc = Math.max(asc, m.actualBoundingBoxAscent);
        desc = Math.max(desc, m.actualBoundingBoxDescent); right = Math.max(right, m.actualBoundingBoxRight); adv.push(Math.round(m.width * 100) / 100); }
      const PAD = 6, cw = Math.ceil(right) + PAD * 2, base = Math.ceil(asc) + 2, ch = base + Math.ceil(desc) + 2;
      const t = document.createElement("canvas"); t.width = cw; t.height = ch; const tx = t.getContext("2d");
      const flat = new Uint8Array(CHARS.length * cw * ch); let k = 0;
      for (const g of CHARS) { tx.clearRect(0, 0, cw, ch); tx.font = font; tx.fillStyle = "#fff"; tx.textBaseline = "alphabetic";
        tx.fillText(g, PAD, base); const d = tx.getImageData(0, 0, cw, ch).data; for (let i = 3; i < d.length; i += 4) flat[k++] = d[i]; }
      meta.faces[name] = { off, cell: { w: cw, h: ch }, baseline: base, pad: PAD, advances: adv };
      off += flat.length; parts.push(flat);
    }
    const all = new Uint8Array(off); let p = 0; for (const f of parts) { all.set(f, p); p += f.length; }
    return { base, text: b64(all), meta };
  }, png.toString("base64"), FACES, W, H);
  await b.close();

  fs.writeFileSync(path.join(ASSETS, "codes-base.z"), zlib.deflateSync(Buffer.from(out.base, "base64"), { level: 9 }));
  fs.writeFileSync(path.join(ASSETS, "codes-text.z"), zlib.deflateSync(Buffer.from(out.text, "base64"), { level: 9 }));
  fs.writeFileSync(path.join(ASSETS, "codes-card.json"), JSON.stringify(Object.assign({ w: W, h: H }, out.meta)));
  console.log("baked codes card");
})();
