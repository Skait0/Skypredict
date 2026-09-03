"use strict";

/**
 * The 404 page.
 *
 * Vercel answered an unmatched route with its bare 79-byte default: no
 * styling, no brand, and - the part that actually costs something - no way
 * back. That is not an exotic case here. The site publishes 1,120 match pages
 * and retires them as fixtures age out, so a 404 is simply what a search
 * result or a shared link from a few weeks ago now leads to.
 *
 * Two rules apply to this page that apply to no other page on the site, and
 * both are easy to get wrong by rendering it through the same shell as the
 * rest:
 *
 *   noindex      - a 404 Google indexes is a 404 Google shows people
 *   no canonical - pointing a missing page at itself invites a crawler to
 *                  treat it as a real one
 *
 * And one that applies to the sitemap: a 404 must never be listed in it. A
 * sitemap is a list of pages that exist; listing this one asks a crawler to go
 * and index the page whose whole job is to say "not here".
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const P = require("../lib/pages.js");
const html = P.renderNotFound();

/* ------------------------------------------------------- it is a real page */

test("it is branded, styled and substantial", () => {
  /* The default was 79 bytes. Anything near that is the default again. */
  assert.ok(html.length > 2000,
    "a 404 of " + html.length + " bytes is a stub, not a page");
  assert.match(html, /<title>Page not found \| Soccerwizard<\/title>/);
  assert.match(html, /<style>/, "it must carry the site's styling");
  assert.match(html, /Soccer<i>wizard<\/i>/, "and the site's masthead");
});

test("it always offers a way back", () => {
  /* The only job that matters. Somebody arrived here from a link that used to
     work; the page has to hand them the pages that still do.
     Checked against the page's OWN CONTENT, not the whole document. Every page
     on the site carries the same footer links, so asserting over the full HTML
     passes even with the body's signposts deleted - mutation testing removed
     the "every match" link and this test stayed green. The footer is
     boilerplate; the point is that the 404 itself says where to go. */
  const body = /<div class="prose">([\s\S]*?)<\/div>\s*<footer/.exec(html);
  assert.ok(body, "the page body must be findable");
  for (const href of ['href="/"', 'href="/matches"', 'href="/how-it-works"'])
    assert.ok(body[1].includes(href),
      "the body of the page must link to " + href + ", not just the footer");
});

test("it explains why, because the commonest cause is not a typo", () => {
  /* Retired match pages are the leading source of 404s on this site, and a
     reader who thinks they mistyped something will try again rather than move
     on. */
  assert.match(html, /aged out|retired/i,
    "the page should say that match pages are retired once played");
});

/* --------------------------------------------------- and it hides correctly */

test("it is noindex", () => {
  assert.match(html, /<meta name="robots" content="noindex,follow">/,
    "without this the 404 competes in search results with the pages it exists " +
    "to redirect people to");
});

test("follow is kept, so its links still count", () => {
  /* noindex,nofollow would waste the one thing this page is good for: it
     points at the pages that do exist. */
  assert.ok(!/content="noindex,nofollow"/.test(html));
});

test("it carries no canonical", () => {
  assert.ok(!/rel="canonical"/.test(html),
    "a canonical on a 404 asks a crawler to treat the missing page as real");
});

test("but every other page still does", () => {
  /* The noindex option was added to the shared shell, so the risk is that it
     stripped the canonical from the pages that need one. */
  for (const [name, h] of [
    ["privacy", P.renderPrivacy("1 January 2026")],
    ["terms", P.renderTerms("1 January 2026")]
  ]) {
    assert.match(h, /rel="canonical" href="https?:\/\/[^"]+"/, name + " lost its canonical");
    assert.ok(!/name="robots"/.test(h), name + " must not be noindex");
  }
});

/* ------------------------------------------------------ and stays unlisted */

test("the sitemap never lists it", () => {
  /* The build writes 404.html alongside the standing pages, which is exactly
     the shape of mistake that puts it in `paths` and then in the sitemap. */
  const pre = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  const i = pre.indexOf('fs.writeFileSync(path.join(PUB, "404.html")');
  assert.ok(i > 0, "prebuild must write the 404 page");
  /* Look at the statements around the write: none of them may push a path. */
  const near = pre.slice(i - 400, i + 400).replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.ok(!/paths\.push/.test(near),
    "the 404 must not be added to the sitemap's path list");

  const sm = P.renderSitemap(["/", "/privacy", "/terms"]);
  assert.ok(!/404/.test(sm), "and no 404 may appear in a rendered sitemap");
});

test("robots.txt does not need to mention it either", () => {
  /* Disallowing it in robots.txt would be actively wrong: a blocked page
     cannot be crawled, so the noindex on it would never be read. */
  const r = P.renderRobots();
  assert.ok(!/404/.test(r),
    "blocking the 404 in robots.txt stops the noindex from ever being seen");
});
