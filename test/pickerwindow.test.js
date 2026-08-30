"use strict";

/**
 * The league picker has to say which window it is describing.
 *
 * Reported: "the league selector only has 4 leagues for today lol thats very
 * wrong, i see just pro league belgium, 1 division denmark, eredivisie
 * netherlands, premiership scotland. where as today, almost all the top flight
 * league we offer are available today!"
 *
 * The list was correct. The reporter had Early selected - left over from
 * testing the time-of-day buckets - and today's Early window really did hold
 * six fixtures across five leagues, four of which are the four named. The
 * other twenty-three leagues were playing later in the day.
 *
 * So this was not a filtering bug, it was a bug in what the picker SAID. It
 * showed a count with no window attached, and a list that is right while
 * explaining nothing is indistinguishable from one that is broken. It was
 * sharpened by the bucket fix that shipped just before: Early used to mean
 * "before 15:00", which was half the card, and now means the morning, which
 * for European football watched from Lagos is nearly empty.
 *
 * These tests pin the wording, because the wording is the fix.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the picker names its time window rather than a bare count", () => {
  const fn = /function renderLeaguePicker\(\)\{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, "renderLeaguePicker not found");
  const body = fn[0];

  /* The window phrase has to be built from the live scope and bucket, not
     hard-coded, or it will drift the moment either changes. */
  assert.match(body, /SCOPE!=="day"/, "the wide-window case must be handled");
  assert.match(body, /TOD==="all"/, "the all-day case must be handled");
  for (const phrase of ["in the morning", "in the afternoon", "in the evening"]) {
    assert.ok(body.indexOf(phrase) >= 0, "missing wording for " + phrase);
  }
  assert.match(body, /dayName\(SDAY\)/,
    "the day has to be named too - 'today' is wrong when a later day is picked");
});

test("a narrowed window tells the reader what it is hiding", () => {
  const fn = /function renderLeaguePicker\(\)\{[\s\S]*?\n\}/.exec(src)[0];
  assert.match(fn, /outside this time window/,
    "the count of games excluded by the time filter must be stated");
  assert.match(fn, /switch to All day/,
    "and the way out of it named, beside the short list it caused");
  /* Only when something is actually hidden - an all-day view must stay clean. */
  assert.match(fn, /if\(allDay>here\)/,
    "the hint must be conditional on games actually being hidden");
});

test("the hint counts games in the day, not in the filtered pool", () => {
  const fn = /function renderLeaguePicker\(\)\{[\s\S]*?\n\}/.exec(src)[0];
  /* It has to compare the whole day against the narrowed pool. Counting
     within the pool would always give zero and the hint would never show. */
  assert.match(fn, /notStarted\(f\)&&dayOff\(f\.date\)===SDAY/,
    "the day total must ignore the time filter");
  assert.match(fn, /scopeFixtures\(\)\.length/,
    "and be compared against what the filters actually left");
});

/* The numbers behind the report, from the real payload, so the premise stays
   honest if the board changes shape. */
test("a real day genuinely splits this unevenly", () => {
  let payload;
  try { payload = require("../public/predictions.json"); } catch (e) { return; }
  const fx = payload.fixtures || [];
  if (fx.length < 50) return;

  const dates = {};
  fx.forEach(f => { dates[f.date] = (dates[f.date] || 0) + 1; });
  const busiest = Object.entries(dates).sort((a, b) => b[1] - a[1])[0][0];
  const day = fx.filter(f => f.date === busiest);

  const hour = (f) => {
    const t = f.kickoff ? Date.parse(f.kickoff)
            : Date.parse(f.date + "T" + (f.time || "00:00") + ":00Z");
    return isFinite(t) ? new Date(t + 3600 * 1000).getUTCHours() : null;   // WAT
  };
  const bucket = (h) => h == null ? null
    : (h >= 5 && h < 13) ? "early" : (h >= 13 && h < 18) ? "mid" : "late";

  const counts = { early: 0, mid: 0, late: 0 };
  day.forEach(f => { const b = bucket(hour(f)); if (b) counts[b]++; });

  const leaguesIn = (b) =>
    new Set(day.filter(f => bucket(hour(f)) === b).map(f => f.league)).size;

  /* The premise of the whole fix: one bucket holding a small slice of the day
     is normal, not a fault. If this ever stops being true the wording above is
     solving a problem that no longer exists. */
  assert.ok(counts.early + counts.mid + counts.late === day.length);
  assert.ok(leaguesIn("early") < leaguesIn("mid") + leaguesIn("late"),
    "the morning is expected to be the thin window for this audience");
});
