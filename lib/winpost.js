"use strict";
/* WON SLIPS, POSTED TO THE CHANNEL AND X (owner, 12 Oct 2026: "make telegram bot post
 * wins to tg channel and twitter ... a banner that shows won tickets without exposing
 * the actual ticket owner"; "a used code cant be verified anymore. so use something
 * like 'one of our users' ... use wizard titles").
 *
 * Pure. api/social.js feeds it today's landed slips (lib/slipwatch.js) and the social
 * log, and posts what it returns: the banner (/api/slipcard?r=<rank>) plus a caption.
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
const BOOK = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet" };

function rankOf(odds) {
  const o = Number(odds);
  const r = RANKS.find((x) => o >= x[0]);
  return r ? { id: r[1], one: r[2], many: r[3] } : null;
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
    .filter((s) => s && s.status === "landed" && Number(s.total_odds) >= MIN_ODDS && !done.has(key(s, ch)))
    .filter((s) => dayOf(Date.parse(s.settled_at)) === day)
    .sort((a, b) => Number(b.total_odds) - Number(a.total_odds))
    .slice(0, room);
}

function imageUrl(site, slip) {
  const r = rankOf(slip.total_odds);
  const games = slip.leg_count || (slip.legs || []).length;
  return site + "/api/slipcard?r=" + r.id + "&g=" + games + "&o=" + Number(slip.total_odds).toFixed(2);
}

/* Telegram: the picks, ticked. X: one line that fits. */
function caption(slip, ch) {
  const r = rankOf(slip.total_odds);
  const games = slip.leg_count || (slip.legs || []).length;
  const book = BOOK[slip.book] || slip.book;
  if (ch === "x") {
    return "🔥🧙 One of our " + r.many + " just landed " + fmt(slip.total_odds) + " on " + book +
      ": " + games + " games, every leg won ✅\n\nThe Wizard builds slips like this in one tap. Yours next? soccerwizard.live\n\n18+";
  }
  const legs = (slip.legs || []).map((l) => "✅ " + l.name);
  const shown = legs.slice(0, 8);
  if (legs.length > shown.length) shown.push("…and " + (legs.length - shown.length) + " more");
  return "🔥🧙 " + r.one + " just landed " + fmt(slip.total_odds) + "!\n\n" + shown.join("\n") +
    "\n\n" + games + " games on " + book + ", every leg won. Built by the Wizard in one tap.\n👉 soccerwizard.live\n18+ · Play responsibly";
}

module.exports = { rankOf, pick, caption, imageUrl, key, MIN_ODDS, PER_DAY, HOURS };
