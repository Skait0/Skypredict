"use strict";

/**
 * football-data.co.uk as a score source.
 *
 * The build already downloads every one of these CSVs to fit the model - four
 * hundred results minimum, or it refuses to build - and then grades tips
 * against two entirely different feeds. The results were sitting in memory the
 * whole time.
 *
 * So this costs nothing: no request, no key, no quota, no third party to be
 * blocked by. It reads the matches the build already holds.
 *
 * Where it sits and why:
 *
 *   1. SoccerVista   fastest and widest, reaches a week back. It stays first
 *                    because it IS the best source - it took grading from 132
 *                    rows to 308. Demoting it to feel more independent would
 *                    trade real coverage for a feeling.
 *   2. football-data THIS. Free, already in hand, and the only one of the three
 *                    that carries a HALF-TIME score.
 *   3. oracle        API-Football. Ours, but 100 requests a day, so it goes
 *                    last: no reason to spend an allowance on a date something
 *                    free can already answer.
 *
 * The half-time score is the part that earns its place rather than just backing
 * up. `gradeLabel` refuses first-half markets outright when it has no half-time
 * score - correctly, since a full-time score cannot settle one - so every
 * `FH_OVER_0.5` tip has come back ungraded, and the builder offers that market.
 * These rows carry `hth`/`hta`, so those tips can finally be settled.
 *
 * League only. Cup ties are not in these files and stay with the other two.
 */

/* The build's own match shape: { date: Date, league, home, away, hg, ag,
   hth, hta, ... }. Rows come out in the shape lib/oracle.js produces, so
   findMatch and every caller work unchanged. */
function fromMatches(matches) {
  const byDate = new Map();
  for (const m of (matches || [])) {
    if (!m || m.hg == null || m.ag == null || !m.date) continue;
    const d = m.date instanceof Date ? m.date : new Date(m.date);
    if (isNaN(d.getTime())) continue;
    const k = d.toISOString().slice(0, 10);
    let list = byDate.get(k);
    if (!list) { list = []; byDate.set(k, list); }
    list.push({
      home: String(m.home || ""),
      away: String(m.away || ""),
      hg: Number(m.hg), ag: Number(m.ag),
      /* Only when both halves are there. A half-time score of "0" that is
         really "missing" would settle a first-half tip as a loss, and an
         ungraded tip is far better than a wrongly graded one. */
      hth: (typeof m.hth === "number" ? m.hth : null),
      hta: (typeof m.hta === "number" ? m.hta : null),
      league: String(m.league || ""),
      status: "FT",
    });
  }

  return {
    /* Nothing downloaded means nothing to say. The build refuses to run on
       fewer than 400 results, so in practice this is only false in tests. */
    configured() { return byDate.size > 0; },
    async resultsFor(date) {
      const rows = byDate.get(String(date)) || [];
      return rows.length
        ? { ok: true, rows }
        : { ok: true, rows: [] };
    },
    /* For logging: how much this source is holding. */
    size() { return byDate.size; },
  };
}

/* A source that knows nothing, for callers with no matches to hand. Keeps
   `configured()` false so firstScoreSource skips it rather than special-casing
   a null. */
const EMPTY = fromMatches([]);

module.exports = { fromMatches, EMPTY };
