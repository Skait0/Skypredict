/* BetKing, the third book.
 *
 * Two books could be wired with string comparisons - `B.key === "bet9ja"` -
 * and a third one turns every one of those into a place it is silently left
 * out. So most of what is asserted here is that the page reads the TABLE
 * rather than the names: a fourth book should be one row in BOOKS and nothing
 * else, and these fail if that stops being true.
 *
 * The other half is the thing BetKing does not have. There is no deep link for
 * a booking code - their bundle reads no such parameter anywhere - so every
 * surface that draws "Open in X" has to cope with a book that cannot be
 * opened. That is not a gap waiting to be filled; it is a property of the book,
 * and it is pinned here so nobody "fixes" it by appending the code to their
 * home page, which looks like a link and drops the slip.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { src, fn, decl, prelude } = require("./books.js");

/* From a point inside a function body out to the brace that closes it. */
function block(text, from) {
  let depth = 0;
  for (let k = from; k < text.length; k++) {
    const c = text[k];
    if (c === "{") depth++;
    else if (c === "}") { if (!depth) return text.slice(from, k); depth--; }
  }
  return text.slice(from);
}

function books() {
  return new Function(prelude("sporty") + "\nreturn BOOKS;")();
}

test("the four books are all there, and each one is complete", () => {
  const B = books();
  assert.deepStrictEqual(Object.keys(B).sort(),
    ["bet9ja", "betking", "betpawa", "sporty"]);
  /* Every field a call site reads off the table. A book missing one of these
     does not throw - it takes `undefined` and books nothing, or books it
     against the wrong route, which is worse. */
  for (const k of Object.keys(B)) {
    for (const f of ["key", "label", "id", "odds", "arg", "skin",
                     "mark", "book", "sel", "codeOf", "priced"]) {
      assert.ok(B[k][f] !== undefined, k + " has no " + f);
    }
    assert.strictEqual(B[k].key, k, k + " disagrees with its own key");
    assert.ok(["code", "prediction"].includes(B[k].arg),
      k + ": arg must name what the upstream route calls the market");
  }
});

test("each book books against its own route", () => {
  /* Read from the page, not from the harness: prelude() substitutes stub URLs
     for the real constants, so asserting on those would prove only that the
     stubs differ. A book pointed at another book's route mints the wrong code
     entirely and nothing about the response says so. */
  const urls = {};
  for (const m of src.matchAll(/const (B9_BOOK_URL|BK_BOOK_URL)="([^"]+)"/g)) {
    urls[m[1]] = m[2];
  }
  assert.match(urls.BK_BOOK_URL || "", /book=betking/);
  assert.match(urls.B9_BOOK_URL || "", /book=bet9ja/);
  assert.notStrictEqual(urls.BK_BOOK_URL, urls.B9_BOOK_URL);
});

test("BetKing has no deep link, and that is the finding", () => {
  const B = books();
  /* Their desktop bundle reads exactly one code from the URL - `couponCode`,
     for a coupon already placed - and nothing loads a BOOKED code from a query
     string. SportyBet has ?shareCode= and Bet9ja ?bookABetCode=. */
  assert.strictEqual(B.betking.open, null);
  assert.match(String(B.sporty.open), /^\/|^https:/);
  assert.match(String(B.bet9ja.open), /^\/|^https:/);
  /* And in the PAGE, not only in the harness. prelude() stubs BK_URL, so the
     three lines above pass whatever the page says - which is how this test
     spent its first run proving nothing. Caught by mutation: pointing BK_URL
     at their home page changed nothing here. */
  assert.match(src, /const BK_URL=null;/,
    "a URL here is a link that looks like it works and drops the slip");
});

test("a book that cannot be opened is offered a sentence, not a dead link", () => {
  /* Both places that draw "Open in X" - the code card and the splitter's list
     of tickets. Asserted on the source because both build HTML strings inside
     functions that need a DOM to run, and the failure being guarded against is
     exactly that somebody adds the anchor back unconditionally. */
  const open = src.match(/B\.open\s*\+\s*encodeURIComponent/g) || [];
  assert.ok(open.length >= 1, "the open links have gone entirely");
  for (const m of open) {
    /* Every use sits inside a `B.open ? ... : ...`, so the anchor is never
       built for a book whose open is null. */
    const at = src.indexOf(m);
    const before = src.slice(Math.max(0, at - 260), at);
    assert.match(before, /B\.open\s*\n?\s*\?/,
      "an unguarded B.open builds https://undefinedCODE for BetKing");
  }
  assert.match(src, /code-paste/,
    "the card needs something to say when there is no link to give");
});

