"use strict";
/* PICK FOR ME, for the Telegram bot (owner, 20 Oct 2026: "now do the telegram"). The site's
 * rule (index.html pickForMe), on the server's own pieces: no options, the surest market in
 * each game still to come, surest first with a per-reader seeded shuffle among near-equals,
 * until the payout, at most 40 games ("40 is fine"). When the surest legs cannot reach the
 * payout inside 40, every leg has to pay at least payout^(1/40).
 * A leg needs SportyBet's price (C.pair on the live feed): the bot books on SportyBet first and
 * converts, so a game SportyBet does not list cannot go on. Each chance is the board's number
 * (D.blend, what readers see on the site), the same number the site's builders rank on.
 * Markets people know only: no handicaps, corners, shots or GG+ (live on 20 Oct the surest
 * picks were all Asian handicaps). */
const C = require("./convert.js");
const S = require("./social.js");
const D = require("./doctor.js");

const MAX_LEGS = 40, MIN_ODD = 1.15, NEAR = 0.03, MAX_SHARE = 0.4;
const PAYS = [2, 5, 10, 20, 50, 100, 150, 200], FREE_UP_TO = 10;
/* No Unders of any kind (owner, 21 Oct 2026: "under games are insanely risky"), as on the site. */
const MARKETS = ["1", "2", "1X", "X2", "12", "OVER_0.5", "OVER_1.5", "OVER_2.5",
  "GG", "NG", "HOME_OVER_0.5", "AWAY_OVER_0.5", "HOME_OVER_1.5", "AWAY_OVER_1.5", "FH_OVER_0.5"];

const family = require("./bigodds.js").family;
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/* Pure. `day` is "today", "tomorrow" or "all"; `seed` makes one reader's slip theirs.
 * Returns { legs, odds, short } with legs in the shape lib/convert.js books. */
function pick(pay, now, feed, target, day, seed, maxLegs) {
  const max = Math.min(MAX_LEGS, maxLegs || MAX_LEGS), min = Math.max(MIN_ODD, Math.pow(target, 1 / max));
  const today = S.dayOf(now), tomorrow = S.dayOf(now + 86400000);
  const pool = [];
  for (const f of pay.fixtures || []) {
    if (f.thin || !(Date.parse(f.kickoff || "") > now + 10 * 60000)) continue;
    if (day === "today" && f.date !== today) continue;
    if (day === "tomorrow" && f.date !== tomorrow) continue;
    const base = { home: f.home, away: f.away, kickoff: Date.parse(f.kickoff) };
    const e = C.pair(feed, Object.assign({ prediction: "1" }, base));
    if (!e || !e.odds) continue;                                   // no SportyBet price, no leg
    const homeFav = f.home_p > f.away_p;
    const opts = [];
    for (const c of MARKETS) {
      if ((c === "1" && !homeFav) || (c === "2" && homeFav)) continue;   // a win only on the favourite
      const o = Number(e.odds[c]), m = D.probOf(f, c);
      if (!(o >= min) || m == null) continue;
      const p = D.blend(m, o);
      if (!(p >= 0.5)) continue;
      opts.push(Object.assign({}, base, { prediction: c, p, odds: o }));
    }
    if (opts.length) { opts.sort((a, b) => b.p - a.p); opts._k = opts[0].p + (h32(seed + "|" + f.home + "|" + f.away) - 0.5) * NEAR; pool.push(opts); }
  }
  pool.sort((a, b) => b._k - a._k);
  /* No market family on more than 40% of the slip (owner, 14 Oct 2026, on Daily odds: "all the
     games always seem to double chance"; live on 20 Oct, x5 here was 10 of 12 Under 4.5): each
     game gives its surest leg in a family that still has room, else its next surest. */
  const legs = [], fam = {}; let odds = 1;
  for (const opts of pool) {
    if (odds >= target || legs.length >= max) break;
    const cap = Math.max(2, Math.ceil(MAX_SHARE * (legs.length + 1)));
    const l = opts.find((o) => (fam[family(o.prediction)] || 0) < cap);
    if (!l) continue;
    fam[family(l.prediction)] = (fam[family(l.prediction)] || 0) + 1;
    legs.push(l); odds *= l.odds;
  }
  return { legs, odds, short: odds < target };
}

module.exports = { pick, PAYS, FREE_UP_TO, MAX_LEGS, MARKETS };
