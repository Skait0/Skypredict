"use strict";

/* The refusal a reader can act on.
 *
 * Measured against the live route on 21 Sep 2026: a slip whose every leg sits
 * on a market SportyBet's feed carries no price for comes back 400 with no
 * `unbookable` and no reason. The page said "SportyBet wouldn't take this
 * slip. One of the picks may have just closed. Remove a leg and try again." -
 * advice that cannot work, because every leg has the same problem and removing
 * one changes nothing.
 *
 * The server cannot offer those legs as `unbookable`: that field means "drop
 * these and the rest may book", and when it covers the whole slip there is no
 * rest. So it says `suspectAll` with the markets instead, and this is the page
 * turning that into an instruction. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const grab = (name) => {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error(name + " is gone from index.html");
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(name + " never closes");
};

const html = new Function("d", "B",
  "function esc(s){return String(s);}" +
  "function bookReason(){return null;}" +
  "function mLabel(f,c){return c;}" +
  grab("bookErrHTML") + "return bookErrHTML(d,B);");
const B = { mark: "SportyBet" };

test("an all-suspect refusal names the markets instead of blaming a leg", () => {
  const out = html({ suspectAll: true, suspectMarkets: ["OVER_2.5"] }, B);
  assert.match(out, /isn't pricing this market right now/);
  assert.match(out, /OVER_2\.5/);
  assert.doesNotMatch(out, /Remove a leg/,
    "the old advice cannot work here and must not be shown");

  const many = html({ suspectAll: true, suspectMarkets: ["OVER_2.5", "GG", "HOME_OVER_0.5"] }, B);
  assert.match(many, /these markets/);
  assert.match(many, /OVER_2\.5, GG, HOME_OVER_0\.5/);
});

test("a long list is trimmed rather than printed whole", () => {
  /* A forty-leg slip can carry a dozen distinct markets, and a paragraph
     listing all of them is a wall nobody reads. */
  const out = html({ suspectAll: true,
    suspectMarkets: ["A", "B", "C", "D", "E", "F"] }, B);
  assert.match(out, /A, B, C, D and 2 more/);
});

test("every other refusal is untouched", () => {
  /* This branch is additive: a named refusal, a timeout, our own cap and the
     plain error all read exactly as they did. */
  assert.match(html({ _kind: "timeout" }, B), /didn't answer in time/);
  assert.match(html({ _kind: "capped" }, B), /today's ten booking codes/);
  assert.match(html({}, B), /wouldn't take this slip/);
  assert.match(html({}, B), /Remove a leg and try again/);
  /* suspectAll false is not suspectAll. */
  assert.match(html({ suspectAll: false, suspectMarkets: ["GG"] }, B),
    /wouldn't take this slip/);
});
