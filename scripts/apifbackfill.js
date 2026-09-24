"use strict";
/**
 * History for the thirty leagues that have none. OFFLINE / ONE-OFF-ISH.
 *
 *   node scripts/apifbackfill.js [--seasons=2023,2024,2025,2026] [--only=Croatia] [--dry]
 *
 * WHY THIS EXISTS. lib/liveresults.js HARVEST_EXTRA lists thirty leagues we
 * want to rate and football-data.co.uk does not publish. They were left to
 * accumulate a season at a time from SoccerVista, whose board reaches seven
 * days back - the comment there says the history "cannot be bought, only
 * accumulated". That was true of SoccerVista. It is not true of API-Football,
 * which we already hold a key for and already use as the score oracle: one
 * request returns a whole league-season.
 *
 * Measured on 23 Sep 2026, and it is why this was written: the harvest held
 * 2026-09-01..2026-09-22 and nothing else, so every one of these leagues sat
 * at 11-28 matches against the build's minLeagueMatches of 60 and was dropped
 * from the fit. The card that day was cup ties in exactly those countries -
 * 1,325 fixtures in, 343 predicted, 658 dropped as "no league".
 *
 * WHAT IT DOES NOT DO. It does not invent a matcher. Rows go through
 * liveresults.resolve, the same function the SoccerVista harvest uses, against
 * the same index and the same bootstrap rule - so a club is either recognised
 * as one we already know, or minted under the feed's spelling for a league
 * that has no ratings yet, and youth/reserve/women's sides are refused. A
 * second matcher here would pair clubs the shipped one would not, and that
 * failure looks like a result recorded against the wrong team.
 *
 * QUOTA. The free plan is 100 requests a day. One league-season is one
 * request, so thirty leagues over four seasons is 120 - two days, or one day
 * plus a --seasons run. Every response is cached under tmp/apif/, so a rerun
 * costs nothing and an interrupted run resumes where it stopped.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "results");
const CACHE = path.join(ROOT, "tmp", "apif");
const OUT = path.join(DIR, "live_apif.csv.gz");
const HOST = "https://v3.football.api-sports.io";
/* Ten a minute on the free plan; six seconds plus the response time keeps us
   under it without needing a token bucket. */
const GAP_MS = 6500;

const B = require("../lib/build.js");
const M = require("../lib/model.js");
const L = require("../lib/liveresults.js");

const DRY = process.argv.includes("--dry");
function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
}

/* API-Football league id -> the league string this project uses. Resolved
   from their /leagues index by hand and checked one by one: four of them do
   not fall out of a name match (Iceland is Úrvalsdeild, Azerbaijan is Premyer
   Liqa, Bosnia's country is "Bosnia", and Georgia lists Erovnuli Liga 2 ahead
   of Erovnuli Liga), which is exactly why this is a table and not a search. */
