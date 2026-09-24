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
  assert.match(day, /so close 😤/,
    "a near miss says how near - upbeat since 24 Sep, and the count above still says 1 of 2");
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

test("BetKing joins the slip or sits the day out, and never shapes it", () => {
  /* The two established books negotiate the leg set between them: a refusal
     drops that leg and the round restarts. BetKing is asked afterwards, for
     the legs they already agreed, so a book that has never minted a daily
     code cannot decide which games a SportyBet reader gets. Every way it can
     fail - feed down, a leg missing from its feed, a refusal - costs BetKing
     the day and nothing else. */
  const mk = fs.readFileSync(path.join(__dirname, "..", "scripts", "mkcode.js"), "utf8");
  const round = mk.slice(mk.indexOf("for (let round = 1"), mk.indexOf("if (!codes) throw"));
  /* Attaching its event id in there is fine - that is bookkeeping. BOOKING in
     there is not, because a refusal would then restart the round and change
     the legs. */
  assert.ok(!/bookSlipRetrying\("betking"/.test(round) && !/attempt\.betking/.test(round),
    "BetKing is booked inside the round loop, so its refusals shape the slip");
  const after = mk.slice(mk.indexOf("if (!codes) throw"), mk.indexOf("const entry = {"));
  assert.match(after, /bkLegs\.every\(Boolean\)/, "a leg it does not carry must not be booked");
  assert.match(after, /codes\.betking = out\.code/);
  assert.match(after, /publishing without it/, "a refusal has to leave the other codes standing");
  assert.match(mk, /events\("betking"\)\.catch\(/, "its feed being down must not cost the day");
});

test("the BetKing code is printed without a link, because there is no link", () => {
  /* BK_URL is null in index.html: BetKing loads a code from its own betslip
     box and from no address at all. A link to their home page with the code
     on the end would look like it worked and quietly drop the slip. */
  const three = Object.assign({}, entry,
    { codes: { sporty: "WZDKEL", bet9ja: "5QP7W7C", betking: "BK99XY" } });
  const day = P.renderCodesDay(three, null);
  assert.ok(day.includes("BK99XY"), "the BetKing code is not on the page");
  const row = day.slice(day.indexOf("BK99XY") - 200, day.indexOf("BK99XY") + 200);
  assert.ok(!/<a\s[^>]*href[^>]*>[^<]*BK99XY/.test(row) && !/BK99XY[^<]*<\/a>/.test(row),
    "the BetKing code is wrapped in a link, which cannot load it");
  assert.match(row, /Paste it into the betslip/);
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
    /* Both books, or one - but never a row with no code at all.
       This used to demand both. It cost 13 September entirely: Bet9ja's origin
       was down for a minute, mkcode.js treated that as a verdict about the
       slip, and the day published nothing although SportyBet had already
       accepted the legs. The invariant worth keeping is that the codes on a
       row describe the SAME slip, and one code cannot disagree with a code
       that is not there. */
    const codes = e.codes || {};
    assert.ok(codes.sporty || codes.bet9ja, date + ": a day must carry a code");
    for (const [book, code] of Object.entries(codes)) {
      assert.ok(typeof code === "string" && code.length >= 4,
        date + ": the " + book + " code is not a code (" + code + ")");
    }
    for (const l of e.legs) {
      assert.ok(l.home && l.away && l.tip, date + ": a leg is missing its match or tip");
    }
  }
});
