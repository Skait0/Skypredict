"use strict";
/**
 * THE SPORTSEVENT SCHEMA, AS GOOGLE ACTUALLY GRADES IT.
 *
 * Search Console, 7 Sep 2026: Events 5 invalid, 0 valid.
 *
 *   INVALID   missing "location"    5 items
 *             missing "startDate"   1 item
 *   WARNING   missing "endDate"     5
 *             missing "offers"      5
 *
 * Every event item on the site was failing, so none of the match pages could
 * produce a rich result.
 *
 * WHY location WAS MISSING, AND WHY THAT WAS DEFENSIBLE. The comment above
 * jsonLd() said: "No venue, because we do not have one, and an invented one
 * would be worse than its absence." That is right about inventing a stadium.
 * It is not the only option: a home fixture IS played at the home club's
 * ground, so naming the club as the Place states a fact we already publish
 * rather than guessing at a stadium we do not know.
 *
 * offers STAYS MISSING, deliberately. The site sells no tickets, and inventing
 * an offer to silence a warning is exactly the fabrication that comment was
 * guarding against. A warning is not an error.
 */
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

/* The JSON-LD as the page emits it, with the escaping undone so it can be
   parsed - jsonLd() escapes < > & to keep the block inert to the tokeniser. */
function ld(fixture) {
  const raw = P.renderMatchPage(fixture, null);
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(raw);
  assert.ok(m, "no JSON-LD block on the match page");
  const json = m[1]
    .replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
  return JSON.parse(json);
}

const FIXTURE = {
  date: "2026-09-08", home: "Midtjylland", away: "Nordsjaelland",
  league: "Denmark Superliga", kickoff: "2026-09-08T16:00:00.000Z",
  tip: "Over 1.5", tip_p: 0.84, home_p: 0.5, draw_p: 0.23, away_p: 0.27,
  lh: 1.95, la: 1.36, total: 3.31, score: "3-2",
  form_home: [], form_away: [],
};

test("the event has a location, named as the home club's ground", () => {
  const o = ld(FIXTURE);
  assert.ok(o.location, "Google treats location as required; without it every item is invalid");
  assert.equal(o.location["@type"], "Place");
  assert.equal(o.location.name, "Midtjylland",
    "the home side, because that is whose ground a home fixture is played at");
});

test("the location names no stadium we do not know", () => {
  /* The original objection, kept as a test: we may state where we know the
     match is played, never invent what the ground is called. */
  const s = JSON.stringify(ld(FIXTURE));
  assert.ok(!/stadium|arena|park|field/i.test(s),
    "no invented venue may appear: " + s.slice(0, 200));
});

test("a fixture with a kickoff keeps its exact start time", () => {
  assert.equal(ld(FIXTURE).startDate, "2026-09-08T16:00:00.000Z");
});

test("a fixture with no kickoff still has a startDate", () => {
  /* The one invalid item. A date alone is valid ISO 8601 and valid to Google;
     emitting nothing is what made the item unusable. */
  const noKick = Object.assign({}, FIXTURE);
  delete noKick.kickoff;
  assert.equal(ld(noKick).startDate, "2026-09-08");
});

test("the event ends when a football match ends", () => {
  /* 105 minutes: ninety plus the interval and stoppage. A warning rather than
     an error, but it is knowable, so there is no reason to leave it out. */
  const o = ld(FIXTURE);
  assert.ok(o.endDate, "no endDate");
  const mins = (Date.parse(o.endDate) - Date.parse(o.startDate)) / 60000;
  assert.equal(mins, 105, "got " + mins + " minutes");
});

test("no endDate is claimed when the start is only a date", () => {
  /* Adding 105 minutes to a date with no time would invent a kickoff. */
  const noKick = Object.assign({}, FIXTURE);
  delete noKick.kickoff;
  assert.equal(ld(noKick).endDate, undefined);
});

test("offers are still absent, and that is the decision", () => {
  assert.equal(ld(FIXTURE).offers, undefined,
    "the site sells no tickets; a fabricated offer would be worse than a warning");
});

test("the teams and the competition survive the change", () => {
  const o = ld(FIXTURE);
  assert.equal(o["@type"], "SportsEvent");
  assert.equal(o.name, "Midtjylland vs Nordsjaelland");
  assert.equal(o.competitor.length, 2);
  assert.equal(o.superEvent.name, "Denmark Superliga");
});

test("the block is still inert to the HTML tokeniser", () => {
  /* A club named with a closing script tag must not be able to break out. */
  const evil = Object.assign({}, FIXTURE, { home: "A</script><script>x" });
  const raw = P.renderMatchPage(evil, null);
  assert.ok(!/<\/script><script>x/.test(raw), "the escaping regressed");
});
