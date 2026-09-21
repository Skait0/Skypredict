"use strict";
/**
 * WHICH CLUBS ARE THE FEEDS QUIETLY COLLAPSING? OFFLINE / BY HAND.
 *
 *     node scripts/namesaudit.js [--json]
 *
 * One club published under two feed names is not a cosmetic problem: it puts a
 * match on the board that never happened. "Independiente Rivadavia" lost its
 * Rivadavia to the trailing-qualifier rule in matchTeam and became
 * Independiente - a different, real club in the same division - so Barracas
 * Central v Independiente was published beside the real Barracas Central v
 * Ind. Rivadavia, both rows paired to the SAME SportyBet event, and the daily
 * code went out with five legs and four games.
 *
 * That pair is aliased now. This answers the question the alias does not: is
 * there another one sitting quietly on the board?
 *
 * Three questions, asked of every name the four bookmaker feeds carry:
 *
 *   1. COLLISIONS - two feed spellings that resolve to one club. Most are
 *      harmless (their "CA Barracas Central" and our "Barracas Central"), so
 *      they are ranked by how much the matcher had to throw away: a dropped
 *      word that appears in some OTHER club's name is the dangerous shape, and
 *      it is exactly what Rivadavia was.
 *   2. CLASHES - two fixtures sharing a club and a kick-off instant. The build
 *      drops these now; seeing one here means a collapse is still happening
 *      upstream of the guard.
 *   3. SILENT DROPS - a name the matcher refuses entirely, which is a fixture
 *      nobody can book rather than a wrong one. Counted, not listed in full.
 *
 * Read-only: no writes, no booking, four GETs.
 */
const M = require("../lib/model.js");
const B = require("../lib/build.js");

const ORIGIN = process.env.SW_ORIGIN || "https://www.soccerwizard.live";
const FEEDS = {
  sporty: "/api/fixtures",
  bet9ja: "/api/bet9ja",
  betking: "/api/betking",
  betpawa: "/api/betpawa",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const get = (path) => fetch(ORIGIN + path, {
  headers: { "User-Agent": UA, Accept: "application/json" },
}).then((r) => r.json());

/* Both feed shapes in one: SportyBet sends the sides apart, the other three
   send "Home - Away" in one string. Same reshaper the site uses, for the same
   reason - a second one would drift. */
function rowsOf(book, body) {
  const out = [];
  if (book === "sporty") {
    for (const m of body.matches || []) {
      if (!m.homeTeam || !m.awayTeam) continue;
      out.push({ home: m.homeTeam, away: m.awayTeam,
                 kickoff: new Date(m.startTime).toISOString(),
                 league: m.league || "" });
    }
    return out;
  }
  for (const m of Object.values(body.matches || {})) {
    const bits = String(m.teams || "").split(" - ");
    if (bits.length < 2) continue;
    out.push({ home: bits[0].trim(), away: bits.slice(1).join(" - ").trim(),
               kickoff: new Date(m.kickoff).toISOString(),
               league: m.league || "" });
  }
  return out;
}

/* The same league resolution the build does: the feed's own league name when
   the index knows it, otherwise the first league holding both clubs. */
function resolve(idx, home, away) {
  for (let l = 0; l < idx.leagues.length; l++) {
    const h = M.matchTeam(idx, home, l), a = M.matchTeam(idx, away, l);
    if (h && a) return { li: l, h, a };
  }
  return { li: null, h: M.matchTeam(idx, home, null),
           a: M.matchTeam(idx, away, null) };
}

/* A tie that crosses a border ON PURPOSE. Every European and continental
   competition, the internationals, and anything a feed calls a cup: those pair
   two countries by design and drown the one line worth reading. */
const INTERNATIONAL =
  /international|champions|europa|conference|uefa|concacaf|libertadores|sudamericana|copa|afc |caf |world cup|friendl|qualif|nations|euro |cup|supercup|super cup|club wc|srl/i;

const norm = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* What the matcher had to throw away to reach this club, and whether that word
   belongs to somebody else. A dropped word no other club carries is vendor
   decoration; one that another club carries is the Rivadavia shape. */
function risk(idx, feedName, club) {
  const fw = norm(feedName).split(" ").filter(Boolean);
  const cw = new Set(norm(club).split(" ").filter(Boolean));
  const lost = fw.filter((w) => !cw.has(w) && w.length > 2);
  if (!lost.length) return null;
  /* NOT "some other club owns that word" - half the index owns "united" and
     none of it matters. The dangerous shape is a club that owns the dropped
     word AND shares a root with the one we picked: "Ind. Rivadavia" owns
     rivadavia and its "ind" is the front of "independiente", which is exactly
     how one name became the other club. A generic suffix fails the second
     half of that test - Man United owns "united" but nothing in it is the
     front of "Leeds". */
  const shareRoot = (aw, bw) => aw.some((x) => bw.some((y) =>
    (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y))));
  const owners = [];
  for (const t of idx.teams) {
    if (t === club) continue;
    const tw = norm(t).split(" ").filter(Boolean);
    const set = new Set(tw);
    if (!lost.every((w) => set.has(w))) continue;
    if (!shareRoot(tw, [...cw])) continue;
    owners.push(t + " (" + lost.join(" ") + ")");
  }
  return owners.length ? { lost, owners: owners.slice(0, 4) } : null;
}

