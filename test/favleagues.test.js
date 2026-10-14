"use strict";
/**
 * FAVOURITE LEAGUES (owner, 11 Oct 2026) - the builder's own list, replacing
 * "Top flight only" and the old per-league tap picker.
 *
 * "lets change 'top leagues' to 'favourite leagues'", "some users would like
 * to add other leagues to it", "lets use the top 20 leagues instead of the 30",
 * and - for the board - "i might want to see the full board but my build me
 * slip should be what i want": the board's stars are a separate list.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const LISTS = src.match(/var POPULAR=\[[\s\S]*?\];/)[0] + "\n" + src.match(/var POPULAR_ALIAS=\{[\s\S]*?\};/)[0];
/* \r?\n: index.html is committed CRLF, and an LF-only pattern failed on a
   fresh checkout (found 11 Oct 2026). */
const FAVB_LOAD = src.match(/var FAVB=\{\};\r?\ntry\{[^\r\n]*\r?\n/)[0];

function page(store, topOnly) {
  const ctx = {
    STORE: store || {}, TOP_ONLY: topOnly !== false,
    localStorage: null, VOL_IN: false, BLD_PICK: {},
    isVolatile: (l) => /League [12]$/.test(l),
    notStarted: (f) => !f.started,
    compOf: (l) => l.split(" ").slice(1).join(" "),
    inScope: (f) => !f.otherDay, todFixtures: (a) => a,
  };
  ctx.localStorage = { getItem: (k) => (k in ctx.STORE ? ctx.STORE[k] : null), setItem: (k, v) => { ctx.STORE[k] = String(v); },
    removeItem: (k) => { delete ctx.STORE[k]; } };
  vm.runInNewContext(LISTS + "\n" + FAVB_LOAD + ["topKey", "topRank", "favLeague", "setFav", "resetFavs", "leagueDefault",
    "leagueAllowed", "setLeaguePicked", "favName", "favRows"].map(grab).join("\n") +
    "\nthis.api={setLeaguePicked:setLeaguePicked,favLeague:favLeague,setFav:setFav,resetFavs:resetFavs,leagueAllowed:leagueAllowed,favRows:favRows,favName:favName};", ctx);
  return ctx;
}

test("the list starts as the top 20 countries' top divisions and the three UEFA cups", () => {
  const { api } = page();
  for (const l of ["England Premier League", "Croatia HNL", "Sweden Allsvenskan", "International Clubs UEFA Conference League"])
    assert.strictEqual(api.favLeague(l), true, l);
  for (const l of ["Bulgaria Parva Liga", "Russia Premier League", "England Championship", "USA MLS", "England EFL Cup"])
    assert.strictEqual(api.favLeague(l), false, l);
});

test("adding and removing store only the difference from the default, and reset forgets it", () => {
  const P = page();
  P.api.setFav("Argentina Liga Profesional", true);
  P.api.setFav("Italy Serie A", false);
  assert.deepStrictEqual(JSON.parse(P.STORE["sw.favleagues"]), { "Argentina Liga Profesional": 1, "Italy Serie A": 0 });
  P.api.setFav("Italy Serie A", true);
  assert.deepStrictEqual(JSON.parse(P.STORE["sw.favleagues"]), { "Argentina Liga Profesional": 1 }, "back to the default is no entry");
  const again = page(P.STORE);
  assert.strictEqual(again.api.favLeague("Argentina Liga Profesional"), true, "it survives a reload");
  again.api.resetFavs();
  assert.strictEqual("sw.favleagues" in again.STORE, false);
  assert.strictEqual(again.api.favLeague("Argentina Liga Profesional"), false);
});

test("Favourite leagues lets in the list and nothing else; a lower league you add counts", () => {
  const P = page({ "sw.favleagues": JSON.stringify({ "England League 1": 1 }) });
  assert.strictEqual(P.api.leagueAllowed("England League 1"), true, "added, even though it is volatile");
  assert.strictEqual(P.api.leagueAllowed("England Championship"), false);
  const all = page({}, false);
  assert.strictEqual(all.api.leagueAllowed("England Championship"), true, "All leagues is every league");
  assert.strictEqual(all.api.leagueAllowed("England League 1"), false, "volatile ones still wait on the bench");
});

test("the sheet lists favourites first in UEFA order, under the names readers use", () => {
  const P = page({ "sw.favleagues": JSON.stringify({ "USA MLS": 1 }) });
  P.DATA = { fixtures: [
    { league: "USA MLS" }, { league: "Germany Bundesliga 1" }, { league: "England Premier League" },
    { league: "International Clubs UEFA Champions League" }, { league: "England Championship" }, { league: "Spain La Liga 1", started: true }, { league: "Italy Serie A", otherDay: true }] };
  const rows = P.api.favRows();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows.map((x) => x.league))), ["England Premier League", "Germany Bundesliga 1",
    "International Clubs UEFA Champions League", "USA MLS", "England Championship"], "only the chosen window, and a played game lists nothing");
  assert.strictEqual(P.api.favName("International Clubs UEFA Champions League"), "Champions League");
  assert.strictEqual(P.api.favName("Germany Bundesliga 1"), "Bundesliga");
});

