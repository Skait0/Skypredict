"use strict";
/* THE BUILDER FILTER, 11 OCT 2026. The owner: "when i click on some option, the
 * shapes changes. also on web, its a little sticky and not smooth."
 *
 * Measured on the live page before the fix: a market tap ran 52ms, a league
 * tap 127ms, all before the pill could light; and an "on" market pill grew a
 * tick 19px wide. These pin the three fixes: the tap lights first and the
 * rebuild follows the paint, taps share one rebuild, and nothing about a pill's
 * box changes with its state.
 */
const test = require("node:test");
const assert = require("node:assert");
const { src, fn, decl } = require("./books.js");

function harness() {
  const frames = [], tasks = [], late = [];
  let renders = 0;
  const api = new Function("requestAnimationFrame", "setTimeout", "renderBuilder",
    decl("BLD_SOON") + "\n" + fn("afterPaint") + "\n" + fn("renderBuilderSoon") + "\n" + fn("lightChip") +
    "\nreturn {afterPaint:afterPaint, soon:renderBuilderSoon, light:lightChip};")(
    (f) => frames.push(f), (f, ms) => (ms ? late : tasks).push(f), () => renders++);
  const flush = () => { while (frames.length || tasks.length || late.length) { (frames.shift() || tasks.shift() || late.shift())(); } };
  return { api, frames, tasks, late, flush, renders: () => renders };
}

test("the rebuild waits for a painted frame, and taps before it share one", () => {
  const h = harness();
  h.api.soon(); h.api.soon(); h.api.soon();
  assert.strictEqual(h.renders(), 0, "nothing runs inside the tap");
  assert.strictEqual(h.frames.length, 1, "one frame booked for three taps");
  h.frames.shift()();
  assert.strictEqual(h.renders(), 0, "not inside the frame either - that is still before the paint");
  h.tasks.shift()();
  assert.strictEqual(h.renders(), 1, "once, after the paint");
  h.late.shift()();
  assert.strictEqual(h.renders(), 1, "the backstop does not run it a second time");
  h.api.soon(); h.flush();
  assert.strictEqual(h.renders(), 2, "and the next tap gets its own");
});

test("a hidden tab paints no frames, and the rebuild still happens once", () => {
  const h = harness();
  h.api.soon();
  h.late.shift()();
  assert.strictEqual(h.renders(), 1, "the 120ms backstop runs it");
  h.frames.shift()(); h.tasks.shift()();
  assert.strictEqual(h.renders(), 1, "and a frame that turns up later does not repeat it");
});

test("the pill lights at once, for eyes and for a screen reader", () => {
  const h = harness();
  const cls = new Set(), attrs = {};
  const chip = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) }, setAttribute: (k, v) => (attrs[k] = v) };
  h.api.light(chip, true);
  assert.ok(cls.has("on")); assert.strictEqual(attrs["aria-pressed"], "true");
  h.api.light(chip, false);
  assert.ok(!cls.has("on")); assert.strictEqual(attrs["aria-pressed"], "false");
});

test("every filter tap lights first and rebuilds after the paint", () => {
  assert.match(src, /lightChip\(c,WSP\.mk\[k\]\); renderBuilderSoon\(\); return;/, "wizard-only market");
  assert.match(src, /WSP\.mk\[k\]=BUILD\.mk\[k\];\s*lightChip\(c,BUILD\.mk\[k\]\);\s*renderBuilderSoon\(\);/, "market");
  assert.match(src, /setTod\(b\.getAttribute\("data-tod"\)\)\) return;[\s\S]{0,500}?paintScope\(\);\s*renderBuilderSoon\(\);/, "time of day");
  assert.match(src, /setScope\(b\.getAttribute\("data-scope"\)\)\) return;\s*BUILD\.removed=\{\}; BUILD\.touched=true;\s*paintScope\(\);\s*renderBuilderSoon\(\);/, "window");
  assert.match(src, /lg\.querySelectorAll\("\[data-btp\]"\)\.forEach\(function\(x\)\{ x\.classList\.toggle\("on",x===c\); \}\);/, "leagues");
});

test("a market pill keeps its shape: no tick when on, no hover lift or scale", () => {
  const chip = /return "<button class='mkt-chip"[\s\S]*?"<\/button>";/.exec(src)[0];
  assert.doesNotMatch(chip, /m5 12 5 5 9-10/, "the tick is gone");
  assert.match(chip, /aria-pressed='"\+\(enabled\?"true":"false"\)\+"'/, "the state is announced instead");
  assert.match(chip, /\(locked \? "<svg class='mk-st'/, "the padlock stays");
  assert.match(src, /#bldShared \.mkt-chip:hover,#bldShared \.mkt-chip\.locked:hover\{transform:none\}/);
  const rule = /#bldShared \.mkt-chip\{height:30px;[^}]*\}/.exec(src)[0];
  assert.match(rule, /transition:background-color[^;]*,border-color[^;]*,color[^;]*\}/, "only colour animates");
  assert.doesNotMatch(rule, /transition:[^;]*(transform|width|padding|all)/);
});
