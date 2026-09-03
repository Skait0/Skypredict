"use strict";

/**
 * What the browser error reporter is allowed to throw away.
 *
 * `allowUrls:[location.origin]` was supposed to keep third-party noise out,
 * and it cannot: it filters on the URL in the stack frame, and a script
 * INJECTED into the page reports the document's own URL. That is
 * location.origin, so it passes.
 *
 * On 2 September 2026 an iOS webview raised "Can't find variable: CONFIG" from
 * a function called updateGapFiller. Neither identifier appears anywhere in
 * our bundle, this HTML, or the analytics script, and only two scripts load -
 * both ours. The campaign drives X traffic, which opens links in an in-app
 * browser, which is exactly the thing that injects these.
 *
 * So it is filtered by message. The danger of doing that is obvious and is
 * what these tests exist for: a filter written slightly too wide silences OUR
 * undefined variables, which is the most useful class of error this reporter
 * catches, and it does so invisibly - the events simply never arrive, and an
 * empty Sentry looks exactly like a healthy one.
 *
 * The patterns are lifted out of index.html and run for real. Retyping them
 * here would test a copy and let the copy drift.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The identifiers we have agreed to drop, each one traced to an in-app
   browser injecting script into our page. Adding to this list is the
   deliberate act; widening a pattern is not. */
const SILENCED = ["CONFIG", "currentInset", "webkit"];

/* The array as the browser actually receives it. */
function ignorePatterns() {
  const at = HTML.indexOf("ignoreErrors:[");
  assert.notStrictEqual(at, -1, "the reporter must still declare ignoreErrors");
  /* Evaluated as JavaScript, which is precisely what the browser does with
     it - not scanned for regex-shaped text. The scanner this replaces read a
     trailing `// WebKit` comment as the literal / WebKit /, and then, once
     comments were stripped, silently produced one meaningless pattern that
     matched nothing at all. A filter that matches nothing is invisible: every
     "must not be silenced" test below passes perfectly against it. */
  const inner = HTML.slice(at + "ignoreErrors:".length,
                           HTML.indexOf("]", at) + 1);
  let out;
  try {
    out = eval(inner);                       // an array literal of RegExps
  } catch (e) {
    assert.fail("ignoreErrors is not a valid array literal: " + e.message +
                "\n" + inner);
  }
  assert.ok(Array.isArray(out) && out.length,
            "expected a non-empty array, got: " + inner);
  for (const re of out) {
    assert.ok(re instanceof RegExp,
              "every entry must be a RegExp, got " + typeof re + ": " + re);
  }
  return out;
}

const ignored = (msg) => ignorePatterns().some((re) => re.test(msg));

/* ------------------------------------------------- what it must silence */

test("the injected error we actually saw is dropped", () => {
  assert.strictEqual(ignored("Can't find variable: CONFIG"), true);
});

test("and the same fault in Chrome's wording", () => {
  /* One engine says "Can't find variable: X", the other "X is not defined".
     Filtering only the phrasing that happened to reach us first would let the
     identical event back in from a different browser. */
  assert.strictEqual(ignored("CONFIG is not defined"), true);
  assert.strictEqual(ignored("ReferenceError: CONFIG is not defined"), true);
});

/* --------------------------------------- what it must NEVER silence */

test("our own undefined variables still get reported", () => {
  /* The whole risk of message filtering, in one test. Every one of these is a
     real function or object in this app; if a rename ever leaves one dangling
     at runtime, that error is the only thing that will tell us. */
  for (const msg of [
    "Can't find variable: fixtureById",
    "bookTakes is not defined",
    "Can't find variable: slipPayload",
    "renderMySheet is not defined",
    "Can't find variable: dropUnbookable",
  ]) {
    assert.strictEqual(ignored(msg), false, "silenced our own error: " + msg);
  }
});

test("a name that merely starts with CONFIG is not swallowed", () => {
  /* Why the patterns carry word boundaries. Without them, anything beginning
     CONFIG - a variable we might genuinely add - would vanish. */
  for (const msg of [
    "CONFIGURATION is not defined",
    "Can't find variable: CONFIG_URL",
    "CONFIGS is not defined",
  ]) {
    assert.strictEqual(ignored(msg), false, "over-broad, swallowed: " + msg);
  }
});

test("the ordinary runtime errors this reporter exists for still arrive", () => {
  for (const msg of [
    "undefined is not an object (evaluating 'f.odds')",
    "Cannot read properties of undefined (reading 'code')",
    "Failed to fetch",
    "null is not an object (evaluating 'document.getElementById(...).value')",
    "Maximum call stack size exceeded",
  ]) {
    assert.strictEqual(ignored(msg), false, "silenced a real error: " + msg);
  }
});

test("the filter is a list of identifiers, not a blanket error-type rule", () => {
  /* A pattern like /ReferenceError/ would have "fixed" the noise and blinded
     the reporter at the same time, and nothing above would have caught it -
     every sample here would still be dropped and the tests would just be
     asserting a broken filter. So this checks the SHAPE of the rule. */
  for (const re of ignorePatterns()) {
    assert.strictEqual(re.test("ReferenceError: something is not defined"), false,
      "matches any ReferenceError, which is far too wide: " + re);
    /* Every pattern must still NAME what it silences. The list is explicit so
       that adding a new silence is a deliberate edit here as well as in the
       page - a pattern for an identifier nobody has written down is exactly
       the blanket rule this test exists to stop. */
    assert.ok(SILENCED.some((id) => re.source.indexOf(id) >= 0),
      "every pattern must name one of the identifiers we have agreed to " +
      "silence (" + SILENCED.join(", ") + "): " + re);
  }
});

/* ------------------------------------------------------- the other layer */

test("allowUrls is still set, because this only covers what it cannot", () => {
  /* The two do different jobs. allowUrls stops errors from scripts loaded off
     another origin; this stops errors injected INTO our page, which carry our
     own URL. Dropping either leaves a hole. */
  assert.match(HTML, /allowUrls:\[location\.origin\]/);
});

test("the reporter still cannot break the page", () => {
  /* It sits on every page load. The init is wrapped, and a blocked CDN has to
     be survivable - this was true before the filter and must stay true. */
  /* Pinned on the span between the loader callback and the init call, not on
     a window around it: a loose search found the unrelated `try{` guarding the
     ?nosentry check a few lines above and passed happily with the init's own
     wrapper removed. */
  const from = HTML.indexOf("s.onload=function(){");
  const to = HTML.indexOf("window.Sentry.init(");
  assert.ok(from !== -1 && to > from, "the loader callback must still wrap the init");
  assert.match(HTML.slice(from, to), /try\s*\{/,
    "the init must sit inside a try - an SDK that throws must not break the page");
  assert.match(HTML, /s\.onerror=function\(\)\{/,
    "a blocked or offline CDN must fail silent");
});
