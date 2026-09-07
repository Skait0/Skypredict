"use strict";
/**
 * Harvest the European corpus and fit the country offsets. OFFLINE ONLY.
 *
 *   node scripts/mkeurope.js
 *
 * Run by hand, roughly once a season, alongside refreshing UEFA_COEFFICIENT.
 * The Vercel build never runs this and never reads the corpus - it reads only
 * data/country-offsets.json, which this writes.
 *
 * WHY THE RAW TEXT IS COMMITTED AND THE RESOLVED CORPUS IS NOT: keeping
 * openfootball's own files means a later improvement to the alias table
 * re-resolves the whole history without re-fetching, and any argument about a
 * fitted number can be traced back to the line it came from.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const https = require("https");

const M = require("../lib/model.js");
const B = require("../lib/build.js");
const OF = require("../lib/openfootball.js");
const R = require("../lib/euroresolve.js");
const F = require("../lib/eurofit.js");

const RAW = "https://raw.githubusercontent.com/openfootball/champions-league/master";
const API = "https://api.github.com/repos/openfootball/champions-league/commits/master";
const COMPS = ["cl", "clq", "el", "elq", "conf", "confq"];
const DIR = path.join(__dirname, "..", "data", "europe");
const OUT = path.join(__dirname, "..", "data", "country-offsets.json");

/* Seasons the floor can rate. A European match is only usable if we can
   reconstruct what its clubs were worth AT THE TIME - fitModel is weighted on
   a 200-day half-life, so today's ratings do not describe two seasons ago.
   The floor's main-league files cover 2425, 2526 and 2627; add older seasons
   here as they reach the floor. */
const SEASONS = ["2024-25", "2025-26"];

