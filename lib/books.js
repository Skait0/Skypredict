"use strict";

/* THE BOOKS THAT ARE LIVE, ONCE.
 *
 * Copy said two, three, four or five bookmakers depending on which surface a
 * reader was on (critique, 6 Oct 2026): "on both bookmakers" under a page that
 * drew five tickets. Every server-side sentence that names or counts the books
 * reads this list; the app's own BOOKS table in public/index.html is pinned
 * to it by test/everybook.test.js, so a sixth book fails a test until every
 * surface says six.
 *
 * Order is the order the site lists them in. Labels are plain text (the
 * wordmarks live in pages.js MARK and index.html BOOKS.<key>.mark). */
const NAMES = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet" };
const KEYS = Object.keys(NAMES);
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/* "SportyBet, Bet9ja, BetKing, betPawa and 1xBet" - or a subset, by key. */
function list(conj, keys) {
  const n = (keys || KEYS).map((k) => NAMES[k]).filter(Boolean);
  return n.length > 1 ? n.slice(0, -1).join(", ") + " " + (conj || "and") + " " + n[n.length - 1] : (n[0] || "");
}

module.exports = { NAMES, KEYS, COUNT: KEYS.length, COUNT_WORD: WORDS[KEYS.length], list };
