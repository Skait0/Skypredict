"use strict";

/**
 * How many of our fixtures does Bet9ja actually carry, and under what names?
 *
 * Sizing the work before doing it. The SportyBet matcher took a long tail of
 * aliases to get right - Barcelona SC, Levadiakos, Basaksehir - and the
 * assumption was that none of it transfers, because an alias folds OUR
 * spelling and THEIRS onto a common form and Bet9ja spells things its own way.
 * A week was budgeted for it.
 *
 * ANSWER, measured 1 Sep 2026: the tail is empty.
 *
 *     sportybet   238 of 238 upcoming fixtures   100%
 *     bet9ja      230 of 238                      96.6%
 *
 * Not one of the eight misses is an alias problem. Five are fixtures Bet9ja
 * does not price (the Russian top flight twelve days out, League of Ireland),
 * two are La Liga fixtures they list on a provisional date more than 24 hours
 * from ours, and one is a correct rejection - Rosario Central is not Atletico
 * Rosario. normTeam is aggressive enough, and the two bookmakers spell clubs
 * more alike than either spells them like our feed.
 *
 * --wide tests one change: let an exact match on BOTH normalised names ignore
 * the 24h clock fence. That fence exists because of the Barcelona SC bug,
 * which was a FUZZY match, so a both-sides-exact rule cannot reach it. Worth
 * 230 -> 232 on Bet9ja and, importantly, 238 -> 238 on SportyBet: it gains
 * without disturbing the live path. Not shipped yet - it belongs with the
 * site-side work, where it can be tested against both bookmakers at once.
 *
 * Uses the site's own normTeam/simTeams/sameSlot, lifted out of index.html
 * rather than reimplemented. A separate copy would measure a matcher we do not
 * ship.
 *
 *   node scripts/b9match.js            live from the API
 *   node scripts/b9match.js --misses   list every unpaired fixture
 *   node scripts/b9match.js --sporty   the same matcher against SportyBet
 *   node scripts/b9match.js --wide     with the exact-name clock relaxation
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HOST = process.env.SW_API || "https://web-production-798c0.up.railway.app";
/* --sporty measures the same matcher against SportyBet, which is the only
   way to tell a shared improvement from a Bet9ja-shaped one. */
const SPORTY = process.argv.includes("--sporty");
const WIDE = process.argv.includes("--wide");

/* ---------------------------------------------------- the shipped matcher */

const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function grab(name) {
  const re = new RegExp("(?:^|\\n)((?:var|const|function)\\s+" + name + "\\b)", "m");
  const m = re.exec(src);
  if (!m) throw new Error("not found in index.html: " + name);
  const i = m.index + m[0].indexOf(m[1]);

  /* A function is its braces. A declaration runs to its semicolon - but the
     initialiser may itself be a brace block (TEAM_ALIASES) whose contents can
     hold semicolons inside strings, so track depth and only stop at a
     semicolon outside every brace. Reading to the first ";" was enough for the
     functions and silently truncated the object; reading to the first "{" ran
     a plain number off into the next function entirely. */
  const isFn = m[1].startsWith("function");
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") { depth++; started = true; }
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (isFn && started && depth === 0 && c === "}") return src.slice(i, k + 1);
    } else if (c === ";" && depth === 0 && !isFn) return src.slice(i, k + 1);
  }
  throw new Error("could not find the end of " + name);
}

const NAMES = ["TEAM_ALIASES", "MATCH_WINDOW_MS", "normTeam", "normTeamRaw",
               "tokset", "teamMarkers", "sameVariant", "simTeams", "evStart",
               "sameSlot"];
const pieces = NAMES.map(grab).join("\n");
const M = new Function(
  pieces +
  "\nvar NT_CACHE=Object.create(null),NT_SIZE=0;const NT_MAX=20000;" +
  "\nreturn {normTeam:normTeam,simTeams:simTeams,sameSlot:sameSlot};")();

/* ------------------------------------------------------------------ data */

async function bookmaker() {
  const url = HOST + (SPORTY ? "/api/fixtures" : "/api/bet9ja/fixtures");
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const d = await r.json();
  if (!d.success) throw new Error("fixtures: " + (d.error || r.status));
  if (SPORTY) return (d.matches || []).map((m) => ({
    eventId: m.eventId, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
    startTime: m.startTime, league: m.league, odds: m.odds || {},
  }));
  /* Into the shape attachEventIds already speaks. Their "Home - Away" is one
     string; SportyBet sends the sides separately. */
  return Object.values(d.matches).map((m) => {
    const bits = String(m.teams || "").split(" - ");
    return {
      eventId: m.eventId,
      homeTeam: (bits[0] || "").trim(),
      awayTeam: (bits.slice(1).join(" - ") || "").trim(),
      startTime: Date.parse(m.kickoff),
      league: m.league, country: m.country, odds: m.odds || {},
    };
  });
}

/* Same candidate window and thresholds as attachEventIds. Copied deliberately:
   this measures what the site would do, so it has to agree with the site. */
