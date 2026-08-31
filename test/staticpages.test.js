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

test("the matches hub links each fixture to its own page", () => {
  assert.match(PAGES.matches, /href="\/m\/arsenal-vs-chelsea-2026-09-01"/);
  assert.match(PAGES.matches, /href="\/m\/barcelona-vs-vallecano-2026-09-02"/);
  assert.match(PAGES.matches, /2 matches with a page of their own/);
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
