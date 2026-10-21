"use strict";
/* Sentry, 18 Oct 2026: "'.byo-book:not(.byo-to .byo-book) .byo-b' is not a valid selector".
   A combinator inside :not() is Selectors Level 4; older phone browsers reject the whole
   selector and querySelectorAll throws, so the click it sat in stopped half way. No
   selector the page builds may put a combinator inside :not(). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("no querySelector puts a combinator inside :not()", () => {
  const bad = [];
  for (const f of ["index.html", "account-ui.js", "messages.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8");
    for (const m of src.matchAll(/querySelector(?:All)?\((["'])((?:(?!\1).)*)\1\)/g))
      if (/:not\([^)]*[\s>+~][^)]*\)/.test(m[2])) bad.push(f + ": " + m[2]);
  }
  assert.deepStrictEqual(bad, []);
});

/* Sentry, 21 Oct 2026: "SyntaxError: Unexpected token ." from Facebook's in-app browser on
   Android 9 (Chrome 72 WebView). One `best?.homeTeam` in a debug line was enough: a syntax
   error stops the whole script, so the page never ran for that reader. Every script the page
   ships must parse as ES2019 (Chrome 72): no ?., no ??, no ||= or &&=. */
test("every script the page ships parses in an ES2019 browser (Chrome 72)", () => {
  const acorn = require("acorn");
  const pub = path.join(__dirname, "..", "public"), bad = [];
  const parse = (name, src) => { try { acorn.parse(src, { ecmaVersion: 2019, allowReturnOutsideFunction: true }); } catch (e) { bad.push(name + " " + e.message); } };
  const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["'](?:application\/ld\+json|module|importmap)["'])[^>]*>([\s\S]*?)<\/script>/g)) parse("index.html", m[1]);
  for (const f of fs.readdirSync(pub).filter((f) => f.endsWith(".js") && !/^app\.[0-9a-f]+\.js$/.test(f))) parse(f, fs.readFileSync(path.join(pub, f), "utf8"));
  assert.deepStrictEqual(bad, []);
});
