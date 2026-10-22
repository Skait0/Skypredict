"use strict";
/* WON SLIPS, POSTED TO THE CHANNEL AND X (owner, 12 Oct 2026: "make telegram bot post
 * wins to tg channel and twitter ... a banner that shows won tickets without exposing
 * the actual ticket owner"; "a used code cant be verified anymore. so use something
 * like 'one of our users' ... use wizard titles").
 *
 * Pure. api/social.js feeds it today's landed slips (lib/slipwatch.js) and the social
 * log, and posts what it returns: the banner (/api/slipcard?w=<id>) plus a caption.
 * No code, no user - the wizard rank, decided by the odds, is the credit.
 */
const MIN_ODDS = 5;           /* owner: x5 or more */
const PER_DAY = 3;            /* owner: max 3 a day, per channel, biggest first */
const HOURS = [9, 22];        /* Lagos hours a win may go out */

const RANKS = [               /* [from odds, id, "a ...", plural] */
  [200, "grandwizard", "A Grand Wizard", "Grand Wizards"],
  [50, "archmage", "An Archmage", "Archmages"],
  [10, "sorcerer", "A Sorcerer", "Sorcerers"],
  [5, "apprentice", "An Apprentice", "Apprentices"],
];
const BOOK = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet", betway: "Betway" };

function rankOf(odds) {
  const o = Number(odds);
  const r = RANKS.find((x) => o >= x[0]);
  return r ? { id: r[1], one: r[2], many: r[3] } : null;
}

/* WHAT THE SLIP PAID (owner, 18 Oct 2026: a x121.88 slip with three handicap pushes
   paid about x14, but went out as "x121.88, every leg won"). A push ("void": the
   score lands on the line) returns that leg's stake, so its odds count as 1: the
   payout is the booked odds over the pushed legs' odds. A leg's verdict comes from
   the leg itself (filled by lib/slipdetail.js full) or the grader's seen marks.
   odds is null when a pushed leg's price is not known - never posted as a win. */
function paid(slip) {
  const legs = (slip && slip.legs) || [], seen = (slip && slip.seen) || {};
  let div = 1, pushed = 0, known = true;
  legs.forEach((l, i) => {
    if ((l && l.verdict ? l.verdict : seen[i]) !== "void") return;
    pushed++;
    const o = Number(l && l.odds);
    if (o > 1) div *= o; else known = false;
  });
  const games = (slip && slip.leg_count) || legs.length;
  const total = Number(slip && slip.total_odds);
  return { odds: known && total > 0 ? Math.round(total / div * 100) / 100 : null, pushed, won: games - pushed, games };
}

/* CONFIRMED (owner, 18 Oct 2026: "only unconfirmed ones should" come to the owner):
   every game on the slip has a final score that WON it - none voided, none settled by
   hand, none the ledger could not grade. A confirmed win posts itself; anything else
   waits for the owner's OK (toAsk). */
function confirmed(slip) {
  const legs = (slip && slip.legs) || [], seen = (slip && slip.seen) || {};
  const games = (slip && slip.leg_count) || legs.length;
  return legs.length > 0 && legs.length === games && legs.every((l, i) => (l && l.verdict ? l.verdict : seen[i]) === "won");
}

const fmt = (o) => "×" + Number(o).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const key = (slip, ch) => "win|" + slip.id + "|" + ch;

/* What goes out this run on one channel. `landed` are today's landed slips,
   `log` the social_log rows (key, channel, kind, posted_at), `day` the Lagos day. */
function pick(landed, log, ch, now, dayOf, hourOf) {
  const h = hourOf(now);
  if (h < HOURS[0] || h > HOURS[1]) return [];
  const day = dayOf(now);
  const done = new Set((log || []).map((r) => r.key));
  const usedToday = (log || []).filter((r) => r.kind === "win" && r.channel === ch && dayOf(Date.parse(r.posted_at)) === day).length;
  const room = PER_DAY - usedToday;
  if (room <= 0) return [];
  return (landed || [])
    .filter((s) => s && s.status === "landed" && confirmed(s) && paid(s).odds >= MIN_ODDS && !done.has(key(s, ch)))
    /* Any win of the last 24 hours not posted yet (18 Oct 2026): an evening slip settles
       after 22:00 Lagos, and a 4th win of the day is over the three. Both used to be
       dropped for being "yesterday" by morning; now they go out the next day. */
    .filter((s) => now - Date.parse(s.settled_at) <= 864e5)
    .sort((a, b) => paid(b).odds - paid(a).odds)
    .slice(0, room);
}

/* WIN APPROVALS (owner, 18 Oct 2026): a win that is not confirmed (a voided game, one
   settled by hand, one not graded) is not posted by itself. The hourly run sends the
   owner its banner once, and the owner posts it from Admin > Won slips (api/account.js
   postwin). Wins of the last 24 hours at x5+ (what they paid), not asked about yet and
   not on any channel, in the posting hours. */