(async () => {
  const matches = B.loadFloorMatches();
  const idx = M.buildIndex(matches);
  console.log(`index: ${idx.teams.length} clubs in ${idx.leagues.length} leagues ` +
    `from ${matches.length} cached results`);

  const seenName = new Map();      // club -> Set(feed spellings)
  const clashes = [];
  const crossed = [];
  let rows = 0, refused = 0;

  for (const [book, path] of Object.entries(FEEDS)) {
    let body;
    try { body = await get(path); }
    catch (e) { console.log(`${book}: ${e.message} - skipped`); continue; }
    const list = rowsOf(book, body);
    console.log(`${book}: ${list.length} fixtures`);
    /* PER BOOK. A global slot map calls the same fixture read off two feeds a
       clash, which is the one thing it is not - and that false positive sat on
       top of the real finding the first time this ran. */
    const slots = new Map();
    for (const f of list) {
      rows++;
      const { h, a } = resolve(idx, f.home, f.away);
      for (const [feedName, club] of [[f.home, h], [f.away, a]]) {
        if (!club) { refused++; continue; }
        if (!seenName.has(club)) seenName.set(club, new Set());
        seenName.get(club).add(feedName);
      }
      /* THE CHECK THAT WOULD HAVE CAUGHT RAPID. A fixture whose two clubs the
         index holds in different COUNTRIES is either a cup tie - real and
         common - or a name that crossed a border, which is how Bet9ja's
         "Rapid 1923" became SK Rapid of Vienna rather than Rapid Bucuresti. */
      if (h && a && !INTERNATIONAL.test(f.league || "")) {
        const hl = idx.leagues[idx.tIdx[h] != null ? idx.teamLeague[idx.tIdx[h]] : -1] || "";
        const al = idx.leagues[idx.tIdx[a] != null ? idx.teamLeague[idx.tIdx[a]] : -1] || "";
        if (hl && al && hl.split(" ")[0] !== al.split(" ")[0]) {
          crossed.push({ book, league: f.league, raw: `${f.home} - ${f.away}`,
                         h, a, hl, al });
        }
      }
      if (!h || !a || !f.kickoff || f.kickoff === "Invalid Date") continue;
      for (const club of [h, a]) {
        const key = f.kickoff + "|" + club;
        const held = slots.get(key);
        const name = `${h} v ${a}`;
        if (held && held !== name) {
          clashes.push({ book, at: f.kickoff, club, a: held, b: name });
        }
        slots.set(key, name);
      }
    }
  }

  /* A collision is only news when the matcher threw a word away that another
     club owns. Everything else is a vendor prefix or a missing accent. */
  const risky = [], benign = [];
  for (const [club, names] of seenName) {
    if (names.size < 2) continue;
    const flagged = [...names]
      .map((n) => ({ name: n, r: risk(idx, n, club) }))
      .filter((x) => x.r);
    (flagged.length ? risky : benign).push({ club, names: [...names], flagged });
  }

  console.log(`\n${rows} fixtures read, ${refused} names the matcher refused ` +
    `(those are missing fixtures, not wrong ones)`);

  console.log(`\nCOLLISIONS WORTH READING (${risky.length}):`);
  for (const c of risky.sort((x, y) => y.flagged.length - x.flagged.length)) {
    console.log(`  ${c.club}  <-  ${c.names.join(" | ")}`);
    for (const f of c.flagged) {
      console.log(`      "${f.name}" dropped [${f.r.lost.join(", ")}] which ` +
        `belongs to: ${f.r.owners.join(", ")}`);
    }
  }
  console.log(`\nharmless collisions (prefixes, accents): ${benign.length}`);

  console.log(`\nCROSS-COUNTRY PAIRINGS (${crossed.length}) - a cup tie here is ` +
    `fine; a league fixture is a name that crossed a border:`);
  for (const c of crossed.slice(0, 25)) {
    console.log(`  ${c.book} [${c.league}] "${c.raw}" -> ${c.h} (${c.hl}) v ` +
      `${c.a} (${c.al})`);
  }
  if (crossed.length > 25) console.log(`  ... and ${crossed.length - 25} more`);

  console.log(`\nKICK-OFF CLASHES (${clashes.length}):`);
  for (const c of clashes) {
    console.log(`  ${c.book} ${c.at} ${c.club}: ${c.a}  vs  ${c.b}`);
  }
  if (!clashes.length) console.log("  none - no club is in two places at once");

  if (process.argv.includes("--json")) {
    console.log("\n" + JSON.stringify({ risky, clashes }, null, 1));
  }
})().catch((e) => { console.error(e); process.exit(1); });
