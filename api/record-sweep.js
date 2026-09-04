"use strict";

const { applyCache, NO_STORE } = require("../lib/cachepolicy.js");

/**
 * GET/POST /api/record-sweep
 *
 * Writes down the final score of every fixture Soccerwizard published a tip
 * for - not only the ones somebody happened to be watching.
 *
 * The page keeps its own full-time ledger, but it can only see a game finish
 * while a browser is open on the site, so its coverage is whatever the day's
 * visitors happened to witness. This covers the rest.
 *
 * ## Why it works the way it does
 *
 * Neither feed reports a finished match:
 *
 *   - the live feed carries only games in play (HT, H1, H2). A match vanishes
 *     from it the moment it ends. There is no FT.
 *   - the fixtures feed carries odds and kick-off times, no scores.
 *   - football-data publishes in batches two or three days later, and has no
 *     cup football at all.
 *
 * So the only way to a final score is to watch a match while it is on and
 * notice when it disappears. That needs memory between polls, which a
 * serverless function does not have - hence the live_seen table.
 *
 * Each call does two things:
 *
 *   observe   every predicted fixture currently in the live feed has its score
 *             and minute written to live_seen.
 *   finalise  every live_seen row that is no longer in the feed, and is old
 *             enough to be genuinely over, is graded at its last known score
 *             and moved into results.
 *
 * Idempotent, so it is safe to call as often as you like, and it is meant to
 * be called often - the closer together the polls, the closer the last
 * observed score is to the real final one.
 *
 * ## The guard that matters
 *
 * A match that vanishes at 62 minutes vanished for some other reason: a feed
 * hiccup, a provider restart, an abandonment. Recording that as a final score
 * would put a wrong row in the one record that is supposed to be trustworthy,
 * and for a cup tie nothing downstream would ever correct it - football-data
 * will never publish it. So a row is only finalised if it was last seen late
 * in the second half. Anything else is left to expire unrecorded: a missing
 * result is recoverable, a wrong one is not.
 */

const G = require("../lib/grade.js");
const K = require("../lib/key.js");
const M = require("../lib/model.js");
const DB = require("../lib/supabase.js");

/* A full match plus stoppage and half time. Below this, nothing is over. */
const MATCH_LEN_MS = 2.25 * 3600 * 1000;
/* Gone from one poll is a blip; gone for this long is gone. */
const ABSENT_MS = 6 * 60 * 1000;
/* Last seen this deep into the game for its score to be treated as final. */
const LATE_MINUTE = 80;
/* Anything still unresolved after this is abandoned, not finished. */
const STALE_MS = 26 * 3600 * 1000;
/* A match in play cannot be one that kicks off later. Seen in the wild: our
   Liga MX fixture for Necaxa v Cruz Azul carried a kick-off five hours in the
   future while the live feed showed that pairing at the 85th minute. Whatever
   the cause - a wrong kick-off on the fixtures feed, or two different games
   sharing both club names - the one thing we know is that we cannot tell which,
   and the row would still have been banked hours later once the listed
   kick-off finally passed. A score nothing downstream will ever correct is not
   worth a guess. Small tolerance so a feed a few minutes ahead of the clock is
   not treated as impossible. */
const NOT_YET_MS = 30 * 60 * 1000;

function selfOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return proto + "://" + host;
}

async function getJSON(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) return { ok: false, why: "http " + r.status };
    return { ok: true, body: await r.json() };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e) };
  } finally { clearTimeout(t); }
}

/* Simulated and virtual competitions, which are not football that happened.
   The same filter the page applies in fetchLive, and it matters more here than
   there: the Simulated Reality League runs simulated versions of exactly the
   card we publish - "Crystal Palace SRL v Man City SRL" against a real Crystal
   Palace v Man City, "Bayern SRL v VFB Stuttgart SRL" against a real Pick of
   the Day - in short repeating cycles all night.
   Today nothing collides only because normName leaves the "SRL" on the club
   names, which is an accident of spelling rather than a safeguard. If that
   suffix ever moved into the league name alone, a simulated scoreline would be
   written into the record as a real result, and for a cup tie nothing
   downstream would ever correct it. Drop them by name. */
const NOT_REAL = /\bsrl\b|esoccer|e-?football|cyber|simulat|virtual|\b8 ?mins?\b|\b10 ?mins?\b|\b12 ?mins?\b/i;
/* The model's numbers for a fixture, carried through live_seen and into the
   result so the match page keeps them after the game is played. A cup tie has
   no league in the model's index, so the build can never re-derive these for
   one - if they are not captured here, that page is a bare scoreline forever.
   Field names match a fixture's exactly, so a page reads either the same way. */
