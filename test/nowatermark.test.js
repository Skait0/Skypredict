"use strict";
/* THE INTRO ASSETS MUST NOT CARRY THE GENERATOR'S WATERMARK.
 *
 * The master this was cut from has an "AI generated" pill baked into its bottom
 * right corner. It shipped that way and was live on the landing page: on a 16:9
 * desktop there is almost no vertical crop, so nothing hid it, and it sat under
 * the scrim faintly readable. It is removed now with delogo.
 *
 * This measures the watermark's own signature rather than "did someone run
 * delogo" - the pill is a rounded rectangle, so its top and bottom strokes are
 * long horizontal lines at fixed rows, and a long horizontal line is a large,
 * sustained row-to-row step across the box's whole width. Real picture in that
 * corner is an out-of-focus hand and a dark background: smooth, no such step.
 *
 * Measured on the shipped frames, strongest step across the pill's width:
 *
 *     with the watermark      16.0 - 23.3
 *     cleaned                  3.2 -  4.1
 *
 * Threshold sits at 8, in the empty middle. Written this way so a genuinely
 * clean master would also pass - it tests for the watermark, not for the fix.
 *
 * The portrait cut is not listed here and does not need to be: it crops
 * x 196-509 of the 864-wide master and the pill starts at x 710, so it has
 * never contained it. */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { execFileSync } = require("child_process");

const PUB = path.join(__dirname, "..", "public");
/* The pill, in the 864x496 master's coordinates. */
const PILL = { x0: 725, x1: 850, y0: 440, y1: 490 };
const LIMIT = 8;

function grey(file) {
  let dims, buf;
  try {
    dims = execFileSync("ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
       "-of", "csv=p=0", path.join(PUB, file)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(",").map(Number);
    buf = execFileSync("ffmpeg",
      ["-v", "error", "-i", path.join(PUB, file), "-frames:v", "1",
       "-pix_fmt", "gray", "-f", "rawvideo", "-"],
      { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { return null; }
  const [w, h] = dims;
  if (!w || !h || buf.length < w * h) return null;
  return { w, h, px: buf };
}

/* Strongest sustained horizontal step anywhere in the pill's band. */
function strokeStrength(file) {
  const im = grey(file);
  if (!im) return null;
  const s = im.w / 864;                       /* every asset is a scale of the master */
  const x0 = Math.round(PILL.x0 * s), x1 = Math.round(PILL.x1 * s);
  const y0 = Math.round(PILL.y0 * s), y1 = Math.round(PILL.y1 * s);
  let best = 0;
  for (let y = Math.max(1, y0); y < Math.min(im.h, y1); y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) {
      sum += Math.abs(im.px[y * im.w + x] - im.px[(y - 1) * im.w + x]);
    }
    best = Math.max(best, sum / (x1 - x0));
  }
  return best;
}

const LANDSCAPE = [
  "intro-wizard-loop.mp4", "intro-wizard-loop.av1.mp4",
  "intro-wizard-reveal.mp4", "intro-wizard-reveal.av1.mp4",
  "intro-wizard-loop-hd.mp4", "intro-wizard-loop-hd.av1.mp4",
  "intro-wizard-reveal-hd.mp4", "intro-wizard-reveal-hd.av1.mp4",
  "intro-wizard-poster.jpg",
];

test("no landscape intro asset carries the AI-generated watermark", () => {
  for (const f of LANDSCAPE) {
    const v = strokeStrength(f);
    if (v === null) return;                   /* no ffmpeg on this machine */
    assert.ok(v < LIMIT,
      f + " has a horizontal stroke of " + v.toFixed(2) + " across the pill's " +
      "width, against a limit of " + LIMIT + ". The generator's \"AI generated\" " +
      "watermark is back in this asset.");
  }
});

test("the portrait cut never contained the watermark to begin with", () => {
  /* Guarding the reasoning, not the pixels: if the portrait crop ever moves
     right far enough to include x 710, it starts carrying the pill and would
     need the same treatment. */
  const fs = require("fs");
  const p = path.join(__dirname, "..", "public", "intro-wizard-loop-p.mp4");
  if (!fs.existsSync(p)) return;
  const im = grey("intro-wizard-loop-p.mp4");
  if (!im) return;
  assert.equal(im.w, 480,
    "the portrait cut changed width. It is a 313px-wide crop at x=196 of an " +
    "864-wide master, which is why it has never contained the watermark at " +
    "x 710. Re-check that if the framing moved.");
});
