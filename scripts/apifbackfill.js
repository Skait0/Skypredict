"use strict";
/**
 * History for the thirty leagues that have none. OFFLINE / ONE-OFF-ISH.
 *
 *   node scripts/apifbackfill.js [--seasons=2023,2024,2025,2026] [--only=Croatia] [--dry]
 *                                [--stats] [--plan] [--gap=ms]
 *
 * --plan spends nothing and prints what a run would cost. --stats adds corners,
 * shots and shots on target, twenty fixtures a request. --gap is the pause
 * between requests: 6500 on the free plan, ~250 on a paid one.
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

/* --plan asks nothing: it counts what a run would spend from what is already
   cached, so the paid day can be sized before it is bought. */
const PLAN = process.argv.includes("--plan");
/* --stats adds corners, shots and shots on target to every finished fixture,
   twenty fixtures a request (/fixtures?ids= returns statistics inline). */
const STATS = process.argv.includes("--stats");
const BATCH = 20;
/* Never spend the last of the day: the build's score oracle shares this key
   and stops at its own floor of 10 (lib/build.js ORACLE_FLOOR). */
const RESERVE = 15;
const GAP = Number(arg("gap", GAP_MS));
let left = null;   // what the plan says is left today, from the last answer

async function apiGet(url, k) {
  if (left != null && left < RESERVE) {
    throw new Error(`stopping: ${left} requests left today, reserve is ${RESERVE}`);
  }
  const r = await fetch(HOST + url, { headers: { "x-apisports-key": k, Accept: "application/json" } });
  const n = Number(r.headers.get("x-ratelimit-requests-remaining"));
  if (Number.isFinite(n) && r.headers.get("x-ratelimit-requests-remaining") != null) left = n;
  const body = await r.json().catch(() => null);
  if (!r.ok || !body) throw new Error(`http ${r.status} for ${url}`);
  const errs = body.errors;
  const bad = Array.isArray(errs) ? errs.length : (errs && Object.keys(errs).length);
  /* Their errors arrive inside a 200. A refusal on the minute is a wait, not
     data we do not have: wait it out and ask once more. Anything else - a
     season the plan does not cover, a bad id - is final. */
  if (bad && errs && errs.rateLimit) {
    await new Promise((r2) => setTimeout(r2, 65000));
    return apiGet(url, k);
  }
  if (bad) throw new Error(`API-Football refused ${url}: ${JSON.stringify(errs)}`);
  return body;
}

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
  if (PLAN) return { cached: false, body: null };
  const body = await apiGet(`/fixtures?league=${id}&season=${yr}`, k);
  fs.writeFileSync(f, JSON.stringify(body));
  return { cached: false, body };
}

/* Statistics for finished fixtures, cached per batch file as {fixtureId:
   stats|null}. A null is an answer - their coverage has no stats for that
   game - and is never asked for again. */
const STATS_DIR = path.join(CACHE, "stats");
function loadStats() {
  const all = {};
  if (!fs.existsSync(STATS_DIR)) return all;
  for (const f of fs.readdirSync(STATS_DIR)) {
    try { Object.assign(all, JSON.parse(fs.readFileSync(path.join(STATS_DIR, f), "utf8"))); }
    catch (e) { /* a torn file is re-asked */ }
  }
  return all;
}

/* One fixture's statistics block, as our columns. API-Football lists each
   side under its team id, with types named in English; a missing or "null"
   value is a column we do not have, not a zero. */
