"use strict";
/* DOES THE PAGE ACTUALLY PARSE?
 *
 * Nothing asked that until today. Every other harness lifts individual
 * functions out of index.html and evaluates those, so a syntax error anywhere
 * between them is invisible: 1,514 tests passed on a build whose entire script
 * died on load with "SyntaxError: Unexpected token '}'" - one stray brace left
 * behind while rewriting swapOptions. The page rendered its HTML and did
 * nothing at all, and only opening it in a browser showed that.
 *
 * new Function() compiles without running, which is exactly what is wanted
 * here: no DOM, no network, no side effects, just "is this JavaScript".
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* Inline blocks only - anything with src= is a file of its own. */
function scripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    /* JSON-LD and templates are not JavaScript. */
    if (/type\s*=\s*"(?!text\/javascript|application\/javascript)/i.test(attrs)) continue;
    out.push({ code: m[2], at: m.index });
  }
  return out;
}

/* The line a character offset lands on, so a failure says where to look. */
function lineOf(html, index) {
  return html.slice(0, index).split("\n").length;
}

for (const file of ["index.html", "404.html", "offline.html"]) {
  const full = path.join(ROOT, "public", file);
  if (!fs.existsSync(full)) continue;
  test(file + " parses as JavaScript", () => {
    const html = fs.readFileSync(full, "utf8");
    const blocks = scripts(html);
    if (file === "index.html") {
      assert.ok(blocks.length >= 1, "no inline script found - has the page moved?");
      assert.ok(blocks.some((b) => b.code.length > 10000),
        "the page's main script is missing, so this test is checking nothing");
    }
    blocks.forEach((b) => {
      try {
        new Function(b.code);           // compiles; never runs
      } catch (e) {
        assert.fail(file + ": inline script starting at line " +
          lineOf(html, b.at) + " does not parse - " + e.message);
      }
    });
  });
}

test("the service worker parses too", () => {
  /* It is a separate file and never lifted by any harness, so the same blind
     spot applies. */
  const sw = path.join(ROOT, "public", "sw.js");
  if (!fs.existsSync(sw)) return;
  try {
    new Function(fs.readFileSync(sw, "utf8"));
  } catch (e) {
    assert.fail("sw.js does not parse - " + e.message);
  }
});
