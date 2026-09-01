"use strict";

/**
 * The bookmaker table, lifted out of index.html for tests that book.
 *
 * Since the site gained a second bookmaker, the booking functions all read a
 * BOOKS descriptor: which fields hold that book's event id and odds, which
 * endpoint takes the slip, how to read a code out of the answer, and what
 * counts as a placeable leg. Every test that exercises one of them therefore
 * needs that table in scope.
 *
 * It is lifted rather than written here. A hand-made BOOKS would be a
 * reimplementation, and the whole value of these tests is that they run the
 * code the site ships - a stub that said Bet9ja judges legs on a listed price
 * would pass happily while the real one, which judges on the event, did
 * something else entirely.
 *
 * Only the four endpoint strings are substituted. They are configuration, and
 * nothing here makes a request.
 */

const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function fn(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: function " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

/* A `var X = ...;` declaration, braces and all - BOOKS is an object literal,
   so stopping at the first semicolon would cut it in half. */
function decl(name) {
  const re = new RegExp("(?:^|\\n)((?:var|const)\\s+" + name + "\\s*=)", "m");
  const m = re.exec(src);
  if (!m) throw new Error("not found in index.html: var " + name);
  const i = m.index + m[0].indexOf(m[1]);
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === ";" && depth === 0) return src.slice(i, k + 1);
  }
  throw new Error("could not find the end of " + name);
}

/* Source to paste at the top of a harness. `book` is which one is selected -
   the thing most of these tests want to vary. */
function prelude(book) {
  return (
    'var BOOK_URL="/book", SPORTY_URL="/sporty?c=", B9_URL="/b9?c=", B9_BOOK_URL="/b9book";\n' +
    decl("BOOKS") + "\n" +
    'var BOOK_KEY="sw.book";\n' +
    "var BOOKMAKER=" + JSON.stringify(book || "sporty") + ";\n" +
    fn("curBook") + "\n" + fn("bookIdOf") + "\n" + fn("bookWire") + "\n" +
    /* A confirmation hides the Get code button beside it while it is up, so
       anything that raises one needs these three as well. */
    fn("promptFoot") + "\n" + fn("showPrompt") + "\n" + fn("clearPrompt") + "\n" +
    "bookWire();\n"
  );
}

module.exports = { src, fn, decl, prelude };
