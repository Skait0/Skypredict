"use strict";

/**
 * Shared slips.
 *
 * Two things are being defended here and they pull in opposite directions.
 *
 * A shared link has to keep working. A slip leg in the browser stores a fid()
 * hash, and on 1 Sep 2026 FK Rostov v CSKA Moscow left the board mid-match, so
 * every leg pointing at it stopped resolving. A link keyed on ids would rot the
 * same way - on somebody else's post, silently, forever. So the payload carries
 * its own teams, date, market, odds and probability, and the tests below check
 * it renders with no board at all.
 *
 * And the payload is attacker-controlled. Anyone can craft `/s?p=` and share it
 * as though this site said it, which makes it a defacement vector on our own
 * domain. So decode refuses rather than repairs, and everything rendered is
 * escaped.
 */

const test = require("node:test");
const assert = require("node:assert");
const SL = require("../lib/sliplink.js");

/* The wire delimiters, spelled out so a hand-built hostile payload can be
   written here without control characters sitting invisibly in the source. */
const FS = "\u001f", RS = "\u001e";

const LEGS = [
  { home: "Thun", away: "Lausanne", date: "2026-09-02", code: "OVER_1.5", od: 1.25, p: 0.91 },
  { home: "Orenburg", away: "Rubin Kazan", date: "2026-09-02", code: "1X", od: 1.44, p: 0.77 },
  { home: "Gent", away: "Oud-Heverlee Leuven", date: "2026-09-03", code: "GG", od: 1.74, p: 0.55 },
];

/* ------------------------------------------------------------ round trip */

test("a slip survives the round trip intact", () => {
  const got = SL.decode(SL.encode(LEGS));
  assert.strictEqual(got.ok, true);
  assert.deepStrictEqual(got.legs, LEGS);
});

test("a leg carries everything needed to render with no board", () => {
  /* The whole point. If any of these were missing the link would depend on the
     fixture still being on the board, which is exactly what failed before. */
  const l = SL.decode(SL.encode(LEGS)).legs[0];
  ["home", "away", "date", "code", "od", "p"].forEach((k) =>
    assert.ok(l[k] !== undefined && l[k] !== "", k + " must travel in the link"));
});

test("names with punctuation and accents survive", () => {
  const odd = [{ home: "M'gladbach", away: "Beşiktaş & Co", date: "2026-09-02", code: "1", od: 2.1, p: 0.45 }];
  assert.deepStrictEqual(SL.decode(SL.encode(odd)).legs[0].home, "M'gladbach");
  assert.deepStrictEqual(SL.decode(SL.encode(odd)).legs[0].away, "Beşiktaş & Co");
});

test("a delimiter cannot be smuggled into a team name", () => {
  /* The reason the separators are control characters rather than "|". A name
     carrying a delimiter would forge an extra leg if it survived encoding, so
     encode strips them on the way in. */
  const evil = [{ home: "ABC" + FS + "D" + RS + "2026-09-02", away: "B",
                  date: "2026-09-02", code: "1", od: 2, p: 0.5 }];
  const got = SL.decode(SL.encode(evil));
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.legs.length, 1, "one leg in, one leg out");
  assert.strictEqual(got.legs[0].home, "ABCD2026-09-02",
    "the delimiters are stripped, so a second leg cannot be forged");
});

/* --------------------------------------------------------- hostile input */

test("junk is refused, not rendered", () => {
  ["", null, undefined, 42, "!!!!", "Zm9v", "x".repeat(9000)].forEach((p) => {
    assert.strictEqual(SL.decode(p).ok, false, JSON.stringify(p) + " should be refused");
  });
});

test("a market we do not offer is refused", () => {
  const p = SL.encode([{ home: "A", away: "B", date: "2026-09-02", code: "CORRECT_SCORE_7_0", od: 500, p: 0.5 }]);
  const got = SL.decode(p);
  assert.strictEqual(got.ok, false);
  assert.match(got.why, /do not offer/);
});