test("the book picker is derived from the table, not listed again", () => {
  const paint = fn("paintBookPickerWith");
  assert.ok(!/\["sporty","bet9ja"\]/.test(paint),
    "a literal list is a place a new book gets left out");
  assert.match(paint, /Object\.keys\(BOOKS\)/);
});

test("the selection each book is sent carries the field that book's route reads", () => {
  /* SportyBet's route takes `prediction`; both others take `code`. Sending the
     wrong one is not an error upstream - the field is simply absent and every
     leg reads as unmapped. */
  const harness = new Function(
    prelude("sporty") + "\n" +
    "var BYO={book:'sporty'};\n" + fn("byoSel") + "\n" +
    "return function(book,leg){ BYO.book=book; return byoSel(leg); };")();
  const leg = { eventId: "77", prediction: "OVER_1.5" };
  assert.deepStrictEqual(harness("sporty", leg),
    { eventId: "77", prediction: "OVER_1.5" });
  assert.deepStrictEqual(harness("bet9ja", leg),
    { eventId: "77", code: "OVER_1.5" });
  assert.deepStrictEqual(harness("betking", leg),
    { eventId: "77", code: "OVER_1.5" });
});

test("a book whose codes we cannot read is not asked to reconcile one", () => {
  /* /api/slip refuses an unknown bookmaker with a 400, which reconcileCode
     would have handled silently - one wasted round trip per booking for an
     answer known before it was asked. BetKing was false here until its read
     path shipped; the guard is the point, not which books it currently
     spares. */
  const B = books();
  for (const k of Object.keys(B)) {
    assert.strictEqual(typeof B[k].readable, "boolean", k + " must declare it");
  }
  assert.strictEqual(B.sporty.readable, true);
  assert.strictEqual(B.bet9ja.readable, true);
  assert.strictEqual(B.betking.readable, true);
  assert.match(fn("reconcileCode"), /if\(!B\.readable\)/);
});

test("the unbookable sentence is chosen by what the feed holds, not by name", () => {
  /* A book whose feed is not the whole book is judged on whether it carries
     the GAME. Named rather than derived, BetKing inherited SportyBet's
     sentence and told people a market was not offered when nobody had
     looked. */
  const f = fn("confirmDropUnpriced");
  assert.match(f, /byEvent\s*=\s*!B\.full/);
  assert.ok(!/byEvent\s*=\s*\(B\.key\s*===\s*"bet9ja"\)/.test(f));
});

test("the code card takes its skin from the table", () => {
  const B = books();
  assert.deepStrictEqual(Object.keys(B).map((k) => B[k].skin).sort(),
    ["b9", "bk", "bw", "sb"]);
  assert.match(src, /code-card--"\+\s*\n?\s*\(B\.skin\|\|"sb"\)/,
    "a named skin leaves a new book wearing SportyBet's card");
  /* And each skin has somewhere to land. A skin with no CSS is a card that
     silently falls back to the default one. */
  for (const skin of ["sb", "b9", "bk", "bw"]) {
    assert.ok(src.includes(".code-card--" + skin),
      skin + " has no styles, so its card is not its own");
  }
});