const LEAGUES = {
  345: "Czechia Chance Liga",
  210: "Croatia HNL",
  286: "Serbia Mozzart Bet Super Liga",
  333: "Ukraine Premier League",
  120: "Denmark 1. Division",
  89: "Netherlands Eerste Divisie",
  271: "Hungary NB I.",
  332: "Slovakia Nike liga",
  104: "Norway 1st Division",
  373: "Slovenia Prva liga",
  172: "Bulgaria efbet League",
  383: "Israel Ligat ha'Al",
  164: "Iceland Besta deild karla",
  329: "Estonia Meistriliiga",
  365: "Latvia Virsliga",
  362: "Lithuania TOPLYGA",
  116: "Belarus Vysshaya Liga",
  389: "Kazakhstan Premier League",
  327: "Georgia Crystalbet Erovnuli Liga",
  342: "Armenia Premier League",
  419: "Azerbaijan Premier League",
  310: "Albania Abissnet Superiore",
  315: "Bosnia WWIN Liga",
  355: "Montenegro Prva Crnogorska Liga",
  664: "Kosovo Superliga",
  393: "Malta Premier League",
  318: "Cyprus Cyprus League",
  394: "Moldova Super Liga",
  261: "Luxembourg BGL Ligue",
  110: "Wales Cymru Premier",

  /* The second wave - see the second block of HARVEST_EXTRA. Two ids can
     name one league of ours: API-Football splits the Primera Federacion into
     its groups and Uruguay into Apertura and Clausura, while SportyBet files
     each under one label. */
  80: "Germany 3. Liga",
  63: "France Ligue 3",
  138: "Italy Serie C, Group A",
  942: "Italy Serie C, Group B",
  943: "Italy Serie C, Group C",
  435: "Spain Primera Federacion",
  436: "Spain Primera Federacion",
  72: "Brazil Brasileiro Serie B",
  129: "Argentina Primera Nacional",
  219: "Austria 2. Liga",
  494: "Greece Super League 2",
  506: "Slovakia 2. Liga",
  173: "Bulgaria Vtora Liga",
  114: "Sweden Superettan",
  263: "Mexico Liga de Expansion MX",
  255: "USA USL Championship",
  239: "Colombia Liga DIMAYOR",
  268: "Uruguay Primera Division",
  270: "Uruguay Primera Division",
  265: "Chile Primera Division",
};

function key() {
  const p = path.join(process.env.USERPROFILE || process.env.HOME || "", ".apisports.key");
  const k = (process.env.APISPORTS_KEY || "").trim() ||
    (fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : "");
  if (!k) throw new Error("no API-Football key: set APISPORTS_KEY or write ~/.apisports.key");
  return k;
}

/* One league-season, cached on disk. The cache is the quota: these are
   finished seasons and their rows do not change, so a file that exists is
   never asked for again. */
async function season(id, yr, k) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, `${id}-${yr}.json`);
  if (fs.existsSync(f)) {
    try { return { cached: true, body: JSON.parse(fs.readFileSync(f, "utf8")) }; }
    catch (e) { /* fall through and refetch */ }
  }
  const r = await fetch(`${HOST}/fixtures?league=${id}&season=${yr}`,
    { headers: { "x-apisports-key": k, Accept: "application/json" } });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body) throw new Error(`http ${r.status} for league ${id} season ${yr}`);
  /* Their errors arrive inside a 200. An object with a `requests` key is the
     quota talking; anything else is a bad request, and both should stop the
     run rather than write an empty season to the cache. */
  const errs = body.errors;
  const bad = Array.isArray(errs) ? errs.length : (errs && Object.keys(errs).length);
  /* Their minute limit is ten and the gap below assumes this script is the
     only thing holding the key - it is not, the build's score oracle uses the
     same one. A refusal on the minute is a wait, not a season we do not have,
     so it waits out the minute and asks once more. Anything else - a season
     the plan does not cover, a bad league id - is final. */
  if (bad && errs && errs.rateLimit) {
    await new Promise((r2) => setTimeout(r2, 65000));
    return season(id, yr, k);
  }
  if (bad) throw new Error(`API-Football refused league ${id} ${yr}: ${JSON.stringify(errs)}`);
  fs.writeFileSync(f, JSON.stringify(body));
  return { cached: false, body };
}

/* Their fixture, as one of our feed rows. Only a finished match counts: FT is
   ninety minutes, AET and PEN are cup shapes these leagues do not use but
   their API still reports, and a postponed or abandoned game carries nulls. */
const DONE = new Set(["FT", "AET", "PEN"]);
/* Names that would collide in the index, renamed at source - see
   LEAGUE_RENAME in lib/liveresults.js, which every feed now shares. */
const named = (league, t) => L.renamed(league, t);
function rowsOf(body, league) {
  const out = [];
  for (const f of (body.response || [])) {
    const st = f && f.fixture && f.fixture.status && f.fixture.status.short;
    if (!DONE.has(st)) continue;
    const hg = f.goals && f.goals.home, ag = f.goals && f.goals.away;
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const date = String(f.fixture.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      date, league,
      home: named(league, (f.teams && f.teams.home && f.teams.home.name) || ""),
      away: named(league, (f.teams && f.teams.away && f.teams.away.name) || ""),
      hg, ag,
    });
  }
  return out;
}

