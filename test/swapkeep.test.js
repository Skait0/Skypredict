"use strict";

/**
 * A leg you changed is yours, and a shuffle must not take it back.
 *
 * Reported: "i changed an option, when i shuffled, it changed the game i
 * changed to the default one it initially predicted for me."
 *
 * Legs the builders put on the slip carry auto:true, and every refill starts by
 * dropping them:
 *
 *   MYSLIP = MYSLIP.filter(x => !x.auto).concat(fresh.map(... auto:true ...))
 *
 * The comment above that line has always said it "leaves anything hand-picked
 * alone". But swapMy rewrote code, label and p and left auto:true in place, so
 * an edited leg was still machine-picked as far as the refill was concerned:
 * the next conjure deleted it and put the model's original market back.
 *
 * These tests run the real swapMy out of index.html rather than a copy of it,
 * because the bug was never in the logic anyone would have transcribed - it was
 * in the one field that did not get written.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* swapMy with everything it reaches for injected. The stubs are deliberately
   dumb - the only thing under test is what it writes into MYSLIP. */
function runSwap(slip, id, oldCode, newCode, opts) {
  const options = opts || [
    { code: "DC_1X", label: "Home or draw", p: 0.78 },
    { code: "OVER_1.5", label: "Over 1.5", p: 0.81 },
  ];
  const fn = new Function("MYSLIP", "OPTS", "OUT",
    "function fixtureById(){return {home:'A',away:'B'};}" +
    "function swapOptions(){return OPTS;}" +
    "function closeSwapMenu(){}" +
    "function myslipHas(id,code){return MYSLIP.some(function(x){return x.id===id&&x.code===code;});}" +
    "function saveMy(){OUT.saved=true;}" +
    "function renderFab(){}" +
    "function syncAddBtn(){}" +
    "function renderMySheet(){}" +
    "function $(){return null;}" +
    "var window={};" +
    grab("swapMy") +
    "\nreturn swapMy;");
  const out = {};
  fn(slip, options, out)(id, oldCode, newCode);
  return out;
}

const autoLeg = () => ({ id: "m1", code: "DC_1X", label: "Home or draw", p: 0.78, auto: true });

test("changing a leg's market rewrites the pick", () => {
  const slip = [autoLeg()];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");
  assert.strictEqual(slip[0].code, "OVER_1.5");
  assert.strictEqual(slip[0].label, "Over 1.5");
  assert.strictEqual(slip[0].p, 0.81);
});

test("and stops it being machine-picked", () => {
  /* The whole bug: this field stayed true, so the refill treated an edited leg
     as one of its own and overwrote it. */
  const slip = [autoLeg()];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");
  assert.notStrictEqual(slip[0].auto, true,
    "the edited leg is still flagged auto, so the next shuffle will replace it");
});

test("the edit survives a shuffle", () => {
  /* End to end, using the refill expression the builders actually run. */
  const slip = [autoLeg(), { id: "m2", code: "DC_1X", label: "Home or draw", p: 0.7, auto: true }];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");

  const fresh = [
    { id: "m1", code: "DC_1X", label: "Home or draw", p: 0.78, auto: true },  /* the model's original */
    { id: "m3", code: "DC_X2", label: "Draw or away", p: 0.72, auto: true },
  ];
  let after = slip.filter((x) => !x.auto).concat(fresh);
  const seen = {};
  after = after.filter((x) => { if (seen[x.id]) return false; seen[x.id] = 1; return true; });

  const kept = after.find((x) => x.id === "m1");
  assert.ok(kept, "the edited leg was dropped from the slip entirely");
  assert.strictEqual(kept.code, "OVER_1.5",
    "the shuffle put the model's original market back over the user's choice");
  assert.ok(after.some((x) => x.id === "m3"), "the shuffle should still add new games");
  assert.ok(!after.some((x) => x.id === "m2"),
    "an untouched machine leg should still be replaced");
});

test("an untouched leg is still replaced", () => {
  /* The flag has to keep meaning something, or a shuffle stops shuffling. */
  const slip = [autoLeg()];
  const kept = slip.filter((x) => !x.auto);
  assert.strictEqual(kept.length, 0);
});

test("swapping onto a market already on the slip changes nothing", () => {
  /* SportyBet takes one pick per match. The guard has to fire before the write,
     or the duplicate check passes and the leg is edited anyway. */
  const slip = [autoLeg(), { id: "m1", code: "OVER_1.5", label: "Over 1.5", p: 0.81, auto: true }];
  runSwap(slip, "m1", "DC_1X", "OVER_1.5");
  assert.strictEqual(slip[0].code, "DC_1X", "the leg was edited into a duplicate");
  assert.strictEqual(slip[0].auto, true, "and was un-flagged despite nothing changing");
});

