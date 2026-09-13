"use strict";
/* THE PAGE THAT DESCRIBES THE CONVERTER.
 *
 * The converter lives in public/index.html and stays there; this page only
 * explains it. So the failure worth guarding is drift: the page telling a
 * reader a leg will cross when the shipped rule says it will not, or naming a
 * direction the code refuses. Every assertion below pins a sentence on the
 * page to the rule in the code it describes.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const P = require("../lib/pages.js");
const ROOT = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const html = P.renderConvertPage();

test("the page is indexable, canonical and in the footer of the site", () => {
  assert.match(html, /<link rel="canonical" href="[^"]+\/convert-a-booking-code">/);
  assert.doesNotMatch(html, /name="robots" content="noindex/);
  /* Reachable by a reader and a crawler from every page, not only the
     sitemap - which is the whole lesson of renderMatchesIndex. */
  assert.match(html, /href="\/convert-a-booking-code"/);
  assert.match(P.renderPrivacy("1 January 2026"), /href="\/convert-a-booking-code"/);
});

test("the build writes it", () => {
  const prebuild = fs.readFileSync(path.join(ROOT, "scripts", "prebuild.js"), "utf8");
  assert.match(prebuild, /\["\/convert-a-booking-code", \(\) => P\.renderConvertPage\(\)\]/);
});