function pair(fixtures, events) {
  const byDate = {};
  events.forEach((m) => {
    if (!m.eventId || !isFinite(m.startTime)) return;
    const k = new Date(m.startTime).toISOString().slice(0, 10);
    (byDate[k] = byDate[k] || []).push(m);
  });

  const hits = [], misses = [];
  fixtures.forEach((f) => {
    let cand = [];
    [-3, -2, -1, 0, 1, 2, 3].forEach((o) => {
      const dt = new Date(f.date + "T12:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + o);
      const k = dt.toISOString().slice(0, 10);
      if (byDate[k]) cand = cand.concat(byDate[k]);
    });

    const fh = M.normTeam(f.home), fa = M.normTeam(f.away);
    let best = null, score = 0, exact = false;
    for (const m of cand) {
      const bothExact = M.normTeam(m.homeTeam) === fh && M.normTeam(m.awayTeam) === fa;
      /* --wide: does an exact match on BOTH sides justify a wider clock fence?
         The 24h fence exists because of the Barcelona SC bug, and that was a
         fuzzy match - home exact, away scoring 1.00 against the wrong club
         through a token prefix rule. A rule that demands both sides normalise
         identically cannot reach it, which is the point of testing it here
         before touching the matcher the site actually ships. */
      if (!(bothExact && WIDE) && !M.sameSlot(f, m)) continue;
      if (bothExact) { best = m; score = 99; exact = true; break; }
    }
    if (!best) cand.forEach((m) => {
      if (!M.sameSlot(f, m)) return;
      const sh = M.simTeams(f.home, m.homeTeam), sa = M.simTeams(f.away, m.awayTeam);
      if (sh >= 0.6 && sa >= 0.6 && sh + sa > score) { score = sh + sa; best = m; }
    });

    if (best && score >= 1.2) { hits.push({ f, m: best, score, exact }); return; }

    /* Why it missed, which is the whole point of the exercise. A miss with a
       perfect name score is a clock problem; a miss with a near score is a
       missing alias; a miss with nothing above zero means they do not carry
       the fixture and no amount of alias work will reach it. */
    const near = closest(f, cand);
    const ignoringClock = closest(f, cand, true);
    let why = "not carried";
    if (near && near.score >= 1.2) why = "name matched, kick-off too far apart";
    else if (ignoringClock && ignoringClock.score >= 1.2) why = "kick-off window";
    else if (near && near.score >= 0.8) why = "alias";
    misses.push({ f, cand: near, why });
  });
  return { hits, misses };
}

/* The best-scoring event we rejected, which is what tells you whether a miss
   is a missing alias or a fixture Bet9ja simply does not carry. */
function closest(f, cand, ignoreClock) {
  let best = null, score = -1;
  cand.forEach((m) => {
    if (!ignoreClock && !M.sameSlot(f, m)) return;
    const s = M.simTeams(f.home, m.homeTeam) + M.simTeams(f.away, m.awayTeam);
    if (s > score) { score = s; best = m; }
  });
  return best && score > 0 ? { m: best, score } : null;
}

/* ------------------------------------------------------------------- run */

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "predictions.json"), "utf8"));
  /* Bet9ja lists what it is taking bets on. A fixture that has already kicked
     off is not in their feed and never will be, so counting it as a miss
     measures the clock rather than the matcher. */
  const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length));
  const now = Date.now();
  const fixtures = (data.fixtures || []).filter((f) => {
    const k = Date.parse(f.kickoff);
    return !isFinite(k) || k > now;
  });
  const events = await bookmaker();
  const { hits, misses } = pair(fixtures, events);

  const pct = (n) => (100 * n / Math.max(1, fixtures.length)).toFixed(1) + "%";
  console.log("our fixtures    %d upcoming (of %d on the board)",
              fixtures.length, (data.fixtures || []).length);
  console.log("%s %d", pad((SPORTY ? "sportybet" : "bet9ja") + " events", 15),
              events.length);
  if (WIDE) console.log("(--wide: an exact match on both sides ignores the clock fence)");
  console.log("paired          %d  (%s)", hits.length, pct(hits.length));
  console.log("  exact name    %d", hits.filter((h) => h.exact).length);
  console.log("  fuzzy         %d", hits.filter((h) => !h.exact).length);
  console.log("unpaired        %d  (%s)", misses.length, pct(misses.length));

  const why = {};
  misses.forEach((x) => { why[x.why] = (why[x.why] || 0) + 1; });
  console.log("\nwhy they missed:");
  Object.entries(why).sort((a, b) => b[1] - a[1])
    .forEach(([w, n]) => console.log("  %s %s", pad(n, 4), w));

  const byLeague = {};
  misses.forEach((x) => { byLeague[x.f.league] = (byLeague[x.f.league] || 0) + 1; });
  console.log("\nmisses by league:");
  Object.entries(byLeague).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([l, n]) => console.log("  %s %s", pad(n, 4), l));

  if (process.argv.includes("--misses")) {
    console.log("\nevery unpaired fixture, with the closest thing Bet9ja had:");
    misses.sort((a, b) => (b.cand ? b.cand.score : -1) - (a.cand ? a.cand.score : -1));
    misses.forEach((x) => {
      const c = x.cand;
      console.log("  %s  %s %s -> %s", x.f.date, pad(x.why, 36),
        pad(x.f.home + " v " + x.f.away, 34),
        c ? c.m.homeTeam + " v " + c.m.awayTeam + "  (" + c.score.toFixed(2) + ")"
          : "(nothing scored above zero within 3 days)");
    });
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
