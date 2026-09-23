"use strict";
/**
 * Refresh the committed copy of the international results. OFFLINE.
 *
 *   node scripts/mkintl.js
 *
 * The build downloads martj42/international_results itself on every run (see
 * lib/internationals.js). This writes the copy it falls back to when GitHub
 * does not answer - the same role data/results/*.csv.gz plays for
 * football-data. Refreshing it is a deliberate commit, not something a build
 * does: a Vercel build is ephemeral and could not keep what it wrote.
 *
 * Kept from 2020 onward: the fit reads from minSinceDate (2023-07-01 today),
 * and three spare seasons cost 60 KB while making a later cutoff change a
 * config edit rather than a re-download.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const INTL = require("../lib/internationals.js");

/* Its own directory: data/results/ is football-data's floor, and a test
   holds every file in it to that format. */
const OUT = path.join(__dirname, "..", "data", "internationals", "results.csv.gz");
const SINCE = "2020-01-01";

(async () => {
  const r = await fetch(INTL.URL);
  if (!r.ok) throw new Error("http " + r.status);
  const lines = (await r.text()).split(/\r?\n/).filter(Boolean);
  if (lines.length < 1000) throw new Error("only " + lines.length + " lines - refusing to overwrite");
  const keep = [lines[0]].concat(lines.slice(1).filter((l) => l.slice(0, 10) >= SINCE));
  /* Round-trip through the parser before writing: a file it cannot read is
     worse than the one already committed. */
  const parsed = INTL.parse(keep.join("\n"), SINCE);
  if (parsed.length < 1000) throw new Error("parsed only " + parsed.length + " rows - not writing");
  fs.writeFileSync(OUT, zlib.gzipSync(keep.join("\n") + "\n"));
  const newest = keep.slice(1).map((l) => l.slice(0, 10)).sort().pop();
  console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${keep.length - 1} matches since ${SINCE}, ` +
    `newest ${newest}, ${fs.statSync(OUT).size} bytes`);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
