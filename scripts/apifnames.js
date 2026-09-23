"use strict";
/**
 * The same club, under two spellings. OFFLINE / READ-ONLY.
 *
 *   node scripts/apifnames.js [--min=3]
 *
 * scripts/apifbackfill.js brings three seasons of history for thirty leagues
 * that had weeks. Those leagues are warming - they hold no ratings yet - so
 * liveresults.resolve MINTS any club it cannot place, at the feed's spelling.
 * The SoccerVista harvest minted them first, in September, and API-Football
 * spells half of them differently:
 *
 *     Din. Zagreb        Dinamo Zagreb
 *     Lok. Plovdiv       Lokomotiv Plovdiv
 *     Dun. Streda        Dunajska Streda
 *     Slavia Prague      Slavia Praha
 *
 * Merged as they stand, each of those becomes TWO clubs: half the matches
 * each, two sets of ratings, and a fixture that resolves to whichever spelling
 * the board happened to use. That is the failure `slotClash` exists to catch
 * one fixture at a time, arriving here thirty leagues at once.
 *
 * So this proposes aliases instead of guessing. It prints pairs it is willing
 * to defend and, separately, everything it refused - and it writes nothing.
 * The accepted lines go into TEAM_ALIAS_SRC in lib/model.js by hand, which is
 * where every other alias earned its way in.
 *
 * WHAT IT WILL PAIR. Every token of the shorter name has to be answered by a
 * distinct token of the longer one - equal, an abbreviation of it, or sharing
 * a three-letter stem when both are long enough for that to mean something
 * (praha/prague). And the pairing has to be the only one available in that
 * league, both ways. "Hapoel Tel Aviv" and "Maccabi Tel Aviv" share two of
 * three tokens and are refused on the first; "Ararat" matches both "Ararat
 * Yerevan" and "Ararat-Armenia" and is refused on the second.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const B = require("../lib/build.js");
const M = require("../lib/model.js");
const L = require("../lib/liveresults.js");

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
}

const STEM = Math.max(2, Number(arg("min", 3)) || 3);

const toks = (s) => M.normName(s).split(/\s+/).filter(Boolean);

/* Does this one token answer that one? */
function tokenAnswers(a, b) {
  if (a === b) return true;
  if (a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 5 && b.length >= 5 && a.slice(0, STEM) === b.slice(0, STEM)) return true;
  return false;
}

/* Every token of the shorter name answered by a distinct token of the longer,
   and the leading token - the one that carries the club rather than the city -
   answered first. Without that last rule "Hapoel Tel Aviv" pairs with "Maccabi
   Tel Aviv" on two tokens out of three. */
function nameAnswers(a, b) {
  let A = toks(a), Bt = toks(b);
  if (!A.length || !Bt.length) return false;
  if (A.length > Bt.length) { const t = A; A = Bt; Bt = t; }
  if (!tokenAnswers(A[0], Bt[0])) return false;
  const used = new Set();
  for (const x of A) {
    let hit = -1;
    for (let i = 0; i < Bt.length; i++) {
      if (used.has(i) || !tokenAnswers(x, Bt[i])) continue;
      hit = i; break;
    }
    if (hit < 0) return false;
    used.add(hit);
  }
  return true;
}

