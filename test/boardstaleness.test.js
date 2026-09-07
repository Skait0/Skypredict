"use strict";
/**
 * THE STATIC BOARD MUST NOT BE ALLOWED TO GO A DAY STALE.
 *
 * Measured on 7 Sep 2026, minutes after a deploy that landed at 00:06 UTC:
 * the page fetched /predictions.json and got a board stamped `generated:
 * 2026-09-06`, with none of that day's Champions League ties on it, while the
 * same URL with a cache-busting query returned the new file. The response
 * carried `x-vercel-cache: HIT`, `age: 292` and:
 *
 *   Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
 *
 * That `stale-while-revalidate=86400` is the whole bug. Vercel's edge is
 * entitled to serve the old object for a DAY while it refreshes in the
 * background, and a deploy did not reliably clear it - the comment in
 * lib/cachepolicy.js assumes deploys make a long Vercel window moot, and this
 * is the case where that assumption did not hold.
 *
 * So this file pins the one thing that matters: worst-case staleness on the
 * board, which is `fresh + stale` on each cache, summed across the two caches
 * that sit in front of a reader. The board is rebuilt daily and redeployed on
 * every push; a reader should never be more than about an hour behind it.
 *
 * The three-header split is lib/cachepolicy.js's rule, and the reasoning there
 * applies unchanged to this static file: Vercel eats s-maxage before
 * Cloudflare ever sees it, so a single header cannot serve both. CLOUDFLARE IS
 * NOT DEPLOY-AWARE, which is why its window is the short one.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

/* The header block vercel.json applies to the static board. */
const rule = (vercel.headers || []).find((h) => h.source === "/predictions.json");
const header = (name) => {
  const h = ((rule && rule.headers) || []).find((x) => x.key === name);
  return h ? h.value : null;
};

/* How long a cache may serve a given response before a reader is guaranteed to
   see a newer one. Imported rather than redefined: lib/cachepolicy.js owns this
   arithmetic for every route that calls applyCache, and the static board is the
   one cacheable surface that never does - it is served straight from
   vercel.json. Keeping a private copy here is how the two drift, and the drift
   is the bug this file exists for.

   A browser-only header (max-age, no s-maxage) is still counted, because
   vercel.json can set one and a browser copy is no more purgeable than a CDN's. */
const { servedAgeOf } = require("../lib/cachepolicy.js");

function worstCase(value) {
  if (!value) return null;
  if (/no-store/.test(value)) return 0;
  const shared = servedAgeOf(value);
  if (shared > 0) return shared;
  const m = /(?:^|[,\s])max-age=(\d+)/.exec(value);
  const swr = /stale-while-revalidate=(\d+)/.exec(value);
  return (m ? Number(m[1]) : 0) + (swr ? Number(swr[1]) : 0);
}

const HOUR = 3600;

test("the board carries a rule at all", () => {
  assert.ok(rule, "vercel.json has no header block for /predictions.json");
});

test("no cache in front of a reader may hold the board for a day", () => {
  /* The exact failure of 7 Sep: 3600 + 86400 = 25 hours. */
  for (const name of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) {
    const v = header(name);
    if (v === null) continue;
    assert.ok(worstCase(v) <= 2 * HOUR,
      name + " lets the board go " + (worstCase(v) / HOUR).toFixed(1) +
      " hours stale: " + v);
  }
});

test("the two caches together stay inside an hour and a half", () => {
  /* They lapse independently, so the reader's worst case is the SUM - the
     invariant lib/cachepolicy.js states and this file inherits. */
  const total = worstCase(header("Vercel-CDN-Cache-Control")) +
                worstCase(header("CDN-Cache-Control"));
  assert.ok(total <= 1.5 * HOUR,
    "worst-case staleness is " + (total / HOUR).toFixed(2) + " hours (" + total + "s)");
});

test("all three tiers are set, or Vercel rewrites what Cloudflare sees", () => {
  /* Setting only Cache-Control is what put the site here. Vercel consumes
     s-maxage and stale-while-revalidate for its own edge and hands the client
     something else; the split is the only way to address the two caches
     separately. See the measurement in lib/cachepolicy.js. */
  for (const name of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) {
    assert.ok(header(name), "/predictions.json is missing " + name);
  }
});

test("Cloudflare's window is the shorter one, because it never hears about a deploy", () => {
  const cdn = worstCase(header("CDN-Cache-Control"));
  const vc = worstCase(header("Vercel-CDN-Cache-Control"));
  assert.ok(cdn <= vc,
    "the CDN in front of Vercel must not outlive Vercel's own window: " +
    cdn + "s vs " + vc + "s");
});

test("the browser revalidates rather than holding its own copy", () => {
  /* Same trade the feeds make: a conditional request Cloudflare answers costs
     a round trip and no bytes, and it is the only tier we cannot purge. */
  const browser = header("Cache-Control");
  assert.match(browser, /max-age=0/,
    "a browser copy of the board cannot be purged when the build moves: " + browser);
  assert.match(browser, /must-revalidate/, "got: " + browser);
});
