"use strict";

/**
 * The generated pages get the app's masthead.
 *
 * Asked for as "apply it through the pages", after the app's header was rebuilt
 * as glass. These pages had a logo sitting on a bare background - no bar, no
 * separation, no surface - and they are where search sends people, so for most
 * readers this is the first Soccerwizard they see. It should not look like a
 * different site from the one the link promised.
 *
 * Two things went wrong on the way here and both are pinned below.
 *
 * A FULL-WIDTH BAR BELONGS AT FULL WIDTH. The first attempt kept it inside the
 * 680px column and bled the background out with left:50%;width:100vw. But 100vw
 * counts the scrollbar, so every page gained horizontal scroll - 1913 against
 * 1905, and then 2253 when a glow band was added the same way. body{overflow-x:
 * clip} did not catch it, because body's overflow propagates to the viewport
 * when html's is visible. The bar now sits outside .wrap and .top-in re-creates
 * the column inside it, so no viewport units appear anywhere.
 *
 * AND NO GLOW HERE, deliberately. The app has one because its bar sits at the
 * top of a landing page with nothing behind it, so the glass had nothing to
 * reveal. These are documents: content starts immediately and scrolls under the
 * bar within a screen, which is the glass doing its job unaided.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

const FIXTURE = { home: "Arsenal", away: "Chelsea", date: "2026-09-04",
  league: "England Premier League", tip: "Home win", tip_p: 0.62,
  home_p: 0.62, draw_p: 0.2, away_p: 0.18, lh: 1.9, la: 1.0 };

const PAGES = {
  match: P.renderMatchPage(FIXTURE, null),
  privacy: P.renderPrivacy("4 September 2026"),
  terms: P.renderTerms("4 September 2026"),
  notFound: P.renderNotFound(),
};

test("every page type carries the masthead", () => {
  Object.entries(PAGES).forEach(([name, h]) => {
    assert.match(h, /\.top\{position:sticky/, name + " has no sticky bar");
    assert.match(h, /backdrop-filter:blur\(16px\) saturate\(150%\)/, name + " has no glass");
    assert.match(h, /box-shadow:inset 0 -1px 0 var\(--top-hair\)/, name + " has no hairline");
  });
});

test("the bar sits OUTSIDE the column", () => {
  /* The whole reason it can be full width without viewport units. */
  Object.entries(PAGES).forEach(([name, h]) => {
    const bar = h.indexOf('<div class="top">');
    const wrap = h.indexOf('<div class="wrap">');
    assert.ok(bar > 0 && wrap > 0, name + " is missing one of them");
    assert.ok(bar < wrap, name + ": the bar must come before .wrap, not inside it");
    assert.match(h, /<div class="top-in">/, name + " needs the inner column");
  });
});

test("no viewport units anywhere in the stylesheet", () => {
  /* 100vw counts the scrollbar. Every use of it here produced horizontal
     scroll on all 1,120 pages. */
  Object.entries(PAGES).forEach(([name, h]) => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(h)[1].replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.ok(!/\d\s*vw\b/.test(css), name + " still uses viewport units");
  });
});

test("body is not made a scroll container", () => {
  /* overflow-x:hidden would break position:sticky for the very bar above it,
     and with no full-bleed element left there is nothing to contain. */
  const css = /<style>([\s\S]*?)<\/style>/.exec(PAGES.privacy)[1]
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const body = /body\{([^}]*)\}/.exec(css);
  assert.ok(body, "body must still be styled");
  assert.ok(!/overflow-x/.test(body[1]),
    "no overflow-x on body - it would break the sticky masthead");
});

test("the logo keeps its own styling", () => {
  /* Restyling the bar deleted these, and the wordmark came back as a gold
     underlined link because the generic anchor rule was all that matched it. */
  const css = /<style>([\s\S]*?)<\/style>/.exec(PAGES.match)[1];
  assert.match(css, /\.top a\{text-decoration:none/, "the logo must not be underlined");
  assert.match(css, /\.top b i\{font-style:normal;color:var\(--brand\)\}/,
    "and the wordmark keeps its red second half");
  assert.match(css, /\.top img\{width:30px/, "and the mark keeps its size");
});

test("the masthead tokens exist in both colour schemes", () => {
  /* These pages use prefers-color-scheme rather than a data-theme attribute,
     so a token defined once lands on one scheme and leaves the other bare. */
  const css = /<style>([\s\S]*?)<\/style>/.exec(PAGES.terms)[1];
  const light = /@media \(prefers-color-scheme:light\)\{:root\{([\s\S]*?)\}\}/.exec(css);
  assert.ok(light, "the light block must exist");
  for (const tok of ["--top-bg", "--top-hair", "--top-fade"]) {
    assert.ok(css.includes(tok + ":"), tok + " missing entirely");
    assert.ok(light[1].includes(tok), tok + " missing from the light scheme");
  }
});

test("there is a solid fallback where backdrop-filter is unavailable", () => {
  /* A see-through bar over unblurred scrolling text is unreadable - worse than
     the flat bar this replaced. */
  assert.match(PAGES.match, /@supports not \(\(backdrop-filter/,
    "the fallback must be declared");
});
