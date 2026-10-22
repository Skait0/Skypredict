"use strict";
/* FEED ALARMS (owner, 18 Oct 2026): a ping to the owner's own Telegram when something
 * the day depends on has stopped, instead of finding out from a reader. Pure: the
 * hourly social run (api/social.js) feeds it what it already holds and sends what comes
 * back, once a day per alarm (social_log key alarm|<id>|<day>).
 *   board    the predictions were not rebuilt for 8 hours
 *   results  the build could not load some result files (degradedSources)
 *   ladder   no ladder slips by 11:00 Lagos (unless the ladder is paused)
 *   book     a bookie with 5+ codes today has booked none for 90 minutes while
 *            the site booked 5+ in the last hour on the others (10:00-21:59) */
const BOOK = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet", betway: "Betway", msport: "MSport" };

function alarms(x) {
  const out = [], h = x.hour, now = x.now;
  const pay = x.payload;
  if (pay && pay.generatedAt && now - Date.parse(pay.generatedAt) > 8 * 36e5)
    out.push({ id: "board", text: "⚠️ The predictions have not been rebuilt for " + Math.round((now - Date.parse(pay.generatedAt)) / 36e5) + " hours." });
  if (pay && Number(pay.degradedSources) > 0)
    out.push({ id: "results", text: "⚠️ The last build could not load " + pay.degradedSources + " result file(s). Grades may lag." });
  if (h >= 11 && !x.ladderPaused && Array.isArray(x.ladder) && x.ladder.length === 0)
    out.push({ id: "ladder", text: "⚠️ No ladder slips today yet (due 10:30)." });
  const books = (x.stats && x.stats.books) || [];
  const lastHour = books.reduce((s, b) => s + (Number(b.lastHour) || 0), 0);
  if (h >= 10 && h <= 21 && lastHour >= 5) {
    for (const b of books) {
      if ((Number(b.today) || 0) >= 5 && b.last && now - Date.parse(b.last) > 90 * 60e3)
        out.push({ id: "book-" + b.book, text: "⚠️ " + (BOOK[b.book] || b.book) + " has not booked a code for 90 minutes, while the other bookies booked " + lastHour + " in the last hour." });
    }
  }
  return out;
}

module.exports = { alarms };