test("swapping a leg to the market it already has is a no-op", () => {
  const slip = [autoLeg()];
  runSwap(slip, "m1", "DC_1X", "DC_1X");
  assert.strictEqual(slip[0].auto, true,
    "nothing changed, so the leg is still the machine's");
});

/* ------------------------------------------------------------ the callers */

test("every refill drops machine legs and keeps the rest", () => {
  /* Three places rebuild My slip: the slider's sync, the wizard's conjure, and
     Book all. All three have to honour the flag, or an edited leg survives one
     path and is overwritten by another. */
  const refills = [...src.matchAll(/MYSLIP=MYSLIP\.filter\(function\(x\)\{return !x\.auto;\}\)/g)];
  assert.strictEqual(refills.length, 3,
    "expected the slider sync, the conjure and Book all, found " + refills.length);
});

test("retained legs are concatenated before the fresh ones", () => {
  /* The de-dupe that follows keeps the FIRST leg for each fixture. If the
     fresh picks came first, a re-picked fixture would win and the edit would be
     silently discarded even though the flag was cleared. */
  const parts = src.split("MYSLIP=MYSLIP.filter(function(x){return !x.auto;})");
  assert.strictEqual(parts.length, 4);
  parts.slice(1).forEach((p, i) => {
    const head = p.slice(0, 200);
    assert.match(head, /^\s*\r?\n?\s*\.concat\(/,
      "refill #" + (i + 1) + " does not concat the fresh picks after the kept ones");
  });
});

test("the de-dupe keeps the first leg for each fixture", () => {
  const dedupes = [...src.matchAll(/if\(seen\[x\.id\]\)return false;seen\[x\.id\]=1;return true;/g)];
  assert.ok(dedupes.length >= 2,
    "the de-dupe that protects the kept leg is missing from a refill path");
});

/* ------------------------------------ a slip that tidies itself and says so */

/* Reported as arriving at "My slip 28" with most of those games already
 * played. Conjured legs carry auto:true and are written to localStorage on
 * purpose, so they outlive the session by design - what did not outlive it was
 * their REMOVAL. renderMySheet pruned the started matches and then:
 *
 *   MYSLIP = MYSLIP.filter(...);
 *   var _b = MYSLIP.length;                  // read AFTER the filter
 *   if (MYSLIP.length !== _b) { saveMy(); renderFab(); }
 *
 * The length was compared with itself, so the branch never ran: nothing was
 * saved and the badge was never repainted. The slip looked tidy for as long as
 * the sheet was open and the dead legs were back on the next reload.
 */
test("the prune reads the length before it filters, not after", () => {
  const fn = src.slice(src.indexOf("function pruneMy()"),
    src.indexOf("function renderMySheet()"));
  assert.ok(fn.length > 40, "pruneMy is gone");
  const before = fn.indexOf("var before=MYSLIP.length");
  const filter = fn.indexOf("MYSLIP=MYSLIP.filter");
  assert.ok(before >= 0 && filter > before,
    "the count must be taken before the filter, or the comparison is with itself");
  assert.match(fn, /if\(MYSLIP\.length===before\) return false;\s*saveMy\(\); renderFab\(\);/,
    "a prune that changed something must be written down and repainted");
});

test("the badge is judged once the board can answer, not only when the sheet opens", () => {
  /* The count is on screen long before anybody opens the slip, and it is drawn
     from localStorage - including yesterday's conjured legs. fixtureById cannot
     answer until the payload lands, so that is where the first prune belongs. */
  const load = src.slice(src.indexOf("async function load()"),
    src.indexOf("}catch(err){", src.indexOf("async function load()")));
  assert.match(load, /pruneMy\(\)/, "the saved slip is never judged on load");
  assert.ok(load.indexOf("DATA=got.payload") < load.indexOf("pruneMy()"),
    "the prune must run after the payload lands, or every leg looks unknown");
});

test("a leg carries its own kickoff, because the board only speaks for today", () => {
  /* Keeping a leg whose fixture cannot be found is the right rule - the board
     drops a match at kick-off and carries cup ties only while the bookmaker
     lists them - and it is also why a slip grew without limit: yesterday's
     games are not on today's board, so every one of them was unfindable, and
     unfindable meant kept. A time written down when the leg was added is
     evidence the board cannot contradict. */
  const fn = src.slice(src.indexOf("function pruneMy()"),
    src.indexOf("function renderMySheet()"));
  assert.match(fn, /if\(x\.k&&x\.k<=Date\.now\(\)\) return false;/,
    "a leg that names a past kickoff must go");
  assert.match(fn, /if\(!f\) return true;/,
    "a leg with no recorded time must still never be dropped on a guess");
  /* Both writers have to record it or the rule only covers half the slip. */
  assert.match(src, /MYSLIP\.push\(\{id:id,code:code,label:label,p:\+p,k:kickoffOf\(id\)\}\)/,
    "a hand-added leg records no kickoff");
  assert.match(src, /auto:true,\s*\n\s*k:kickoffOf\(c\.id,c\.f\)/,
    "a conjured leg records no kickoff");
});

/* ------------------------------ the ticket the editor cannot honestly touch */

test("a slip of 1UP legs is told why, not offered nothing", () => {
  /* Reported on a real 45-leg SportyBet code, 8B9WJU: UP1_1 x16, UP2_1 x11,
     UP1_2 x6, DC1UP_1X x6, UP2_2 x2, DC1UP_X2 x1 - 42 of 45 legs paying early
     the moment a side goes a goal up. The model prices final scores, so mProb
     is null for every one of them: no swap can be judged, and legChance being
     null drops them all into the "could be removed" list. The panel offered to
     bin the ticket and nothing else.
     Stripping the promotion is not the answer and must never become one: 1UP
     settles exactly like the underlying bet plus an extra way to win early, so
     DC1UP_1X -> 1X would be a strictly worse bet sold as a safer one. */
  assert.match(src, /function promoLegs\(legs\)\{[\s\S]{0,200}\/\^\(UP\[12\]_\|DC1UP_\)\//,
    "the editor no longer recognises the promotion markets");
  const box = src.slice(src.indexOf("function saferBoxInner("),
    src.indexOf("var dial0=saferDial();", src.indexOf("function saferBoxInner(")));
  assert.match(box, /if\(!plan\.length&&promo\.length/,
    "the message must only appear when there is genuinely nothing to swap");
  assert.match(box, /promo\.length>=Math\.ceil\(legs\.length\*0\.6\)/,
    "a couple of promotion legs among many is a footnote, not the answer");
  assert.match(box, /pay early the moment a side goes a goal /,
    "it has to say WHY it cannot help");
  assert.match(box, /<b>Convert<\/b> and <b>Split it<\/b> both still work/,
    "and where the reader should go instead");
});

test("a promotion is priced at the bet underneath it, and widens like one", () => {
  /* THE CALL CHANGED, AND THIS IS THE REASONING IT CHANGED TO. We do not model
     when a side goes a goal up, so 1UP had no number and the editor was blind
     to 42 of the 45 legs on 8B9WJU. Read at the market underneath it instead:
     p(1UP) is at least p(that market), so the number can only understate the
     leg. A leg is never sold as stronger than it is, and the gain a swap is
     judged on is conservative.
     In the switch, not a table beside it, because the harnesses lift mProb out
     on its own to run the shipped code. */
  const m = src.slice(src.indexOf("function mProb(f,c){"), src.indexOf("var MIN_GRADED"));
  assert.match(m, /case"UP1_1":case"UP2_1":return mProb\(f,"1"\);/);
  assert.match(m, /case"UP1_X":case"UP2_X":return mProb\(f,"X"\);/);
  assert.match(m, /case"DC1UP_1X":return mProb\(f,"1X"\);/);
  /* A promotion on a straight result widens into the double chance holding it,
     exactly as the plain result does. */
  const safer = src.slice(src.indexOf("var SAFER={"), src.indexOf("var SAFER_MIN_GAIN"));
  assert.match(safer, /"UP1_1":"1X","UP2_1":"1X","UP1_2":"X2","UP2_2":"X2"/);
  /* But one already on a double chance has nothing wider to go to, and must
     never be given a swap - moving it could only narrow the bet. */
  const entries = safer.replace(/\/\*[\s\S]*?\*\//g, "");   /* the table, not the prose */
  assert.doesNotMatch(entries, /DC1UP_/,
    "DC1UP is already a double chance; there is nothing safer to swap it to");
  /* The draw promotions follow the draw's own rule: whichever double chance
     holding it the model rates higher. */
  assert.ok(src.includes('if(from==="X"||from==="UP1_X"||from==="UP2_X")'),
    "the draw promotions no longer follow the draw's own rule");
});

/* ---------------------------- the three levels change the bet, not just the mood */

/* Reported: "the three levels of editing shouldn't just remove legs, they
 * should change options". They were right. The table had seven entries, so on
 * most tickets saferSwap found nothing and the only thing left to offer was
 * dropping legs - and the levels moved two thresholds, never the destination.
 * Now `steps` says how far down the ladder a leg may travel, so Strong can
 * keep going while it keeps helping. Run against the shipped functions. */
function ladder(fixture) {
  const decl = (n) => {
    const i = src.indexOf("var " + n + "=");
    let d = 0, k = src.indexOf("{", i);
    for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
    return src.slice(i, k + 1) + ";";
  };
  const api = new Function("BYO", "B", "f",
    decl("SAFER") + decl("SAFER_STRENGTH") +
    grab("saferPick") + grab("saferDial") + grab("mProb") + grab("saferSwap") +
    "function fixtureByLeg(){return f;}function bookAllows(){return true;}" +
    "function bookVerdict(){return 'unknown';}" +
    "return function(code,how,n){BYO.saferHow=how;BYO.saferShuffle=n||0;" +
    "return saferSwap({prediction:code},B);};");
  return api({}, { key: "sporty", odds: "sportyOdds" }, fixture);
}
/* A lopsided game: strong home side, goals likely. */
const LOPSIDED = { home_p: .62, draw_p: .22, away_p: .16, dc1x: .84, dcx2: .38, dc12: .78,
  o15: .80, o25: .55, o35: .30, btts: .52, h_o05: .88, h_o15: .62, a_o05: .55, a_o15: .24 };

test("Strong walks further down the ladder than Light", () => {
  const run = ladder(LOPSIDED);
  assert.equal(run("OVER_3.5", "light").to, "OVER_2.5", "one rung at Light");
  assert.equal(run("OVER_3.5", "normal").to, "OVER_2.5", "one rung at Normal");
  const strong = run("OVER_3.5", "strong");
  assert.notEqual(strong.to, "OVER_2.5", "Strong must go past the neighbour");
  assert.ok(strong.pNew > run("OVER_3.5", "light").pNew,
    "and the whole point is that it lands somewhere likelier");
});

test("both teams to score softens into any two goals", () => {
  /* The same game and the same idea, with one condition dropped: over 1.5 does
     not care who scores them, which is where both-score tickets die on a
     lopsided card. */
  assert.equal(ladder(LOPSIDED)("GG", "light").to, "OVER_1.5");
});

test("a goals line softens to whichever side the model likes, not the home one", () => {
  const home = ladder(LOPSIDED)("OVER_1.5", "strong");
  assert.equal(home.to, "HOME_OVER_0.5");
  /* Mirror the fixture and the answer must mirror with it, or this is a
     hard-coded guess wearing a model's clothes. */
  const away = ladder({ ...LOPSIDED, h_o05: .55, a_o05: .88 })("OVER_1.5", "strong");
  assert.equal(away.to, "AWAY_OVER_0.5");
});

test("every level still declares how far it may go", () => {
  const dial = src.slice(src.indexOf("var SAFER_STRENGTH={"), src.indexOf("function saferDial"));
  ["auto", "light", "normal", "strong"].forEach((k) => {
    const from = dial.indexOf(k + ":{");
    assert.ok(from > 0, k + " is gone from the dial");
    const entry = dial.slice(from, dial.indexOf("}", from));
    assert.match(entry, /steps:\d/,
      k + " has no steps, so it cannot say how far a leg may travel");
  });
});

test("shuffle offers a different rung, and comes back round", () => {
  /* Asked for: "the edit for me should have a shuffle option, that way the
     user has more variety". It only became possible once the levels walked a
     ladder - with one target per market a re-roll produced the identical plan.
     Every rung offered here already passed the same tests as the default one:
     the book sells it, it is priced, and it gains more than the dial asks. So
     shuffle loosens nothing; it walks back up the ladder a rung at a time. */
  const run = ladder(LOPSIDED);
  const at = (n) => { const r = run("OVER_3.5", "strong", n); return r && r.to; };
  assert.equal(at(0), "HOME_OVER_0.5", "the safest rung is still what it offers first");
  assert.notEqual(at(1), at(0), "a shuffle has to actually change something");
  assert.notEqual(at(2), at(1));
  assert.equal(at(3), at(0), "and it wraps rather than running out");
  /* A leg with one honest option is simply unmoved. */
  const one = ["UP1_1"].map((c) => [0, 1, 2].map((n) => run(c, "strong", n).to));
  assert.equal(new Set(one[0]).size, 1, "a leg with one rung must not be shuffled into a worse one");
});

test("the shuffle button only appears when it would change something", () => {
  /* A control that does nothing is worse than no control. The box counts how
     many legs answer differently at the next offset and draws the button only
     if any do. */
  const box = src.slice(src.indexOf("function saferBoxInner("), src.indexOf("function wireSafer("));
  assert.match(box, /BYO\.saferShuffle=was\+1;/, "it must ask the ladder, not guess");
  assert.match(box, /finally\{ BYO\.saferShuffle=was; \}/,
    "and put the counter back, or counting it would change the plan it counted");
  assert.match(box, /\(alt\?"<button class='sf-chip sf-shuffle' id='sfShuffle'/,
    "the button must be conditional on there being an alternative");
  const wire = src.slice(src.indexOf("function wireSafer("), src.indexOf("/* WHAT A TRIM WOULD COST"));
  assert.match(wire, /BYO\.saferShuffle=\(BYO\.saferShuffle\|\|0\)\+1; redraw\(\);/);
  assert.match(wire, /BYO\.saferHow=c\.dataset\.how; BYO\.saferShuffle=0;/,
    "a new strength is a new ladder, so the offset must start over");
});

/* ------------------------------- Asian handicaps, which had no number at all */

/* 64 Asian codes crossed between books, booked, and could not be judged: mProb
 * had no case for them, so saferSwap bailed on the first line and every rule in
 * the editor was blind to a family that fills whole tickets. They never needed
 * a model - around nil a handicap IS a market we already publish. These run the
 * shipped mProb rather than a copy of the identities. */
function prices(fixture) {
  return new Function("f", grab("mProb") + "return function(c){return mProb(f,c);};")(fixture);
}

test("a handicap around nil is priced as the market it already is", () => {
  const p = prices(LOPSIDED);
  /* The line is quoted from the home team's point of view on every book, so
     AH_2_-0.5 is the AWAY side receiving half a goal - draw or away. Reading
     the number straight off the away name would price the opposite bet. */
  assert.equal(p("AH_1_-0.5"), LOPSIDED.home_p, "home -0.5 is the home win");
  assert.equal(p("AH_1_0.5"), LOPSIDED.dc1x, "home +0.5 is home or draw");
  assert.equal(p("AH_2_0.5"), LOPSIDED.away_p, "away -0.5 is the away win");
  assert.equal(p("AH_2_-0.5"), LOPSIDED.dcx2, "away +0.5 is draw or away");
  /* The nil line returns the stake on a draw, so the draw leaves the sample. */
  const dnb = LOPSIDED.home_p / (LOPSIDED.home_p + LOPSIDED.away_p);
  assert.ok(Math.abs(p("AH_1_0") - dnb) < 1e-12, "the nil line is draw no bet");
  assert.equal(p("DNB_1"), p("AH_1_0"), "and draw no bet is the same bet, so the same number");
  assert.equal(p("DNB_2"), p("AH_2_0"));
  /* Draw no bet sits between the win and the double chance by construction. */
  assert.ok(p("AH_1_-0.5") < p("AH_1_0") && p("AH_1_0") < p("AH_1_0.5"));
});

test("a line we cannot settle from one number stays unpriced", () => {
  /* A whole ball pushes when the margin lands on it and a quarter splits the
     stake across two lines. Neither is one probability without a distribution
     over margins, which the payload does not carry - so null, the same answer
     1UP gets, rather than a guess on somebody's ticket. */
  const p = prices(LOPSIDED);
  for (const c of ["AH_1_-1", "AH_1_1", "AH_2_-2", "AH_1_-0.25", "AH_2_0.75", "AH_1_-1.5"])
    assert.equal(p(c), null, c + " was given a number it cannot have");
});

test("a handicap walks the same ladder every other market does", () => {
  const run = ladder(LOPSIDED);
  /* Half a goal towards the punter each rung: win, then win-or-stake-back,
     then win-or-draw. */
  assert.equal(run("AH_1_-0.5", "light").to, "AH_1_0", "one rung at Light");
  assert.equal(run("AH_1_-0.5", "strong").to, "AH_1_0.5", "and further at Safest");
  /* The away side walks DOWN the home-quoted number for the same widening. */
  assert.equal(run("AH_2_0.5", "strong").to, "AH_2_-0.5");
  /* Draw no bet widens into the double chance holding it - a smaller gain
     than the handicap walk, since the stake already came back on a draw, so
     it takes a dial that moves on small gains. */
  assert.equal(run("DNB_1", "strong").to, "1X");
});
