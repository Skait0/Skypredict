"use strict";
/* WHEN A SERVER SAYS 503, STOP ASKING IT EIGHTY MORE TIMES.
 *
 * The build sends football-data.co.uk 84 requests: 22 divisions across 3
 * seasons, 16 per-country files, 2 fixture feeds. On a normal day that is
 * nothing. During their outage it was 84 requests into a server answering
 * `Retry-After: 200` on every one of them, five or six times a day.
 *
 * We have form. On 3 Sep 2026 a route that rebuilt the payload inside the
 * request sent them roughly 94,000 requests in a day; their 503s began on the
 * 5th. The two may be unrelated - it is a free dataset the whole industry
 * scrapes - but the polite build is the same build either way.
 *
 * THE DISTINCTION THIS FILE EXISTS TO PROTECT: a 404 must never trip it. A
 * season file that has not been published yet 404s for a fortnight every July,
 * and treating that as an outage would stop the build fetching the files that
 * do exist - turning a missing division into a missing board.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");

/* The real loop, lifted out and driven with a fake fetchText. Nothing here
   transcribes the logic: if the trip condition changes, this changes with it. */
function run(responses, concurrency) {
  const i = src.indexOf("  const SHED_TRIP = 8;");
  assert.ok(i > 0, "the shedding breaker is gone from build.js");
  /* Balanced to the close of the `if (shedTripped) { ... }` that follows the
     fetch, so the slice is whatever the code is rather than a fixed length. */
  const open = src.indexOf("  if (shedTripped) {", i);
  assert.ok(open > i, "the breaker no longer reports itself in the build log");
  let d = 0, end = src.indexOf("{", open);
  for (; end < src.length; end++) {
    if (src[end] === "{") d++;
    else if (src[end] === "}") { d--; if (!d) break; }
  }
  const body = src.slice(i, end + 1);

  const asked = [];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction("sources", "cfg", "pool", "fetchText", "log",
    body + "; return { fetched, shed, shedTripped };");
  const fetchText = (url) => {
    asked.push(url);
    const r = responses[asked.length - 1];
    return Promise.resolve(r ? { url, error: r } : { url, text: "x".repeat(500) });
  };
  const pool = async (items, limit, worker) => {
    const out = [];
    for (const it of items) out.push(await worker(it));   /* serial: order is the point */
    return out;
  };
  const sources = responses.map((_, n) => ({ url: "https://f/" + n, kind: "main" }));
  const log = [];
  const out = fn(sources, { concurrency: concurrency || 6, fetchTimeoutMs: 1 },
    pool, fetchText, log);
  return Promise.resolve(out).then((o) => ({ ...o, asked, log }));
}

test("eight 503s and it stops asking", async () => {
  const r = await run(Array(40).fill("HTTP 503"));
  assert.strictEqual(r.shedTripped, true);
  assert.strictEqual(r.asked.length, 8,
    "asked " + r.asked.length + " times; the whole point is to stop at 8");
});

test("a 404 never trips it, however many there are", async () => {
  /* Every July a not-yet-published season file 404s. If that tripped the
     breaker the build would stop fetching the seasons that DO exist. */
  const r = await run(Array(40).fill("HTTP 404"));
  assert.strictEqual(r.shedTripped, false);
  assert.strictEqual(r.asked.length, 40, "a missing file is not an outage");
});

test("a blip mixed into a good build does not trip it", async () => {
  const mix = Array(40).fill(null);
  mix[3] = "HTTP 503"; mix[9] = "HTTP 503"; mix[20] = "timeout";
  const r = await run(mix);
  assert.strictEqual(r.shedTripped, false, "two 503s in forty is a blip, not shedding");
  assert.strictEqual(r.asked.length, 40);
});

test("what it skips still comes back as an error the floor can fill", async () => {
  /* The skipped entries must look like failures, because the floor fallback
     below keys off `error`. Silently dropping them would remove the league. */
  const r = await run(Array(20).fill("HTTP 503"));
  const skipped = r.fetched.filter((f) => /not asked/.test(f.error || ""));
  assert.strictEqual(skipped.length, 12);
  assert.ok(r.fetched.every((f) => f.error), "every entry must carry an error for the floor to fill");
});

test("the fixture feeds and the combined fallback are skipped too", () => {
  assert.match(src, /const fxUrls = shedTripped \? \[\]/,
    "the two fixture requests still go out during an outage");
  assert.match(src, /if \(extraGot === 0 && Object\.keys\(cfg\.extra\)\.length && !shedTripped\)/,
    "the combined-file fallback still goes out during an outage");
});

test("the build asks the vhost that works", () => {
  /* Three days of degraded builds, 68 of 82 sources coming off the committed
     floor, formStaleDays climbing - and www.football-data.co.uk was 503ing
     while football-data.co.uk served every file normally, on the same IP.
     One vhost, not the host.

     If this file ever starts failing because the apex is the broken one, swap
     it and leave the comment: the transferable lesson is that the two fail
     independently, not which of them is currently up. */
  assert.match(src, /const BASE = "https:\/\/football-data\.co\.uk";/,
    "BASE points at the www vhost again, which was down for three days while " +
    "the apex was fine");
});
