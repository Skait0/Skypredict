"use strict";
/**
 * Final scores straight from API-Football (25 Sep 2026).
 *
 * WHY: until now a result reached the record by WATCHING - the sweep saw a
 * match in SportyBet's live feed, noticed when it vanished, and banked the last
 * score it had seen (api/record-sweep.js). The code itself calls that a guess,
 * and lib/oracle.js measured it wrong on three of five matches. API-Football
 * states the final score outright, with the 90-minute score kept apart from
 * extra time (oracle.ninety). The plan is paid and staying paid, so this is now
 * the first path, and watching is only the net under it.
 *
 * WHAT: every published fixture (it carries a tip) that kicked off more than
 * DONE_AFTER_MS ago, inside the last LOOKBACK_DAYS, and is not already graded
 * by the build. One /fixtures?date= per UTC date (f.date IS the kick-off's UTC
 * date, which is what their date filter means), paired with oracle.findMatch -
 * the same pairing the build's score confirmation trusts.
 *   - no row yet          -> inserted, source "oracle"
 *   - a watched guess     -> corrected or confirmed in place, source "oracle"
 *   - already "oracle"    -> left alone
 * A tip that cannot be settled from a final score (a first-half line) is left
 * for the build, which has half-time scores; nothing is guessed.
 */
const DONE_AFTER_MS = 110 * 60 * 1000;   // 90 + half-time + stoppages, with room
const LOOKBACK_DAYS = 3;
const MAX_DATES = 3;
const QUOTA_FLOOR = 30;

async function finalScores(deps, now) {
  const { fixtures, served, oracle, db, grade, key, slug, modelOf, log, deadline } = deps;
  const say = (m) => { if (log) log.push(m); };
  const out = { dates: 0, inserted: 0, corrected: 0, confirmed: 0, unmatched: 0, ungradeable: 0, quota: null, sample: [] };
  if (!oracle.configured()) { say("results: no API-Football key"); return out; }

  const since = new Date(now - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
  const due = {};
  for (const f of fixtures || []) {
    if (!f || !f.date || !f.home || !f.away || !f.tip || !f.kickoff) continue;
    const ko = Date.parse(f.kickoff);
    if (!isFinite(ko) || now - ko < DONE_AFTER_MS || f.date < since) continue;
    if (served.has(key(f.date, f.home, f.away))) continue;
    (due[f.date] = due[f.date] || []).push(f);
  }
  const dates = Object.keys(due).sort().reverse().slice(0, MAX_DATES);   // newest first
  if (!dates.length) return out;

  /* What is stored already, so a watched guess is corrected rather than
     duplicated, and an oracle row is not paid for twice. */
  const stored = await db.recentResults(since);
  const have = new Map();
  for (const r of (stored.ok ? stored.rows : [])) have.set(key(r.match_date, r.home, r.away), r);

  const inserts = [];
  for (const date of dates) {
    if (Date.now() > (deadline || Infinity)) break;
    if (out.quota != null && out.quota < QUOTA_FLOOR) { say("results: quota floor, stopping"); break; }
    const pending = due[date].filter((f) => {
      const h = have.get(key(f.date, f.home, f.away));
      return !h || h.source === "sweep";
    });
    if (!pending.length) continue;
    const day = await oracle.resultsFor(date, { timeoutMs: 5000 });
    out.dates++;
    if (day.quota != null) out.quota = day.quota;
    if (!day.ok) { say("results: " + date + " " + day.why); continue; }
    for (const f of pending) {
      const m = oracle.findMatch(day.rows, f.home, f.away);
      if (!m) { out.unmatched++; continue; }
      const hg = Number(m.hg), ag = Number(m.ag);
      const hit = grade(f.tip, hg, ag);
      if (hit === null) { out.ungradeable++; continue; }
      const prior = have.get(key(f.date, f.home, f.away));
      if (prior) {
        const same = Number(prior.hg) === hg && Number(prior.ag) === ag;
        const w = await db.verifyResult({ match_date: f.date, home: prior.home, away: prior.away, hg, ag, hit });
        if (w.ok) { if (same) out.confirmed++; else { out.corrected++; say(`results: corrected ${f.home} v ${f.away} ${prior.hg}-${prior.ag} -> ${hg}-${ag}`); } }
        continue;
      }
      inserts.push({
        match_date: f.date, home: f.home, away: f.away,
        home_norm: slug(f.home), away_norm: slug(f.away),
        league: f.league || "", hg, ag, tip: f.tip, hit,
        tip_p: f.tip_p != null ? f.tip_p : null,
        model: modelOf(f), source: "oracle",
      });
    }
  }
  if (inserts.length) {
    const w = await db.insertResults(inserts);
    if (w.ok) out.inserted = w.inserted; else say("results: insert failed " + w.why);
    out.sample = inserts.slice(0, 5).map((r) => `${r.match_date} ${r.home} ${r.hg}-${r.ag} ${r.away}`);
  }
  say(`results: ${out.inserted} new, ${out.corrected} corrected, ${out.confirmed} confirmed, ` +
      `${out.unmatched} unmatched, ${out.dates} date(s)` + (out.quota == null ? "" : `, ${out.quota} left today`));
  return out;
}

module.exports = { finalScores, DONE_AFTER_MS, LOOKBACK_DAYS, MAX_DATES, QUOTA_FLOOR };
