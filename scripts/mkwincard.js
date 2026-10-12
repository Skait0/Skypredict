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
 * Run: node scripts/mkwincard.js   (opens a headless Chrome itself, then exits)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUB = path.join(__dirname, "..", "public");
const ASSETS = path.join(__dirname, "..", "assets");
const PORT = 8095;
const W = 1568, H = 772;
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
<style>body{margin:0;background:#111;color:#ccc;font:14px system-ui}canvas{display:block;width:784px;height:386px}</style>
</head><body><canvas id="c" width="${W}" height="${H}"></canvas><p id="s">rendering…</p>
<script>
const W = ${W}, H = ${H}, GAMES_CELLS = ${GAMES_CELLS}, ODDS_CELLS = ${ODDS_CELLS};
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

  for (const [id, title] of RANKS) {
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

    x.font = "600 30px 'Plus Jakarta Sans', system-ui, sans-serif"; x.fillStyle = MUTE;
    x.fillText("Built by the Wizard in one tap. Name your payout, or slide your risk.", 784, 660);
    x.font = "700 28px 'Plus Jakarta Sans', system-ui, sans-serif"; x.fillStyle = RED;
    x.fillText("soccerwizard.live", 744, 714);
    x.fillStyle = MUTE; x.font = "700 24px 'Plus Jakarta Sans', system-ui, sans-serif";
    x.fillText("· 18+", 884, 714);

    await fetch("/base?rank=" + id, { method: "POST", body: new Uint8Array(x.getImageData(0, 0, W, H).data) });
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
      const rank = u.searchParams.get("rank");
      if (!RANKS.some((r) => r[0] === rank)) { res.writeHead(400); return res.end("bad rank"); }
      const z = zlib.deflateSync(buf, { level: 9 });
      fs.writeFileSync(path.join(ASSETS, "win-base-" + rank + ".z"), z);
      console.log("base " + rank + " -> " + z.length + " bytes");
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
