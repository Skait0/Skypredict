"use strict";
/* BIG ODDS OF THE DAY (owner's call, 24 Sep: "drop bigger odds on days where
 * there are good fixtures"). Only on a good day - six or more of today's games
 * that our model rates 75%+ and that are still to kick off. The bankers are
 * stacked strongest first, priced with SportyBet's own odds, until the slip
 * pays x10 (never past ten legs, and not at all under x5), then booked for
 * real on SportyBet and converted to the other three books with the bot's own
 * converter (lib/convert.js). Returns the X and Telegram texts, or null.
 */
const C = require("./convert.js");
const S = require("./social.js");
const D = require("./doctor.js");

const SITE = () => process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const TIP_CODE = { "1X, home or draw": "1X", "X2, draw or away": "X2", "Over 1.5": "OVER_1.5", "Home win": "1", "Away win": "2" };
/* MORE GAMES, LESS ODDS, AND NEVER A WEAK LEG (owner, 14 Oct 2026: "it picks
   using the few games more odds slip style. let it pick using the balanced or
   more game less odds style. no picks less than 75 percent. also, all the games
   always seem to double chance").
   Both complaints came from one design. It took only each game's HEADLINE tip
   (1X, X2, Over 1.5, a win), priced 1.25+, ranked by probability x odds and
   stacked to x15 in eight legs: the value style, and since Over 1.5 at 70%+
   prices 1.10-1.20, nearly everything that cleared 1.25 was a double chance.
   Measured on 14 Oct's board, the legs at 80%+ ran across Over 1.5 (23 games),
   home to score (19), Under 4.5 (12), away to score (11), 1X (11), 12 (9)...
   priced 1.04-1.20 - so a safe slip is MANY legs, not a few big ones.
   Now: every market on the game, at least 75% on the BOARD's number (D.blend -
   90% the book's de-vigged price, the figure readers see), priced 1.10+ (a
   1.04 leg adds risk and no payout), one leg per game, safest game first, no
   market family on more than 40% of the slip.
   TWELVE LEGS, NOT TWENTY (owner, 14 Oct 2026: "20 legs is too much ... 12 is
   fine"). Every leg pays the book's ~5% margin, so for the same payout MORE
   legs land LESS often: twenty legs at 85%/x1.11 made x8.2 at ~4%, twelve at
   ~80%/x1.18 make ~x7 at ~7%. So each game offers its leg nearest 80% (never
   under 75%) rather than its safest, in at most twelve legs.
   TOWARDS x10 (owner, 14 Oct 2026: "make sure it stacks towards x10"). Twelve
   legs reach x10 at about x1.21 a leg - roughly 78-79% on the board, inside
   the 75% floor - so when the twelve fall short, legs are UPGRADED to a richer
   market on the same game, cheapest first: the swap that gives up the least
   chance per unit of payout gained (log p lost / log odds gained), never under
   75%, the 40% rule still holding. A day that cannot reach x10 even then posts
   the most it can, if that is x4 or more. */
const MIN_P = 0.75, MIN_ODD = 1.10, MIN_GOOD = 8, TARGET = 10, FLOOR = 4, MAX_LEGS = 12, MAX_SHARE = 0.4;
const AIM_P = 0.80;
const MARKETS = ["1", "2", "1X", "X2", "12", "OVER_1.5", "OVER_2.5", "UNDER_2.5", "UNDER_3.5", "UNDER_4.5",
  "GG", "NG", "HOME_OVER_0.5", "AWAY_OVER_0.5", "HOME_OVER_1.5", "AWAY_OVER_1.5", "FH_OVER_0.5"];
/* The families the 40% rule counts: "all double chance" is 1X, X2 and 12
   together, not three different markets. */
function family(c) {
  if (c === "1X" || c === "X2" || c === "12") return "dc";
  if (c === "1" || c === "2") return "win";
  if (/^(HOME|AWAY)_OVER_/.test(c)) return "team";
  if (/^OVER_/.test(c)) return "over";
  if (/^UNDER_/.test(c)) return "under";
  if (c === "GG" || c === "NG") return "btts";
  return c;
}

