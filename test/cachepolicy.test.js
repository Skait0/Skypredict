"use strict";

/* The cache policy is now the thing standing between a million readers and
   the bandwidth bill, so the rules it has to obey are pinned here rather than
   left to the comments.

   Three of them, in order of how much they would cost to get wrong:

     1. Every cacheable response carries all three headers. Setting only
        Cache-Control is the exact bug this module exists to fix - Vercel eats
        it and Cloudflare caches nothing.
     2. Cloudflare never holds a copy longer than Vercel does, and for
        anything the build produces it holds one only briefly, because
        Cloudflare cannot be purged by a deploy.
     3. Nothing got staler. The two caches lapse independently, so what a
        reader can be served is cdn + vercel, and for every upstream feed that
        sum is what the single header already allowed. */

const test = require("node:test");
const assert = require("node:assert");

const {
  BROWSER_REVALIDATE, NO_STORE,
  cacheHeaders, applyCache, windowOf, worstCaseStaleness,
} = require("../lib/cachepolicy.js");
const { FEEDS, feedResponse } = require("../lib/upstream.js");
const predictions = require("../api/predictions.js");

/* The windows each feed allowed when one header carried the whole policy.
   Copied from git history deliberately: if someone widens a window later, the
   staleness test should fail and make them say so out loud. */
const BEFORE = { live: 20, fixtures: 600, bet9ja: 600 };

/* A deploy must be visible within this. The board is baked at build time and
   Cloudflare has no idea a build happened, so its window IS the delay. */
const DEPLOY_VISIBLE_S = 300;

function fakeRes() {
  const headers = {};
  return { headers, setHeader(k, v) { headers[k] = v; } };
}

test("a policy becomes exactly the three headers, and no others", () => {
  const h = cacheHeaders({ browser: "b", cdn: "c", vercel: "v" });
  assert.deepEqual(h, {
    "Cache-Control": "b",
    "CDN-Cache-Control": "c",
    "Vercel-CDN-Cache-Control": "v",
  });
});

test("applyCache sets them on the response", () => {
  const res = fakeRes();
  applyCache(res, { browser: "b", cdn: "c", vercel: "v" });
  assert.equal(res.headers["Cache-Control"], "b");
  assert.equal(res.headers["CDN-Cache-Control"], "c");
  assert.equal(res.headers["Vercel-CDN-Cache-Control"], "v");
});

test("windowOf reads s-maxage, and treats a refusal as zero", () => {
  assert.equal(windowOf("public, s-maxage=300, stale-while-revalidate=3600"), 300);
  assert.equal(windowOf("no-store"), 0);
  assert.equal(windowOf("public"), 0, "a bare public stores nothing we can count on");
  assert.equal(windowOf(undefined), 0);
});

test("NO_STORE refuses on all three tiers, not just the browser", () => {
  /* The whole point: a shared slip or a booking must not be able to land in a
     shared cache because somebody later widened a Cloudflare rule. */
  assert.equal(NO_STORE.browser, "no-store");
  assert.equal(NO_STORE.cdn, "no-store");
  assert.equal(NO_STORE.vercel, "no-store");
});

/* ---- the feeds ---- */

for (const name of Object.keys(FEEDS)) {
  test(name + ": carries a CDN window as well as a Vercel one", () => {
    const feed = FEEDS[name];
    assert.match(feed.cache, /s-maxage=\d+/, "Vercel window missing");
    assert.match(feed.cdn, /s-maxage=\d+/, "CDN window missing - Cloudflare would cache nothing");
  });

  test(name + ": Cloudflare never holds it longer than Vercel", () => {
    /* Cloudflare is the one that cannot be purged, so it is never the one
       holding the older copy. */
    assert.ok(windowOf(FEEDS[name].cdn) <= windowOf(FEEDS[name].cache),
      name + ": cdn window must not exceed the Vercel window");
  });

  test(name + ": is no staler than it was before the split", () => {
    const total = windowOf(FEEDS[name].cdn) + windowOf(FEEDS[name].cache);
    assert.ok(total <= BEFORE[name],
      name + ": worst case is now " + total + "s against " + BEFORE[name] + "s before");
  });

  test(name + ": a served response sets all three headers", () => {
    const feed = FEEDS[name];
    const out = feedResponse({ ok: true, body: { matches: [] } }, null, feed.cache, feed.cdn);
    const res = fakeRes();
    applyCache(res, {
      browser: out.browser || BROWSER_REVALIDATE,
      cdn: out.cdnCacheControl,
      vercel: out.cacheControl,
    });
    assert.equal(res.headers["Vercel-CDN-Cache-Control"], feed.cache);
    assert.equal(res.headers["CDN-Cache-Control"], feed.cdn);
    assert.ok(res.headers["Cache-Control"], "the browser still needs an instruction");
  });
}

