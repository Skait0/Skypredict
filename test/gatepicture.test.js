"use strict";
/* THE PORTRAIT INTRO MUST BE PICTURE ALL THE WAY DOWN.
 *
 * A phone can only ever see 496 x its aspect of the master's width - about
 * 229px - however wide the crop is, so the only way to pull back from the
 * wizard's face is to make the source taller than the master. For a while that
 * extra height was flat #0D0D0F, and the scrim went fully opaque partway down
 * to hide the seam where the bright beard met it. Between them they killed the
 * bottom quarter of every phone screen:
 *
 *   "im not sure i like the new way on mobile is with the black filling ..
 *    i kinda liked the fullscreen we had"
 *
 * It now carries 90px of the frame itself instead - scaled up, blurred, and
 * feathered in over 70px so the beard falls out of focus rather than stopping.
 *
 * This file exists because "pad it with the background colour" is the obvious
 * thing to reach for and it is the thing that was wrong. If someone re-pads it,
 * these fail. */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { execFileSync } = require("child_process");

const PUB = path.join(__dirname, "..", "public");

/* One frame, 8-bit grey, straight out of ffmpeg - no temp files. */
function greyFrame(file) {
  let buf;
  try {
    buf = execFileSync("ffmpeg",
      ["-v", "error", "-i", path.join(PUB, file), "-frames:v", "1",
       "-pix_fmt", "gray", "-f", "rawvideo", "-"],
      { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { return null; }          /* no ffmpeg on this machine */
  let dims;
  try {
    dims = execFileSync("ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
       "-of", "csv=p=0", path.join(PUB, file)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(",").map(Number);
  } catch (e) { return null; }
  const [w, h] = dims;
  if (!w || !h || buf.length < w * h) return null;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let sum = 0, sq = 0;
    for (let x = 0; x < w; x++) { const v = buf[y * w + x]; sum += v; sq += v * v; }
    const mean = sum / w;
    rows.push({ mean, std: Math.sqrt(Math.max(0, sq / w - mean * mean)) });
  }
  return { w, h, rows };
}

const PORTRAIT = ["intro-wizard-loop-p.mp4", "intro-wizard-reveal-p.mp4",
                  "intro-wizard-loop-p.av1.mp4", "intro-wizard-reveal-p.av1.mp4"];

test("no portrait intro file has a flat block pasted on the bottom", () => {
  for (const f of PORTRAIT) {
    const fr = greyFrame(f);
    if (!fr) return;
    /* A row of solid colour has essentially no variance. Real picture, even
       heavily blurred and heavily darkened, keeps some. */
    const flat = fr.rows.filter((r) => r.std < 1.5).length;
    assert.ok(flat === 0,
      f + " has " + flat + " flat rows. The bottom of the portrait cut must be " +
      "picture - blurred and faded is fine, a block of #0D0D0F is not.");
  }
});

test("the bottom edge of the portrait cut still has picture in it", () => {
  for (const f of PORTRAIT) {
    const fr = greyFrame(f);
    if (!fr) return;
    const last = fr.rows[fr.rows.length - 1];
    assert.ok(last.std > 4,
      f + " ends on a row with variance " + last.std.toFixed(2) + ". The picture " +
      "is supposed to run to the bottom edge, not fade to a flat colour before it.");
  }
});

test("there is no seam where the extension begins", () => {
  /* The old build had a hard step from bright beard to flat colour. The
     feather exists to remove it, so measure the step rather than trust it. */
  for (const f of PORTRAIT) {
    const fr = greyFrame(f);
    if (!fr) return;
    let worst = 0, at = 0;
    for (let y = Math.floor(fr.h * 0.6); y < fr.h - 1; y++) {
      const d = Math.abs(fr.rows[y + 1].mean - fr.rows[y].mean);
      if (d > worst) { worst = d; at = y; }
    }
    assert.ok(worst < 8,
      f + " steps " + worst.toFixed(1) + " levels between rows " + at + " and " +
      (at + 1) + ". That is a visible seam; the extension should be feathered in.");
  }
});

test("the portrait scrim never reaches solid, or the picture stops early", () => {
  /* The scrim used to hit #0D0D0F at 78% to bury the seam. With no seam left
     it must not, or the bottom of the screen goes dead again whatever the
     video does. */
  const fs = require("fs");
  const src = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  const blocks = src.match(/#swGate \.sw-g-scrim\{[\s\S]*?\}/g) || [];
  assert.ok(blocks.length >= 2, "the portrait scrim overrides are gone");
  for (const b of blocks) {
    assert.ok(!/#0D0D0F\s+\d+%/i.test(b),
      "a scrim reaches flat #0D0D0F before the bottom:\n" + b);
  }
});
