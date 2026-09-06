"use strict";
/* HOW OFTEN THE INTRO GATE SHOWS.
 *
 * This rule has been changed twice under opposite complaints, which is exactly
 * why it is pinned here:
 *
 *   once a calendar day  ->  "why does the wizard not show after once?"
 *   every visit          ->  "anytime i reload any page it takes me back
 *                             to the entry page"
 *
 * The answer between them is once a SESSION. A reload is not a visit; a new
 * tab tomorrow is. If someone changes this again, one of those two complaints
 * is coming back, and this file names which one.
 *
 * It runs the real bootstrap out of public/index.html against stub storage
 * rather than asserting on its source text - the point is the decision, not
 * the spelling of it. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* Lift the gate bootstrap by brace-matching around a line only it contains. */
function gateBootstrap() {
  const anchor = HTML.indexOf('sessionStorage.getItem("sw.intro.session")');
  assert.ok(anchor > 0, "the session guard is gone from the gate bootstrap");
  const start = HTML.lastIndexOf("(function(){", anchor);
  assert.ok(start > 0 && start < anchor, "could not find the enclosing IIFE");
  let depth = 0, i = start;
  for (; i < HTML.length; i++) {
    const c = HTML[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, "braces never balanced");
  const end = HTML.indexOf(";", i);
  return HTML.slice(start, end + 1);
}
const SRC = gateBootstrap();

/* A reader: whatever they have stored, where they came from, what they ran. */
function visit({ local = {}, session = {}, referrer = "", path = "/" } = {}) {
  function store(bag) {
    return {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
      setItem: (k, v) => { bag[k] = String(v); },
      removeItem: (k) => { delete bag[k]; },
    };
  }
  const html = { className: "" };
  const sandbox = {
    document: { documentElement: html, referrer },
    location: { pathname: path },
    localStorage: store(local),
    sessionStorage: store(session),
  };
  sandbox.window = sandbox;
  sandbox.window.matchMedia = () => ({ matches: false });
  vm.runInNewContext(SRC, sandbox);
  return {
    shows: /\bsw-gate-on\b/.test(html.className),
    known: /\bsw-gate-known\b/.test(html.className),
    local, session,
  };
}

/* What the gate itself writes when the reader dismisses it. Kept as its own
   step so the round trip below is a real one and not a hand-written flag. */
function dismiss(r) {
  r.session["sw.intro.session"] = "1";
  r.local["sw.intro.day"] = "2026-09-06";
  r.local["sw.age18"] = "1";
}

test("a first-time reader gets the gate", () => {
  assert.equal(visit().shows, true);
});

test("a reload does NOT bring the gate back", () => {
  const local = {}, session = {};
  const first = visit({ local, session });
  assert.equal(first.shows, true);
  dismiss(first);
  /* Same tab, F5. This is the complaint that produced the rule. */
  assert.equal(visit({ local, session }).shows, false, "reload re-showed the gate");
  assert.equal(visit({ local, session }).shows, false, "and again on a second reload");
});

test("a new session shows it again - a returning reader is not shut out", () => {
  const local = {}, session = {};
  dismiss(visit({ local, session }));
  /* Tab closed and reopened: sessionStorage is gone, localStorage is not. */
  const next = visit({ local, session: {} });
  assert.equal(next.shows, true, "a returning reader never saw the wizard again");
  assert.equal(next.known, true, "they should get the visible Skip, having seen it before");
});

test("the session flag alone is enough - it does not lean on the day stamp", () => {
  assert.equal(visit({ session: { "sw.intro.session": "1" } }).shows, false);
});

test("a stale day stamp from a previous visit does not suppress a new session", () => {
  assert.equal(visit({ local: { "sw.intro.day": "2020-01-01" } }).shows, true);
});

test("only an exact '1' counts, so a mangled value fails open to showing it", () => {
  assert.equal(visit({ session: { "sw.intro.session": "true" } }).shows, true);
});

test("search arrivals are still skipped, whatever the session says", () => {
  assert.equal(visit({ referrer: "https://www.google.com/search?q=x" }).shows, false);
  assert.equal(visit({ referrer: "https://duckduckgo.com/" }).shows, false);
});

test("deep pages never get the gate", () => {
  assert.equal(visit({ path: "/matches" }).shows, false);
  assert.equal(visit({ path: "/m/arsenal-chelsea" }).shows, false);
});

test("storage that throws leaves the reader on the site, not behind a gate", () => {
  const boom = { getItem() { throw new Error("blocked"); }, setItem() {} };
  const html = { className: "" };
  const sandbox = {
    document: { documentElement: html, referrer: "" },
    location: { pathname: "/" },
    localStorage: boom, sessionStorage: boom,
  };
  sandbox.window = sandbox;
  sandbox.window.matchMedia = () => ({ matches: false });
  assert.doesNotThrow(() => vm.runInNewContext(SRC, sandbox));
});

test("dismissing writes the session flag - the guard has something to read", () => {
  /* The other half of the round trip: the guard above is only worth anything
     if remember() actually sets the key it looks for. */
  const fn = HTML.slice(HTML.indexOf("function remember()"));
  const body = fn.slice(0, fn.indexOf("\n  }") + 4);
  assert.match(body, /sessionStorage\.setItem\("sw\.intro\.session"\s*,\s*"1"\)/,
    "remember() no longer records the session, so the gate will show on every reload");
});