/* Names the two sources put into each warming league. */
function namesByLeague() {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "apifbackfill.js"), "utf8");
  const LEAGUES = {};
  for (const m of src.matchAll(/^\s*(\d+):\s*"([^"]+)",$/gm)) LEAGUES[m[1]] = m[2];

  const floor = B.loadFloorMatches();
  const idx = M.buildIndex(floor);
  const allowed = new Set([].concat(
    Object.values(B.MAIN),
    Object.keys(B.EXTRA).map((c) => c + " " + B.EXTRA[c]),
    L.HARVEST_EXTRA));
  const boot = new Set(L.HARVEST_EXTRA);
  const DONE = new Set(["FT", "AET", "PEN"]);

  /* EVERY CLUB THE INDEX HOLDS, IN ANY LEAGUE.
     TEAM_ALIAS_SRC is keyed on the name alone - it has no idea which league a
     row came from - so an alias written for one country rewrites that spelling
     everywhere. This pass proposed `"Arsenal": "Arsenal Dzerzhinsk"` from the
     Belarusian top flight, which would have turned Arsenal of London into a
     club in Dzerzhinsk on every board we publish. `Aris` and `AEL` are the
     same trap pointing at Greece. So a name that already belongs to a club
     somewhere else is never aliased. */
  const elsewhere = new Map();
  for (const m of floor) {
    for (const club of [m.home, m.away]) {
      const k = M.normName(club);
      if (!elsewhere.has(k)) elsewhere.set(k, new Set());
      elsewhere.get(k).add(m.league);
    }
  }

  const fresh = {};
  const cache = path.join(ROOT, "tmp", "apif");
  let files = [];
  try { files = fs.readdirSync(cache); } catch (e) {
    throw new Error("no cached API-Football seasons - run scripts/apifbackfill.js first");
  }
  for (const f of files) {
    const m = /^(\d+)-(\d{4})\.json$/.exec(f);
    if (!m || !LEAGUES[m[1]]) continue;
    const league = LEAGUES[m[1]];
    let body;
    try { body = JSON.parse(fs.readFileSync(path.join(cache, f), "utf8")); } catch (e) { continue; }
    for (const fx of (body.response || [])) {
      if (!fx || !fx.fixture || !DONE.has(fx.fixture.status.short)) continue;
      const row = {
        league, home: fx.teams.home.name, away: fx.teams.away.name,
        hg: fx.goals.home, ag: fx.goals.away,
      };
      const res = L.resolve([row], idx, allowed, String(fx.fixture.date).slice(0, 10), boot);
      for (const x of res.matches) {
        (fresh[league] = fresh[league] || new Set()).add(x.home);
        fresh[league].add(x.away);
      }
    }
  }

  /* What is already on the board, which is the spelling to keep: the fixtures
     resolve against it today. */
  const held = {};
  for (const name of fs.readdirSync(path.join(ROOT, "data", "results"))) {
    if (!/^live_(?!apif)[A-Za-z0-9-]+\.csv(?:\.gz)?$/.test(name)) continue;
    const full = path.join(ROOT, "data", "results", name);
    const text = name.endsWith(".gz")
      ? zlib.gunzipSync(fs.readFileSync(full)).toString("utf8")
      : fs.readFileSync(full, "utf8");
    for (const m of L.fromCSV(text)) {
      (held[m.league] = held[m.league] || new Set()).add(m.home);
      held[m.league].add(m.away);
    }
  }
  return { fresh, held, elsewhere, leagues: Object.values(LEAGUES) };
}

(() => {
  const { fresh, held, elsewhere, leagues } = namesByLeague();
  const accept = [], ambiguous = [], onlyNew = [], collide = [];

  for (const league of leagues) {
    const A = [...(fresh[league] || [])].sort();
    const H = [...(held[league] || [])].sort();
    if (!A.length || !H.length) continue;

    for (const a of A) {
      if (H.includes(a)) continue;                    // already agrees
      const hits = H.filter((h) => nameAnswers(a, h));
      if (!hits.length) { onlyNew.push([league, a]); continue; }
      if (hits.length > 1) { ambiguous.push([league, a, hits]); continue; }
      /* And the other way: a held name that answers two new ones is just as
         wrong as a new name answering two held ones. */
      const back = A.filter((x) => nameAnswers(x, hits[0]));
      if (back.length > 1) { ambiguous.push([league, a, hits.concat("(" + back.join(" / ") + ")")]); continue; }
      /* The alias key is global. If this spelling is some other league's club,
         aliasing it moves that club too. */
      const owners = elsewhere.get(M.normName(a));
      const other = owners ? [...owners].filter((l) => l !== league) : [];
      if (other.length) { collide.push([league, a, hits[0], other]); continue; }
      accept.push([league, a, hits[0]]);
    }
  }

  console.log(`ALIASES TO ADD - ${accept.length} pair(s), API-Football spelling on the left:\n`);
  let last = "";
  for (const [league, a, h] of accept) {
    if (league !== last) { console.log(`  /* ${league} */`); last = league; }
    console.log(`  ${JSON.stringify(a)}: ${JSON.stringify(h)},`);
  }

  console.log(`\nREFUSED AS AMBIGUOUS - ${ambiguous.length}, decide these by hand:`);
  for (const [league, a, hits] of ambiguous) {
    console.log(`  ${league}: ${a}  ->  ${hits.join(" | ")}`);
  }

  console.log(`\nNEW CLUBS - ${onlyNew.length}, nothing on the board answers them.`);
  console.log("These are relegated or promoted sides the September harvest never saw,");
  console.log("which is what three seasons of history is supposed to bring. Spot-check a few:");
  for (const [league, a] of onlyNew.slice(0, 12)) console.log(`  ${league}: ${a}`);
  if (onlyNew.length > 12) console.log(`  ... and ${onlyNew.length - 12} more`);
})();
