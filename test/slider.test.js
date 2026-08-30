"use strict";

/**
 * The risk slider: why it looked stuck, and why it felt sticky.
 *
 * Reported: "look into the slider being stuck at 9 games... there isnt enough
 * games per slider movement... the slider button feels glitchy and sticky."
 *
 * Two separate faults, measured on the live board before touching anything.
 *
 * 1. STUCK. The slip size is capped by riskParams().maxGames — 3 at the safe
 *    end, 35 at the risky end — but it is also capped by how many fixtures in
 *    the current window carry a market clearing minConf. On the whole card
 *    (222 fixtures in scope) the dial always binds and the count tracks it
 *    exactly: 0->3, 20->9, 40->16, 60->22, 80->29, 100->35.
 *
 *    Narrow the window to Today + Late — 16 fixtures — and it becomes:
 *    0->3, 20->6, 40->7, 60->9, 80->9, 100->9. Stuck at 9 from about 60 up,
 *    because only 9 of those 16 fixtures produce a qualifying pick at all.
 *
 *    The slider was working. Nothing on screen said the pool had run out, and
 *    a control that keeps moving while its output does not is indistinguishable
 *    from a broken one. So the sub-line now says when the slip is everything
 *    the window has, which points at the fix — widen the window — instead of
 *    inviting more dragging.
 *
 * 2. STICKY. The input handler ran renderBuilder() synchronously on every
 *    `input` event. Measured here: renderBuilder 20.8ms, of which buildPicks
 *    is 11.8ms over the whole card. A range input fires `input` on every pixel
 *    of a drag, so several of those land inside one 16.7ms frame — on a phone,
 *    several times slower again. The thumb lags the finger. Now coalesced to
 *    one rebuild per animation frame, with the cheap visuals still immediate.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* riskParams reads DATA.fixtures for its pool size; stub it at a full card. */
const riskParams = new Function(
  "var DATA={fixtures:new Array(120).fill({})};" +
  "function notStarted(){return true;}" +
  grab("riskParams") + "\nreturn riskParams;")();

test("the dial spans a real range of slip sizes", () => {
  const at = (r) => riskParams(r).maxGames;
  assert.strictEqual(at(0), 3, "the safe end is a short slip");
  assert.ok(at(100) >= 30, "the risky end is a long one, got " + at(100));
  assert.ok(at(50) > at(20) && at(20) > at(0), "and it rises all the way");
});

test("every step of the dial moves the cap", () => {
  /* "there isnt enough games per slider movement" - the cap must not sit flat
     across a stretch of the track. It rises by about a third of a game per
     point, so three points is a game; what it must never do is plateau. */
  let flat = 0, worst = 0, run = 0;
  for (let r = 1; r <= 100; r++) {
    if (riskParams(r).maxGames === riskParams(r - 1).maxGames) { run++; worst = Math.max(worst, run); }
    else run = 0;
    if (run > 0) flat++;
  }
  assert.ok(worst <= 3,
    `the cap stays flat for ${worst} consecutive points of the dial - a stretch ` +
    `that long reads as a dead zone`);
});

test("confidence eases as risk rises, and never inverts", () => {
  /* The "slide per risk ratio": the floor has to fall monotonically, or a
     nudge toward risky can hand back a safer slip than the one before it. */
  let prev = Infinity;
  for (let r = 0; r <= 100; r += 5) {
    const c = riskParams(r).minConf;
    assert.ok(c <= prev + 1e-9,
      `minConf rose from ${prev.toFixed(3)} to ${c.toFixed(3)} at risk ${r}`);
    prev = c;
  }
  assert.ok(riskParams(0).minConf > riskParams(100).minConf,
    "the safe end must demand more confidence than the risky end");
});

/* ------------------------------------------------------------- the handler */

function riskHandler() {
  const i = src.indexOf('$("risk").addEventListener("input"');
  assert.ok(i > 0, "the slider input handler is gone");
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

test("dragging does not rebuild the slip on every pixel", () => {
  const h = riskHandler();
  assert.match(h, /requestAnimationFrame/,
    "the rebuild must be coalesced to a frame");
  assert.match(h, /if\(!RISK_RAF\)/,
    "and a queued rebuild must never be stacked on another");
  assert.doesNotMatch(h.replace(/requestAnimationFrame\(function\(\)\{[\s\S]*?\}\)/, ""),
    /renderBuilder\(\)/,
    "no synchronous renderBuilder is left in the drag path");
});

test("the cheap feedback still runs on every event", () => {
  /* The track and thumb must keep up with the finger even while the slip
     rebuild waits - that is the whole point of splitting them. */
  const h = riskHandler();
  const immediate = h.slice(0, h.indexOf("requestAnimationFrame"));
  assert.match(immediate, /BUILD\.risk=\+this\.value/, "the value is taken at once");
  assert.match(immediate, /backgroundSize/, "the fill is painted at once");
  assert.match(immediate, /data-zone/, "and the zone switches at once");
});

test("the slip settles on the value the drag ended at", () => {
  const i = src.indexOf('$("risk").addEventListener("change"');
  assert.ok(i > 0, "there must be a change handler for the end of the drag");
  const h = src.slice(i, i + 260);
  assert.match(h, /cancelAnimationFrame/, "any pending frame is dropped first");
  assert.match(h, /renderBuilder\(\)/, "and one authoritative rebuild runs");
});

test("the reader is told when the window, not the dial, is the limit", () => {
  const i = src.indexOf('$("riskSub").textContent');
  assert.ok(i > 0, "the sub-line is gone");
  const h = src.slice(Math.max(0, i - 200), i + 400);
  assert.match(h, /picks\.length < p\.maxGames/,
    "it has to compare what was built against what the dial asked for");
  assert.match(h, /clear the bar in this window/,
    "and say so, or a working slider reads as a broken one");
});