const askKey = (slip) => "winask|" + slip.id;
function toAsk(landed, log, now, hourOf) {
  const h = hourOf(now);
  if (h < HOURS[0] || h > HOURS[1]) return [];
  const done = new Set((log || []).map((r) => r.key));
  return (landed || [])
    .filter((s) => s && s.status === "landed" && !confirmed(s) && paid(s).odds >= MIN_ODDS && !done.has(askKey(s)) &&
      !["tg", "x", "fb"].some((ch) => done.has(key(s, ch))) && now - Date.parse(s.settled_at) <= 864e5)
    .sort((a, b) => paid(b).odds - paid(a).odds);
}
function askText(slip) {
  const p = paid(slip);
  return "🧙 New win waiting for your OK: " + fmt(p.odds) + " · " + p.games + " games" +
    (p.pushed ? ", " + p.won + " won, " + p.pushed + " voided" : ", every leg won") +
    ".\n\nCheck it, then post it from Admin > Won slips > Post to our channels.";
}

/* The list banner by row id (api/slipcard.js ?w=): the picks are read from the row
   server-side, so the URL carries nothing anyone could rewrite into other text. A
   slip without an id (none today) gets the figures-only banner. */
function imageUrl(site, slip) {
  /* &n= is the number of legs on the row: the card is cached for a year by URL, and a row
     filled with its missing legs (api/account.js postwin) must not keep its old picture. */
  const n = (slip.legs || []).length, pu = paid(slip).pushed;
  if (slip.id != null && slip.id !== "") return site + "/api/slipcard?w=" + encodeURIComponent(slip.id) + (n ? "&n=" + n : "") + (pu ? "&p=" + pu : "");
  const r = rankOf(slip.total_odds);
  const games = slip.leg_count || (slip.legs || []).length;
  return site + "/api/slipcard?r=" + r.id + "&g=" + games + "&o=" + Number(slip.total_odds).toFixed(2);
}

/* A pick in words (22 Oct 2026: a win post showed "AWAY_UNDER_1.5 (Betis v Feyenoord)"). Names
   stored as a raw market code, alone or before "(Home v Away)", go through the site's labels. */
function plain(name) {
  const s = String(name || "");
  const m = /^([A-Z][A-Z0-9_.]*_[A-Z0-9_.]+|[A-Z0-9]{1,3})(?:\s*\((.+?) v (.+)\))?$/.exec(s);
  if (!m) return s;
  const D = require("./doctor.js");
  let label = D.label({ prediction: m[1], home: m[2] || "Home", away: m[3] || "Away" });
  const tg = /^(HOME|AWAY)_(UNDER|OVER)_([\d.]+)$/.exec(m[1]);
  if (tg && m[2]) label = (tg[1] === "HOME" ? m[2] : m[3]) + " " + tg[2].toLowerCase() + " " + tg[3] + " goals";
  if (!label || label === m[1]) label = m[1].charAt(0) + m[1].slice(1).toLowerCase().replace(/_/g, " ");
  return m[2] && !label.includes(m[2]) && !label.includes(m[3]) ? label + " (" + m[2] + " v " + m[3] + ")" : label;
}

/* Telegram: the picks, one per line (a ball, never a green tick: owner, 21 Oct 2026). X: one line that fits. */
function caption(slip, ch) {
  const p = paid(slip), r = rankOf(p.odds);
  const games = p.games;
  const book = BOOK[slip.book] || slip.book;
  const how = p.pushed ? games + " games, " + p.won + " won, " + p.pushed + " voided (stake back)" : games + " games, every leg won";
  if (ch === "x") {
    return "🔥🧙 One of our " + r.many + " just landed " + fmt(p.odds) + " on " + book +
      ": " + how + " 🔥\n\nThe Wizard builds slips like this in one tap. Yours next? soccerwizard.live\n\n18+";
  }
  const legs = (slip.legs || []).map((l, i) => ((l && l.verdict ? l.verdict : (slip.seen || {})[i]) === "void" ? "↩️ " + plain(l.name) + " (voided)" : "⚽ " + plain(l.name)));
  const shown = legs.slice(0, 8);
  /* legs are the ones on our board; a slip booked before every market was tracked has more games */
  const rest = Math.max(legs.length, games) - shown.length;
  if (rest > 0) shown.push("…and " + rest + " more");
  return "🔥🧙 " + r.one + " just landed " + fmt(p.odds) + "!\n\n" + shown.join("\n") +
    "\n\n" + games + " games on " + book + (p.pushed ? ": " + p.won + " won, " + p.pushed + " voided (stake back)." : ", every leg won.") + " Built by the Wizard in one tap.\n👉 soccerwizard.live\n18+ · Play responsibly";
}

/* THE MORNING RECAP (owner, 18 Oct 2026): one post at 10:00 Lagos on X and Telegram
   with yesterday's x5+ wins. Wins only, no "of N slips" line (owner: a bad weekend
   would read as discouraging). Nothing on a day without one. */
function recap(landed, yesterday, dayOf) {
  const wins = (landed || []).filter((s) => s && s.status === "landed" && paid(s).odds >= MIN_ODDS &&
    dayOf(Date.parse(s.settled_at)) === yesterday);
  if (!wins.length) return null;
  const top = Math.max.apply(null, wins.map((s) => paid(s).odds));
  const head = wins.length === 1 ? "🔥🧙 Yesterday a Soccerwizard slip landed " + fmt(top) + "."
    : "🔥🧙 Yesterday " + wins.length + " Soccerwizard slips landed at x5 or more. Biggest: " + fmt(top) + ".";
  return head + "\n\nToday's slips are ready at 10:30 👉 soccerwizard.live\n\n18+";
}

module.exports = { rankOf, paid, confirmed, toAsk, askKey, askText, pick, caption, imageUrl, key, recap, MIN_ODDS, PER_DAY, HOURS };
