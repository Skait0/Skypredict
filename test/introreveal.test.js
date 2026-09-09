"use strict";

/**
 * The reveal clip has to be BUFFERED before Enter plays it.
 *
 * Reported as "the video is not smooth from the moment i click enter, kinda
 * skips a little". Two causes, both invisible to a reader and to a test that
 * only checks the video element exists:
 *
 *  1. The element is marked preload="none" so an idle reader is not charged
 *     for the clip. Arming it set `src` and called `load()` - which under that
 *     attribute buffers nothing. Measured on the live site: src set, twelve
 *     seconds later `readyState` still 0. Every tap raced a cold download.
 *  2. Playback started on `canplay`, which means one frame, not the whole
 *     clip - so it began and then ran out of buffer.
 *
 * Source-level, like the other gate tests: this is browser timing, and the
 * thing worth pinning is that the two lines never quietly come apart again.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function armRevealBody() {
  const from = src.indexOf("function armReveal(){");
  assert.ok(from > 0, "armReveal is gone from the gate");
  return src.slice(from, src.indexOf("\n  }", from));
}

test("arming the reveal turns preload on before it loads", () => {
  const body = armRevealBody();
  const pre = body.indexOf("reveal.preload=\"auto\"");
  const load = body.indexOf("reveal.load()");
  assert.ok(pre > 0, "preload is never flipped, so load() buffers nothing");
  assert.ok(load > pre, "preload must be set before load(), not after it");
});

test("the markup still asks for nothing until the gate decides", () => {
  /* The other half of the trade: a reader who never presses Enter pays for
     the loop and nothing else. */
  assert.match(src, /<video class="sw-g-reveal"[^>]*preload="none"/,
    "the reveal must start out preload=none");
});

test("Enter waits for the whole clip, not for the first frame", () => {
  const from = src.indexOf("if(!reveal.getAttribute(\"src\")) armReveal();");
  assert.ok(from > 0, "the Enter path has moved");
  /* To the end of onEnter, which is where runReveal is declared - the earlier
     `runReveal(land)` calls are inside the very block being tested. */
  const body = src.slice(from, src.indexOf("function runReveal", from));
  assert.match(body, /readyState < 4/,
    "readyState 4 is 'can play through'; 2 was the stutter");
  assert.ok(body.indexOf("canplaythrough") > 0, "canplaythrough is what starts it");
  /* canplay may still start it, but only after a grace - never immediately. */
  const cp = body.indexOf("\"canplay\"");
  assert.ok(cp > 0, "canplay is still the fallback");
  assert.match(body.slice(cp), /grace=setTimeout\(go, \d+\)/,
    "canplay must schedule the grace rather than play at once");
});

test("the intro assets are cached, because they are re-fetched otherwise", () => {
  /* They were served max-age=0, must-revalidate - Vercel's default for a
     static file with no rule - so a 776 KB clip was re-downloaded on every
     visit and no tap could ever find it ready. */
  const vc = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const rule = (vc.headers || []).find((h) => /^\/intro-/.test(h.source || ""));
  assert.ok(rule, "no Cache-Control rule covers /intro-*");
  const cc = rule.headers.find((h) => h.key === "Cache-Control");
  assert.ok(cc && /max-age=(\d+)/.test(cc.value), "the rule sets no max-age");
  assert.ok(Number(cc.value.match(/max-age=(\d+)/)[1]) >= 86400,
    "a day is the least that helps a once-a-day gate");
});