test("the whole-line substitution is described in the direction the code does it", () => {
  /* NEAREST_LINE is applied only when the slip is going TO Bet9ja - SportyBet
     sells the whole lines, so nothing has to move on the way in. */
  assert.match(index, /var NEAREST_LINE=\{"OVER_2":"OVER_1\.5"/,
    "the substitution table has changed shape");
  assert.match(index, /if\(near && to\.key==="bet9ja"\)/,
    "the substitution is no longer Bet9ja-only");
  assert.match(html, /SportyBet sells Over 2 and Over 3; Bet9ja\s+stops at the half lines/);
  assert.match(html, /returns your stake on exactly two goals/,
    "the page must say why it is a different bet, not just that it changed");
});

test("the 1X2-or-Over/Under move is described as one direction and a switch", () => {
  assert.match(index, /else if\(mix *&& *to\.key==="sporty"\)/,
    "the reline is no longer SportyBet-only");
  assert.match(index, /if\(!BYO\.reline\)\{ offer\.push/,
    "the reline is no longer offered rather than assumed");
  assert.match(html, /only from Bet9ja to SportyBet/);
  assert.match(html, /offered with a\s+switch rather than done for you/);
});

test("the handicap lines the page names are the lines the server maps", () => {
  /* The page tells a reader a quarter line cannot cross. That is true only for
     as long as the SportyBet table has no quarter in it. */
  const server = fs.readFileSync(
    path.join(ROOT, "..", "..", "Documents", "soccerwizard-api", "server.py"), "utf8");
  const block = server.slice(server.indexOf("_AH_LINES = ["));
  const lines = block.slice(0, block.indexOf("]")).match(/"-?\d+(?:\.\d+)?"/g) || [];
  assert.ok(lines.length, "could not read _AH_LINES out of server.py");
  assert.equal(lines.filter((l) => /\.25"|\.75"/.test(l)).length, 0,
    "SportyBet now quotes quarter lines and the page says it does not");
  assert.ok(lines.includes('"-4.5"') && lines.includes('"5"'),
    "the page names -4.5 to 5 as their range");
  assert.match(html, /halves and wholes from -4\.5 to 5/);
});

test("a converted slip is never described as the same bet", () => {
  assert.match(html, /not the same bet as the one you pasted/);
  /* The price claim, which is the one that put a wrong number on the live site
     once already. */
  assert.match(html, /the price is the one the bookmaker taking it publishes/i);
});

/* -------------------------------------------- the page hands off to the panel */

test("the page carries a working form and no converter of its own", () => {
  /* One converter on the site. A second implementation would drift from the
     shipped one, and a drifted converter books a slip against a pairing we do
     not ship - which is the reason this page posts to the builder instead. */
  assert.match(html, /<form class="tool" action="\/" method="get">/);
  assert.match(html, /name="book" value="sporty"/);
  assert.match(html, /name="book" value="bet9ja"/);
  /* Two actions, one journey: convert opens the conversion, read stops at the
     games and the split. Neither books anything on arrival. */
  assert.match(html, /name="go" value="convert"/);
  assert.match(html, /name="go" value="read"/);
  assert.match(html, /name="code"[^>]*pattern="\[A-Za-z0-9\]\{4,16\}"/);
  assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/,
    "this page ships no script");
});

test("the builder reads the pair the form sends", () => {
  /* The contract is two query parameters and nothing else. Broken, the form
     submits to a page that ignores it and the reader lands on the board with
     no idea why. */
  assert.match(index, /q\.get\("to"\)/, "the builder no longer reads ?to=");
  assert.match(index, /q\.get\("code"\)/, "the builder no longer reads ?code=");
  /* `to` names the book they want a code FOR, so the code they hold came from
     the other one. Inverted, every deep link reads the wrong bookmaker. */
  assert.match(index, /q\.get\("book"\)/, "the builder no longer reads ?book=");
  assert.match(index, /to==="sporty"\?"bet9ja":"sporty"/,
    "the target-to-source flip is gone or reversed");
  /* ?go=convert opens the panel; it must never mint a code by itself. */
  assert.match(index, /go==="convert"/);
  assert.doesNotMatch(index, /go==="convert"[\s\S]{0,200}byoConvGo/,
    "arriving on a link must not book a code");
  /* Same shape rule as the box itself, because a crafted link must not be able
     to send anything the box could not. */
  assert.match(index, /\/\^\[A-Za-z0-9\]\{4,16\}\$\/\.test\(code\)/);
  /* The panel lives in the builder view; without this the read runs into a
     section nobody can see. */
  assert.match(index, /setView\("build"\);[\s\S]{0,400}byoRead\(\);/);
});

test("the rules are still on the page, folded rather than dropped", () => {
  /* Folded into <details>, which keeps them one tap away for a reader and in
     the HTML for a crawler. Deleting them would have been the easy way to make
     the page short. */
  const folds = (html.match(/<details>/g) || []).length;
  assert.ok(folds >= 4, "only " + folds + " folded sections left");
  assert.match(html, /What gets left behind, and why/);
  assert.match(html, /Where each card stops/);
});

test("the converter has a way in from the navigation", () => {
  /* It lives at the foot of the builder, which is two taps and a scroll from
     anywhere, and it was reported twice as unfindable. Both navigations carry
     it: the header on a desktop, the bottom bar on a phone, where the header's
     tabs are hidden entirely. */
  assert.match(index, /id="tab-convert"/, "no header entry");
  assert.match(index, /id="bt-convert"/, "no bottom-bar entry");
  assert.match(index, /\$\("tab-convert"\)\.addEventListener\("click",goConvert\)/);
  assert.match(index, /\$\("bt-convert"\)\.addEventListener/);
  /* Two arrows swapping is the shuffle glyph - #shuffleBtn draws it - so the
     bottom bar names the books in words instead of showing the same picture
     for two different actions. */
  assert.match(index, /class="bt-conv"/, "the bottom-bar entry lost its word-mark");
  const entry = index.slice(index.indexOf('id="bt-convert"'));
  assert.doesNotMatch(entry.slice(0, entry.indexOf("</button>")), /<svg/,
    "the convert entry is drawing a glyph again");
  /* setView ends by scrolling to the top, so the panel has to be put on screen
     after it, not before. */
  const fn = index.slice(index.indexOf("function goConvert()"));
  const body = fn.slice(0, 900);
  assert.ok(body.indexOf('setView("build")') < body.indexOf("scrollIntoView"),
    "the scroll runs before the view switch undoes it");
});
