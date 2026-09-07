"use strict";

/**
 * THE COMMITTED RESULTS FLOOR.
 *
 * On 5-6 Sep 2026 football-data.co.uk answered 503 to everyone for hours and
 * the whole site went dark - not because we lacked today's games, the
 * SportyBet feed was healthy and carrying 859 of them, but because the model
 * could not refit without history. The results guard throws before the fixture
 * feeds are even read.
 *
 * Finished seasons never change, so they are committed and read from disk when
 * the download fails. This test guards the floor itself.
 *
 * WHY IT NEEDS GUARDING: the floor is only ever READ during an outage. Delete
 * it, corrupt it, or rename the files and everything stays green and fast
 * until the next 503 - at which point the site goes dark again and the reason
 * is three months old. That is exactly the failure this codebase keeps
 * relearning: error handling that never runs is not error handling.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DIR = path.join(__dirname, "..", "data", "results");

function files() {
  try { return fs.readdirSync(DIR); } catch (e) { return []; }
}

test("the floor exists and is not empty", () => {
  const f = files();
  assert.ok(f.length >= 40,
    "expected the committed history to be present; found " + f.length + " files in data/results");
});

test("it covers both finished seasons across the main divisions", () => {
  const f = files();
  /* These two seasons are closed - their files are the same bytes now as in a
     year - which is the whole reason it is safe to commit them. */
  for (const season of ["2425", "2526"]) {
    const n = f.filter((x) => x.startsWith(season + "_")).length;
    assert.ok(n >= 15, season + " has only " + n + " division files; expected the full set");
  }
});

test("it covers the per-country competitions too", () => {
  /* The first attempt cached only the main European divisions and the board
     came back at 27 fixtures for a Sunday against a normal 117 - Argentina,
     Brazil, Japan, the USA and the Nordics were all missing. */
  const n = files().filter((x) => x.startsWith("extra_")).length;
  assert.ok(n >= 12, "only " + n + " per-country files; a Sunday card leans on these");
});

test("every file gunzips to a parseable football-data CSV", () => {
  /* The failure this is really for: a file that is present, committed, and
     silently truncated or re-encoded. Nothing would notice until an outage. */
  const bad = [];
  for (const name of files()) {
    if (!name.endsWith(".gz")) continue;
    try {
      const text = zlib.gunzipSync(fs.readFileSync(path.join(DIR, name))).toString("utf8");
      /* football-data ships these with a UTF-8 BOM. The parser does not care -
         it keys off FTHG/HomeTeam, not the first column - but a header check
         that forgets it fails on every single file, which is how this test
         first "found" 51 corrupt ones that were all perfectly good. */
      const head = (text.slice(0, 400).split(/\r?\n/)[0] || "").replace(/^﻿/, "");
      const rows = text.split(/\r?\n/).filter((r) => r.trim()).length;
      const looksMain = head.startsWith("Div,");
      const looksExtra = /Country/i.test(head) && /League/i.test(head);
      /* The harvested current season, written by scripts/mkresults.js in the
         generic layout normalise() also reads. It is not football-data's shape
         and never will be - it does not come from football-data. */
      const looksLive = head.startsWith("date,league,");
      /* A finished season is thousands of rows. The CURRENT season is not: it
         is three weeks old, so a division holding ten rows is a correct file,
         not a truncated one, and demanding twenty flagged every one of them. */
      const finished = (/^(2425|2526)_/.test(name) || name.startsWith("extra_")) &&
        !name.startsWith("live_");
      const floor = finished ? 20 : 2;
      if (!looksMain && !looksExtra && !looksLive) bad.push(name + " (header: " + head.slice(0, 60) + ")");
      else if (rows < floor) bad.push(name + " (only " + rows + " rows)");
    } catch (e) {
      bad.push(name + " (" + e.message + ")");
    }
  }
  assert.deepEqual(bad.slice(0, 5), [],
    bad.length + " unreadable or implausible files, first few: " + bad.slice(0, 5).join("; "));
});

test("the floor is compressed, because every build clones it", () => {
  const plain = files().filter((x) => x.endsWith(".csv"));
  assert.deepEqual(plain, [],
    "uncompressed CSVs in the floor - 14 MB against 3.3 MB, paid on every build: " + plain.join(", "));
});
