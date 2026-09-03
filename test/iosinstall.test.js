"use strict";

/**
 * How an iPhone is told to install the app.
 *
 * iOS fires no beforeinstallprompt and never will, so tapping Install cannot
 * install anything - it can only say where Safari keeps the control. That was
 * a toast, which is the wrong shape for the job: the Share button is at the
 * BOTTOM of Safari, the toast is at the top, and it has gone by the time
 * anyone has looked down and back. A reader asked how to install on iOS, which
 * is the report that a transient hint is not an instruction.
 *
 * The part that matters most is the third case. An in-app browser - X,
 * Instagram, Facebook - has NO Add to Home Screen at all, and the campaign
 * drives X traffic, so that is not an edge case: it is the likeliest way an
 * iPhone reaches this site. Telling that reader to "tap Share" sends them
 * hunting for something their browser does not have.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)\s*function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const kind = new Function(grab("iosInstallKind") + "\nreturn iosInstallKind;")();

/* Real user-agent strings, not invented ones: a detector tested against
   strings written to match it proves only that it matches them. */
const UA = {
  safari:   "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chrome:   "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
  firefox:  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  edge:     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/126.0 Mobile/15E148 Safari/604.1",
  twitter:  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.52",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.35.108]",
  instagram:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 336.0.0.24.90",
};

test("Safari gets the Safari steps", () => {
  assert.strictEqual(kind(UA.safari), "safari");
});

test("Chrome for iOS is not mistaken for an in-app browser", () => {
  /* The trap in the obvious detection. `navigator.standalone === undefined` is
     true in Chrome for iOS as well as in a real in-app browser, so using it
     would tell a reader who CAN install to go and open Safari - sending a
     working install down a dead end. Detected on CriOS instead. */
  assert.strictEqual(kind(UA.chrome), "chrome");
});

test("X, Instagram and Facebook are told to open Safari first", () => {
  /* None of them has Add to Home Screen. This is the likeliest iPhone arrival
     on this site, because the campaign posts links on X. */
  for (const k of ["twitter", "facebook", "instagram"]) {
    assert.strictEqual(kind(UA[k]), "inapp", k + " must be treated as in-app");
  }
});

test("other iOS browsers are pointed at Safari without being called in-app", () => {
  assert.strictEqual(kind(UA.firefox), "other");
  assert.strictEqual(kind(UA.edge), "other");
});

test("junk input does not become an in-app verdict", () => {
  /* The in-app branch is the only one that tells somebody they CANNOT install.
     Reaching it by accident is the expensive mistake, so nothing unrecognised
     may land there. */
  for (const ua of [undefined, null, "", 0, "Mozilla/5.0", "totally unknown"]) {
    assert.notStrictEqual(kind(ua), "inapp",
      JSON.stringify(ua) + " must not be called an in-app browser");
  }
});

/* ------------------------------------------------------- the panel itself */

test("iOS gets steps that stay, not a toast that leaves", () => {
  /* The whole point. A toast is dismissed by time; the Share button is at the
     other end of the screen. */
  const src2 = src;
  assert.match(src2, /if\(_iOS\)\{ showIosSteps\(\); return; \}/,
    "the iOS branch must open the steps panel");
  const doInstall = grab("doInstall");
  assert.ok(!/swToast[^;]*Share icon/.test(doInstall),
    "the old transient Share-icon toast must be gone");
});

test("the steps show the Share glyph, not just the word", () => {
  /* "Tap the Share icon" means nothing until you have seen it, and it is not
     the same shape as the download arrow on our own install bar above it. */
  assert.match(src, /SHARE_ICON\s*=/, "there must be a share glyph");
  const fn = grab("showIosSteps");
  /* EVERY branch that says "Share button" must show it, not just one.
     Mutation-tested: dropping the glyph from the Safari branch alone left an
     "is it used anywhere" check passing, while the case most iPhones hit had
     lost the one thing that makes the instruction followable. */
  const shows = (fn.match(/SHARE_ICON/g) || []).length;
  /* Three of the four branches instruct on iOS Add to Home Screen - Safari,
     Chrome and other - and each has to show the glyph. The fourth, in-app,
     deliberately does NOT: the button it names is X's own share control, which
     looks nothing like the iOS one, and stamping the iOS glyph beside it would
     send the reader hunting for the wrong shape. */
  assert.ok(shows >= 3,
    "the glyph appears " + shows + " times; each of the three installable " +
    "branches must show it, or one of them tells the reader to find an icon " +
    "it never shows");
});

test("dismissing the install bar takes the steps with it", () => {
  /* Otherwise a dismissed offer leaves its instructions sitting on the page. */
  assert.match(src, /__hideIosSteps/, "the hide hook must exist");
  assert.match(src, /_hidNow=true;\s*\n?\s*window\.__hideIosSteps&&window\.__hideIosSteps\(\)/,
    "the bar's dismiss must hide the steps too");
});

test("the panel is in the markup and starts hidden", () => {
  assert.match(src, /<div class="ios-steps" id="iosSteps" hidden>/,
    "hidden until Install is tapped");
  assert.match(src, /id="iosStepsL"/, "the steps list");
  assert.match(src, /id="iosStepsN" hidden/, "the note, hidden until it has text");
});
