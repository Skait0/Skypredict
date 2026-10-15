"use strict";
/* THE HOME PAGE, ALIVE (owner, 14 Oct 2026: "on mobile, the home page looks
   dead"; approved mock, "all of it"). Pins each piece and the rules it keeps:
   one moment per thing, real numbers, still under reduced motion, and nothing
   heavy on the first load. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

test("the Wizard's face sits beside the headline, with no image on the first load", () => {
  assert.match(src, /<div class="intro-row">\s*<h1 [^>]*>Who's winning <span>today\?<\/span><\/h1>/);
  assert.match(src, /<img class="wiz-face" id="wizFace" width="72" height="72" alt="The Wizard" tabindex="0" role="button" hidden>/,
    "no src in the markup: test/pageweight.test.js counts every <img src> as first-load weight");
  for (const f of ["wiz-hype", "wiz-crystal2", "wiz-landed", "wiz-think"])
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "emo", f + ".webp")), f);
});

test("yesterday's line and the Wizard's pose come from windowRecord(1), the recap's own numbers", () => {
  const r = grab("renderYday");
  assert.match(r, /windowRecord\(1\)/);
  assert.match(r, /yd\.correct\/yd\.total>=0\.7/, "hype at 70%+");
  assert.match(r, /yestCounts\(n\)\.pending/, "'so far' while results are still coming in");
  assert.match(src, /renderDaily\(\); renderProof\(\); renderYday\(\);/);
});

test("the code reveals and counts up after the loader, and Copy still copies the whole code", () => {
  const c = grab("ckReveal");
  assert.match(c, /if\(REDUCED\|\|!host\) return;/, "still under reduced motion");
  assert.match(src, /host\.hidden=false;\n\s*afterReveal\(function\(\)\{ ckReveal\(host\); \}\);/);
  assert.match(src, /copyText\(b\.getAttribute\("data-code"\)\)/, "the copy reads data-code, so wrapping the letters is safe");
});

test("rows carry a confidence meter and the day's top three wear gold", () => {
  const row = grab("listRowHTML");
  assert.match(row, /<i class='mtr' style='--p:/);
  assert.match(row, /t3\?" top3":""/);
  assert.match(grab("isTop3"), /slice\(0,3\)/);
  assert.match(src, /@supports \(animation-timeline:view\(\)\)\{html:not\(\.reduce\) \.mtr b\{animation:mtrFill/, "no script: scroll-driven, full where unsupported");
});

test("every new motion stops under reduced motion", () => {
  assert.match(src, /@media \(prefers-reduced-motion:reduce\)\{\.wiz-face,\.wiz-face\.tip,\.ck-rev span,\.ck-chip\.ck-ok,\.tk-sc \.glow,\.tk-item\.flash,\.mtr b\{animation:none!important\}\}/);
});

test("the live strip sits above the board on phones too, and the loader waits for its first answer", () => {
  assert.match(src, /window\.swLiveReady=fetchLive\(\);/);
  assert.match(src, /if\(mq\.matches\)\{\n(?:.*\n){0,3}?\s*if\(w\.nextElementSibling!==g\) g\.parentNode\.insertBefore\(w,g\);/);
});

/* Owner, 14 Oct 2026: "the live strip doesnt flash the new goal". A fresh load
   had no earlier score to compare with, and the bump was one digit. Proved in a
   headless run with a faked /api/live: in-session 0-0 -> 1-0 and after a reload
   1-0 -> 2-0 both put tkWash on the tile and tkGoal on the digit. */
test("a goal flashes the whole tile, and a goal scored while the page was shut flashes on return", () => {
  assert.match(src, /localStorage\.getItem\("sw\.liveprev"\)/);
  assert.match(src, /Date\.now\(\)-sp\.at<3\*3600e3/, "kept three hours");
  assert.match(src, /localStorage\.setItem\("sw\.liveprev",JSON\.stringify\(\{at:Date\.now\(\),s:LIVE\.prev\}\)\)/);
  assert.match(src, /html:not\(\.reduce\) \.tk-item\.flash\{border-radius:var\(--r-md\);animation:tkWash 2s/);
  assert.match(src, /\.tk-sc \.glow,\.tk-item\.flash,\.mtr b\{animation:none!important\}/, "still under reduced motion");
});

test("the header logo steps aside on the home page only, where the big Wizard stands in", () => {
  assert.match(src, /html\.mode-pred \.logo \.sig\{display:none\}/);
  assert.match(src, /<img class="sig" src="\/wiz-mark\.png" alt="">/, "still in the header for every other page");
});
