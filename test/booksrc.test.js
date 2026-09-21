"use strict";

/* WHICH SURFACE BOOKED IT.
 *
 * Every builder on the page funnels into one bookFetch, so the platform's
 * request log could prove that people book and never which thing they booked
 * from - 3,000 attempts in a week with no attribution on any of them. The src
 * rides in the query string because the log already facets on the path, so the
 * question is answered in a dashboard that is already paid for: no vendor, no
 * client event, no storage, nothing that changes what /privacy says. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("every booking call site says where it came from", () => {
  /* To end of line, not to the first ")" - two of these call sites nest a
     .map() inside the argument list and a lazy match stops inside it. */
  const calls = src.split(/\r?\n/)
    .filter((l) => /bookFetch\(/.test(l) && !/function bookFetch\(/.test(l))
    .map((l) => l.trim());
  /* The definition itself, plus one call per surface. */
  const labelled = calls.filter((c) => /,\s*"[a-z]+"\)/.test(c));
  assert.equal(labelled.length, 6,
    "expected six labelled call sites, found " + labelled.length + ": " + calls.join(" | "));
  ["builder", "split", "convert", "editor", "board", "myslip"].forEach((s) => {
    assert.ok(labelled.some((c) => c.includes('"' + s + '"')), s + " is not labelled anywhere");
  });
  /* And no unlabelled one slipped in beside them - an unlabelled booking is a
     row in the log that cannot be attributed, which is the whole problem. */
  const bare = calls.filter((c) => !/,\s*"[a-z]+"\)/.test(c));
  assert.deepEqual(bare, [], "unlabelled bookFetch call: " + bare.join(" | "));
});

test("the label rides in the query string and can never refuse a booking", () => {
  const fn = src.slice(src.indexOf("function bookFetch("), src.indexOf("function bookFetch(") + 2400);
  assert.match(fn, /var url=B\.book\+\(src\?"&src="\+encodeURIComponent\(src\):""\)/,
    "the src must be appended to the book URL, encoded");
  assert.match(fn, /return fetch\(url,/, "and the request must actually use it");
  /* `&`, not `?`: every BOOK_URL already carries ?book=. A `?` here would
     produce /api/book?book=sporty?src=... and the API would read the book
     name as "sporty?src=editor" - a refused booking for a logging field. */
  ["BOOK_URL", "B9_BOOK_URL", "BK_BOOK_URL"].forEach((k) => {
    const line = src.slice(src.indexOf("const " + k + "="), src.indexOf("const " + k + "=") + 80);
    assert.match(line, /\/api\/book\?book=/, k + " no longer carries its own query string");
  });
});
