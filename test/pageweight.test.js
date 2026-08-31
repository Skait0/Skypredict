"use strict";

/**
 * A first load has to fit down a bad connection.
 *
 * Reported with a screenshot: "Safari couldn't open the page because the server
 * stopped responding", two bars of LTE. The server was fine. A first load came
 * to 1.6 MB and Safari gave up partway through - at roughly 1.5 Mbps that is
 * about eight seconds of transfer before anything renders.
 *
 * Two thirds of the excess was not the app at all:
 *
 *   wiz-sig.png    394 KB, drawn at 42px tall in the masthead
 *   app-icon.png   297 KB, a favicon, fetched during first paint
 *
 * Both are fixed, and this file exists so they cannot quietly come back. The
 * failure mode is invisible on a desk: it looks perfect on wifi and times out
 * on a phone in a bad spot, which is most of the audience.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const index = fs.readFileSync(path.join(PUB, "index.html"), "utf8");

const kb = (f) => Math.round(fs.statSync(path.join(PUB, f)).size / 1024);
const png = (f) => {
  const b = fs.readFileSync(path.join(PUB, f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kb: Math.round(b.length / 1024) };
};

test("the masthead mark is sized for the masthead", () => {
  /* It renders at 42px tall, and 30px in the footer. It is also drawn into the
     share card at 230px by scripts/mkogbase.js, which is why it is kept at 256
     rather than the ~126 a 3x phone needs. One source, big enough for its
     largest use and no bigger. */
  const s = png("wiz-sig.png");
  assert.ok(s.h <= 320, "wiz-sig.png is " + s.h + "px tall; nothing draws it above 230");
  assert.ok(s.h >= 230, "wiz-sig.png is " + s.h + "px tall, too small for the share card");
  assert.ok(s.kb <= 150, "wiz-sig.png is " + s.kb + " KB; it was 394 KB and timed out phones");
});

test("no oversized image is fetched during first paint", () => {
  /* Every rel=icon and every <img> in the markup is pulled before the page is
     usable. The manifest is not - an install looks there later - which is why
     the 512 icon lives only in the manifest now. */
  const refs = [...new Set([...index.matchAll(/(?:href|src)="\/([^"]+\.(?:png|jpe?g|webp))"/g)]
    .map((m) => m[1]))];
  assert.ok(refs.length > 0, "no images referenced at all - has the markup changed?");
  refs.forEach((f) => {
    let size;
    try { size = kb(f); } catch (e) { return; }   /* generated at build time */
    assert.ok(size <= 150,
      f + " is " + size + " KB and is fetched on first paint. Budget is 150 KB. " +
      "app-icon.png (297 KB) was linked here and cost a third of the page weight.");
  });
});

test("the 512 icon is reachable for an install, just not on first paint", () => {
  assert.ok(!/rel="icon"[^>]*sizes="512x512"/.test(index),
    "the 512 icon is linked in the markup again, which makes every visitor download it");
  const mf = JSON.parse(fs.readFileSync(path.join(PUB, "manifest.webmanifest"), "utf8"));
  assert.ok((mf.icons || []).some((i) => /app-icon\.png/.test(i.src)),
    "removing the link is only safe while the manifest still offers it to an install");
});

test("a favicon and an apple-touch icon are still declared", () => {
  /* Dropping one heavy icon must not drop the light ones with it. */
  assert.match(index, /rel="icon"[^>]*sizes="32x32"/, "no favicon");
  assert.match(index, /rel="apple-touch-icon"/, "no apple-touch icon, so iOS picks a screenshot");
});

test("the whole first load stays inside a phone budget", () => {
  /* index.html here is the unsplit source; the served page is the same bytes
     with the CSS and JS in separate files, so the total is what matters. The
     baked payload is fetched immediately too. */
  let total = Math.round(fs.statSync(path.join(PUB, "index.html")).size / 1024);
  try { total += kb("predictions.json"); } catch (e) { /* not built yet */ }
  [...new Set([...index.matchAll(/(?:href|src)="\/([^"]+\.(?:png|jpe?g|webp))"/g)]
    .map((m) => m[1]))].forEach((f) => { try { total += kb(f); } catch (e) {} });

  assert.ok(total <= 1200,
    "a first load is about " + total + " KB. It was 1,600 KB when phones on LTE " +
    "started timing out. Something heavy has been added back.");
});
