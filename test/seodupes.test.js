"use strict";
/* THE SAME PAGE AT MORE THAN ONE ADDRESS.
 *
 * Search Console, 20 Sep 2026, reported "Alternate page with proper canonical
 * tag" alongside the two exclusions this site chooses on purpose (the noindex
 * on unplayed fixtures, and the 404s left by pages that aged out before the
 * verified-result archive existed). That third one is not a choice, it is a
 * leak, and it was measured against the live site rather than guessed:
 *
 *   200  /matches            canonical -> /matches
 *   200  /matches/           canonical -> /matches      <- same page, second URL
 *   200  /booking-codes/     canonical -> /booking-codes
 *   200  https://skypredict-theta.vercel.app/...        <- whole site, mirrored
 *
 * Every one of them carries the right canonical, so nothing is ranking against
 * itself. What they cost is crawl budget, on the one site whose entire indexing
 * problem is crawl budget: 84 pages indexed against 1,157 not. A crawler that
 * spends a visit on the Vercel mirror of a page it already has is a visit not
 * spent on a page it does not.
 *
 * Both are closed in vercel.json rather than in a page, because neither URL is
 * something the build writes - they are the router answering for addresses
 * nobody generated.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));

test("a trailing slash is a redirect, not a second copy of the page", () => {
  /* /matches has both a file and a directory (prebuild writes matches.html and
     copies it to matches/index.html so it does not matter which one the router
     picks). The cost of that belt and braces is that BOTH /matches and
     /matches/ answered 200. This setting makes the second one a 308. */
  assert.strictEqual(cfg.trailingSlash, false);
  assert.strictEqual(cfg.cleanUrls, true, "and the extensionless URLs stay the canonical form");
});

test("the vercel.app mirror is asked not to be indexed", () => {
  const rule = (cfg.headers || []).find((h) =>
    (h.has || []).some((c) => c.type === "host" && /vercel\.app$/.test(c.value)));
  assert.ok(rule, "the production alias serves the whole site a second time");
  /* Scoped by host. The same deployment answers www.soccerwizard.live, so a
     header without the `has` would noindex the live site - the one mistake
     here that would cost everything rather than a little crawl. */
  assert.deepStrictEqual(rule.has,
    [{ type: "host", value: "skypredict-theta.vercel.app" }]);
  assert.strictEqual(rule.source, "/(.*)", "every path on that host, not one");
  assert.deepStrictEqual(rule.headers, [{ key: "X-Robots-Tag", value: "noindex" }]);
});

test("nothing noindexes the live host", () => {
  for (const h of cfg.headers || []) {
    const robots = (h.headers || []).some((x) => /^x-robots-tag$/i.test(x.key));
    if (!robots) continue;
    assert.ok((h.has || []).some((c) => c.type === "host"),
      "an X-Robots-Tag rule with no host condition applies to soccerwizard.live too");
  }
});
