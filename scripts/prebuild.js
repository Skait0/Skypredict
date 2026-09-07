"use strict";

/**
 * Runs at deploy time (Vercel runs `npm run build`). Two jobs, both about the
 * first paint a visitor gets:
 *
 * 1. Bake the payload into public/predictions.json. Building means fetching
 *    ~60 CSVs and fitting the model, which takes tens of seconds. Doing that
 *    inside a request means the unlucky visitor who arrives on a cold cache
 *    waits for it. Baked at deploy, the page loads from a static file on the
 *    CDN - no serverless invocation at all, which is also what lets the site
 *    take a crowd. /api/predictions stays as the freshness path.
 *
 * 2. Split the one big <style> and the one big <script> out of index.html into
 *    content-hashed files. index.html is ~356KB and every byte of it is
 *    render-blocking; split, a repeat visitor downloads a few KB of HTML and
 *    takes the rest from cache. Hashed names mean they can be cached forever
 *    and still change the moment they actually change.
 *
 * index.html stays a single readable file in git - the split happens on a
 * fresh checkout during the build and is never committed.
 *
 * Neither job may fail the deploy. A missing predictions.json just means the
 * page falls back to the API; an unsplit index.html is simply the old,
 * working, slower page.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUB = path.join(__dirname, "..", "public");
const IDX = path.join(PUB, "index.html");

const log = (m) => console.log("[prebuild] " + m);
const warn = (m) => console.warn("[prebuild] " + m);

function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);
}

/* ---------------------------------------------------------------- 1. bake */
async function bakePayload() {
  let buildPayload, leanResults, MIN;
  try {
    ({ buildPayload, leanResults } = require("../lib/build.js"));
    MIN = require("../api/predictions.js").MIN_HEALTHY_FIXTURES || 20;
  } catch (e) {
    warn("cannot load the builder, skipping bake: " + e.message);
    return;
  }
  const t0 = Date.now();
  /* The pick of the day the live site is already showing. Handed to the
     builder so a redeploy keeps it instead of choosing again - every deploy
     rebakes this file, and re-picking each time is exactly what made the card
     jump off a game that had already been played. Best-effort: no network, a
     cold site or a payload without one simply means a fresh pick, which is
     what used to happen every time anyway. */
  let prevPotd = null, prevFixtures = null, prevPublished = null, prevPayload = null;
  try {
    const origin = process.env.SITE_ORIGIN || "https://skypredict-theta.vercel.app";
    const r = await fetch(origin + "/predictions.json", { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const prev = await r.json();
      /* Kept WHOLE, not just picked over. If this build cannot produce a board
         - which happens when the results feed is down, not only when our code
         is wrong - this is the board the site keeps serving. See the fallback
         below for why that matters more than it sounds. */
      prevPayload = prev;
      prevPotd = prev.potd || null;
      /* The board as readers saw it, tips and all. recordPublishedTips writes
         those tips to the record once the games have been played, which is the
         only way to file the tip we actually showed rather than one this build
         would decide now with a refitted model. */
      prevFixtures = Array.isArray(prev.fixtures) ? prev.fixtures : null;
      /* How many tips each recent day published. Carried forward because
         the board only holds today and onward: once a day rolls over its
         fixtures are gone, and with them any way to know how many there
         were. Recorded, not recomputed. */
      prevPublished = (prev.publishedByDate && typeof prev.publishedByDate === "object")
        ? prev.publishedByDate : null;
    }
    if (prevPotd) log("carrying forward pick of the day: " + prevPotd.home + " v " + prevPotd.away);
  } catch (e) { warn("could not read the live board (" + e.message + "), choosing fresh"); }
  /* THE LAST GOOD BOARD, WHEN THIS BUILD CANNOT MAKE ONE.
   *
   * On 5 Sep 2026 football-data.co.uk returned 503 to everybody for hours.
   * buildPayload refuses under 400 results - correctly - so it threw, this
   * function returned early, and nothing was baked. The comment here used to
   * say "the page will use /api/predictions", and that stopped being true the
   * day /api/predictions became a READER of this very file rather than a
   * builder. So the fallback pointed at something that depends on the thing
   * that just failed:
   *
   *     /predictions.json   404
   *     /api/predictions    503   "no baked payload"
   *
   * A third party we do not control went down and took the whole site's data
   * with it. THAT is ours to fix, and this is the fix: a board from this
   * morning is worth a great deal, and nothing is worth nothing.
   *
   * Marked stale with the reason and the age, so this can be seen from the
   * outside instead of being inferred - a site quietly serving an old board
   * for days is the failure this is one step away from.
   */
  function fallBackToPrevious(why) {
    const fx = (prevPayload && Array.isArray(prevPayload.fixtures)) ? prevPayload.fixtures : null;
    if (!fx || fx.length < MIN) {
      warn("and there is no previous board to fall back on - skipping bake");
      return null;
    }
    warn("carrying the last good board forward: " + fx.length + " fixtures, generated " +
         (prevPayload.generatedAt || "?"));
    return Object.assign({}, prevPayload, {
      stale: true,
      staleReason: String(why || "build failed"),
      staleSince: new Date().toISOString(),
      /* generatedAt is left AS IT WAS on purpose. It is the honest age of
         these numbers, and overwriting it would make a stale board look
         freshly built to every reader and every check we have. */
    });
  }

  let payload;
  try {
    payload = await buildPayload({ prevPotd, prevFixtures, prevPublished });
  } catch (e) {
    warn("build failed: " + e.message);
    payload = fallBackToPrevious(e.message);
    if (!payload) return;
  }
  const n = (payload && Array.isArray(payload.fixtures)) ? payload.fixtures.length : 0;
  if (n < MIN) {
    /* Same rule the API uses: a thin build is a broken feed, not a quiet day,
       and baking one would pin it in place until the next deploy. The previous
       board is a better answer than either the thin one or none at all. */
    warn("only " + n + " fixtures - refusing to bake a thin payload");
    payload = fallBackToPrevious("thin build: " + n + " fixtures");
    if (!payload) return;
  }
  /* The build keeps a running account of where its numbers came from - how
     many results it graded, how many it held back for want of a confirmed
     score, whether the score oracle answered. All of it was dropped here and
     never printed, which is why a morning that graded six games out of thirty
     looked exactly like a morning that graded thirty.
     The lines that say something went short are printed; the rest is dropped
     as before, so the build output stays readable. */
  const { log: buildLog, ...rest } = payload;
  (buildLog || [])
    /* Two lessons are baked into this pattern, both learned the same way.
       `of N confirmed`, not `confirmed from`: the confirmation line stopped
       saying "confirmed from 485 finished" when the fall-through went
       per-fixture, and this whitelist swallowed it for a whole deploy.
       And `^name YYYY-MM-DD:` rather than a list of source names. Every score
       source reports a date it could not answer for in that exact shape, but
       the names were listed one by one, so football-data - added months after
       this line was written - has been reporting into a void ever since. It
       took a held-back Ligue 1 game that football-data demonstrably HAS to
       notice that its side of the story was never printed.
       A filter keyed on another function's wording breaks without failing, so
       both halves are covered by tests that drive this very regex - see
       test/fallback.test.js. */
    /* `committed floor` is the newest, and it walked into the very trap this
       comment describes. The line reads "football-data was UNREACHABLE" while
       the filter tested for "unavailable", so the single most important
       diagnostic this build has - we are fitting on cached history rather than
       live data - printed into a void from the day it was written.
    `downloaded N/M` and `skip <file>` are the ones that say the build was
       working from less data than it thought. A source file that fails to
       download does not fail the build - it just quietly removes a league -
       and until now neither line was printed. */
    .filter((l) => /held back|unavailable|failed|oracle|soccervista|suspended|committed floor|country offsets|record:|recorded result|score source|FT score map|backfill|harvested results|of \d+ confirmed|^\S+ \d{4}-\d{2}-\d{2}:|^downloaded \d+\/\d+|^skip \S+\.csv/i.test(l))
    .forEach((l) => log(l));
  const out = path.join(PUB, "predictions.json");
  /* The file the site downloads, without the per-result model numbers - they
     exist for the match pages, which are generated below from `rest` while it
     still has them. */
  fs.writeFileSync(out, JSON.stringify(leanResults(rest)));
  log("baked " + n + " fixtures -> predictions.json (" +
      (fs.statSync(out).size / 1024).toFixed(0) + " KB, " +
      ((Date.now() - t0) / 1000).toFixed(1) + "s)");
  return rest;
}

/* ------------------------------------------------------------- 1b. pages */
/**
 * A static page per match, plus the two files that let a crawler find them.
 *
 * The whole app is one URL, so every prediction we publish is invisible to
 * search. These are the landing pages for them, built from the payload we
 * just baked - same numbers, no second source.
 *
 * A page is written for finished matches too, at the same address the fixture
 * had. A link shared before kick-off keeps working, and the archive of what we
 * tipped against what happened builds itself.
 */
async function writePages(payload) {
  let P;
  try {
    P = require("../lib/pages.js");
  } catch (e) {
    warn("cannot load the page renderer, skipping: " + e.message);
    return;
  }
  /* Fall back to whatever is already on disk. A skipped bake is exactly when
     the feeds are unwell, and dropping every match page for a day would undo
     far more than it protects. */
  if (!payload) {
    try {
      payload = JSON.parse(fs.readFileSync(path.join(PUB, "predictions.json"), "utf8"));
      log("pages: using the predictions.json already on disk");
    } catch (e) {
      warn("no payload for pages, skipping: " + e.message);
      return;
    }
  }

  const K = require("../lib/key.js");
  const DB = require("../lib/supabase.js");
  const fixtures = Array.isArray(payload.fixtures) ? payload.fixtures : [];
  const results = Array.isArray(payload.results) ? payload.results : [];

  const byKey = new Map();
  for (const r of results) {
    if (r && r.date && r.home && r.away) byKey.set(K.fixtureKey(r.date, r.home, r.away), r);
  }

  /* Fixtures first so their model numbers win, then any result whose match has
     already left the board - that is most of the archive. */
  const seen = new Set(), pages = [];
  for (const f of fixtures) {
    if (!f || !f.date || !f.home || !f.away) continue;
    const key = K.fixtureKey(f.date, f.home, f.away);
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push({ f: f, r: byKey.get(key) || null });
  }
  for (const r of results) {
    if (!r || !r.date || !r.home || !r.away) continue;
    const key = K.fixtureKey(r.date, r.home, r.away);
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push({ f: r, r: r });
  }

  /* THE ARCHIVE, SO A PAGE STOPS BEING TEMPORARY.
   *
   * The two loops above see only what is on the board: 21 days of fixtures and
   * 14 of results. Everything older simply stopped being written, and its URL
   * 404ed - /m/liverpool-vs-bournemouth-2026-08-15 was gone within a month of
   * the match. Search Console reported 84 pages indexed against 1,157 not,
   * 1,080 of them "Discovered - currently not indexed", which is what a crawler
   * does after it queues URLs that are not there when it arrives.
   *
   * So every result we have ever VERIFIED gets a page, permanently. Not every
   * result: verifiedResults refuses the sweep's own guesses, because a page is
   * forever and a wrong score on one is forever too.
   *
   * Non-fatal by construction, like every other enrichment in this build. With
   * no Supabase configured, or on any failure, the page set is exactly what it
   * was and the deploy carries on. */
  let archived = 0;
  try {
    const got = await DB.verifiedResults();
    if (got.ok) {
      for (const r of got.rows) {
        if (!r || !r.match_date || !r.home || !r.away) continue;
        if (r.hg == null || r.ag == null) continue;
        const key = K.fixtureKey(r.match_date, r.home, r.away);
        if (seen.has(key)) continue;
        seen.add(key);
        /* r.model carries the probabilities the page prints - written down
           when the match was still a fixture, which is the only moment they
           were true.

           SPREAD FIRST, IDENTITY SECOND. The other way round, any key in the
           model JSON overwrites the field of the same name: a model carrying
           `home` renames the club to a probability, and the page ships titled
           "0.61 vs 0.19". Today the keys are home_p/away_p so it cannot happen,
           but that is a naming convention holding up a page title, and this
           order means it does not have to. */
        const row = Object.assign({},
          (r.model && typeof r.model === "object") ? r.model : {}, {
            date: r.match_date, league: r.league || "", home: r.home, away: r.away,
            hg: r.hg, ag: r.ag, tip: r.tip, hit: r.hit, tip_p: r.tip_p,
            recorded: true,
          });
        pages.push({ f: row, r: row });
        archived++;
      }
    } else if (got.why !== "not configured") {
      warn("archive unavailable, pages are board-only this build: " + got.why);
    }
  } catch (e) {
    warn("archive failed, pages are board-only this build: " + e.message);
  }

  const dir = path.join(PUB, "m");
  fs.mkdirSync(dir, { recursive: true });
  /* Clear the directory first. On Vercel this is a no-op - every build starts
     from a fresh checkout - but locally the pages accumulate, and a fixture
     that has dropped off the card leaves its page behind holding whatever the
     numbers were the day it was written. That page then answers checks made
     against the whole directory, which is how a percentage bug appeared to
     survive a fix it had never been through. */
  let swept = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".html")) { fs.unlinkSync(path.join(dir, f)); swept++; }
    }
  } catch (e) { warn("could not clear public/m: " + e.message); }
  const paths = [];
  /* Every page needs the rest of its own day, so the grouping happens once
     here rather than per page - see sameDayBlock in lib/pages.js. */
  const sameDay = P.groupByDate(pages.map((pg) => pg.f));
  let written = 0, failed = 0, skipped = 0;
  for (const pg of pages) {
    try {
      const rel = P.pagePath(pg.f);
      fs.writeFileSync(path.join(PUB, rel + ".html"),
        P.renderMatchPage(pg.f, pg.r, sameDay[pg.f.date]));
      /* A played match is dated by the day it was played, not by this build.
         Its page is the score and how our tip did against it, and neither
         changes again - see renderSitemap for what claiming otherwise cost us.
         An upcoming fixture keeps the build date, because its prediction
         genuinely is rebaked every deploy. */
      /* Only the graded pages are SUBMITTED. An unplayed fixture is written -
         it is the page a reader lands on from the board - but it carries
         noindex, and a sitemap is a list of pages you are asking to have
         indexed. Listing one we have told Google to skip is a contradiction it
         reports back as an error. See renderMatchPage for why the two halves
         are treated differently. */
      const played = pg.r && pg.r.hg != null && pg.r.ag != null;
      if (played) paths.push({ path: rel, lastmod: pg.r.date || pg.f.date });
      else skipped++;
      written++;
    } catch (e) {
      failed++;
      if (failed === 1) warn("page failed (" + (pg.f && pg.f.home) + "): " + e.message);
    }
  }

  /* The standing pages: contact, privacy, terms, method, and the hub that
     makes every match page reachable by a link rather than only by sitemap.
     They go into the sitemap alongside the match pages, and they are written
     after them so `paths` already holds the full set. */
  const updated = new Date().toLocaleDateString("en-GB",
    { day: "numeric", month: "long", year: "numeric" });
  /* `matches` is the training set the model was fitted on - 29,594 of them
     today. `results` is only the recent graded ones, 199, and using it made
     the method page claim the model was built from 199 results. Same two
     fields the site footer already uses, so the pages agree. */
  const stats = {
    results: (payload && payload.matches) || null,
    leagues: (payload && payload.leagues && payload.leagues.length) || null,
    /* Per-market calibration, published on /how-it-works. Every market graded
       on every held-out match, not just the headline tip - see
       gradeEveryMarket in lib/model.js. */
    markets: (payload && payload.record && payload.record.markets) || null,
  };
  const standing = [
    ["/privacy", () => P.renderPrivacy(updated)],
    ["/terms", () => P.renderTerms(updated)],
    ["/how-it-works", () => P.renderHowItWorks(stats)],
    ["/matches", () => P.renderMatchesIndex(pages.map((pg) => pg.f))],
    ["/how-to-load-a-booking-code", () => P.renderHowToCode()],
  ];

  /* One page per day, written before the standing pages so `paths` carries
     them into the sitemap. A day page is dated by its own day rather than by
     the build: a past day stops changing once its last match is graded, which
     is the whole reason for splitting the hub - see renderMatchesIndex. */
  const byDay = P.groupByDate(pages.map((pg) => pg.f));
  const today = new Date().toISOString().slice(0, 10);
  let dayPages = 0;
  try {
    fs.mkdirSync(path.join(PUB, "matches"), { recursive: true });
    for (const d of Object.keys(byDay)) {
      const rel = P.matchesDayPath(d);
      fs.writeFileSync(path.join(PUB, rel.slice(1) + ".html"), P.renderMatchesDay(d, byDay[d]));
      paths.push(d < today ? { path: rel, lastmod: d } : rel);
      dayPages++;
    }
  } catch (e) { warn("day pages failed: " + e.message); }
  let standingWritten = 0;
  for (const [rel, render] of standing) {
    try {
      fs.writeFileSync(path.join(PUB, rel.slice(1) + ".html"), render());
      paths.push(rel);
      standingWritten++;
    } catch (e) { warn("standing page " + rel + " failed: " + e.message); }
  }

  /* /matches now has both a FILE (matches.html) and a DIRECTORY (matches/),
     and which one cleanUrls serves for the bare path is a detail of Vercel's
     router rather than something this build controls. Writing the hub to both
     costs one file and removes the question - whichever it picks, it is the
     same page. The path goes into the sitemap once, above. */
  try {
    fs.copyFileSync(path.join(PUB, "matches.html"),
                    path.join(PUB, "matches", "index.html"));
  } catch (e) { warn("matches/index.html failed: " + e.message); }

  /* The 404 is written like the standing pages but is NOT one of them: it
     never goes in `paths`, because a sitemap is a list of pages that exist and
     listing a 404 asks a crawler to index the thing telling it to go away.
     Vercel serves public/404.html for any unmatched route on its own. */
  let notFound = false;
  try {
    fs.writeFileSync(path.join(PUB, "404.html"), P.renderNotFound());
    notFound = true;
  } catch (e) { warn("404 page failed: " + e.message); }

  fs.writeFileSync(path.join(PUB, "sitemap.xml"), P.renderSitemap(paths));
  fs.writeFileSync(path.join(PUB, "robots.txt"), P.renderRobots());
  log("pages: " + written + " match pages (" + (written - skipped) + " submitted, " +
      skipped + " noindex until played) + " + dayPages + " day pages" + (failed ? " (" + failed + " failed)" : "") +
      " + " + standingWritten + " standing + " + (notFound ? "404 + " : "") +
      "sitemap.xml + robots.txt -> " + P.ORIGIN +
      (swept ? " (cleared " + swept + " stale)" : ""));
}