test("BetKing's mark is their colour, and it survives both themes", () => {
  /* Sampled from their own brand-logo.svg: the crown is #ffc400. On white
     that gold is about 1.8:1, which is a decoration rather than a word, so
     the light theme takes the same hue down to where it can be read. */
  assert.match(src, /--bk-gold:#FFC400/);
  assert.match(src, /\[data-theme="light"\]\{--bk-gold:/,
    "gold on white is unreadable; the light theme needs its own value");
  assert.match(src, /\.bkm \.bkg\{color:var\(--bk-gold\)\}/);
  /* On their own dark card the override must not follow the mark - that card
     is dark whatever the theme says. */
  assert.match(src, /\.code-card--bk \.bkm \.bkg\{color:#FFC400\}/);
});

test("the wordmark asks for no webfont", () => {
  /* A third-party stylesheet on the critical path held the first paint once
     already. BetKing set their name in Roboto Condensed; we ask for it and
     fall through to whatever condensed face the device ships. */
  const mark = src.slice(src.indexOf(".bkm{"), src.indexOf(".bkm{") + 400);
  assert.match(mark, /font-family:"Roboto Condensed"/);
  assert.match(mark, /Arial Narrow/, "a fallback, since most phones lack it");
  const links = src.match(/<link[^>]+fonts\.googleapis[^>]*>/g) || [];
  for (const l of links) {
    assert.ok(!/Roboto/.test(l), "a second webfont link for one wordmark");
  }
});

test("the header cycle names every book the site can produce a code for", () => {
  /* The glitch line is the first thing the page says about bookmakers. A book
     we book for and do not name there is one nobody knows they can use. */
  const cycle = src.slice(src.indexOf('id="bkCycle"'),
                          src.indexOf('id="bkCycle"') + 700);
  for (const bk of ["sporty", "b9", "bk"]) {
    assert.ok(cycle.includes('data-bk="' + bk + '"'), bk + " is not in the cycle");
  }
  assert.match(cycle, /aria-label="[^"]*BetKing/,
    "the label is what a screen reader gets instead of the animation");
});

test("the marks in the cycle are the same marks as everywhere else", () => {
  /* Two spellings of one brand is how a logo drifts. The cycle uses the same
     inner spans the wordmark does. */
  const cycle = src.slice(src.indexOf('id="bkCycle"'),
                          src.indexOf('id="bkCycle"') + 700);
  assert.ok(cycle.includes('<span class="bkk">Bet</span>'));
  assert.ok(cycle.includes('<span class="bkg">King</span>'));
  assert.match(decl("BOOKS").length ? src : src, /class='bkm'/);
});

/* ------------------------------------------- the converter, three ways now */

test("there is no 'the other book' any more", () => {
  /* otherBook(B) answered the only question two books can ask. A third makes
     the target a choice, and a binary helper left behind is a place BetKing
     can never be either a source or a destination. */
  assert.ok(!/function otherBook\b/.test(src), "the binary helper is still here");
  assert.match(src, /function otherBooks\(/);
  assert.match(src, /function convTarget\(/);
});

test("every book can convert to every other one", () => {
  const api = new Function(
    prelude("sporty") + "\n" +
    "var BYO={book:'sporty',to:null};\n" +
    fn("byoBook") + fn("otherBooks") + fn("convTarget") + "\n" +
    "return {otherBooks,convTarget,BYO,BOOKS};")();
  const keys = Object.keys(api.BOOKS);
  for (const from of keys) {
    api.BYO.book = from;
    const alt = api.otherBooks(api.BOOKS[from]).map((b) => b.key);
    assert.strictEqual(alt.length, keys.length - 1, from + " has no targets");
    assert.ok(!alt.includes(from), from + " offers itself as a target");
    for (const to of alt) {
      api.BYO.to = to;
      assert.strictEqual(api.convTarget().key, to, from + " -> " + to);
    }
  }
});

test("a target that has become the source is ignored, not obeyed", () => {
  /* Switch the source to the book you were converting TO and the stored
     choice now names the source. Converting a slip to the book it came from
     is not a conversion. */
  const api = new Function(
    prelude("sporty") + "\n" +
    "var BYO={book:'sporty',to:null};\n" +
    fn("byoBook") + fn("otherBooks") + fn("convTarget") + "\n" +
    "return {convTarget,BYO};")();
  api.BYO.book = "betking";
  api.BYO.to = "betking";
  assert.notStrictEqual(api.convTarget().key, "betking");
});

test("the default target is the table's order, not an accident", () => {
  const api = new Function(
    prelude("sporty") + "\n" +
    "var BYO={book:'bet9ja',to:null};\n" +
    fn("byoBook") + fn("otherBooks") + fn("convTarget") + "\n" +
    "return {convTarget};")();
  assert.strictEqual(api.convTarget().key, "sporty",
    "sporty is first in BOOKS, so it is the default target for bet9ja");
});

test("?to= names the target and stops guessing the source", () => {
  /* With two books "they want a Bet9ja code" implied "from SportyBet". With
     three it implies nothing, and a guess would open the converter on the
     wrong source with somebody's code already in the box. */
  const link = src.slice(src.indexOf('q.get("to")'), src.indexOf('q.get("to")') + 900);
  assert.match(link, /if\(BOOKS\[to\]\) BYO\.to=to;/,
    "?to= must set the target");
});

test("the source row and the target row cannot light each other up", () => {
  /* Both rows are .byo-b on purpose - same control, same meaning - which makes
     a bare .byo-b selector light a pill in the other row. */
  /* Brace-matched, not src.slice(i, i + 600). A fixed window made this fail
     the first time a comment inside the handler grew - a test failing for a
     reason unrelated to the behaviour it guards is worse than no test. */
  const handler = block(src, src.indexOf('BYO.book=b.dataset.book;'));
  assert.ok(!/sec\.querySelectorAll\("\.byo-b"\)/.test(handler),
    "the source handler still selects every .byo-b on the page");
  assert.match(handler, /BYO\.to=null;/,
    "switching source must clear a target that may now BE the source");
});

test("switching the target repaints the numbers, not just the pills", () => {
  /* Every figure in that panel is about the target: which legs cross, what
     they cost, which lines had to change. Repainting the pills alone leaves
     the count describing the book it used to point at. */
  /* Brace-matched to the listener body. A 420-char window passed even with
     renderConvert() deleted, because the NEXT listener calls it too - the
     mutation was caught by nothing and the test read green. */
  const at = src.indexOf('b.addEventListener("click",function(){',
                         src.indexOf("data-conv-to]"));
  const wire = block(src, at);
  assert.match(wire, /BYO\.to=b\.dataset\.convTo/);
  assert.match(wire, /renderConvert\(\)/,
    "switching target must rebuild the panel, not just the pills");
});

test("each book's target pill wears its own brand", () => {
  for (const [k, v] of [["sporty", "--red"], ["bet9ja", "--b9-green"],
                        ["betking", "--bk-gold"]]) {
    assert.ok(src.includes('.byo-b.on[data-conv-to="' + k + '"]'),
      k + " has no target-pill ring");
    assert.match(src.slice(src.indexOf('.byo-b.on[data-conv-to="' + k + '"]'),
      src.indexOf('.byo-b.on[data-conv-to="' + k + '"]') + 140), new RegExp(v));
  }
});

/* ------------------------------------------------- one book, four allowlists */

test("every book in the table is reachable through every proxy that serves it", () => {
  /* THE BOOK EXISTS IN FOUR PLACES AND EACH ONE CAN FORGET IT.
     BetKing shipped able to read a code on Railway and was refused at our own
     edge with "unknown bookmaker" - a book we plainly know - because
     api/slip.js keeps its own list and only the booking and feed proxies had
     been updated. Nothing failed; the converter just could not use it as a
     source. */
  const B = books();
  const keys = Object.keys(B);
  const proxy = require("../lib/bookproxy.js");
  const slip = fs.readFileSync(path.join(__dirname, "..", "api", "slip.js"), "utf8");
  const up = fs.readFileSync(path.join(__dirname, "..", "lib", "upstream.js"), "utf8");
  const list = /const BOOKS = \[([^\]]*)\]/.exec(slip);
  assert.ok(list, "api/slip.js no longer declares its books");
  const readable = list[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));

  for (const k of keys) {
    assert.ok(proxy.BOOKS[k], k + " cannot be booked: no route in lib/bookproxy.js");
    if (B[k].readable) {
      assert.ok(readable.includes(k),
        k + " is readable but api/slip.js refuses it as an unknown bookmaker");
    }
    /* Its feed has to be proxied too, or the board never learns its event ids
       and every leg reads as a game it does not carry. */
    if (k !== "sporty") {
      assert.ok(new RegExp("(^|\\s)" + k + ":\\s*\\{", "m").test(up),
        k + " has no feed entry in lib/upstream.js");
      assert.ok(fs.existsSync(path.join(__dirname, "..", "api", k + ".js")),
        "api/" + k + ".js is missing, so its feed has no edge route");
    }
  }
});

/* ------------------------------------------------------------- the canary */

/* The canary's own BOOKS table, PARSED rather than grepped. Commenting a book
   out left its text in the file, so a regex over the source still found it and
   the "every book is covered" test passed with BetKing switched off. Caught by
   mutation; a structural read cannot be fooled that way. */
function canarySrc() {
  return fs.readFileSync(path.join(__dirname, "..", "scripts", "canary.js"), "utf8");
}
function canaryBooks() {
  const s = canarySrc();
  const at = s.indexOf("const BOOKS = {");
  assert.ok(at > 0, "the canary no longer declares a BOOKS table");
  const open = s.indexOf("{", at);
  return new Function("return " + s.slice(open, open + block(s, open).length + 1))();
}

test("the canary reads each book's code out of the field that book uses", () => {
  /* The three do not agree - SportyBet answers booking_code where the other
     two answer code - and the first draft of the canary guessed. It read
     `code` off a SportyBet reply that had booked perfectly well and reported
     the book as down. A canary that is wrong about success gets switched off,
     which costs more than never having written it. */
  const C = canaryBooks();
  for (const k of Object.keys(books())) {
    assert.ok(C[k], k + " is missing from the canary");
    /* The page is the authority: whatever BOOKS[k].codeOf reads is what the
       canary must read. Found by string search rather than a regex - every
       escape in this file has been through a shell heredoc at least once, and
       a collapsed backslash turns a guard into a test that matches nothing. */
    const at = src.indexOf("BOOKS." + k + ".codeOf");
    assert.ok(at > 0, k + " has no codeOf in index.html");
    const line = src.slice(at, src.indexOf(";", at));
    const field = line.slice(line.lastIndexOf("d&&d.") + 5).trim();
    assert.ok(field, k + ": could not read which field codeOf returns");
    assert.strictEqual(C[k].field, field,
      k + ": the canary reads " + C[k].field + " where the page reads " + field);
  }
});

test("the canary covers every book the site can book with", () => {
  const C = canaryBooks();
  for (const k of Object.keys(books())) {
    assert.ok(C[k], k + " can be booked but is never checked");
  }
});

test("the canary sends each book the argument its route reads", () => {
  /* Same table, same trap as byoSel: SportyBet's route takes `prediction` and
     the other two take `code`, and sending the wrong one is not an error
     upstream - the field is simply absent and every leg reads as unmapped. */
  const C = canaryBooks(), B = books();
  for (const k of Object.keys(B)) {
    assert.strictEqual(C[k].arg, B[k].arg,
      k + ": canary sends " + C[k].arg + ", the table says " + B[k].arg);
  }
});

test("the canary compares what came back to what it sent", () => {
  /* THE CHECK THE WHOLE THING EXISTS FOR. A booking code that resolves to
     nothing is what a wrong selection id looks like, and it is
     indistinguishable from success at every other layer - the POST returns a
     code, the read returns 200. Only the count differs.
     Asserted on the source because the script is a top-level IIFE that books
     against production the moment it is required; the alternative is a canary
     for the canary. */
  const c = canarySrc();
  assert.match(c, /read\.length\s*!==\s*sels\.length/,
    "the leg-count comparison has gone, and with it the only check that "
    + "notices an empty code");
  assert.match(c, /l\.prediction\s*!==\s*MARKET/,
    "the market check has gone: a code with the right number of wrong legs "
    + "would pass");
});

test("the canary fails loudly rather than logging", () => {
  /* A canary nobody is told about is a log line. The workflow goes red only
     because this exits non-zero. */
  assert.match(canarySrc(), /process\.exit\(1\)/);
});

/* ------------------------------------------- a code that has thinned out */

test("a shortened code says what it lost, when the book will say", () => {
  /* A leg leaves the coupon the moment its fixture kicks off, so an afternoon
     read is shorter than the slip somebody was handed that morning - four legs
     to one in four hours on a real BetKing code. Showing the remainder with
     only a hedge underneath reads as "your code had one game in it", which is
     a different and worse claim than "three have started". */
  const render = src.slice(src.indexOf("byo-gone"));
  assert.match(src, /BYO\.booked&&BYO\.booked>legs\.length/,
    "the line must be drawn from what the book reported, not from a guess");
  assert.match(render, /already kicked off/);
  /* Only when the book actually reports it. BetKing does; the other two thin
     out just as quietly and say nothing, and writing the sentence for them
     would be guessing at somebody's slip. */
  assert.match(src, /BYO\.booked=res\.d\.booked\|\|null/);
  assert.match(src, /BYO\.dropped=res\.d\.removed\|\|null/);
});

test("the thinned-out state is cleared with the code", () => {
  /* Left behind, it describes the PREVIOUS code - the worst kind of stale,
     because it is a specific and plausible claim about the wrong slip. */
  const reset = fn("byoReset");
  assert.match(reset, /BYO\.booked=null/);
  assert.match(reset, /BYO\.dropped=null/);
});

test("the names are escaped and capped", () => {
  /* Team names come from the bookmaker, and the list can be long. */
  const at = src.indexOf("BYO.dropped&&BYO.dropped.length");
  const chunk = src.slice(at, at + 400);
  assert.match(chunk, /\.map\(esc\)/, "a bookmaker's string goes through esc");
  assert.match(chunk, /slice\(0,\s*4\)/, "and the list is capped");
});

/* ------------------------------ a whole line that has to become a half one */

function lineApi() {
  const decl = /var NEAREST_LINE=\{[\s\S]*?\};/.exec(src)[0];
  return new Function(decl + fn("ahReline") + fn("nearestLine") +
    "return {nearestLine};")();
}

test("a whole line moves the way that never hurts the punter", () => {
  /* Over 3.0 pays on four and PUSHES on exactly three; Over 2.5 pays on three.
     So the neighbour is not "the next one along", it is the one that is never
     worse - down for an over, UP for an under. Backwards, a stake-back becomes
     a loss on the one scoreline the whole substitution is about, and the slip
     looks identical either way. */
  const { nearestLine } = lineApi();
  assert.strictEqual(nearestLine("OVER_3"), "OVER_2.5");
  assert.strictEqual(nearestLine("OVER_2"), "OVER_1.5");
  assert.strictEqual(nearestLine("UNDER_3"), "UNDER_3.5");
  assert.strictEqual(nearestLine("UNDER_2"), "UNDER_2.5");
});

test("a whole-ball handicap moves half a goal in the punter's favour", () => {
  /* Same rule, arithmetic instead of a table - 64 Asian codes would be 64
     chances to fumble a sign. -1 becomes -0.5, so a one-goal win stops being a
     push and becomes a win; +1 becomes +1.5.
     AND THE SIGN IS NOT THE SAME ON BOTH SIDES, which this test used to assert
     it was. The line is quoted from the HOME team's point of view on every
     book - SportyBet in the specifier, BetKing flipping it itself for outcome
     1715 above, mLabel inverting it for the reader - so AH_2_-1 is the away
     side RECEIVING one. Moving it to AH_2_-0.5 hands that backer +0.5 instead
     of +1: a worse bet, made silently, under a rule that promises never worse.
     The away side moves DOWN the home-quoted number. */
  const { nearestLine } = lineApi();
  assert.strictEqual(nearestLine("AH_1_-1"), "AH_1_-0.5");
  assert.strictEqual(nearestLine("AH_1_1"), "AH_1_1.5");
  assert.strictEqual(nearestLine("AH_1_0"), "AH_1_0.5");
  assert.strictEqual(nearestLine("AH_1_-2"), "AH_1_-1.5");
  assert.strictEqual(nearestLine("AH_2_-1"), "AH_2_-1.5", "away +1 must not become away +0.5");
  assert.strictEqual(nearestLine("AH_2_1"), "AH_2_0.5", "away -1 becomes away -0.5");
  assert.strictEqual(nearestLine("AH_2_0"), "AH_2_-0.5");
});

test("a line with nothing to fix is left alone", () => {
  /* A quarter ball does not push, so it has nothing to fix and its neighbour
     is a quarter of a goal away rather than a half. A half line is already
     where we would move it to. */
  const { nearestLine } = lineApi();
  for (const c of ["AH_1_-0.25", "AH_1_-0.75", "AH_1_-0.5", "OVER_2.5",
                   "UNDER_3.5", "GG", "1X"]) {
    assert.ok(!nearestLine(c), c + " was relined and should not have been");
  }
});

test("the substitution is chosen by the book's catalogue, not its name", () => {
  /* This was to.key === "bet9ja", true of exactly the book it was written for.
     BetKing does not sell a whole line either and got none of it, so nine legs
     of a real 39-leg ticket stuck for want of a rule that already existed. */
  const B = books();
  assert.strictEqual(B.sporty.wholeLines, true);
  assert.strictEqual(B.bet9ja.wholeLines, false);
  assert.strictEqual(B.betking.wholeLines, false);
  const conv = fn("byoConversion");
  assert.match(conv, /near\s*&&\s*!to\.wholeLines/);
  /* COMMENTS STRIPPED FIRST. This matched the explanation sitting directly
     above the line it was guarding - my own comment quotes the old
     `to.key==="bet9ja"` to say what changed - so the test failed while the
     code was right. Same trap as asserting against a comment that contains the
     phrase you are searching for. */
  const code = conv.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/to\.key\s*===\s*"bet9ja"/.test(code),
    "the whole-line rule is named again, so a third book gets none of it");
  /* to.key === "sporty" survives on the mixReline branch and belongs there:
     that offer exists because SportyBet alone sells 1x2-or-total at 2.5, which
     is a fact about one book rather than a property others might share. It is
     the reason this assertion names the branch instead of banning the shape. */
});

test("a changed leg is named, with what changed about it", () => {
  /* It is a real change to somebody's bet at a real change in price, so it is
     counted and shown rather than done quietly. */
  assert.match(src, /legs were.{0,20}changed to a line/);
  assert.match(src, /a whole line returns the stake on the exact score/);
});

/* ---------------------------------------------------- the same bet twice */

test("an identical leg sent twice is collapsed before it reaches a book", () => {
  /* Two board fixtures paired to ONE SportyBet event on 21 Sep - "Ind.
     Rivadavia" and "Independiente" against the same Barracas fixture - so the
     day's own code SPXK1M went out with five legs and four games. SportyBet
     and Bet9ja took it silently; BetKing and Betpawa refuse a same-game
     multiple, so a conversion died with "one selection per game" on a slip
     whose games all looked different to the reader. */
  const dedupe = new Function(fn("dedupeSelections") + "\nreturn dedupeSelections;")();
  const legs = [
    { eventId: "sr:match:1", prediction: "1X" },
    { eventId: "sr:match:2", prediction: "1X" },
    { eventId: "sr:match:1", prediction: "1X" },
  ];
  assert.deepStrictEqual(dedupe(legs).map((l) => l.eventId),
    ["sr:match:1", "sr:match:2"]);
  /* The other books' shape, which names the market `code` rather than
     `prediction` - both have to be read or the dedupe silently does nothing
     on three of the four books. */
  assert.strictEqual(dedupe([{ eventId: "9", code: "GG" },
                             { eventId: "9", code: "GG" }]).length, 1);
  /* AND A REAL SAME-GAME PAIR IS LEFT ALONE. Two markets on one fixture is a
     bet some books take and the route names it on the ones that do not -
     collapsing it here would silently shorten a slip somebody meant. */
  assert.strictEqual(dedupe([{ eventId: "9", code: "GG" },
                             { eventId: "9", code: "OVER_2.5" }]).length, 2);
  /* And it is wired into the one call every surface funnels through. */
  assert.match(fn("bookFetch"), /sel\s*=\s*dedupeSelections\(sel\)/);
});

test("refusing one of two identical legs leaves the other", () => {
  /* The server names a leg by event and market, and two identical legs share
     both - so a set-membership test killed the duplicate AND the leg it
     duplicated, leaving nothing to retry and the reader a flat refusal. */
  const harness = new Function(
    prelude("betpawa") +
    "function fixtureById(){ return null; }\n" +
    fn("dropUnbookable") + "\nreturn dropUnbookable;")();
  const picks = [
    { id: "a", code: "1X", f: { bpEventId: "11" } },
    { id: "b", code: "1X", f: { bpEventId: "11" } },
    { id: "c", code: "1X", f: { bpEventId: "22" } },
  ];
  const kept = harness(picks,
    { unbookable: [{ eventId: "11", prediction: "1X", reason: "same_game" }] },
    { key: "betpawa", id: "bpEventId", odds: "bpOdds" });
  assert.strictEqual(kept.length, 2, "one refusal must not drop both copies");
  /* WHICH copy survives is immaterial - the two are the same bet on the same
     event - so this asserts the count and the untouched leg, not an order. */
  assert.ok(kept.includes(picks[2]), "the innocent leg was dropped");
  assert.strictEqual(kept.filter((p) => p.f.bpEventId === "11").length, 1);
});

test("every 'build me a slip' promise names the reader's own book", () => {
  /* The offer card was fixed when BetKing arrived; the sticky bar under it was
     not, because it is markup at the end of the document rather than part of
     the card. Caught on the live site with betPawa selected: the card said
     betPawa and the bar below it said SportyBet. */
  const paint = fn("paintBookPickers");
  for (const id of ["sc-go-primary", "sbHead"]) {
    assert.ok(paint.includes(id), id + " is not repainted when the book changes");
  }
  assert.match(paint, /sbHead[\s\S]{0,120}curBook\(\)\.mark/);
});
