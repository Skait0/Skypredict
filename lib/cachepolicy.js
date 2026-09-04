"use strict";

/**
 * Cache headers for three different audiences.
 *
 * WHY THIS EXISTS, AND WHAT WAS ACTUALLY BROKEN. Every cacheable route here
 * already carried a considered `s-maxage` - the feed proxy's comments argue
 * carefully about twenty seconds versus ten minutes - and none of it ever
 * reached Cloudflare. Vercel consumes `s-maxage` and `stale-while-revalidate`
 * for its own edge and rewrites the header it sends downstream.
 *
 * Measured 4 Sep 2026, straight at the Vercel origin with Cloudflare out of
 * the path, so this is Vercel's transform and not Cloudflare's:
 *
 *   /api/slipcard asks for  public, max-age=31536000, s-maxage=31536000, immutable
 *   the client receives     public
 *
 * The consequence was the whole bandwidth bill. Cloudflare sits in front of
 * Vercel; handed a bare `public` with no window it can honour, it marks every
 * feed DYNAMIC and forwards it. So ~2.3 MB of byte-identical JSON - the
 * SportyBet card, the Bet9ja card and the board - was fetched through
 * Cloudflare from Vercel for every single visitor, and billed as Vercel
 * egress every time. At a million visitors a month that is ~3.4 TB against a
 * 1 TB allowance.
 *
 * The remedy is to stop making one header serve three audiences:
 *
 *   Vercel-CDN-Cache-Control   Vercel's own edge. Stripped before the client.
 *   CDN-Cache-Control          CDNs in FRONT of Vercel - Cloudflare. Forwarded.
 *   Cache-Control              the browser. Vercel leaves it alone once the
 *                              other two are present, which is the second
 *                              reason to always set them together.
 *
 * THE RULE THAT SHAPES EVERY NUMBER: CLOUDFLARE IS NOT DEPLOY-AWARE.
 *
 * Vercel drops its own cache when a deployment goes out, which is why
 * /api/predictions can hold a six-hour window safely - a deploy makes it moot.
 * Cloudflare has never heard of the deploy and will serve what it has until
 * its own TTL lapses. So a CDN window is NEVER a copy of the Vercel one.
 * Anything the build can change gets a window short enough that a deploy is
 * visible within it; anything fetched from upstream gets a window split with
 * Vercel rather than added to it.
 *
 * Which gives the invariant the tests enforce, and the one thing this change
 * was not allowed to do: THE SITE MUST NOT GET STALER. The two caches lapse
 * independently, so worst-case staleness is `cdn + vercel`, and for every
 * upstream feed that sum is exactly what the single header allowed before.
 * Bandwidth was the thing being bought here, not freshness.
 */

/* The browser revalidates rather than holding a copy.
 *
 * Deliberate, and it costs a little: a real `max-age` on the two fixture
 * feeds would spare a returning reader 1.85 MB. But those payloads carry the
 * odds a slip is priced from, and a slip built on a stale price is refused at
 * the bookmaker - `_unbookable`, which costs the reader a prompt and a retry.
 * The edge windows below already spend the staleness budget the booking path
 * can absorb. Spending more of it in a place we cannot purge, to save
 * bandwidth that Cloudflare is about to stop charging for anyway, is a bad
 * trade in exactly the direction that hurts.
 *
 * `max-age=0, must-revalidate` still means a conditional request that
 * Cloudflare answers - the bytes stay saved, only the round trip remains. */
const BROWSER_REVALIDATE = "public, max-age=0, must-revalidate";

/* Nothing keeps this, anywhere.
 *
 * Set on all three tiers rather than just `Cache-Control`, and that is not
 * decoration. The Cloudflare rule that makes this change work names the four
 * safe read-only feeds explicitly, but rules get broadened by whoever comes
 * next, and the routes carrying no-store include shared slips and the booking
 * proxy - per-reader things that must never sit in a shared cache. This makes
 * the refusal travel with the response instead of depending on the rule
 * staying narrow. */
const NO_STORE = { browser: "no-store", cdn: "no-store", vercel: "no-store" };

/* Pure: the headers a policy becomes. Separated from the response so the rule
   can be driven in a test without a server, the same standard feedResponse
   and chooseResponse are held to. */
function cacheHeaders(policy) {
  const p = policy || {};
  const out = {};
  if (p.browser) out["Cache-Control"] = p.browser;
  if (p.cdn) out["CDN-Cache-Control"] = p.cdn;
  if (p.vercel) out["Vercel-CDN-Cache-Control"] = p.vercel;
  return out;
}

function applyCache(res, policy) {
  const headers = cacheHeaders(policy);
  for (const name of Object.keys(headers)) res.setHeader(name, headers[name]);
  return headers;
}

/* The s-maxage in a policy string, or 0 for one that forbids storing.
   Used by the tests that hold the staleness budget, so it lives beside the
   thing it measures rather than being re-derived per test file. */
function windowOf(cacheControl) {
  if (!cacheControl || /no-store/.test(cacheControl)) return 0;
  const m = /s-maxage=(\d+)/.exec(cacheControl);
  return m ? Number(m[1]) : 0;
}

/* Worst-case age a reader can be served, given that the two caches lapse
   independently. This is the number the "must not get staler" tests compare
   against the window the single header used to allow. */
function worstCaseStaleness(policy) {
  const p = policy || {};
  return windowOf(p.cdn) + windowOf(p.vercel);
}

module.exports = {
  BROWSER_REVALIDATE, NO_STORE,
  cacheHeaders, applyCache, windowOf, worstCaseStaleness,
};
