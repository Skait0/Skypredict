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

const SITE = () => process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const TIP_CODE = { "1X, home or draw": "1X", "X2, draw or away": "X2", "Over 1.5": "OVER_1.5", "Home win": "1", "Away win": "2" };
/* BIG, NOT JUST SAFE. Stacking the 75%+ bankers paid x6.86 over ten legs on
   25 Sep - the safest calls are safe because they pay 1.08-1.2. So the legs
   are chosen for value: rated 70%+ by our model AND priced 1.25+ by SportyBet,
   ranked by probability x odds (the same edge the Wizard builder uses), and
   stacked until the slip pays x15 - eight legs at most, x8 at the least. */
const MIN_P = 0.70, MIN_ODD = 1.25, MIN_GOOD = 5, TARGET = 15, FLOOR = 8, MAX_LEGS = 8;

/* Pure: which legs, at what price. `feed` is SportyBet's events with odds. */
function pick(pay, now, feed) {
  const today = S.dayOf(now);
  const cands = [];
  for (const f of pay.fixtures || []) {
    if (f.date !== today || !(f.tip_p >= MIN_P) || f.thin || !TIP_CODE[f.tip] ||
        !(Date.parse(f.kickoff || "") > now + 60 * 60000)) continue;
    const leg = { home: f.home, away: f.away, kickoff: Date.parse(f.kickoff), prediction: TIP_CODE[f.tip], p: f.tip_p };
    const e = C.pair(feed, leg);
    const o = e && e.odds && e.odds[leg.prediction];
    if (o >= MIN_ODD) cands.push(Object.assign(leg, { odds: o }));   // no SportyBet price, no leg
  }
  if (cands.length < MIN_GOOD) return null;
  cands.sort((a, b) => b.p * b.odds - a.p * a.odds);
  const legs = [];
  let odds = 1;
  for (const l of cands) {
    if (legs.length >= MAX_LEGS || odds >= TARGET) break;
    legs.push(l); odds *= l.odds;
  }
  return odds >= FLOOR ? { legs, odds } : null;
}

function texts(p, codes) {
  const order = [["sporty", "SportyBet"], ["bet9ja", "Bet9ja"], ["betking", "BetKing"], ["betpawa", "betPawa"]];
  const lines = order.filter(([k]) => codes[k]).map(([k, n]) =>
    n + ": " + codes[k].code + (codes[k].n < p.legs.length ? " (" + codes[k].n + " of " + p.legs.length + ")" : ""));
  const head = "🔥 Big odds of the day 🧙\n\n" + p.legs.length + " strong legs stacked · pays ×" + p.odds.toFixed(2) + " on SportyBet\n\n";
  const x = head + lines.join("\n") + "\n\nEvery leg rated 70%+ by our model 😤\n👉 soccerwizard.live\n18+";
  const tg = head + lines.join("\n") + "\n\n" +
    p.legs.map((l) => "• " + l.home + " v " + l.away + " · " + (l.prediction === "OVER_1.5" ? "Over 1.5" : l.prediction) +
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
    const others = await Promise.all(["bet9ja", "betking", "betpawa"].map((to) =>
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

module.exports = { pick, texts, mint, fromRow, TIP_CODE };
