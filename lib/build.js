"use strict";

/**
 * Downloads results and fixtures, fits the model, returns the payload the
 * site renders.
 *
 * Runs inside a serverless function, so the constraints that shape this file
 * are time and memory rather than CPU. Downloads happen with bounded
 * concurrency: firing sixty requests at once gets throttled and is slower
 * than a steady stream, and it risks exhausting memory holding every
 * response at the same time.
 *
 * Nothing here throws on a single bad source. A league that fails to
 * download is logged and skipped, because losing one league is far better
 * than losing the whole site.
 */

const M = require("./model.js");

const BASE = "https://www.football-data.co.uk";
const UA = "Mozilla/5.0 (compatible; FormlineBot/1.0)";

// Div code -> display name. Seasonal files live at /mmz4281/<season>/<code>.csv
const MAIN = {
  E0: "England Premier League", E1: "England Championship",
  E2: "England League 1", E3: "England League 2",
  EC: "England Conference National",
  SC0: "Scotland Premiership", SC1: "Scotland Championship",
  SC2: "Scotland League 1", SC3: "Scotland League 2",
  D1: "Germany Bundesliga 1", D2: "Germany Bundesliga 2",
  I1: "Italy Serie A", I2: "Italy Serie B",
  SP1: "Spain La Liga 1", SP2: "Spain La Liga 2",
  F1: "France Ligue 1", F2: "France Ligue 2",
  N1: "Netherlands Eredivisie", B1: "Belgium Pro League",
  P1: "Portugal Primeira Liga", T1: "Turkey Super Lig",
  G1: "Greece Super League",
};

// Country -> competition kept from that country's combined file.
// These files hold several competitions, so the value filters within them.
const EXTRA = {
  Argentina: "Liga Profesional", Austria: "Bundesliga",
  Brazil: "Serie A", China: "Super League",
  Denmark: "Superliga", Finland: "Veikkausliiga",
  Ireland: "Premier Division", Japan: "J1 League",
  Mexico: "Liga MX", Norway: "Eliteserien",
  Poland: "Ekstraklasa", Romania: "Superliga",
  Russia: "Premier League", Sweden: "Allsvenskan",
  Switzerland: "Super League", USA: "MLS",
};

const EXTRA_FILE = {
  Argentina: "ARG.csv", Austria: "AUT.csv", Brazil: "BRA.csv",
  China: "CHN.csv", Denmark: "DNK.csv", Finland: "FIN.csv",
  Ireland: "IRL.csv", Japan: "JPN.csv", Mexico: "MEX.csv",
  Norway: "NOR.csv", Poland: "POL.csv", Romania: "ROU.csv",
  Russia: "RUS.csv", Sweden: "SWE.csv", Switzerland: "SWZ.csv",
  USA: "USA.csv",
};

