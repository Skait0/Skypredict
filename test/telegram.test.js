"use strict";

/**
 * The Telegram community link.
 *
 * It lives in two footers, which is the whole risk. index.html is hand-written
 * and lib/pages.js generates the standing pages, the 404 and all 1,120 match
 * pages - so an address added to one and not the other, or edited in one and
 * not the other, sends people to two different places depending on which page
 * they happened to be on. That is exactly why CONTACT is a single exported
 * constant with a test on it, and this follows the same rule.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const P = require("../lib/pages.js");
const index = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

const FIXTURE = { home: "Arsenal", away: "Chelsea", date: "2026-09-01",
  league: "England Premier League", tip: "Home win", tip_p: 0.6,
  home_p: 0.6, draw_p: 0.2, away_p: 0.2, lh: 1.8, la: 1.0 };

const GENERATED = {
  privacy: P.renderPrivacy("1 January 2026"),
  terms: P.renderTerms("1 January 2026"),
  notFound: P.renderNotFound(),
  match: P.renderMatchPage(FIXTURE, null),
};

/* ----------------------------------------------------------- one address */

test("the link is a t.me address on the site's own handle", () => {
  assert.match(P.TELEGRAM, /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}$/,
    "Telegram handles are 5-32 characters of letters, digits and underscores");
});

test("index.html and lib/pages.js agree", () => {
  /* The failure mode is not a broken link, it is two working links to
     different places - which nobody notices until somebody joins the wrong
     one. */
  assert.ok(index.includes(P.TELEGRAM),
    "index.html does not carry the address lib/pages.js exports");
  const inIndex = index.match(/https:\/\/t\.me\/[A-Za-z0-9_]+/g) || [];
  assert.deepStrictEqual([...new Set(inIndex)], [P.TELEGRAM],
    "more than one Telegram address in index.html");
});

test("every generated page carries it", () => {
  /* Search sends people to a single fixture page far more often than to the
     home page, so a community link that only exists on the home page is
     invisible to most of the site's actual arrivals. */
  Object.entries(GENERATED).forEach(([name, html]) =>
    assert.ok(html.includes(P.TELEGRAM), name + " has no Telegram link"));
});

test("and they all point at the same one", () => {
  const all = (Object.values(GENERATED).join("").match(/https:\/\/t\.me\/[A-Za-z0-9_]+/g) || []);
  assert.deepStrictEqual([...new Set(all)], [P.TELEGRAM],
    "the generated pages disagree about the Telegram address");
});

/* ------------------------------------------------------- how it is linked */

test("it opens safely and is named for a screen reader", () => {
  const a = /<a class="fl-tg"[^>]*>/.exec(index);
  assert.ok(a, "the footer link is gone from index.html");
  assert.match(a[0], /rel="noopener"/,
    "a target=_blank link without noopener hands the opened tab a reference " +
    "back to this one");
  assert.match(a[0], /aria-label="[^"]+"/,
    "the chip is an icon plus one word; the label says which service it is");
});

test("the icon is inline, not a request", () => {
  /* Every asset on this site is either inline or same-origin and immutable.
     A logo pulled from a CDN is a third-party request on every page load and
     a dependency on somebody else's uptime for a footer icon. */
  const chip = /<a class="fl-tg"[\s\S]*?<\/a>/.exec(index)[0];
  assert.match(chip, /<svg[^>]*viewBox/, "the mark must be an inline svg");
  assert.match(chip, /<path d="M[^"]{40,}"/, "with a real path, not a placeholder");
  assert.ok(!/https?:\/\/(?!t\.me)/.test(chip),
    "nothing in this chip may be fetched from another host");
  assert.match(chip, /fill="currentColor"/,
    "so it inherits the chip's colour and themes for free, like the X mark");
});

/* --------------------------------------------------------------- layout */

test("the outbound pair travels together", () => {
  /* margin-left:auto pushes everything after it to the right edge. It belongs
     on the FIRST outbound chip, so the pair moves as a group. Put on the
     second, it pushes that one to the edge and strands the first: measured on
     the live footer, 8px between every other chip and 617px between those
     two. Shipped that way for exactly one render. */
  const css = index.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(css, /\.foot-links \.fl-x\{margin-left:auto\}/,
    "the auto margin must sit on the X chip, which comes first in the markup");
  assert.ok(!/\.foot-links \.fl-tg\{margin-left:auto\}/.test(css),
    "on the second chip this opens a hole between the two");
  /* And the markup order the rule assumes must actually hold. */
  assert.ok(index.indexOf('class="fl-x"') < index.indexOf('class="fl-tg"'),
    "if Telegram is moved before X, the auto margin has to move with it");
});

test("it collapses to the normal row on a phone", () => {
  /* The auto margin is a desktop affordance. On a narrow screen the chips
     wrap, and a right-shoved chip on its own line reads as a mistake. */
  const css = index.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(css, /@media\(max-width:560px\)\{\.foot-links \.fl-x\{margin-left:0\}\}/,
    "the auto margin must be cancelled at the phone breakpoint");
});
