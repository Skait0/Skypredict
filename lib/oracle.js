"use strict";

/**
 * Final scores from an authoritative source.
 *
 * WHY THIS EXISTS
 *
 * Neither feed the site already had can tell us how a match ended. The live
 * feed carries only games in play and drops a match the moment it finishes;
 * the results feed is correct but runs two or three days behind. So the sweep
 * inferred a final score: watch a match, remember the last score seen, and when
 * it disappears from the live feed treat that score as final, provided it was
 * last seen past the 80th minute.
 *
 * That premise is wrong, and it was wrong on the board. Measured against this
 * source for 28 Aug 2026: of five matches the sweep banked, three scores were
 * wrong and two verdicts were wrong. Bayern v Stuttgart was recorded 1-0 and
 * finished 5-1; Lille v Paris SG was recorded 2-1 and finished 2-2. Milan v
 * Venezia was recorded 1-0 with a 0-0 half time and a 2-0 finish, so it was
 * not the old half-time-score bug either - it was simply a snapshot taken
 * before the end. Roughly a fifth of goals arrive after the 80th minute, so no
 * amount of scraper accuracy makes "last seen late" mean "final". Both wrong
 * verdicts were hits we published as misses, which means the error also
 * understated our own hit rate.
 *
 * WHAT IT DOES
 *
 * One request returns every fixture for a date with its final score. That
 * replaces the inference entirely for any match it covers.
 *
 * DELIBERATELY CONSERVATIVE
 *
 * A wrong match here writes a wrong score, which is the failure we are trying
 * to end - so a pairing is accepted only when *both* clubs match completely.
 * Anything less is left unresolved and simply goes unpublished, because
 * silence is the honest answer and a guess is what got us here. On a real day
 * that confirms about 90% of the card; the rest wait for the results feed.
 *
 * Non-fatal by construction, like every other enrichment in the build: with no
 * key configured every call reports "not configured" and the caller carries on
 * exactly as it did before this file existed.
 */

const BASE = "https://v3.football.api-sports.io";
const TIMEOUT_MS = 12000;

function key() { return process.env.APISPORTS_KEY || ""; }
function configured() { return !!key(); }

/* Only these mean the score on the row is the one it ended on. Anything else -
   in play, postponed, abandoned, awarded - is not a final score. */
const FINAL = new Set(["FT", "AET", "PEN"]);

/* Corporate noise and league furniture. Dropping these lets "1. FC Köln"
   meet "FC Koln" and "Hamburger SV" meet "Hamburg". */
const STOP = new Set(["fc", "cf", "ac", "sc", "ss", "as", "cd", "ca", "club", "de",
  "of", "do", "da", "afc", "cfc", "sv", "tsv", "vfb", "vfl", "bsc", "fsv", "spvgg",
  "calcio", "futbol", "futebol", "football", "the", "team", "us", "ud", "rc", "rcd",
  "sk", "fk", "nk", "ik", "if", "bk"]);

/* Shorthands no string distance will reconcile on its own. A value may expand
   to several words ("sg" is "saint germain"). */
const ALIAS = { utd: "united", sth: "south", nott: "nottingham", st: "saint",
  sg: "saint germain", munich: "munchen", muenchen: "munchen" };

/* Words that name the FORM of a club rather than which club it is. When one of
   these is left over on one side it is not evidence of a different team, so it
   does not count against a match: "Borussia Dortmund" is "Dortmund".
   Nothing that distinguishes two real clubs may go in here - "city", "wednesday"
   and "II" are all load-bearing, which is why they are absent. */
const FURNITURE = new Set(["borussia", "arminia", "united", "kv", "ss", "ssc",
  "sd", "cs", "ec", "se", "ad", "cp"]);

function toks(s) {
  const out = [];
  const raw = String(s == null ? "" : s)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/);
  for (const t of raw) {
    for (const w of String(ALIAS[t] || t).split(" ")) {
      if (w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)) out.push(w);
    }
  }
  return out;
}

/* One club-word against another: equal, an abbreviation from the front
   ("Ein" for "Eintracht"), or sitting inside it ("Gladbach" inside
   "Monchengladbach"). */
function sameTok(a, b) {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 5 && b.indexOf(a) >= 0) return true;
  if (b.length >= 5 && a.indexOf(b) >= 0) return true;
  return false;
}

/* A club's own name is usually the SHORT one - feeds write "Stockport" where
 * the API writes "Stockport County", "Betis" for "Real Betis", "Hearts" for
 * "Heart of Midlothian". So a name is fully matched when every one of its own
 * words is answered; requiring the longer name to be exhausted as well throws
 * away two thirds of a real card.
 *
 * That leniency is what lets "Inter" match "Inter Miami", so it is not left to
 * carry the safety on its own. Two guards do that instead: markers() below,
 * and the tie-break in findMatch. `extra` counts the words left over on the
 * other side, which is how a closer candidate wins against a longer one.
 */
function detail(x, y) {
  const A = toks(x), B = toks(y);
  if (!A.length || !B.length) return { score: 0, extra: 99 };
  const usedB = new Array(B.length).fill(false);
  let m = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (!usedB[j] && sameTok(A[i], B[j])) { usedB[j] = true; m++; break; }
    }
  }
  const extra = B.filter((t, j) => !usedB[j] && !FURNITURE.has(t)).length;
  return { score: m / A.length, extra: extra };
}

function similarity(x, y) { return detail(x, y).score; }

