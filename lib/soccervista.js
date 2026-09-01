"use strict";

/**
 * Final scores, second source.
 *
 * WHY THIS EXISTS
 *
 * lib/oracle.js says why the site needs an authoritative score at all: the
 * sweep infers finality by watching a match vanish from the live feed, and
 * roughly a fifth of goals arrive after the 80th minute, so "last seen late"
 * is not "final". That argument still stands. What changed is that the oracle
 * stopped answering - the API-Football account is suspended, and every call
 * including /status comes back "Your account is suspended" - and its free plan
 * only ever reached three days anyway.
 *
 * On 31 Aug 2026 that left six games graded out of about thirty, because the
 * only other source of finality is a sweep GitHub throttles to five runs a
 * day. This file is the replacement.
 *
 * WHAT IT IS
 *
 * SoccerVista publish the day's board from one unauthenticated GET, and the
 * data behind it is Opta's - their page carries the Opta mark. Every event
 * arrives with `isFinished` and a score, so finality is stated rather than
 * inferred. That is the whole reason it is worth having: no 80th-minute
 * sighting, no sweep cadence, no window in which a match can be missed.
 *
 * MEASURED BEFORE IT WAS TRUSTED
 *
 *   scores      63/63 and 64/64 exact agreement with our own graded rows for
 *               30 and 29 Aug 2026. No mismatches.
 *   coverage    1,026 and 1,558 finished matches on those days, against the
 *               seventy-odd we grade.
 *   freshness   games marked live within minutes of kick-off and finished
 *               within minutes of full time.
 *   window      about seven days either side of today. Older dates return an
 *               empty array rather than an error.
 *   access      plain GET, no key, no User-Agent needed, 200 from a
 *               datacentre. robots.txt disallows only `/*?` and this path
 *               carries no query string.
 *
 * DELIBERATELY NOT ITS OWN MATCHER
 *
 * Rows come back in exactly the shape lib/oracle.js produces, so callers pair
 * them with ORACLE.findMatch - the conservative rule that accepts a pairing
 * only when both clubs match completely. A second matcher would be a second
 * set of bugs, and this is the code path that writes scores onto the record.
 *
 * Non-fatal by construction, like every enrichment in the build: any failure
 * reports a reason and the caller carries on.
 */

const BASE = "https://www.soccervista.com/events/by/date/";
const TIMEOUT_MS = 15000;

/* No key to hold, so it is on unless switched off - which is here for the
   moment somebody needs to take it out of the build without a deploy. */
function configured() {
  return String(process.env.SOCCERVISTA_OFF || "") !== "1";
}

/* They key the day DD-MM-YYYY; every date in this codebase is YYYY-MM-DD. */
function toTheirDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* "2:3" -> [2, 3]. Anything else -> null.
   Strict on purpose: this number becomes a published result, and a half-parsed
   score is worse than no score. Extra-time and shootout strings ("3:3 (4:2)")
   are left alone rather than guessed at - the 90-minute score is what the
   markets we grade are settled on, and a bare pair is the only shape we can be
   sure carries it. */
function parseScore(s) {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/.exec(String(s || ""));
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/* Their day, reduced to the row shape lib/oracle.js produces, so both sources
   can be handed to the same findMatch and the same callers. */
function parseDay(body) {
  const out = [];
  for (const t of Array.isArray(body) ? body : []) {
    const league = (t && t.name) || "";
    const country = (t && t.countryName) || "";
    for (const e of (t && t.events) || []) {
      /* Finality is stated, so take it as stated - and take nothing that is
         still running, paused or merely scheduled. */
      if (!e || !e.isFinished || e.isLive || e.isScheduled) continue;
      const sc = parseScore(e.score);
      if (!sc) continue;
      out.push({
        home: String(e.homeTeam || ""),
        away: String(e.awayTeam || ""),
        hg: sc[0], ag: sc[1],
        league: country ? `${country} ${league}` : league,
        status: "FT",
      });
    }
  }
  return out;
}

/* Every finished match on one date. `date` is YYYY-MM-DD.
   Outside their window the answer is a valid empty array, not an error, so an
   old date reports ok with no rows and the caller falls through to whatever it
   did before. */
async function resultsFor(date, opts) {
  if (!configured()) return { ok: false, why: "switched off", rows: [] };
  const theirs = toTheirDate(date);
  if (!theirs) return { ok: false, why: "bad date " + date, rows: [] };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts && opts.timeoutMs) || TIMEOUT_MS);
  try {
    const r = await fetch(BASE + theirs + "/", {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, why: "http " + r.status, rows: [] };
    let body;
    try { body = JSON.parse(text); }
    catch (e) { return { ok: false, why: "bad json", rows: [] }; }
    if (!Array.isArray(body)) return { ok: false, why: "unexpected shape", rows: [] };
    return { ok: true, rows: parseDay(body) };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e), rows: [] };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { configured, resultsFor, parseDay, parseScore, toTheirDate, BASE };
