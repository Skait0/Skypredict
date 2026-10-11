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

/* board: fixtures (default BOARD); a fixture with started:true has kicked
   off, and one in league "V" is filtered out as a benched volatile league. */
function harness(today, store, board) {
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
    "function notStarted(f){return !f.started;}" +
    "function dayOff(d){return d-CLOCK.today;}" + "function fDay(f){return f.date;}" +
    "function todFixtures(l){return l;}" +
    "function leagueAllowed(l){return l!=='V';}" +
    "function activeDays(){var s={};FX.forEach(function(f){var o=dayOff(f.date);if(o>=0)s[o]=1;});" +
    "return Object.keys(s).map(Number).sort(function(a,b){return a-b;});}" +
    "function outsideTop(){return false;}" +
    "function esc(s){return String(s);}" +
    "function dayDate(o){return 'D'+(CLOCK.today+o);}" +
    "var painted=0; function paintScope(){painted++;}" +
    grab("weekendOffs") + grab("inScope") + grab("scopeFixtures") +
    grab("buildableOn") + grab("buildableSpan") + grab("buildableRange") + grab("dayBuildable") +
    grab("spanBuildable") + grab("setWeekend") + grab("weekendOpt") +
    grab("dayPickList") + grab("clampDay") + "\n" +
    "return {weekendOffs:weekendOffs, scopeFixtures:scopeFixtures, buildableSpan:buildableSpan," +
    " setWeekend:setWeekend, weekendOpt:weekendOpt, clampDay:clampDay, store:STORE," +
    " state:function(){return {SCOPE:SCOPE,TOD:TOD,SDAY:SDAY};}};"
  )(board || BOARD, store, clock, FakeDate);
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
  assert.deepStrictEqual(H.state(), { SCOPE: "wknd", TOD: "all", SDAY: 0 });
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
  /* The pill's label is scopeLabel (7 Oct 2026), shared with the shut filters bar. */
  assert.match(grab("scopeLabel"), /SCOPE==="wknd" \? "Weekend"/);
  assert.match(grab("paintScope"), /lbl\.textContent = scopeLabel\(\)/);
  assert.match(grab("paintScope"), /\(SCOPE==="span"\|\|SCOPE==="wknd"\)\?buildableSpan\(\)\.length/);
  assert.match(grab("windowWords"), /SCOPE==="wknd"\) return "this weekend"/);
  assert.match(src, /SCOPE==="wknd"\?"this weekend"/);
  assert.match(grab("openDayMenu"), /\+weekendOpt\(\)\+/, "Weekend sits after the span options");
  assert.match(grab("openDayMenu"), /setWeekend\(\)/);
});

/* ------------------------------------------------ fix round 1 ------------ */

test("a stored Weekend whose games have all started falls back to the next day with games", () => {
  /* Sunday night: every Sunday game has kicked off, Monday (day 8) has two. */
  const board = [{ date: 7, league: "L", started: true }, { date: 7, league: "L", started: true },
    { date: 8, league: "L" }, { date: 8, league: "L" }];
  const store = { "sw.scope": "wknd" };
  const H = harness(7, store, board);
  assert.strictEqual(H.state().SCOPE, "wknd", "precondition: the stored Weekend loaded");
  H.clampDay();
  assert.deepStrictEqual(H.state(), { SCOPE: "day", TOD: "late", SDAY: 1 });
  assert.strictEqual(store["sw.scope"], "day");
  assert.strictEqual(store["sw.sday"], "1");
  assert.strictEqual(H.scopeFixtures().length, 2, "not an empty board");
});

test("a stored Weekend with games left is kept", () => {
  const H = harness(5, { "sw.scope": "wknd" });
  H.clampDay();
  assert.strictEqual(H.state().SCOPE, "wknd");
});

test("a stored Weekend survives the parse-time paint, before load() has filled the board", () => {
  /* paintScope runs at parse time while DATA.fixtures is still []; clampDay
     must not read that as "no weekend games" and wipe (and sync) the choice. */
  const board = [];
  const store = { "sw.scope": "wknd", "sw.sday": "0" };
  const H = harness(3, store, board);
  H.clampDay();
  assert.strictEqual(H.state().SCOPE, "wknd", "memory untouched");
  assert.deepStrictEqual(store, { "sw.scope": "wknd", "sw.sday": "0" }, "storage untouched");
  /* Real data arrives with nothing on the weekend (Wed 3, Thu 4 only): now the
     fallback to the first day with games still happens. */
  board.push({ date: 3, league: "L" }, { date: 4, league: "L" });
  H.clampDay();
  assert.strictEqual(H.state().SCOPE, "day");
  assert.strictEqual(store["sw.scope"], "day");
  assert.strictEqual(store["sw.sday"], "0");
});

test("the Weekend row counts what a tap builds, but exists on structure alone", () => {
  /* Friday (5); the weekend is days 6 and 7. One game there is in a benched
     league "V", so the row says 2 - the pill's number - not 3. */
  const board = [{ date: 6, league: "L" }, { date: 6, league: "V" }, { date: 7, league: "L" }];
  const H = harness(5, {}, board);
  assert.match(H.weekendOpt(), /<span class='dy-c'>2<\/span>/);
  H.setWeekend();
  assert.strictEqual(H.buildableSpan().length, 2);
  /* Only benched games: the row stays (a league choice must not rearrange the
     menu) and honestly says 0. */
  const onlyV = harness(5, {}, [{ date: 6, league: "V" }]);
  assert.match(onlyV.weekendOpt(), /<span class='dy-c'>0<\/span>/);
});

test("day and span rows count through the same filters", () => {
  const menu = grab("openDayMenu");
  assert.match(menu, /buildableRange\(s0,s0\+n-1\)\.length/, "span rows");
  assert.match(menu, /buildableOn\(o\)\.length/, "day rows");
  assert.match(menu, /var list=dayPickList\(\);/, "which days exist stays structural");
});
