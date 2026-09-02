"use strict";

/**
 * Booking, routed through this origin instead of straight at Railway.
 *
 * Every other upstream call already comes through Vercel and therefore over
 * the same Cloudflare edge that serves the site. Booking was the one call the
 * browser made directly to Railway, and the one users called slow.
 *
 * Measured from Lagos, same payload, five samples each:
 *
 *   via this origin    0.56  0.49  0.48  0.50  0.45  seconds
 *   direct to Railway  2.27  60.0  60.0  3.80  4.39  seconds
 *
 * Not the application's fault: Railway reports server-side p99 of 659ms with
 * the container at 0.04 of 8 vCPU. It is the path from Nigeria to a region
 * with no local presence.
 *
 * THE RULE THAT MATTERS MOST HERE is that a rejection is an answer, not a
 * failure. A refused slip comes back 400 with a named `unbookable` list, and
 * the site drops exactly those legs and retries. A proxy that swallowed the
 * status, or the list, would turn a recoverable rejection into a slip that
 * fails forever with nothing to retry - and it would look like a bookmaker
 * outage rather than a bug here.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/bookproxy.js");

/* ------------------------------------------------ what reaches the user */

test("a refused slip is passed through with its status and its legs", () => {
  const refusal = {
    success: false,
    message: "Bet9ja rejected the slip",
    unbookable: [{ eventId: "1", prediction: "HOME_OVER_0.5", reason: "not_priced" }],
  };
  const out = P.bookResponse({ ok: true, status: 400, body: refusal });
  assert.strictEqual(out.status, 400, "a 400 must stay a 400");
  assert.deepStrictEqual(out.body, refusal, "the retry list must arrive intact");
});

test("every unbookable leg keeps the pair the retry is keyed on", () => {
  /* dropUnbookable keys on eventId + "|" + prediction. Losing either would
     make the retry resend the same doomed slip. */
  const body = {
    unbookable: [
      { eventId: "823959654", prediction: "AWAY_OVER_0.5", reason: "not_priced" },
      { eventId: "829852546", prediction: "HOME_OVER_0.5", reason: "not_priced" },
    ],
  };
  const out = P.bookResponse({ ok: true, status: 400, body });
  for (const leg of out.body.unbookable) {
    assert.ok("eventId" in leg && "prediction" in leg, JSON.stringify(leg));
  }
});

test("a successful booking is passed through untouched", () => {
  const ok = { success: true, booking_code: "5PYBVFJ" };
  const out = P.bookResponse({ ok: true, status: 200, body: ok });
  assert.strictEqual(out.status, 200);
  assert.deepStrictEqual(out.body, ok);
});

test("an unreachable upstream is a 502, never a fake success", () => {
  /* The one thing worse than a slow booking is a page that says it booked
     when nothing was booked. */
  const out = P.bookResponse({ ok: false, why: "fetch failed" });
  assert.strictEqual(out.status, 502);
  assert.strictEqual(out.body.success, false);
  assert.ok(!("booking_code" in out.body) && !("code" in out.body));
  assert.match(out.body.detail, /fetch failed/);
});

test("a 502 is not dressed up as a rejection", () => {
  /* If it came back as an empty `unbookable`, the client would drop no legs
     and retry the identical slip forever. */
  const out = P.bookResponse({ ok: false, why: "timeout" });
  assert.strictEqual("unbookable" in out.body, false);
});

/* ------------------------------------------------------- the routing */

test("only the two known bookmakers can be reached", () => {
  /* Named paths, so a query string cannot point this at an arbitrary path on
     the upstream host. */
  assert.deepStrictEqual(Object.keys(P.BOOKS).sort(), ["bet9ja", "sporty"]);
  assert.strictEqual(P.BOOKS.sporty, "/api/generate-booking-code");
  assert.strictEqual(P.BOOKS.bet9ja, "/api/bet9ja/booking-code");
});

test("the timeout is longer than the feeds but still bounded", () => {
  /* The upstream gives the bookmaker 10s of its own, so 8s here would cut off
     bookings that were about to succeed. It still has to be finite. */
  assert.ok(P.TIMEOUT_MS > 10000, "must outlast the upstream's own bookmaker call");
  assert.ok(P.TIMEOUT_MS <= 20000, "but a hung bookmaker must not pin a function open");
});

/* ------------------------------------------------------- the request body */

function fakeReq(body, method, book) {
  return { body, method: method || "POST", query: { book: book || "sporty" } };
}
function fakeRes() {
  const r = { code: null, sent: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.sent = b; return r; };
  return r;
}

test("a JSON string body is understood, not silently emptied", async () => {
  /* Vercel parses application/json for you; other runners hand over a string
     or a stream. Sending {} upstream would read to the user as a bookmaker
     that rejects everything. */
  const parsed = await P.readBody({ body: '{"selections":[{"eventId":"1"}]}' });
  assert.strictEqual(parsed.selections.length, 1);
});

test("an unparseable body is null rather than a guess", async () => {
  assert.strictEqual(await P.readBody({ body: "{not json" }), null);
});

test("an empty slip is refused here without troubling the upstream", async () => {
  const h = P.makeHandler();
  const res = fakeRes();
  await h(fakeReq({ selections: [] }), res);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(res.sent.success, false);
});

test("a GET is refused", async () => {
  const h = P.makeHandler();
  const res = fakeRes();
  await h(fakeReq({ selections: [{}] }, "GET"), res);
  assert.strictEqual(res.code, 405);
});

test("an unknown bookmaker is refused", async () => {
  const h = P.makeHandler();
  const res = fakeRes();
  await h(fakeReq({ selections: [{}] }, "POST", "ladbrokes"), res);
  assert.strictEqual(res.code, 400);
  assert.match(res.sent.message, /unknown bookmaker/);
});

test("nothing about a booking is cached", async () => {
  /* A booking code is minted per request; a cached one would hand two people
     the same slip. */
  const h = P.makeHandler();
  const res = fakeRes();
  await h(fakeReq({ selections: [] }), res);
  assert.strictEqual(res.headers["Cache-Control"], "no-store");
});

/* ------------------------------------------------------- the call site */

test("the site posts booking at this origin, not at Railway", () => {
  /* The whole point. Every assertion above passes while index.html still
     calls the Railway host directly, which is exactly the bug. */
  const fs = require("fs"), path = require("path");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const direct = html.match(/https:\/\/web-production-[a-z0-9-]+\.up\.railway\.app/g) || [];
  assert.deepStrictEqual(direct, [],
    "the browser must not call Railway directly for booking: " + direct.join(", "));
  assert.match(html, /BOOK_URL\s*=\s*"\/api\/book\?book=sporty"/);
  assert.match(html, /B9_BOOK_URL\s*=\s*"\/api\/book\?book=bet9ja"/);
});
