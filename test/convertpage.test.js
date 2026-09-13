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
