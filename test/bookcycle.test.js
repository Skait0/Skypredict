"use strict";

/**
 * "Free SportyBet code in one tap", where the name flickers to the other two
 * books we can produce a code for.
 *
 * Everything asserted here is something that looks perfectly fine in the CSS
 * and does nothing on the page. Both were found by measuring in a browser
 * rather than by reading, and neither would fail a rendering test either -
 * the line simply sits there looking slightly wrong forever.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the slot is SportyBet's width and a wider visitor is scaled to fit", () => {
  /* A grid container's automatic minimum is its content, so a width narrower
     than the longest name is ignored - the box stays as wide as
     "football.com" and the hole before "code" never closes. A transform does
     not change the layout box either, so this is load-bearing even though
     nothing animates the width. It was found by measuring in a browser; the
     CSS reads perfectly well without it. */
  assert.match(src, /\.bkc\{[^}]*min-width:0/,
    "without min-width:0 the width set in startBookCycle is silently floored");
  /* And the column has to be pinned to the container. A width on a grid
     container does not constrain its automatic track: the column stayed as
     wide as "football.com" while the box was 63px, so every name was centred
     in a column that overflowed by 18px and SportyBet sat on top of the word
     "code". Reported from a phone, but it was true at every width. */
  assert.match(src, /\.bkc\{[^}]*grid-template-columns:minmax\(0,1fr\)/,
    "an auto track ignores the container width and the names overflow the slot");
  const fn = src.slice(src.indexOf("function startBookCycle()"),
                       src.indexOf("function loadBet9jaSoon"));
  assert.match(fn, /host\.style\.width=w\[0\]\+"px"/,
    "the slot takes the resting name's width, not the widest");
  assert.match(fn, /w\[i\] > w\[0\].*scale\(/,
    "and only a name too wide for it is scaled down");
  assert.doesNotMatch(fn, /scaleX\(/,
    "uniform scale: squeezing one axis warps letterforms, and these are logos");
});

test("the sentence is one flex item", () => {
  /* .trust-i is an inline-flex row with gap:7px, which exists to space the
     dotted separators BETWEEN trust items. With the words as bare children of
     it, that gap lands between "Free", the name and "code in one tap" too -
     three loose gaps in the middle of a sentence. */
  assert.match(src, /<span class="bk-line">Free <b class="bkc"/,
    "the whole sentence must be wrapped, or the flex gap breaks it up");
  assert.match(src, /\.bk-line\{display:inline\}/);
});

test("SportyBet is where it rests", () => {
  /* This is a SportyBet site. Cycling evenly through three names would say
     the opposite of what is true, so the other two are excursions and the
     line returns to SportyBet after each. */
  const fn = src.slice(src.indexOf("function startBookCycle()"),
                       src.indexOf("function loadBet9jaSoon"));
  assert.match(fn, /var home=items\[0\], away=items\.slice\(1\)/,
    "one home name and the rest are visitors");
  assert.match(fn, /swap\(other,home\)/, "and every excursion comes back");
  assert.match(src, /class="bkc-i on" data-bk="sporty"/,
    "SportyBet is the one showing before any script runs");
});

test("it does not move for a reader who asked it not to", () => {
  const fn = src.slice(src.indexOf("function startBookCycle()"),
                       src.indexOf("function loadBet9jaSoon"));
  assert.match(fn, /prefers-reduced-motion: reduce/);
  /* The measure() call must come BEFORE that return, or a reduced-motion
     reader gets a box with no width at all. */
  assert.ok(fn.indexOf("measure)") < fn.indexOf("prefers-reduced-motion"),
    "the width is still needed even when nothing animates");
  assert.match(fn, /visibilitychange/, "and it stops when the tab is hidden");
});

test("the widths are measured after the font loads", () => {
  /* Measured against the fallback face they are a few pixels out, and stay
     out for the rest of the session. */
  const fn = src.slice(src.indexOf("function startBookCycle()"),
                       src.indexOf("function loadBet9jaSoon"));
  assert.match(fn, /document\.fonts\?document\.fonts\.ready/);
});

test("the two halves of the glitch overlap", () => {
  /* The overlap IS the effect: for about a tenth of a second the outgoing name
     shows its lower bands and the incoming one its upper, so the eye reads a
     tear rather than a blink. Run end to end it looks like a flicker of the
     kind a browser does by accident. */
  const fn = src.slice(src.indexOf("function startBookCycle()"),
                       src.indexOf("function loadBet9jaSoon"));
  const inAt = /to\.classList\.add\("on","glx-in"\);\s*\},(\d+)\)/.exec(fn);
  const outAt = /from\.classList\.remove\("on","glx-out"\);\s*\},(\d+)\)/.exec(fn);
  assert.ok(inAt && outAt, "both halves must be scheduled");
  assert.ok(Number(inAt[1]) < Number(outAt[1]),
    "the incoming name has to arrive before the outgoing one leaves");
});