test("an outage is not pinned in Cloudflare for longer than in Vercel", () => {
  const out = feedResponse({ ok: false, why: "timeout" }, { matches: [] },
    FEEDS.live.cache, FEEDS.live.cdn);
  assert.equal(out.tag, "stale-after-error");
  assert.ok(windowOf(out.cdnCacheControl) <= windowOf(out.cacheControl),
    "the un-purgeable cache must be the one that lets go first");
  assert.ok(worstCaseStaleness({ cdn: out.cdnCacheControl, vercel: out.cacheControl }) <= 20,
    "a stale board must clear in seconds");
});

test("a total upstream failure is cached nowhere at all", () => {
  const out = feedResponse({ ok: false, why: "econnrefused" }, null,
    FEEDS.live.cache, FEEDS.live.cdn);
  assert.equal(out.status, 502);
  assert.equal(out.cacheControl, "no-store");
  assert.equal(out.cdnCacheControl, "no-store", "a 502 in Cloudflare outlives the outage");
  assert.equal(out.browser, "no-store");
});

/* ---- the board ---- */

test("the board's Cloudflare window is short enough for a deploy to show", () => {
  /* Vercel may hold it for six hours because a deployment drops that cache.
     Cloudflare gets no such signal, so its window is the whole delay between
     pushing a fix and anyone seeing it. */
  const cdn = windowOf(predictions.FULL_CACHE_CDN);
  assert.ok(cdn > 0, "the board must be cacheable at Cloudflare - that is the bandwidth");
  assert.ok(cdn <= DEPLOY_VISIBLE_S,
    "a deploy would take " + cdn + "s to reach readers; cap is " + DEPLOY_VISIBLE_S + "s");
  assert.ok(cdn < windowOf(predictions.FULL_CACHE),
    "Cloudflare must let go well before Vercel, which a deploy can purge");
});

test("a degraded board clears from Cloudflare faster than a healthy one", () => {
  /* A thin board is a bug being served. The fix arrives as a build, so the
     copy nobody can purge has to be the shortest-lived thing on the site. */
  assert.ok(windowOf(predictions.SHORT_CACHE_CDN) < windowOf(predictions.FULL_CACHE_CDN));
  assert.ok(windowOf(predictions.SHORT_CACHE_CDN) <= windowOf(predictions.SHORT_CACHE));
});

test("chooseResponse hands both windows to the route", () => {
  const healthy = { fixtures: Array.from({ length: 167 }, (_, i) => ({ id: i })) };
  const good = predictions.chooseResponse(healthy, null);
  assert.equal(good.cacheControl, predictions.FULL_CACHE);
  assert.equal(good.cdnCacheControl, predictions.FULL_CACHE_CDN);

  const thin = predictions.chooseResponse({ fixtures: [{ id: 1 }] }, null);
  assert.equal(thin.cacheControl, predictions.SHORT_CACHE);
  assert.equal(thin.cdnCacheControl, predictions.SHORT_CACHE_CDN);
});

/* ---- the regression this whole module exists to prevent ---- */

test("no cacheable route may set Cache-Control alone", () => {
  /* THE BUG, stated as a test. Every route below once set a considered
     s-maxage through Cache-Control and only Cache-Control; Vercel consumed it
     and rewrote the header to a bare `public`, so Cloudflare saw no window,
     cached nothing, and forwarded ~2.3 MB per visitor to be billed as Vercel
     egress. A response that is meant to be cached and names only one audience
     is that bug coming back. */
  const fs = require("fs");
  const path = require("path");
  const roots = ["api", "lib"];
  const offenders = [];
  for (const dir of roots) {
    for (const f of fs.readdirSync(path.join(__dirname, "..", dir))) {
      if (!f.endsWith(".js")) continue;
      const rel = dir + "/" + f;
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      /* A literal Cache-Control setHeader with an s-maxage in it, which is
         the shape that silently does nothing downstream. */
      const re = /setHeader\(\s*["']Cache-Control["']\s*,\s*[^)]*s-maxage/g;
      if (re.test(src)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [],
    "these set a CDN window on Cache-Control, which Vercel strips: " + offenders.join(", "));
});