test("impossible odds and probabilities are refused", () => {
  const mk = (od, p) => SL.encode([{ home: "A", away: "B", date: "2026-09-02", code: "1", od, p }]);
  assert.strictEqual(SL.decode(mk(1.0, 0.5)).ok, false, "odds of 1.00 win nothing");
  assert.strictEqual(SL.decode(mk(99999, 0.5)).ok, false, "odds of 99999 are invented");
  assert.strictEqual(SL.decode(mk(2, 0.999)).ok, false, "nothing is 99.9% certain");
  assert.strictEqual(SL.decode(mk(2, 0)).ok, false);
});

test("a bad date is refused", () => {
  const p = SL.encode([{ home: "A", away: "B", date: "sometime", code: "1", od: 2, p: 0.5 }]);
  assert.strictEqual(SL.decode(p).ok, false);
});

test("one bad leg refuses the whole slip", () => {
  /* Rendering the good half would put numbers on screen that nobody chose. */
  const raw = Buffer.from([
    ["Thun", "Lausanne", "2026-09-02", "OVER_1.5", "1.25", "91"].join(FS),
    ["Bad", "Leg", "2026-09-02", "NOT_A_MARKET", "1.25", "91"].join(FS),
  ].join(RS), "utf8").toString("base64url");
  assert.strictEqual(SL.decode(raw).ok, false);
});

test("a truncated leg refuses the slip rather than shortening it", () => {
  /* Added after a mutation escaped: turning the field-count check into a
     `continue` silently dropped the malformed leg and rendered the rest, and
     every test still passed because they all used a leg that was well-formed
     but wrong in its VALUES. A slip quietly missing a game is worse than one
     that will not open - the reader has no way to know a leg went missing, and
     the odds on screen would be for a slip nobody built. */
  const raw = Buffer.from([
    ["Thun", "Lausanne", "2026-09-02", "OVER_1.5", "1.25", "91"].join(FS),
    ["Gent", "Leuven", "2026-09-03"].join(FS),
  ].join(RS), "utf8").toString("base64url");
  const got = SL.decode(raw);
  assert.strictEqual(got.ok, false, "half a slip is not a slip");
});

test("a slip longer than the builders can make is refused", () => {
  const many = Array.from({ length: 41 }, (_, i) =>
    ({ home: "H" + i, away: "A" + i, date: "2026-09-02", code: "1", od: 2, p: 0.5 }));
  const raw = Buffer.from(many.map((l) =>
    [l.home, l.away, l.date, l.code, "2.00", "50"].join(FS)).join(RS),
    "utf8").toString("base64url");
  assert.strictEqual(SL.decode(raw).ok, false);
});

/* ------------------------------------------------------------- rendering */

test("a crafted team name cannot inject markup", () => {
  /* Without escaping, this link would put a script on our own domain and be
     shared as though we wrote it. The names still appear - they just appear
     as inert text, with every angle bracket and quote escaped, so no tag and
     no attribute can be formed out of them. */
  const evil = [{ home: "<script>alert(1)</script>", away: "\"><img src=x onerror=alert(1)>",
                  date: "2026-09-02", code: "1", od: 2, p: 0.5 }];
  const html = SL.renderPage(SL.decode(SL.encode(evil)).legs, null, "/s");
  assert.doesNotMatch(html, /<script>alert/, "no script tag may be formed");
  assert.doesNotMatch(html, /<img /, "no img tag either");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/,
    "it shows as text");
  assert.match(html, /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/,
    "onerror survives as characters on the page, which is harmless - what matters is that it is not an attribute");
});

test("the page states it is a reader's slip, not our tip", () => {
  const html = SL.renderPage(LEGS, null, "/s");
  assert.match(html, /not our tip/i,
    "or a shared slip reads as something we recommended");
  assert.match(html, /18\+/, "the same line every other page carries");
});

test("it shows the odds and the chance every leg lands", () => {
  const html = SL.renderPage(LEGS, null, "/s");
  const t = SL.totals(LEGS);
  assert.match(html, new RegExp(t.odds.toFixed(2)));
  assert.match(html, new RegExp((t.prob * 100).toFixed(1) + "%"),
    "the honest number, and the one nobody else shows");
});

test("the record appears when we have one and is skipped when we do not", () => {
  const withRec = SL.renderPage(LEGS, { correct: 283, total: 374, days: 21 }, "/s");
  assert.match(withRec, /283 of 374/);
  assert.match(withRec, /got wrong/, "the misses are the point");
  assert.doesNotMatch(SL.renderPage(LEGS, null, "/s"), /283 of 374/);
});