test("the panel: Favourite leagues first and on by default, an Edit sheet, synced, the board's stars untouched", () => {
  assert.match(src, /<button type="button" data-btp="true">[\s\S]*?Favourite leagues<\/button>\s*<button type="button" data-btp="false">All leagues<\/button>/);
  assert.match(src, /var TOP_ONLY=true; try\{var _to=localStorage\.getItem\("sw\.favmode"\)/);
  assert.match(src, /id="favSheet"[\s\S]*?Reset to the top 20/);
  assert.match(src, /favleagues:"sw\.favleagues"/, "synced from the page");
  assert.ok(require("../lib/sync.js").PREF_KEYS.includes("favleagues"), "and accepted by the server");
  assert.match(grab("toggleFav"), /FAVS\[l\]/, "the board's stars keep their own list");
  assert.doesNotMatch(grab("toggleFav"), /favleagues|FAVB/);
});

test("All leagues has its own list: untick a league to leave it out, tick a volatile one in (owner, 14 Oct 2026)", () => {
  const P = page({}, false);
  P.DATA = { fixtures: [{ league: "England Premier League" }, { league: "England Championship" }, { league: "England League 1" }] };
  P.api.setLeaguePicked("England Championship", false);
  P.api.setLeaguePicked("England League 1", true);
  assert.strictEqual(P.api.leagueAllowed("England Championship"), false, "unticked is out");
  assert.strictEqual(P.api.leagueAllowed("England League 1"), true, "a volatile league ticked by hand is in");
  assert.deepStrictEqual(JSON.parse(P.STORE["sw.bldpick"]), { "England Championship": 0, "England League 1": 1 });
  const on = Object.fromEntries(P.api.favRows().map((x) => [x.league, x.on]));
  assert.deepStrictEqual(on, { "England Premier League": true, "England League 1": true, "England Championship": false },
    "the sheet's rows follow the All list, not the favourites");
  P.api.setLeaguePicked("England Championship", true);
  assert.strictEqual("England Championship" in JSON.parse(P.STORE["sw.bldpick"]), false, "ticked back = no entry");
  const fav = page({ "sw.bldpick": JSON.stringify({ "England Premier League": 0 }) });
  fav.BLD_PICK = { "England Premier League": 0 };
  assert.strictEqual(fav.api.leagueAllowed("England Premier League"), true, "All's unticks never touch Favourite leagues");
});

test("the line and the Edit sheet speak for the list that is on, not always the favourites", () => {
  const f = grab("renderLeaguePicker");
  assert.ok(!f.includes("line.hidden"), "the line shows in both modes (CSS display:flex beat hidden anyway)");
  assert.ok(f.includes("if(!TOP_ONLY){") && f.includes("Left out: "), "All leagues says what it left out");
  const s = grab("renderFavSheet");
  assert.ok(s.includes('all?"All leagues":"Favourite leagues"'), "the sheet is titled for its list");
  assert.ok(s.includes("setLeaguePicked(l,!leagueAllowed(l))"), "a tap under All ticks or unticks, not stars");
});

test("league names read as readers say them, without eating a real number", () => {
  const { api } = page();
  assert.strictEqual(api.favName("France Ligue 1"), "Ligue 1");
  assert.strictEqual(api.favName("Spain La Liga 1"), "La Liga");
});
