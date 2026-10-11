"use strict";
/* THE OWNER'S LIST OF 28 SEP 2026, ONE TEST PER COMPLAINT.
 *
 * "when sportybet cant take games, i hate to have to scroll all the way down
 *  to see the message, MAKE IT A POP UP MODAL and dont forget about offering
 *  the next safe markets. apply this to all the available bookies."
 * "the get code button disappears till i have to toggle between the available
 *  bookies and back"
 * "i put a long ticket of 14, said it can use 13 but when it gave me the code
 *  back after editting it gave me five games"
 * "after the ticket has been booked, the total booked accepted odds should show"
 * "when i click make safer and it says sportybet cant take.. that particular
 *  message disfigures the modal and the pill is too big"
 */
const test = require("node:test");
const assert = require("node:assert");
const { src, fn, decl } = require("./books.js");

function body(name) { return fn(name); }

test("booking questions are asked in the pop-up, the build's own two stay in the panel", () => {
  const els = {};
  const $ = (id) => (els[id] = els[id] || { id, innerHTML: "", hidden: true,
    querySelector() { return null; } });
  const api = new Function("$",
    decl("INLINE_ASK") + "\n" + decl("ASK_FOR") + "\n" + fn("askHost") + "\n" +
    fn("promptEl") + "\n" + decl("SCROLL_HELD") + "\n" + fn("scrollLock") + "\n" + fn("askLock") + "\n" +
    fn("showPrompt") + "\n" + fn("clearPrompt") +
    "\nreturn {showPrompt:showPrompt, clearPrompt:clearPrompt, promptEl:promptEl};")($);
  for (const t of ["bookResult", "myBookResult", "byoConvOut", "codeSaferHost"]) {
    assert.ok(api.showPrompt(t, "<div class='confirm-card'>ask</div>"), t);
    assert.strictEqual(els.askBody.innerHTML, "<div class='confirm-card'>ask</div>", t + " goes to the pop-up");
    assert.strictEqual(els.askModal.hidden, false, t + " opens it");
    assert.strictEqual(api.promptEl(t), els.askBody, t + " is found again in the pop-up");
    assert.notStrictEqual((els[t] || {}).innerHTML, "<div class='confirm-card'>ask</div>",
      t + " is not written under the slip any more");
    api.clearPrompt(t);
    assert.strictEqual(els.askModal.hidden, true, t + " closes it");
  }
  for (const t of ["payAsk", "mkAsk"]) {
    api.showPrompt(t, "inline");
    assert.strictEqual(els[t].innerHTML, "inline", t + " stays beside its chips");
  }
});

test("nothing can hide Get code any more", () => {
  /* The class that hid it outlived its card whenever a result box was emptied
     directly - seventeen places do that. It is gone rather than patched. */
  assert.doesNotMatch(src, /\.prompting\s*\.book-btn/, "the rule that hid Get code");
  assert.doesNotMatch(src, /classList\.add\("prompting"\)/, "and anything that set it");
});

test("a refused leg is offered the safest priced bet on the same game", () => {
  const f = { id: "f1", sportyOdds: { "1": 2.1, "1X": 1.3, "OVER_1.5": 1.25, "OVER_2.5": 1.9 } };
  let now = 0, why = {};
  const opts = [
    { code: "1", label: "Home win", p: 0.55 },
    { code: "1X", label: "Home or draw", p: 0.78 },
    { code: "OVER_1.5", label: "Over 1.5", p: 0.82 },
    { code: "OVER_2.5", label: "Over 2.5", p: 0.61 },
    { code: "GG", label: "Both score", p: 0.9 },          // we rate it, they do not price it
  ];
  const next = new Function("F", "OPTS", "NOW", "WHY",
    "var REFUSAL_WHY=WHY();function curBook(){return {odds:'sportyOdds'};}" +
    "function fixtureById(){return F;} function kickMs(){return NOW();}" +
    "function swapOptions(){return OPTS;} function bookAllows(){return true;} function refusedToday(){return {};}" +
    "var MYSLIP=[{id:'f1',code:'1',auto:true}];function chipOn(c){return c!=='OVER_1.5';}" +
    decl("SAFE_ALT_MIN") + "\n" + fn("builtLeg") + "\n" + fn("safePicks") + "\n" + fn("nextSafePick") + "\nreturn nextSafePick;")(
    f, opts, () => now, () => why);
  const B = { odds: "sportyOdds" };
  const realNow = Date.now;
  now = realNow() + 3600e3;
  const a = next({ id: "f1", code: "OVER_2.5", p: 0.61 }, B);
  assert.strictEqual(a.code, "OVER_1.5", "the likeliest market they price, not GG which they do not");
  assert.strictEqual(a.p, 0.82);
  assert.strictEqual(next({ id: "f1", code: "OVER_1.5" }, B).code, "1X", "never the market just refused");
  now = realNow() - 60e3;
  assert.strictEqual(next({ id: "f1", code: "OVER_2.5" }, B), null, "nothing on a game that has started");
  now = realNow() + 3600e3;
  why["f1|OVER_2.5"] = "kicked off";
  assert.strictEqual(next({ id: "f1", code: "OVER_2.5" }, B), null, "nor when they say it has");
  delete why["f1|OVER_2.5"];
  assert.strictEqual(next({ id: "f1", code: "1", p: 0.5 }, B).code, "1X",
    "a built leg is swapped only into a market whose chip is on (owner, 9 Oct 2026)");
  f.sportyOdds = { "1": 2.1 };
  assert.strictEqual(next({ id: "f1", code: "OVER_2.5" }, B), null, "nothing under 60% is offered as safe");
});

