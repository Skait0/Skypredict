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
const LIVE_SCORES_URL = "https://web-production-798c0.up.railway.app/api/livescores";

/* -------- helpers for cross-source team-name matching -------- */
function normalizeTeam(name) {
  return (name || "").toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(fc|afc|cf|sc|ac|bsc|cfc|afc)\b/g, "")
    .replace(/\b(u19|u21|u23|ii|iii|b team|reserves?)\b/g, "")
    .trim();
}
function teamKey(name) {
  return normalizeTeam(name).replace(/\s+/g, "");
}

/* -------- kick-off times -------------------------------------------------
   The two feeds disagree about what a clock time means. SportyBet gives a UTC
   instant. football-data publishes UK local time - so through British Summer
   Time its 19:45 is 18:45 UTC, and stamping a "Z" on it put every one of its
   fixtures an hour late on the site: a game that kicked off at 8 showed as 9.
   The offset is read from the zone database rather than assumed, so it is
   right on both sides of the March and October switches, and right for the
   years when the UK next changes its mind about them. */
function zoneOffsetMs(utcMs, zone) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  /* en-GB renders midnight as hour 24; Date.UTC would roll that into the next
     day and put the offset out by 24 hours. */
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
                           (+p.hour) % 24, +p.minute, +p.second);
  return asIfUTC - utcMs;
}
function wallTimeToUtcMs(y, m, d, hh, mm, zone) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  /* Offset at the guess, then re-read at the corrected instant: one pass is
     enough to land on the right side of a clock change. */
  let t = guess - zoneOffsetMs(guess, zone);
  return guess - zoneOffsetMs(t, zone);
}

/* SportyBet and football-data name a number of competitions differently. The
   results, the record and the results view all speak football-data's names, so
   fixtures adopt those too - otherwise La Liga appears twice in the league
   filter, once per feed, and a league pinned from one list never matches the
   other. Only pairs that are unambiguously the same competition belong here;
   anything genuinely distinct (a cup, a different tier) keeps its own name. */
const LEAGUE_ALIASES = {
  "Spain LaLiga": "Spain La Liga 1",
  "Spain LALIGA HYPERMOTION": "Spain La Liga 2",
  "England League One": "England League 1",
  "England League Two": "England League 2",
  "Germany Bundesliga": "Germany Bundesliga 1",
  "Germany 2. Bundesliga": "Germany Bundesliga 2",
  "Portugal Liga Portugal": "Portugal Primeira Liga",
  "Turkiye Super Lig": "Turkey Super Lig",
  "Brazil Brasileiro Serie A": "Brazil Serie A",
  "China Chinese Super League": "China Super League",
  "Argentina Primera LPF": "Argentina Liga Profesional",
};
function canonLeague(name) {
  const s = (name || "").trim();
  return LEAGUE_ALIASES[s] || s;
}

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
  daysAhead: 21,
  minLeagueMatches: 60,
  minSinceDate: "2023-07-01",
  concurrency: 6,
  fetchTimeoutMs: 20000,
  xgWeight: 0.30,
  recordDays: 21,
  resultDays: 14,
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

/* ---------------------------------------------------------------- cup ties
   A cup tie between divisions cannot be read off the ratings alone. Attack
   and defence are centred WITHIN each league when the model is fitted, so a
   mid-table Championship side and a mid-table Premier League side both sit
   at roughly zero and the model would call them equals.

   Nothing in the data fixes that. There are no cup results in the training
   feeds and not one club appears in two leagues, so there is no observation
   anywhere that ties one division's scale to another's. This number is
   therefore a stated assumption, not a measurement, and it is the only one
   of its kind in the model.

   0.20 per division, applied to both sides of the tie, so one step is a
   0.40 swing in log goal-rate - a shade above home advantage, which is about
   the right order for a division. Three steps (Premier League against League
   Two) makes the bigger club a heavy favourite without making the tie a
   foregone conclusion, which is what cup football actually looks like.

   Because it is an assumption, predictions built on it are marked and their
   confidence is pulled hard toward even - see CROSS_TIER_SHRINK. They appear
   on the board; they do not get to be anybody's banker. */
