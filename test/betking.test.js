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

test("the three books are all there, and each one is complete", () => {
  const B = books();
  assert.deepStrictEqual(Object.keys(B).sort(), ["bet9ja", "betking", "sporty"]);
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
    ["b9", "bk", "sb"]);
  assert.match(src, /code-card--"\+\s*\n?\s*\(B\.skin\|\|"sb"\)/,
    "a named skin leaves a new book wearing SportyBet's card");
  /* And each skin has somewhere to land. A skin with no CSS is a card that
     silently falls back to the default one. */
  for (const skin of ["sb", "b9", "bk"]) {
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
