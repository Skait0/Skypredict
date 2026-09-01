"use strict";

/**
 * A match that is still being played must not settle somebody's slip.
 *
 * Reported 1 Sep 2026: "in myslips it marks fk rostovs v CSKA moscow as lost
 * when the game is not yet finished". Our own live feed had it at the time as
 *
 *     {"home":"FK Rostov","homeScore":1,"away":"CSKA Moscow","awayScore":0,
 *      "league":"Russia Russian Cup","minute":84,"status":"H2"}
 *
 * Second half, 84 minutes, 1-0. A leg on over 1.5, both to score, the draw or
 * the away side all grade as a loss against 1-0 - and a late goal would have
 * changed every one of them.
 *
 * How a live match came to be graded at all: the feed has no full time, it
 * simply drops a match when it ends, so fixtureState infers full time from
 * "watched past the 80th minute and not in the feed now". Nothing else was
 * required. One poll where the feed hiccuped, or where liveMatchFor failed to
 * pair the names, was indistinguishable from the match ending - and from the
 * 80th minute onwards that condition was armed on every poll.
 *
 * Then it sets like concrete: settleSlips skips any leg already marked win or
 * lose, and one lost leg settles the whole accumulator. So a single dropped
 * poll became a permanent wrong verdict on a ticket.
 *
 * Two defences, and the second is the one that matters:
 *   1. the inference now needs several consecutive absences AND enough elapsed
 *      time for 90 minutes plus half-time to have actually passed
 *   2. an inferred full time is refused for GRADING outright. It may paint the
 *      board; it may not settle a slip. Waiting for the next build costs
 *      minutes, being wrong costs the slip.
 *
 * This is the same family as the Bayern Munich case already noted in
 * index.html: frozen at 1-0 with an over 1.5 tip marked a miss, final 5-1.
 * That was repaired as stored data; the inference that produced it was not
 * changed until now.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function constOf(name) {
  const m = new RegExp("const " + name + "\\s*=\\s*([^;]+);").exec(src);
  assert.ok(m, "constant not found: " + name);
  return m[1];
}

const MIN = 60 * 1000;

/* ------------------------------------------------------- ftInferable */

function inferable(opts) {
  const LIVE_MISS = opts.miss === undefined ? {} : { id1: opts.miss };
  const fn = new Function("LIVE_MISS", "kickMs", "FT_MIN_MISSES", "FT_MIN_ELAPSED_MS",
    grab("ftInferable") + "\nreturn ftInferable;")(
    LIVE_MISS, () => opts.kickoff, eval(constOf("FT_MIN_MISSES")), eval(constOf("FT_MIN_ELAPSED_MS")));
  return fn({}, "id1");
}

test("the reported case: 84 minutes in, it is not full time", () => {
  /* 84 minutes played is about 99 minutes since kick-off once half-time is
     counted. Even with the feed missing it, that is not over. */
  assert.strictEqual(inferable({ miss: 10, kickoff: Date.now() - 99 * MIN }), false);
});

test("one missed poll is never enough, however long ago kick-off was", () => {
  assert.strictEqual(inferable({ miss: 1, kickoff: Date.now() - 5 * 3600 * 1000 }), false);
});

test("several absences and a finished clock together do infer full time", () => {
  assert.strictEqual(inferable({ miss: 3, kickoff: Date.now() - 130 * MIN }), true);
});

test("absences alone do not, if the match cannot have finished yet", () => {
  assert.strictEqual(inferable({ miss: 9, kickoff: Date.now() - 50 * MIN }), false);
});

test("a fixture with no kick-off time is never inferred finished", () => {
  assert.strictEqual(inferable({ miss: 9, kickoff: null }), false);
});

/* --------------------------------------------------- finalScoreFor */

function scorer(opts) {
  return new Function("DATA", "fixtureById", "fixtureState", "normTeam",
    grab("finalScoreFor") + "\nreturn finalScoreFor;")(
    { results: opts.results || [] },
    () => opts.fixture || null,
    () => opts.state || null,
    (s) => String(s || "").toLowerCase().trim());
}

test("an INFERRED full time never settles a leg", () => {
  /* The whole point. The board may paint it; the slip may not be settled on
     it. */
  const got = scorer({
    fixture: { home: "FK Rostov", away: "CSKA Moscow" },
    state: { kind: "ft", inferred: true, hg: 1, ag: 0 },
  })({ home: "FK Rostov", away: "CSKA Moscow", date: "2026-09-01" });
  assert.strictEqual(got, null, "a guess drawn from an absence is not a result");
});

