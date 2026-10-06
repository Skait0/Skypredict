"use strict";

/**
 * Weekend in the day menu.
 *
 * Ruling R4: on Sunday the weekend is Sunday only; on Saturday it is Sat + Sun;
 * Monday to Friday it is the coming Sat + Sun. Only the choice is stored
 * (SCOPE "wknd"); the days are worked out from today's date on every call, so
 * a Weekend chosen on Friday is still this weekend after Saturday's reload.
 *
 * The clock is faked by handing the grabbed code its own Date. Fixture dates
 * are absolute day numbers where day % 7 is the weekday (0 Sunday), and dayOff
 * measures them from TODAY, the same way the page measures from the real date.
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

/* Days 3 (Wed) to 14 (Sun the week after), two games a day. */
const BOARD = [];
for (let d = 3; d <= 14; d++) BOARD.push({ date: d, league: "L" }, { date: d, league: "L" });

function harness(today, store) {
  store = store || {};
  const clock = { today };
  function FakeDate() { this.d = clock.today; }
  FakeDate.prototype.getDay = function () { return this.d % 7; };
  const H = new Function("FX", "STORE", "CLOCK", "Date",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);},removeItem:function(k){delete STORE[k];}};" +
    "var DATA={fixtures:FX}, SCOPE='day', SDAY=0, SPAN=3, TOD='late', TOP_ONLY=false;" +
    "try{var sc0=localStorage.getItem('sw.scope');" +
    /* The page's own accept-list for a stored window. */
    /if\(sc0==="day"[^)]*\) SCOPE=sc0;/.exec(src)[0] + "}catch(e){}" +
    "function notStarted(){return true;}" +
    "function dayOff(d){return d-CLOCK.today;}" + "function fDay(f){return f.date;}" +
    "function todFixtures(l){return l;}" +
    "function leagueAllowed(){return true;}" +
    "function isLowerFixture(){return false;}" +
    "function esc(s){return String(s);}" +
    "function dayDate(o){return 'D'+(CLOCK.today+o);}" +
    "var painted=0; function paintScope(){painted++;}" +
    grab("weekendOffs") + grab("inScope") + grab("scopeFixtures") +
    grab("buildableOn") + grab("buildableSpan") + grab("dayBuildable") +
    grab("spanBuildable") + grab("setWeekend") + grab("weekendOpt") + "\n" +
    "return {weekendOffs:weekendOffs, scopeFixtures:scopeFixtures, buildableSpan:buildableSpan," +
    " setWeekend:setWeekend, weekendOpt:weekendOpt, store:STORE," +
    " state:function(){return {SCOPE:SCOPE,TOD:TOD};}};"
  )(BOARD, store, clock, FakeDate);
  H.clock = clock;
  return H;
}
const days = (list) => [...new Set(list.map(f => f.date))];

test("the weekend window for a Monday, Friday, Saturday and Sunday (R4)", () => {
  assert.deepStrictEqual(harness(8).weekendOffs(), [5, 6], "Monday: the coming Sat + Sun");
  assert.deepStrictEqual(harness(5).weekendOffs(), [1, 2], "Friday: tomorrow and the day after");
  assert.deepStrictEqual(harness(6).weekendOffs(), [0, 1], "Saturday: today and tomorrow");
  assert.deepStrictEqual(harness(7).weekendOffs(), [0, 0], "Sunday: just today");
});

test("choosing Weekend narrows the board to those days and retires the time bucket", () => {
  const H = harness(5);
  assert.strictEqual(H.setWeekend(), true);
  assert.deepStrictEqual(H.state(), { SCOPE: "wknd", TOD: "all" });
  assert.strictEqual(H.store["sw.scope"], "wknd");
  assert.deepStrictEqual(days(H.scopeFixtures()), [6, 7]);
  assert.strictEqual(H.setWeekend(), false, "choosing it again is a no-op");
});

test("the Weekend counts equal the fixtures in that window", () => {
  [8, 5, 6, 7].forEach((today) => {
    const H = harness(today);
    H.setWeekend();
    const n = H.scopeFixtures().length;
    assert.strictEqual(H.buildableSpan().length, n, "pill count, today=" + today);
    assert.match(H.weekendOpt(), new RegExp("<span class='dy-c'>" + n + "</span>"),
      "day-menu count, today=" + today);
  });
});

test("the menu row shows Sat - Sun, or just Sunday on a Sunday", () => {
  assert.match(harness(5).weekendOpt(), /<span class='dy-n'>Weekend<\/span><span class='dy-d'>D6 - D7<\/span>/);
  assert.match(harness(7).weekendOpt(), /<span class='dy-d'>D7<\/span>/);
});

test("the Weekend row is hidden when the weekend has nothing to build", () => {
  /* Today is Monday 15: the board ends on day 14, so this weekend is empty. */
  assert.strictEqual(harness(15).weekendOpt(), "");
});

test("a stored Weekend is still the right weekend the next day", () => {
  const store = {};
  harness(5, store).setWeekend();                      // chosen on Friday
  const sat = harness(6, store);                       // reload on Saturday
  assert.strictEqual(sat.state().SCOPE, "wknd", "the stored choice is accepted on load");
  assert.deepStrictEqual(days(sat.scopeFixtures()), [6, 7]);
  const sun = harness(7, store);
  assert.deepStrictEqual(days(sun.scopeFixtures()), [7]);
  const mon = harness(8, store);
  assert.deepStrictEqual(days(mon.scopeFixtures()), [13, 14], "Monday moves on to the next one");
});

test("the pill, the league picker and the empty state all name the weekend", () => {
  assert.match(grab("paintScope"), /SCOPE==="wknd" \? "Weekend"/);
  assert.match(grab("paintScope"), /\(SCOPE==="span"\|\|SCOPE==="wknd"\)\?buildableSpan\(\)\.length/);
  assert.match(grab("renderLeaguePicker"), /SCOPE==="wknd"\) \? "this weekend"/);
  assert.match(src, /SCOPE==="wknd"\?"this weekend"/);
  assert.match(grab("openDayMenu"), /\+weekendOpt\(\)\+/, "Weekend sits after the span options");
  assert.match(grab("openDayMenu"), /setWeekend\(\)/);
});
