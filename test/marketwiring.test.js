"use strict";
/* ADDING A MARKET TOUCHES FOUR PLACES. THIS IS THE ONE THAT NOTICES.
 *
 * The seven markets added on 14 Sep needed: a probability in the model, a chip
 * in the table, a row in the share link's vocabulary, and an entry in the swap
 * menu. Two of those complained when they were missed and two did not, so the
 * link shipped unable to carry them (a slip with one produced a long, dead URL)
 * and the swap menu sat at fifteen markets for a month.
 *
 * The chip table is the source of truth: if the builders can pick it, it is a
 * market, and everything else must know about it. This walks every code in
 * MKT_BY_CHIP and checks each wiring point in turn, so the next market that is
 * half-added fails here rather than in somebody's WhatsApp.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const SL = require("../lib/sliplink.js");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function grab(name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}
function decl(re, what) {
  const m = re.exec(src);
  assert.ok(m, what + " is gone from index.html");
  return m[1];
}

/* Every code either builder can put on a slip. */
const CHIP_TABLE = decl(/var MKT_BY_CHIP=(\{[\s\S]*?\});/, "MKT_BY_CHIP");
const CODES = [...new Set([...CHIP_TABLE.matchAll(/"([A-Z0-9_.]+)"/g)].map((m) => m[1]))];

/* A fixture carrying every probability the model publishes, so mProb has
   something to answer with for each market. Values are plausible rather than
   real - what is being tested is the WIRING, not the numbers. */
const FIXTURE = {
  home: "Arsenal", away: "Chelsea", date: "2026-09-16", league: "England Premier League",
  home_p: 0.52, draw_p: 0.24, away_p: 0.24, dc1x: 0.76, dcx2: 0.48, dc12: 0.76,
  anybody: 0.76, o15: 0.80, o25: 0.56, o35: 0.30, btts: 0.54, fh_o05: 0.70,
  h_o05: 0.74, h_o15: 0.40, a_o05: 0.70, a_o15: 0.36,
  draw_o25: 0.14, draw_o15: 0.19, draw_btts: 0.17,
  home_o25: 0.63, home_o15: 0.70, home_btts: 0.62,
  away_o25: 0.60, away_o15: 0.66, away_btts: 0.59,
  h_win_half: 0.62, a_win_half: 0.41,
  ch: 5.4, ca: 4.3,          /* expected corners per side - the corners chip */
  sh: 14.2, sa: 10.9,        /* expected shots per side - the total-shots chip */
};

const api = new Function(
  "var MKT_BY_CHIP=" + CHIP_TABLE + ";" +
  /* The menu's own two decisions, lifted rather than re-stated: which market is
     never offered, and the order the rows come out in. */
  decl(/(var SWAP_NEVER=\{[^;]*\};)/, "SWAP_NEVER") +
  decl(/(var SWAP_ORDER=\[[^\]]*\];)/, "SWAP_ORDER") +
  "function esc(s){return String(s);}" +
  "function bookAllows(){return true;}" +
  "var DATA={cornersK:52,shotsK:41};" + grab("cornersK") + grab("cLgamma") + grab("cornersOver") +
  grab("mProb") + grab("mLabel") + grab("swapOptions") +
  "\nreturn {mProb:mProb,mLabel:mLabel,swapOptions:swapOptions,MKT_BY_CHIP:MKT_BY_CHIP};"
)();

test("the chip table is not empty, or the rest of this file proves nothing", () => {
  assert.ok(CODES.length >= 20, "read only " + CODES.length + " codes from MKT_BY_CHIP");
});

test("every market has a probability the model can answer with", () => {
  /* Without one the builders silently never pick it: mProb returns null, the
     confidence floor rejects it, and the chip looks switched on and does
     nothing. */
  const dumb = CODES.filter((c) => {
    const v = api.mProb(FIXTURE, c);
    return v == null || isNaN(v);
  });
  assert.deepEqual(dumb, [], "mProb has no case for these, so no slip can carry them");
});

test("every market has a sentence, never its own code", () => {
  /* Unlabelled, a leg prints "MIX_2_OV_1.5" on the panel - which is how a
     reader finds out we shipped something half-finished. */
  const nameless = CODES.filter((c) => {
    const l = api.mLabel(FIXTURE, c);
    return !l || l === c || /^[A-Z0-9_.]+$/.test(l);
  });
  assert.deepEqual(nameless, [], "these print as raw codes");
});