/* Roughly the middle of a season, as the reference date for that season's fit. */
function midpoint(season) {
  return new Date(Date.UTC(Number(season.slice(0, 4)) + 1, 0, 15));
}

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "user-agent": "skypredict-mkeurope" } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error(url + " -> " + r.statusCode)); }
      let s = ""; r.setEncoding("utf8");
      r.on("data", (d) => s += d);
      r.on("end", () => res(s));
    }).on("error", rej);
  });
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });

  let sha = "unknown";
  try { sha = JSON.parse(await get(API)).sha.slice(0, 12); } catch (e) {}

  /* 1. Fetch and store the source text verbatim. */
  const parsed = [];
  let dropped = 0, lines = 0;
  const missing = [];
  for (const season of SEASONS) {
    for (const comp of COMPS) {
      let text;
      try { text = await get(`${RAW}/${season}/${comp}.txt`); }
      catch (e) { missing.push(`${season}/${comp}`); continue; }
      fs.writeFileSync(path.join(DIR, `${season}-${comp}.txt.gz`), zlib.gzipSync(text));
      const o = OF.parse(text);
      lines += o.rows.length + o.dropped.length;
      dropped += o.dropped.length;
      for (const r of o.rows) parsed.push(Object.assign({ season }, r));
      console.log(`${season}/${comp}: ${o.rows.length} matches, ${o.dropped.length} dropped`);
    }
  }
  if (!parsed.length) throw new Error("no matches parsed - refusing to write an empty corpus");

  /* WHAT THE SOURCE DID NOT HAVE, SAID OUT LOUD.
   *
   * This loop used to `continue` past a 404 with the comment "not every season
   * has every comp", which is true of the qualifying rounds and quietly untrue
   * of everything else. openfootball never published el.txt or conf.txt for
   * 2025-26, so the corpus behind the offsets committed on 7 Sep 2026 was
   * missing the whole Europa and Conference league phase - about 317 matches
   * of roughly 1,700, and concentrated in exactly the mid-table countries the
   * offsets are least sure about. Nothing anywhere said so.
   *
   * A qualifying round is genuinely optional. A main stage is not: if one is
   * missing the fit is being asked to describe European football from a
   * fraction of it, and that is a decision for whoever is running this, not a
   * line of log to scroll past. --allow-gaps is how they say yes. */
  const mainMissing = missing.filter((x) => /\/(cl|el|conf)$/.test(x));
  if (missing.length) console.log("NOT PUBLISHED BY THE SOURCE: " + missing.join(", "));
  if (mainMissing.length && !process.argv.includes("--allow-gaps")) {
    throw new Error(`${mainMissing.join(", ")} missing from openfootball - the fit would ` +
      `describe European football without them. Re-run with --allow-gaps to accept that, ` +
      `or wait for the source to publish them.`);
  }
  /* A parser that has quietly stopped understanding the format shows up here
     as a drop rate, not as an error. Fail loudly rather than fit on a thinned
     corpus. */
  if (dropped / Math.max(1, lines) > 0.02)
    throw new Error(`dropped ${dropped} of ${lines} lines - the format has probably changed`);

  /* 2. Era-correct ratings: one fit per season, from the committed floor.
   *
   * ERA-CORRECT INCLUDES THE INDEX, not just the fit. buildIndex gives a club
   * the league of its NEWEST match, and loadFloorMatches now carries the
   * harvested current season alongside the floor - so with the whole thing
   * passed in, Schalke reads as Bundesliga 1 while 2024-25 is being fitted, a
   * season it spent in the second division. Every promoted and relegated club
   * lands in the wrong pool, each league is centred on the wrong members, and
   * the offsets move with it: re-running with 2026-27 rows in the index halved
   * Germany, 0.179 to 0.087, on an unchanged corpus of 108 matches.
   *
   * So the index stops at the last reference date the fits actually use.
   * Nothing after it can describe what a club was worth at the time. */
  const horizon = midpoint(SEASONS[SEASONS.length - 1]);
  const floor = B.loadFloorMatches().filter((m) => m.date <= horizon);
  if (floor.length < 400) throw new Error("the committed floor is too thin to fit on");
  const index = M.buildIndex(floor);
  console.log(`index built from ${floor.length} matches up to ` +
    `${horizon.toISOString().slice(0, 10)}`);
  const models = {};
  for (const season of SEASONS) {
    const ref = midpoint(season);
    const upto = floor.filter((m) => m.date <= ref);
    models[season] = M.fitModel(upto, { index, reference: ref });
    console.log(`fitted ${season} on ${upto.length} matches to ${ref.toISOString().slice(0, 10)}`);
  }

  /* 3. Resolve, per season. */
  const bySeason = {};
  for (const r of parsed) (bySeason[r.season] = bySeason[r.season] || []).push(r);
  const matches = [], byCountry = {};
  let unresolved = 0;
  for (const season of SEASONS) {
    const out = R.resolve(bySeason[season] || [], index);
    for (const g of out.matches) matches.push(Object.assign({ season }, g));
    for (const c in out.byCountry) byCountry[c] = (byCountry[c] || 0) + out.byCountry[c];
    unresolved += out.dropped.length;
  }
  console.log(`resolved ${matches.length} matches; ${unresolved} rows dropped`);

  /* 4. Priors, then K, then the fit. */
  const priors = {};
  for (const country in B.UEFA_COEFFICIENT) {
    const p = F.priorFor(country, B.UEFA_COEFFICIENT,
      { anchor: B.UEFA_COEFFICIENT.England, scale: 0.50, cap: B.COUNTRY_CAP });
    if (p !== null) priors[country] = p;
  }
  const shared = { matches, modelOf: (s) => models[s], rungOf: B.rungOf,
                   priors, cap: B.COUNTRY_CAP };
  const picked = F.chooseK(shared);
  console.log("K chosen by five-fold held-out deviance:", picked.K);
  const offsets = F.fitOffsets(Object.assign({}, shared,
    { K: picked.K, fitHomeEdge: true }));
  const homeEdge = offsets._homeEdge;
  delete offsets._homeEdge;
  console.log("European venue effect:", homeEdge.toFixed(4),
    "log goals (home x" + Math.exp(homeEdge).toFixed(3) +
    ", away x" + Math.exp(-homeEdge).toFixed(3) + ")");

  /* 5. Write. */
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: "openfootball/champions-league @ " + sha,
    seasons: SEASONS,
    /* Competitions the source had not published when this was fitted. An
       artefact that does not state its own coverage cannot be argued with. */
    gaps: missing,
    shrinkageK: picked.K,
    anchor: "England",
    /* The extra home advantage a European tie carries over the domestic
       model, in log goal-rate. Added to the edge for cross-border fixtures
       only - see countryHandicap's neighbours in lib/build.js. */
    homeEdge: homeEdge,
    countries: offsets,
  }, null, 2) + "\n");

  for (const c of Object.keys(offsets).sort())
    console.log(`  ${c.padEnd(14)} ${offsets[c].offset.toFixed(3)}` +
                `  (prior ${offsets[c].prior.toFixed(3)}, n=${offsets[c].matches})`);
  console.log("\nwrote", OUT);
})().catch((e) => { console.error(e.message); process.exit(1); });
