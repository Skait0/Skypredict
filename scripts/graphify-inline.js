"use strict";
/**
 * Make public/index.html visible to graphify. OFFLINE / BEFORE A GRAPH BUILD.
 *
 *   node scripts/graphify-inline.js          # write the shadow file
 *   node scripts/graphify-inline.js --check  # verify it is current, write nothing
 *
 * THE PROBLEM. graphify classes `.html` as a document, not code: its AST pass
 * reads `.js` and `.py` and its semantic pass reads prose. index.html is both
 * and neither - 18,900 lines with the entire front end inside one inline
 * <script> - so the graph built on 15 Sep held 2,003 nodes and NOT ONE of them
 * came from this file. Searching graphify-out for `BOOK_ONLY` returned
 * nothing. The largest and most-edited file in the repo was invisible to the
 * tool we reach for to find things in it, which is worse than having no graph:
 * a miss reads as "this does not exist" rather than "I cannot see there".
 *
 * WHAT THIS DOES. Copies the inline scripts out to graphify-src/index.inline.js,
 * where the AST pass will read them. Nothing is transformed and nothing is
 * minified - it is the same bytes, in a file with an extension graphify
 * understands.
 *
 * LINE NUMBERS ARE PRESERVED, and that is the point of the padding. Every
 * non-script byte is replaced by the same number of newlines, so line 11291 of
 * the shadow is line 11291 of index.html. graphify records `source_location`
 * as `L<n>`, so a node found in the graph cites a line that can be opened in
 * the real file. Without this the graph would name a symbol and then send the
 * reader to the wrong place, which is its own kind of invisible.
 *
 * IT CANNOT BE HIDDEN FROM GIT, and the first version of this tried twice.
 * graphify skips anything git ignores, and it honours all three mechanisms -
 * .gitignore, .graphifyignore and $GIT_DIR/info/exclude (detect.py resolves
 * that last one explicitly). .graphifyignore can only ever exclude MORE, never
 * re-include. So a hidden shadow is invisible for the same reason the HTML is,
 * and `.git/info/exclude` - the obvious "local-only" dodge - buys nothing.
 *
 * So it lives UNTRACKED in graphify-src/, ignored by nothing. It is outside
 * public/ so it can never be served or deployed, and `test/graphify.test.js`
 * fails if it is ever committed or left stale. Untracked is enough: graphify
 * indexes working-tree files rather than `git ls-files` output.
 *
 * IT IS A COPY, SO IT CAN GO STALE. Run it before a graph build - `--check`
 * exits non-zero when it has drifted, which is what the test uses. It is never
 * the source of truth: edit index.html, never this.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public", "index.html");
const DIR = path.join(ROOT, "graphify-src");
const OUT = path.join(DIR, "index.inline.js");

/* The same test prebuild.js uses to find the block it extracts for the real
   build: an inline <script> with no src. `type=module` and the JSON-LD blocks
   are excluded - the first has none here, and the second is data that would
   parse as nothing. */
const BLOCK = /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g;

function shadow(html) {
  /* Blank every byte that is not script, newline for newline. Not a loop over
     lines: a 1 MB file walked character by character is slower than this by
     enough to notice, and the arithmetic is the same. */
  const blanks = (s) => "\n".repeat((s.match(/\n/g) || []).length);
  let out = "", last = 0, m, n = 0;
  BLOCK.lastIndex = 0;
  while ((m = BLOCK.exec(html))) {
    const codeAt = m.index + m[0].length - m[1].length - "</script>".length;
    out += blanks(html.slice(last, codeAt)) + m[1];
    last = codeAt + m[1].length;
    n++;
  }
  out += blanks(html.slice(last));
  return { code: out, blocks: n };
}

const html = fs.readFileSync(SRC, "utf8");
const { code, blocks } = shadow(html);
if (!blocks) {
  console.error("no inline <script> found in public/index.html - has it been split?");
  process.exit(1);
}

if (process.argv.includes("--check")) {
  let cur = null;
  try { cur = fs.readFileSync(OUT, "utf8"); } catch (e) { /* missing counts as stale */ }
  if (cur === code) { console.log("graphify-src/index.inline.js is current"); process.exit(0); }
  console.error("graphify-src/index.inline.js is stale or missing - run: node scripts/graphify-inline.js");
  process.exit(1);
}

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(OUT, code);
const lines = code.split("\n").length;
console.log("wrote graphify-src/index.inline.js - " + blocks + " block(s), " + lines +
  " lines, line numbers match index.html");
