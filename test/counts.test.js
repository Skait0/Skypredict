"use strict";

/**
 * The number on a button has to be what the button gives you.
 *
 * Reported: "when i select 'top flight only' the number of available games
 * doesnt change under 'all day' / early / mid day / late."
 *
 * It did not change because those counts were read straight off DATA.fixtures
 * with only notStarted and the day applied. Neither the Top flight switch nor
 * the league picker reached them, so a bucket could advertise nine games and
 * then hand over two. Both builders filter on TOP_ONLY and leagueAllowed before
 * they pick anything; the counts beside the buttons did not.
 *
 * The counts now run the same three filters. What is deliberately NOT filtered
 * is which days EXIST - see the note on buildableOn.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* The real helpers, with the globals they read injected. */
function counters(opts) {
  const fn = new Function("DATA", "TOP_ONLY", "CHOSEN",
    "function notStarted(f){return !f.started;}" +
    "function dayOff(d){return d;}" +
    "function leagueAllowed(l){return !Object.keys(CHOSEN).length||!!CHOSEN[l];}" +
    "function isLowerFixture(f){return !!f.lower;}" +
    grab("buildableOn") + "\n" + grab("buildableAll") +
    "\nreturn {on:buildableOn,all:buildableAll};");
  return fn({ fixtures: opts.fixtures }, opts.topOnly || false, opts.chosen || {});
}

const BOARD = [
  { id: "a", date: 0, league: "England Premier League", lower: false },
  { id: "b", date: 0, league: "England League 1", lower: true },
  { id: "c", date: 0, league: "Spain La Liga 1", lower: false },
  { id: "d", date: 1, league: "England Premier League", lower: false },
  { id: "e", date: 0, league: "Italy Serie B", lower: true },
  { id: "f", date: 0, league: "France Ligue 1", lower: false, started: true },
];

test("without filters the count is every unplayed game that day", () => {
  const c = counters({ fixtures: BOARD });
  assert.deepStrictEqual(c.on(0).map((f) => f.id), ["a", "b", "c", "e"],
    "a started game must never be counted as available");
  assert.deepStrictEqual(c.on(1).map((f) => f.id), ["d"]);
});

test("Top flight only removes the lower-league games from the count", () => {
  /* The reported bug: this number used to be identical to the one above. */
  const c = counters({ fixtures: BOARD, topOnly: true });
  assert.deepStrictEqual(c.on(0).map((f) => f.id), ["a", "c"],
    "Top flight is on, so the two second-tier games must not be counted");
});

test("choosing leagues narrows it too", () => {
  const c = counters({ fixtures: BOARD, chosen: { "Spain La Liga 1": 1 } });
  assert.deepStrictEqual(c.on(0).map((f) => f.id), ["c"]);
});

test("both filters apply together", () => {
  const c = counters({ fixtures: BOARD, topOnly: true,
    chosen: { "England Premier League": 1, "England League 1": 1 } });
  assert.deepStrictEqual(c.on(0).map((f) => f.id), ["a"],
    "League 1 is chosen but Top flight excludes it, so only the Premier League game counts");
});

test("the all-upcoming count uses the same filters, across every day", () => {
  const c = counters({ fixtures: BOARD, topOnly: true });
  assert.deepStrictEqual(c.all().map((f) => f.id), ["a", "c", "d"],
    "should be every unplayed top-flight game regardless of day");
});

test("an empty board counts zero rather than throwing", () => {
  const c = counters({ fixtures: [] });
  assert.strictEqual(c.on(0).length, 0);
  assert.strictEqual(c.all().length, 0);
});

/* ------------------------------------------------------------ the callers */

test("the time buckets count from the filtered helper", () => {
  /* This is where the report came from. If paintTod goes back to reading
     DATA.fixtures directly, the buttons start lying again. */
  const fn = grab("paintTod");
  assert.match(fn, /var base=buildableOn\(SDAY\);/,
    "paintTod is not using the filtered count");
  assert.ok(!/DATA\.fixtures/.test(fn),
    "paintTod reads the raw payload again, which is exactly the bug");
});

test("the day pills count from it too", () => {
  const fn = grab("paintScope");
  assert.match(fn, /buildableOn\(SDAY\)\.length/, "the Today pill is not filtered");
  assert.match(fn, /buildableAll\(\)\.length/, "the All upcoming pill is not filtered");
  assert.ok(!/DATA\.fixtures/.test(fn), "paintScope reads the raw payload again");
});

test("which days exist is still decided WITHOUT the filters", () => {
  /* Deliberate. A league choice that empties a day must not make the day picker
     rearrange itself while somebody is still choosing, so dayPickList and
     clampDay keep using the unfiltered dayBuildable. */
  assert.match(grab("dayPickList"), /dayBuildable\(o\)>0/,
    "the day picker should keep using the unfiltered count");
  assert.ok(!/buildableOn/.test(grab("dayBuildable")),
    "dayBuildable is the structural count and must stay unfiltered");
});

/**
 * A control must not claim a state it is not in.
 *
 * Reported: "when i click on all upcoming, i think all day should not look
 * active. since all upcoming is not one day."
 *
 * Right. TOD is pinned to "all" whenever the window is not a single day, and
 * todFixtures ignores it entirely in that mode - so "All day" was lit while
 * filtering nothing. Same lie the counts were telling, in a different place.
 */
function paintTodSelection(scope, tod) {
  const picked = [];
  const fn = new Function("SCOPE", "TOD", "$", "buildableOn", "todOf",
    grab("paintTod") + "\nreturn paintTod;");
  const btn = (name) => ({
    getAttribute: (a) => (a === "data-tod" ? name : null),
    classList: { toggle: (c, on) => { if (c === "on" && on) picked.push(name); } },
    setAttribute: () => {},
    closest: () => null,
  });
  const seg = {
    querySelectorAll: (sel) => (sel === "[data-tod]"
      ? ["all", "early", "mid", "late"].map(btn) : []),
  };
  fn(scope, tod, () => seg, () => [], () => "late")();
  return picked;
}

test("on a single day the chosen bucket is selected", () => {
  assert.deepStrictEqual(paintTodSelection("day", "all"), ["all"]);
  assert.deepStrictEqual(paintTodSelection("day", "late"), ["late"]);
});

test("on All upcoming nothing is selected", () => {
  assert.deepStrictEqual(paintTodSelection("all", "all"), [],
    "'All day' was lit on a window that spans several days, so it claimed a " +
    "filter that todFixtures does not apply");
});

test("the buckets still work there, they just are not lit", () => {
  /* Tapping one is how you move onto a day, so they must not be disabled -
     setTod pulls the window in with the choice. */
  const fn = grab("setTod");
  assert.match(fn, /if\(t!=="all"&&SCOPE!=="day"\)\{/,
    "naming a time of day must still pull the window onto a day");
  assert.match(fn, /SCOPE="day";/);
});

test("toggling Top flight repaints the counts", () => {
  /* Filtering them is useless if nothing redraws. The chain is
     click -> setTopOnly -> renderBuilder -> paintScope -> paintTod. */
  const i = src.indexOf('setTopOnly(c.dataset.btp==="true");');
  assert.ok(i > 0, "the Top flight buttons are no longer wired to setTopOnly");
  assert.match(src.slice(i, i + 120), /renderBuilder\(\);/,
    "toggling Top flight must repaint the builder");
  assert.match(grab("paintScope"), /paintTod\(\);/,
    "paintScope must carry on into the time buckets");
});