test("a stated full time still settles a leg", () => {
  const got = scorer({
    fixture: { home: "FK Rostov", away: "CSKA Moscow" },
    state: { kind: "ft", hg: 2, ag: 1 },
  })({ home: "FK Rostov", away: "CSKA Moscow", date: "2026-09-01" });
  assert.deepStrictEqual(got, { hg: 2, ag: 1 });
});

test("a match still in play settles nothing", () => {
  const got = scorer({
    fixture: { home: "FK Rostov", away: "CSKA Moscow" },
    state: { kind: "live", hg: 1, ag: 0 },
  })({ home: "FK Rostov", away: "CSKA Moscow", date: "2026-09-01" });
  assert.strictEqual(got, null);
});

test("the results feed still wins over everything", () => {
  /* A row somebody stands behind outranks any live inference. */
  const got = scorer({
    results: [{ date: "2026-09-01", home: "FK Rostov", away: "CSKA Moscow", hg: 3, ag: 3 }],
    fixture: { home: "FK Rostov", away: "CSKA Moscow" },
    state: { kind: "ft", inferred: true, hg: 1, ag: 0 },
  })({ home: "FK Rostov", away: "CSKA Moscow", date: "2026-09-01" });
  assert.deepStrictEqual(got, { hg: 3, ag: 3 });
});

/* ------------------------------------------------- the miss counter */

function counter(seen) {
  const LIVE_MISS = {}, SEEN_LIVE = seen || {}, LIVE_LAST = {};
  const state = { found: null };
  const fn = new Function("LIVE", "DATA", "liveMatchFor", "fid", "SEEN_LIVE",
    "LIVE_LAST", "LIVE_MISS", "saveLiveLast", "state",
    grab("noteLiveSeen") + "\nreturn noteLiveSeen;")(
    { matches: [] }, { fixtures: [{ date: "d", home: "h", away: "a" }] },
    () => state.found, () => "id1", SEEN_LIVE, LIVE_LAST, LIVE_MISS,
    () => {}, state);
  return { run: fn, LIVE_MISS, LIVE_LAST, SEEN_LIVE, state };
}

test("consecutive absences accumulate, and a sighting clears them", () => {
  const c = counter({ id1: 1 });
  c.state.found = null;
  c.run(); c.run(); c.run();
  assert.strictEqual(c.LIVE_MISS.id1, 3, "three polls with the match gone");
  c.state.found = { homeScore: 1, awayScore: 0, minute: 84 };
  c.run();
  assert.strictEqual(c.LIVE_MISS.id1, 0, "one sighting means it never went away");
});

test("a match never seen in play is not counted as missing", () => {
  /* Otherwise every unplayed fixture on the board racks up absences all day
     and arrives at kick-off already looking finished. */
  const c = counter({});
  c.state.found = null;
  c.run(); c.run(); c.run();
  assert.strictEqual(c.LIVE_MISS.id1, undefined);
});

/* ------------------------------------------------------- the source */

test("the inferred flag is set where the guess is made, and nowhere else", () => {
  assert.match(src, /return \{kind:"ft",inferred:true,hg:last\.hg/,
    "the LIVE_LAST branch must mark itself as a guess");
  assert.strictEqual((src.match(/inferred:true/g) || []).length, 1,
    "only the absence-based inference may claim to be inferred");
});

test("finalScoreFor checks the flag", () => {
  assert.match(grab("finalScoreFor"), /st\.kind==="ft"\s*&&\s*!st\.inferred/,
    "dropping this check is exactly the reported bug");
});

test("fixtureState actually asks ftInferable before calling it full time", () => {
  /* Added after a mutation slipped through. Every test above drives
     ftInferable directly or hands finalScoreFor a state built by hand, so
     deleting the call from fixtureState broke nothing and the suite stayed
     green - the guard was perfect and unreachable. Assert the call site, not
     just the callee. */
  const fn = grab("fixtureState");
  assert.match(fn, /last\.minute>=LATE_MINUTE\s*&&\s*ftInferable\(/,
    "the LIVE_LAST branch must be gated on ftInferable, or the guard is dead code");
});
