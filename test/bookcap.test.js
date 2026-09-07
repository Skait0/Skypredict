"use strict";
/**
 * WHAT A READER SEES WHEN THEY HIT THE DAILY CAP.
 *
 * /api/book answers 429 once a device has minted its ten codes for the Lagos
 * day. To bookFetch that was just "not success and no unbookable list", which
 * is its definition of a blip - so it retried three times, spent 1.8 seconds
 * being told the same thing, and then showed "SportyBet wouldn't take this
 * slip" with the bookmaker's name on our own decision.
 *
 * Two things wrong with that, and both matter more during an ad campaign than
 * they would otherwise: it blames the bookmaker for a limit we set, and it
 * tells someone to "remove a leg and try again" when nothing about their slip
 * is the problem.
 *
 * A cap is a definitive answer, like a rejection. It is not retried.
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

const BOOK = { book: "/api/book?book=sporty", mark: "SportyBet",
               codeOf: (d) => d && d.code };

/* The real bookFetch, with only the browser around it replaced. `calls` counts
   what actually left the page, which is how "does it retry" is answered. */
function client(reply) {
  const calls = { n: 0 };
  const api = new Function("REPLY", "CALLS",
    "var localStorage={getItem:function(){return null;},setItem:function(){}};" +
    "var window={crypto:null};" +
    "var setTimeout=function(fn){return fn();};" +
    "var fetch=function(){ CALLS.n++; return Promise.resolve(REPLY()); };" +
    "function curBook(){ return null; }" +
    "function esc(s){ return String(s); }" +
    grab("swDeviceId") + "\n" + grab("bookFetch") + "\n" +
    grab("bookReason") + "\n" + grab("bookErrHTML") + "\n" +
    "var SW_QUOTA_LEFT=null;\n" + grab("quotaNoteHTML") + "\n" +
    "return {bookFetch:bookFetch, bookErrHTML:bookErrHTML, bookReason:bookReason," +
    " quotaNoteHTML:quotaNoteHTML};"
  )(reply, calls);
  return { api, calls };
}

const CAP_BODY = {
  success: false,
  message: "That is today's ten booking codes. The board is still yours - " +
           "come back after midnight for ten more.",
};

const respond = (status, body) => () => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

/* ------------------------------------------------------------ not a blip */

test("a capped reader is not retried", async () => {
  /* Three requests to be told the same thing, and 1.8s of "Booking..." before
     the reader learns anything. */
  const { api, calls } = client(respond(429, CAP_BODY));
  await api.bookFetch([{ eventId: "1" }], BOOK);
  assert.equal(calls.n, 1, "a cap is an answer, not a blip; got " + calls.n + " requests");
});

test("a real blip is still retried", async () => {
  /* The behaviour that must survive the fix: a 500 is worth trying again. */
  const { api, calls } = client(respond(500, {}));
  await api.bookFetch([{ eventId: "1" }], BOOK);
  assert.equal(calls.n, 3, "a server error still gets three attempts");
});

test("the cap comes back marked as its own kind of failure", async () => {
  const { api } = client(respond(429, CAP_BODY));
  const d = await api.bookFetch([{ eventId: "1" }], BOOK);
  assert.equal(d._kind, "capped");
});

/* -------------------------------------------------------------- the copy */

test("the message does not blame the bookmaker for our own limit", async () => {
  const html = client(respond(429, CAP_BODY)).api
    .bookErrHTML({ _kind: "capped", message: CAP_BODY.message }, BOOK);
  assert.ok(!/SportyBet wouldn't take this slip/.test(html),
    "the bookmaker did not refuse anything: " + html);
  assert.ok(!/Remove a leg/.test(html),
    "nothing is wrong with their slip, so do not send them to fix it");
});

test("the message says what happened and when it lifts", async () => {
  const html = client(respond(429, CAP_BODY)).api
    .bookErrHTML({ _kind: "capped", message: CAP_BODY.message }, BOOK);
  assert.match(html, /today/i, "it has to name the limit");
  assert.match(html, /midnight|tomorrow/i, "and when it resets");
});

test("an unknown cap reason still produces a usable message", async () => {
  /* The server's wording may change; the page must not depend on it. */
  const html = client(respond(429, {})).api.bookErrHTML({ _kind: "capped" }, BOOK);
  assert.ok(html.length > 40, "still says something: " + html);
  assert.ok(!/undefined|null/.test(html), "and never leaks a missing field: " + html);
});

