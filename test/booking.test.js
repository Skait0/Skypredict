"use strict";

/**
 * Asking before booking, instead of failing after.
 *
 * Reported: "still getting 'sporty wouldnt take this slip' error, i thought we
 * fixed that, when there are games with no market, ask the user if they still
 * want to go ahead and book."
 *
 * We price every fixture for every market we model. SportyBet does not carry
 * all of them - measured on its live card: 1X2 and double chance are on ~100%
 * of fixtures, Over 2.5 on 91%, Over 1.5 on 80%, team totals on 76%. One leg
 * it cannot take rejects the whole ticket, so on an eight-leg slip an
 * unplaceable leg is likely rather than rare.
 *
 * The old handling sent everything, let SportyBet refuse the lot, then quietly
 * retried a subset - and only when between two and all-but-one of the legs had
 * verified odds. Outside that window the reader got "SportyBet wouldn't take
 * this slip" and no idea which game caused it.
 *
 * Everything needed to know this is on the board before anything is sent: a
 * real odd in sportyOdds came FROM SportyBet, so its presence is proof the
 * market exists. These tests pin that the unplaceable legs are identified up
 * front and the choice is put to the reader.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const BOOKCTX = require("./books.js");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* A stand-in for the one element these functions write into, so the decision
   can be exercised without a DOM. `book` is which bookmaker is selected -
   these functions read that now, and the two books answer differently. */
function harness(book) {
  const el = { innerHTML: "", _handlers: {},
    /* promptFoot() asks $() for the foot and toggles "prompting" on it, which
       is what hides the Get code button while a question is up. The same
       stand-in serves as both element here; what these tests care about is
       that the class goes on and comes off. */
    classList: new Set(),
    querySelector(sel) {
      const key = sel.replace(".", "");
      const self = this;
      return { addEventListener(_, fn) { self._handlers[key] = fn; } };
    } };
  el.classList.add = Set.prototype.add.bind(el.classList);
  el.classList.remove = Set.prototype.delete.bind(el.classList);
  el.classList.contains = Set.prototype.has.bind(el.classList);
  const api = new Function("EL",
    "function $(id){return EL;}" +
    "function esc(s){return String(s);}" +
    "function fixtureById(){return null;}" +
    BOOKCTX.prelude(book) +
    grab("hasSportyMarket") + "\n" + grab("confirmDropUnpriced") + "\n" +
    "return {hasSportyMarket:hasSportyMarket, confirmDropUnpriced:confirmDropUnpriced," +
    " BOOKS:BOOKS, curBook:curBook, bookIdOf:bookIdOf, el:EL};"
  )(el);
  return api;
}

/* A pick as the booking code sees one: the fixture is carried on `.f`. */
function pick(home, away, code, odds) {
  return { id: home + away, code: code,
           f: { home: home, away: away, sportyOdds: odds || {} } };
}

test("a market SportyBet prices is placeable, one it does not is not", () => {
  const H = harness();
  assert.strictEqual(H.hasSportyMarket(pick("A", "B", "1X", { "1X": 1.35 })), true);
  assert.strictEqual(H.hasSportyMarket(pick("A", "B", "HOME_OVER_1.5", { "1X": 1.35 })), false,
    "no odd for that market means SportyBet does not list it");
});

test("a placeholder odd is not a market", () => {
  const H = harness();
  /* 1.00 and 1.01 are what an unpriced slot looks like, not a real price. */
  assert.strictEqual(H.hasSportyMarket(pick("A", "B", "GG", { GG: 1.0 })), false);
  assert.strictEqual(H.hasSportyMarket(pick("A", "B", "GG", { GG: 1.01 })), false);
  assert.strictEqual(H.hasSportyMarket(pick("A", "B", "GG", { GG: 1.02 })), true);
});

test("a slip that is entirely placeable is not interrupted", () => {
  const H = harness();
  const picks = [pick("A", "B", "1X", { "1X": 1.3 }), pick("C", "D", "X2", { X2: 1.5 })];
  assert.strictEqual(H.confirmDropUnpriced(picks, "bookResult", () => {}), false,
    "nothing to ask about, so booking proceeds untouched");
  assert.strictEqual(H.el.innerHTML, "", "and nothing is drawn");
});