test("totals multiply, they do not add", () => {
  const t = SL.totals(LEGS);
  assert.ok(Math.abs(t.odds - 1.25 * 1.44 * 1.74) < 1e-9);
  assert.ok(Math.abs(t.prob - 0.91 * 0.77 * 0.55) < 1e-9);
});

/* --------------------------------------------------------- grading */

const RESULTS = [
  { date: "2026-09-02", home: "Thun", away: "Lausanne", hg: 2, ag: 1 },
  { date: "2026-09-02", home: "Orenburg", away: "Rubin Kazan", hg: 0, ag: 2 },
];

test("a finished leg gets a verdict from the one shared grader", () => {
  const g = SL.gradeLegs(LEGS, RESULTS);
  assert.strictEqual(g[0].won, true, "Over 1.5 on a 2-1 landed");
  assert.strictEqual(g[1].won, false, "1X on a 0-2 did not");
  assert.strictEqual(g[0].hg, 2);
  assert.strictEqual(g[0].ag, 1);
});

test("a leg with no result is unknown, not a loss", () => {
  /* The distinction this whole page depends on. Marking an unplayed game as
     lost is the bug that hit a reader's slip on 1 Sep, from the other side. */
  const g = SL.gradeLegs(LEGS, RESULTS);
  assert.strictEqual(g[2].won, null, "Gent had no result, so it is unknown");
  assert.notStrictEqual(g[2].won, false);
});

test("a market a final score cannot settle stays unknown", () => {
  /* Team totals have no case in lib/grade.js, and adding one here would be a
     second grader by the back door - which is how two graders once disagreed
     and wrote wrong rows into the record. */
  const legs = [{ home: "Thun", away: "Lausanne", date: "2026-09-02",
                  code: "HOME_OVER_1.5", od: 2.2, p: 0.45 }];
  assert.strictEqual(SL.gradeLegs(legs, RESULTS)[0].won, null);
  const fh = [{ home: "Thun", away: "Lausanne", date: "2026-09-02",
                code: "FH_OVER_0.5", od: 1.36, p: 0.7 }];
  assert.strictEqual(SL.gradeLegs(fh, RESULTS)[0].won, null,
    "a first-half market cannot be read off a full-time score");
});

test("one lost leg sinks the slip, and an unknown leg leaves it open", () => {
  const g = SL.gradeLegs(LEGS, RESULTS);
  const v = SL.verdict(g);
  assert.strictEqual(v.slipLost, true, "the 1X missed");
  assert.strictEqual(v.slipWon, false);
  assert.strictEqual(v.settled, false, "a leg is still unknown");

  const allWon = SL.verdict([{ won: true }, { won: true }]);
  assert.strictEqual(allWon.slipWon, true);
  assert.strictEqual(allWon.settled, true);

  const oneOpen = SL.verdict([{ won: true }, { won: null }]);
  assert.strictEqual(oneOpen.slipWon, false, "not won until every leg is in");
  assert.strictEqual(oneOpen.slipLost, false, "and not lost either");
});