const MODEL_KEYS = ["form_home", "form_away", "lh", "la", "total", "score",
  "home_p", "draw_p", "away_p", "dc1x", "dc12", "dcx2",
  "o15", "o25", "o35", "btts", "fh_o05"];
function modelOf(f) {
  const o = {};
  for (const k of MODEL_KEYS) if (f[k] != null) o[k] = f[k];
  return Object.keys(o).length ? o : null;
}

function isSimulated(m) {
  return NOT_REAL.test(((m && m.league) || "") + " " + ((m && m.home) || "") + " " + ((m && m.away) || ""));
}
/* The live feed spells clubs its own way, so pair its matches to ours on
   normalised names - the same function the build uses to reconcile SportyBet
   against football-data, which is the identical problem. */
function liveIndex(matches) {
  const by = new Map();
  for (const m of (matches || [])) {
    if (!m || !m.home || !m.away) continue;
    if (isSimulated(m)) continue;
    by.set(M.normName(m.home) + "|" + M.normName(m.away), m);
  }
  return by;
}

module.exports = async (req, res) => {
  const started = Date.now();
  applyCache(res, NO_STORE);

  const want = process.env.SWEEP_KEY || "";
  const got = req.headers["x-sweep-key"] || "";
  if (!want || got !== want) return res.status(401).json({ ok: false, error: "unauthorised" });

  const dry = !DB.configured() || /(^|[?&])dry=1/.test(req.url || "");

  try {
    const origin = selfOrigin(req);
    /* Same fallback the page uses. The baked file is an optimisation, not a
       guarantee: prebuild skips it whenever the sources are having a bad
       moment - "only 0 results downloaded, refusing to build" is a real build
       log - and leaves /api/predictions to serve. Reading only the baked file
       meant the sweep stopped dead on exactly the days the feeds were flaky,
       which are the days it is most needed. */
    const [baked, live] = await Promise.all([
      getJSON(origin + "/predictions.json?sweep=" + Date.now()),
      getJSON(origin + "/api/live?sweep=" + Date.now()),
    ]);
    let payload = baked, payloadFrom = "predictions.json";
    if (!payload.ok || !payload.body || !Array.isArray(payload.body.fixtures) || !payload.body.fixtures.length) {
      payload = await getJSON(origin + "/api/predictions?sweep=" + Date.now(), 25000);
      payloadFrom = "api/predictions";
    }
    if (!payload.ok) return res.status(502).json({ ok: false, error: "payload: " + payload.why });
    if (!live.ok) return res.status(502).json({ ok: false, error: "live: " + live.why });

    const fixtures = (payload.body && payload.body.fixtures) || [];
    const liveMatches = (live.body && live.body.matches) || [];
    const realMatches = liveMatches.filter(m => !isSimulated(m));
    const byName = liveIndex(liveMatches);
    const now = Date.now();

    /* Already graded by the build. Those are authoritative; never duplicate
       or contradict them. */
    const served = new Set();
    for (const r of ((payload.body && payload.body.results) || []))
      served.add(K.fixtureKey(r.date, r.home, r.away));

    /* ---------------------------------------------------------- observe */
    const seenRows = [], notYet = [];
    for (const f of fixtures) {
      if (!f || !f.date || !f.home || !f.away || !f.tip) continue;
      const key = K.fixtureKey(f.date, f.home, f.away);
      if (served.has(key)) continue;
      const lm = byName.get(M.normName(f.home) + "|" + M.normName(f.away));
      if (!lm || lm.homeScore == null || lm.awayScore == null) continue;
      /* Paired to something that has not started yet - see NOT_YET_MS. */
      const kickAt = f.kickoff ? Date.parse(f.kickoff) : NaN;
      if (isFinite(kickAt) && kickAt - now > NOT_YET_MS) {
        notYet.push(f.date + " " + f.home + " v " + f.away +
          " [" + (f.league || "?") + "] live at " + (lm.minute == null ? "?" : lm.minute) +
          "' but kicks off in " + Math.round((kickAt - now) / 60000) + "m");
        continue;
      }
      seenRows.push({
        match_key: key,
        match_date: f.date,
        home: f.home, away: f.away,
        home_norm: K.slug(f.home), away_norm: K.slug(f.away),
        league: f.league || "",
        tip: f.tip,
        tip_p: (f.tip_p != null ? f.tip_p : null),
        kickoff: f.kickoff || null,
        hg: Number(lm.homeScore), ag: Number(lm.awayScore),
        minute: (lm.minute != null ? Number(lm.minute) : null),
        status: String(lm.status || ""),
        model: modelOf(f),
        last_seen: new Date(now).toISOString(),
      });
    }

    let observed = 0, observeErr = null;
    if (!dry && seenRows.length) {
      const out = await DB.upsertLiveSeen(seenRows);
      observed = out.n;
      if (!out.ok) observeErr = out.why;
    } else {
      observed = seenRows.length;
    }

    /* --------------------------------------------------------- finalise */
    const stored = dry ? { ok: true, rows: [] } : await DB.listLiveSeen();
    const present = new Set(seenRows.map(r => r.match_key));
    const rows = [], done = [], expired = [];
    const held = { stillOn: 0, tooSoon: 0, notLate: 0, ungradeable: 0, impossible: 0 };
    /* Counts alone say a row is stuck without saying which, or why, and the
       answer lived only in the database. Carry a few examples out with the
       response so a stuck sweep can be read from its own output. */
    const heldWhy = [];
    const note = (s, why) => {
      if (heldWhy.length < 8) heldWhy.push(
        s.match_date + " " + s.home + " v " + s.away +
        " [" + (s.league || "?") + "] " + s.hg + "-" + s.ag +
        " " + (s.status || "?") + " " + (s.minute == null ? "?" : s.minute) + "'" +
        " seen " + Math.round((now - Date.parse(s.last_seen || "")) / 60000) + "m ago" +
        ", ko " + Math.round((now - Date.parse(s.kickoff || "")) / 60000) + "m ago" +
        " -> " + why);
    };

    for (const s of (stored.rows || [])) {
      if (present.has(s.match_key)) { held.stillOn++; continue; }
      const lastSeen = Date.parse(s.last_seen || "");
      const kick = s.kickoff ? Date.parse(s.kickoff) : NaN;
      if (isFinite(lastSeen) && now - lastSeen > STALE_MS) { expired.push(s.match_key); continue; }
      /* Watched before it started, which cannot have happened. The observe
         guard refuses these now, but rows written before that guard existed
         are still sitting here waiting for their listed kick-off to pass, at
         which point they would bank a score for a game we may never have been
         looking at. Drop them rather than let the clock make them plausible. */
      if (isFinite(lastSeen) && isFinite(kick) && lastSeen < kick) {
        held.impossible++;
        note(s, "last seen before its own kick-off - dropped");
        expired.push(s.match_key);
        continue;
      }
      if (!isFinite(lastSeen) || now - lastSeen < ABSENT_MS) { held.stillOn++; note(s, "seen too recently to be gone"); continue; }
      if (!isFinite(kick) || now - kick < MATCH_LEN_MS) { held.tooSoon++; note(s, "not long enough since kick-off"); continue; }

      /* Last seen deep enough into the second half for the score to be the
         one it finished on. */
      const late = (s.minute != null && Number(s.minute) >= LATE_MINUTE) ||
                   /^H2$/i.test(String(s.status || "")) && Number(s.minute || 0) >= LATE_MINUTE;
      if (!late) { held.notLate++; note(s, "last seen before the " + LATE_MINUTE + "th minute"); continue; }

      const hit = G.gradeLabel(s.tip, Number(s.hg), Number(s.ag));
      if (hit === null) { held.ungradeable++; note(s, "tip cannot be settled from a final score"); continue; }

      rows.push({
        match_date: s.match_date,
        home: s.home, away: s.away,
        home_norm: s.home_norm, away_norm: s.away_norm,
        league: s.league || "",
        hg: Number(s.hg), ag: Number(s.ag),
        tip: s.tip, hit: hit,
        tip_p: (s.tip_p != null ? s.tip_p : null),
        model: (s.model && typeof s.model === "object") ? s.model : null,
        source: "sweep",
      });
      done.push(s.match_key);
    }

    let inserted = 0, storeErr = null;
    if (!dry && rows.length) {
      const out = await DB.insertResults(rows);
      inserted = out.inserted;
      if (!out.ok) storeErr = out.why;
      else await DB.deleteLiveSeen(done);
    }
    if (!dry && expired.length) await DB.deleteLiveSeen(expired);

    return res.status(200).json({
      ok: true,
      dry: dry,
      payloadFrom: payloadFrom,
      fixtures: fixtures.length,
      liveMatches: realMatches.length,
      simulatedIgnored: liveMatches.length - realMatches.length,
      observed: observed,
      /* Live pairings refused because the fixture had not kicked off yet. A
         number above zero is a data problem worth looking at, not noise. */
      notYet: notYet.length,
      notYetWhy: notYet.slice(0, 5),
      watching: (stored.rows || []).length,
      finalised: rows.length,
      inserted: inserted,
      expired: expired.length,
      held: held,
      heldWhy: heldWhy,
      observeError: observeErr,
      storeError: storeErr,
      sample: rows.slice(0, 5).map(r =>
        r.match_date + " " + r.home + " " + r.hg + "-" + r.ag + " " + r.away +
        " · " + r.tip + " · " + (r.hit ? "hit" : "miss")),
      ms: Date.now() - started,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err), ms: Date.now() - started });
  }
};
