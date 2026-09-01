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
  let prevPotd = null, prevFixtures = null;
  try {
    const origin = process.env.SITE_ORIGIN || "https://skypredict-theta.vercel.app";
    const r = await fetch(origin + "/predictions.json", { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const prev = await r.json();
      prevPotd = prev.potd || null;
      /* The board as readers saw it, tips and all. recordPublishedTips writes
         those tips to the record once the games have been played, which is the
         only way to file the tip we actually showed rather than one this build
         would decide now with a refitted model. */
      prevFixtures = Array.isArray(prev.fixtures) ? prev.fixtures : null;
    }
    if (prevPotd) log("carrying forward pick of the day: " + prevPotd.home + " v " + prevPotd.away);
  } catch (e) { warn("could not read the live board (" + e.message + "), choosing fresh"); }
  let payload;
  try {
    payload = await buildPayload({ prevPotd, prevFixtures });
  } catch (e) {
    warn("build failed, skipping bake (the page will use /api/predictions): " + e.message);
    return;
  }
  const n = (payload && Array.isArray(payload.fixtures)) ? payload.fixtures.length : 0;
  if (n < MIN) {
    /* Same rule the API uses: a thin build is a broken feed, not a quiet day,
       and baking one would pin it in place until the next deploy. */
    warn("only " + n + " fixtures - refusing to bake a thin payload");
    return;
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
    .filter((l) => /held back|unavailable|failed|oracle|soccervista|suspended|record:|recorded result|score source|FT score map|confirmed from/i.test(l))
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
function writePages(payload) {
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
  let written = 0, failed = 0;
  for (const pg of pages) {
    try {
      const rel = P.pagePath(pg.f);
      fs.writeFileSync(path.join(PUB, rel + ".html"), P.renderMatchPage(pg.f, pg.r));
      paths.push(rel);
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
  ];
  let standingWritten = 0;
  for (const [rel, render] of standing) {
    try {
      fs.writeFileSync(path.join(PUB, rel.slice(1) + ".html"), render());
      paths.push(rel);
      standingWritten++;
    } catch (e) { warn("standing page " + rel + " failed: " + e.message); }
  }

  fs.writeFileSync(path.join(PUB, "sitemap.xml"), P.renderSitemap(paths));
  fs.writeFileSync(path.join(PUB, "robots.txt"), P.renderRobots());
  log("pages: " + written + " match pages" + (failed ? " (" + failed + " failed)" : "") +
      " + " + standingWritten + " standing + sitemap.xml + robots.txt -> " + P.ORIGIN +
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
 * Set SITE_ORIGIN on Vercel (e.g. https://soccerwizard.com) and everything -
 * canonicals, sitemap, robots, social cards, the share image - follows.
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
  writePages(payload);
  writeCard(payload);
  /* Before the split, so the hostname inside the big inline script - the
     share-image canvas - is rewritten while it is still in the page. */
  applyOrigin();
  splitAssets();
})().catch((e) => {
  /* Never fail the deploy over an optimisation. */
  warn("unexpected error, continuing: " + (e && e.message));
});