const TIER_EDGE = 0.20;
const CROSS_TIER_SHRINK = 0.55;
const TIER_LADDER = [
  "England Premier League", "England Championship",
  "England League 1", "England League 2", "England Conference National",
];
function tierOf(league) {
  const i = TIER_LADDER.indexOf(league);
  return i < 0 ? null : i;
}
/* Positive when home is the higher division, negative when away is. */
function tierGap(homeLeague, awayLeague) {
  const h = tierOf(homeLeague), a = tierOf(awayLeague);
  if (h == null || a == null) return 0;
  return a - h;
}
/* The league a club actually plays in, regardless of what competition this
   particular fixture belongs to. */
function leagueOfTeam(idx, name) {
  const t = M.matchTeam(idx, name, null);
  if (!t) return null;
  const ti = idx.tIdx[t];
  return ti === undefined ? null : idx.teamLeague[ti];
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

  /* SportyBet fixtures: pulls today's games earlier than football-data and
     lets the model predict any match whose two teams it already knows. The
     feed names each event's competition, so the fixture carries its real
     league (cup ties included) rather than being guessed from the teams. */
  try {
    const sbUrl = cfg.sportyFixturesUrl ||
      "https://web-production-798c0.up.railway.app/api/fixtures";
    /* This one feed supplies the large majority of the card, so losing it is
       the difference between a full day and a near-empty one. It sits behind a
       cold-start-prone host, where the first request after an idle spell can
       time out and the next succeeds - worth one retry before giving up. */
    let sbRes = await fetchText(sbUrl, cfg.fetchTimeoutMs);
    if (sbRes.error) {
      log.push(`SportyBet fixtures attempt 1: ${sbRes.error} - retrying`);
      await new Promise((r) => setTimeout(r, 1200));
      sbRes = await fetchText(sbUrl, cfg.fetchTimeoutMs);
    }
    if (!sbRes.error) {
      const j = JSON.parse(sbRes.text);
      let added = 0;
      for (const m of (j.matches || [])) {
        if (!m.homeTeam || !m.awayTeam || !m.startTime) continue;
        fixtures.push({
          date: new Date(m.startTime),
          time: new Date(m.startTime).toISOString().slice(11, 16),
          league: (m.league || "").trim(),
          home: m.homeTeam, away: m.awayTeam,
          /* Already an instant, not a wall-clock reading. */
          tz: "UTC",
        });
        added++;
      }
      log.push(`+${added} SportyBet fixtures`);
    } else {
      log.push(`SportyBet fixtures: ${sbRes.error}`);
    }
  } catch (e) { log.push(`SportyBet fixtures failed (non-fatal): ${e.message}`); }

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

  /* Last-5 form per team (most recent first), from the played matches we hold.
     Keyed by the same canonical team name the index uses, so it lines up with
     each fixture's resolved home/away. */
  const formMap = {};
  {
    const byTeam = {};
    for (const m of matches) {
      if (m.hg == null || m.ag == null) continue;
      (byTeam[m.home] = byTeam[m.home] || []).push(
        { d: m.date.getTime(), r: m.hg > m.ag ? "W" : (m.hg < m.ag ? "L" : "D") });
      (byTeam[m.away] = byTeam[m.away] || []).push(
        { d: m.date.getTime(), r: m.ag > m.hg ? "W" : (m.ag < m.hg ? "L" : "D") });
    }
    for (const t of Object.keys(byTeam)) {
      byTeam[t].sort((a, b) => b.d - a.d);
      formMap[t] = byTeam[t].slice(0, 5).map((x) => x.r);
    }
  }

  const out = [];
  let unmatched = 0;
  const dropped = [];
  const seenKey = {};
  for (const f of fixtures) {
    const d = Date.UTC(f.date.getUTCFullYear(), f.date.getUTCMonth(), f.date.getUTCDate());
    if (d < t0d || d > horizon) continue;

    let li = (f.league && f.league in idx.lIdx) ? idx.lIdx[f.league] : null;
    if (li == null) {
      for (let l = 0; l < idx.leagues.length; l++) {
        if (M.matchTeam(idx, f.home, l) && M.matchTeam(idx, f.away, l)) { li = l; break; }
      }
    }
    /* Cup ties. The loop above needs both clubs inside one league, which a
       cup tie across divisions never satisfies - and that is why the EFL Cup
       never appeared here at all. Resolve each side in whatever league it
       actually plays in, and carry the gap between those divisions as an
       edge. See TIER_EDGE for what that number is and is not. */
    let crossTier = 0;
    if (li == null) {
      const hl = leagueOfTeam(idx, f.home);
      const al = leagueOfTeam(idx, f.away);
      if (hl != null && al != null) {
        li = hl;
        crossTier = tierGap(idx.leagues[hl], idx.leagues[al]);
      }
    }
    if (li == null) { unmatched++; dropped.push(`${f.home} v ${f.away} (no league)`); continue; }
    /* When the two came from different divisions, each was resolved in its
       own - so look them up the same way rather than forcing both into one. */
    const h = crossTier !== 0 ? M.matchTeam(idx, f.home, leagueOfTeam(idx, f.home))
                              : M.matchTeam(idx, f.home, li);
    const a = crossTier !== 0 ? M.matchTeam(idx, f.away, leagueOfTeam(idx, f.away))
                              : M.matchTeam(idx, f.away, li);
    if (!h || !a) { unmatched++; dropped.push(`${f.home} v ${f.away} (team)`); continue; }

    const p = M.predictTotals(model, h, a, idx.leagues[li], crossTier * TIER_EDGE);
    if (!p) { unmatched++; dropped.push(`${f.home} v ${f.away} (no prediction)`); continue; }
    const _pair = [h, a].sort().join("|");
    const dedup = f.date.toISOString().slice(0, 10) + "|" + _pair;
    if (seenKey[dedup]) continue;
    seenKey[dedup] = 1;
    const k = M.markets(p, { fhShare: fhShare[idx.leagues[li]], k: model.k });
    const tip = M.bestTip(k);
    // uncertainty band: thin recent data widens confidence toward 50/50
    const sup = M.support(model, h, a);
    let shrink = sup >= 6 ? 1 : Math.max(0.55, sup / 6);
    /* A cross-division tie rests on TIER_EDGE, which is an assumption rather
       than anything measured, so its confidence is pulled hard toward even.
       The game still appears on the board; it cannot pass itself off as a
       banker, top the pick of the day, or reach a slip built out of the
       safest numbers on the card. */
    if (crossTier !== 0) shrink = Math.min(shrink, CROSS_TIER_SHRINK);
    const tipPadj = 0.5 + (tip.p - 0.5) * shrink;
    const r = (x) => Math.round(x * 10000) / 10000;

    /* Full kickoff instant when the feed carried a time. The site uses this to
       drop games that have already started; without it, it can only compare
       dates and a mid-afternoon fixture lingers all day.
       f.tz says how to read the clock: SportyBet's is already UTC, everything
       from football-data is UK local. The emitted time is normalised to UTC so
       the whole payload speaks one language. */
    let kickoff = null, timeOut = f.time || "";
    if (f.time && /^\d{1,2}:\d{2}/.test(f.time)) {
      const [hh, mm] = f.time.split(":").map(Number);
      const y = f.date.getUTCFullYear(), mo = f.date.getUTCMonth() + 1,
            dd = f.date.getUTCDate();
      const ms = f.tz === "UTC"
        ? Date.UTC(y, mo - 1, dd, hh, mm)
        : wallTimeToUtcMs(y, mo, dd, hh, mm, "Europe/London");
      if (!isNaN(ms)) {
        kickoff = new Date(ms).toISOString();
        timeOut = kickoff.slice(11, 16);
      }
    }

    /* The competition this game is actually in. Both feeds name it now -
       SportyBet carries the tournament, football-data's fixtures carry a
       normalised "Country League" - so we report what the feed says instead of
       inferring. Inferring was wrong in both directions: it labelled ordinary
       league games "England Cup", and it showed a cup tie between two Premier
       League sides as the Premier League. The teams' usual league is not
       evidence of which competition they are playing in today. */
    const known = canonLeague(f.league);
    let label = known;
    if (!label) {
      /* Neither feed knows. Say so with a country-scoped generic rather than
         asserting a league - and mark it, so a real name can replace it later. */
      const country = (idx.leagues[li] || "").split(" ")[0];
      label = country ? `${country} Cup` : "Cup";
    }

    out.push({
      date: f.date.toISOString().slice(0, 10),
      time: timeOut, kickoff: kickoff,
      league: label,
      home: h, away: a,
      /* Divisions apart, and therefore leaning on an assumption rather than a
         measurement. Emitted so the site can say so rather than presenting
         the number with the same face as every other. */
      cross_tier: crossTier !== 0 ? Math.abs(crossTier) : undefined,
      form_home: formMap[h] || [], form_away: formMap[a] || [],
      lh: Math.round(k.lh * 100) / 100, la: Math.round(k.la * 100) / 100,
      total: Math.round(k.total * 100) / 100, score: k.score,
      home_p: r(k.home), draw_p: r(k.draw), away_p: r(k.away),
      dc1x: r(k.dc1x), dc12: r(k.dc12), dcx2: r(k.dcx2),
      o15: r(k.o15), o25: r(k.o25), o35: r(k.o35), btts: r(k.btts),
      /* Each side's own goals, so a slip can back one team to score. */
      h_o05: r(k.hO05), h_o15: r(k.hO15),
      a_o05: r(k.aO05), a_o15: r(k.aO15),
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
      tip: tip.label, tip_p: r(tipPadj), thin: sup < 6,
      /* Store normalized team keys so we can later enrich with actual FT
         scores from live scores API or football-data. */
      _homeKey: teamKey(h), _awayKey: teamKey(a),
      /* Label is a guess, not something a feed told us - the FT pass may
         replace it with the real competition. Stripped before output. */
      _guessedLeague: !known,
    });
  }
  log.push(`predicted ${out.length} fixtures, ${unmatched} unmatched`);
  if (dropped.length) log.push(`dropped: ${dropped.slice(0, 25).join("; ")}`);

  // recent results: last few days of played games with the model's graded tip
  const results = [];
  const rfloor = t0d - (cfg.resultDays || 4) * 86400000;
  for (const m of matches) {
    const d = Date.UTC(m.date.getUTCFullYear(), m.date.getUTCMonth(), m.date.getUTCDate());
    if (d < rfloor || d >= t0d) continue;
    if (idx.lIdx[m.league] === undefined) continue;
    const pr = M.predictTotals(model, m.home, m.away, m.league);
    if (!pr) continue;
    const kk = M.markets(pr, { fhShare: fhShare[m.league], k: model.k });
    const tp = M.bestTip(kk);
    const won = M.gradeTip(tp.label, m);
    if (won === null) continue;
    results.push({ date: m.date.toISOString().slice(0, 10), league: m.league,
      home: m.home, away: m.away, hg: m.hg, ag: m.ag, tip: tp.label, hit: won });
  }
  results.sort((a, b) => (a.date < b.date ? 1 : -1));
  log.push(`${results.length} recent results graded`);

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

  /* -------- Enrich fixtures & results with actual FT scores --------
     Two sources:
     1. Live scores API (has in-progress + recent FT, no eventId)
     2. football-data Latest_Results.csv (has FT for all leagues, including cups)
     Match by (date, normalized home, normalized away) to get actual scores. */
  async function enrichWithFTScores() {
    const ftMap = new Map(); // key: "YYYY-MM-DD|homeKey|awayKey" -> {hg, ag, league}

    // Source 1: Live scores API
    try {
      const ls = await fetchText(LIVE_SCORES_URL, cfg.fetchTimeoutMs);
      if (!ls.error) {
        const data = JSON.parse(ls.text);
        for (const m of (data.matches || [])) {
          if (m.status === "FT" || m.status === "Finished") {
            const hk = teamKey(m.home);
            const ak = teamKey(m.away);
            const key = `${m.date || "?"}|${hk}|${ak}`;
            ftMap.set(key, { hg: m.homeScore, ag: m.awayScore, league: m.league });
          }
        }
      }
    } catch (e) { log.push(`live scores fetch: ${e.message}`); }

    // Source 2: football-data Latest_Results.csv (has cups + all leagues)
    try {
      const fd = await fetchText(`${BASE}/new/Latest_Results.csv`, cfg.fetchTimeoutMs);
      if (!fd.error) {
        const rows = M.parseCSV(fd.text);
        const res = M.normalise(rows);
        if (!res.error) {
          for (const m of res.matches) {
            const hk = teamKey(m.home);
            const ak = teamKey(m.away);
            const key = `${m.date.toISOString().slice(0, 10)}|${hk}|${ak}`;
            if (!ftMap.has(key)) {
              ftMap.set(key, { hg: m.hg, ag: m.ag, league: m.league });
            }
          }
        }
      }
    } catch (e) { log.push(`football-data results fetch: ${e.message}`); }

    log.push(`FT score map built: ${ftMap.size} matches`);

    // Enrich fixtures with actual scores (for those already played)
    let enrichedFixtures = 0;
    for (const f of out) {
      const key = `${f.date}|${f._homeKey}|${f._awayKey}`;
      const ft = ftMap.get(key);
      if (ft) {
        f.hg = ft.hg; f.ag = ft.ag;
        /* Only a guessed label gives way to the results feed. Testing the text
           for "Cup" would clobber real competitions - "Russia Russian Cup" and
           "Germany DFB Pokal" are the actual names, not placeholders. */
        if (f._guessedLeague && ft.league) { f.league = ft.league; f._guessedLeague = false; }
        enrichedFixtures++;
      }
    }
    log.push(`fixtures enriched with FT scores: ${enrichedFixtures}`);

    // Re-grade results using actual scores (much more accurate than model-on-past)
    const enrichedResults = [];
    for (const m of matches) {
      const d = Date.UTC(m.date.getUTCFullYear(), m.date.getUTCMonth(), m.date.getUTCDate());
      if (d < rfloor || d >= t0d) continue;
      const hk = teamKey(m.home);
      const ak = teamKey(m.away);
      const key = `${m.date.toISOString().slice(0, 10)}|${hk}|${ak}`;
      const ft = ftMap.get(key);
      if (!ft) continue; // no actual score yet
      if (idx.lIdx[m.league] === undefined) continue;
      const pr = M.predictTotals(model, m.home, m.away, m.league);
      if (!pr) continue;
      const kk = M.markets(pr, { fhShare: fhShare[m.league], k: model.k });
      const tp = M.bestTip(kk);
      // Grade against actual FT score from ftMap (not m.hg/m.ag which might be from CSV)
      const won = M.gradeTip(tp.label, { ...m, hg: ft.hg, ag: ft.ag });
      if (won === null) continue;
      enrichedResults.push({ date: m.date.toISOString().slice(0, 10), league: m.league,
        home: m.home, away: m.away, hg: ft.hg, ag: ft.ag, tip: tp.label, hit: won });
    }
    enrichedResults.sort((a, b) => (a.date < b.date ? 1 : -1));
    log.push(`results enriched with actual FT: ${enrichedResults.length} graded`);

    // Replace results with enriched version (more accurate)
    if (enrichedResults.length > results.length) {
      results.length = 0;
      results.push(...enrichedResults);
    }

    // Strip internal keys from fixtures before returning
    for (const f of out) {
      delete f._homeKey;
      delete f._awayKey;
      delete f._guessedLeague;
    }
  }

  await enrichWithFTScores();

  return {
    generated: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    matches: matches.length,
    leagues: [...new Set(out.map((f) => f.league))].sort(),
    fixtures: out,
    results: results,
    unmatched: dropped,
    record: record,
    recordYest: recordYest,
    theme: cfg.theme || "midnight",
    buildMs: Date.now() - started,
    log,
  };
}

module.exports = { buildPayload, MAIN, EXTRA, EXTRA_FILE, DEFAULTS,
  zoneOffsetMs, wallTimeToUtcMs,
  LEAGUE_ALIASES, canonLeague };
