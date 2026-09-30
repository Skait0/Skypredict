"use strict";
/**
 * Our corners and shots numbers next to SportyBet's price, written down before
 * kick-off. OFFLINE LOG, read by nothing that publishes.
 *
 *   node scripts/pricelog.js [--out=dir]   appends to <dir>/YYYY-MM.jsonl
 *
 * WHY (owner, 30 Sep 2026). The site went market-led on 1X2 and goals because
 * the bookmaker beat our model everywhere we could test it. Corners and shots
 * could not be tested: nobody sells a history of their prices. So we keep our
 * own - one row per market per snapshot - and in a few weeks grade them
 * against the corners and shots API-Football gives us after the match. Only
 * if our number beats the price there does "our view differs" come back, for
 * that market alone.
 *
 * It changes nothing on the site: it reads predictions.json and the SportyBet
 * feed, and writes only this log, on its own branch (see pricelog.yml).
 *
 * `p` is our chance, from the same numbers and the same arithmetic the site
 * uses (fixture ch/ca/sh/sa, board cornersK/shotsK, lib/corners.js overProb).
 * `mkt` is SportyBet's de-vigged chance when both sides of the line are priced.
 */
const fs = require("fs");
const path = require("path");
const C = require("../lib/corners.js");
const { findEvent } = require("./mkcode.js");

const ORIGIN = process.env.SW_ORIGIN || "https://www.soccerwizard.live";
const HOST = process.env.SW_API || "https://web-production-798c0.up.railway.app";
const hit = process.argv.slice(2).find((a) => a.startsWith("--out="));
const OUT = hit ? hit.slice(6) : path.join(__dirname, "..", "data", "pricelog");

/* Our chance for one SportyBet code, or null. The site's own rules: half
   lines only; shots totals and team shots are overs only (the model runs low
   on the over side, so its unders are too confident - see index.html mProb). */
function ourP(f, code, board) {
  const c = /^CORNERS_(?:([HA])_)?(OV|UN)_([\d.]+)$/.exec(code);
  const s = /^SHOTS_(?:([HA])_)?OV_([\d.]+)$/.exec(code);
  const half = (x) => isFinite(x) && Math.abs(x - Math.round(x)) > 1e-9 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
  if (c) {
    const line = parseFloat(c[3]);
    const lam = c[1] === "H" ? f.ch : c[1] === "A" ? f.ca : (f.ch == null || f.ca == null ? null : f.ch + f.ca);
    if (lam == null || !half(line) || !(board.cornersK > 0)) return null;
    const p = C.overProb(lam, board.cornersK, line);
    return p == null ? null : c[2] === "OV" ? p : 1 - p;
  }
  if (s) {
    const line = parseFloat(s[2]);
    const lam = s[1] === "H" ? f.sh : s[1] === "A" ? f.sa : (f.sh == null || f.sa == null ? null : f.sh + f.sa);
    if (lam == null || !half(line) || !(board.shotsK > 0)) return null;
    return C.overProb(lam, board.shotsK, line);
  }
  return null;
}

/* SportyBet's de-vigged chance for a code whose other side is also priced. */
function marketP(odds, code) {
  const other = code.includes("_OV_") ? code.replace("_OV_", "_UN_") : code.replace("_UN_", "_OV_");
  const a = +odds[code], b = +odds[other];
  return a > 1 && b > 1 ? (1 / a) / (1 / a + 1 / b) : null;
}

function rows(board, events, now) {
  const out = [];
  for (const f of board.fixtures || []) {
    if (f.ch == null && f.sh == null) continue;
    const ko = Date.parse(f.kickoff || "");
    if (!(ko > now)) continue;                      // before kick-off only
    const ev = findEvent(f, events);
    if (!ev || !ev.odds) continue;
    for (const code of Object.keys(ev.odds)) {
      if (!/^(CORNERS|SHOTS)_/.test(code)) continue;
      const p = ourP(f, code, board);
      const odds = +ev.odds[code];
      if (p == null || !(odds > 1)) continue;
      out.push({ at: new Date(now).toISOString(), eventId: ev.eventId, kickoff: f.kickoff,
        league: f.league, home: f.home, away: f.away, market: code,
        p: Math.round(p * 10000) / 10000, odds, mkt: (() => { const m = marketP(ev.odds, code); return m == null ? null : Math.round(m * 10000) / 10000; })() });
    }
  }
  return out;
}

if (require.main === module) (async () => {
  const board = await (await fetch(ORIGIN + "/predictions.json")).json();
  const j = await (await fetch(HOST + "/api/fixtures")).json();
  const events = (j.matches || []).map((m) => ({ eventId: m.eventId, homeTeam: m.homeTeam,
    awayTeam: m.awayTeam, startTime: m.startTime, league: m.league, odds: m.odds || null }));
  const got = rows(board, events, Date.now());
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, new Date().toISOString().slice(0, 7) + ".jsonl");
  fs.appendFileSync(file, got.map((r) => JSON.stringify(r)).join("\n") + (got.length ? "\n" : ""));
  const games = new Set(got.map((r) => r.eventId)).size;
  console.log(`${got.length} prices on ${games} games -> ${file}`);
})().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { ourP, marketP, rows };
