"use strict";

/**
 * The pages a site needs before it has a domain.
 *
 * The footer used to end at BeGambleAware, which meant the only link out of the
 * whole site was that one. No contact route, no privacy policy, no terms — and
 * the 534 match pages the build generates were reachable only through the
 * sitemap, which is a far weaker signal to a crawler than real internal links,
 * and no use at all to a reader.
 *
 * Four standing pages now come out of the build alongside the match pages, and
 * every page links to all of them.
 *
 * The privacy text is the part most worth guarding. It was written from an
 * inventory of what this site actually does — the Sentry init with replay and
 * tracing switched off, the Vercel analytics script, the sixteen localStorage
 * keys, the booking call — rather than from a template. A privacy policy that
 * describes some other site is worse than not having one, so these tests check
 * it still describes this one.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const P = require("../lib/pages.js");
const ROOT = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

const UPDATED = "31 August 2026";
const PAGES = {
  privacy: P.renderPrivacy(UPDATED),
  terms: P.renderTerms(UPDATED),
  howItWorks: P.renderHowItWorks({ results: 29594, leagues: 45 }),
  matches: P.renderMatchesIndex([
    { home: "Arsenal", away: "Chelsea", date: "2026-09-01", league: "England Premier League" },
    { home: "Barcelona", away: "Vallecano", date: "2026-09-02", league: "Spain La Liga 1" },
  ]),
};

test("every standing page is a complete document", () => {
  Object.entries(PAGES).forEach(([name, html]) => {
    assert.match(html, /^<!doctype html>/i, name + " has no doctype");
    assert.match(html, /<title>[^<]+\| Soccerwizard<\/title>/, name + " has no title");
    assert.match(html, /<meta name="description" content="[^"]{40,}"/,
      name + " needs a description long enough to be useful in search results");
    assert.match(html, /<link rel="canonical" href="https?:\/\/[^"]+"/, name + " has no canonical");
  });
});

test("every page reaches every other page", () => {
  /* The whole point: no page is a dead end, and the match pages are linked
     from somewhere other than the sitemap. */
  const wanted = ["/", "/matches", "/how-it-works", "/privacy", "/terms",
                  "mailto:" + P.CONTACT];
  Object.entries(PAGES).forEach(([name, html]) => {
    wanted.forEach((w) => assert.ok(html.includes(w),
      name + " does not link " + w));
  });
});

test("match pages carry the same footer", () => {
  const f = { home: "Arsenal", away: "Chelsea", date: "2026-09-01",
    league: "England Premier League", tip: "Home win", tip_p: 0.6,
    home_p: 0.6, draw_p: 0.2, away_p: 0.2, lh: 1.8, la: 1.0 };
  const html = P.renderMatchPage(f, null);
  ["/matches", "/how-it-works", "/privacy", "/terms", "mailto:" + P.CONTACT]
    .forEach((w) => assert.ok(html.includes(w), "match page does not link " + w));
});

test("the app's own footer links them too", () => {
  /* index.html is hand-written, not generated, so it does not get the shared
     footer for free. Contact is a dialog here rather than a bare mailto - the
     address is built from CONTACT_EMAIL at open time - so this checks the
     control exists and the address is right, not that a literal mailto is in
     the markup. */
  assert.match(index, /class="foot-links"/, "the footer link row is gone");
  ["/matches", "/how-it-works", "/privacy", "/terms"]
    .forEach((w) => assert.ok(index.includes(w), "index.html does not link " + w));
  assert.match(index, /id="contactBtn"[^>]*>|>Contact us</,
    "the footer needs a Contact us control");
  assert.match(index, /function openContact\(\)/, "and a dialog for it to open");
});

