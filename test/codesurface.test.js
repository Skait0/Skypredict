"use strict";

/**
 * GETTING THE BOOKING CODES PAGE OUT OF THE FOOTER.
 *
 * /booking-codes carries the strongest claim this site makes - every code we
 * have ever published, with every leg of it graded against the final score -
 * and for months it had exactly one link pointing at it, in the footer. Nobody
 * went there. Reported by the person who built it: "even I dont really go
 * there because its not really there".
 *
 * Three things hold that fix in place, and each of them can be undone by an
 * edit that looks harmless:
 *
 *   1. public/code-today.json. Two hundred bytes the build writes so the home
 *      page can show the code without waiting for the 400KB payload. If the
 *      build stops writing it the card silently never appears - it is hidden
 *      until the fetch lands, by design, so a missing file looks exactly like
 *      a page that has not finished loading.
 *   2. The card and the link on the home page. A card with no link to the page
 *      is a dead end; a link that is a <button> in the tab nav is not a link
 *      at all, and cannot be crawled or opened in a new tab.
 *   3. The hub's motion. Every reveal is hidden by CSS scoped to a class the
 *      script itself sets, so a reader with JavaScript off sees the whole page
 *      rather than a blank one. Unscope that selector and the page is empty
 *      for them.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const P = require("../lib/pages.js");
const ROOT = path.join(__dirname, "..");

/* ------------------------------------------------- the file the card reads */

test("the build publishes the newest code, and what the one before it did", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "prebuild.js"), "utf8");
  assert.match(src, /code-today\.json/,
    "the build no longer writes the file the home page card is fed from");
  /* Newest, not today's: mkcode runs at midday UTC, so for half the clock
     there is no entry dated today and a card keyed on today would vanish. */
  assert.match(src, /const newest = codeDays/,
    "the card is keyed on today again, so it disappears before mkcode runs");

  const f = path.join(ROOT, "public", "code-today.json");
  if (!fs.existsSync(f)) return;            // a clean checkout has not built yet
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const days = Object.keys(JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", "daily-codes.json"), "utf8"))).sort();
  assert.equal(d.date, days[days.length - 1], "the card is showing a stale day");
  assert.ok(d.n > 0, "a code with no games in it");
  assert.ok(d.codes && (d.codes.sporty || d.codes.bet9ja || d.codes.betking),
    "no bookmaker code in the file, so the card renders nothing");
  if (d.prev) {
    assert.ok(d.prev.date < d.date, "the previous code is not previous");
    assert.ok(d.prev.hit <= d.prev.of, "more legs landed than were graded");
  }
});

/* --------------------------------------------------------- the home page */

test("the home page shows the code and links to the page that keeps them", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

  assert.match(html, /id="codeCard"/, "the board card is gone");
  assert.match(html, /fetch\("\/code-today\.json"\)/,
    "the card is no longer fed from its own file");
  /* Hidden until the file lands, and [hidden] needs its own rule because an
     author display wins over it - the site has been bitten by this before. */
  assert.match(html, /\.ck-card\[hidden\]\{display:none\}/,
    "the card will be drawn empty before its data arrives");

  /* A real anchor, somewhere a reader actually looks. The footer link is not
     enough and is what this whole change is about, so it does not count. */
  const foot = html.indexOf('class="foot-links"');
  const links = [];
  const re = /<a[^>]+href="\/booking-codes"/g;
  let m;
  while ((m = re.exec(html))) links.push(m.index);
  assert.ok(links.length >= 2,
    "/booking-codes is back to a single link on the whole page");
  assert.ok(links.some((i) => foot < 0 || i < foot),
    "every link to /booking-codes is in the footer again");
});

/* ------------------------------------------------------------- the hub */

