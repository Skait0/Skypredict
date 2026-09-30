"use strict";
/**
 * The model's scorecard: walk-forward log loss on matches it has not seen.
 * OFFLINE, reads only data/results on disk.
 *
 *   node scripts/scorecard.js --exp=base|blend|draw|decay|reg|xg [--folds=8] [--days=21]
 *
 * Every experiment is a list of variants; the first is always what the build
 * ships today. For each fold the model is fitted on everything before the
 * cutoff and scored on the next `days` days: 1X2, Over 2.5 and BTTS, overall
 * and by tier (1 top flight .. 3, "-" for cups and unlisted). Lower is better.
 * A change ships only if the overall number drops and no tier with a real
 * sample gets clearly worse - see the owner's rule, 30 Sep 2026.
 *
 * blend: mixes in the market's de-vigged 1X2 and O/U 2.5 (football-data's
 * average across books, closing odds for the extra leagues) at weight w. It is
 * scored only on matches that carry odds, and says how many that was.
 */
const B = require("../lib/build.js");
const M = require("../lib/model.js");

function arg(n, d) {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : d;
}
const EXP = arg("exp", "base");
const FOLDS = Number(arg("folds", 8)), DAYS = Number(arg("days", 21));
const D = B.DEFAULTS;
const BASE_FIT = { halfLife: D.halfLife, reg: D.shrinkage, xgWeight: D.xgWeight, leagueHadvReg: D.leagueHadvReg };
const DRAW = 0.0703;   // lib/model.js markets() default

/* Each variant: {name, fit (overrides), draw ("league" = per-league boost
   with pseudo-count K), blend (market weight; "gap" = the site's rule)}. */
const EXPS = {
  base: [{ name: "shipped" }],
  blend: [{ name: "model only" }, { name: "w 0.3", blend: 0.3 }, { name: "w 0.5", blend: 0.5 },
    { name: "w 0.7", blend: 0.7 }, { name: "w 0.85", blend: 0.85 }, { name: "w 0.95", blend: 0.95 }, { name: "market only", blend: 1 },
    { name: "site gap rule", blend: "gap" }, { name: "gap 0.50-0.85", blend: [0.5, 0.85] },
    { name: "gap 0.60-0.90", blend: [0.6, 0.9] }, { name: "gap 0.70-0.95", blend: [0.7, 0.95] }],
  draw: [{ name: "global 0.0703" }, { name: "per league K=150", draw: 150 },
    { name: "per league K=400", draw: 400 }, { name: "per league K=1000", draw: 1000 }],
  decay: [{ name: "half-life 200" }, { name: "150", fit: { halfLife: 150 } },
    { name: "300", fit: { halfLife: 300 } }, { name: "450", fit: { halfLife: 450 } }],
  tips: [{ name: "reg 35", fit: { reg: 35 } }, { name: "reg 20", fit: { reg: 20 } }, { name: "reg 28", fit: { reg: 28 } }, { name: "35, no league hadv", fit: { reg: 35, leagueHadvReg: 0 } }],
  reg: [{ name: "reg 35" }, { name: "20", fit: { reg: 20 } }, { name: "50", fit: { reg: 50 } },
    { name: "80", fit: { reg: 80 } }],
  combo: [{ name: "reg 35 hl 200" }, { name: "reg 20 hl 200", fit: { reg: 20 } },
    { name: "reg 12 hl 200", fit: { reg: 12 } }, { name: "reg 20 hl 300", fit: { reg: 20, halfLife: 300 } },
    { name: "reg 12 hl 300", fit: { reg: 12, halfLife: 300 } }, { name: "reg 20 hl 250", fit: { reg: 20, halfLife: 250 } }],
  promo: [{ name: "as shipped" }, { name: "moved-team edge", moved: true }],
  xg: [{ name: "xg 0.30" }, { name: "0.15", fit: { xgWeight: 0.15 } }, { name: "0.45", fit: { xgWeight: 0.45 } },
    { name: "0.60", fit: { xgWeight: 0.60 } }],
};
const VARIANTS = EXPS[EXP];
if (!VARIANTS) throw new Error("unknown --exp, one of: " + Object.keys(EXPS).join(", "));

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
console.log(`${EXP}: ${matches.length} matches through ${maxD.toISOString().slice(0, 10)}, ${FOLDS} folds of ${DAYS} days`);

const ll = (p) => -Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)));
const tierOf = (l) => { const t = B.tierOfLeague(l); return t ? String(t) : "-"; };

/* Per-league draw boost: the league's draws against what the shared boost
   predicts over its last year of training matches, pulled to 1 by K
   pseudo-matches. */
function leagueDraws(model, train, cut, K) {
  const since = cut.getTime() - 365 * 86400000, agg = {};
  for (const m of train) {
    if (m.date.getTime() < since) continue;
    const p = M.predictTotals(model, m.home, m.away, m.league);
    if (!p) continue;
    const a = agg[m.league] || (agg[m.league] = { obs: 0, exp: 0, n: 0 });
    a.obs += m.hg === m.ag ? 1 : 0; a.exp += M.markets(p, { k: model.k }).draw; a.n++;
  }
  const out = {};
  for (const l of Object.keys(agg)) {
    const a = agg[l], pbar = a.exp / a.n;
    const r = (a.obs + K * pbar) / (a.exp + K * pbar);
    out[l] = Math.max(-0.2, (1 + DRAW) * r - 1);
  }
  return out;
}