test("one contact address, used everywhere", () => {
  assert.match(P.CONTACT, /^[^@\s]+@soccerwizard\.live$/,
    "the contact address should be on the site's own domain");
  /* The generated pages carry a literal mailto; the app holds it in a constant.
     Both must be the same address, or people reach different inboxes depending
     on which page they were on. */
  const m = /var CONTACT_EMAIL="([^"]+)"/.exec(index);
  assert.ok(m, "index.html has no CONTACT_EMAIL");
  assert.strictEqual(m[1], P.CONTACT,
    "index.html and lib/pages.js disagree about the contact address");
  const others = (Object.values(PAGES).join("").match(/mailto:([^"']+)/g) || [])
    .map((x) => x.replace("mailto:", ""));
  assert.deepStrictEqual([...new Set(others)], [P.CONTACT],
    "more than one contact address on the generated pages");
});

test("the address in the dialog is itself the mail link", () => {
  /* Reported: "let the email address show, its also a link show, so the users
     can click on it to mail and also copy it." Reading it and clicking it
     should be the same gesture. */
  const i = index.indexOf("function openContact()");
  const fn = index.slice(i, i + 2600);
  assert.match(fn, /class='contact-mail'/);
  assert.match(fn, /"<a href='mailto:"\+esc\(CONTACT_EMAIL\)\+"'>"\+esc\(CONTACT_EMAIL\)\+"<\/a>"/,
    "the visible address must be the anchor, not a label beside one");
  assert.match(fn, /class='c-copy'/, "and it must still be copyable");
});

/* ------------------------------------------------------- privacy accuracy */

test("the privacy page names what actually leaves the browser", () => {
  const h = PAGES.privacy;
  assert.match(h, /Sentry/, "the error reporter must be named");
  assert.match(h, /Vercel Analytics/, "the analytics must be named");
  assert.match(h, /SportyBet/, "the booking call sends selections out");
});

test("and it does not claim protections the site does not have", () => {
  const h = PAGES.privacy;
  /* Sentry is initialised with replaysSessionSampleRate and
     replaysOnErrorSampleRate at 0 and tracesSampleRate at 0, so the claim that
     behaviour is not recorded is true. If someone turns replay on, this page
     becomes a false statement — hence the check on the source below. */
  assert.match(h, /replay/i, "the page makes a claim about session replay");
  /* Anchored so a rate of 0 is required, not merely a leading zero. Written
     first as /replaysSessionSampleRate:0/, which matches "0.1" perfectly well
     and let a mutation turning replay ON sail through. */
  const off = (name) => new RegExp(name + ":0(?![.\\d])");
  assert.match(index, off("replaysSessionSampleRate"),
    "privacy.html says session replay is off; index.html must keep it off");
  assert.match(index, off("replaysOnErrorSampleRate"),
    "privacy.html says session replay is off, including on errors");
  assert.match(index, off("tracesSampleRate"),
    "privacy.html says performance tracing is off");
});

test("the storage claim matches what is actually stored", () => {
  /* The page says slips and preferences stay in the browser. If a key ever
     starts being sent somewhere, this is the reminder to update the wording. */
  const keys = [...new Set((index.match(/localStorage\.setItem\("([^"]+)"/g) || [])
    .map((m) => m.replace(/localStorage\.setItem\("/, "").replace(/"$/, "")))];
  assert.ok(keys.length > 0, "no localStorage keys found - has storage moved?");
  keys.forEach((k) => assert.match(k, /^sw\./,
    "an unnamespaced key appeared (" + k + "); the privacy page describes sw.* only"));
});

/* ---------------------------------------------------------------- content */

test("the method page uses the training set, not the recent gradings", () => {
  /* First cut passed payload.results.length, so the page announced the model
     was built from 199 results. It is fitted on payload.matches - 29,594. */
  assert.match(PAGES.howItWorks, /29,594/,
    "the figure should be the training set, formatted with separators");
  assert.doesNotMatch(PAGES.howItWorks, /\b199 of them\b/);
});

test("the terms say the things that protect the site", () => {
  const h = PAGES.terms;
  assert.match(h, /not affiliated with, endorsed by, or partnered/i,
    "independence from the bookmaker has to be stated");
  assert.match(h, /18\+|over-18s/, "an age statement is required");
  assert.match(h, /not betting advice|Nothing on this site is betting advice/i);
  assert.match(h, /begambleaware/i);
});

test("the matches hub reaches each fixture, now through its day", () => {
  /* It used to link every match directly. The hub is an index of days now -
     see renderMatchesIndex for why - so what has to hold is that the day
     exists and the day page carries the match. */
  assert.match(PAGES.matches, /href="\/matches\/2026-09-01"/);
  assert.match(PAGES.matches, /href="\/matches\/2026-09-02"/);
  assert.match(PAGES.matches, /2 matches across 2 days/);
  const day = P.renderMatchesDay("2026-09-01",
    [{ date: "2026-09-01", league: "L", home: "Arsenal", away: "Chelsea" }]);
  assert.match(day, /href="\/m\/arsenal-vs-chelsea-2026-09-01"/);
});

test("an empty card does not produce an empty page", () => {
  const html = P.renderMatchesIndex([]);
  assert.match(html, /No matches on the card right now/,
    "say so rather than rendering a headed page with nothing under it");
});

/* ------------------------------------------------------------- the build */

test("the build writes the standing pages and lists them in the sitemap", () => {
  const pre = fs.readFileSync(path.join(ROOT, "scripts", "prebuild.js"), "utf8");
  ["/privacy", "/terms", "/how-it-works", "/matches"].forEach((p) =>
    assert.ok(pre.includes('["' + p + '"'), "prebuild does not write " + p));
  const i = pre.indexOf("const standing = [");
  const j = pre.indexOf("renderSitemap(paths)");
  assert.ok(i > 0 && j > i,
    "the standing pages must be pushed into `paths` BEFORE the sitemap is " +
    "written, or they are generated and then left out of it");
});

/* ------------------------------------------------------------------- social */

/**
 * A link is a claim that the destination exists.
 *
 * The first X link shipped pointing at @soccerwizardlive - sixteen characters.
 * X caps handles at fifteen, so that profile could never be registered, and
 * every click on "Follow us" hit a 404 for about an hour. I had been given the
 * handle and linked it without checking it could exist.
 *
 * The length rule is the part a test can hold. Whether the account is live is
 * not checkable offline, so that stays a thing to verify by hand before
 * shipping - but a handle that is structurally impossible never gets that far
 * again.
 */
test("the X handle is one X could actually issue", () => {
  const links = [...index.matchAll(/https:\/\/x\.com\/([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(links.length > 0, "the X link is gone");
  links.forEach((h) => {
    assert.ok(h.length <= 15,
      `@${h} is ${h.length} characters; X caps handles at 15, so this profile ` +
      `cannot exist and the link is guaranteed to 404`);
    assert.match(h, /^[A-Za-z0-9_]+$/, `@${h} has characters X does not allow`);
  });
});

test("one handle, used everywhere", () => {
  /* The footer and the contact dialog both link out. Two different handles
     would send people to two different places, one of which is wrong. */
  const links = [...index.matchAll(/https:\/\/x\.com\/([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.deepStrictEqual([...new Set(links)], ["soccerwizardhq"],
    "more than one X handle on the site: " + [...new Set(links)].join(", "));
  assert.strictEqual(links.length, 2,
    "expected the footer link and the contact dialog's, found " + links.length);
});

/* --------------------------------------------------------- the split hub */

test("the hub links days, not nine hundred matches", () => {
  /* It was one page carrying every link - 929 of them, 88 KB - and itself
     linked once from the home page. Everything the site wants indexed hung off
     a single wall of near-identical anchors, and Search Console reported 1,080
     pages "Discovered - currently not indexed". */
  const P = require("../lib/pages.js");
  const fx = [];
  for (let i = 0; i < 40; i++) fx.push({ date: "2026-09-12", league: "L", home: "A" + i, away: "B" + i });
  for (let i = 0; i < 40; i++) fx.push({ date: "2026-09-05", league: "L", home: "C" + i, away: "D" + i });
  const hub = P.renderMatchesIndex(fx);
  const dayLinks = (hub.match(/href="\/matches\/[^"]+"/g) || []).length;
  const matchLinks = (hub.match(/href="\/m\/[^"]+"/g) || []).length;
  assert.strictEqual(dayLinks, 2, "the hub should link one page per day");
  assert.strictEqual(matchLinks, 0, "the hub must not carry the match links any more");
  assert.match(hub, /80 matches across 2 days/);
});

test("a day page names its own day, or thirty pages look identical", () => {
  const P = require("../lib/pages.js");
  const list = [{ date: "2026-09-12", league: "L", home: "Arsenal", away: "Chelsea" }];
  const day = P.renderMatchesDay("2026-09-12", list);
  assert.match(day, /<title>Football predictions for Saturday 12 September 2026/);
  assert.match(day, /href="\/m\/arsenal-vs-chelsea-2026-09-12"/);
  assert.match(day, /href="\/matches"/, "a day page must link back to the hub");
  assert.strictEqual(P.matchesDayPath("2026-09-12"), "/matches/2026-09-12");
});

test("the hub and the day pages are built from the same rows", () => {
  /* Two builders over one list. If they ever diverge the hub advertises days
     that have no page, which is the 404 problem again in a new place. */
  const P = require("../lib/pages.js");
  const fx = [{ date: "2026-09-12", league: "L", home: "A", away: "B" },
              { date: "2026-09-05", league: "L", home: "C", away: "D" }];
  const grouped = P.groupByDate(fx);
  const hub = P.renderMatchesIndex(fx);
  for (const d of Object.keys(grouped)) {
    assert.ok(hub.includes('href="' + P.matchesDayPath(d) + '"'),
      "the hub does not link " + d + ", which has a page");
  }
});

test("a past day is dated by its day and /matches resolves either way", () => {
  const pre = fs.readFileSync(path.join(ROOT, "scripts", "prebuild.js"), "utf8");
  assert.match(pre, /paths\.push\(d < today \? \{ path: rel, lastmod: d \} : rel\)/,
    "a finished day still claims to change on every build");
  assert.match(pre, /copyFileSync\(path\.join\(PUB, "matches\.html"\)/,
    "matches.html and matches/ both exist; without the copy, which one /matches " +
    "serves is Vercel's decision rather than ours");
});

/* ------------------------------------------------------- crawl structure */

test("a match page links its own day and a handful of siblings", () => {
  /* Every match page linked "/", "/matches" and the standing pages and nothing
     else - 1,200 leaves with no lateral paths, which is most of what
     "Discovered - currently not indexed" means. */
  const P = require("../lib/pages.js");
  const day = [];
  for (let i = 0; i < 40; i++) {
    day.push({ date: "2026-09-12", league: "L", home: "H" + i, away: "A" + i });
  }
  const html = P.renderMatchPage(day[0], null, day);
  const links = (html.match(/href="\/m\/[^"]+"/g) || []);
  assert.strictEqual(links.length, 8,
    "eight siblings; the whole day would rebuild the wall of anchors the hub split removed");
  assert.ok(!links.some((l) => l.includes("/m/h0-vs-a0-")), "a page must not link to itself");
  assert.match(html, /href="\/matches\/2026-09-12"/, "no link to its own day");
  assert.match(html, /All 40 matches on/);
});

test("a match page with no siblings says nothing rather than an empty list", () => {
  const P = require("../lib/pages.js");
  const only = { date: "2026-09-12", league: "L", home: "A", away: "B" };
  const html = P.renderMatchPage(only, null, [only]);
  assert.doesNotMatch(html, /Also on/, "a lone fixture should not print an empty section");
});

test("both page types declare where they sit", () => {
  const P = require("../lib/pages.js");
  const list = [{ date: "2026-09-12", league: "L", home: "Arsenal", away: "Chelsea" }];
  for (const [what, html] of [["match", P.renderMatchPage(list[0], null, list)],
                              ["day", P.renderMatchesDay("2026-09-12", list)]]) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]));
    const types = blocks.map((b) => b["@type"]);
    assert.ok(types.includes("BreadcrumbList"), what + " page has no BreadcrumbList");
    const crumb = blocks.find((b) => b["@type"] === "BreadcrumbList");
    assert.ok(crumb.itemListElement.every((i) => /^https?:\/\//.test(i.item)),
      "every crumb must be an absolute URL");
  }
});

test("a day page lists its matches as an ItemList", () => {
  const P = require("../lib/pages.js");
  const list = [{ date: "2026-09-12", league: "L", home: "A", away: "B" },
                { date: "2026-09-12", league: "L", home: "C", away: "D" }];
  const html = P.renderMatchesDay("2026-09-12", list);
  const items = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "ItemList");
  assert.ok(items, "no ItemList on the day page");
  assert.strictEqual(items.numberOfItems, 2);
  assert.strictEqual(items.itemListElement[0].url, P.ORIGIN + "/m/a-vs-b-2026-09-12");
});

test("a club name cannot break out of a JSON-LD block", () => {
  /* Names arrive from a feed. Without escaping, `A</script><script>` closes
     the block and opens its own. */
  const P = require("../lib/pages.js");
  const nasty = { date: "2026-09-12", league: "L", home: "A</script><script>x", away: "B" };
  const html = P.renderMatchPage(nasty, null, [nasty]);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.strictEqual(blocks.length, 2, "a name closed a JSON-LD block early");
  blocks.forEach((b) => JSON.parse(b[1]));
});

test("titles stay inside what a result page shows", () => {
  const P = require("../lib/pages.js");
  const f = { date: "2026-09-12", league: "England Premier League",
              home: "Crystal Palace", away: "Ipswich" };
  const t = (P.renderMatchPage(f, null, [f]).match(/<title>([^<]*)/) || [])[1];
  assert.ok(t.length <= 62, "title is " + t.length + " chars: " + t);
  assert.match(t, /^Crystal Palace vs Ipswich/, "the clubs must lead, not survive the truncation");
});

test("the home page has exactly one h1", () => {
  const idx = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const n = (idx.match(/<h1[\s>]/g) || []).length;
  assert.strictEqual(n, 1,
    "found " + n + " h1s; the board, the builder and live scores are three views " +
    "of one page and only one of them is the page's subject");
});