(async () => {
  const seasons = String(arg("seasons", "2023,2024,2025,2026"))
    .split(",").map((s) => Number(s.trim())).filter((n) => n >= 2015 && n <= 2030);
  const only = String(arg("only", "")).toLowerCase();
  const ids = Object.keys(LEAGUES)
    .filter((id) => !only || LEAGUES[id].toLowerCase().includes(only));
  if (!ids.length) throw new Error("--only matched no league");

  const floor = B.loadFloorMatches();
  if (floor.length < 400) throw new Error("the committed floor is too thin to resolve against");
  const index = M.buildIndex(floor);
  const allowed = new Set([].concat(
    Object.values(B.MAIN),
    Object.keys(B.EXTRA).map((c) => c + " " + B.EXTRA[c]),
    L.HARVEST_EXTRA));
  const boot = new Set(L.HARVEST_EXTRA);

  const k = key();
  let kept = [], asked = 0;
  const per = {};
  for (const id of ids) {
    const league = LEAGUES[id];
    per[league] = { rows: 0, resolved: 0, club: 0 };
    for (const yr of seasons) {
      let got;
      try { got = await season(id, yr, k); }
      catch (e) { console.log(`${league} ${yr}: ${e.message}`); continue; }
      if (!got.cached) { asked++; }
      const rows = rowsOf(got.body, league);
      /* resolve() stamps one date on everything it is given, so the rows are
         handed over a day at a time - a season is not one date. */
      const byDate = {};
      for (const r of rows) (byDate[r.date] = byDate[r.date] || []).push(r);
      let res = 0;
      for (const date of Object.keys(byDate).sort()) {
        const out = L.resolve(byDate[date], index, allowed, date, boot);
        kept = kept.concat(out.matches);
        res += out.matches.length;
        per[league].club += out.dropped.club;
      }
      per[league].rows += rows.length;
      per[league].resolved += res;
      console.log(`${league} ${yr}: ${rows.length} finished, ${res} resolved` +
        (got.cached ? " (cached)" : ""));
      if (!got.cached) await new Promise((r2) => setTimeout(r2, GAP_MS));
    }
  }

  console.log(`\n${asked} request(s) spent`);
  const weak = Object.entries(per).filter(([, v]) => v.rows && v.resolved / v.rows < 0.9);
  if (weak.length) {
    console.log("leagues resolving under 90% - check TEAM_ALIAS before trusting these:");
    for (const [l, v] of weak) {
      console.log(`  ${l}: ${v.resolved}/${v.rows}, ${v.club} dropped on the club`);
    }
  }
  if (!kept.length) throw new Error("nothing resolved - refusing to write an empty file");

  let prior = [];
  try {
    if (fs.existsSync(OUT)) prior = L.fromCSV(zlib.gunzipSync(fs.readFileSync(OUT)).toString("utf8"));
  } catch (e) { console.log("could not read the existing file, starting fresh: " + e.message); }
  const merged = L.dedupe(prior.concat(kept));

  const byLeague = {};
  for (const m of merged) byLeague[m.league] = (byLeague[m.league] || 0) + 1;
  const under = Object.entries(byLeague).filter(([, n]) => n < 60);
  console.log(`\n${merged.length} matches across ${Object.keys(byLeague).length} leagues; ` +
    `${under.length} still under the 60-match bar`);
  if (under.length) console.log(under.map(([l, n]) => `  ${String(n).padStart(4)}  ${l}`).join("\n"));

  if (DRY) { console.log("\ndry run - not writing " + path.relative(ROOT, OUT)); return; }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUT, zlib.gzipSync(L.toCSV(merged)));
  console.log(`\nwrote ${path.relative(process.cwd(), OUT)}: ${merged.length} matches ` +
    `(${merged.length - prior.length} new)`);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