test("the pop-up puts a swap in front of each refused game, and books what was ticked", () => {
  const fnSrc = body("confirmAfterRefusal");
  assert.match(fnSrc, /safePicks\(c,B\)/, "each refused game gets its offers");
  /* Owner, 29 Sep 2026: show the market they refused, and a Swap or Remove
     choice rather than a tick box. */
  assert.match(fnSrc, /class='ask-off'><s>/, "the refused market is named, struck through");
  assert.match(fnSrc, /data-v='swap'[\s\S]*data-v='drop'[\s\S]*>Remove</, "Swap or Remove, per game");
  assert.match(fnSrc, /go\(alts\.filter\(function\(a,i\)\{ return a&&swap\[i\]; \}\)\)/,
    "only the swaps left ticked are booked");
  /* And every caller books them. */
  assert.match(src, /bookRounds\(safe\.concat\(swapIn\),B,src,target,h,round\+1\);\},gone,h\);/);
  assert.match(src, /doBookMy\(safe\.concat\(swapIn\),\(retried\|\|0\)\+1,B\);\s*\},_dropped\);/);
});

test("Make it safer asks in the pop-up, never inside its own pill", () => {
  const s = body("saferHere");
  assert.doesNotMatch(s, /box\.insertAdjacentHTML\("beforeend",bookErrHTML/,
    "the error card inside the pill is what blew it up");
  assert.match(s, /bookRounds\(picks,B,"safer","codeSaferHost"/, "the shared refusal loop");
});

test("the editor's code is described by every leg booked, not by the swaps", () => {
  /* Since 5 Oct 2026 Apply books through bookLegs, whose code dialog is
     handed the picks actually SENT - every kept leg, fewer after a refusal. */
  const i = src.indexOf('bookLegs(sent,B,"editor","byoSaferOut"');
  assert.ok(i > 0, "Apply books through bookLegs");
  assert.match(src.slice(src.indexOf("function bookLegs("), src.indexOf("function legName(")),
    /showCode\(code,outId,null,B,sent,d\)/);
  const pre = src.slice(src.lastIndexOf("var kept=legs.filter", i), i);
  assert.doesNotMatch(pre, /plan\.map\(function\(p\)/, "plan is only the legs that moved");
  assert.match(pre, /var sent=kept\.map/, "one pick per leg sent");
});

test("the code shows what it pays, in the book's own figure when it gave one", () => {
  const html = new Function("totalOdds", "esc", fn("codeTotHTML") + "\nreturn codeTotHTML;")(() => 3.05, String);
  const B = { mark: "<span>SportyBet</span>", label: "SportyBet" };
  const own = html([{}, {}, {}], { odds: 4.12 }, B);
  assert.match(own, /3 games/);
  assert.match(own, /×4\.12/);
  /* Owner, 29 Sep 2026: words, not a tick - "booked at" for the book's own
     total, "about" for ours. */
  assert.match(own, /booked at<\/span><span class='ct-o'[^>]*>×4\.12/, "the book's own total reads 'booked at'");
  assert.doesNotMatch(own, /&#10003;|✓/, "no tick");
  /* The dialog's heading already names the bookie; saying it again after
     the odds was noise (owner, 29 Sep 2026). */
  assert.doesNotMatch(own, /<span>SportyBet<\/span>/, "the bookie is not named a second time");
  const est = html([{}, {}], null, B);
  assert.match(est, /×3\.05/);
  assert.match(est, />about<\/span>/, "ours is marked as an estimate");
  assert.strictEqual(html([], null, B), "");
  assert.match(fn("showCode"), /codeTotHTML\(picks,d,B\)/, "and the dialog carries it");
});

test("the builder's sticky bar carries the total", () => {
  assert.match(src, /<span class="bf-odds" id="bfOdds"/);
  assert.match(fn("renderBuilderOutput"), /_bf\.innerHTML=picks\.length\?/);
});

test("a hidden builder panel is hidden at every width", () => {
  /* The 900px grid on the Wizard panel beat [hidden], so on a laptop both
     panels showed in Slider mode and the Wizard's buttons acted on the Slider. */
  assert.match(src, /\.bld-panel\[hidden\]\{display:none!important\}/);
});

test("one scroll lock, held by name, released only when the last overlay closes", () => {
  /* Owner, 29 Sep 2026: "why does the background still scroll when a modal
     is up?" body{overflow:hidden} alone is ignored by iOS, and three overlays
     each restored their own saved value, unlocking the page under each other. */
  const style = () => ({});
  const doc = { body: { style: style() }, documentElement: { style: style() } };
  const win = { scrollY: 640, scrollTo(a, y) { this.to = typeof a === "object" ? a.top : y; } };
  const lock = new Function("document", "window", decl("SCROLL_HELD") + "\n" + fn("scrollLock") +
    "\nreturn scrollLock;")(doc, win);
  lock("code", true);
  assert.strictEqual(doc.body.style.position, "fixed", "pinned, the form iOS respects");
  assert.strictEqual(doc.body.style.top, "-640px", "at its own scroll offset");
  lock("ask", true); lock("ask", false);
  assert.strictEqual(doc.body.style.position, "fixed", "the pop-up closing does not free the page under the code dialog");
  lock("code", false);
  assert.strictEqual(doc.body.style.position, "");
  assert.strictEqual(win.to, 640, "and the page is back where it was");
  const src = require("./books.js").src;
  assert.doesNotMatch(src, /document\.body\.style\.overflow="hidden"/, "no overlay locks on its own any more");
});

/* Owner, 8 Oct 2026: "it shouldnt affect the size of the remove pill",
   "add a remove all button", and the pop-up needed a zoom-out on a 13-inch
   laptop before Book could be reached. */
test("Remove keeps one size, whatever the swap beside it wraps to", () => {
  assert.match(src, /\.confirm-card \.ask-opt\[data-v='drop'\]\{[^}]*align-self:center/);
});

test("Remove all turns every swap into a removal, offered only when there are two or more", () => {
  const fnSrc = body("confirmAfterRefusal");
  assert.match(fnSrc, /swap\.filter\(Boolean\)\.length>1\?"<button class='ask-all' type='button'>Remove all<\/button>"/);
  assert.match(fnSrc, /el\.querySelectorAll\("\.ask-opt\[data-v='drop'\]"\)\.forEach\(function\(b\)\{ b\.click\(\); \}\);/,
    "goes through each row's own Remove, so the Book count follows");
});

test("the pop-up fits a laptop screen and its buttons stay in view", () => {
  assert.match(src, /\.ask-card\{[^}]*max-height:min\(calc\(100dvh - 32px\),680px\)/);
  assert.match(src, /\.ask-card \.confirm-card \.ca\{[^}]*position:sticky;bottom:-16px/);
});

/* Owner, 8 Oct 2026: "the same games keep coming up" - but "just the options
   refused for the day ... not the whole fixture". */
test("a refused market is remembered for today, at that book, for that market only", () => {
  const store = {};
  let now = Date.parse("2026-10-08T12:00:00Z");
  const api = new Function("localStorage", "Date",
    decl("REFUSED_KEY") + "\n" + fn("refusedDay") + "\n" + fn("refusedToday") + "\n" + fn("noteRefused") +
    "\nreturn {note:noteRefused, today:refusedToday};")(
    { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } });
  api.note({ id: "g1", code: "1X" }, { key: "sporty" });
  const k = api.today();
  assert.strictEqual(k["sporty|g1|1X"], 1);
  assert.strictEqual(k["sporty|g1|OVER_1.5"], undefined, "other markets on the game stay");
  assert.strictEqual(k["bet9ja|g1|1X"], undefined, "other books stay");
  now = Date.parse("2026-10-08T22:59:00Z");
  assert.strictEqual(api.today()["sporty|g1|1X"], 1, "still today in Lagos at 23:59");
  now = Date.parse("2026-10-08T23:00:00Z");
  assert.deepStrictEqual(api.today(), {}, "Lagos midnight: the book may sell it tomorrow");
});

test("only named refusals are written, and both builders skip that market only", () => {
  assert.match(body("dropUnbookable"), /REFUSAL_WHY\[c\.id\+"\|"\+c\.code\]=w;\s*noteRefused\(c,B\);/);
  assert.match(body("buildPicks"), /function sane\(c\)\{\s*if\(refused\[rk\+fid\(f\)\+"\|"\+c\]\) return false;/);
  assert.match(body("wspBuild"), /allowed\.forEach\(function\(c\)\{\s*if\(refused\[rk\+fid\(f\)\+"\|"\+c\]\)return;/);
  assert.match(body("safePicks"), /if\(refused\[B\.key\+"\|"\+c\.id\+"\|"\+o\.code\]\) return;/, "and the pop-up never offers it");
});

test("the pop-up steps through every safe pick on a game, not just the likeliest", () => {
  /* "the options offered are always the same" */
  const f = body("confirmAfterRefusal");
  assert.match(f, /lists\[i\]\.length>1\?"<button class='ask-next'/);
  assert.match(f, /at\[i\]=\(at\[i\]\+1\)%lists\[i\]\.length; alts\[i\]=lists\[i\]\[at\[i\]\];/);
  assert.match(f, /pill\.click\(\);/, "stepping to one chooses it");
});

/* Owner, 9 Oct 2026: "even when i pick 12 odds, like 7 games are not available ...
   its very annoying to users". Live: 4 of 26 refused, every one a goals line
   SportyBet had re-lined (1.06-1.07 moved up) or closed. */
test("every refused game has a safe swap: no question, the swaps are booked and the reader is told", () => {
  const fnSrc = body("confirmAfterRefusal");
  assert.match(fnSrc, /if\(n&&\(refused\|\|\[\]\)\.length===n&&alts\.every\(Boolean\)\)\{/);
  assert.match(fnSrc, /swToast\(n\+\(n===1\?" game":" games"\)\+" updated to what "\+String\(B\.label\|\|"the bookmaker"\)\+" offers now"/);
  /* It runs before the pop-up's own helpers are defined: a call to one of them
     (plain(), on 9 Oct) threw, and the catch said "Couldn't reach the booking
     service" on every refused slip. So the early path may use nothing declared
     below it. */
  const early = fnSrc.slice(fnSrc.indexOf("NO QUESTION WHEN"), fnSrc.indexOf("var plain="));
  assert.ok(early.length > 0, "the auto-swap sits before plain() is defined");
  assert.doesNotMatch(early, /\bplain\(|\boptHTML\(|\blabel\(\)/, "and calls nothing defined after it");
  assert.match(fnSrc, /go\(alts\);\s*return;/);
});

test("short goals lines stay pickable: team over 0.5 under 1.15 is the owner's call (11 Oct 2026)", () => {
  const page = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  assert.doesNotMatch(page, /shortLine|SHORT_LINE/, "no 1.15 floor on goals lines anywhere");
});

test("a lock released after the page shrank never lands past its end (owner, 9 Oct 2026)", () => {
  const doc = { body: { style: {} }, documentElement: { style: {}, scrollHeight: 1200 } };
  const win = { scrollY: 2000, innerHeight: 800, scrollTo(a, y) { this.to = typeof a === "object" ? a.top : y; } };
  const lock = new Function("document", "window", decl("SCROLL_HELD") + "\n" + fn("scrollLock") + "\nreturn scrollLock;")(doc, win);
  lock("sheet", true); lock("sheet", false);
  assert.strictEqual(win.to, 400, "clamped to the new bottom, not the old spot");
});

test("shared refusals: what SportyBet refused for anyone is skipped by everyone, own refusals still kept", () => {
  const src2 = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  const take = (name) => { const i = src2.search(new RegExp("\\nfunction " + name + "\\(")); let d = 0, k = src2.indexOf("{", i);
    for (; k < src2.length; k++) { if (src2[k] === "{") d++; else if (src2[k] === "}" && !--d) break; } return src2.slice(i, k + 1); };
  const STORE = {};
  const api = new Function("localStorage", [
    "var REFUSED_KEY='sw.refused', DATA={fixtures:[{id:'a',eventId:'sr:match:1'},{id:'b'}]};",
    "function fid(f){return f.id;}",
    take("refusedDay"), "var SHARED_REFUSED={};", take("setSharedRefused"),
    take("refusedToday"), take("noteRefused"),
    "return {set:setSharedRefused, today:refusedToday, note:noteRefused, local:function(){return refusedToday(true);}};"].join("\n"))(
    { getItem: (k) => STORE[k] || null, setItem: (k, v) => { STORE[k] = v; } });
  api.set([["sr:match:1", "HOME_OVER_0.5"], ["sr:match:404", "1"]]);
  api.note({ id: "b", code: "1X" }, { key: "sporty" });
  assert.deepStrictEqual(Object.keys(api.today()).sort(), ["sporty|a|HOME_OVER_0.5", "sporty|b|1X"]);
  assert.deepStrictEqual(Object.keys(api.local()), ["sporty|b|1X"], "shared ones are never written to this browser");
  assert.match(src2, /attachEventIds\(d\.matches,BOOKS\.sporty\);\s*setSharedRefused\(d\.refused\);/);
});
