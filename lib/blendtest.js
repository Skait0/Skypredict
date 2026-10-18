"use strict";
/* THE MODEL TEST (owner, 18 Oct 2026: "before we moved our model to be 10 percent ours and
   90 percent the bookies, i feel like we had better predictions ... do the analysis").

   The stored record cannot answer it: the build publishes the model's own tip, and the site
   mixes in SportyBet's price only in the browser (index.html blendFixture), so no bookie
   price was ever kept for the board. scripts/pricelog.js now writes one "main" row per board
   game before kick-off: the model's 1X2 and Over 1.5 and SportyBet's prices. This file
   replays each game three ways and grades the three headline tips on the final score:
     model - the model alone (what the record has always graded)
     old   - the mix before 30 Sep: 30% book, rising to 75% over a 20-point gap
     now   - the mix since 30 Sep: 90% book
   The same arithmetic as the page: _devig3 (proportional), one weight for the three-way set
   by its largest gap, the same weight on Over 1.5, then bestTip (lib/model.js, which
   index.html bestTipFrom mirrors). Pure: no network. */
const M = require("./model.js");
const G = require("./grade.js");

const MODES = ["model", "old", "now"];
const weight = (mode, gap) => mode === "now" ? 0.90 : mode === "old" ? 0.30 + 0.45 * Math.min(1, gap / 0.20) : 0;

function kOf(row, mode) {
  const m = row.m || {}, o = row.odds || {};
  let h = m.home, d = m.draw, a = m.away, o15 = m.o15;
  if (![h, d, a].every(Number.isFinite)) return null;
  let B = mode === "model" ? 0 : 0.30;
  if (mode !== "model" && o["1"] > 1 && o.X > 1 && o["2"] > 1) {
    const x = 1 / o["1"], y = 1 / o.X, z = 1 / o["2"], s = x + y + z, mk = [x / s, y / s, z / s];
    B = weight(mode, Math.max(Math.abs(h - mk[0]), Math.abs(d - mk[1]), Math.abs(a - mk[2])));
    h = h * (1 - B) + mk[0] * B; d = d * (1 - B) + mk[1] * B; a = a * (1 - B) + mk[2] * B;
    const t = h + d + a; h /= t; d /= t; a /= t;
  }
  if (mode !== "model" && Number.isFinite(o15) && o["OVER_1.5"] > 1 && o["UNDER_1.5"] > 1) {
    const p = 1 / o["OVER_1.5"], q = 1 / o["UNDER_1.5"];
    o15 = o15 * (1 - B) + (p / (p + q)) * B;
  }
  return { home: h, draw: d, away: a, dc1x: h + d, dcx2: d + a, o15: Number.isFinite(o15) ? o15 : 0 };
}

const key = (date, home, away) => date + "|" + String(home).toLowerCase() + "|" + String(away).toLowerCase();

/* The last snapshot of each game before its kick-off. */
function lastSnapshots(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!r || r.kind !== "main" || !r.date) continue;
    if (Date.parse(r.at) >= Date.parse(r.kickoff)) continue;
    const k = key(r.date, r.home, r.away), was = by.get(k);
    if (!was || r.at > was.at) by.set(k, r);
  }
  return [...by.values()];
}

/* Replays and grades. `results`: rows with date/match_date, home, away, hg, ag. */
function compare(rows, results) {
  const score = new Map();
  for (const r of results || []) if (Number.isFinite(r.hg) && Number.isFinite(r.ag)) score.set(key(r.match_date || r.date, r.home, r.away), r);
  const out = { games: 0, from: null, to: null, modes: {}, differ: { old: 0, now: 0 } };
  for (const md of MODES) out.modes[md] = { n: 0, hit: 0, p: 0, brier: 0, byTip: {} };
  for (const s of lastSnapshots(rows)) {
    const res = score.get(key(s.date, s.home, s.away)); if (!res) continue;
    const tips = {};
    for (const md of MODES) {
      const k = kOf(s, md); const t = k && M.bestTip(k); if (!t) { tips[md] = null; continue; }
      const hit = G.gradeLabel(t.label, res.hg, res.ag, {}); if (hit == null) { tips[md] = null; continue; }
      tips[md] = { label: t.label, p: t.p, hit };
    }
    if (!MODES.every((md) => tips[md])) continue;
    out.games++; out.from = !out.from || s.date < out.from ? s.date : out.from; out.to = !out.to || s.date > out.to ? s.date : out.to;
    for (const md of MODES) {
      const t = tips[md], a = out.modes[md], b = a.byTip[t.label] || (a.byTip[t.label] = { n: 0, hit: 0 });
      a.n++; a.hit += t.hit ? 1 : 0; a.p += t.p; a.brier += (t.p - (t.hit ? 1 : 0)) ** 2; b.n++; b.hit += t.hit ? 1 : 0;
    }
    if (tips.old.label !== tips.model.label) out.differ.old++;
    if (tips.now.label !== tips.model.label) out.differ.now++;
  }
  for (const md of MODES) { const a = out.modes[md]; a.rate = a.n ? a.hit / a.n : null; a.claimed = a.n ? a.p / a.n : null; a.brier = a.n ? a.brier / a.n : null; delete a.p; }
  return out;
}

/* The published record (the model's own tips) by day from `since`. */
function recordByDay(rows, since) {
  const by = {};
  for (const r of rows || []) {
    const d = r.match_date; if (!d || d < since || typeof r.hit !== "boolean") continue;
    const x = by[d] || (by[d] = { date: d, n: 0, hit: 0 }); x.n++; if (r.hit) x.hit++;
  }
  return Object.values(by).sort((a, b) => (a.date < b.date ? -1 : 1));
}

module.exports = { MODES, kOf, lastSnapshots, compare, recordByDay };
