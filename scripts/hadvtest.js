"use strict";
/**
 * Walk-forward test for the per-league home edge (lib/model.js leagueHadvReg).
 * OFFLINE, reads only what is on disk.
 *
 *   node scripts/hadvtest.js [--regs=0,30,100,300] [--folds=4] [--days=21]
 *
 * For each fold: fit on everything before the cutoff, predict the next `days`
 * days, score 1X2 and Over 2.5 by log loss. Lower is better. `0` is the
 * shipped model (one shared home edge). Leagues with the largest change are
 * listed so a win overall cannot hide a loss where it matters.
 */
const B = require("../lib/build.js");
const M = require("../lib/model.js");

function arg(n, d) {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : d;
}
const REGS = String(arg("regs", "0,30,100,300")).split(",").map(Number);
const FOLDS = Number(arg("folds", 4)), DAYS = Number(arg("days", 21));
const D = B.DEFAULTS;

let matches = B.loadFloorMatches().concat(B.loadLiveMatches());
const seen = new Set();
matches = matches.filter((m) => {
  const k = `${m.date.getTime()}|${m.league}|${m.home}|${m.away}`;
  if (seen.has(k)) return false; seen.add(k); return true;
});
const counts = {};
for (const m of matches) counts[m.league] = (counts[m.league] || 0) + 1;
matches = matches.filter((m) => counts[m.league] >= D.minLeagueMatches);
const maxD = matches.reduce((a, m) => (m.date > a ? m.date : a), matches[0].date);
console.log(`${matches.length} matches, ${Object.keys(counts).length} leagues, through ${maxD.toISOString().slice(0, 10)}`);

const ll = (p) => -Math.log(Math.max(1e-6, p));
const res = {};   // reg -> {n, x12, o25, byLeague:{l:{n,x12}}}
for (const reg of REGS) res[reg] = { n: 0, x12: 0, o25: 0, byLeague: {} };

for (let f = FOLDS; f >= 1; f--) {
  const cut = new Date(maxD.getTime() - f * DAYS * 86400000);
  const end = new Date(cut.getTime() + DAYS * 86400000);
  const train = matches.filter((m) => m.date < cut);
  const test = matches.filter((m) => m.date >= cut && m.date < end);
  const index = M.buildIndex(train);
  for (const reg of REGS) {
    const t0 = Date.now();
    const model = M.fitModel(train, { halfLife: D.halfLife, reg: D.shrinkage, xgWeight: D.xgWeight,
      index, reference: cut, leagueHadvReg: reg });
    const r = res[reg];
    for (const m of test) {
      const p = M.predictTotals(model, m.home, m.away, m.league);
      if (!p) continue;
      const k = M.markets(p, { k: model.k });
      const o = m.hg > m.ag ? k.home : m.hg === m.ag ? k.draw : k.away;
      const x = ll(o), y = ll(m.hg + m.ag > 2.5 ? p.o25 : 1 - p.o25);
      r.n++; r.x12 += x; r.o25 += y;
      const b = r.byLeague[m.league] || (r.byLeague[m.league] = { n: 0, x12: 0 });
      b.n++; b.x12 += x;
    }
    console.log(`fold ${f} (${cut.toISOString().slice(0, 10)}) reg ${reg}: ${test.length} test, ${Date.now() - t0}ms`);
  }
}

const base = res[REGS[0]];
for (const reg of REGS) {
  const r = res[reg];
  console.log(`reg ${String(reg).padStart(5)}: n=${r.n} 1X2 ${(r.x12 / r.n).toFixed(4)}  O2.5 ${(r.o25 / r.n).toFixed(4)}`);
}
for (const reg of REGS.slice(1)) {
  const d = Object.keys(base.byLeague).filter((l) => base.byLeague[l].n >= 25).map((l) => {
    const a = base.byLeague[l], b = res[reg].byLeague[l];
    return [l, a.n, (b.x12 - a.x12) / a.n];
  }).sort((x, y) => x[2] - y[2]);
  console.log(`\nreg ${reg} vs ${REGS[0]}, 1X2 log loss change per match (negative = better):`);
  for (const [l, n, dd] of d.slice(0, 6).concat(d.slice(-4))) console.log(`  ${dd.toFixed(4).padStart(8)}  n=${String(n).padStart(4)}  ${l}`);
}
