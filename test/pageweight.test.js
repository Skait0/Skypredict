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

/* ---------------------------------------------------------- the intro gate

   The budget above counts images and never video, so the gate walked straight
   through it: the poster tripped the limit at 1201 KB while 742 KB of loop went
   uncounted beside it. A guard with a hole that shape is worse than none,
   because it reads as cover.

   What a phone actually fetches when the gate shows is the poster plus the LEAN
   loop. The sharp set exists for desktop only and is chosen in script, never
   referenced in the markup - which is the property worth pinning, because the
   moment an -hd file appears in an attribute every phone downloads it. */

const introKb = (f) => { try { return kb(f); } catch (e) { return null; } };
/* Markup only. The first version of these checks matched
   `reveal.src="/intro-wizard-reveal"` inside the gate's own script and
   reported the reveal as part of first paint, which is the opposite of what
   that line does - it runs 1.2 seconds later. A script is not markup. */
const markup = index.replace(/<script[\s\S]*?<\/script>/g, "");

test("the gate's phone payload stays small", () => {
  const poster = introKb("intro-wizard-poster.jpg");
  const loop = introKb("intro-wizard-loop.mp4");
  assert.ok(poster !== null && loop !== null, "the gate's assets are missing");
  /* 420 KB: the poster paints immediately and the loop follows. Chosen against
     the same LTE the 1.6 MB page timed out on - about two seconds of transfer,
     and nothing waits on it because the copy is on a CSS timer. */
  assert.ok(poster + loop <= 420,
    "the gate costs a phone " + (poster + loop) + " KB before anything else " +
    "(poster " + poster + " + loop " + loop + "). Budget is 420 KB.");
});

test("the reveal is never part of the first load", () => {
  /* It is fetched 1.2s after the loop is running, on purpose, so the two never
     compete for the opening seconds. If it ever lands in the markup it becomes
     part of first paint instead. */
  assert.ok(!/(?:href|src)="\/intro-wizard-reveal/.test(markup),
    "the reveal is referenced in the markup, so it is fetched during first paint");
});

test("the sharp set is desktop-only and never in the markup", () => {
  assert.ok(!/(?:href|src|poster)="\/intro-wizard-[a-z-]*-hd\.mp4"/.test(markup),
    "an -hd file is referenced in an attribute, which makes every phone fetch it");
  const hdLoop = introKb("intro-wizard-loop-hd.mp4");
  if (hdLoop !== null) {
    /* Not a tight budget - desktop can afford it - but it should not drift into
       the megabytes unnoticed. */
    assert.ok(hdLoop <= 1100, "the sharp loop is " + hdLoop + " KB");
  }
});

test("both video sets exist, or the gate half works", () => {
  for (const f of ["intro-wizard-loop.mp4", "intro-wizard-reveal.mp4",
                   "intro-wizard-loop-hd.mp4", "intro-wizard-reveal-hd.mp4",
                   "intro-wizard-poster.jpg"]) {
    assert.ok(introKb(f) !== null, f + " is missing");
  }
});
