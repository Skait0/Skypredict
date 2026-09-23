"use strict";
/* WHAT THE CONVERTER WILL ACTUALLY MOVE.
 *
 * The API maps a market on both books; the panel still has to be willing to
 * send it. Those are two different lists and they drifted: 1X2-or-Over/Under
 * at 2.5 was mapped on both books for a week while the panel refused every
 * such leg with "Bet9ja sells this at 1.5 and 3.5, not 2.5". That sentence was
 * true of the market it was looking at and false of the book - their 2.5 is a
 * different key, S_CHANCEMIXGGOU, which bet9ja.py has mapped since a punter's
 * real code turned it up.
 *
 * So this pins the two lists against each other: every market both books map
 * must have a name on the panel, and the panel must not carry a rule that
 * refuses a whole family the API can book.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const API = path.join(ROOT, "..", "..", "Documents", "soccerwizard-api");
const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

const mLabel = new Function("esc", grab("mLabel") + "\nreturn mLabel;")((s) => String(s));
const mixReline = new Function(grab("mixReline") + "\nreturn mixReline;")();

/* The keys of both PASSTHROUGH_MAPs, asked of the API itself. Half of each
   table is generated in loops, so a copy here would go stale the first time a
   line is added, and a regex over the source reads only the literals. */
let TABLES = null;
function tables() {
  if (TABLES) return TABLES;
  const { execSync } = require("node:child_process");
  const code = "import sys,json;sys.path.insert(0,r'" + API + "');" +
    "import server,bet9ja;" +
    "print(json.dumps({'s':sorted(server.PASSTHROUGH_MAP),'b':sorted(bet9ja.PASSTHROUGH_MAP)}))";
  const out = execSync("python -c " + JSON.stringify(code), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const got = JSON.parse(out.slice(out.indexOf("{")));
  TABLES = { s: new Set(got.s), b: new Set(got.b) };
  return TABLES;
}
const passthroughKeys = (which) => tables()[which];

test("every market both books map has a name on the panel", () => {
  /* Unlabelled, a leg printed its own code - "CORNERS_OV_8.5" where a sentence
     belongs - which is how a reader finds out we shipped a market we did not
     finish. Only the literal keys are checked; the generated lines are covered
     by the shapes mLabel parses. */
  const shared = [...passthroughKeys("s")].filter((k) => passthroughKeys("b").has(k));
  assert.ok(shared.length >= 20, "read only " + shared.length + " shared codes");
  const f = { home: "Home", away: "Away" };
  const nameless = shared.filter((c) => {
    const l = mLabel(f, c);
    return !l || l === c || /^[A-Z0-9_.]+$/.test(l);
  });
  assert.deepEqual(nameless, [], "these would print as raw codes");
});

test("a 1X2-or-Over/Under leg at 2.5 is not refused on its way to Bet9ja", () => {
  /* The bug: a blanket rule on the family rather than on the line. */
  assert.doesNotMatch(src, /stuck\.push\(\{leg:l, why:to\.label\+" sells this at/,
    "the panel still refuses the family Bet9ja can book");
  assert.doesNotMatch(src, /else if\(\/\^MIX_\/\.test\(code\)/,
    "the blanket rule on the family is back");
  /* And the line that genuinely cannot travel is still the one that moves. */
  assert.equal(mixReline("MIX_1_OV_2.5"), null, "2.5 crosses untouched");
  assert.equal(mixReline("MIX_1_OV_1.5"), "MIX_1_OV_2.5");
  assert.equal(mixReline("MIX_X_UN_3.5"), "MIX_X_UN_2.5");
});

test("both books map the 2.5 line, which is what makes that legal", () => {
  const s = passthroughKeys("s"), b = passthroughKeys("b");
  for (const code of ["MIX_1_OV_2.5", "MIX_1_UN_2.5", "MIX_X_OV_2.5",
    "MIX_X_UN_2.5", "MIX_2_OV_2.5", "MIX_2_UN_2.5"]) {
    assert.ok(s.has(code), "SportyBet no longer maps " + code);
    assert.ok(b.has(code), "Bet9ja no longer maps " + code);
  }
});

/* ------------------------------------------------- what a read says out loud */

test("a game we do not carry is named in words, not in plumbing", () => {
  /* The bookmaker's read returns its own event id and, for a fixture we do not
     hold, no team names at all. "Game sr:match:72203052" was our plumbing on
     the reader's screen. */
  assert.doesNotMatch(src, /"Game "\+esc\(String\(l\.eventId\)\)/,
    "the raw event id is being printed again");
  assert.match(src, /A game we don't carry/);
});

test("the read says how much of the slip survives, before the list", () => {
  const i = src.indexOf("byo-count"), j = src.indexOf("byo-legs");
  assert.ok(i > 0 && i < j, "the count belongs above the games, not under them");
  assert.match(src, /we can use<\/b>/,
    "the count no longer says what it counts");
  /* THE PRICE COUNT IS GONE from this line, on purpose. It counted legs WE
     hold no price for - the sweep fetches 24 markets and a pass-through market
     is not among them - and it read as a warning about the bookmaker. On a real
     code it was most of the slip: 21 of 26 usable legs on HCVKA1, all of them
     markets SportyBet quotes. The row still says it where it belongs. */
  assert.doesNotMatch(src, /with no price from/,
    "the count is telling readers about prices again");
  const row = src.slice(src.indexOf("var rows=legs.map("), src.indexOf("var away=legs.length"));
  assert.doesNotMatch(row, /:"-"/, "the bare dash is back on a leg row");
});

/* --------------------------------- a market only some bookmakers sell */

test("the 1.5-rung line is never picked for a SportyBet slip, and is picked for both books that sell it", () => {
  /* Bet9ja and BetKing sell 1X2-or-Over/Under at 1.5 and SportyBet's card
     starts at 2.5. One refused selection refuses the whole ticket behind it,
     so this is caught three times over: the slider will not pick it, the chip
     asks, and booking offers to switch book rather than sending it. */
  const bookAllows = new Function(
    "const BOOK_ONLY=" + (src.match(/var BOOK_ONLY=(\{[^;]+\});/)[1]) + ";" +
    "function curBook(){return {key:'sporty'};}" +
    grab("bookAllows") + "\nreturn bookAllows;")();
  assert.equal(bookAllows("MIX_X_OV_1.5", { key: "sporty" }), false);
  assert.equal(bookAllows("MIX_X_OV_1.5", { key: "bet9ja" }), true);
  /* THE BOOK THIS TEST EXISTS FOR. BetKing's catalogue carries the whole rung
     and the map claimed it did not, so every BetKing reader was told to go and
     open a Bet9ja account to book a bet BetKing was already selling them.
     Verified on the wire, not read off a table: code D12WXN came back holding
     the draw and away signs, and MQ29ZR was booked for the home sign. */
  assert.equal(bookAllows("MIX_X_OV_1.5", { key: "betking" }), true);
  assert.equal(bookAllows("MIX_1_OV_1.5", { key: "betking" }), true);
  assert.equal(bookAllows("MIX_2_OV_1.5", { key: "betking" }), true);
  /* And the fourth book, whose card was read by tools/bpgen.js rather than
     assumed from the other three: "1X2 and Totals - FT" carries the 1.5 rung
     on all three signs. */
  assert.equal(bookAllows("MIX_X_OV_1.5", { key: "betpawa" }), true);
  assert.equal(bookAllows("MIX_1_OV_1.5", { key: "betpawa" }), true);
  assert.equal(bookAllows("MIX_2_OV_1.5", { key: "betpawa" }), true);
  /* Everything else books at any of them, and must keep doing so. */
  assert.equal(bookAllows("MIX_X_OV_2.5", { key: "sporty" }), true);
  assert.equal(bookAllows("OVER_1.5", { key: "sporty" }), true);
  assert.equal(bookAllows("MIXGG_1", { key: "sporty" }), true);
});

test("the slider asks the question before it picks, and booking asks again", () => {
  assert.match(src, /mkOn\[c\]!==false && bookAllows\(c,curBook\(\)\)/,
    "the slider no longer filters by bookmaker");
  assert.match(src, /var wrongBook=picks\.filter\(function\(c\)\{return !bookAllows\(c\.code,B\);\}\)/,
    "booking no longer checks");
  /* Offered as a switch, not a refusal: the leg is bookable, just not here.
     One button per book that sells it - picking a favourite for the reader
     would move their whole slip to a bookmaker they may not bank with. */
  assert.match(src, /Book the whole slip at "\+bookNames\(need\)/);
  assert.match(src, /need\.map\(function\(k\)\{[\s\S]*?data-use='/,
    "the switch offer is back to a single hard-coded book");
});

/* ------------------------------------------------------- win either half */

test("win either half is priced from two halves, not from the full-time matrix", () => {
  const M = require("../lib/model.js");
  const p = { lh: 1.7, la: 1.0, k: 200, matrix: M.scoreMatrix(1.7, 1.0, 200), total: 2.7 };
  const k = M.markets(p, { fhShare: 0.447, k: 200 });
  assert.ok(k.homeWinHalf > 0 && k.homeWinHalf < 1);
  assert.ok(k.awayWinHalf > 0 && k.awayWinHalf < 1);
  /* Winning EITHER half is easier than winning the match, and the two sides
     can both manage it in the same game, so they may sum past one. */
  assert.ok(k.homeWinHalf > k.home,
    "winning a half must be likelier than winning the match");
  assert.ok(k.awayWinHalf > k.away);
  /* The better side is likelier to take a half, same as everywhere else. */
  assert.ok(k.homeWinHalf > k.awayWinHalf);
});

test("a full-time score cannot settle it, and gradeLeg says so", () => {
  /* 2-1 says nothing about who led at the interval. gradeLeg answers null,
     which callers treat as ungraded rather than as a loss - the record for
     this market is built at build time from half-time scores instead. */
  const gradeLeg = new Function(grab("gradeLeg") + "\nreturn gradeLeg;")();
  assert.equal(gradeLeg({}, "WINHALF_H_Y", 2, 1), null);
  assert.equal(gradeLeg({}, "WINHALF_A_Y", 2, 1), null);
  /* The combinations beside it still settle from the score. */
  assert.equal(gradeLeg({}, "MIX_X_OV_1.5", 1, 1), true);
});

test("gradeLeg settles the Asian lines, and says push rather than nothing", () => {
  /* Ten of the eighteen unsettled legs of a real 39-leg punter's code were
     these. A push is 0.5 - the stake came back - and NOT true, which would
     pay a bet the book did not pay, nor null, which would hide a leg that is
     genuinely finished. */
  const gradeLeg = new Function(grab("gradeLeg") + "\nreturn gradeLeg;")();
  /* Half balls cannot push: one side or the other has the leg. */
  assert.equal(gradeLeg({}, "AH_1_-0.5", 2, 1), true);
  assert.equal(gradeLeg({}, "AH_1_-1.5", 2, 1), false);
  /* The line is the HOME team's on both sides, so AH_2_-1.5 is the away side
     RECEIVING one and a half, not giving it - the sign that ahReline and
     mLabel both turn round. Losing 2-1 with +1.5 is a win. */
  assert.equal(gradeLeg({}, "AH_2_0.5", 2, 1), false);
  assert.equal(gradeLeg({}, "AH_2_-1.5", 2, 1), true);
  /* Whole balls push when the margin lands exactly on the line. */
  assert.equal(gradeLeg({}, "AH_1_-1", 2, 1), 0.5);
  assert.equal(gradeLeg({}, "AH_2_-1", 2, 1), 0.5);
  assert.equal(gradeLeg({}, "AH_2_1", 2, 1), false);
  assert.equal(gradeLeg({}, "AH_1_0", 1, 1), 0.5);
  assert.equal(gradeLeg({}, "AH_1_0", 2, 1), true);
  assert.equal(gradeLeg({}, "AH_2_0", 2, 1), false);
  /* Draw no bet is the nil line under another name, so it answers the same. */
  assert.equal(gradeLeg({}, "DNB_1", 1, 1), 0.5);
  assert.equal(gradeLeg({}, "DNB_1", 2, 1), true);
  assert.equal(gradeLeg({}, "DNB_2", 1, 2), true);
  /* Quarter balls split the stake across two lines: refused, not guessed. */
  assert.equal(gradeLeg({}, "AH_1_-0.25", 2, 1), null);
  assert.equal(gradeLeg({}, "AH_2_0.75", 2, 1), null);
  /* A full-time score still cannot settle half of a match. */
  assert.equal(gradeLeg({}, "FH_AH_1_-0.5", 2, 1), null);
  assert.equal(gradeLeg({}, "SH_AH_2_0.5", 2, 1), null);
  /* And a leg with no score is unknown, handicap or not. */
  assert.equal(gradeLeg({}, "AH_1_0", null, null), null);
});

test("the 1.5 rung of the family belongs to every book that sells it, all three signs", () => {
  /* SportyBet's 1X2-or-Over/Under card starts at 2.5 on every sign. Miss one
     and the slider builds a leg the reader's bookmaker will refuse, taking the
     whole ticket with it. Name a book too few and the opposite happens: the
     chip sends a reader who could book it to a bookmaker they do not use. */
  const BOOK_ONLY = new Function(
    "return " + src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";")();
  assert.deepEqual(Object.keys(BOOK_ONLY).sort(),
    ["MIX_1_OV_1.5", "MIX_2_OV_1.5", "MIX_X_OV_1.5"]);
  /* Three books now, and the third was read off Betpawa's own card by
     tools/bpgen.js rather than assumed from the other two - the same mistake
     this list held about BetKing for a week, which sent its readers elsewhere
     to book a bet it was selling them. */
  Object.values(BOOK_ONLY).forEach((b) =>
    assert.deepEqual([].concat(b).sort(), ["bet9ja", "betking", "betpawa"]));
  /* And the 2.5 rung stays on all three, which is what makes it the default. */
  assert.ok(!BOOK_ONLY["MIX_1_OV_2.5"] && !BOOK_ONLY["MIX_X_OV_2.5"]);
});

test("the chip's book list and the market map cannot drift apart", () => {
  /* Two declarations of one fact: MKT_CFG carries it per chip, BOOK_ONLY per
     market code, and the chip is what a reader taps. They were consistent
     while both said "bet9ja" and would have gone quietly out of step the
     moment one of them learned about BetKing. */
  const BOOK_ONLY = new Function(
    "return " + src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";")();
  const books = [...new Set(Object.values(BOOK_ONLY).flat())].sort();
  const onlys = [...src.matchAll(/only:\[([^\]]+)\]/g)]
    .map((m) => m[1].replace(/["']/g, "").split(",").map((s) => s.trim()).sort());
  assert.ok(onlys.length >= 2, "the 1.5-rung chips no longer declare a book list");
  onlys.forEach((o) => assert.deepEqual(o, books));
});

test("the chip asks before it narrows which bookmakers the slip can go to", () => {
  /* Switching this market on decides the reader's bookmaker for them: the
     slip can no longer be booked at SportyBet afterwards. It used to happen
     silently in both directions - a tap on a SportyBet slip moved the whole
     builder behind a toast, and a tap on a Bet9ja slip said nothing at all. */
  assert.match(src,
    /if\(only&&\(!c\.classList\.contains\("on"\)\|\|only\.indexOf\(curBook\(\)\.key\)<0\)\)\{\s*askBookOnly/,
    "the chip no longer asks on the way on");
  const i = src.indexOf("window.askBookOnly=");
  assert.ok(i > 0, "askBookOnly is gone");
  const fn = src.slice(i, src.indexOf("// Scope segment", i));
  /* It has to name the books - that is the whole request - and it has to name
     the one that cannot take it, because that is what the reader is giving
     up. Both come off the chip's own list, never a hard-coded name. */
  assert.match(fn, /bookNames\(have,"and"\)/, "the prompt no longer names the books that sell it");
  assert.match(fn, /bookNames\(lose,"and"\)/, "the prompt no longer names what it costs");
  assert.doesNotMatch(fn, /Bet9ja|BetKing|SportyBet/,
    "a book is named in the prompt's own text rather than read off the list");
  /* A button per book, and turning the market on is part of the same tap:
     switching book and leaving the chip off is how it used to take two. */
  assert.match(fn, /have\.filter\(function\(x\)\{return !here\|\|x!==curBook\(\)\.key;\}\)\.map/);
  assert.match(fn, /BUILD\.mk\[k\]=true; WSP\.mk\[k\]=true;/);
  /* Turning it OFF stays a plain tap. */
  assert.match(src, /ON THE WAY ON ONLY/);
});

/* The sentence a reader actually gets, run rather than grepped. The string
   assertions above pin the wiring; this pins the words, which is the part that
   was asked for and the part a refactor can quietly hollow out. */
function runAskBookOnly(curKey) {
  const i = src.indexOf("window.askBookOnly=function");
  const end = src.indexOf("\n  };", i);
  assert.ok(i > 0 && end > i, "askBookOnly is gone");
  const body = src.slice(i, end + 5);
  const host = { innerHTML: "", _wired: [] };
  host.querySelectorAll = () => [];
  host.querySelector = () => ({ addEventListener() {} });
  const env = {
    BOOKS: { sporty: { key: "sporty", label: "SportyBet" },
             bet9ja: { key: "bet9ja", label: "Bet9ja" },
             betking: { key: "betking", label: "BetKing" } },
    MKT_CFG: [{ k: "dro15", label: "Draw or o1.5", only: ["bet9ja", "betking"] }],
    BUILD: { mk: {} }, WSP: { mk: {} },
    curBook() { return env.BOOKS[curKey]; },
    $: () => host,
    showPrompt: (t, html) => { host.innerHTML = html; return true; },
    clearPrompt() {}, setBook() {}, renderBuilder() {},
    esc: (s) => String(s),
    window: {},
  };
  new Function(...Object.keys(env), grab("bookNames") + body + "\nreturn window.askBookOnly;")
    (...Object.values(env))("dro15", ["bet9ja", "betking"]);
  return host.innerHTML;
}

test("the prompt tells the reader which bookmakers can take the bet", () => {
  /* Asked for in exactly these terms: once the option is picked, say that it
     is only available to BetKing and Bet9ja users. */
  const onSporty = runAskBookOnly("sporty");
  assert.match(onSporty, /Bet9ja and BetKing/, "the prompt must name both books");
  assert.match(onSporty, /SportyBet/, "the prompt must name the book that cannot take it");
  assert.match(onSporty, /data-use='bet9ja'/);
  assert.match(onSporty, /data-use='betking'/);
  assert.match(onSporty, /Switch to Bet9ja/);
  /* On a book that already sells it there is nothing to switch, and the
     prompt has to say so rather than offer a move to where the reader is. */
  const onB9 = runAskBookOnly("bet9ja");
  assert.match(onB9, /You are on Bet9ja\. Turn it on\?/);
  assert.match(onB9, /Turn it on/);
  assert.doesNotMatch(onB9, /Switch to Bet9ja/);
  assert.match(onB9, /data-use='betking'/, "the other book that sells it is still offered");
});

test("the panel the prompt opens in has no fixed ceiling to be cut off at", () => {
  /* The prompt was reported cut off on a phone, and it was not the prompt:
     .filters-body was capped at 600px with overflow hidden, and the filters
     stand 572px tall at 390px wide. Anything that opens in there - this
     prompt, the idle note, the league list - has to be able to make the panel
     taller. A bigger number would only move the edge. */
  const open = /\n\.filters-body\{([^}]*)\}/.exec(src);
  assert.ok(open, "the open state must still be declared");
  assert.match(open[1], /max-height:max-content/,
    "the open height must come from the content");
  assert.ok(!/max-height:\d+px/.test(open[1]),
    "no fixed ceiling: " + open[1]);
  /* The collapsed state still clips - that is the whole point of it. */
  assert.match(src, /\.filters-body\[hidden\]\{[^}]*max-height:0/);
});

test("both books the chip names really map the family, all three signs", () => {
  /* The panel's list is a claim about two catalogues. If it outruns them the
     reader gets a code with a leg the bookmaker never took. */
  const bk = fs.readFileSync(path.join(API, "betking.py"), "utf8");
  const b9 = fs.readFileSync(path.join(API, "bet9ja.py"), "utf8");
  ["MIX_1_OV_1.5", "MIX_X_OV_1.5", "MIX_2_OV_1.5"].forEach((c) => {
    assert.ok(bk.includes('"' + c + '"'), "betking.py does not map " + c);
  });
  /* Bet9ja builds the rung from a sign table rather than listing the keys. */
  assert.match(b9, /for _line in \("1\.5", "3\.5"\):/);
  ["MIX_1_OV", "MIX_X_OV", "MIX_2_OV"].forEach((c) => {
    assert.ok(b9.includes('("' + c + '"'), "bet9ja.py dropped " + c);
  });
});

/* ------------------------------------ a leg whose id we do not recognise */

test("a game on the board is found even when the bookmaker's id differs", () => {
  /* Reported on code QER25G. SportyBet lists some fixtures twice: the slip
     carried sr:match:72723196 for Gaziantep v Fenerbahce and our board had
     sr:match:73436482 for the same two teams at the same kickoff. The id
     lookup missed and the converter said "not a game on our board" about a
     game sitting on it. */
  const api = new Function(
    "var DATA={fixtures:[{home:'Gaziantep',away:'Fenerbahce',kickoff:'2026-09-14T17:00:00.000Z'," +
      "eventId:'sr:match:73436482',b9EventId:832871639}," +
      "{home:'Torino',away:'Roma',kickoff:'2026-09-14T16:30:00.000Z',eventId:'sr:match:71945262'}]};" +
    "var MATCH_WINDOW_MS=" + (src.match(/MATCH_WINDOW_MS\s*=\s*([^;]+);/)[1]) + ";" +
    /* The matcher is one contiguous region of index.html - the alias table,
       its cache, normTeam and simTeams - so it is lifted whole rather than
       symbol by symbol. A copy of any part of it would pair games the
       shipped one would not, which is the failure this test is about. */
    src.slice(src.indexOf("var TEAM_ALIASES = {"), src.indexOf("function simTeams(")) +
    grab("simTeams") + grab("evStart") + grab("sameSlot") +
    grab("fixtureByBookId") + grab("fixtureByLeg") +
    "\nreturn {fixtureByLeg:fixtureByLeg};")();
  const B = { key: "sporty", id: "eventId" };

  /* The id the slip carries is not on the board at all. */
  const leg = { eventId: "sr:match:72723196", home: "Gaziantep FK",
    away: "Fenerbahce Istanbul", kickoff: Date.parse("2026-09-14T17:00:00.000Z") };
  const f = api.fixtureByLeg(leg, B);
  assert.ok(f, "the game is on the board and was not found");
  assert.equal(f.b9EventId, 832871639, "and it is the right one");

  /* The fence still holds: same names, a different week, no match. */
  const late = Object.assign({}, leg, { kickoff: Date.parse("2026-09-21T17:00:00.000Z") });
  assert.equal(api.fixtureByLeg(late, B), null, "a fixture a week away is not this one");

  /* A game we genuinely do not carry stays unmatched. */
  assert.equal(api.fixtureByLeg({ eventId: "sr:match:68157144",
    home: "Austin FC II", away: "Colorado Rapids 2",
    kickoff: Date.parse("2026-09-14T01:30:00.000Z") }, B), null);
});

/* --------------------------------------------- running a ticket past us */

test("a trim ranks on our model first and the bookmaker's price second", () => {
  const api = new Function(
    "var DATA={fixtures:[{home:'Torino',away:'Roma',kickoff:'2026-09-14T16:30:00.000Z'," +
      "eventId:'sr:match:1',o15:0.8,o25:0.55}]};" +
    "var MATCH_WINDOW_MS=86400000;" +
    src.slice(src.indexOf("var TEAM_ALIASES = {"), src.indexOf("function simTeams(")) +
    grab("simTeams") + grab("evStart") + grab("sameSlot") +
    grab("fixtureByBookId") + grab("fixtureByLeg") + grab("mProb") +
    grab("legChance") + grab("trimPlan") +
    "\nreturn {legChance:legChance,trimPlan:trimPlan};")();
  const B = { key: "sporty", id: "eventId" };

  /* On our board and a market we model: our own number, not theirs. */
  const known = { eventId: "sr:match:1", home: "Torino", away: "Roma",
    kickoff: Date.parse("2026-09-14T16:30:00.000Z"), prediction: "OVER_1.5", odds: 1.3 };
  assert.deepEqual(api.legChance(known, B), { p: 0.8, src: "model" });

  /* A game we do not carry still gets ranked - on the price, which carries
     their margin and is therefore never shown as a probability. */
  const foreign = { eventId: "sr:match:999", home: "Austin FC II",
    away: "Colorado Rapids 2", kickoff: Date.now(), prediction: "OVER_1.5", odds: 2.0 };
  assert.deepEqual(api.legChance(foreign, B), { p: 0.5, src: "book" });

  /* Nothing to judge it on sorts last rather than reading as a coin flip. */
  assert.deepEqual(api.legChance({ eventId: "x", odds: 1 }, B), { p: null, src: null });

  const plan = api.trimPlan([foreign, known, { eventId: "y", home: "A", away: "B",
    kickoff: Date.now(), prediction: "1", odds: 5 }], B, 1);
  assert.equal(plan.keep.length, 2);
  assert.equal(plan.cut.length, 1);
  assert.equal(plan.cut[0].leg.odds, 5, "the longest price goes first");
  assert.equal(plan.keep[0].leg.prediction, "OVER_1.5");
  assert.equal(plan.keep[0].src, "model", "our number leads the ranking");
});

test("a trim never changes a bet, it only removes one", () => {
  /* Subtraction is the one edit that cannot turn somebody's ticket into a
     different ticket. No market is swapped and no game is added. */
  const box = src.slice(src.indexOf("function trimBoxInner("), src.indexOf("function wireTrim("));
  assert.doesNotMatch(box, /NEAREST_LINE|mixReline/, "a trim must not reline a leg");
  const wire = src.slice(src.indexOf("function wireTrim("), src.indexOf("/* The inside of the split box"));
  assert.match(wire, /splitAndBook\(kept,1,/, "it books through the splitter's own path");
  assert.match(wire, /selOf:byoSel/, "and with the pasted slip's own selections");
});

test("a game we do not carry can still cross to the other book", () => {
  /* The route used to be their id -> our fixture -> the other book's id, so a
     leg on a league we hold no results for could be read and split but never
     converted. The other book's own feed answers directly now. */
  const api = new Function(
    "var DATA={fixtures:[]};" +
    "var MATCH_WINDOW_MS=86400000;" +
    "var FEED={bet9ja:[{eventId:832871639,homeTeam:'Austin FC II',awayTeam:'Colorado Rapids 2'," +
      "startTime:" + Date.parse("2026-09-14T01:30:00.000Z") + "}]};" +
    src.slice(src.indexOf("var TEAM_ALIASES = {"), src.indexOf("function simTeams(")) +
    grab("simTeams") + grab("evStart") + grab("sameSlot") + grab("feedMatch") +
    "\nreturn {feedMatch:feedMatch};")();
  const to = { key: "bet9ja", id: "b9EventId" };
  const leg = { home: "Austin FC II", away: "Colorado Rapids 2",
    kickoff: Date.parse("2026-09-14T01:30:00.000Z") };

  const m = api.feedMatch(leg, to);
  assert.ok(m, "the other book lists it and it was not found");
  assert.equal(m.eventId, 832871639);

  /* The fence is the whole safety net here: with no league to disagree about,
     two clubs with the same name are separated by kickoff alone. */
  const week = Object.assign({}, leg, { kickoff: Date.parse("2026-09-21T01:30:00.000Z") });
  assert.equal(api.feedMatch(week, to), null);
  /* And a book whose feed we never kept answers nothing rather than guessing. */
  assert.equal(api.feedMatch(leg, { key: "sporty" }), null);
});

test("a pick with no fixture is priced as unknown, not as nothing", () => {
  const mProb = new Function(grab("mProb") + "\nreturn mProb;")();
  assert.equal(mProb(null, "OVER_1.5"), null, "a fixture-less leg must not throw");
  assert.equal(mProb({ o15: 0.8 }, "OVER_1.5"), 0.8);
});

/* --------------------------------------------- making somebody's bet safer */

test("a swap keeps the game and widens the outcome, never the reverse", () => {
  const api = new Function(
    "var DATA={fixtures:[{home:'Arsenal',away:'Chelsea',kickoff:'2026-09-14T16:30:00.000Z'," +
      "eventId:'sr:match:1',home_p:0.54,draw_p:0.24,away_p:0.22,dc1x:0.78,dcx2:0.46," +
      "o15:0.79,o25:0.51,sportyOdds:{'1X':1.28,'OVER_1.5':1.22,'OVER_2.5':1.9,'1':1.85}}]};" +
    "var MATCH_WINDOW_MS=86400000; var BOOK_ONLY=" +
      src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";" +
    "function curBook(){return {key:'sporty',full:true,odds:'sportyOdds',id:'eventId'};}" +
    src.slice(src.indexOf("var TEAM_ALIASES = {"), src.indexOf("function simTeams(")) +
    grab("simTeams") + grab("evStart") + grab("sameSlot") + grab("fixtureByBookId") +
    grab("fixtureByLeg") + grab("mProb") + grab("bookAllows") + grab("legChance") +
    /* The editor asks the shared verdict before it swaps a leg onto a market -
       see bookVerdict. Lifted rather than stubbed, so this test exercises the
       real rule. */
    "const SAFE_UNPRICED={'1':1,'2':1,'X':1,'1X':1,'X2':1,'12':1};" +
    grab("fetchedMarket") + grab("bookVerdict") +
    "var BYO={saferHow:'normal',saferSwapOn:true,saferDrop:false};" +
    grab("gradeLeg") +
    src.slice(src.indexOf("var SAFER_TO=["), src.indexOf("function renderByo(")) +
    "\nreturn {saferSwap:saferSwap,saferPlan:saferPlan,saferDroppable:saferDroppable,SAFER_MIN_GAIN:SAFER_MIN_GAIN};")();
  const B = { key: "sporty", id: "eventId", odds: "sportyOdds" };
  const leg = (code, odds) => ({ eventId: "sr:match:1", home: "Arsenal", away: "Chelsea",
    kickoff: Date.parse("2026-09-14T16:30:00.000Z"), prediction: code, odds: odds });

  /* A win becomes the nearest bet that is proven safer on the same fixture -
     here draw no bet, which wins everywhere the win does and hands the stake
     back on a draw instead of losing it. It used to be the double chance every
     time, because a table said so; the table is gone and the rungs are derived
     from the grader, so the nearest honest one is what gets offered. */
  const win = api.saferSwap(leg("1", 1.85), B);
  assert.equal(win.to, "AH_1_0");
  assert.ok(win.pNew > win.pOld + api.SAFER_MIN_GAIN);

  /* A goals line drops one rung. */
  assert.equal(api.saferSwap(leg("OVER_2.5", 1.9), B).to, "OVER_1.5");

  /* Nothing to offer is left alone rather than moved sideways. */
  assert.equal(api.saferSwap(leg("GG", 1.8), B), null, "GG has no safer sibling");
  /* And a swap that gains too little is churn on a stranger's ticket. */
  const tiny = api.saferSwap(Object.assign(leg("1", 1.85), {}), {
    key: "sporty", id: "eventId", odds: "sportyOdds" });
  assert.ok(tiny, "sanity");
});

test("dropping legs is the reader's choice, and starts on", () => {
  const box = src.slice(src.indexOf("function saferBoxInner("), src.indexOf("function wireSafer("));
  assert.match(box, /dropOn\?saferDroppable/,
    "the box must only drop when asked");
  /* Asked means one of two things: the switch, or Auto - which is a decision
     the reader made by pressing Auto, shown ticked and locked rather than
     hidden. */
  assert.match(box, /var dropOn=dial0\.drop\|\|BYO\.saferDrop;/);
  assert.match(src, /auto:\{gain:0\.05,under:0\.55/, "Auto is not a setting any more");
  assert.match(box, /Take out legs we cannot fix/, "the choice must be on screen");
  /* IT STARTS ON NOW, and the reasoning is the reader's own words: "when we
     gamblers say we want a ticket edited, we want to remove picks that are not
     likely, and some options changed to safer ones." Removal is half of what
     the feature means, and it was off on three of the four levels - so Safest
     cleaned nothing unless the switch was found. Still a choice: the switch is
     on screen and turns it off, and nothing is booked until the button is
     pressed. */
  assert.match(src, /saferDrop:true,saferHow:"normal"/, "the choice starts on");
  assert.match(src, /BYO\.saferDrop=true; BYO\.saferSwapOn=true;/,
    "and a reset must not quietly put it back to off");
  /* Three strengths behind three words, and the words are the interface. */
  assert.match(src, /var SAFER_STRENGTH=\{/);
  assert.match(box, /data-how=/, "no way to change how hard it pushes");
  const wire = src.slice(src.indexOf("function wireSafer("), src.indexOf("/* WHAT A TRIM WOULD COST"));
  assert.match(wire, /if\(saferDial\(\)\.drop\|\|BYO\.saferDrop\) saferDroppable/,
    "and the booking must honour the same choice");
});

test("a read that beat the prices is redrawn when they arrive", () => {
  /* byoRead can finish while /api/fixtures is still in flight. The panel asks
     questions that need prices - is there a safer market, does this book sell
     it - and asked too early the answer is no to everything. Measured on a
     real eleven-leg code: three legs had a safer version and the box was
     empty. */
  assert.match(src, /function refreshByoPanels\(\)/);
  assert.match(src, /if\(n\) refreshByoPanels\(\);/,
    "nothing calls the redraw when a book finishes attaching");
  /* And it must not yank the screen out from under somebody mid-flow. */
  const fn = src.slice(src.indexOf("function refreshByoPanels()"),
    src.indexOf("function attachEventIds("));
  assert.match(fn, /getElementById\("codeModal"\)/, "a code on screen stops the redraw");
  assert.match(fn, /byoConvOut/);
  assert.match(fn, /byoSaferOut/);
});

test("the trim scales with the slip instead of always offering one two three", () => {
  /* Drop 1, 2 or 3 is right for the six-leg slip it was written against and
     meaningless on forty: dropping three of forty changes nothing anybody can
     feel. The options are a share of the ticket now. */
  const trimWays = new Function(grab("trimWays") + String.fromCharCode(10) +
    "return trimWays;")();
  assert.deepEqual(trimWays(2), [], "a double cannot be trimmed");
  assert.deepEqual(trimWays(3), [1]);
  assert.deepEqual(trimWays(6), [1, 2]);
  assert.deepEqual(trimWays(40), [4, 10, 14], "a big ticket gets big options");
  /* Never enough to leave fewer than two legs, whatever the share says. */
  trimWays(5).forEach((k) => assert.ok(5 - k >= 2));
  /* And no duplicate buttons when two shares round to the same number. */
  [3, 4, 5, 8, 11, 20, 40].forEach((n) => {
    const w = trimWays(n);
    assert.equal(new Set(w).size, w.length, n + " legs offered a duplicate");
  });
});

test("a long edit lists the first few and counts the rest", () => {
  const box = src.slice(src.indexOf("function saferBoxInner("), src.indexOf("function wireSafer("));
  assert.match(box, /var SHOW=6;/);
  assert.match(box, /plan\.length>SHOW/, "forty rows would bury the price and the button");
});

test("every job can be left, and the panel can be emptied", () => {
  /* Reported: nothing cancels and nothing resets. Opening a job books nothing,
     so leaving one must cost nothing either. */
  assert.match(src, /function byoReset\(\)/);
  const stage = src.slice(src.indexOf("function renderStage("), src.indexOf("function byoReset("));
  assert.match(stage, /byo-cancel/, "a job with no way out");
  assert.match(stage, /byo-reset/);
  assert.match(stage, /byo-working/, "no sign it is working");
  /* The reset must not reload: the board behind it took seconds to arrive. */
  const reset = src.slice(src.indexOf("function byoReset()"), src.indexOf("function byoReset()") + 900);
  assert.doesNotMatch(reset, /location\.reload|location\.href/);
  assert.match(reset, /BYO\.legs=null/);
  assert.match(reset, /b\.disabled=true/, "the three jobs must go back to sleep");
});

test("every market chip reaches a builder that knows the market", () => {
  /* Reported as "the new options don't work - no games to conjure". The
     Slider knew them through allowedMarkets and the wizard did not, so a chip
     the wizard drew was a control that turned on and did nothing. A chip must
     be answered by BOTH builders or it is a lie. */
  const cfg = src.slice(src.indexOf("var MKT_CFG"), src.indexOf("var html=MKT_CFG.filter"));
  const keys = [...cfg.matchAll(/\{k:"([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10, "only found " + keys.length + " chips");
  keys.forEach((k) => {
    assert.ok(src.includes("WSP.mk." + k), "the wizard ignores the " + k + " chip");
    if (k === "draw") return;                 /* wizard-only, and deliberately */
    assert.ok(src.includes("BUILD.mk." + k), "the slider ignores the " + k + " chip");
  });
});

test("a chip the other bookmaker owns offers the switch instead of nothing", () => {
  /* Bet9ja and BetKing sell the 1.5 rung; on a SportyBet slip those chips were
     dead and tapping one did nothing at all. The tap now raises a prompt that
     names the books and moves the builder to whichever one is chosen - it
     cannot choose for the reader any more, because there are two. */
  const click = src.slice(src.indexOf("c.addEventListener(\"click\",function(){"),
    src.indexOf("var k=c.dataset.m;"));
  assert.match(click, /only\.indexOf\(curBook\(\)\.key\)<0/);
  assert.match(click, /askBookOnly\(c\.dataset\.m,only\)/,
    "the tap must reach the prompt that can move the builder");
  assert.match(src, /if\(book&&book!==curBook\(\)\.key\) setBook\(book\)/,
    "the prompt must move the builder to the book that was picked");
  /* And it must still be tappable: a disabled button cannot say anything.
     NO CHIP IS DISABLED ANY MORE - the tier lock got the same treatment, so
     the rule is now "locked is a look, never an off switch". A disabled button
     fires no click, which is what made the dial-moving branch dead code on its
     first cut. */
  assert.doesNotMatch(src, /\?"disabled":""/, "a chip has been disabled again");
  assert.match(src, /class='mkt-chip/, "the chip markup moved; check this test still reads it");
});

test("the combinations sit at the tier their record earned", () => {
  /* All at tier 1 meant a reader on the default risk could switch a chip on
     and get nothing: the chip was allowed and the market was not. Run the
     function rather than read it - that is the only way to know what a tier
     actually returns. */
  const allowed = new Function(
    (src.match(/var CORNER_CODES=\[[^\]]*\];/) || [""])[0] +
    grab("allowedMarkets") + String.fromCharCode(10) +
    "return allowedMarkets;")();
  const safe = allowed(0);
  ["MIX_1_OV_1.5", "MIX_2_OV_1.5", "MIX_X_OV_1.5", "MIXGG_1", "MIXGG_2"].forEach((c) =>
    assert.ok(safe.includes(c), c + " lands more often than Over 1.5 and should be tier 0"));
  /* And the ones that do not: 60% is not a safe market. */
  /* Win a half has no tier: its average is 60% and its range is 53-80%, so a
     tier would judge it by the wrong number. minConf does it per leg. */
  assert.ok(safe.includes("WINHALF_H_Y"));
  assert.ok(safe.includes("WINHALF_A_Y"), "both sides, or the away favourite is lost");
  assert.ok(!safe.includes("MIXGG_X"), "draw or both score lands 64%");
  assert.ok(allowed(1).includes("WINHALF_H_Y"));
});

test("a target that cannot be hit is explained, in both directions", () => {
  /* Reported: "Result or over 1.5" at Balanced returns forty games at about
     x2,000 against a much smaller target. Nothing is broken - those legs pay
     about x1.2 each - but a reader who typed a number and got twenty times it
     is owed the reason. */
  const fn = src.slice(src.indexOf("var T=WSP.odds, per="), src.indexOf("// --- Mode toggle"));
  assert.match(fn, /We could not reach/, "no message when the target is out of reach");
  assert.match(fn, /You asked for/, "no message when it walks past the target");
  assert.match(fn, /r\.odds>T\*1\.5/, "the overshoot has no threshold");
  /* Both name the lever that fixes it rather than just stating the number. */
  assert.match(fn, /Switch on more markets, or ask for less/);
  assert.match(fn, /Fewer, riskier markets/);
  /* And it lands on the slip, not only in a toast that is gone in two seconds. */
  assert.match(fn, /className="byo-note wsp-miss"/);
});

test("an estimated price is marked as one", () => {
  /* A leg at 1.02 is SportyBet's own number for a near-certainty on a market
     the sweep fetches. A leg on a market it does not fetch shows oddOf(p) - our
     arithmetic - and 53-64% cannot look like 1.02 however it is derived. Both
     sat in the same column looking equally authoritative. */
  const fn = src.slice(src.indexOf("function oddCell("), src.indexOf("function mProb("));
  assert.match(fn, /estimatedOdd\(f,c\)/);
  assert.ok(fn.includes('~"+v.toFixed(2)'), "an estimate must be marked");
  assert.match(fn, /Our estimate/, "and say so when asked");
  /* Both slip rows must use it, or one of them still lies. */
  assert.ok(src.split("oddCell(").length - 1 >= 3, "a slip row still prints a bare odd");
});

test("an empty slip says which control to move", () => {
  /* "No games match. Adjust risk or markets" is true of every empty slip and
     useful for none. Reported on Win a half: on, nothing built at Safe or
     Balanced, no reason given - and the board was never the problem. */
  const fn = src.slice(src.indexOf("function emptyWhy()"), src.indexOf("function renderBuilder("));
  assert.ok(fn.includes("unlocks") && fn.includes("further right on the dial"),
    "a market above the dial must say so");
  assert.match(fn, /tops out at/, "a market under the floor must say so");
  assert.match(fn, /Slide right, or switch on a safer market/);
  /* Every chip must be mappable to its codes, or the sentence names nothing. */
  const table = src.slice(src.indexOf("var MKT_BY_CHIP="), src.indexOf("/* WHY THE SLIP IS EMPTY"));
  const cfg = src.slice(src.indexOf("var MKT_CFG"), src.indexOf("var html=MKT_CFG.filter"));
  [...cfg.matchAll(/\{k:"([a-z0-9]+)"/g)].map((m) => m[1]).forEach((k) =>
    assert.ok(table.includes(k + ":["), "MKT_BY_CHIP has no codes for the " + k + " chip"));
});

test("the ripple stays off controls that answer the tap themselves", () => {
  /* The ink is a circle scaled 2.6x inside overflow:hidden. On a short wide
     button it is clipped to the box and reads as a pale rectangle flashing
     behind what you pressed - reported as "a white boxy shadow when clicked"
     on the bottom bar. Those controls already answer: the bar moves its disc,
     the toggle swaps its ring. */
  const h = src.slice(src.indexOf("document.addEventListener('click',function(e){"),
    src.indexOf("document.addEventListener('click',function(e){") + 1400);
  assert.match(h, /el\.closest\('\.btabs,\.byo-book,\.byo-jobs'\)\) return;/,
    "the ripple is back on the navigation");
  /* And it must still fire everywhere else - the effect is not being deleted. */
  assert.match(h, /rip-ink/);
});

test("the builder's notes name the book the slip is going to", () => {
  /* Reported on the Bet9ja-only chips, which now switch the book for you:
     "Booking 24 selections to SportyBet" over a slip about to produce a Bet9ja
     code, and an odds footnote describing SportyBet's prices underneath it.
     Every other branch of that note already asked curBook(); these two were
     written out by hand. */
  assert.doesNotMatch(src, /" to SportyBet\."/,
    "the booking note names SportyBet whatever book is selected");
  assert.match(src, /" to "\+curBook\(\)\.label/);
  assert.match(src, /real "\+\s*curBook\(\)\.label\+" odds are usually lower/,
    "the estimate footnote still hardcodes a bookmaker");
});

test("a minted code is read back before anything quotes its odds", () => {
  /* Reported: "after games are taken out, the initial odds still remains...
     on the share card the initial odds show instead of the actual odds after
     the unavailable games have been taken out."
     Our booking route refuses a leg it cannot map; the BOOKMAKER is under no
     such obligation and can return a code carrying fewer selections than were
     sent. Everything downstream then describes the slip we asked for rather
     than the one the code holds - and the odds on the card become a number the
     reader cannot win. */
  assert.match(src, /function reconcileCode\(code,picks,B\)/,
    "nothing reads a minted code back");
  /* Matched on the book's own event id plus our market code: team names do not
     survive the round trip on either book. */
  assert.match(src, /held\[String\(l\.eventId\)\+"\|"\+String\(l\.prediction\)\]/);
  assert.match(src, /held\[String\(bookIdOf\(c,B\)\)\+"\|"\+String\(c\.code\)\]/);
  /* The three things that quote a total have to follow the answer. */
  const modal = src.slice(src.indexOf("function showCode("),
                          src.indexOf("function bookList("));
  assert.match(modal, /reconcileCode\(code,picks,B\)/);
  assert.match(modal, /rememberShortLink\(code,kept,B\)/,
    "the shared link still stores the legs we sent, not the ones booked");
  assert.match(modal, /shareCode\(code,_live,B\)/,
    "Share still sends the pre-drop slip");
  assert.match(modal, /wireSplit\(wrap,kept,B\)/, "the split box still deals the old slip");
  /* And it must never turn a good slip into a warning: no match at all means
     the shapes disagree, not that the code is empty. */
  assert.match(src, /return kept\.length\?kept:null;/);
});

test("a market the sweep never fetches is not refused for having no price", () => {
  /* Reported on Inter v Udinese: "when i pick any option that is not Inter to
     win, it says sportybet cant pick that game even when the markets are
     available on the sportybet website". Measured on the live board: that
     fixture carries 28 priced keys, and Win a half, Result or GG and the rest
     of the 14 Sep markets carry none - the sweep asks for 24 markets and these
     are not among them. bookTakes read "no price" as "not on this book".
     Third time for this exact mistake: the slider had it, the API's
     _unbookable had it, and the count on the picker had it. */
  const api = new Function(
    "const SAFE_UNPRICED={'1':1,'2':1,'X':1,'1X':1,'X2':1,'12':1};" +
    "function fixtureById(){return null;}" +
    "function curBook(){return {key:'sporty',full:true,odds:'sportyOdds'};}" +
    "function bookIdOf(c){return (c&&c.f&&c.f.eventId)||null;}" +
    grab("fetchedMarket") + grab("bookVerdict") + grab("bookMayTake") +
    grab("bookIsPriced") + grab("bookTakes") + "\nreturn {bookTakes};")();
  const B = { key: "sporty", full: true, odds: "sportyOdds" };
  /* The real shape: a fixture SportyBet lists, priced on the swept markets. */
  const f = { eventId: "sr:match:71945252",
              sportyOdds: { "1": 1.25, "1X": 1.08, "OVER_1.5": 1.18, "GG": 1.75 } };
  assert.equal(api.bookTakes({ f, code: "1" }, B), true);
  assert.equal(api.bookTakes({ f, code: "OVER_1.5" }, B), true);
  /* These are the ones that were being refused. */
  for (const code of ["WINHALF_H_Y", "WINHALF_A_Y", "MIXGG_1", "MIXGG_X",
                      "MIX_1_OV_2.5", "MIX_X_OV_2.5"]) {
    assert.equal(api.bookTakes({ f, code }, B), true, code + " is still refused");
  }
  /* And a SWEPT market with no price is still refused - that check is the
     reason this function exists. */
  assert.equal(api.bookTakes({ f, code: "OVER_3.5" }, B), false,
    "a market the sweep does fetch must still be judged by its price");
  /* No game at this book is still no. */
  assert.equal(api.bookTakes({ f: { sportyOdds: {} }, code: "WINHALF_H_Y" }, B), false);
});

test("a leg the bookmaker says is in play is not called a game we don't carry", () => {
  /* HCVKA1, from a reader: "we carry some games but the converter says we
     dont". Five of its thirty-one legs were games that had KICKED OFF - the
     board drops a fixture at the whistle and the cache went with it. The read
     asks SportyBet for those events now, which answers for a match in play and
     carries its status. */
  const api = new Function(grab("legStarted") + "\nreturn legStarted;")();
  const future = new Date(Date.now() + 3600e3).toISOString();
  /* The bookmaker's word beats our clock. */
  assert.equal(api({ kickoff: future, status: "H1" }), true, "in play is started");
  assert.equal(api({ kickoff: future, status: "HT" }), true, "half time is started");
  assert.equal(api({ kickoff: future, status: "ENDED" }), true, "ended is started");
  assert.equal(api({ kickoff: future, status: "NOT_STARTED" }), false,
    "a game they say has not started must not be greyed out");
  /* And with no status at all, the clock still answers as it always did. */
  assert.equal(api({ kickoff: future }), false);
  assert.equal(api({ kickoff: new Date(Date.now() - 60e3).toISOString() }), true);
});
