"use strict";
/**
 * Fill corners and total shots onto results we already hold (25 Sep 2026).
 *
 * WHY: no results feed here carries corner or shot counts, so a corners or
 * shots leg could never be settled - the page marked it void, and a void leg
 * is a refunded leg, so a slip whose corners leg LOST read as won. API-Football
 * has both in its fixture statistics.
 *
 * HOW, per date with unfilled rows: one /fixtures?date= call (lib/oracle.js
 * resultsFor, which already pairs API-Football's names to ours with findMatch),
 * then /fixtures?ids= twenty at a time for the statistics.
 *
 * TWO GUARDS against writing another game's numbers onto a result:
 *   - the pairing must agree on the SCORE. Ours is the 90-minute score; so is
 *     theirs (oracle.ninety). A disagreement is skipped, never "fixed".
 *   - extra time is skipped. AET and PEN statistics count 120 minutes, and
 *     corners and shots markets settle on normal time.
 *
 * NO_STATS (-1) marks a row API-Football could not give numbers for - a
 * league without statistics coverage, extra time, a fixture it does not list
 * after two days. Written so the row is never asked for again. Every grader
 * treats a negative count as "not known", exactly like null.
 *
 * BUDGET: the plan is paid and staying paid (owner, 25 Sep 2026 - 7,500 a
 * day), so this runs every hour, looks back two days and spends at most
 * MAX_REQUESTS a run - a few dozen a day. QUOTA_FLOOR stays as the safety net:
 * if the plan ever lapsed to free (100 a day, shared with the build's score
 * oracle) it stops outright below 30 left, above the build's own floor.
 */
const NO_STATS = -1;
const MAX_REQUESTS = 10;
const QUOTA_FLOOR = 30;
const LOOKBACK_DAYS = 2;
const GIVE_UP_DAYS = 2;   // a row still unmatched this long after is marked NO_STATS

/* Every hour, in the first ten minutes - the sweep runs every ten. */
function dueNow(now) {
  return new Date(now).getUTCMinutes() < 10;
}

async function fillStats(deps, now) {
  const { db, oracle, log } = deps;
  /* The sweep runs under a 30-second function limit and has done its real
     work before this; never start a request that could run past it. */
  const deadline = deps.deadline || Infinity;
  const T = { timeoutMs: 5000 };
  const say = (m) => { if (log) log.push(m); };
  const out = { asked: 0, filled: 0, marked: 0, skipped: 0, quota: null };
  if (!oracle.configured()) { say("stats: no API-Football key"); return out; }
  const since = new Date(now - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
  const got = await db.resultsWithoutStats(since);
  if (!got.ok) { say("stats: read failed " + got.why); return out; }
  if (got.noColumns) { say("stats: results has no hc/ac columns yet - migration not run"); return out; }
  const byDate = {};
  for (const r of got.rows) (byDate[r.match_date] = byDate[r.match_date] || []).push(r);

  const budgetLeft = () => out.asked < MAX_REQUESTS && !(out.quota != null && out.quota < QUOTA_FLOOR) &&
    Date.now() < deadline;
  for (const date of Object.keys(byDate).sort()) {
    if (!budgetLeft()) break;
    const rows = byDate[date];
    const day = await oracle.resultsFor(date, T);
    out.asked++;
    if (day.quota != null) out.quota = day.quota;
    if (!day.ok) { say("stats: " + date + " " + day.why); continue; }
    const ageDays = (now - Date.parse(date + "T00:00:00Z")) / 864e5;

    const want = [];   // [ourRow, theirId]
    for (const r of rows) {
      const m = oracle.findMatch(day.rows, r.home, r.away);
      if (!m || m.id == null) {
        if (ageDays > GIVE_UP_DAYS) { await mark(db, r, out); }
        else out.skipped++;
        continue;
      }
      if (m.status !== "FT") { await mark(db, r, out); continue; }                 // extra time
      if (Number(m.hg) !== Number(r.hg) || Number(m.ag) !== Number(r.ag)) {         // wrong pairing
        say("stats: score disagrees, skipped " + date + " " + r.home + " v " + r.away);
        out.skipped++; continue;
      }
      /* The half-time score rides the same pairing, at no extra request. */
      if (m.hth != null && m.hta != null && db.patchHalf && !out.noHalfColumn) {
        const w = await db.patchHalf(r, m.hth, m.hta);
        if (w.ok) out.halves = (out.halves || 0) + 1;
        else if (w.noColumn) { out.noHalfColumn = true; say("stats: results has no hth/hta columns yet - sql/results_ht.sql not run"); }
      }
      want.push([r, m.id]);
    }
    for (let i = 0; i < want.length; i += 20) {
      if (!budgetLeft()) break;
      const chunk = want.slice(i, i + 20);
      const st = await oracle.statsFor(chunk.map((w) => w[1]), T);
      out.asked++;
      if (st.quota != null) out.quota = st.quota;
      if (!st.ok) { say("stats: ids failed " + st.why); continue; }
      for (const [r, id] of chunk) {
        /* The goal order rides the same answer (see oracle.seqOfFixture). Only
           worth keeping where the score cannot settle "3 in a row" alone. A
           table without the column says so once and is left alone. */
        const seq = st.seqs && st.seqs[id];
        if (seq && needsSeq(r) && db.patchSeq && !out.noSeqColumn) {
          const w = await db.patchSeq(r, seq);
          if (w.ok) out.seqs = (out.seqs || 0) + 1;
          else if (w.noColumn) { out.noSeqColumn = true; say("stats: results has no seq column yet - migration not run"); }
        }
        const s = st.stats[id];
        if (s) {
          const w = await db.patchStats(r, s);
          if (w.ok) out.filled++; else say("stats: write failed " + w.why);
        } else if (Object.prototype.hasOwnProperty.call(st.stats, id)) {
          await mark(db, r, out);        // they answered: no statistics for it
        } else out.skipped++;
      }
    }
  }
  say(`stats: ${out.filled} filled, ${out.marked} marked none, ${out.skipped} left, ${out.asked} requests` +
      (out.quota == null ? "" : `, ${out.quota} left today`));
  return out;
}

/* A run of 3 is decided by the score unless a side has 3 or more AND the
   other scored too (a 3-1, a 4-2). Those are the only rows worth an order. */
function needsSeq(r) {
  const hg = Number(r.hg), ag = Number(r.ag);
  return (hg >= 3 && ag > 0) || (ag >= 3 && hg > 0);
}
async function mark(db, r, out) {
  const w = await db.patchStats(r, { hc: NO_STATS, ac: NO_STATS, hsh: NO_STATS, ash: NO_STATS });
  if (w.ok) out.marked++;
}

module.exports = { fillStats, dueNow, needsSeq, NO_STATS, MAX_REQUESTS, QUOTA_FLOOR };
