"use strict";
/* Task 4 (7 Oct 2026): the app keeps its character (dark, gold, red mark) but
   loses the generic "AI magic" tells - a violet fourth hue, gradient text,
   decorative infinite loops, emoji icons. These pin the removals so they do
   not drift back, and run the live ticker through its real renderer. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function fnSrc(name) {
  const i = html.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " exists");
  let d = 0, j = html.indexOf("{", i);
  for (; j < html.length; j++) { if (html[j] === "{") d++; else if (html[j] === "}" && --d === 0) break; }
  return html.slice(i, j + 1);
}

test("no violet: the builder speaks in the site's own tokens", () => {
  assert.doesNotMatch(html, /#8b5cf6|#c084fc|#a78bfa|#6d3bd4|#2b1a5e|#1d1142|124,77,255|139,92,246|90,46,210/i);
});

test("no gradient text in the app", () => {
  assert.doesNotMatch(html, /background-clip:\s*text/);
  assert.match(html, /\.bld-title em\{font-style:normal;color:var\(--accent\)\}/);
});

test("the decorative loops are gone, not just paused", () => {
  for (const k of ["tickscroll", "tkTagBlink", "goalTagBlink", "ctaRun", "orbBreath", "baFlicker",
    "wslSheen", "runePulse", "livePulse", "potdLivePulse", "scSheen", "sbSweep", "wspOrbDrift",
    "litPulse", "scoredGlow", "valpulse", "orbGlow", "tkscglow", "goalshot"]) {
    assert.doesNotMatch(html, new RegExp("@keyframes " + k + "\\b"), k + " keyframes");
    assert.doesNotMatch(html, new RegExp("animation:\\s*" + k + "\\b"), k + " in use");
  }
  assert.doesNotMatch(html, /class="cta-run"|class="ba-spark"/);
});

test("the live dot stays, calm, and stands still under reduced motion", () => {
  assert.match(html, /@keyframes liveCalm\{50%\{opacity:\.4\}\}/);
  const dot = html.indexOf(".live-dot{display:inline-block");
  const still = html.indexOf("@media(prefers-reduced-motion:reduce){.ys-live,.potd-status.potd-live .ld,.live-dot{animation:none}}");
  assert.ok(dot > 0 && still > dot, "reduced-motion rule comes after the dot rule, so it wins");
});

test("no emoji icons on the board", () => {
  assert.doesNotMatch(html, /🔥 Big odds|🔔 Follow|Telegram 🔮|content:"\\26a1"/);
});

test("bottom tab labels are at least 11px", () => {
  assert.match(html, /\.btab\{flex:1;[^}]*font-size:11px/);
});

test("the live ticker renders each event once and does not scroll itself", () => {
  const host = { innerHTML: "", style: {} };
  const wrap = { hidden: true };
  const els = { liveStripWrap: wrap, liveStrip: host, liveStripAll: null };
  const evs = [1, 2, 3, 4, 5].map((n) => ({ kind: "goal", home: "H" + n, sc: n + "-0", min: n + "'" }));
  const run = new Function("$", "tickerEvents", "tickerItemHTML", "LIVE", "document", "setView",
    fnSrc("renderLiveStrip") + "; renderLiveStrip();");
  run((id) => els[id], () => evs, (e) => "<i>" + e.home + "</i>", {},
    { documentElement: { classList: { contains: () => false } } }, () => {});
  assert.strictEqual(wrap.hidden, false);
  for (const e of evs) assert.strictEqual(host.innerHTML.split("<i>" + e.home + "</i>").length - 1, 1, e.home);
  assert.deepStrictEqual(host.style, {}, "no inline animation is set");
});