/* Reserve, youth and women's sides carry their club's name, so a text matcher
 * will happily read "Stuttgart II" as "Stuttgart" - and then write a reserve
 * result onto a first-team prediction. These markers are compared as a set and
 * must agree exactly: a name carrying one only ever matches a name carrying
 * the same one. This is a different question from string similarity, which is
 * why it is asked separately.
 */
function markers(s) {
  const out = new Set();
  const raw = " " + String(s == null ? "" : s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ") + " ";
  if (/ (ii|2|b) /.test(raw)) out.add("reserves");
  if (/ iii /.test(raw)) out.add("third");
  if (/ (u ?1[5-9]|u ?2[0-3]) /.test(raw)) out.add("youth");
  if (/ (women|feminin|femenino|femenina|frauen|ladies) /.test(raw)) out.add("women");
  if (/ (reserves?|academy|youth|jugend|primavera|junioren) /.test(raw)) out.add("youth");
  return out;
}
function sameVariant(a, b) {
  const A = markers(a), B = markers(b);
  if (A.size !== B.size) return false;
  for (const t of A) if (!B.has(t)) return false;
  return true;
}

/* Both clubs must match completely, the pairing must not be a reserve or youth
 * side of the club we meant, and it must be a clearly better fit than the
 * runner-up. Where two candidates are equally good the answer is refused
 * rather than guessed - an unconfirmed result costs a line on a page, a wrong
 * one is the bug this file was written to end.
 */
function findMatch(rows, home, away) {
  const cand = [];
  for (const r of rows || []) {
    if (!sameVariant(home, r.home) || !sameVariant(away, r.away)) continue;
    const h = detail(home, r.home), a = detail(away, r.away);
    const score = Math.min(h.score, a.score);
    if (score >= 1) cand.push({ row: r, extra: h.extra + a.extra });
  }
  if (!cand.length) return null;
  cand.sort((p, q) => p.extra - q.extra);
  if (cand.length > 1 && cand[1].extra === cand[0].extra) return null;  // ambiguous
  return cand[0].row;
}

/* The 90-minute score, which is what every market we grade settles on.

   `goals` is the score the fixture ENDED on, not the score at 90 minutes: for
   AET it carries the extra-time goals, and for PEN it carries the score at the
   end of extra time. Grading a 1X2 or an over line against either settles the
   wrong bet - a cup tie level at 90 and won in extra time is a DRAW to every
   market we offer, and was being written into the record as a home or away win.

   `score.fulltime` is the 90-minute score whatever the status, so it is read
   first. `goals` only answers for FT, where the two are the same by definition.
   A row carrying neither is dropped rather than guessed at. */
function ninety(f) {
  const ft = f && f.score && f.score.fulltime;
  if (ft && ft.home != null && ft.away != null) return [Number(ft.home), Number(ft.away)];
  const st = String((f && f.fixture && f.fixture.status && f.fixture.status.short) || "");
  if (st === "FT" && f && f.goals && f.goals.home != null && f.goals.away != null)
    return [Number(f.goals.home), Number(f.goals.away)];
  return null;
}

/* The API's shape, reduced to what a result needs. Rows that have not finished
   are dropped here so no caller has to know the status vocabulary. */
function parseFixtures(body) {
  const out = [];
  for (const f of (body && body.response) || []) {
    const st = f && f.fixture && f.fixture.status && f.fixture.status.short;
    if (!FINAL.has(String(st || ""))) continue;
    const sc = ninety(f);
    if (!sc) continue;
    const hg = sc[0], ag = sc[1];
    out.push({
      home: (f.teams && f.teams.home && f.teams.home.name) || "",
      away: (f.teams && f.teams.away && f.teams.away.name) || "",
      hg: Number(hg), ag: Number(ag),
      league: (f.league && f.league.name) || "",
      status: String(st),
    });
  }
  return out;
}

/* Every finished fixture on one date. `date` is YYYY-MM-DD.
   The free plan only serves a rolling window of a few days around today, and
   answers anything outside it with an errors object rather than an HTTP error
   - so that case is surfaced as a plain reason, not thrown. */
async function resultsFor(date, opts) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts && opts.timeoutMs) || TIMEOUT_MS);
  try {
    const r = await fetch(BASE + "/fixtures?date=" + encodeURIComponent(date), {
      signal: ctrl.signal,
      headers: { "x-apisports-key": key() },
    });
    const text = await r.text();
    /* API-Football states what is left of the day's allowance on every reply.
       Carrying it out means the build can SAY how close it is, instead of the
       account going quiet and the reason being worked out days later from
       commit counts. See the quota note in lib/build.js. */
    const left = r.headers && (r.headers.get("x-ratelimit-requests-remaining") ||
                               r.headers.get("X-RateLimit-requests-Remaining"));
    const quota = left == null ? null : Number(left);
    if (!r.ok) return { ok: false, why: "http " + r.status + " " + text.slice(0, 160), rows: [], quota };
    let body;
    try { body = JSON.parse(text); }
    catch (e) { return { ok: false, why: "bad json", rows: [] }; }
    /* `errors` is an object when the plan refuses the date, an empty array
       when all is well. */
    const errs = body && body.errors;
    if (errs && !Array.isArray(errs) && Object.keys(errs).length) {
      return { ok: false, why: Object.values(errs).join("; "), rows: [], quota };
    }
    return { ok: true, rows: parseFixtures(body), quota };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e), rows: [] };
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  configured, resultsFor, findMatch, parseFixtures, markers, sameVariant,
  similarity, toks, sameTok, FINAL, ninety,
};
