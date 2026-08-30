"use strict";

/**
 * Dropping the legs SportyBet actually refused.
 *
 * Both Get code buttons carried a retry described as "without unavailable
 * markets". It could never fire.
 *
 * The retry rebuilt its shortlist by filtering on our own copy of sportyOdds -
 * the very numbers the booking pre-flight had just cleared. So `safe` always
 * came back equal to the list we had sent, the `safe.length < picks.length`
 * guard was never true, and the reader got "SportyBet wouldn't take this slip"
 * with every leg still on it. A rescue path that re-asks the source that was
 * wrong cannot rescue anything.
 *
 * The disagreement is about time, not markets. The client reads odds once at
 * page load; the server's fixtures cache refreshes every 45 minutes
 * (_FIXTURES_TTL). Leave a slip open across a refresh that thins a market and
 * our copy still shows a price the server no longer has.
 *
 * Sentry issue 143544980 is this happening: 22 events over two days, and the
 * one from a phone reads
 *
 *     bad_legs=3 markets=OVER_1.5 total_legs=31
 *
 * - 31 legs sent, 3 refused, all the same market, whole ticket lost.
 *
 * The server names them. `/api/generate-booking-code` returns an `unbookable`
 * list of {eventId, prediction} precisely so the caller can drop those and
 * retry, and the client never read the field. These tests pin that it does.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* dropUnbookable resolves fixtures through c.f or fixtureById, same as the
   pre-flight. Here every pick carries its own .f, so the lookup is a stub. */
const dropUnbookable = new Function(
  "function fixtureById(){return null;}" + grab("dropUnbookable") +
  "\nreturn dropUnbookable;")();

function leg(ev, code, odd) {
  return { id: "id" + ev, eventId: ev, code: code,
           f: { home: "H" + ev, away: "A" + ev, sportyOdds: { [code]: odd } } };
}

test("the legs the server named are the legs that go", () => {
  const picks = [leg("e1", "OVER_1.5", 1.2), leg("e2", "1X", 1.3), leg("e3", "OVER_1.5", 1.4)];
  const kept = dropUnbookable(picks, { unbookable: [
    { eventId: "e1", prediction: "OVER_1.5" },
    { eventId: "e3", prediction: "OVER_1.5" }] });
  assert.deepStrictEqual(kept.map(c => c.eventId), ["e2"]);
});

test("this is the case the old filter could not see", () => {
  /* Every leg here has a real local odd - which is why the pre-flight passed
     them - and the server still refused two. The old code filtered on those
     same odds, kept all three, and gave up. */
  const picks = [leg("e1", "OVER_1.5", 1.2), leg("e2", "1X", 1.3), leg("e3", "OVER_1.5", 1.4)];
  const oldFilter = picks.filter(c => {
    const o = c.f && c.f.sportyOdds && c.f.sportyOdds[c.code];
    return o && o > 1.01;
  });
  assert.strictEqual(oldFilter.length, picks.length,
    "the old filter drops nothing here, so its retry guard never fired");
  const kept = dropUnbookable(picks, { unbookable: [
    { eventId: "e1", prediction: "OVER_1.5" },
    { eventId: "e3", prediction: "OVER_1.5" }] });
  assert.ok(kept.length < picks.length, "the new one does, so the retry can run");
});

test("a market is matched per event, not across the slip", () => {
  /* e1's OVER_1.5 being refused says nothing about e3's. Keying on the market
     alone would drop legs SportyBet is perfectly happy to take. */
  const picks = [leg("e1", "OVER_1.5", 1.2), leg("e3", "OVER_1.5", 1.4)];
  const kept = dropUnbookable(picks, {
    unbookable: [{ eventId: "e1", prediction: "OVER_1.5" }] });
  assert.deepStrictEqual(kept.map(c => c.eventId), ["e3"]);
});

test("the price we were wrong about is forgotten", () => {
  /* Otherwise the board goes on advertising an odd that cannot be booked, and
     the next tap fails exactly the same way. */
  const picks = [leg("e1", "OVER_1.5", 1.2), leg("e2", "1X", 1.3)];
  dropUnbookable(picks, { unbookable: [{ eventId: "e1", prediction: "OVER_1.5" }] });
  assert.strictEqual(picks[0].f.sportyOdds["OVER_1.5"], undefined,
    "the refused market's odd must be cleared");
  assert.strictEqual(picks[1].f.sportyOdds["1X"], 1.3,
    "and nothing else touched");
});

test("with no list from the server it falls back to our own odds", () => {
  /* An older server build, or a network error shaped like a rejection. Better
     than nothing, and it is what the code did before. */
  const picks = [leg("e1", "OVER_1.5", 1.2), leg("e2", "1X", 1.0)];
  assert.deepStrictEqual(dropUnbookable(picks, {}).map(c => c.eventId), ["e1"]);
  assert.deepStrictEqual(dropUnbookable(picks, null).map(c => c.eventId), ["e1"]);
});

test("an empty list is not treated as 'drop everything'", () => {
  const picks = [leg("e1", "1X", 1.3)];
  assert.strictEqual(dropUnbookable(picks, { unbookable: [] }).length, 1);
});

/* ------------------------------------------------------- the call sites */

test("both retries ask the server, not our stale copy", () => {
  const calls = src.match(/safe\s*=\s*dropUnbookable\(/g) || [];
  assert.strictEqual(calls.length, 2,
    "the board's Get code and My slip's must both use it");
  assert.doesNotMatch(src, /safe\s*=\s*picks\.filter\(/,
    "the board's dead local filter should be gone");
  assert.doesNotMatch(src, /safe\s*=\s*bookable\.filter\(/,
    "and My slip's too");
});

test("a partly-booked slip is filed as what was booked", () => {
  /* MYSLIP still holds every leg after a retry drops some. Saving all of them
     would file a ticket claiming games the code does not contain, and grade
     those legs against a bet nobody holds. Only now that the retry actually
     fires does this become reachable. */
  assert.doesNotMatch(src, /var _legs=MYSLIP\.slice\(\)/,
    "the whole slip is no longer what gets remembered");
  assert.match(src, /_legs=MYSLIP\.filter\(function\(x\)\{return _sent\[/,
    "it must be narrowed to the legs actually sent");
});
