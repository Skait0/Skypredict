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
  /* Five carry a literal. The sixth is My slip, which is a DESTINATION rather
     than a source - the wizard, the slider and the board's Book all empty into
     it - so it reads the label off the legs it was handed, and falls back to
     "myslip" when nothing built them. */
  const labelled = calls.filter((c) => /,\s*"[a-z]+"\)/.test(c));
  const derived = calls.filter((c) => /_via\|\|"myslip"\)/.test(c));
  assert.equal(labelled.length + derived.length, 6,
    "expected six attributed call sites, found " + (labelled.length + derived.length) +
    ": " + calls.join(" | "));
  assert.equal(derived.length, 1, "only My slip derives its label");
  ["builder", "split", "convert", "editor", "board"].forEach((s) => {
    assert.ok(labelled.some((c) => c.includes('"' + s + '"')), s + " is not labelled anywhere");
  });
  /* And the three writers that fill My slip must stamp what they are, or the
     derivation above has nothing to read. auto:true is NOT that stamp - all
     three set it, and it only means "machine-picked, replace me on the next
     conjure". */
  assert.match(src, /via:"board"/, "the board's Book all stamps nothing");
  assert.match(src, /via:"wizard",k:kickoffOf/, "a conjured leg stamps nothing");
  assert.match(src, /via:isWiz\?"wizard":"slider"/,
    "the builder sync must record which of the two modes it was in");
  /* And no unlabelled one slipped in beside them - an unlabelled booking is a
     row in the log that cannot be attributed, which is the whole problem. */
  const bare = calls.filter((c) => !/,\s*"[a-z]+"\)/.test(c) && !/_via\|\|"myslip"/.test(c));
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
