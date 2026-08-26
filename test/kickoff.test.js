"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { wallTimeToUtcMs, zoneOffsetMs } = require("../lib/build.js");

/* football-data publishes kick-off times in UK local time. The build used to
   stamp a "Z" on them and call them UTC, which through British Summer Time put
   every one of its fixtures an hour late: a game that kicked off at 8 showed
   as 9 on the site. These pin the conversion, including the two days a year
   the clocks move. */

const iso = (ms) => new Date(ms).toISOString();

test("the reported bug: a BST evening fixture is an hour earlier in UTC", () => {
  // Boreham Wood v Boston Utd, listed 19:45 on 2026-08-27, feed says 18:45Z.
  assert.equal(iso(wallTimeToUtcMs(2026, 8, 27, 19, 45, "Europe/London")),
    "2026-08-27T18:45:00.000Z");
  // Barcelona v Ath Bilbao, listed 20:00, feed says 19:00Z.
  assert.equal(iso(wallTimeToUtcMs(2026, 8, 27, 20, 0, "Europe/London")),
    "2026-08-27T19:00:00.000Z");
});

test("in winter, UK time is UTC and nothing moves", () => {
  assert.equal(iso(wallTimeToUtcMs(2026, 1, 15, 19, 45, "Europe/London")),
    "2026-01-15T19:45:00.000Z");
  assert.equal(iso(wallTimeToUtcMs(2026, 12, 26, 15, 0, "Europe/London")),
    "2026-12-26T15:00:00.000Z");
});

test("the clocks going forward: 2026-03-29 at 01:00 UTC", () => {
  // 12:00 the day before the switch is still GMT.
  assert.equal(iso(wallTimeToUtcMs(2026, 3, 28, 12, 0, "Europe/London")),
    "2026-03-28T12:00:00.000Z");
  // 12:00 the day after is BST, so 11:00 UTC.
  assert.equal(iso(wallTimeToUtcMs(2026, 3, 30, 12, 0, "Europe/London")),
    "2026-03-30T11:00:00.000Z");
  // 15:00 on the switch day itself is already BST.
  assert.equal(iso(wallTimeToUtcMs(2026, 3, 29, 15, 0, "Europe/London")),
    "2026-03-29T14:00:00.000Z");
});

test("the clocks going back: 2026-10-25 at 02:00 BST", () => {
  assert.equal(iso(wallTimeToUtcMs(2026, 10, 24, 15, 0, "Europe/London")),
    "2026-10-24T14:00:00.000Z");
  assert.equal(iso(wallTimeToUtcMs(2026, 10, 26, 15, 0, "Europe/London")),
    "2026-10-26T15:00:00.000Z");
});

test("a late kick-off crosses midnight into the previous UTC day", () => {
  // 00:30 UK on the 27th of August is 23:30 UTC on the 26th.
  assert.equal(iso(wallTimeToUtcMs(2026, 8, 27, 0, 30, "Europe/London")),
    "2026-08-26T23:30:00.000Z");
});

test("midnight does not slip a day - en-GB reports hour 24", () => {
  /* formatToParts renders 00:00 as hour "24"; unguarded, Date.UTC rolls that
     into the next day and the offset comes out 24 hours wrong. */
  const t = Date.UTC(2026, 0, 15, 0, 0, 0);
  assert.equal(zoneOffsetMs(t, "Europe/London"), 0);
  assert.equal(iso(wallTimeToUtcMs(2026, 1, 15, 0, 0, "Europe/London")),
    "2026-01-15T00:00:00.000Z");
});

test("UTC offsets are read from the zone database, not assumed", () => {
  assert.equal(zoneOffsetMs(Date.UTC(2026, 7, 15, 12, 0), "Europe/London"), 3600000);
  assert.equal(zoneOffsetMs(Date.UTC(2026, 0, 15, 12, 0), "Europe/London"), 0);
  assert.equal(zoneOffsetMs(Date.UTC(2026, 7, 15, 12, 0), "UTC"), 0);
});

test("a SportyBet-style UTC time is left exactly as it is", () => {
  /* The build takes this branch for tz:"UTC" fixtures - Date.UTC directly -
     so the two paths must agree whenever the zone offset is zero. */
  assert.equal(Date.UTC(2026, 7, 27, 18, 45),
    wallTimeToUtcMs(2026, 8, 27, 18, 45, "UTC"));
});
