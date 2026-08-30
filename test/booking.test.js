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

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* A stand-in for the one element these functions write into, so the decision
   can be exercised without a DOM. */
function harness() {
  const el = { innerHTML: "", _handlers: {},
    querySelector(sel) {
      const key = sel.replace(".", "");
      const self = this;
      return { addEventListener(_, fn) { self._handlers[key] = fn; } };
    } };
  const api = new Function("EL",
    "function $(id){return EL;}" +
    "function esc(s){return String(s);}" +
    "function fixtureById(){return null;}" +
    grab("hasSportyMarket") + "\n" + grab("confirmDropUnpriced") + "\n" +
    "return {hasSportyMarket:hasSportyMarket, confirmDropUnpriced:confirmDropUnpriced, el:EL};"
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
  assert.match(H.el.innerHTML, /can't be booked/);
  assert.match(H.el.innerHTML, /Leeds v Everton/,
    "the reader has to be told WHICH game, not just how many");
  assert.match(H.el.innerHTML, /Book 1/);
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
    "function fixtureById(id){return BY[id]||null;}" +
    grab("hasSportyMarket") + "\nreturn hasSportyMarket;")(byId);
  assert.strictEqual(api({ id: "mu-ips", code: "OVER_1.5" }), true,
    "a leg with only an id must still resolve through fixtureById");
  assert.strictEqual(api({ code: "OVER_1.5" }), false,
    "and one carrying neither id nor fixture cannot resolve - which is the bug");
});