test("the page shows verdicts and scores, and never calls an unknown a loss", () => {
  const html = SL.renderPage(SL.gradeLegs(LEGS, RESULTS), null, "/s");
  assert.match(html, /2 - 1/, "the score of a finished leg");
  assert.match(html, /sl-w">won/, "a landed leg is marked");
  assert.match(html, /sl-l">lost/, "and a missed one");
  /* Three legs, one of them unknown, so exactly two badges. */
  assert.strictEqual((html.match(/sl-leg .*?>(won|lost)/g) || []).length, 0,
    "sanity: badges are inside the pick line, not the leg element");
  assert.strictEqual((html.match(/>won</g) || []).length, 1);
  assert.strictEqual((html.match(/>lost</g) || []).length, 1);
});

test("an ungraded slip renders exactly as before", () => {
  const plain = SL.renderPage(LEGS, null, "/s");
  assert.doesNotMatch(plain, />won</);
  assert.doesNotMatch(plain, />lost</);
  /* Match the rendered element, not the stylesheet - `.sl-verdict{...}` is in
     the CSS on every page whether or not a verdict is shown. */
  assert.doesNotMatch(plain, /<p class="sl-verdict/);
});

test("grading survives junk in the results feed", () => {
  const junk = [null, {}, { date: "2026-09-02", home: "Thun", away: "Lausanne" }];
  assert.doesNotThrow(() => SL.gradeLegs(LEGS, junk));
  assert.strictEqual(SL.gradeLegs(LEGS, junk)[0].won, null, "a row with no score settles nothing");
  assert.doesNotThrow(() => SL.gradeLegs(LEGS, null));
});

/* ------------------------------------- the two encoders must not drift */

/* index.html is standalone and cannot import from lib/, so the encoder exists
   twice: once in the browser to build the link, once here to read it. Two
   copies of one wire format is exactly the shape that rots quietly - a
   separator changed on one side and every shared link ever posted stops
   opening. So the browser's encoder is lifted out of index.html by name and
   round-tripped through the real decoder. */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = SRC.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = SRC.indexOf("{", i);
  for (; k < SRC.length; k++) { if (SRC[k] === "{") d++; else if (SRC[k] === "}") { d--; if (!d) break; } }
  return SRC.slice(i, k + 1);
}

const clientPayload = new Function("fixtureById", "legOdd", "SLIP_FS", "SLIP_RS",
  grab("slipName") + "\n" + grab("slipPayload") + "\nreturn slipPayload;")(
  () => null, (f, code, p) => (f.sportyOdds && f.sportyOdds[code]) || 2, FS, RS);

test("what the browser encodes, the server decodes", () => {
  const picks = LEGS.map((l) => ({
    f: { home: l.home, away: l.away, date: l.date, sportyOdds: { [l.code]: l.od } },
    code: l.code, p: l.p,
  }));
  const got = SL.decode(Buffer.from(clientPayload(picks), "utf8").toString("base64url"));
  assert.strictEqual(got.ok, true, "the browser built something the server refuses");
  assert.deepStrictEqual(got.legs, LEGS, "and it must be the same slip, field for field");
});

test("the two copies of the separators agree", () => {
  /* Read them out of index.html rather than trusting the round trip above,
     which would still pass if BOTH sides changed to the same wrong thing. */
  const m = /const SLIP_FS="([^"]*)", SLIP_RS="([^"]*)";/.exec(SRC);
  assert.ok(m, "the browser's separators were not found in index.html");
  assert.strictEqual(JSON.parse('"' + m[1] + '"'), FS);
  assert.strictEqual(JSON.parse('"' + m[2] + '"'), RS);
});

test("the browser strips delimiters before they reach the wire", () => {
  /* Added after a mutation escaped. Team names come from feeds we do not
     control, so a name carrying a separator is not only an attack - it is a
     bad row in somebody's data. Unstripped, it would forge an extra leg inside
     the reader's own link, and the tests above never noticed because none of
     them put a delimiter in a name on the browser side. */
  const picks = [{
    f: { home: "Thun" + FS + "Forged" + RS + "2026-09-02", away: "Lausanne",
         date: "2026-09-02", sportyOdds: { "1X": 1.44 } },
    code: "1X", p: 0.77,
  }];
  const got = SL.decode(Buffer.from(clientPayload(picks), "utf8").toString("base64url"));
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.legs.length, 1, "one game in, one game out - nothing forged");
  assert.strictEqual(got.legs[0].home, "ThunForged2026-09-02");
});

test("a leg whose fixture has gone is dropped, not encoded as junk", () => {
  /* My slip legs carry only an id, and the fixture behind one can leave the
     board. Encoding it anyway would produce a link the server refuses, so the
     reader would get nothing at all instead of the rest of their slip. */
  const picks = [
    { id: "gone", code: "1X", p: 0.7 },
    { f: { home: "Thun", away: "Lausanne", date: "2026-09-02", sportyOdds: { "1X": 1.44 } },
      code: "1X", p: 0.77 },
  ];
  const got = SL.decode(Buffer.from(clientPayload(picks), "utf8").toString("base64url"));
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.legs.length, 1, "the resolvable leg still travels");
  assert.strictEqual(got.legs[0].home, "Thun");
});

test("the error page offers a way forward and does not leak the payload", () => {
  const html = SL.renderError("that link is damaged");
  assert.match(html, /Build a slip/);
  assert.doesNotMatch(html, /undefined|NaN/);
});