test("every market can travel in a shared link", () => {
  /* lib/sliplink.js refuses a code it does not know, and the refusal is not
     quiet: the short link is never stored, the fallback long URL goes out
     instead, and it opens on "that slip has a bet we do not offer". */
  const cannot = CODES.filter((c) => !(c in SL.MARKETS));
  assert.deepEqual(cannot, [], "a slip carrying these cannot be shared");
});

test("the browser's copy of that vocabulary matches it exactly", () => {
  /* Two lists, one rule - the page refuses to encode what the server would
     refuse to decode. */
  const m = /var LINK_MARKETS=\{([\s\S]*?)\};/.exec(src);
  assert.ok(m, "LINK_MARKETS is gone from index.html");
  const client = [...m[1].matchAll(/"([A-Z0-9_.]+)"\s*:/g)].map((x) => x[1]).sort();
  assert.deepEqual(client, Object.keys(SL.MARKETS).sort(),
    "the browser's list and the link's list have drifted");
});

test("every market is reachable from the swap menu, bar the draw", () => {
  /* The menu is derived from this same table now, so this is really a check
     that nothing silently drops out of it - and that the one deliberate
     exclusion is still the only one. */
  const offered = new Set(api.swapOptions(FIXTURE).map((o) => o.code));
  const missing = CODES.filter((c) => c !== "X" && !offered.has(c));
  assert.deepEqual(missing, [], "these cannot be swapped onto another game");
  assert.ok(!offered.has("X"), "the draw is back on the swap menu");
});

test("a market added to the table but wired nowhere fails this file", () => {
  /* The guard on the guard: if the checks above stop reading the real table,
     they would pass for ever. */
  const fake = CODES.concat(["MADE_UP_1.5"]);
  const dumb = fake.filter((c) => {
    const v = api.mProb(FIXTURE, c);
    return v == null || isNaN(v);
  });
  assert.deepEqual(dumb, ["MADE_UP_1.5"],
    "mProb answers for a market that does not exist, so this file checks nothing");
});

/* ------------------------- markets we move but never predict ------------- */

test("every pass-through market SportyBet maps has a name on the panel", () => {
  /* The editor and the splitter both draw a leg through mLabel, so an unnamed
     market prints its own code while somebody is deciding what to do with it -
     which is exactly what a reader saw on HCVKA1 and PV5CLL. The chip table
     covers the markets we PREDICT; this covers the ones we only move. */
  const { execSync } = require("node:child_process");
  const API = path.join(ROOT, "..", "..", "Documents", "soccerwizard-api");
  let codes;
  try {
    const code = "import sys,json;sys.path.insert(0,r'" + API + "');" +
      "import server,betpawa;print(json.dumps(sorted(" +
      "set(server.PASSTHROUGH_MAP)|set(betpawa.PASSTHROUGH_MAP))))";
    const out = execSync("python -c " + JSON.stringify(code),
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    codes = JSON.parse(out.slice(out.indexOf("[")));
  } catch (e) {
    /* The API lives in a sibling checkout; skip rather than fail if it is not
       there, the same way the other cross-repo tests do. */
    return;
  }
  assert.ok(codes.length > 100, "read only " + codes.length + " pass-through codes");
  const f = { home: "Leeds", away: "Newcastle" };
  const nameless = codes.filter((c) => {
    const l = api.mLabel(f, c);
    return !l || l === c || /^[A-Z0-9_.]+$/.test(l);
  });
  assert.deepEqual(nameless, [], "these print as raw codes on the edit and split panels");
});

test("no font stack ends in `inherit`, which throws the whole declaration away", () => {
  /* `font-family: Roboto, Arial, inherit` is not a fallback chain - `inherit`
     is not a family name, so the parser discards the DECLARATION and the
     element silently keeps the page font. BetKing's condensed stack had been
     dead that way since it shipped, and betPawa's Roboto joined it: the
     wordmark on the offer card rendered in the page face while the source
     said otherwise. Caught by reading the SHIPPED stylesheet, not the source.
     A bare `font-family: inherit` on its own is valid and is left alone. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  const bad = [...src.matchAll(/font-family:([^;}]*)/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((v) => /,\s*inherit\b/.test(v));
  assert.deepStrictEqual(bad, [], "these stacks are thrown away by the parser");
});
