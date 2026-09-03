"use strict";

/**
 * The hero band behind the headline.
 *
 * The top of the page was the page background and nothing else - the sticky
 * bar is `background:var(--bg)`, the same colour, so the masthead read as one
 * flat slab until `.stuck` drew a border on scroll. The band gives the
 * headline something to sit on.
 *
 * It is CSS only on purpose. A photograph would cost a request and 40-150KB,
 * need a second treatment for the light theme, and risk blocking first paint.
 * Page weight is not academic on this site: the WhatsApp preview already
 * failed once on it, and repeat visits re-download nothing only because every
 * asset is immutable.
 *
 * Each test here is a way the band could break silently - looking fine on the
 * machine it was built on and wrong somewhere else.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
/* Comments carry braces and quoted selectors; strip them before reading CSS. */
const css = src.replace(/\/\*[\s\S]*?\*\//g, " ");

const band = /\.intro::before\{([\s\S]*?)\n\}/.exec(css);
assert.ok(band, "the hero band rule must exist");
const BAND = band[1];

/* ------------------------------------------------ the full-bleed dependency */

test("the full bleed cannot introduce a horizontal scrollbar", () => {
  /* The band escapes .wrap's 1180px cap with left:50%;width:100vw. On a
     desktop with a visible scrollbar 100vw is WIDER than the content box, so
     the page would gain a horizontal scrollbar - `body{overflow-x:hidden}` is
     the only thing preventing it, and it is set for unrelated reasons three
     thousand lines away. If someone removes it, this band is why the page
     starts scrolling sideways.
     Measured after the change: scrollWidth === clientWidth at both 430px and
     1568px. */
  assert.match(BAND, /width:100vw/, "the band is full-bleed");
  const body = /\nbody\{([\s\S]*?)\}/.exec(css);
  assert.ok(body, "body must still be styled");
  assert.match(body[1], /overflow-x:hidden/,
    "body{overflow-x:hidden} is load-bearing for the 100vw hero band");
});

test("it sits behind the headline without a rule that touches a child", () => {
  /* The draw chip became a giant circle because a `>*` rule caught an element
     injected at runtime. Same shape of problem available here, same answer:
     a stacking context plus a negative z-index, and nothing addressing
     children at all. */
  const intro = /\n\.intro\{([^}]*)\}/.exec(css);
  assert.ok(intro, ".intro must still be styled");
  assert.match(intro[1], /isolation:isolate/,
    "without a stacking context the negative z-index escapes .intro and the " +
    "band hides behind the page background");
  assert.match(BAND, /z-index:-1/, "the band paints below the headline");
  assert.ok(!/\.intro\s*>\s*\*/.test(css),
    "no `>*` rule on .intro - that is how the draw chip broke, and the hero " +
    "is the other place on this page tempted to reach for it");
});

/* ------------------------------------------------------------ both themes */

test("every hero token is defined in BOTH themes", () => {
  /* A token defined in one theme and not the other does not fail loudly - it
     falls back to nothing and the band silently vanishes, or worse, keeps the
     dark value on a light page. */
  const dark = /:root, \[data-theme="dark"\]\{([\s\S]*?)\n\}/.exec(css);
  const light = /\[data-theme="light"\]\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(dark && light, "both theme blocks must exist");
  for (const tok of ["--hero-top", "--hero-glow", "--hero-line"]) {
    assert.ok(dark[1].includes(tok), tok + " missing from the dark theme");
    assert.ok(light[1].includes(tok), tok + " missing from the light theme");
  }
});

test("the light theme lifts less than the dark one", () => {
  /* "A full screen of near-white is a lamp pointed at the reader" is written
     at the top of the light block and cost a round of rework to learn. The
     band must not undo it: the red glow is pulled back because it saturates
     far harder against a warm page than a near-black one. */
  const alpha = (block, tok) =>
    Number(/rgba\([^)]*?,\s*(\.?\d+(?:\.\d+)?)\s*\)/.exec(
      new RegExp(tok + ":([^;]*);").exec(block)[1])[1]);
  const dark = /:root, \[data-theme="dark"\]\{([\s\S]*?)\n\}/.exec(css)[1];
  const light = /\[data-theme="light"\]\{([\s\S]*?)\n\}/.exec(css)[1];
  assert.ok(alpha(light, "--hero-glow") < alpha(dark, "--hero-glow"),
    "the red glow must be weaker on the light theme, not stronger");
});

/* ------------------------------------------------------------- the weight */

test("nothing here costs a request", () => {
  /* The whole reason this is CSS rather than an image. An http(s) url in the
     band is a second request on the critical path and, if it is a third-party
     host, a render-blocking one - the exact fault already fixed on the
     webfont. */
  assert.ok(!/url\(\s*["']?https?:/i.test(BAND),
    "the band must not fetch anything; inline the asset or use a gradient");
  assert.match(BAND, /url\("data:image\/svg\+xml/,
    "the pitch is an inline SVG data URI");
});

test("the inline pitch stays small", () => {
  /* It rides in a bundle every visitor downloads. A drawing this simple has no
     business being large, and an SVG pasted from a design tool would be. */
  const uri = /url\("(data:image\/svg\+xml[^"]*)"\)/.exec(BAND);
  assert.ok(uri, "the pitch data URI must be findable");
  assert.ok(uri[1].length < 1400,
    "the pitch SVG is " + uri[1].length + " bytes; keep it under 1400");
});

/* --------------------------------------------------------------- on phones */

test("the pitch is dropped on narrow screens but the band survives", () => {
  /* A hero graphic that crowds the words it exists to frame has stopped
     helping. Below the point where the drawing and the headline would overlap
     the drawing goes - and only the drawing: the gradients cost the headline
     nothing and they are what makes the band read as a band.
     Verified at 430px: two gradient layers, no SVG. */
  const mq = /@media\(max-width:860px\)\{\s*\.intro::before\{([\s\S]*?)\n\s*\}/.exec(css);
  assert.ok(mq, "the narrow-screen override must exist");
  assert.ok(!/svg\+xml/.test(mq[1]),
    "the pitch must not be drawn where it would sit under the headline");
  assert.match(mq[1], /radial-gradient/, "the glow stays");
  assert.match(mq[1], /linear-gradient/, "and so does the ground");
});
