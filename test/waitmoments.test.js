"use strict";

/**
 * The loader-lab designs shipped 11 Oct 2026: two loader scenes picked by day,
 * and a match clock that shows real progress (ticket or code k of N).
 */

const test = require("node:test");
const assert = require("node:assert");
const { src, fn } = require("./books.js");

/* A tick or the clock: just enough DOM for clockSet. */
function fakeClock() {
  const ticks = Array.from({ length: 18 }, () => {
    const t = { on: false, classList: { toggle(c, v) { t.on = v; } } };
    return t;
  });
  const el = {
    attrs: {}, done: false, min: { textContent: "" },
    querySelectorAll: () => ticks,
    querySelector: () => el.min,
    setAttribute(k, v) { el.attrs[k] = v; },
    classList: { toggle(c, v) { el.done = v; } },
  };
  return { el, ticks };
}
const clockSet = new Function(fn("clockSet") + "\nreturn clockSet;")();

test("the clock fills in proportion to what is done, and only full time is done", () => {
  const { el, ticks } = fakeClock();
  clockSet(el, 1, 3);
  assert.strictEqual(el.min.textContent, "30'");
  assert.strictEqual(ticks.filter((t) => t.on).length, 6);
  assert.strictEqual(el.attrs["aria-valuenow"], 30);
  assert.strictEqual(el.done, false);
  clockSet(el, 3, 3);
  assert.strictEqual(el.min.textContent, "90'");
  assert.strictEqual(ticks.filter((t) => t.on).length, 18);
  assert.strictEqual(el.done, true);
  clockSet(el, 0, 2);
  assert.strictEqual(el.min.textContent, "0'");
  assert.strictEqual(ticks.filter((t) => t.on).length, 0);
});

test("the loader carries both scenes, and the day picker runs right after it", () => {
  const i = src.indexOf('<div class="loader" id="loader"');
  const end = src.indexOf("</script>", i);
  const block = src.slice(i, end);
  assert.ok(block.includes('class="ldr-ku"') && block.includes('class="ldr-co"'));
  assert.ok(block.includes('<symbol id="swBall"') && block.includes('<symbol id="swStar"'));
  assert.ok(/localStorage\.getItem\("sw\.loaderDay"\)/.test(block), "picker reads the day");
  assert.ok(/catch\(e\)\{\}/.test(block), "storage that throws must not break the page");
});
