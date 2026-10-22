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
 *   assets/safer-base.z    the safer x20 card's base (22 Oct 2026, same faces and footer)
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

const BADGE = "data:image/png;base64," + fs.readFileSync(path.join(ASSETS, "wiz-badge.png")).toString("base64");
/* Every channel we post on, with its mark (owner, 22 Oct 2026: "we are promoting!"). */
const ICON = {
  x: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.2" fill="#fff" stroke="none"/></svg>',
  fb: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>',
  tg: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>',
};
const SOCIAL_CSS = `.soc{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;padding-top:26px;border-top:2px solid #2A2A30}
.soc span{display:flex;align-items:center;gap:16px;font-size:31px;font-weight:700;color:#F2F1F0}
.soc i{width:52px;height:52px;border-radius:12px;display:grid;place-items:center;flex:none}
.soc i svg{width:30px;height:30px}
.soc .x{background:#000;border:1px solid #3A3A40}.soc .ig{background:linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF)}
.soc .fb{background:#1877F2}.soc .tg{background:#229ED9}
.end{display:flex;justify-content:space-between;align-items:baseline;margin-top:26px;font-size:28px;font-weight:700;color:#A3A0A6}
.end b{color:#F2F1F0;font-size:36px}.end .r{color:#E63946}`;
const SOCIAL_FOOT = `<div class="soc"><span><i class="x">${ICON.x}</i>@soccerwizardhq</span><span><i class="ig">${ICON.ig}</i>@soccerwizard__</span>
  <span><i class="fb">${ICON.fb}</i>soccerwizardhq</span><span><i class="tg">${ICON.tg}</i>@soccerwizardTG</span></div>
  <div class="end"><b>soccerwizard.live</b><span><span class="r">18+</span> &middot; Play responsibly</span></div>`;

const page = (kicker, h1) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Saira+Condensed:wght@700;800&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:#0D0D0F}
.c{width:${W}px;height:${H}px;box-sizing:border-box;padding:84px 80px 70px;background:#0D0D0F;color:#F2F1F0;font-family:'Plus Jakarta Sans',sans-serif;display:flex;flex-direction:column;position:relative;overflow:hidden}
.c:before{content:"";position:absolute;right:-180px;top:-200px;width:720px;height:720px;border-radius:50%;background:radial-gradient(closest-side,rgba(242,184,75,.16),transparent)}
${SOCIAL_CSS}
.top{display:flex;align-items:center;gap:26px}
.top img{width:132px;height:132px;margin:-10px 0 -10px -12px}
.brand{font:800 64px/0.95 'Saira Condensed';letter-spacing:.01em;text-transform:uppercase}
.k{font:800 32px/1 'Saira Condensed';letter-spacing:.04em;color:#F2B84B;text-transform:uppercase;margin-top:8px}
h1{margin:28px 0 0;font:800 120px/0.92 'Saira Condensed';text-transform:uppercase}
h1 em{font-style:normal;color:#F2B84B}
</style></head><body>
<div class="c" id="card">
  <div class="top"><img src="${BADGE}" alt=""><div><div class="brand">Soccerwizard</div><div class="k">${kicker}</div></div></div>
  <h1>${h1}</h1>
  ${SOCIAL_FOOT}
</div></body></html>`;

(async () => {
  const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const pg = await b.newPage();
  await pg.setViewport({ width: W, height: H });
  await pg.setContent(page("Merlin's Pick &middot; daily codes", "Today's <em>codes</em>"), { waitUntil: "networkidle0" });
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
  /* THE SAFER X20 CARD (owner, 22 Oct 2026): the 12:00 post's picture, so Instagram gets it too.
     Same faces, same footer; lib/codescard.js buildSafer writes the day, the price and one row
     per bookie onto it. */
  await pg.setContent(page("Merlin's Pick &middot; every pick 72%+", "Safer <em>x20</em>"), { waitUntil: "load", timeout: 60000 });
  await pg.evaluate(async (faces) => { for (const f of Object.values(faces)) await document.fonts.load(f); await document.fonts.ready; }, FACES);
  const png2 = await (await pg.$("#card")).screenshot({ type: "png" });
  const safer = await pg.evaluate(async (pngB64, W, H) => {
    const img = new Image(); img.src = "data:image/png;base64," + pngB64; await img.decode();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const u8 = new Uint8Array(x.getImageData(0, 0, W, H).data.buffer);
    let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
    return btoa(s);
  }, png2.toString("base64"), W, H);
  await b.close();
  fs.writeFileSync(path.join(ASSETS, "safer-base.z"), zlib.deflateSync(Buffer.from(safer, "base64"), { level: 9 }));

  fs.writeFileSync(path.join(ASSETS, "codes-base.z"), zlib.deflateSync(Buffer.from(out.base, "base64"), { level: 9 }));
  fs.writeFileSync(path.join(ASSETS, "codes-text.z"), zlib.deflateSync(Buffer.from(out.text, "base64"), { level: 9 }));
  fs.writeFileSync(path.join(ASSETS, "codes-card.json"), JSON.stringify(Object.assign({ w: W, h: H }, out.meta)));
  console.log("baked codes card");
})();