const DAYS = [
  { date: "2026-09-20", firstKickoff: "2026-09-20T12:00:00.000Z",
    codes: { sporty: "QZ5TFX", bet9ja: "5SCZZ2W" },
    legs: [{ home: "Vaduz", away: "Thun", league: "Switzerland Super League",
             date: "2026-09-20", tip: "Over 1.5", tip_p: 0.94 }] },
  { date: "2026-09-19", codes: { sporty: "AAA111", betking: "BK99" },
    legs: [
      { home: "Arsenal", away: "Chelsea", date: "2026-09-19", tip: "Over 1.5" },
      { home: "Leeds", away: "Everton", date: "2026-09-19", tip: "Over 1.5" },
      { home: "Bayern", away: "Koln", date: "2026-09-19", tip: "Over 1.5" },
    ] },
];
/* Two of the three legs on the 19th are graded, one landed. Nothing on the
   20th has been played. */
const RESULTS = {
  "Arsenal|Chelsea": { hg: 2, ag: 1, hit: true },
  "Leeds|Everton": { hg: 0, ag: 0, hit: false },
};
const resultOf = (leg) => RESULTS[leg.home + "|" + leg.away] || null;

test("the hub sets the day's code as a ticket you can copy", () => {
  const html = P.renderCodesHub(DAYS, resultOf);
  assert.match(html, /class="ck-hero"/, "the hero is gone");
  assert.match(html, /<button class="ck-copy" type="button" data-code="QZ5TFX">/,
    "the code is not a copy button any more - tapping it is the first thing " +
    "anyone tries");
  assert.match(html, /shareCode=QZ5TFX/, "the SportyBet deep link is gone");
  /* BetKing cannot load a booked code from a URL, so its ticket must not
     pretend to - see codeBlock for the finding this comes from. */
  const bk = P.renderCodesHub([DAYS[1]], resultOf);
  assert.match(bk, /BK99<em>Tap to copy<\/em><\/button><span class="ck-paste">/,
    "BetKing has been given a link, which would drop the slip silently");
});

test("the hub counts every leg it has ever published, and only settled ones", () => {
  const html = P.renderCodesHub(DAYS, resultOf);
  /* One of two settled legs landed. The 20th is unplayed and is counted by
     neither side - a pending leg read as a miss would libel our own record. */
  assert.match(html, /<span data-to="1">0<\/span>/, "the landed count is wrong");
  assert.match(html, /<span data-to="2">0<\/span>/, "the settled count is wrong");
  assert.match(html, /<i data-p="50"><\/i>/, "the meter bar disagrees with the count");

  /* One dot per leg, in slip order: landed, missed, still out. */
  const pips = /<span class="ck-pips" aria-hidden="true">([\s\S]*?)<\/span>/.exec(html);
  assert.ok(pips, "the per-leg dots are gone");
  assert.equal(pips[1], '<i class="w"></i><i class="l"></i><i class=""></i>');

  /* A day with nothing graded at all says so rather than claiming 0 of 0. */
  const none = P.renderCodesHub([DAYS[0]], () => null);
  assert.doesNotMatch(none, /legs landed/,
    "an ungraded record is being printed as a score of zero");
});

test("the hub's motion is additive, so the page survives without it", () => {
  const html = P.renderCodesHub(DAYS, resultOf);
  /* The class is put on <html> BY the script. With no script the selector
     never matches, nothing is hidden, and the page reads as plain HTML. */
  assert.match(html, /document\.documentElement\.className\+=" ck-anim"/);
  /* Every rule that sets opacity:0 on a revealed section has to be scoped to
     that class. One that is not blanks the page for anyone without it. */
  let i = -1, hides = 0;
  while ((i = html.indexOf(".rv{opacity:0", i + 1)) >= 0) {
    hides++;
    assert.equal(html.slice(i - 9, i), ".ck-anim ",
      "a section is hidden by a rule that does not wait for the script, so a " +
      "reader without JavaScript gets a blank page");
  }
  assert.ok(hides, "the reveal rule is gone");
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/,
    "the reveal ignores a reader who has asked for no motion");
  /* Hover is a desktop affordance and must not fire on a touch tap. */
  assert.match(html, /@media \(hover:hover\)\{/, "the hover states are unguarded");
});
