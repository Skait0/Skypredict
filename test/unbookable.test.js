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
   pre-flight. Here every pick carries its own .f, so the lookup is a stub.
   It also reads the CURRENT book - which fields hold that book's event id and
   odds - so the real table comes in with it rather than a hand-written one. */
const BOOKS = require("./books.js");
const dropUnbookable = new Function(
  "function fixtureById(){return null;}" + BOOKS.prelude("sporty") +
  grab("dropUnbookable") + "\nreturn dropUnbookable;")();

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

test("a refused leg is dropped only after the reader agrees", () => {
  /* Reported: the warning naming the unavailable game shows briefly and then
     it books anyway. It did - both paths dropped the refused legs and re-sent
     on their own, and My slip went further and deleted those legs from the
     reader's own slip before asking. A slip is somebody's choice; a bookmaker
     refusing part of it is a reason to ask, not a licence to edit. */
  const i = src.indexOf("var safe=dropUnbookable(bookable,d,B);");
  assert.ok(i > 0, "My slip's refusal branch not found");
  const branch = src.slice(i, i + 2200);
  assert.match(branch, /confirmAfterRefusal\("myBookResult"/,
    "it has to ask");
  /* Everything that changes the slip must sit INSIDE the callback, which only
     runs on confirm. */
  const goAt = branch.indexOf("confirmAfterRefusal(");
  for (const step of ["MYSLIP=MYSLIP.filter", "saveMy()", "doBookMy(safe,true,B)"]) {
    const at = branch.indexOf(step);
    assert.ok(at > goAt, step + " must not run before the reader has agreed");
  }
  assert.match(branch, /renderMySheet\(\)/,
    "and the open sheet redrawn, or the screen keeps showing the dropped leg");
});

test("the board's refusal asks too, rather than quietly re-sending", () => {
  const i = src.indexOf("var safe=dropUnbookable(picks,d,B);");
  assert.ok(i > 0, "the board's refusal branch not found");
  const branch = src.slice(i, i + 1400);
  assert.match(branch, /confirmAfterRefusal\("bookResult"/);
  assert.doesNotMatch(branch, /Retrying without unavailable markets/,
    "that note was the sound of a decision being taken for somebody");
});

test("the question names the games, and offers a way out", () => {
  const fn = src.slice(src.indexOf("function confirmAfterRefusal"),
                       src.indexOf("function confirmDropUnpriced"));
  assert.match(fn, /confirm-go/, "a way forward");
  assert.match(fn, /confirm-cancel/, "and a way out - it is a choice or it is not");
  assert.match(fn, /cf-list/, "the games are named, not counted");
  assert.match(fn, /showPrompt\(target/,
    "raised as a prompt, so the Get code button stands down while it is up");
  assert.match(fn, /B\.mark/, "and it says which bookmaker refused");
});
test("the retry does not wipe the note explaining itself", () => {
  /* Caught on production, not by the assertions above: they proved the message
     string was in the source, which is not the same as it reaching a screen.
     Both booking functions cleared their result panel on entry, and the retry
     calls straight back into them - so the note naming the dropped pick was
     erased within the same tick and the recovery looked like a stall.
     A test can tell you the words exist. Only running it tells you they show. */
  /* Scoped to the ENTRY-time clear in each booking function. The clears in the
     confirm-cancel handlers are a different thing and should stay unguarded -
     dismissing a prompt ought to empty the panel. */
  [["doBook", "bookResult"], ["doBookMy", "myBookResult"]].forEach(([fn, panel]) => {
    const body = grab(fn);
    const i = body.indexOf(`$("${panel}").innerHTML="";`);
    assert.ok(i > 0, `${fn} has no entry-time clear of ${panel}`);
    assert.match(body.slice(Math.max(0, i - 40), i), /if\(!retried\)\s*$/,
      `${fn}'s entry clear must be skipped on a retry, or it eats the note`);
  });
});
