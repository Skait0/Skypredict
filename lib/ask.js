"use strict";
/* WHAT THE READER ASKED THE BOT TO DO, IN THEIR OWN WORDS.
 *
 * Asked for by the owner on 28 Sep 2026, after SportyClaw: "trim this to 150
 * odds", "split into 2", "change all draws to under 2.5", "convert to Bet9ja",
 * "book me today's safest". Plain rules, no model: they cover the requests
 * people actually type, answer instantly and cost nothing. Anything they do
 * not recognise falls through to the reading the bot has always given, so a
 * missed phrase is never a dead end.
 *
 * Pure - no network. api/tg.js does the reading and the booking; the plans
 * here say which legs go where. The edits themselves are the converter's own
 * (lib/slipedit.js, generated from index.html), so the bot and the site trim
 * and change a slip identically.
 */
const D = require("./doctor.js");
const S = require("./slipedit.js");

const BOOK_WORDS = [
  [/\bsporty ?bet\b|\bsporty\b/i, "sporty"],
  [/\bbet ?9ja\b|\bbetnaija\b/i, "bet9ja"],
  [/\bbet ?king\b/i, "betking"],
  [/\bbet ?pawa\b/i, "betpawa"],
  [/\b1x ?bet\b/i, "onexbet"],
];
const bookIn = (s) => { for (const [re, k] of BOOK_WORDS) if (re.test(s)) return k; return null; };

/* Market phrases, onto slipedit's CHANGE_FROM / CHANGE_TO keys. Order
   matters: the longer phrase is tried first ("home wins" before "wins"). */
const FROM_WORDS = [
  [/home ?wins?|home teams? to win/, "home"], [/away ?wins?|away teams? to win/, "away"],
  [/draws?/, "draw"], [/double chances?|\bdc\b|win or draws?/, "dc"], [/wins?|winners?|1x2/, "win"],
  [/over ?1\.5|o ?1\.5/, "o15"], [/over ?2\.5|o ?2\.5/, "o25"], [/over ?3\.5|o ?3\.5/, "o35"],
  [/under ?1\.5|u ?1\.5/, "u15"], [/under ?2\.5|u ?2\.5/, "u25"], [/under ?3\.5|u ?3\.5/, "u35"],
  [/not both|\bng\b|no goal|btts no/, "ng"], [/both teams? to score|\bgg\b|\bbtts\b/, "gg"],
];
const TO_WORDS = [
  [/win or draw|double chance|\bdc\b|draw no|safer side/, "dc"], [/either team|\b12\b|no draw/, "12"],
  [/over ?1\.5|o ?1\.5/, "o15"], [/over ?2\.5|o ?2\.5/, "o25"],
  [/under ?2\.5|u ?2\.5/, "u25"], [/under ?3\.5|u ?3\.5/, "u35"],
  [/not both|\bng\b|no goal|btts no/, "ng"], [/both teams? to score|\bgg\b|\bbtts\b/, "gg"],
];
const pick = (list, s) => { for (const [re, k] of list) if (re.test(s)) return k; return null; };
const WORD_N = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s) => (s == null ? null : WORD_N[s.toLowerCase()] || parseFloat(String(s).replace(",", ".")));

/* "x150", "@150", "150 odds", "150x" - the x only where it starts a word. */
const ODDS_RE = /(?:^|[\s(])[x×@]\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:odds|x)\b/;

/* One message -> {kind, ...} or null. `code` is the booking code that came
   with it (or with the message it replies to), taken out of the text first:
   its own digits were being read as the instruction's - "split HUW6YC into
   3" split in four, "WJWX4Z x20" trimmed to x4. Without a code only "today"
   makes sense. */
