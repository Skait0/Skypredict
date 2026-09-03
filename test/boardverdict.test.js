"use strict";

/**
 * What the board is allowed to say about a match that has been played.
 *
 * Reported 3 Sep 2026: a game that finished 0-0 carried a "Hit" pill. The badge
 * asked fixtureState, which reaches a full-time verdict three ways - the graded
 * results feed, the live feed saying FT, and an inference drawn from a match
 * going absent from the feed after the 80th minute. Only the first is a score
 * anybody stands behind. finalScoreFor already refuses the third for settling a
 * slip, on the grounds that a guess from an absence must not decide somebody's
 * ticket; the board printed it as a verdict anyway.
 *
 * The rule now: while a day is still running the board offers no verdict at
 * all, only the countdown. Once the day is behind us the backend has graded it
 * and the whole day appears together. Silent or right, nothing in between.
 *
 * These drive statusBadge itself rather than the helpers under it. The harness
 * deliberately defines NO live-feed machinery - no fixtureState, no LIVE, no
 * LIVE_LAST - so if the badge ever reaches for one again these throw
 * ReferenceError instead of quietly going green.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function konst(name) {
  const m = new RegExp(String.raw`(?:^|\n)(?:const|var|let)\s+` + name + String.raw`\s*=\s*([^;]+);`).exec(src);
  if (!m) throw new Error("constant not found: " + name);
  return "const " + name + "=" + m[1].trim() + ";";
}

const FNS = ["dayOff", "kickMs", "kickCountdown", "normTeam", "normTeamRaw",
  "tipEval", "potdResult", "statusBadge"];

function board(results) {
  return new Function("DATA", [
    "var NT_CACHE={},NT_SIZE=0,NT_MAX=5000;",
    konst("SOON_MS"),
    /* normTeamRaw folds the alias table in, so the real one comes along. A
       stub here would let a spelling the site actually pairs go untested. */
    (/^var TEAM_ALIASES\s*=\s*\{[\s\S]*?^\};/m.exec(src) || [""])[0],
  ].concat(FNS.map(grab)).join("\n") +
    "\nreturn {statusBadge:statusBadge, dayOff:dayOff};")({ results: results || [] });
}

/* An ISO day N days from today, built the way dayOff reads it: the fixture's
   date string against the local calendar day. */
function isoDay(off) {
  const d = new Date(); d.setDate(d.getDate() + off);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* A fixture shaped like the payload's, tipped on something gradeable. */
function fx(off, extra) {
  return Object.assign({
    id: "f1", date: isoDay(off), home: "Udinese", away: "Venezia",
    tip: "1X, home or draw",
  }, extra || {});
}
function graded(off, hg, ag, hit) {
  return [{ date: isoDay(off), home: "Udinese", away: "Venezia",
            hg: hg, ag: ag, tip: "1X, home or draw", hit: hit, recorded: true }];
}

/* ------------------------------------------------ while the day is running */

test("a match on today's board shows no verdict, however it finished", () => {
  /* The reported bug, in the state that produced it: the match is over and the
     backend even agrees it was a hit. The board still says nothing today. */
  const b = board(graded(0, 2, 1, true));
  const out = b.statusBadge(fx(0, { kickoff: new Date(Date.now() - 3 * 3600e3).toISOString() }));
  assert.ok(!/Hit|Miss|Void/.test(out), "today must carry no verdict, got: " + out);
});

test("nor does it leak the score on its own", () => {
  const b = board(graded(0, 2, 1, true));
  const out = b.statusBadge(fx(0, { kickoff: new Date(Date.now() - 3 * 3600e3).toISOString() }));
  assert.ok(!/2-1/.test(out), "today must carry no score, got: " + out);
});

test("a 0-0 the backend graded as a miss is still silent today", () => {
  /* The exact shape reported: 0-0, and whatever anything else believed, the
     board does not get to call it. */
  const b = board(graded(0, 0, 0, false));
  const out = b.statusBadge(fx(0, { kickoff: new Date(Date.now() - 3 * 3600e3).toISOString() }));
  assert.strictEqual(out, "", "a played match on today's board says nothing");
});

test("a fixture still to come keeps its countdown", () => {
  const b = board([]);
  const out = b.statusBadge(fx(0, { kickoff: new Date(Date.now() + 40 * 60e3).toISOString() }));
  assert.match(out, /fx-soon/, "the countdown is the one thing today may say");
  assert.match(out, /40m/);
});

/* -------------------------------------------------- once the day is behind */

test("yesterday's board shows the verdict the backend graded", () => {
  const b = board(graded(-1, 2, 1, true));
  const out = b.statusBadge(fx(-1));
  assert.match(out, /2-1/, "the score the backend recorded");
  assert.match(out, /Hit/);
  assert.match(out, /fx-hit/);
});

test("and a miss is shown as a miss", () => {
  const b = board(graded(-1, 0, 1, false));
  const out = b.statusBadge(fx(-1));
  assert.match(out, /0-1/);
  assert.match(out, /Miss/);
  assert.match(out, /fx-miss/);
});

test("a score baked into the payload counts as graded too", () => {
  /* potdResult's second path: the build wrote the full-time score onto the
     fixture. That is still the server's answer, not the client's guess. */
  const b = board([]);
  const out = b.statusBadge(fx(-1, { hg: 3, ag: 0 }));
  assert.match(out, /3-0/);
  assert.match(out, /Hit/, "1X against 3-0 is a hit");
});

test("a match the backend has not graded shows nothing rather than a guess", () => {
  /* The day is over and the results feed has no row for it. Waiting is the
     answer; inventing one is what this whole change removes. */
  const b = board([]);
  const out = b.statusBadge(fx(-1));
  assert.strictEqual(out, "", "ungraded means silent, got: " + out);
});

test("an ungradeable tip is left alone rather than called a miss", () => {
  /* A first-half tip cannot be settled from a full-time score. potdResult
     returns null for it, and null must not render as "Miss". */
  const b = board([]);
  const out = b.statusBadge(fx(-1, { hg: 1, ag: 1, tip: "First half goal" }));
  assert.strictEqual(out, "", "unknown is not a verdict, got: " + out);
});

/* ------------------------------------------------------------ the guardrail */

test("the badge reaches for no live-feed machinery at all", () => {
  /* This is the assertion that keeps the fix honest. The harness defines no
     fixtureState, no LIVE, no LIVE_LAST, no SEEN_LIVE. Every test above runs
     inside it, so reintroducing any of them to this path throws ReferenceError
     rather than quietly restoring the guess. Asserted here in its own right so
     the reason is written down where it fails. */
  const b = board(graded(-1, 2, 1, true));
  assert.doesNotThrow(() => b.statusBadge(fx(-1)));
  assert.doesNotThrow(() => b.statusBadge(fx(0, { kickoff: new Date().toISOString() })));
  assert.doesNotThrow(() => b.statusBadge(fx(1, { kickoff: new Date(Date.now() + 26 * 3600e3).toISOString() })));
});
