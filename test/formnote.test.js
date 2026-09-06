"use strict";

/**
 * SAYING HOW OLD THE FORM IS, AND ONLY WHEN IT MATTERS.
 *
 * The board looks identical whether the model was fitted on last night's
 * results or on last season's. During the football-data outage of 5-6 Sep 2026
 * the site stayed up on the committed floor - which was the point - but nine
 * divisions had any of the current season at all, six to thirty-six days
 * behind, and the rest were on 2025-26. Nothing on the page said so.
 *
 * `generatedAt` cannot say it either: it reports that the BOARD is ten minutes
 * old, which is true and completely misleading about the ratings underneath.
 *
 * So the payload now carries formThrough / formStaleDays / degradedSources and
 * the board head prints a line. These tests pin the part that is easy to get
 * wrong in both directions: staying quiet on an ordinary day, and never
 * staying quiet when the feed has actually failed.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

/* esc is injected rather than lifted: this is about the decision to speak, not
   about escaping, and the real esc drags half the page in with it. */
const noteFor = (DATA) =>
  new Function("DATA", "esc", grab("formNote") + "\nreturn formNote();")(
    DATA, (s) => String(s));

const text = (DATA) => noteFor(DATA).replace(/<[^>]+>/g, "");

test("silent on an ordinary day", () => {
  /* One or two days between rounds is normal football, not a fault. A warning
     that fires every week is one nobody reads by the time it matters. */
  assert.equal(noteFor({ formStaleDays: 0, degradedSources: 0, formThrough: "2026-09-06" }), "");
  assert.equal(noteFor({ formStaleDays: 1, degradedSources: 0, formThrough: "2026-09-05" }), "");
  assert.equal(noteFor({ formStaleDays: 2, degradedSources: 0, formThrough: "2026-09-04" }), "");
});

test("speaks once the form is old enough to matter, even with a healthy feed", () => {
  const out = text({ formStaleDays: 5, degradedSources: 0, formThrough: "2026-09-01" });
  assert.match(out, /5 days old/);
  assert.match(out, /2026-09-01/);
});

test("ALWAYS speaks when the results feed failed, however fresh the floor is", () => {
  /* The case that caused this. A build can serve every file from the floor and
     still look current - if the floor was committed yesterday, staleDays is
     small and a days-only rule would say nothing at all, while the model had
     quietly stopped tracking reality. Degraded is its own reason to speak. */
  const out = text({ formStaleDays: 0, degradedSources: 9, formThrough: "2026-09-06" });
  assert.notEqual(out, "", "said nothing while the feed was down");
  assert.match(out, /feed is unavailable/);
});

test("the real outage reads plainly", () => {
  const out = text({ formStaleDays: 6, degradedSources: 68, formThrough: "2026-08-31" });
  assert.match(out, /Form data is 6 days old/);
  assert.match(out, /results feed is unavailable/);
  assert.match(out, /2026-08-31/);
});

test("singular day is not written as '1 days'", () => {
  assert.match(text({ formStaleDays: 1, degradedSources: 3, formThrough: "2026-09-05" }),
    /is 1 day old/);
});

test("missing or malformed freshness data is silent, not broken", () => {
  /* An older payload baked before these fields existed must not print a note
     built from undefined - carrying a previous board forward is exactly the
     situation where that could happen. */
  for (const d of [{}, { formStaleDays: null }, { formStaleDays: undefined },
                   { formStaleDays: NaN }]) {
    assert.doesNotThrow(() => noteFor(d));
  }
  assert.equal(noteFor({}), "");
  assert.equal(noteFor({ formStaleDays: null, degradedSources: 68 }), "");
});

test("renderBoardHead actually prints it", () => {
  /* Test the caller, not just the logic - bugs have shipped past green tests
     in this codebase that asserted on a helper nobody called. */
  const head = grab("renderBoardHead");
  assert.match(head, /formNote\(\)/,
    "renderBoardHead no longer calls formNote, so the note is dead code");
});

test("the build stamps the fields the note reads", () => {
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  for (const field of ["formThrough", "formStaleDays", "degradedSources"]) {
    assert.ok(new RegExp(field + "\\s*:").test(build),
      "lib/build.js stopped publishing " + field);
  }
});
