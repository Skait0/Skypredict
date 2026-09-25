"use strict";
/* A LEG NEED NOT HAVE A KICKOFF.
 *
 * Sentry, 23 Sep 2026 07:37 UTC, Chrome Mobile on Android, production,
 * unhandled:
 *
 *   RangeError: Invalid time value
 *     at Date.toISOString
 *     at feedMatch   (app.js:6665)
 *     at byoConversion (app.js:6774)
 *     at renderConvert (app.js:6858)
 *
 * feedMatch built its kickoff fence with `new Date(l.kickoff).toISOString()`
 * before asking sameSlot anything. A pasted booking code can hand back a leg
 * with no kickoff - some books send one with the slip and some do not - and
 * Date.toISOString throws on an invalid date rather than returning null. It
 * threw inside the render, so one unusual leg took the whole converter down
 * instead of being reported as a leg that could not cross.
 *
 * sameSlot has always tolerated a missing kickoff: no time, no fence, match on
 * names. The fix is to let it, and to build the value once rather than once
 * per candidate event.
 *
 * Lifted from public/index.html rather than re-implemented - a copy would pin
 * my idea of the rule instead of the one that ships.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)((?:var|const|function)\\s+" + name + "\\b)", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  const isFn = /\n?(?:function)\s/.test(src.slice(i, i + 40));
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") { d++; started = true; }
    else if (c === "}" || c === "]" || c === ")") {
      d--;
      if (isFn && started && d === 0 && c === "}") return src.slice(i, k + 1);
    } else if (c === ";" && d === 0 && !isFn) return src.slice(i, k + 1);
  }
  throw new Error("could not find the end of " + name);
}

const NAMES = ["TEAM_ALIASES", "MATCH_WINDOW_MS", "normTeam", "normTeamRaw",
               "tokset", "teamMarkers", "sameVariant", "containsWords",
               "simTeams", "evStart", "sameSlot", "srOf", "feedMatch"];

/* feedMatch reads the page's FEED table; the harness supplies it. */
const build = (feed) => new Function("FEED",
  NAMES.map(grab).join("\n") +
  "\nvar NT_CACHE=Object.create(null),NT_SIZE=0;const NT_MAX=20000;" +
  "\nreturn feedMatch;")(feed);

const KO = "2026-09-25T18:45:00.000Z";
const FEED = {
  sporty: [
    { eventId: "sr:match:1", homeTeam: "Raith Rovers", awayTeam: "Livingston",
      startTime: Date.parse(KO) },
    { eventId: "sr:match:2", homeTeam: "Arbroath", awayTeam: "Queens Park",
      startTime: Date.parse("2026-09-25T18:45:00.000Z") },
  ],
};
const TO = { key: "sporty", id: "sportyId", label: "SportyBet" };
const feedMatch = build(FEED);

test("a leg with no kickoff at all is matched, not thrown on", () => {
  /* The reported crash, from the outside: the converter asks, and gets an
     answer instead of a RangeError. */
  let got;
  assert.doesNotThrow(() => {
    got = feedMatch({ home: "Raith Rovers", away: "Livingston" }, TO);
  }, "a leg without a kickoff must not take the converter down");
  assert.ok(got, "names match exactly, so it crosses");
  assert.equal(got.eventId, "sr:match:1");
});

test("a kickoff the clock cannot read is treated as no kickoff", () => {
  /* null is the trap: `new Date(null)` is not an Invalid Date, it is the
     epoch - so a leg with kickoff:null would be fenced against 1 Jan 1970 and
     match nothing at all. Absent has to mean absent. */
  for (const bad of [null, undefined, "", "not a date", NaN, {}]) {
    let got;
    assert.doesNotThrow(() => {
      got = feedMatch({ home: "Arbroath", away: "Queens Park", kickoff: bad }, TO);
    }, "threw on kickoff " + JSON.stringify(bad));
    assert.equal(got && got.eventId, "sr:match:2");
  }
});

test("a kickoff in epoch milliseconds still fences the match", () => {
  /* Some books hand the kickoff back as a number, not an ISO string. Reading
     it with Date.parse would make every one of those NaN - no fence at all,
     and the same two teams a week later would cross. */
  const ms = feedMatch(
    { home: "Raith Rovers", away: "Livingston", kickoff: Date.parse(KO) }, TO);
  assert.equal(ms && ms.eventId, "sr:match:1");

  const later = feedMatch({ home: "Raith Rovers", away: "Livingston",
    kickoff: Date.parse("2026-10-02T18:45:00.000Z") }, TO);
  assert.equal(later, null, "the fence must survive a numeric kickoff");
});

test("a real kickoff still fences the match", () => {
  const sameNight = feedMatch(
    { home: "Raith Rovers", away: "Livingston", kickoff: KO }, TO);
  assert.equal(sameNight && sameNight.eventId, "sr:match:1");

  const weekLater = feedMatch(
    { home: "Raith Rovers", away: "Livingston", kickoff: "2026-10-02T18:45:00.000Z" }, TO);
  assert.equal(weekLater, null,
    "the same two teams a week later is a different fixture");
});

test("the fence is built once, not once per candidate", () => {
  /* It sat inside the loop over every event the book lists - 1,300 of them on
     an ordinary day - building a Date and an ISO string each time. */
  const body = grab("feedMatch");
  const loop = body.slice(body.indexOf("for(var i=0"));
  assert.ok(!/new Date\([^)]*kickoff/.test(loop),
    "the kickoff is being re-parsed inside the candidate loop");
});
