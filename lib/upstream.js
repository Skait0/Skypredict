"use strict";

/**
 * Edge-cached proxy for the Railway feeds.
 *
 * The live-scores feed is the one part of the site that scales with the
 * number of people watching rather than the number of deploys. Every open
 * tab polls it every thirty seconds, and Railway answers with no cache
 * headers at all, so each of those polls reached the origin box. Ten
 * thousand tabs is three hundred requests a second at one small container.
 *
 * Routing the feed through here puts Vercel's CDN in front of it. s-maxage
 * caps how often any one edge asks Railway; stale-while-revalidate means
 * that when the window does lapse the next visitor still gets the stored
 * copy immediately while the refresh happens behind them. Nobody waits, and
 * the origin sees a request rate set by the cache window, not by the
 * audience - the same number whether a hundred people are watching or a
 * million.
 *
 * A blip upstream must not become an error on the site, so the last good
 * answer is kept in memory and served while Railway is unwell. Failures are
 * never cached: caching a 503 would pin the outage in place for everyone.
 */

const UPSTREAM = "https://web-production-798c0.up.railway.app";

/* Cache windows.
 *
 * Live scores: 20s. The page polls on a 30s timer, so a shorter window buys
 * no freshness a user could perceive - it only costs origin requests. The
 * stale window is generous because a minute-old score during an outage is
 * far better than an empty board.
 *
 * Fixtures: the day's card changes when a build runs, not continuously, so
 * this can be minutes rather than seconds. */
const FEEDS = {
  live: { path: "/api/livescores", cache: "public, s-maxage=20, stale-while-revalidate=120" },
  fixtures: { path: "/api/fixtures", cache: "public, s-maxage=600, stale-while-revalidate=3600" },
  /* Bet9ja is a second bookmaker, not a second source of truth: a booking code
     only helps somebody who holds an account with the firm that issued it, so
     the site carries both. Its upstream is a sweep of 170 competitions that
     refreshes every 45 minutes, so asking more often than the SportyBet feed
     would buy nothing - the answer would be identical. */
  bet9ja: { path: "/api/bet9ja/fixtures", cache: "public, s-maxage=600, stale-while-revalidate=3600" },
};

/* Below the function's own maxDuration, so a slow upstream returns the
   stored board rather than being killed mid-flight with nothing to send. */
const TIMEOUT_MS = 8000;

/* The live feed sends every match five times over.
 *
 * Measured 28 Aug: 400 entries, 80 distinct pairings, each one repeated
 * exactly five times with byte-identical fields down to the minute. So it is
 * one snapshot emitted five times rather than five snapshots of different
 * moments - nothing is lost by keeping the first of each.
 *
 * The cost was being paid by everyone: the board polls this every 30 seconds,
 * so four fifths of that traffic was copies, on the mobile connections this
 * site is mostly read over. It also made `liveMatches` in the sweep's own
 * output read five times higher than the truth, which is the sort of number
 * somebody later reasons from.
 *
 * Keyed on the pairing and its competition. Two different games cannot share
 * both clubs and a competition on the same day, and if the upstream is ever
 * fixed this becomes a no-op rather than something to undo. */
function dedupeMatches(body) {
  if (!body || !Array.isArray(body.matches)) return body;
  const seen = new Set(), out = [];
  for (const m of body.matches) {
    if (!m) continue;
    const k = (m.home || "") + "|" + (m.away || "") + "|" + (m.league || "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return (out.length === body.matches.length) ? body : Object.assign({}, body, { matches: out });
}

/* What to send, given how the upstream call went. Pure, so the rule that
   decides whether an outage is visible can be tested without a network. */
function feedResponse(fresh, lastGood, cacheControl) {
  if (fresh && fresh.ok) {
    return { status: 200, body: fresh.body, cacheControl, tag: "live", store: true };
  }
  if (lastGood) {
    /* Stale but real. Kept short so the site heals on the next poll rather
       than serving an old board for as long as the healthy window allows. */
    return {
      status: 200, body: lastGood, cacheControl: "public, s-maxage=15",
      tag: "stale-after-error", store: false,
    };
  }
  return {
    status: 502, body: { error: "upstream unavailable" },
    cacheControl: "no-store", tag: "down", store: false,
  };
}

async function fetchUpstream(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(UPSTREAM + path, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!r.ok) return { ok: false, why: "http " + r.status };
    return { ok: true, body: await r.json() };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e) };
  } finally {
    clearTimeout(t);
  }
}

/* One handler per feed. The warm-container memo is a second line of defence
   behind the CDN, not the main one - it only helps requests that reach a
   container that has already served this feed. */
function makeHandler(name) {
  const feed = FEEDS[name];
  let lastGood = null;

  return async (req, res) => {
    const fresh = await fetchUpstream(feed.path);
    if (name === "live" && fresh && fresh.ok) fresh.body = dedupeMatches(fresh.body);
    const out = feedResponse(fresh, lastGood, feed.cache);
    if (out.store) lastGood = out.body;
    if (!fresh.ok) res.setHeader("X-Formline-Upstream", fresh.why);

    res.setHeader("X-Formline-Feed", out.tag);
    res.setHeader("Cache-Control", out.cacheControl);
    return res.status(out.status).json(out.body);
  };
}

module.exports = { makeHandler, feedResponse, dedupeMatches, FEEDS, UPSTREAM };
