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
  /* Applied to any book that does not sell a whole line - SportyBet does, so
     nothing moves on the way in. It was Bet9ja-only until BetKing arrived and
     turned out not to sell them either; the page said "Bet9ja" and would have
     been describing behaviour the converter no longer had. */
  assert.match(index, /var NEAREST_LINE=\{"OVER_2":"OVER_1\.5"/,
    "the substitution table has changed shape");
  assert.match(index, /if\(near && !to\.wholeLines\)/,
    "the substitution is named to one book again");
  assert.match(html, /Bet9ja and BetKing stop\s+at the half lines/,
    "the page must name every book the rule applies to");
  assert.match(html, /returns your stake on exactly two goals/,
    "the page must say why it is a different bet, not just that it changed");
  assert.match(html, /an over moves down and an under moves up/,
    "the direction is the part that can be got backwards, so it is stated");
});

test("the 1X2-or-Over/Under move is described as one direction and a switch", () => {
  assert.match(index, /else if\(mix *&& *to\.key==="sporty"\)/,
    "the reline is no longer SportyBet-only");
  assert.match(index, /if\(!BYO\.reline\)\{ offer\.push/,
    "the reline is no longer offered rather than assumed");
  /* NAMED BY DIRECTION, NOT BY SOURCE BOOK. The reline fires on
     `to.key==="sporty"` and never asked where the leg came from, so once
     BetKing turned out to sell the 1.5 rung as well, "only from Bet9ja"
     described one of the two books it actually moves. */
  assert.match(html, /only towards SportyBet/);
  assert.match(html, /Bet9ja and BetKing also sell 1\.5 and 3\.5/);
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
  assert.match(index, /setView\("convert"\);[\s\S]{0,400}byoRead\(\);/);
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
  /* The entry keeps its word whatever the icon does: "Converter", never the
     names of the two books we happen to carry today. */
  assert.match(index, /id="bt-convert"[\s\S]{0,600}>Converter</, "the entry lost its word");
  assert.doesNotMatch(index, /SB<i>/, "the entry names individual bookmakers again");
  /* And its icon must not be the shuffle glyph, which #shuffleBtn owns. */
  const conv = index.slice(index.indexOf('id="bt-convert"'));
  const icon = conv.slice(0, conv.indexOf("</button>"));
  assert.match(icon, /<svg/, "the entry has no icon");
  assert.doesNotMatch(icon, /M16 3h5v5/, "that is the shuffle icon");
  /* setView ends by scrolling to the top, so the panel has to be put on screen
     after it, not before. */
  /* A page of its own, not a panel at the foot of the builder: the bottom bar
     cannot mark a place that is really two screens down inside another one. */
  assert.match(index, /function goConvert\(\)\{\s*setView\("convert"\)/);
  assert.match(index, /root\.classList\.toggle\("mode-convert",v==="convert"\)/);
  assert.match(index, /html\.mode-convert #converter\{display:block\}/);
  assert.match(index, /if\(bc\)bc\.classList\.toggle\("on",v==="convert"\)/,
    "the bottom bar cannot mark the converter page");
});

test("the red circle marks the page you are on", () => {
  /* It sat on Build and never moved, which made it a call to action and left
     the current page marked by red text alone. A bar that does not say where
     you are is worth less than the emphasis it was buying. */
  /* The slot is 44px on every tab so nothing reflows when the marker moves -
     the bar jumping between pages was the icon box growing. Only the paint
     changes. */
  assert.match(index, /\.btab \.bt-ic\{width:44px;height:44px;margin-top:-6px;border-radius:50%/,
    "the icon slot must be the same size on every tab");
  /* IT IS A LIT RING NOW, NOT A FILLED DISC. The disc reversed its glyph to
     white and so hid the one picture the reader was standing on; the ring
     leaves it readable and glows around it. Pinned on the ring and the bloom
     rather than on a `background`, which there deliberately is not. */
  assert.match(index, /\.btab\.on \.bt-ic\{[\s\S]{0,260}inset 0 0 0 1\.5px var\(--red\)/,
    "the active tab no longer draws its ring");
  assert.match(index, /\.btab\.on \.bt-ic\{[\s\S]{0,260}0 0 14px 1px var\(--red-glow\)/,
    "the active ring no longer glows");
  assert.doesNotMatch(index, /\.btab\.on \.bt-ic\{[\s\S]{0,260}background:/,
    "the active tab is filled again, which hides the glyph inside it");
  /* Every tab wears the unlit ring, or the lit one is a badge rather than the
     same object switched on. */
  assert.match(index, /\.btab \.bt-ic\{[\s\S]{0,200}box-shadow:inset 0 0 0 1px var\(--line\)/,
    "the inactive tabs lost their outline");
  /* A glow is an rgba of the theme's own red - a box-shadow cannot thin a
     colour - so both themes must define one or the dark bloom lands on the
     light bar. */
  ["--red-glow:rgba\\(230,57,70", "--red-glow:rgba\\(198,35,48"].forEach((v) =>
    assert.match(index, new RegExp(v), "a theme is missing its own " + v.split(":")[0]));
});

test("the Build staff is a mask, so it still paints in currentColor", () => {
  /* The artwork is a PNG because a football's panels with a star cut out of
     them is more shape than a hand-written path carries. Used as a mask, the
     file supplies only its alpha and the colour comes from currentColor - so
     Build greys out at rest and lights red when active, exactly like the three
     line icons beside it. A coloured PNG could only be desaturated. */
  const m = index.match(/mask:url\(\/(app\.staff-[0-9a-f]{8}\.png)\)/);
  assert.ok(m, "the Build tab no longer masks its artwork");
  assert.match(index, /#bt-build \.bt-staff\{[\s\S]{0,140}background:currentColor/,
    "the staff is painted with something other than currentColor");
  /* THE FILE HAS TO BE THERE. A mask that 404s renders nothing at all, and the
     tab would go silently blank rather than fall back. */
  assert.ok(fs.existsSync(path.join(ROOT, "public", m[1])),
    "public/" + m[1] + " is referenced but missing");
  /* Hashed on purpose, and only worth hashing because of this rule: /app.* is
     served immutable for a year, so new artwork needs a new name or readers
     keep the old one until the cache expires - the trap the intro videos are
     still in. If the rule ever goes, the hash in the filename is a lie. */
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const rule = (vercel.headers || []).find((r) => r.source === "/app.(.*)");
  assert.ok(rule, "/app.(.*) has no header rule, so the hashed name buys nothing");
  assert.ok(rule.headers.some((h) => /immutable/.test(h.value)),
    "/app.(.*) is no longer immutable");
  /* The hand-drawn SVG stays underneath, hidden only where masks work. Without
     that guard a browser with no mask support paints a solid lozenge. */
  assert.match(index, /@supports \(\(-webkit-mask-image:url\(""\)\) or \(mask-image:url\(""\)\)\)/,
    "the mask is applied unconditionally");
  assert.match(index, /<i class="bt-staff"[^>]*><\/i><svg/,
    "the fallback svg is gone from the Build tab");
  assert.doesNotMatch(index, /class="btab mid"/, "the circle is pinned to one tab again");
  /* A red pulse on the red disc is invisible, and syncLiveDots already stops
     nudging you toward the page you are standing on. */
  assert.match(index, /\.btab\.on \.btab-dot\{display:none\}/);
  assert.match(index, /dB\.hidden=!any\|\|here/, "the live dot no longer knows where you are");
});

/* ------------------------------------------------------------------ search */

test("the title and description survive being shown in a result", () => {
  /* Google cuts a title at roughly 60 characters and a description at roughly
     160. The old title ran to 66 with the brand on it and spent its first
     three words - "Convert a booking code between" - before the first word
     anybody searches for. */
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(title.length <= 60, "title is " + title.length + " characters: " + title);
  assert.ok(title.indexOf("SportyBet") < 40 && /Bet9ja/.test(title),
    "both book names belong near the front: " + title);
  const desc = html.match(/name="description" content="([^"]+)"/)[1];
  assert.ok(desc.length >= 120 && desc.length <= 160,
    "description is " + desc.length + " characters");
});

test("one h1, and it carries the search it is for", () => {
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  const h1 = html.match(/<h1>([^<]+)<\/h1>/)[1];
  assert.match(h1, /SportyBet/);
  assert.match(h1, /Bet9ja/);
});

test("the structured data describes what is on the page", () => {
  const blocks = [...html.matchAll(/application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const types = blocks.map((b) => b["@type"]);
  assert.ok(types.includes("BreadcrumbList"), "no trail");
  /* The page IS the tool. WebApplication with a zero-price offer is the honest
     shape; HowTo and FAQPage would be schema shaped to fit a rich result
     Google retired in 2023. */
  const app = blocks.find((b) => b["@type"] === "WebApplication");
  assert.ok(app, "the tool does not say it is one");
  assert.equal(app.offers.price, "0");
  assert.equal(app.isAccessibleForFree, true);
  assert.ok(types.every((t) => t !== "HowTo" && t !== "FAQPage"),
    "schema for a rich result that no longer exists");
});

test("a crawler can reach the page from the home page", () => {
  /* THE ONE THAT MATTERS. Every navigation entry to the converter is a
     <button>, because it is a view rather than a URL, and a crawler follows
     none of them. Without a real anchor on the strongest page on the site, the
     only paths in are the sitemap and the static pages' own footer. */
  assert.match(index, /<a href="\/convert-a-booking-code">/,
    "the home page has no crawlable link to the converter");
  assert.match(P.renderHowToCode(), /href="\/convert-a-booking-code"/,
    "the page about loading codes does not link to the one about moving them");
});

test("the page links on to the two pages a reader wants next", () => {
  assert.match(html, /href="\/how-to-load-a-booking-code"/);
  assert.match(html, /href="\/booking-codes"/);
});

test("it is in the sitemap and not blocked in robots", () => {
  const map = P.renderSitemap(["/convert-a-booking-code"], "2026-09-13");
  assert.match(map, /<loc>https?:\/\/[^<]+\/convert-a-booking-code<\/loc>/);
  assert.doesNotMatch(P.renderRobots(), /Disallow: \/convert/);
});

test("the bottom bar draws its own focus ring, not the browser's", () => {
  /* Reported as a square whitish shadow on tap: .btab was the one control on
     the site without a :focus-visible rule, so Chrome drew its default box
     around a round marker and left it there until something else was touched.
     The ring must stay for a keyboard - a blanket :focus{outline:none} with no
     :focus-visible behind it is the classic accessibility own-goal. */
  assert.match(index, /\.btab:focus\{outline:none\}/);
  assert.match(index, /\.btab:focus-visible\{outline:2px solid var\(--red\)/);
});

test("the jobs and their panel ride beside the games, not under forty of them", () => {
  /* Reported: a 40-leg code buries the panel you are working in. The legs are
     folded by default, but the fold exists to be opened, and then #byoStage is
     off the bottom with nothing to do but scroll back.
     One wrapper, two rules. The wrapper is not decoration: placing the two by
     grid maths put the panel in the middle of the leg list, because a spanning
     left column splits its height across the rows it covers. Measured before
     and after - stage at y=1764, then beside the jobs at the top. */
  assert.match(index, /<div class="byo-side">/, "the side column is gone");
  const side = index.slice(index.indexOf('<div class="byo-side">'),
    index.indexOf("<!-- /.byo-side -->"));
  assert.ok(side.includes('id="byoJobs"') && side.includes('id="byoStage"'),
    "the jobs and the panel they open must travel together");
  assert.ok(index.indexOf("<!-- /.byo-side -->") < index.indexOf('id="byoOut"'),
    "the side column must come before the games, or mobile order has nothing to swap");
  /* Desktop: two columns, the side one sticky so it survives a long list. */
  assert.match(index, /\.byo\{display:grid;grid-template-columns:minmax\(0,1fr\) 380px/);
  assert.match(index, /\.byo>\.byo-side\{grid-column:2;position:sticky/);
  assert.match(index, /grid-auto-flow:row dense/,
    "without dense the games start a row below the side column");
  /* Phone: no second column, so the panel rides above the games instead. */
  assert.match(index, /\.byo>\.byo-side\{order:1\}/);
  assert.match(index, /\.byo>#byoOut\{order:2\}/);
});
