"use strict";

/**
 * /api/predictions must never build.
 *
 * It used to. Measured in production on 3 Sep 2026, over twelve hours:
 *
 *   577 invocations, 8 HOURS of active CPU, a 100% error rate, every one
 *   "Vercel Runtime Timeout Error: Task timed out after 60 seconds" - and
 *   47,000 requests to football-data.co.uk, roughly 94,000 a day, from builds
 *   killed before they could finish. That single route was 89% of the whole
 *   Vercel bill and would have run about $59 a month against $20 of included
 *   credit, for a route that returned nothing but errors.
 *
 * It survived so long because nothing visible broke: the static
 * /predictions.json served fine throughout, so the site looked healthy while
 * this hammered a free, volunteer-run dataset the entire model is fitted on.
 *
 * Three failures compounded, and each one is worth a test:
 *
 *   1. A 504 is never cached, so every visitor started a new build.
 *   2. The client's freshness path called it for most visitors, all day.
 *   3. The route's own catch/serve-stale/503 handling never ran ONCE, because
 *      it assumed failure throws. A timeout does not throw - the runtime kills
 *      the invocation. Error handling that cannot run is not error handling.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "api", "predictions.js"), "utf8");
const index = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const api = require("../api/predictions.js");

const res = () => {
  const o = { headers: {}, code: 0, body: null };
  return {
    setHeader: (k, v) => { o.headers[k] = v; },
    status(c) { o.code = c; return this; },
    json(b) { o.body = b; return o; },
    _o: o,
  };
};

/* ------------------------------------------------------- it does not build */

test("the route does not reach the builder at all", () => {
  /* The load-bearing rule. Not "builds rarely" or "builds behind a flag" -
     a route that can build is a route that can spend a minute of CPU on a
     request, and this one is reachable by every visitor. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.ok(!/require\(["'][^"']*lib\/build/.test(code),
    "api/predictions.js must not require lib/build.js");
  assert.ok(!/buildPayload/.test(code),
    "and must not call buildPayload under any condition");
});

test("it answers from the baked file, in milliseconds", async () => {
  const t0 = Date.now();
  const r = res();
  await api({}, r);
  const ms = Date.now() - t0;
  assert.strictEqual(r._o.code, 200);
  assert.ok(ms < 2000, "took " + ms + "ms; a file read should be instant");
  assert.strictEqual(r._o.headers["X-Formline-Cache"], "baked");
  assert.ok(Array.isArray(r._o.body.fixtures), "it must return a real payload");
});

test("the build log is not shipped to the browser", () => {
  /* The baked file carries the build's own log. Readers do not need it and it
     is the largest field that serves no purpose over the wire. */
  const r = res();
  return api({}, r).then(() => {
    assert.ok(!("log" in r._o.body), "the log field must be stripped");
  });
});

/* --------------------------------------------------- and cannot silently 503 */

test("the baked file is bundled with the function", () => {
  /* Without includeFiles the route deploys perfectly and then 503s on every
     single request, because the function bundle does not carry public/. That
     failure looks like a broken deploy and is one config line. */
  const fn = vercel.functions["api/predictions.js"];
  assert.ok(fn, "the route must still be configured");
  assert.ok(String(fn.includeFiles || "").includes("predictions.json"),
    "vercel.json must bundle public/predictions.json with this function");
});

test("its limits match a file read, not a build", () => {
  /* maxDuration is the ceiling on how much CPU one bad request can burn. At 60
     seconds a stuck route costs a minute each time; at 10 it costs ten seconds
     and says so much sooner. */
  const fn = vercel.functions["api/predictions.js"];
  assert.ok(fn.maxDuration <= 15,
    "a reader does not need " + fn.maxDuration + "s; that ceiling is what made "
    + "each failure cost a full minute of CPU");
});

test("the daily rebuild has room to finish", () => {
  /* The build has to happen somewhere. /api/cron is the right place - once a
     day, no audience - but it was capped at the same 60 seconds the build no
     longer fits inside, so it was timing out too and only deploys were keeping
     the data fresh. */
  const cron = vercel.functions["api/cron.js"];
  assert.ok(cron.maxDuration >= 120,
    "the cron builds the whole payload; " + cron.maxDuration + "s is the limit "
    + "the request path just proved too short");
  assert.ok(vercel.crons.some((c) => c.path === "/api/cron"),
    "and it must still be scheduled");
});

/* --------------------------------------------- the client no longer asks */

test("nothing fetches this route on a visitor's behalf", () => {
  /* Where the 577 invocations came from. The client called it whenever the
     baked payload was over six hours old - most of the day - and repainted
     only if the answer was NEWER, which it never could be: both sides read the
     same file, and a deploy replaces the static file and the function bundle
     together. A guaranteed no-op, run by every visitor. */
  const js = index.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.ok(!/refreshPayload/.test(js),
    "the freshness fetch is back; it cannot return anything newer");
  /* The route is still fetched in exactly one place, and that place is
     legitimate: fetchPayload's retry loop, reached only when
     /predictions.json itself failed - which happens for a few seconds during
     a deploy. That is a fallback for a broken load, not a request every
     visitor makes. Pinning the COUNT rather than banning the call keeps the
     fallback while catching a second caller appearing. */
  const calls = (js.match(/fetchJSON\(["']\/api\/predictions["']\)/g) || []).length;
  assert.strictEqual(calls, 1,
    "expected exactly one call, inside fetchPayload's fallback; found " + calls);
  const inFallback = /const q=await fetchJSON\("\/api\/predictions"\);/.test(js);
  assert.ok(inFallback,
    "the one call must be the fallback inside fetchPayload, not a new caller");
});

test("the static file is still what the page reads first", () => {
  /* The route is a fallback, not the source. If this ever inverts, every
     visitor becomes a function invocation instead of a CDN hit. */
  const i = index.indexOf('fetchJSON("/predictions.json")');
  assert.ok(i > 0, "the page must read the baked file from the CDN");
});