/* -------------------------------------------------------------- 1c. host */
/**
 * Point the built site at whatever host it is being deployed to.
 *
 * The hostname is written into the page in three places a build cannot reach
 * from lib/pages.js: the og:image and twitter:image tags, and - easy to miss -
 * the share-image canvas, which literally draws the domain onto every picture
 * anybody shares. The manifest names it too.
 *
 * None of that breaks when a custom domain is added, because Vercel keeps
 * serving the .vercel.app name as well. What it does is quietly send the new
 * domain's SEO to the old one: pages served from the new host would carry
 * canonical tags naming the old, and search engines would consolidate on the
 * old. So this exists to make buying a domain one environment variable rather
 * than a hunt through the source.
 *
 * Set SITE_ORIGIN on Vercel and everything - canonicals, sitemap, robots,
 * social cards, the share image - follows.
 *
 * It is https://www.soccerwizard.live as of 1 Sep 2026. The bare domain
 * 308s to www, so SITE_ORIGIN has to be the www form: pointing it at the
 * apex would have every canonical tag and every sitemap URL naming a page
 * that immediately redirects somewhere else, which is exactly the split this
 * whole mechanism exists to prevent.
 */
const DEFAULT_ORIGIN = "https://skypredict-theta.vercel.app";
function applyOrigin() {
  const raw = process.env.SITE_ORIGIN;
  if (!raw) return;
  const to = raw.replace(/\/+$/, "");
  if (to === DEFAULT_ORIGIN) return;
  /* Rewrites tracked files, so it may only run where the checkout is thrown
     away - the same rule the asset split follows, and for the same reason. */
  if (!process.env.VERCEL && !process.env.SPLIT) {
    log("SITE_ORIGIN is set but this is not a deploy - leaving the source alone");
    return;
  }
  const toHost = to.replace(/^https?:\/\//, "");
  const fromHost = DEFAULT_ORIGIN.replace(/^https?:\/\//, "");
  const touched = [];
  for (const rel of ["index.html", "manifest.webmanifest"]) {
    const f = path.join(PUB, rel);
    try {
      const before = fs.readFileSync(f, "utf8");
      /* Full URL first, then any bare hostname left over - the canvas draws
         the host on its own, without a scheme. */
      const after = before.split(DEFAULT_ORIGIN).join(to).split(fromHost).join(toHost);
      if (after !== before) { fs.writeFileSync(f, after); touched.push(rel); }
    } catch (e) {
      warn("origin rewrite skipped for " + rel + ": " + e.message);
    }
  }
  log("origin -> " + to + (touched.length ? " (" + touched.join(", ") + ")" : " (nothing to change)"));
}

/* --------------------------------------------------------------- 2. split */
function biggest(html, re) {
  const found = [...html.matchAll(re)];
  if (!found.length) return null;
  return found.sort((a, b) => b[1].length - a[1].length)[0];
}

function splitAssets() {
  /* This rewrites the source file in place, so it may only run where the
     checkout is disposable. On Vercel that is true - the build tree is thrown
     away after deploy. On a developer's machine it is not: public/index.html
     is the source of truth in git, and it is the one generated file that is
     not gitignored, because it is also its own input. Running here left the
     560KB source replaced by the 60KB built page, whose CSS and JS live in
     gitignored files - so a `git add` on the same command line committed a
     page with no styles and no script at all.
     The split is only ever an optimisation; an unsplit page is the old,
     un-optimised one and works fine. So off Vercel, do nothing. SPLIT=1 is
     there for inspecting the real output, and warns that it is destructive. */
  if (!process.env.VERCEL && !process.env.SPLIT) {
    log("not a Vercel build - leaving public/index.html alone (SPLIT=1 to force)");
    return;
  }

  let html;
  try {
    html = fs.readFileSync(IDX, "utf8");
  } catch (e) {
    warn("no index.html to split: " + e.message);
    return;
  }
  if (/<link[^>]+href="\/app\.[0-9a-f]+\.css"/.test(html)) {
    log("index.html is already split, nothing to do");
    return;
  }

  const before = Buffer.byteLength(html);

  const style = biggest(html, /<style[^>]*>([\s\S]*?)<\/style>/g);
  if (style) {
    const name = "app." + hash(style[1]) + ".css";
    fs.writeFileSync(path.join(PUB, name), style[1]);
    html = html.replace(style[0], '<link rel="stylesheet" href="/' + name + '">');
    log("extracted " + name + " (" + (style[1].length / 1024).toFixed(0) + " KB)");
  } else {
    warn("no <style> found");
  }

  /* Only inline scripts, and only the big one. The three small blocks stay
     where they are: the theme bootstrap has to run before first paint or the
     page flashes the wrong colours, and the other two are self-contained and
     too small to be worth a request. None of them call into the big block, so
     deferring it cannot break them. */
  const script = biggest(html, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g);
  if (script) {
    const name = "app." + hash(script[1]) + ".js";
    fs.writeFileSync(path.join(PUB, name), script[1]);
    html = html.replace(script[0], '<script defer src="/' + name + '"></script>');
    log("extracted " + name + " (" + (script[1].length / 1024).toFixed(0) + " KB)");
  } else {
    warn("no inline <script> found");
  }

  fs.writeFileSync(IDX, html);
  log("index.html " + (before / 1024).toFixed(0) + " KB -> " +
      (Buffer.byteLength(html) / 1024).toFixed(0) + " KB");

  if (!process.env.VERCEL) {
    warn("SPLIT=1 - public/index.html has been rewritten in place.");
    warn("Restore it before committing:  git checkout public/index.html");
  }
}

/* ---------------------------------------------------------- share card
 *
 * The card people see when the link is pasted into WhatsApp or X. It carries
 * two figures, and both used to be painted into a JPEG by hand: within a day
 * of shipping, the picture said "45 leagues" while the board carried 47, and
 * nothing in the build could have noticed.
 *
 * lib/ogcard.js composites the digits onto a baked background and encodes a
 * PNG with nothing but zlib, so the card is now rebuilt from the payload on
 * every deploy and cannot drift from it.
 */
function writeCard(payload) {
  if (!payload) { warn("no payload, keeping the existing share card"); return; }
  let card;
  try {
    card = require("../lib/ogcard.js");
  } catch (e) { warn("share card unavailable: " + e.message); return; }

  const leagues = payload.leagues && payload.leagues.length;
  const rec = payload.record;
  const pct = rec && rec.total ? Math.round((rec.correct / rec.total) * 100) : null;

  let png = null;
  try {
    png = card.buildCard({ leagues: leagues, pct: pct });
  } catch (e) { warn("share card failed: " + e.message); return; }

  /* buildCard returns null rather than throwing when a figure will not fit the
     cells baked for it. Yesterday's card is a far better outcome than a card
     with a hole in it, or a failed deploy. */
  if (!png) {
    warn("share card not rebuilt: leagues=" + leagues + " pct=" + pct +
         " does not fit the baked two-digit slots; keeping the last one");
    return;
  }
  fs.writeFileSync(path.join(PUB, "og-card.png"), png);
  log("share card: " + leagues + " leagues, " + pct + "% -> og-card.png (" +
      (png.length / 1024).toFixed(0) + " KB)");
}

/* ------------------------------------------------------------------- run */
(async () => {
  const payload = await bakePayload();
  await writePages(payload);
  writeCard(payload);
  /* Before the split, so the hostname inside the big inline script - the
     share-image canvas - is rewritten while it is still in the page. */
  applyOrigin();
  splitAssets();
})().catch((e) => {
  /* Never fail the deploy over an optimisation. */
  warn("unexpected error, continuing: " + (e && e.message));
});