test("an unplaceable leg is named and the choice is offered", () => {
  const H = harness();
  const picks = [
    pick("Arsenal", "Chelsea", "1X", { "1X": 1.3 }),
    pick("Leeds", "Everton", "HOME_OVER_1.5", { "1X": 1.6 }),   // no market
  ];
  let booked = null;
  assert.strictEqual(H.confirmDropUnpriced(picks, "bookResult", (p) => { booked = p; }), true,
    "it takes over and waits for an answer");
  assert.match(H.el.innerHTML, /can't take 1 pick/);
  assert.match(H.el.innerHTML, /Leeds v Everton/,
    "the reader has to be told WHICH game, not just how many");
  assert.match(H.el.innerHTML, /Book the other one/,
    "and 'Book the other 1' is not a sentence");
  assert.strictEqual(booked, null, "nothing is sent before the answer");

  H.el._handlers["confirm-go"]();
  assert.ok(booked, "confirming books");
  assert.strictEqual(booked.length, 1);
  assert.strictEqual(booked[0].f.home, "Arsenal", "and only the placeable leg goes");
});

test("cancelling sends nothing", () => {
  const H = harness();
  let booked = null;
  H.confirmDropUnpriced([pick("A", "B", "1X", { "1X": 1.3 }), pick("C", "D", "GG", {})],
    "bookResult", (p) => { booked = p; });
  H.el._handlers["confirm-cancel"]();
  assert.strictEqual(booked, null);
  assert.strictEqual(H.el.innerHTML, "", "and the prompt is cleared");
});

test("when nothing at all is placeable, say so instead of offering to book none", () => {
  const H = harness();
  let booked = null;
  const r = H.confirmDropUnpriced(
    [pick("A", "B", "HOME_OVER_1.5", {}), pick("C", "D", "AWAY_OVER_1.5", {})],
    "bookResult", (p) => { booked = p; });
  assert.strictEqual(r, true);
  assert.match(H.el.innerHTML, /isn't offering/);
  assert.doesNotMatch(H.el.innerHTML, /Book 0/, "offering to book nothing is not a choice");
  assert.strictEqual(booked, null);
});

test("one placeable leg is still a slip worth offering", () => {
  /* The old retry demanded two before it would try again, so a slip with a
     single placeable leg just failed. */
  const H = harness();
  let booked = null;
  H.confirmDropUnpriced([pick("A", "B", "1X", { "1X": 1.3 }), pick("C", "D", "GG", {})],
    "bookResult", (p) => { booked = p; });
  H.el._handlers["confirm-go"]();
  assert.strictEqual(booked.length, 1);
});

/* ------------------------------------------------ the shape actually passed */

/**
 * The pre-flight has to work on the objects the CALLERS really build.
 *
 * Reported from a phone: a My-slip of five legs, each showing its odds on
 * screen, refused to book with "SportyBet isn't offering any of these markets
 * right now."
 *
 * hasSportyMarket resolves a fixture through `c.f` or `c.id`. The board path
 * passes both. My slip passed neither - it built `{code, eventId}` - so every
 * leg looked unplaceable and the pre-flight took the "nothing can be booked"
 * branch, blocking booking entirely.
 *
 * My earlier tests all built their own pick objects and so all had `.f`. They
 * proved the logic and said nothing about whether the callers satisfy it. That
 * is the gap these close: assert against the real construction sites.
 */
const idxSrc = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("every list handed to the pre-flight carries the fixture", () => {
  /* The two places bookMy builds its picks. Both must carry id and f, or
     hasSportyMarket cannot resolve anything. */
  const builds = idxSrc.match(/picks\s*=\s*MYSLIP\.map\([\s\S]{0,260}?\}\);/g) || [];
  assert.ok(builds.length >= 2,
    "expected both MYSLIP pick constructions, found " + builds.length);
  builds.forEach((b, i) => {
    assert.match(b, /id:\s*x\.id/, `MYSLIP pick construction ${i + 1} drops the id`);
    assert.match(b, /f:\s*f/, `MYSLIP pick construction ${i + 1} drops the fixture`);
  });
});

test("a leg shaped like My slip's is resolvable", () => {
  /* The exact failure: a pick with no `.f`, relying on `id` alone. */
  const H = harness();
  const f = { home: "Man United", away: "Ipswich", sportyOdds: { "OVER_1.5": 1.17 } };
  const byId = { "mu-ips": f };
  const api = new Function("BY",
    "function fixtureById(id){return BY[id]||null;}" + BOOKCTX.prelude("sporty") +
    grab("hasSportyMarket") + "\nreturn hasSportyMarket;")(byId);
  assert.strictEqual(api({ id: "mu-ips", code: "OVER_1.5" }), true,
    "a leg with only an id must still resolve through fixtureById");
  assert.strictEqual(api({ code: "OVER_1.5" }), false,
    "and one carrying neither id nor fixture cannot resolve - which is the bug");
});

/* ------------------------------------------------- the second bookmaker */

/* A pick as Bet9ja sees one: the fixture carries both ids, and Bet9ja's league
   listing has no team-goals price - which is the case that matters. */
function b9pick(code, opts) {
  opts = opts || {};
  return { id: "p", code: code,
           f: { home: "Ipswich", away: "Liverpool",
                eventId: opts.sporty === false ? undefined : "sr:1",
                b9EventId: opts.b9 === false ? undefined : "825683591",
                sportyOdds: opts.sportyOdds || {},
                b9Odds: opts.b9Odds || {} } };
}

test("Bet9ja judges a leg on the game, not on a listed price", () => {
  /* Their per-league feed ignores the market group, so it never carries a
     team-goals price. The booking route reads the event itself - about
     thirteen hundred markets - and takes it happily. Requiring a listed price
     here would refuse legs the bookmaker will accept, which is the whole
     reason the two books do not share one rule. */
  const H = harness("bet9ja");
  const leg = b9pick("HOME_OVER_0.5", { b9Odds: { "1X": 2.4 } });
  assert.strictEqual(H.BOOKS.bet9ja.priced(leg), true,
    "an unlisted market on a game Bet9ja carries is still bookable");
  assert.strictEqual(H.BOOKS.sporty.priced(leg), false,
    "SportyBet still needs a real price, because one bad leg loses the ticket");
});

test("a game Bet9ja does not carry is not bookable there", () => {
  const H = harness("bet9ja");
  assert.strictEqual(H.BOOKS.bet9ja.priced(b9pick("1X", { b9: false })), false);
});

test("each book sends the id that book knows the game by", () => {
  const H = harness("bet9ja");
  const leg = b9pick("1X");
  assert.deepStrictEqual(H.BOOKS.sporty.sel(leg), { eventId: "sr:1", prediction: "1X" });
  assert.deepStrictEqual(H.BOOKS.bet9ja.sel(leg), { eventId: "825683591", code: "1X" });
});

test("each book reads its code out of its own answer", () => {
  const H = harness("sporty");
  assert.strictEqual(H.BOOKS.sporty.codeOf({ booking_code: "ABC" }), "ABC");
  assert.strictEqual(H.BOOKS.bet9ja.codeOf({ code: "5PTLZRT" }), "5PTLZRT");
  /* Crossed over, each must come back empty rather than showing the other's
     field - a code from the wrong book is worse than no code. */
  assert.ok(!H.BOOKS.sporty.codeOf({ code: "5PTLZRT" }));
  assert.ok(!H.BOOKS.bet9ja.codeOf({ booking_code: "ABC" }));
});

test("the pre-flight names the book it is talking about", () => {
  /* It said "SportyBet isn't offering that market" whichever book was
     selected, which on Bet9ja is both the wrong name and the wrong reason. */
  const H = harness("bet9ja");
  const stopped = H.confirmDropUnpriced(
    [b9pick("1X"), b9pick("1X", { b9: false })], "x", function () {}, H.BOOKS.bet9ja);
  assert.strictEqual(stopped, true, "one unbookable leg must interrupt");
  /* Bet9ja is drawn as its wordmark, not spelt out, so the mark is what to
     look for. */
  assert.match(H.el.innerHTML, /class='b9m'/);
  assert.match(H.el.innerHTML, />bet</, "their red half");
  assert.match(H.el.innerHTML, />9ja</, "their green half");
  assert.doesNotMatch(H.el.innerHTML, /SportyBet/);
});

test("the wordmark carries no <b>, whatever it is dropped into", () => {
  /* ".code-card b" is the booking code's own style - display:block, 32px -
     and it matches any b inside the modal, where this mark also appears. A
     <b> in here rendered "9ja" as a giant line of its own. Two earlier fixes
     in index.html were caught by that same rule, so it is asserted on the
     mark itself rather than on any one place that prints it. */
  const H = harness("bet9ja");
  assert.doesNotMatch(H.BOOKS.bet9ja.mark, /<b[\s>]/);
  assert.doesNotMatch(H.BOOKS.bet9ja.mark, /<i[\s>]/,
    "and no <i> either - the card italicises those");
});

test("a fully bookable Bet9ja slip is not interrupted", () => {
  const H = harness("bet9ja");
  assert.strictEqual(
    H.confirmDropUnpriced([b9pick("HOME_OVER_0.5"), b9pick("1X")], "x",
                          function () {}, H.BOOKS.bet9ja),
    false, "every game is on Bet9ja, so there is nothing to ask about");
});

/* ------------------------------------------------ the brand marks */

test("each book renders as its own mark, never as bare text", () => {
  /* The name appears in the code card's title, on their own button, in the
     pre-flight and in every refusal. If some of those print a plain word the
     brand shows up half the time and looks like a bug the other half. */
  const H = harness("sporty");
  assert.match(H.BOOKS.sporty.mark, /class='sbm'/);
  assert.match(H.BOOKS.bet9ja.mark, /class='b9m'/);
  for (const B of [H.BOOKS.sporty, H.BOOKS.bet9ja]) {
    assert.doesNotMatch(B.mark, /<b[\s>]|<i[\s>]/,
      "no <b> or <i>: .code-card b is the booking code's own 32px block style");
  }
});

test("no user-facing sentence prints the bare label any more", () => {
  /* esc(B.label) is still right for an aria-label or a title attribute, where
     markup cannot go. It is wrong in a sentence the reader sees. */
  const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const bare = idx.match(/esc\(B\.label\)/g) || [];
  assert.strictEqual(bare.length, 1,
    "one left, and it is the picker's aria-label; found " + bare.length);
  /* The ones that remain must be attributes, not body copy. */
  const re = /(.{40})esc\(B\.label\)/g;
  let m;
  while ((m = re.exec(idx))) {
    assert.match(m[1], /aria-label|title=/,
      "a bare label outside an attribute: " + m[1].slice(-40));
  }
});

test("the mark takes the ground's colour where the ground is already red", () => {
  const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(idx, /\.code-open \.sbm,\.book-btn \.sbm,\.wsp-go \.sbm,\.slipbar \.sbm\{color:inherit\}/,
    "red on red is invisible; those four sit on the brand colour already");
  assert.match(idx, /\.code-card--sb \.code-open \.sbm\{color:var\(--red\)\}/,
    "except their own button on the code card, which is white");
});

test("the sheet's own line names the book the buttons will act on", () => {
  /* "Predictions you picked - book them to SportyBet" was hardcoded, so
     choosing Bet9ja left the sheet naming SportyBet directly above a button
     that would produce a Bet9ja code. It is a promise about which app the
     code opens in, so it has to follow the picker. */
  const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const at = idx.indexOf("function paintBookPickers()");
  /* A real end anchor. indexOf returning -1 makes slice() run to the end of
     the file, and then every assertion below passes against the whole source
     rather than against this function - a test that cannot fail. */
  const fnEnd = idx.indexOf('document.addEventListener("click"', at);
  assert.ok(fnEnd > at, "end anchor for paintBookPickers not found");
  const fn = idx.slice(at, fnEnd);
  assert.match(fn, /mySheetSub/, "the line has to be updated when the book changes");
  assert.match(fn, /curBook\(\)\.mark/, "and named with the current book's mark");
  assert.match(idx, /id="mySheetSub"/, "the element needs an id to be reachable");
  /* setBook repaints the pickers, which is what carries this. */
  const sbAt = idx.indexOf("function setBook(k)");
  const sbEnd = idx.indexOf("function bookIdOf", sbAt);
  assert.ok(sbEnd > sbAt, "end anchor for setBook not found");
  const sb = idx.slice(sbAt, sbEnd);
  assert.match(sb, /paintBookPickers\(\)/);
});

test("each book's deep link uses the parameter that book actually reads", () => {
  /* Bet9ja's was "?BookABet=", guessed from the name of the POST endpoint that
     mints the code. Their own bundle matches
     /[?&]bookABetCode=([\da-zA-Z]+)/ against window.location.search, so the
     guess loaded their home page with the code ignored - reported as "when i
     click on open in bet9ja it doesnt load the slip". */
  /* Read from the source: the harness substitutes stub endpoints, which is
     right for exercising behaviour and useless for checking a constant. */
  const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const b9 = /const B9_URL="([^"]+)"/.exec(idx);
  const sb = /const SPORTY_URL="([^"]+)"/.exec(idx);
  assert.ok(b9 && sb, "both deep links must be declared");
  assert.match(b9[1], /[?&]bookABetCode=$/,
    "the parameter their bundle reads, not the one that mints the code");
  assert.match(sb[1], /shareCode=$/);
  for (const u of [b9[1], sb[1]]) {
    assert.match(u, /^https:\/\//, "and https, since a code is appended to it");
  }
});

test("the mark keeps a space from the word before it inside a flex button", () => {
  /* .code-opens .code-open is inline-flex so its contents centre, which makes
     "Open in" and the mark two flex items with nothing between them:
     "Open inbet9ja". A space in the string cannot survive that. Third time
     this shape of bug has appeared - the hero sentence, the sphere button,
     this - so the rule is worth stating: a flex row is not a place to put a
     sentence, and where one ends up there, the spaces have to be margins. */
  const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(idx, /\.code-open \.sbm,\.code-open \.b9m\{margin-left:/,
    "both books, not just the one that was noticed");
});