function statsOf(f) {
  const blocks = f && f.statistics;
  if (!Array.isArray(blocks) || blocks.length < 2) return null;
  const hid = f.teams && f.teams.home && f.teams.home.id;
  const side = (b) => {
    const v = (t) => {
      const s = (b.statistics || []).find((x) => x.type === t);
      const n = s && s.value != null ? parseInt(s.value, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    return { c: v("Corner Kicks"), s: v("Total Shots"), t: v("Shots on Goal") };
  };
  const h = blocks.find((b) => b.team && b.team.id === hid);
  const a = blocks.find((b) => b.team && b.team.id !== hid);
  if (!h || !a) return null;
  const H = side(h), A = side(a);
  const out = { hc: H.c, ac: A.c, hs: H.s, as: A.s, hst: H.t, ast: A.t };
  return Object.values(out).some((x) => x != null) ? out : null;
}

async function fetchStats(ids, k, have) {
  fs.mkdirSync(STATS_DIR, { recursive: true });
  let asked = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const body = await apiGet(`/fixtures?ids=${chunk.join("-")}`, k);
    const got = {};
    for (const id of chunk) got[id] = null;
    for (const f of (body.response || [])) got[f.fixture.id] = statsOf(f);
    fs.writeFileSync(path.join(STATS_DIR, `${chunk[0]}.json`), JSON.stringify(got));
    Object.assign(have, got);
    asked++;
    if (asked % 25 === 0) console.log(`stats: ${i + chunk.length}/${ids.length} fixtures, ${left} left today`);
    await new Promise((r2) => setTimeout(r2, GAP));
  }
  return asked;
}

/* Their fixture, as one of our feed rows. Only a finished match counts: FT is
   ninety minutes, AET and PEN are cup shapes these leagues do not use but
   their API still reports, and a postponed or abandoned game carries nulls. */
const DONE = new Set(["FT", "AET", "PEN"]);
/* Names that would collide in the index, renamed at source - see
   LEAGUE_RENAME in lib/liveresults.js, which every feed now shares. */
const named = (league, t) => L.renamed(league, t);
function finishedIds(body) {
  return (body.response || [])
    .filter((f) => DONE.has(f && f.fixture && f.fixture.status && f.fixture.status.short))
    .map((f) => f.fixture.id);
}
function rowsOf(body, league, stats) {
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
      ...((stats && stats[f.fixture.id]) || {}),
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

  const k = PLAN ? "" : key();
  let kept = [], asked = 0;
  const per = {};
  /* Pass one: every league-season, fetched or (under --plan) only counted. */
  const bodies = [];   // [league, yr, body, cached]
  let uncached = 0;
  for (const id of ids) {
    for (const yr of seasons) {
      let got;
      try { got = await season(id, yr, k); }
      catch (e) { console.log(`${LEAGUES[id]} ${yr}: ${e.message}`); continue; }
      if (!got.cached) {
        if (PLAN) { uncached++; continue; }
        asked++;
        await new Promise((r2) => setTimeout(r2, GAP));
      }
      bodies.push([LEAGUES[id], yr, got.body, got.cached]);
    }
  }

  /* Pass two: statistics for every finished fixture not already cached. */
  const stats = loadStats();
  if (STATS || PLAN) {
    const need = [];
    for (const [, , body] of bodies) for (const id of finishedIds(body)) if (!(id in stats)) need.push(id);
    const perSeason = bodies.length ? Math.round(bodies.reduce((n, b) => n + finishedIds(b[2]).length, 0) / bodies.length) : 300;
    if (PLAN) {
      const guess = Math.ceil(uncached * perSeason / BATCH);
      console.log(`PLAN: ${uncached} league-season request(s) not cached`);
      console.log(`PLAN: ${need.length} cached fixtures lack stats = ${Math.ceil(need.length / BATCH)} request(s)`);
      console.log(`PLAN: + about ${guess} for the uncached seasons (~${perSeason} fixtures each)`);
      console.log(`PLAN: total about ${uncached + Math.ceil(need.length / BATCH) + guess} requests`);
      return;
    }
    try { asked += await fetchStats(need, k, stats); }
    catch (e) { console.log(`stats pass stopped: ${e.message} (cached so far is kept; rerun resumes)`); }
  }

  for (const [league, yr, body, cached] of bodies) {
    const got = { body, cached };
    per[league] = per[league] || { rows: 0, resolved: 0, club: 0 };
    {
      const rows = rowsOf(got.body, league, stats);
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
    }
  }

  console.log(`\n${asked} request(s) spent` + (left == null ? "" : `, ${left} left today`));
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
  /* This run's rows first: dedupe keeps the first of a pair, and a row
     re-derived now may carry statistics the stored one lacks. */
  const merged = L.dedupe(kept.concat(prior));

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