/* Pure: which legs, at what price. `feed` is SportyBet's events with odds. */
function pick(pay, now, feed) {
  const today = S.dayOf(now);
  const games = [];
  for (const f of pay.fixtures || []) {
    if (f.date !== today || f.thin || !(Date.parse(f.kickoff || "") > now + 60 * 60000)) continue;
    const base = { home: f.home, away: f.away, kickoff: Date.parse(f.kickoff) };
    const e = C.pair(feed, Object.assign({ prediction: "1" }, base));
    if (!e || !e.odds) continue;                                       // no SportyBet price, no leg
    const opts = [];
    for (const c of MARKETS) {
      const o = Number(e.odds[c]), m = D.probOf(f, c);
      if (!(o >= MIN_ODD) || m == null) continue;
      const p = D.blend(m, o);
      if (p >= MIN_P) opts.push(Object.assign({}, base, { prediction: c, p, odds: o }));
    }
    /* Nearest 80% first, ties to the safer leg - so the 75-82% band beats an
       85% leg at 1.10, and the 40% rule below can still fall back to the next. */
    if (opts.length) games.push(opts.sort((a, b) =>
      (Math.abs(a.p - AIM_P) - Math.abs(b.p - AIM_P)) || (b.p - a.p)));
  }
  if (games.length < MIN_GOOD) return null;
  games.sort((a, b) => b[0].p - a[0].p);           // the safest of those games first
  const legs = [], from = [], fam = {};
  let odds = 1;
  for (const opts of games) {
    if (legs.length >= MAX_LEGS || odds >= TARGET) break;
    const cap = Math.max(2, Math.ceil(MAX_SHARE * (legs.length + 1)));
    const l = opts.find((o) => (fam[family(o.prediction)] || 0) < cap);
    if (!l) continue;
    fam[family(l.prediction)] = (fam[family(l.prediction)] || 0) + 1;
    legs.push(l); from.push(opts); odds *= l.odds;
  }
  /* Short of x10: upgrade, cheapest swap first, until it gets there or no
     swap is left. Every option in `from` already cleared 75% and 1.10. */
  const cap = Math.max(2, Math.ceil(MAX_SHARE * legs.length));
  while (odds < TARGET) {
    let best = null;
    legs.forEach((l, i) => {
      for (const o of from[i]) {
        if (!(o.odds > l.odds)) continue;
        const f = family(o.prediction);
        if (f !== family(l.prediction) && (fam[f] || 0) >= cap) continue;
        const cost = (Math.log(l.p) - Math.log(o.p)) / (Math.log(o.odds) - Math.log(l.odds));
        if (!best || cost < best.cost) best = { i, o, cost };
      }
    });
    if (!best) break;
    const old = legs[best.i];
    fam[family(old.prediction)]--;
    fam[family(best.o.prediction)] = (fam[family(best.o.prediction)] || 0) + 1;
    odds = odds / old.odds * best.o.odds;
    legs[best.i] = best.o;
  }
  return odds >= FLOOR ? { legs, odds } : null;
}

function texts(p, codes) {
  const order = [["sporty", "SportyBet"], ["bet9ja", "Bet9ja"], ["betking", "BetKing"], ["betpawa", "betPawa"], ["onexbet", "1xBet"], ["betway", "Betway"]];
  const lines = order.filter(([k]) => codes[k]).map(([k, n]) =>
    n + ": " + codes[k].code + (codes[k].n < p.legs.length ? " (" + codes[k].n + " of " + p.legs.length + ")" : ""));
  const head = "🔥 Big odds of the day 🧙\n\n" + p.legs.length + " strong legs stacked · pays ×" + p.odds.toFixed(2) + " on SportyBet\n\n";
  const x = head + lines.join("\n") + "\n\nEvery leg 75%+ on our board 😤\n👉 soccerwizard.live\n18+";
  const tg = head + lines.join("\n") + "\n\n" +
    p.legs.map((l) => "• " + l.home + " v " + l.away + " · " + D.label(l) +
      " · " + Math.round(l.p * 100) + "%").join("\n") +
    "\n\nFollow it live: send the code to https://t.me/Soccerwizardhqbot 🔔\nBuild your own: " + SITE() +
    "\n\n18+ · Stake only what you can afford to lose";
  return { x, tg };
}

/* Books it. Returns {x, tg} or null. Never throws. */
async function mint(pay, now) {
  try {
    const body = await (await fetch(SITE() + "/api/fixtures", { signal: AbortSignal.timeout(8000) })).json();
    const picked = pick(pay, now, C.events("sporty", body));
    if (!picked) return null;
    const sporty = await C.convert(picked.legs, "sporty", now);
    if (!sporty.code) return null;
    /* WHAT WAS BOOKED, NOT WHAT WAS PICKED (code review, 24 Sep): if SportyBet
       drops a leg, the post, the payout and the other three books all follow
       the code people will actually load. */
    const legs = sporty.booked.map((b) => b.leg);
    const p = { legs, odds: legs.reduce((t, l) => t * l.odds, 1) };
    if (p.odds < FLOOR) return null;
    const codes = { sporty: { code: sporty.code, n: legs.length } };
    /* In parallel: one after another, three slow books could run past the
       engine's time limit and lose the day's post. */
    const others = await Promise.all(["bet9ja", "betking", "betpawa", "onexbet", "betway"].map((to) =>
      C.convert(legs, to, now).then((r) => [to, r]).catch(() => [to, {}])));
    for (const [to, r] of others) if (r.code) codes[to] = { code: r.code, n: r.booked.length };
    return Object.assign(texts(p, codes), { row: { day: S.dayOf(now), odds: Number(p.odds.toFixed(2)), codes,
      legs: legs.map((l) => ({ home: l.home, away: l.away, code: l.prediction, p: l.p, odds: l.odds })) } });
  } catch (e) { return null; }
}

/* The day's stored slip, back into post texts - so a channel whose post failed
   is retried with the SAME codes, never a second minting. */
function fromRow(row) {
  if (!row || !row.codes || !Array.isArray(row.legs)) return null;
  const p = { odds: Number(row.odds), legs: row.legs.map((l) => ({ home: l.home, away: l.away, prediction: l.code, p: l.p })) };
  return texts(p, row.codes);
}

module.exports = { pick, texts, mint, fromRow, TIP_CODE, family };