/* ------------------------------------------------- the old paths survive */

test("a timeout and a dead network still read as themselves", () => {
  const { api } = client(respond(200, {}));
  assert.match(api.bookErrHTML({ _kind: "timeout" }, BOOK), /didn't answer in time/);
  assert.match(api.bookErrHTML({ _kind: "net" }, BOOK), /Couldn't reach/);
});

test("a genuine bookmaker refusal still names the bookmaker", () => {
  const { api } = client(respond(200, {}));
  const html = api.bookErrHTML({ _kind: "refused", message: "odds changed" }, BOOK);
  assert.match(html, /SportyBet wouldn't take this slip/);
});

/* ------------------------------------------------- warning before the wall */

/* A wall with no warning is the complaint people actually make. The server
   already returns X-Sw-Quota-Remaining on every booking, so the page can say
   "3 codes left today" while it still means something. Quiet until it is
   nearly gone: a counter shown at nine of ten is noise, and noise trains
   people to ignore the one at two. */

function withHeaders(status, body, headers) {
  return () => ({
    ok: status >= 200 && status < 300,
    status,
    /* A FRESH BODY EVERY TIME. bookFetch writes _left and _capped onto the
       parsed object, so handing out one shared fixture let an earlier test's
       result leak into a later one - this file briefly "proved" that a
       response with no quota header still reported 3 left. */
    json: () => Promise.resolve(JSON.parse(JSON.stringify(body))),
    headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null },
  });
}

const OK_BODY = { success: true, code: "MS0LJY" };

test("what is left is read off the booking response", async () => {
  const { api } = client(withHeaders(200, OK_BODY, { "x-sw-quota-remaining": "3" }));
  const d = await api.bookFetch([{ eventId: "1" }], BOOK);
  assert.equal(d._left, 3);
});

test("a response with no quota header claims nothing", async () => {
  /* The quota can be switched off, or the counter can be unavailable. Neither
     may produce a made-up number on screen. */
  const { api } = client(withHeaders(200, OK_BODY, {}));
  const d = await api.bookFetch([{ eventId: "1" }], BOOK);
  assert.equal(d._left, undefined);
});

test("the note is silent while there is plenty left", () => {
  const { api } = client(withHeaders(200, OK_BODY, {}));
  for (const n of [9, 8, 5, 4]) {
    assert.equal(api.quotaNoteHTML(n), "", n + " left should say nothing");
  }
});

test("the note appears as the cap gets close", () => {
  const { api } = client(withHeaders(200, OK_BODY, {}));
  for (const n of [3, 2, 1]) {
    const html = api.quotaNoteHTML(n);
    assert.ok(html.length > 0, n + " left should warn");
    assert.ok(html.indexOf(String(n)) >= 0, "and name the number: " + html);
    assert.match(html, /today/i);
  }
});

test("one left is singular", () => {
  /* "1 codes left" is the kind of thing that makes a site look unfinished. */
  const { api } = client(withHeaders(200, OK_BODY, {}));
  const html = api.quotaNoteHTML(1);
  assert.ok(!/1 codes/.test(html), "got: " + html);
});

test("the last code of the day says so plainly", () => {
  const { api } = client(withHeaders(200, OK_BODY, {}));
  const html = api.quotaNoteHTML(0);
  assert.ok(html.length > 0);
  assert.match(html, /last|midnight|tomorrow/i, "got: " + html);
});

test("nothing known means nothing shown", () => {
  const { api } = client(withHeaders(200, OK_BODY, {}));
  for (const n of [null, undefined, NaN, "lots"]) {
    assert.equal(api.quotaNoteHTML(n), "", JSON.stringify(n));
  }
});

test("the code modal carries the note", () => {
  /* The caller is the point, again: a note nothing renders is not a warning. */
  const src2 = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const i = src2.indexOf("function showCode(");
  assert.ok(i > 0);
  assert.match(src2.slice(i, i + 4000), /quotaNoteHTML\(/,
    "showCode must render the remaining-codes note");
});

test("the note is styled, not dropped into the card raw", () => {
  /* It renders inside the code modal, which is a designed surface - an
     unstyled div there reads as a bug rather than a warning. */
  const src2 = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(src2, /\.code-quota\s*\{/, "no CSS rule for .code-quota");
});
