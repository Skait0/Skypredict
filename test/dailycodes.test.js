"use strict";
/* THE CODE IS THE PRODUCT; THE RECORD IS THE REASON TO BELIEVE IT.
 *
 * Every site in this niche posts booking codes - sportpremi, betloy,
 * surecodes24, convertbetcodes, a Telegram channel - and not one says what
 * happened afterwards. A code expires in hours, so today's code is worth
 * nothing to a search engine and nothing to a sceptic. The dated page is worth
 * both, and only if it is graded honestly.
 *
 * So the rules worth pinning are about honesty, not markup: the same slip on
 * both books, per-leg grading, and a page that says "did not win" out loud.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const P = require("../lib/pages.js");

const entry = {
  date: "2026-09-08", generated: "2026-09-08T06:00:00.000Z",
  firstKickoff: "2026-09-08T16:45:00.000Z",
  codes: { sporty: "WZDKEL", bet9ja: "5QP7W7C" },
  legs: [
    { home: "Nijmegen", away: "Excelsior", league: "Netherlands Eredivisie",
      tip: "Over 1.5", tip_p: 0.92, market: "OVER_1.5", date: "2026-09-08" },
    { home: "Wrexham", away: "Burnley", league: "England Championship",
      tip: "1X, home or draw", tip_p: 0.80, market: "1X", date: "2026-09-08" },
  ],
};
const graded = (leg) => leg.home === "Nijmegen"
  ? { hg: 2, ag: 1, hit: true } : { hg: 0, ag: 2, hit: false };

test("both codes are printed, and each is a link that loads the slip", () => {
  const hub = P.renderCodesHub([entry], null);
  assert.ok(hub.includes("WZDKEL") && hub.includes("5QP7W7C"), "a code is missing");
  assert.ok(hub.includes(P.SPORTY_SHARE + "WZDKEL"), "the SportyBet code is not loadable");
  assert.ok(hub.includes(P.B9_SHARE + "5QP7W7C"), "the Bet9ja code is not loadable");
});

test("a settled day says how many landed, per leg", () => {
  /* Five legs at eighty per cent loses more often than it wins. Reporting only
     the slip would bury four honest calls under one red word. */
  const s = P.codeSummary(entry.legs, graded);
  assert.deepStrictEqual({ hit: s.hit, of: s.of, all: s.all, slip: s.slip },
    { hit: 1, of: 2, all: true, slip: false });
  const day = P.renderCodesDay(entry, graded);
  assert.match(day, /1 of 2 landed/);
  assert.match(day, /the slip did not win/,
    "a losing slip has to say so - the record is the only thing here nobody else has");
  assert.match(day, /landed<\/span>/);
  assert.match(day, /missed<\/span>/);
});

test("an unsettled day says so rather than guessing", () => {
  assert.strictEqual(P.codeSummary(entry.legs, null), null);
  assert.match(P.renderCodesDay(entry, null), /Not settled yet/);
});

test("a day page is dated by its day and never moves again", () => {
  const pre = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(pre, /paths\.push\(e\.date < today \? \{ path: rel, lastmod: e\.date \}/,
    "a settled day still claims to change on every build");
});

test("the build never mints - that is a once-a-day script", () => {
  /* api/book.js: the booking call costs Railway CPU and bookmaker goodwill.
     The build runs five or six times a day; minting there would be eighteen
     booking calls to publish one code. */
  const pre = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.ok(!/\/api\/book/.test(pre), "prebuild is booking, which it must never do");
  assert.match(pre, /daily-codes\.json/, "prebuild no longer reads the minted codes");
});

test("the minter refuses to publish two codes for two different slips", () => {
  /* Both books get the identical leg set every round, and a round where either
     refuses is discarded whole. Two codes for different slips would make the
     record meaningless, which is the only thing this page has. */
  const mk = fs.readFileSync(path.join(__dirname, "..", "scripts", "mkcode.js"), "utf8");
  assert.match(mk, /working\.map\(\(p\) => \(\{ eventId: p\.sporty/);
  assert.match(mk, /working\.map\(\(p\) => \(\{ eventId: p\.bet9ja/);
  assert.match(mk, /if \(attempt\.sporty && attempt\.bet9ja\)/,
    "a round must only count when BOTH books accepted the same set");
});

test("the minter uses the shipped matcher, not a copy of it", () => {
  /* Our fixtures carry no bookmaker event ids - predictions.json has none.
     A second matcher would book against rules the site does not use, and the
     failure mode is a code for the wrong fixture. */
  const mk = fs.readFileSync(path.join(__dirname, "..", "scripts", "mkcode.js"), "utf8");
  assert.match(mk, /public", "index\.html"/);
  for (const n of ["normTeam", "simTeams", "sameSlot", "tipCode"]) {
    assert.ok(mk.includes('"' + n + '"'), "the matcher no longer lifts " + n);
  }
});

test("the committed codes file is readable and shaped as the pages expect", () => {
  const p = path.join(__dirname, "..", "data", "daily-codes.json");
  if (!fs.existsSync(p)) return;                  /* none minted yet */
  const all = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [date, e] of Object.entries(all)) {
    assert.strictEqual(e.date, date, "the key and the row disagree about the date");
    assert.ok(Array.isArray(e.legs) && e.legs.length >= 2, date + ": too few legs");
    assert.ok(e.codes && e.codes.sporty && e.codes.bet9ja,
      date + ": a day must carry a code for both books or neither");
    for (const l of e.legs) {
      assert.ok(l.home && l.away && l.tip, date + ": a leg is missing its match or tip");
    }
  }
});
