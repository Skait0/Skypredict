"use strict";

/**
 * "Open in football.com" on the shared slip page.
 *
 * Asked for as: "i want a open in football.com ... just for the sportybet
 * share slip. leave bet9ja as it is."
 *
 * football.com loads a SPORTYBET code and opens the same slip. A Bet9ja code
 * means nothing there, so the link is offered beside a SportyBet code and
 * nowhere else - a button that fails for half the people who press it is worse
 * than no button.
 *
 * The app's own modal has carried this for a while; the shared slip page - the
 * one a link lands on, which is where somebody who is not already a user
 * arrives - only ever offered SportyBet.
 *
 * NOT INCLUDED, deliberately: the intent:// workaround the app uses. Its
 * comment says football.com serves a 404 for /.well-known/assetlinks.json, the
 * file Android needs before an app may claim a site's https links. That could
 * not be verified from here - football.com's CDN block-pages this machine, and
 * so does SportyBet's, all with an identical 919-byte CloudFront 403 - and the
 * owner reports the plain link opening on both mobile and web. An unverifiable
 * workaround for a problem nobody can currently observe is not worth the
 * complexity, so the href is the plain web URL, which works everywhere.
 */

const test = require("node:test");
const assert = require("node:assert");
const S = require("../lib/sliplink.js");

const LEGS = [{ id: "2026-09-04|arsenal|chelsea", code: "1X", p: 0.7,
  label: "Arsenal or draw", od: 1.4 }];
const body = (opts) => S.renderBody(LEGS, null, opts);

/* --------------------------------------------------------------- who gets it */

test("a SportyBet slip offers football.com", () => {
  assert.match(body({ code: "ABC123", book: "sporty" }), /football\.com/);
});

test("a Bet9ja slip does not", () => {
  /* The code would not work there. Left exactly as it was, as asked. */
  const h = body({ code: "ABC123", book: "bet9ja" });
  assert.ok(!/football/i.test(h),
    "a Bet9ja code opens nothing on football.com; offering it would fail every time");
  assert.match(h, /Open in Bet9ja/, "and Bet9ja's own button must be untouched");
});

test("the default book is SportyBet, so a link with no book still gets it", () => {
  /* bookOf falls back to sporty, and most shared slips carry no book at all. */
  assert.match(body({ code: "ABC123" }), /football\.com/);
});

test("no code means no link", () => {
  /* The whole card is absent without a code, and a football.com URL with an
     empty shareCode is a dead end rather than a slip. */
  assert.ok(!/football/i.test(body({ book: "sporty" })));
});

test("a rejected code means no link either", () => {
  /* cleanCode refuses anything that is not 4-24 of [A-Z0-9-]. The football
     link must be built from the same cleaned value, not the raw input. */
  assert.ok(!/football/i.test(body({ code: "no", book: "sporty" })),
    "a code too short to be real must not produce a link");
  assert.ok(!/football/i.test(body({ code: "<script>", book: "sporty" })));
});

/* ------------------------------------------------------------- what it does */

test("it carries the code, url-encoded", () => {
  const h = body({ code: "AB-12", book: "sporty" });
  assert.match(h, /href="https:\/\/www\.football\.com\/ng\/m\?shareCode=AB-12"/);
});

test("and the encoding is only safe because cleanCode is strict", () => {
  /* Mutation testing found encodeURIComponent to be unreachable here: every
     code has already been through cleanCode, which allows nothing that needs
     encoding, so removing the call changes no output. That makes it defensive
     rather than dead - but only while cleanCode stays strict, and nothing
     otherwise records that the two are coupled. This does.
     Loosen cleanCode and this test fails, which is the moment to check that
     every URL built from a code still encodes it. */
  for (const bad of ["A B12", "AB/12", "AB&12", "AB?12", "AB#12", "AB%12",
                     "AB+12", "AB=12", "<script>", "ABé12"]) {
    assert.strictEqual(S.cleanCode(bad), null,
      JSON.stringify(bad) + " reached the URL builder; it would need encoding");
  }
  /* And what it does allow needs none of it. */
  assert.strictEqual(S.cleanCode("ab-12"), "AB-12", "uppercased, and nothing else");
  assert.strictEqual(encodeURIComponent("AB-12"), "AB-12");
});

test("it opens away from the page, safely", () => {
  const h = body({ code: "ABC123", book: "sporty" });
  const a = /<a class="fb"[\s\S]*?>/.exec(h);
  assert.ok(a, "the link must exist");
  assert.match(a[0], /target="_blank"/, "a slip page should survive the trip");
  assert.match(a[0], /rel="noopener nofollow"/,
    "noopener so the opened tab cannot reach this one, nofollow because it is "
    + "an outbound commercial link on 1,120 indexed pages");
});

test("the href is a plain https url", () => {
  /* No intent:// - see the note at the top of this file. Anything device
     specific rendered by a server that cannot see the device is a guess. */
  const h = body({ code: "ABC123", book: "sporty" });
  assert.ok(!/intent:\/\//.test(h), "no unverifiable scheme in server-rendered markup");
});

/* --------------------------------------------------------------- how it looks */

test("it is not a third equal button", () => {
  /* Copy and Open are the pair people came for. This sits on its own row,
     sized to its text, in football.com's own purple with their lime on the dot
     - the same pair the app uses, so somebody who has seen one recognises the
     other. */
  const css = S.renderPage ? String(S.renderPage) : "";
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "sliplink.js"), "utf8");
  assert.match(src, /\.also \.fb\{display:inline-block/,
    "sized to its text, not stretched across the row");
  assert.ok(!/\.also \.fb\{[^}]*flex:1/.test(src),
    "flex:1 would make it a third of the choice");
  assert.match(src, /background:#282450/, "football.com's own purple");
  assert.match(src, /\.also \.fb span\{color:#9FF611/, "and their lime on the dot");
});

test("the dot is marked up, not typed into the label", () => {
  /* The lime dot only works if it is its own element. A literal "football.com"
     would render flat and lose the brand cue. */
  assert.match(body({ code: "ABC123", book: "sporty" }),
    /Open in football<span>\.<\/span>com/);
});
