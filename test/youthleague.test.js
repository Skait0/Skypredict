"use strict";
/* Owner, 13 Oct 2026: "the wizard picked uefa champions league under 19!!".
   SportyBet listed "Atletico Madrid v Manchester United FC" in the UEFA Youth
   League the same day as the senior tie. The exact-name pass has no clock fence,
   so the board fixture booked the U19 game. Youth, reserve and women's
   competitions are dropped before any matching, on the site and in the mint. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../scripts/mkcode.js");

const f = { home: "Atletico Madrid", away: "Man Utd", date: "2026-10-14", kickoff: "2026-10-14T19:00:00Z" };
const youth = { eventId: "y", homeTeam: "Atletico Madrid", awayTeam: "Manchester United",
  league: "International Youth UEFA Youth League", startTime: Date.parse("2026-10-13T14:00:00Z") };
const senior = { eventId: "s", homeTeam: "Atletico Madrid", awayTeam: "Manchester United",
  league: "International Clubs UEFA Champions League", startTime: Date.parse("2026-10-14T19:00:00Z") };

test("the daily code books the senior tie, never the Youth League game with the same names", () => {
  assert.strictEqual(M.findEvent(f, [youth, senior]).eventId, "s");
  assert.strictEqual(M.findEvent(f, [youth]), null, "a youth game alone is no match at all");
});

test("a club's own U23 side in a senior league still matches", () => {
  const j = { eventId: "j", homeTeam: "Juventus U23", awayTeam: "Lumezzane", league: "Italy Serie C, Group A",
    startTime: Date.parse("2026-10-13T16:30:00Z") };
  const fj = { home: "Juventus U23", away: "Lumezzane", date: "2026-10-13", kickoff: "2026-10-13T16:30:00Z" };
  assert.strictEqual(M.findEvent(fj, [j]).eventId, "j");
});

test("the site drops youth, reserve and women's competitions before matching any book", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const i = html.indexOf("function attachEventIds(");
  assert.match(html.slice(i, i + 1500), /sporty=sporty\.filter\(function\(m\)\{ return !isSimEvent\(m\) && !leagueTag\(m\.league\); \}\);/);
});
