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
 * THE ANDROID INTENT, WHICH I REMOVED AND HAD TO PUT BACK. Worth the space,
 * because the reasoning that removed it looked sound.
 *
 * The app's modal upgrades this link to an intent:// URL on Android, because
 * football.com serves no /.well-known/assetlinks.json - the file Android needs
 * before an app may claim a site's https links. I could not confirm that from
 * the build machine: football.com block-pages it with a CloudFront 403, and so
 * does SportyBet, both with the same 919-byte body, while example.com answers
 * fine. So the claim was unverifiable, and the owner reported the link opening
 * the app on his phone. I took the workaround out as unnecessary.
 *
 * It was necessary. He had been tapping the modal, which already used
 * intent://. A reader tapping a SHARED slip, which carried only the plain URL,
 * landed on the website. Two different links, not two different phones - and
 * "it works for me" is the weakest evidence there is when the two paths are
 * not the same code.
 *
 * So the plain URL ships in the markup, where iPhone, desktop and no-JS all
 * need it, and Android is upgraded on top by the page's own script.
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

test("the markup ships the plain url, not a device guess", () => {
  /* The server cannot see the device, so what it renders must work on all of
     them. iPhone and desktop get this href and nothing else. */
  const h = body({ code: "ABC123", book: "sporty" });
  assert.ok(!/intent:\/\//.test(h),
    "the rendered body must not contain an Android-only scheme");
  assert.match(h, /href="https:\/\/www\.football\.com\//);
});

test("and Android is upgraded by the page script", () => {
  /* The half that had to come back. Without this the shared slip opens the
     website on Android while the app's own modal opens the app - which is
     exactly the split a reader reported. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "sliplink.js"), "utf8");
  assert.match(src, /if\(fb && \/android\/i\.test\(navigator\.userAgent\)\)\{/,
    "the upgrade must be gated on Android");
  assert.match(src, /intent:\/\//, "and must build an intent URL");
  assert.match(src, /S\.browser_fallback_url=/,
    "with a fallback - no app, wrong package, or an app that declines, and the "
    + "browser opens the same page it would have anyway");
  assert.match(body({ code: "ABC123", book: "sporty" }), /id="fb"/,
    "and the script needs the anchor to carry an id");
});

test("both paths name the same Android package", () => {
  /* The app modal and this page each hold the package name, in files that
     cannot import from one another - index.html is standalone. Two copies
     drift, and a wrong package silently sends everyone to the website with
     nothing to show for it, so they are checked against each other. */
  const fs = require("fs"), path = require("path");
  const slip = fs.readFileSync(path.join(__dirname, "..", "lib", "sliplink.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const a = /package=([a-z0-9.]+)/.exec(slip);
  const b = /FOOTBALL_PKG="([a-z0-9.]+)"/.exec(app);
  assert.ok(a, "the shared page must name a package");
  assert.ok(b, "the app must name a package");
  assert.strictEqual(a[1], b[1],
    "the two paths disagree about football.com's Android package");
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

test("THE PAGE'S OWN SCRIPT MUST PARSE", () => {
  /* The test that would have caught a live regression, and the reason it is
     shouted about.
     Everything in that <script> block is inside a TEMPLATE LITERAL, so
     JavaScript processes escapes on the way out. A regex written in the source
     as /^https?:\/\// was emitted as /^https?:///, which terminates at the
     second slash and turns the remainder of the line into a comment. Syntax
     error - and not a quiet one confined to the feature being added: the whole
     block failed, so Copy code stopped working on every shared slip page too.
     Nothing else here would have noticed. Every other test in this file reads
     the markup as a string, and a string containing broken JavaScript is still
     a perfectly good string.
     So: compile what is actually emitted. */
  const vm = require("node:vm");
  const legs = [{ home: "Arsenal", away: "Chelsea", date: "2026-09-04",
    code: "1X", od: 1.38, p: 0.72 }];
  for (const opts of [{ code: "ABC123", book: "sporty" },
                      { code: "ABC123", book: "bet9ja" },
                      { book: "sporty" }]) {
    const html = S.renderPage(legs, null, "/s", opts);
    const blocks = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
    assert.ok(blocks.length, "the page must still carry its script");
    blocks.forEach((b, i) => {
      const code = b.replace(/^<script>/, "").replace(/<\/script>$/, "");
      assert.doesNotThrow(() => new vm.Script(code),
        "script block " + i + " does not parse for " + JSON.stringify(opts));
    });
  }
});

test("and it contains no backslash at all", () => {
  /* The rule that keeps the above true rather than merely tested. Inside a
     template literal every backslash is a question about what survives, and
     the answer is easy to get wrong and invisible until something breaks. A
     plain indexOf cannot be mangled; a regex can. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "sliplink.js"), "utf8");
  const m = /<script>([\s\S]*?)<\/script>/.exec(src);
  assert.ok(m, "the script block must be findable in the source");
  assert.ok(m[1].indexOf("\\") < 0,
    "a backslash in this template literal is emitted as something else; use "
    + "string methods instead of a regex");
});
