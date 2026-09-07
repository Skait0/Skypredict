"use strict";
/**
 * Harvest the current season's results and commit them. OFFLINE ONLY.
 *
 *   node scripts/mkresults.js [--days=30] [--to=YYYY-MM-DD]
 *
 * Run by hand, or by .github/workflows/record-sweep.yml once a day. The Vercel
 * build never runs this - it reads only the file this writes,
 * data/results/live_<season>.csv.gz.
 *
 * WHAT IT IS FOR
 *
 * football-data.co.uk has been 503 since 5 Sep 2026. The committed floor keeps
 * the site building on finished seasons, so the board looks entirely normal
 * while the form under it ages a day per day: on 7 Sep the live board reported
 * `formStaleDays 7`. This closes that gap from a source that is up.
 *
 * SAFE TO RE-RUN, AND MEANT TO BE
 *
 * Each run merges into what is already committed and de-duplicates, so a wider
 * --days than needed costs requests and changes nothing else. Their board
 * reaches about a week back, so a daily run with a week of overlap loses
 * nothing to a day the job did not run.
 *
 * IT REFUSES RATHER THAN THINS THE CORPUS
 *
 * Every club is resolved against the index the floor already built, and an
 * unresolved club is dropped - see lib/liveresults.js for why a name we cannot
 * place is worse than a match we do not have. If the share of rows resolving
 * falls below MIN_RESOLVED the run writes nothing at all, because at that point
 * the likeliest explanation is that their naming has moved and the right answer
 * is a look at the alias table, not a corpus quietly missing half a league.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const M = require("../lib/model.js");
const B = require("../lib/build.js");
const SV = require("../lib/soccervista.js");
const L = require("../lib/liveresults.js");

const DIR = path.join(__dirname, "..", "data", "results");
const MIN_RESOLVED = 0.70;
/* One request per day of history, spaced. Nothing here is urgent and the feed
   is somebody else's. */
const GAP_MS = 400;

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
}

function daysBack(to, n) {
  const out = [];
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(to + "T00:00:00Z") : new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(end.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out.reverse();
}

(async () => {
  const days = Math.max(1, Math.min(120, Number(arg("days", 30)) || 30));
  const dates = daysBack(arg("to", ""), days);
  const season = B.seasonCodes(Date.now(), 1)[0];
  const out = path.join(DIR, `live_${season}.csv.gz`);

  /* The index the resolution is against. Note this is the floor PLUS whatever
     a previous run committed, which is what we want: a club promoted this
     summer is in this season's rows and nowhere else, so the second run can
     place names the first one had to drop. */
  const floor = B.loadFloorMatches();
  if (floor.length < 400) throw new Error("the committed floor is too thin to resolve against");
  const index = M.buildIndex(floor);
  const allowed = new Set([].concat(
    Object.values(B.MAIN),
    Object.keys(B.EXTRA).map((c) => c + " " + B.EXTRA[c]),
    /* Leagues with no history at all, collected so they can HAVE one. They
       resolve against clubs the floor has never seen, so expect them to drop
       heavily at first and to improve every week as their own rows enter the
       index. */
    L.HARVEST_EXTRA));

  let kept = [], considered = 0, resolved = 0;
  const dropped = { league: 0, club: 0, malformed: 0 };
  for (const date of dates) {
    const r = await SV.resultsFor(date);
    if (!r.ok) { console.log(`${date}: ${r.why}`); continue; }
    const res = L.resolve(r.rows, index, allowed, date, new Set(L.HARVEST_EXTRA));
    /* Only rows in a league we model count toward the resolution rate. The
       feed is a thousand matches a day and most of them are competitions we
       have never rated - counting those as failures would hide a real one. */
    const inScope = r.rows.filter((x) => L.ourLeague(x.league, allowed)).length;
    considered += inScope;
    resolved += res.matches.length;
    for (const k in dropped) dropped[k] += res.dropped[k];
    kept = kept.concat(res.matches);
    console.log(`${date}: ${r.rows.length} finished, ${inScope} in our leagues, ` +
      `${res.matches.length} resolved`);
    await new Promise((r2) => setTimeout(r2, GAP_MS));
  }

  if (!kept.length) throw new Error("no matches resolved - refusing to write an empty file");
  const rate = considered ? resolved / considered : 0;
  console.log(`resolved ${resolved}/${considered} in-scope rows (${(rate * 100).toFixed(1)}%); ` +
    `dropped: ${dropped.club} club, ${dropped.malformed} malformed`);
  if (rate < MIN_RESOLVED) {
    throw new Error(`only ${(rate * 100).toFixed(1)}% of in-scope rows resolved - ` +
      `check LEAGUE_ALIAS and TEAM_ALIAS before committing anything`);
  }

  let prior = [];
  try {
    if (fs.existsSync(out)) {
      prior = L.fromCSV(zlib.gunzipSync(fs.readFileSync(out)).toString("utf8"));
    }
  } catch (e) { console.log("could not read the existing file, starting fresh: " + e.message); }

  const merged = L.dedupe(prior.concat(kept));
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(out, zlib.gzipSync(L.toCSV(merged)));
  const newest = merged.reduce((a, m) => (m.date > a ? m.date : a), "");
  console.log(`wrote ${path.relative(process.cwd(), out)}: ${merged.length} matches ` +
    `(${merged.length - prior.length} new), newest ${newest}`);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
