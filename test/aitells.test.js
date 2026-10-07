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
  /* Except the Wizard mode toggle - owner's choice 7 Oct. Exactly these
     rules, each present once; violet anywhere else still fails. */
  const ALLOWED = [
    '.bld-mode-btn.on[data-mode="wizard"]{background:linear-gradient(120deg,#6d3bd4,#8b5cf6);\n' +
      '  box-shadow:inset 0 0 0 1px rgba(242,184,75,.55),0 2px 12px rgba(139,92,246,.5)}',
    '.bld-mode-btn.on[data-mode="wizard"] { box-shadow: 0 4px 18px rgba(139,92,246,.5); }',
  ];
  let rest = html.replace(/\r\n/g, "\n");
  for (const r of ALLOWED) {
    assert.strictEqual(rest.split(r).length, 2, "toggle rule present once: " + r.slice(0, 60));
    rest = rest.replace(r, "");
  }
  assert.doesNotMatch(rest, /#8b5cf6|#c084fc|#a78bfa|#6d3bd4|#2b1a5e|#1d1142|124,77,255|139,92,246|90,46,210/i);
});

test("no gradient text in the app", () => {
  assert.doesNotMatch(html, /background-clip:\s*text/);
  assert.match(html, /\.bld-title em\{font-style:normal;color:var\(--accent\)\}/);
});

test("the Wizard mode label is house red, not gold (gold is for odds, codes, totals)", () => {
  assert.match(html, /\.bmh-wiz b\{color:var\(--red-ink\)\}/);
  assert.match(html, /\.bld-coach li\.bc-wiz b\{color:var\(--red-ink\)\}/);
  assert.doesNotMatch(html, /(bmh-wiz|bc-wiz)[^{]*\{[^}]*--accent/);
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

test("no emoji pictographs anywhere in the app outside the entry gate", () => {
  /* The gate (head bootstrap, CSS, markup, its own script) is out of bounds
     and is cut out first. JS (⚽, surrogate pairs) and CSS ("\26a1")
     escapes are decoded, so an emoji cannot hide behind an escape.
     Emoji_Presentation is what renders as a picture: text glyphs such as
     the check mark or the star stay legal. */
  function cut(s, a, b) { const i = s.indexOf(a), j = s.indexOf(b, i + 1); assert.ok(i >= 0 && j > i, a); return s.slice(0, i) + s.slice(j); }
  let app = cut(html, "/* THE INTRO GATE, DECIDED BEFORE FIRST PAINT.", "/* Catch the install offer");
  app = cut(app, "/* ================= INTRO GATE", "/* THE WIZARD PAGE, TIGHTENED FOR A PHONE.");
  app = cut(app, '<div id="swGate"', "</script>");
  /* Outgoing share copy is message text for WhatsApp/X, not an icon in our
     UI - the wizard emoji there is the brand's posting voice (same as the X
     and Telegram posts). Only these two strings are let through. */
  app = app.split('"\\ud83e\\uddd9 My Soccerwizard slip').join('"My Soccerwizard slip');
  const dec = app
    .replace(/\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g, (m, a, b) => String.fromCharCode(parseInt(a, 16), parseInt(b, 16)))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/content:\s*["']\\([0-9a-fA-F]{2,6})/g, (m, h) => "content:'" + String.fromCodePoint(parseInt(h, 16)));
  const found = (dec.match(/\p{Emoji_Presentation}/gu) || []);
  assert.deepStrictEqual(found, [], "emoji found: " + found.join(" "));
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