test("the glitch tears in bands rather than fading", () => {
  assert.match(src, /@keyframes bkOut\{[\s\S]*?clip-path:inset/,
    "clip bands, not opacity");
  assert.match(src, /@keyframes bkIn\{[\s\S]*?clip-path:inset/);
  /* steps(1) between keyframes. Interpolating turns tearing into sliding,
     which reads as motion graphics; digital failure does not ease. */
  assert.match(src, /\.bkc-i\.glx-out\{animation:bkOut [^}]*steps\(1,end\)/);
  assert.match(src, /\.bkc-i\.glx-in\{animation:bkIn [^}]*steps\(1,end\)/);
  /* The channel split is what the eye recognises as a glitch at all. */
  assert.match(src, /@keyframes bkOut\{[\s\S]*?text-shadow:[^}]*rgba\(0,229,255/,
    "a cyan channel pulled against a red one");
});

test("every trust item after the first carries its separator dot", () => {
  /* The row separates its items with a ::before dot and suppresses only the
     first. A `.streak::before{content:none!important}` survived a redesign in
     which the streak stopped leading with a flame and started carrying a dot
     like everything else - so the row had one gap, after "last updated", and
     the two comments describing the intended behaviour sat right beside the
     rule defeating it. */
  assert.match(src, /\.trust-i::before\{content:""/);
  assert.match(src, /\.trust-i:first-child::before\{display:none\}/,
    "the first item leads the row, so it has no separator before it");
  assert.doesNotMatch(src, /\.streak::before\{content:none/,
    "that rule blanked the dot the streak is supposed to carry");
});

test("a wordmark inside a flex button is wrapped so the words keep their spaces", () => {
  /* .sc-go-btn is inline-flex so its contents centre. Bare words either side
     of the wordmark therefore become three anonymous flex items, and with no
     gap they butt together: "Build me aSportyBetslip". Reported from the
     sphere card. The same shape of bug, mirrored, put 7px gaps inside the
     hero sentence - a flex row is not a place to put a sentence. */
  assert.match(src, /<span class="sc-lbl">Build me a <span class="sbm">SportyBet<\/span> slip<\/span>/,
    "the label must be a single flex item");
  assert.match(src, /\.sc-lbl\{display:inline\}/);
});

test("the primary offer is a black pill and the mark is red on it", () => {
  assert.match(src, /\.sc-go-primary[^{]*\{[^}]*border-radius:999px/,
    "a pill, and it has to beat .sc-go-btn's own 10px");
  assert.match(src, /\.sc-go-primary \.sbm\{color:var\(--red\)!important\}/,
    "on black the mark is their red; on the red buttons it inherits white");
  /* The list that forces the mark to inherit exists so it does not vanish on
     a red ground. This button is no longer one of those. */
  assert.match(src, /\.code-open \.sbm,\.book-btn \.sbm,\.wsp-go \.sbm,\.slipbar \.sbm\{color:inherit\}/);
});

test("the match-rate script measures the matcher the site actually ships", () => {
  /* scripts/b9match.js gated the exact-name clock relaxation behind --wide
     while index.html applied it on every match, so the script reported 97.6%
     where the site was doing 98.4% - and the four "misses" it printed included
     two it would have paired. A measurement tool that disagrees with
     production is worse than no measurement tool: it sends you looking for
     aliases that are not missing. */
  const s = require("fs").readFileSync(
    require("path").join(__dirname, "..", "scripts", "b9match.js"), "utf8");
  assert.match(s, /const WIDE = true;/,
    "the relaxation ships, so it is not optional here");
  assert.doesNotMatch(s, /process\.argv\.includes\("--wide"\)/,
    "and it must not be behind a flag that can be left off");
});

test("nothing on a third-party host may block the first paint", () => {
  /* Reported: on LTE the page does not load at all, only on wifi. A plain
     <link rel=stylesheet> to fonts.googleapis.com is render-blocking, so the
     browser painted nothing until that request resolved - and the document
     already carries ~2,600 characters of server-rendered text. On wifi it
     answers instantly and the fault is invisible; on a Nigerian mobile network
     it can be slow, throttled or filtered, and the reader gets a blank screen.
     display=swap does not help: it governs the font FILE, not the stylesheet
     request in front of it. */
  const head = src.slice(0, src.indexOf("</head>"));
  /* The <noscript> copy is SUPPOSED to be a plain blocking link - that is the
     point of it, and it only ever runs for a reader with scripting off, who
     cannot be served by the onload trick. Matching tag by tag cannot see that
     a tag sits inside one, so those blocks come out first. */
  const live = head.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  const links = live.match(/<link[^>]+rel=["']?stylesheet[^>]*>/g) || [];
  for (const l of links) {
    if (!/https?:\/\//.test(l)) continue;             // same-origin is fine
    assert.match(l, /media=["']print["']/,
      "a third-party stylesheet must be fetched without blocking render: " + l.slice(0, 90));
  }
  assert.match(head, /onload="this\.media='all'/,
    "and it has to be promoted once it arrives, or the font never applies");
  assert.match(head, /<noscript><link rel="stylesheet"/,
    "with a plain link for readers who have scripting off");
});
