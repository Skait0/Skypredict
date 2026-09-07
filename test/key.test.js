"use strict";
/**
 * THE STRING THAT DECIDES WHICH RESULT BELONGS TO WHICH TIP.
 *
 * lib/key.js is 29 lines and had no test. Four things depend on it:
 *
 *   lib/build.js          matches graded results back to published tips
 *   api/record-sweep.js   recognises a fixture it has already recorded
 *   lib/pages.js          builds every /m/... match page URL
 *   scripts/prebuild.js   joins results to the board at deploy time
 *
 * Nothing here fails loudly when it drifts. Change the slug rule and grading
 * quietly stops matching: results are written under one key and looked up
 * under another, every tip stays ungraded, and the first sign is a board that
 * says "still being graded" for days. The match-page URLs change at the same
 * time, so anything already indexed 404s.
 *
 * The function is deliberately naive - the comment in lib/key.js explains why,
 * and it is right: both sides key the SAME published strings, so a heavier
 * normaliser would only give the two sides a way to disagree. These tests pin
 * the naivety rather than arguing with it.
 */
const test = require("node:test");
const assert = require("node:assert");
const K = require("../lib/key.js");
const P = require("../lib/pages.js");

/* ------------------------------------------------------------------ slug */

test("a name becomes lowercase, hyphenated, and nothing else", () => {
  assert.equal(K.slug("Real Madrid"), "real-madrid");
  assert.equal(K.slug("1899 Hoffenheim"), "1899-hoffenheim");
  assert.equal(K.slug("St. Pauli"), "st-pauli");
  assert.equal(K.slug("OFI Crete"), "ofi-crete");
});

test("accents fold to the letter underneath", () => {
  /* The reason this matters: the same club reaches us spelled both ways from
     different feeds, and both must land on one key. */
  assert.equal(K.slug("Atlético Madrid"), "atletico-madrid");
  assert.equal(K.slug("Atletico Madrid"), "atletico-madrid");
  assert.equal(K.slug("Fenerbahçe"), "fenerbahce");
  assert.equal(K.slug("Atlético Madrid"), K.slug("Atletico Madrid"));
});

test("a letter that is not an accented letter is DROPPED, not folded", () => {
  /* Bodo/Glimt is the live case. NFD splits e-acute into e + a combining
     mark, so the mark is stripped and the e survives - but the Norwegian o
     with stroke is its own letter, not o + a mark, so nothing decomposes and
     the [^a-z0-9] rule removes it outright:
         "Bodø/Glimt" -> "bod-glimt"     NOT "bodo-glimt"
     Harmless today because our feed spells it "Bodo/Glimt" and both sides key
     the published string. It stops being harmless the moment a source spells
     it with the stroke: the same club would key two ways and its results
     would never match its tips. Pinned so that day is a failing test. */
  assert.equal(K.slug("Bodø/Glimt"), "bod-glimt");
  assert.notEqual(K.slug("Bodø/Glimt"), K.slug("Bodo/Glimt"));
  assert.equal(K.slug("Bodo/Glimt"), "bodo-glimt");
});

test("runs of punctuation and space collapse to one hyphen, and the edges are trimmed", () => {
  assert.equal(K.slug("  Real   Madrid  "), "real-madrid");
  assert.equal(K.slug("A.C. Milan"), "a-c-milan");
  assert.equal(K.slug("---"), "", "a name with nothing keyable in it is empty, not a hyphen");
});

test("A.C. Milan and AC Milan are NOT the same key", () => {
  /* Not a bug to fix here. Fuzzy matching belongs where feeds are reconciled -
     lib/model.js's matchTeam - and putting it in the key as well would let the
     page and the server disagree. Asserted so nobody "fixes" it into the key. */
  assert.notEqual(K.slug("A.C. Milan"), K.slug("AC Milan"));
});

test("nothing throws on nothing", () => {
  for (const empty of [null, undefined, ""]) assert.equal(K.slug(empty), "");
  assert.equal(K.slug(123), "123", "a number keys as its digits rather than throwing");
});

/* ------------------------------------------------------------ fixtureKey */

test("the key is date, home and away, pipe separated", () => {
  assert.equal(K.fixtureKey("2026-09-08", "Real Madrid", "Inter"),
    "2026-09-08|real-madrid|inter");
});

test("the two sides of grading agree on the key", () => {
  /* THE CALLER IS THE POINT. lib/build.js builds the set of keys it already
     has from published fixtures, then looks up Supabase rows by the same
     function. Both must produce one string for one match, however the two
     spell the club. */
  const published = { date: "2026-09-08", home: "Atlético Madrid", away: "Inter" };
  const stored = { match_date: "2026-09-08", home: "Atletico Madrid", away: "Inter" };
  assert.equal(
    K.fixtureKey(published.date, published.home, published.away),
    K.fixtureKey(stored.match_date, stored.home, stored.away),
    "a result must find the tip that predicted it");
});

test("the date is used verbatim, so a caller must hand it a string", () => {
  /* Every caller does today - lib/build.js:1936 slices toISOString() before
     the row is built, and Supabase returns match_date as text. This test is
     the guard on that, because a Date object does not throw here, it
     stringifies to a locale- and timezone-dependent sentence:
         "Tue Sep 08 2026 01:00:00 GMT+0100 (GMT+01:00)|a|b"
     which keys differently on a machine in another timezone and would break
     grading in a way that reproduces nowhere. */
  const iso = K.fixtureKey("2026-09-08", "A", "B");
  assert.match(iso, /^\d{4}-\d{2}-\d{2}\|/, "a string date keys as itself");
  const fromDate = K.fixtureKey(new Date("2026-09-08T00:00:00Z"), "A", "B");
  assert.ok(!/^\d{4}-\d{2}-\d{2}\|/.test(fromDate),
    "a Date does NOT produce an ISO key - callers must slice it first; got " + fromDate);
});

test("a missing date still yields a usable key rather than throwing", () => {
  assert.equal(K.fixtureKey(null, "A", "B"), "|a|b");
});

/* ------------------------------------------------------------- the URLs */

test("every match page URL is built from this slug", () => {
  /* pagePath is the other consumer, and the one a reader sees. If the slug
     rule moves, every indexed /m/... URL moves with it and the old ones 404 -
     see the sitemap work in lib/pages.js. */
  const f = { date: "2026-09-08", home: "Atlético Madrid", away: "Inter" };
  assert.equal(P.pagePath(f), "/m/atletico-madrid-vs-inter-2026-09-08");
  assert.ok(P.pagePath(f).includes(K.slug(f.home)),
    "pagePath must keep using K.slug rather than its own normaliser");
});