function parseAsk(text, code) {
  let t = " " + String(text || "").toLowerCase().replace(/\s+/g, " ") + " ";
  if (code) t = t.split(String(code).toLowerCase()).join(" ");
  if (!code) {
    if (/\b(today|tonight|tomorrow|safest|sure|bankers?|book me|best games)\b/.test(t)) {
      const n = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(games?|legs?|matches|selections?)/.exec(t);
      const o = ODDS_RE.exec(t);
      return { kind: "today", games: n ? num(n[1]) : null, odds: o ? num(o[1] || o[2]) : null,
               when: /\btomorrow\b/.test(t) ? "tomorrow" : "today", book: bookIn(t) };
    }
    return null;
  }
  const ch = /\b(?:change|swap|switch|turn|make)\b(.*?)\b(?:to|into|for|with)\b(.+)$/.exec(t);
  if (ch) {
    const from = pick(FROM_WORDS, ch[1]), to = pick(TO_WORDS, ch[2]);
    if (from && to && from !== to) return { kind: "change", from, to };
    const book = bookIn(ch[2]);
    if (book) return { kind: "convert", to: book };
  }
  const sp = /\bsplit\b(?:.*?(\d+|two|three|four))?/.exec(t) || /(\d+|two|three|four)\s*(?:slips|tickets|parts)\b/.exec(t);
  if (sp) return { kind: "split", n: Math.max(2, Math.min(4, num(sp[1]) || 2)) };
  const od = ODDS_RE.exec(t);
  if (od) { const o = num(od[1] || od[2]); if (o > 1) return { kind: "trim", odds: o }; }
  const gm = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:games?|legs?|matches|selections?)\b/.exec(t);
  if (gm && /\b(trim|cut|reduce|keep|leave|only|best|down|remove|give|make)\b/.test(t)) {
    const n = num(gm[1]); if (n >= 1) return { kind: "keep", games: n };
  }
  const cv = /\b(?:convert|move|transfer|put|send)\b.*?\bto\b(.+)$/.exec(t);
  if (cv && bookIn(cv[1])) return { kind: "convert", to: bookIn(cv[1]) };
  if (/\b(convert|conversion)\b/.test(t)) return { kind: "convert", to: null };
  if (/\b(safer|safe|stronger|bankers?|less risk)/.test(t)) return { kind: "safer" };
  return null;
}

/* Our chance of each leg - the model's where the game is on our board, the
   bookmaker's own price otherwise (the converter's legChance, same rule). */
function rate(legs, fixtures) {
  return (legs || []).map((leg) => {
    const f = D.findFixture(fixtures || [], leg);
    const pm = f && leg.prediction ? D.probOf(f, leg.prediction) : null;
    if (pm != null) return { leg, p: pm, src: "model", odds: +leg.odds };
    const o = +leg.odds;
    return { leg, p: o > 1.01 ? 1 / o : null, src: o > 1.01 ? "book" : null, odds: o };
  });
}
const likeliest = (rows) => rows.slice().sort((a, b) =>
  ((b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p)) || ((a.odds || 0) - (b.odds || 0)));

function planTrim(legs, fixtures, odds) { return S.trimToOdds(rate(legs, fixtures), odds); }
function planKeep(legs, fixtures, n) {
  const rows = likeliest(rate(legs, fixtures));
  return { keep: rows.slice(0, n), cut: rows.slice(n) };
}
/* Dealt like cards, likeliest first, so the tickets are siblings rather than
   one near-certain and one hopeless - the converter's split does the same. */
function planSplit(legs, fixtures, n) {
  const rows = likeliest(rate(legs, fixtures)), parts = [];
  for (let i = 0; i < n; i++) parts.push([]);
  rows.forEach((r, i) => parts[i % n].push(r.leg));
  return parts.filter((p) => p.length);
}

/* TODAY'S SAFEST, FROM OUR OWN BOARD. The tip on each fixture is a sentence
   ("1X, home or draw"); its head names the market. Games still to come in
   the reader's day (Lagos, UTC+1), likeliest first. */
const TIP_CODE = { "1X": "1X", "X2": "X2", "Over 1.5": "OVER_1.5", "Home win": "1", "Away win": "2" };
function lagosDay(ms) { return new Date(ms + 3600e3).toISOString().slice(0, 10); }
function planToday(fixtures, ask, now) {
  now = now || Date.now();
  const day = lagosDay(now + (ask.when === "tomorrow" ? 864e5 : 0));
  const rows = (fixtures || []).map((f) => {
    const ko = Date.parse(f.kickoff || "");
    const code = TIP_CODE[String(f.tip || "").split(",")[0]];
    return (code && isFinite(ko) && ko > now + 10 * 60e3 && lagosDay(ko) === day && f.tip_p > 0)
      ? { leg: { home: f.home, away: f.away, kickoff: f.kickoff, prediction: code }, p: f.tip_p } : null;
  }).filter(Boolean).sort((a, b) => b.p - a.p);
  const n = Math.max(1, Math.min(20, ask.games || (ask.odds ? 20 : 5)));
  return rows.slice(0, ask.odds ? 30 : n);
}

module.exports = { parseAsk, rate, planTrim, planKeep, planSplit, planToday, lagosDay, TIP_CODE };