function devig(a, b, c) {
  const x = [1 / a, 1 / b, c ? 1 / c : 0], s = x[0] + x[1] + x[2];
  return x.map((v) => v / s);
}

const res = VARIANTS.map(() => ({ all: {}, tier: {} }));
function add(bucket, key, n, x12, o25, btts, tip) {
  const b = bucket[key] || (bucket[key] = { n: 0, x12: 0, o25: 0, btts: 0, tn: 0, hit: 0, tb: 0 });
  b.n += n; b.x12 += x12; b.o25 += o25; b.btts += btts;
  if (tip) { b.tn++; b.hit += tip.won ? 1 : 0; b.tb += Math.pow((tip.won ? 1 : 0) - tip.p, 2); }
}

for (let f = FOLDS; f >= 1; f--) {
  const cut = new Date(maxD.getTime() - f * DAYS * 86400000);
  const end = new Date(cut.getTime() + DAYS * 86400000);
  const train = matches.filter((m) => m.date < cut);
  let test = matches.filter((m) => m.date >= cut && m.date < end);
  if (EXP === "blend") test = test.filter((m) => m.oh && m.od && m.oa && m.oo && m.ou);
  const index = M.buildIndex(train);
  const fits = {};
  VARIANTS.forEach((v, vi) => {
    const fk = JSON.stringify(v.fit || {});
    const model = fits[fk] || (fits[fk] = M.fitModel(train,
      Object.assign({ index, reference: cut }, BASE_FIT, v.fit || {})));
    const dl = v.draw ? leagueDraws(model, train, cut, v.draw) : null;
    for (const m of test) {
      /* A club whose latest division in training is not this fixture's -
         promoted or relegated - is still rated against its old division, so
         carry the gap the way a cup tie does. Same country only: across a
         border the "move" is two clubs sharing a name. */
      let e = 0;
      if (v.moved) {
        const lh = index.leagues[index.teamLeague[index.tIdx[m.home]]], la = index.leagues[index.teamLeague[index.tIdx[m.away]]];
        const cc = (l) => M.countryOf(l);
        if (lh && la && (lh !== m.league || la !== m.league) && cc(lh) === cc(m.league) && cc(la) === cc(m.league)) {
          e = B.tierEdge(lh, la) || 0;
        }
      }
      const p = M.predictTotals(model, m.home, m.away, m.league, e);
      if (!p) continue;
      const boost = dl && dl[m.league] != null ? dl[m.league] : DRAW;
      const k = M.markets(p, { k: model.k, drawBoost: boost });
      let ph = k.home, pd = k.draw, pa = k.away, po = k.o25;
      if (v.blend != null) {
        const [mh, md, ma] = devig(m.oh, m.od, m.oa), [mo] = devig(m.oo, m.ou);
        const [lo, hi] = v.blend === "gap" ? [0.30, 0.75] : Array.isArray(v.blend) ? v.blend : [v.blend, v.blend];
        const w = (g) => lo + (hi - lo) * Math.min(1, Math.abs(g) / 0.20);
        ph = ph + w(mh - ph) * (mh - ph); pd = pd + w(md - pd) * (md - pd); pa = pa + w(ma - pa) * (ma - pa);
        const s = ph + pd + pa; ph /= s; pd /= s; pa /= s;
        po = po + w(mo - po) * (mo - po);
      }
      const x12 = ll(m.hg > m.ag ? ph : m.hg === m.ag ? pd : pa);
      const o25 = ll(m.hg + m.ag > 2.5 ? po : 1 - po);
      const bt = ll(m.hg > 0 && m.ag > 0 ? k.btts : 1 - k.btts);
      /* The headline tip, graded the way the published record grades it. */
      const bt0 = M.bestTip(k), won = bt0 ? M.gradeTip(bt0.label, m) : null;
      const tip = won === null ? null : { won, p: bt0.p };
      add(res[vi].all, "all", 1, x12, o25, bt, tip);
      add(res[vi].tier, tierOf(m.league), 1, x12, o25, bt, tip);
    }
  });
  process.stdout.write(`fold ${f} ${cut.toISOString().slice(0, 10)} (${test.length})  `);
}
console.log("\n");

const fmt = (b) => b ? `${(b.x12 / b.n).toFixed(4)} ${(b.o25 / b.n).toFixed(4)} ${(b.btts / b.n).toFixed(4)}` : "-";
const tiers = Object.keys(res[0].tier).sort();
console.log("variant".padEnd(18) + "n".padStart(6) + "   1X2    O2.5   BTTS   tips hit brier | " + tiers.map((t) => `tier ${t} 1X2 (n)`).join(" | "));
VARIANTS.forEach((v, vi) => {
  const a = res[vi].all.all;
  console.log(v.name.padEnd(18) + String(a.n).padStart(6) + "  " + fmt(a) +
    `  ${(100 * a.hit / a.tn).toFixed(1)}% ${(a.tb / a.tn).toFixed(4)}` + " | " +
    tiers.map((t) => { const b = res[vi].tier[t]; return b ? `${(b.x12 / b.n).toFixed(4)} (${b.n})` : "-"; }).join(" | "));
});