const DEFAULTS = {
  seasons: ["2425", "2526"],
  halfLife: 200,
  shrinkage: 35,
  daysAhead: 5,
  minLeagueMatches: 60,
  minSinceDate: "2023-07-01",
  concurrency: 6,
  fetchTimeoutMs: 20000,
  xgWeight: 0.30,
  recordDays: 21,
};

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!r.ok) return { url, error: `HTTP ${r.status}` };
    const text = await r.text();
    if (text.length < 200) return { url, error: `short response (${text.length}b)` };
    return { url, text };
  } catch (e) {
    return { url, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with a fixed number in flight at once. */
async function pool(items, limit, worker) {
  const out = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return out;
}

function buildSourceList(cfg) {
  const list = [];
  for (const code of Object.keys(cfg.main)) {
    for (const season of cfg.seasons) {
      list.push({ kind: "main", url: `${BASE}/mmz4281/${season}/${code}.csv`,
                  code, league: cfg.main[code] });
    }
  }
  for (const country of Object.keys(cfg.extra)) {
    const file = EXTRA_FILE[country];
    if (!file) continue;
    list.push({ kind: "extra", url: `${BASE}/new/${file}`,
                country, league: cfg.extra[country] });
  }
  return list;
}

function rowsToMatches(text, src, cfg) {
  const rows = M.parseCSV(text);
  if (rows.length < 2) return [];
  const res = M.normalise(rows);
  if (res.error) return [];

  const out = [];
  const cutoff = new Date(cfg.minSinceDate);
  for (const m of res.matches) {
    if (!m.date || m.date < cutoff) continue;
    if (src.kind === "main") {
      // trust the configured name over whatever the file's Div says
      m.league = src.league;
    } else {
      // combined country file: keep only the configured competition
      const want = `${src.country} ${src.league}`;
      if (m.league !== want) continue;
    }
    out.push(m);
  }
  return out;
}

async function buildPayload(options = {}) {
  const cfg = Object.assign({}, DEFAULTS, options, {
    main: options.main || MAIN,
    extra: options.extra || EXTRA,
  });
  const log = [];
  const started = Date.now();

  const sources = buildSourceList(cfg);
  const fetched = await pool(sources, cfg.concurrency,
    (s) => fetchText(s.url, cfg.fetchTimeoutMs).then((r) => ({ ...s, ...r })));

  let matches = [];
  let failed = 0;
  let extraGot = 0;
  for (const f of fetched) {
    if (f.error) {
      failed++;
      log.push(`skip ${f.url.split("/").pop()}: ${f.error}`);
      continue;
    }
    const got = rowsToMatches(f.text, f, cfg);
    if (got.length) {
      matches = matches.concat(got);
      if (f.kind === "extra") extraGot += got.length;
    }
  }
  log.push(`downloaded ${sources.length - failed}/${sources.length} sources`);

  /* The per-country file names are a convention rather than something
     documented, so if none of them yielded anything, fall back to the
     combined results file that the site links explicitly. Trying the
     specific files first is worth it because they carry full history,
     while the combined file holds only recent results. */
  if (extraGot === 0 && Object.keys(cfg.extra).length) {
    log.push("per-country extra files gave nothing, trying combined file");
    const alt = await fetchText(`${BASE}/new/Latest_Results.csv`, cfg.fetchTimeoutMs);
    if (alt.error) {
      log.push(`combined extra file: ${alt.error}`);
    } else {
      const rows = M.parseCSV(alt.text);
      const res = M.normalise(rows);
      if (!res.error) {
        const cutoff = new Date(cfg.minSinceDate);
        let n = 0;
        for (const m of res.matches) {
          if (!m.date || m.date < cutoff) continue;
          // m.league is already "Country Competition" from the Country column
          const want = Object.keys(cfg.extra)
            .map((c) => `${c} ${cfg.extra[c]}`);
          if (!want.includes(m.league)) continue;
          matches.push(m); n++;
        }
        log.push(`combined extra file supplied ${n} results`);
      }
    }
  }

  // de-duplicate: seasons overlap and combined files can repeat rows
  const seen = new Set();
  matches = matches.filter((m) => {
    const k = `${m.date.getTime()}|${m.league}|${m.home}|${m.away}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // drop leagues too thin to rate teams in
  const counts = {};
  for (const m of matches) counts[m.league] = (counts[m.league] || 0) + 1;
  const tiny = new Set(Object.keys(counts).filter((l) => counts[l] < cfg.minLeagueMatches));
  if (tiny.size) {
    matches = matches.filter((m) => !tiny.has(m.league));
    log.push(`dropped thin leagues: ${[...tiny].join(", ")}`);
  }

  if (matches.length < 400) {
    throw new Error(`only ${matches.length} results downloaded, refusing to build`);
  }
  log.push(`${matches.length} results across ${Object.keys(counts).length - tiny.size} leagues`);

  // fixtures: both feeds
  const fxUrls = [`${BASE}/fixtures.csv`, `${BASE}/new_league_fixtures.csv`];
  const fxRes = await pool(fxUrls, 2, (u) => fetchText(u, cfg.fetchTimeoutMs));
  let fixtures = [];
  for (const r of fxRes) {
    if (r.error) { log.push(`fixtures ${r.url.split("/").pop()}: ${r.error}`); continue; }
    const parsed = M.parseFixtures(r.text);
    if (parsed.error) { log.push(`fixtures parse: ${parsed.error}`); continue; }
    fixtures = fixtures.concat(parsed.fixtures);
  }
  log.push(`${fixtures.length} fixtures in feeds`);

  /* First-half share per league, measured rather than assumed. Only the
     main-league files carry half-time goals; the combined country files do
     not, so those fall back to the cross-league average. A league needs a
     decent sample before its own figure is trusted. */
  const fhAgg = {};
  for (const m of matches) {
    if (m.hth == null || m.hta == null) continue;
    const a = fhAgg[m.league] || (fhAgg[m.league] = { ht: 0, ft: 0, n: 0 });
    a.ht += m.hth + m.hta;
    a.ft += m.hg + m.ag;
    a.n++;
  }
  const fhShare = {};
  for (const lg of Object.keys(fhAgg)) {
    const a = fhAgg[lg];
    if (a.n >= 150 && a.ft > 0) {
      const sh = a.ht / a.ft;
      if (sh > 0.35 && sh < 0.55) fhShare[lg] = sh;   // reject nonsense
    }
  }
  log.push(`first-half share measured for ${Object.keys(fhShare).length} leagues`);

  // fit
  const t0 = Date.now();
  const model = M.fitModel(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage, xgWeight: cfg.xgWeight });
  log.push(`fitted in ${Date.now() - t0}ms, k=${model.k.toFixed(1)}, ` +
           `home adv ${model.hadv.toFixed(3)}`);

  // predict everything inside the window
  const idx = model.index;
  const today = new Date();
  const t0d = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const horizon = t0d + cfg.daysAhead * 86400000;

  const out = [];
  let unmatched = 0;
  for (const f of fixtures) {
    const d = Date.UTC(f.date.getUTCFullYear(), f.date.getUTCMonth(), f.date.getUTCDate());
    if (d < t0d || d > horizon) continue;

    let li = (f.league && f.league in idx.lIdx) ? idx.lIdx[f.league] : null;
    if (li == null) {
      for (let l = 0; l < idx.leagues.length; l++) {
        if (M.matchTeam(idx, f.home, l) && M.matchTeam(idx, f.away, l)) { li = l; break; }
      }
    }
    if (li == null) { unmatched++; continue; }
    const h = M.matchTeam(idx, f.home, li);
    const a = M.matchTeam(idx, f.away, li);
    if (!h || !a) { unmatched++; continue; }

    const p = M.predictTotals(model, h, a, idx.leagues[li]);
    if (!p) { unmatched++; continue; }
    const k = M.markets(p, { fhShare: fhShare[idx.leagues[li]], k: model.k });
    const tip = M.bestTip(k);
    const r = (x) => Math.round(x * 10000) / 10000;

    out.push({
      date: f.date.toISOString().slice(0, 10),
      time: f.time || "", league: idx.leagues[li],
      home: h, away: a,
      lh: Math.round(k.lh * 100) / 100, la: Math.round(k.la * 100) / 100,
      total: Math.round(k.total * 100) / 100, score: k.score,
      home_p: r(k.home), draw_p: r(k.draw), away_p: r(k.away),
      dc1x: r(k.dc1x), dc12: r(k.dc12), dcx2: r(k.dcx2),
      o15: r(k.o15), o25: r(k.o25), o35: r(k.o35), btts: r(k.btts),
      btts_o25: r(k.bttsAndO25),
      fh_o05: r(k.fhO05),
      anybody: r(k.anybodyWin),
      draw_o25: r(k.drawOrO25),
      draw_btts: r(k.drawOrBtts),
      /* A draw flag earns its place only if it is rare enough to notice.
         A flat 30% threshold fires on nearly every fixture in a low-scoring
         league; requiring the draw to actually win fires on almost none.
         Live-and-close catches roughly one game in thirty, which is about
         right for something meant to make you look twice. */
      draw_watch: k.draw >= 0.30 && (Math.max(k.home, k.away) - k.draw) <= 0.06,
      tip: tip.label, tip_p: r(tip.p),
    });
  }
  log.push(`predicted ${out.length} fixtures, ${unmatched} unmatched`);

  // honest recent record: fit-on-past, grade-on-recent (never breaks the build)
  let record = null;
  try {
    const tb = Date.now();
    record = M.backtest(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage,
      xgWeight: cfg.xgWeight, days: cfg.recordDays });
    if (record) log.push(`record: ${record.correct}/${record.total} tips ` +
      `(${Math.round(100*record.correct/record.total)}%), brier ${record.brier}, ` +
      `graded in ${Date.now() - tb}ms`);
    else log.push("record: not enough graded matches, skipped");
  } catch (e) {
    log.push(`record backtest failed (non-fatal): ${e.message}`);
  }

  // yesterday-only record: same holdout method, one-day window
  let recordYest = null;
  try {
    recordYest = M.backtest(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage,
      xgWeight: cfg.xgWeight, days: 1 });
    if (recordYest) log.push(`yesterday: ${recordYest.correct}/${recordYest.total} tips`);
  } catch (e) {
    log.push(`yesterday backtest failed (non-fatal): ${e.message}`);
  }

  return {
    generated: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    matches: matches.length,
    leagues: [...new Set(out.map((f) => f.league))].sort(),
    fixtures: out,
    record: record,
    recordYest: recordYest,
    theme: cfg.theme || "midnight",
    buildMs: Date.now() - started,
    log,
  };
}

module.exports = { buildPayload, MAIN, EXTRA, EXTRA_FILE, DEFAULTS };
