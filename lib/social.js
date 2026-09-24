"use strict";
/* THE SOCIAL ENGINE'S BRAIN: what is due now, and what it says. Pure - the
 * posting lives in api/social.js, which runs every hour from Vercel cron.
 *
 * The owner's brief (24 Sep): handle X and Telegram automatically, never leave
 * a channel dormant, upbeat (see memory soccerwizard-upbeat-tone). The daily
 * code and result posts already go out from the mint run (xqueue.js,
 * tgpost.js); this adds, on the Lagos clock:
 *
 *   09:00  Pick of the day          every day
 *   17:00  Tonight's bankers        every day, when there are 2+
 *   12:00  a Wizard's Eye / record promo, Mondays and Thursdays
 *   any    keepalive, when a channel has been quiet 20h+ (10:00-21:00 only)
 *
 * Every figure comes off today's payload. No em dashes. Always 18+.
 */
const LAGOS_MS = 3600000;
const SITE = "soccerwizard.live";
const BOT = "t.me/Soccerwizardhqbot";

const lagos = (now) => new Date(now + LAGOS_MS);
const dayOf = (now) => lagos(now).toISOString().slice(0, 10);
const hourOf = (now) => lagos(now).getUTCHours();
const pc = (p) => Math.round(p * 100) + "%";
const hhmm = (iso) => { const d = new Date(Date.parse(iso) + LAGOS_MS); return d.toISOString().slice(11, 16); };

/* X counts a link as 23 and an emoji as 2. */
function xLen(t) {
  return [...String(t).replace(/(?:https?:\/\/)?(?:t\.me\/\S+|soccerwizard\.live\S*)/g, "x".repeat(23))]
    .reduce((n, c) => n + (/\p{Extended_Pictographic}/u.test(c) ? 2 : 1), 0);
}
const tipOf = (f) => String(f.tip || "").replace(/\s+/g, " ").trim();

function potd(pay, now) {
  const p = pay && pay.potd;
  if (!p || p.date !== dayOf(now)) return null;
  const f = (pay.fixtures || []).find((x) => x.home === p.home && x.away === p.away && x.date === p.date);
  if (!f || !f.tip || !(f.tip_p > 0)) return null;
  const body = "🧙 Pick of the day\n\n" + f.home + " v " + f.away + "\n" + tipOf(f) + " · " + pc(f.tip_p) +
    (f.kickoff ? "\nKick-off " + hhmm(f.kickoff) + " WAT" : "");
  return {
    x: body + "\n\nFull board + slip builder 👉 " + SITE + "\n18+",
    tg: body + "\n\nFull board and the slip builder: https://www." + SITE + "\n\n18+ · Stake only what you can afford to lose",
  };
}

function bankers(pay, now) {
  const today = dayOf(now);
  const rows = (pay.fixtures || []).filter((f) => f.date === today && f.tip && f.tip_p >= 0.75 && !f.thin &&
    Date.parse(f.kickoff || "") > now + 30 * 60000)
    .sort((a, b) => b.tip_p - a.tip_p).slice(0, 3);
  if (rows.length < 2) return null;
  const line = (f) => f.home + " v " + f.away + " · " + tipOf(f) + " · " + pc(f.tip_p);
  const head = "🔥 Tonight's bankers 🧙\n\n", xTail = "\n\nBuild your slip 👉 " + SITE + "\n18+";
  let k = rows.length;
  while (k > 2 && xLen(head + rows.slice(0, k).map(line).join("\n") + xTail) > 280) k--;
  return {
    x: head + rows.slice(0, k).map(line).join("\n") + xTail,
    tg: head + rows.map(line).join("\n") + "\n\nBuild your own slip around them: https://www." + SITE +
      "\nOr drop any code on " + BOT + " 🔮\n\n18+ · Stake only what you can afford to lose",
  };
}

/* Rotates, so the feed never repeats itself two posts running. */
function promo(pay, now, n) {
  const rec = pay && pay.record;
  const recLine = rec && rec.total
    ? "📊 " + rec.correct.toLocaleString("en") + " of " + rec.total.toLocaleString("en") + " tips landed in the last " +
      rec.days + " days (" + Math.round(rec.correct / rec.total * 100) + "%). Every one graded against the final score, the misses too. See for yourself 👉 " + SITE + "\n18+"
    : null;
  const all = [
    "🔮 Drop any code. The Wizard's Eye sees it all.\n\nSend any SportyBet, Bet9ja, BetKing or betPawa code to " + BOT +
      "\n🔥 bankers · 👀 legs to tighten · 🔁 one-tap convert · 🔔 live updates\n18+",
    "🔁 Your guy posted a SportyBet code but you play Bet9ja, BetKing or betPawa?\n\nSend it to " + BOT +
      " and get it on your bookie in one tap 🧙\n18+",
    recLine,
    "🧙 Tired of picking games one by one?\n\nName your payout and the Wizard finds the games, or slide your risk and watch the slip build itself.\n\nCode for all four bookies 👉 " + SITE + "\n18+",
  ].filter(Boolean);
  const t = all[Math.abs(n) % all.length];
  return { x: t, tg: t.replace(/👉 soccerwizard\.live/, "👉 https://www." + SITE).replace(new RegExp(BOT.replace(".", "\\."), "g"), "https://" + BOT) };
}

/* What is due at `now`, given which keys are already posted and when each
   channel last posted. Returns [{key, kind, channel, text}]. */
function due(pay, now, posted, lastPost) {
  const d = dayOf(now), h = hourOf(now), dow = lagos(now).getUTCDay();
  const out = [];
  const add = (kind, texts, stamp) => {
    if (!texts) return;
    for (const ch of ["x", "tg"]) {
      const key = kind + "|" + (stamp || d) + "|" + ch;
      if (!posted.has(key) && texts[ch]) out.push({ key, kind, channel: ch, text: texts[ch] });
    }
  };
  if (h === 9) add("potd", potd(pay, now));
  if (h === 17) add("bankers", bankers(pay, now));
  if (h === 12 && (dow === 1 || dow === 4)) add("promo", promo(pay, now, Math.floor(now / 864e5)));
  if (h >= 10 && h <= 21) {
    for (const ch of ["x", "tg"]) {
      const last = lastPost[ch];
      if (!out.some((o) => o.channel === ch) && (!last || now - last > 20 * 3600e3)) {
        const t = promo(pay, now, Math.floor(now / 3600e3));
        const key = "keepalive|" + d + "|" + ch;
        if (!posted.has(key)) out.push({ key, kind: "keepalive", channel: ch, text: t[ch] });
      }
    }
  }
  return out;
}

module.exports = { due, potd, bankers, promo, xLen, dayOf, hourOf };
