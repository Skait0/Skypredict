"use strict";
/* Settings > Leagues (owner, 21 Oct 2026): every league we cover, by country,
   edited as the same list as All leagues > Edit (sw.bldpick). A tick there is
   the reader's own yes to a volatile league, no pop-up. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const UI = require("../public/account-ui.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

function page(leagues, store) {
  store = store || {};
  const P = new Function("LEAGUES", "STORE",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);},removeItem:function(k){delete STORE[k];}};" +
    "var window={}, DATA={leagues:LEAGUES,fixtures:[{league:'England League 1',tier:3}]}, WSP={}, TIER_UNRANKED=6, renders=0;" +
    "var TOP_ONLY=true; function setTopOnly(v){TOP_ONLY=!!v;STORE['sw.favmode']=v?'1':'0';}" +
    "function renderBuilder(){renders++;}" +
    "var BLD_PICK={}, VOL_IN=false, VOL_SRC=null, VOL_MAP={};" + src.match(/var VOL_NEW=\{[\s\S]*?\};/)[0] +
    grab("tierOf") + grab("compOf") + grab("countryOf") + grab("favName") + grab("isVolatile") +
    grab("leagueDefault") + grab("setLeaguePicked") + grab("loadLeaguePicks") +
    src.match(/window\.swLeagues=\{[\s\S]*?\n\};/)[0] +
    "loadLeaguePicks();" +
    "return {L:window.swLeagues, top:function(){return TOP_ONLY;}, renders:function(){return renders;}};")(leagues, store);
  return P;
}
const LEAGUES = ["England Premier League", "England League 1", "Nigeria Premier League", "Northern Ireland Championship", "Spain La Liga 1"];
const row = (P, l) => P.L.rows().find((x) => x.league === l);

test("every league we cover is listed, with its country; volatile ones start off", () => {
  const P = page(LEAGUES);
  const rows = P.L.rows();
  assert.strictEqual(rows.length, LEAGUES.length);
  assert.strictEqual(row(P, "Northern Ireland Championship").country, "Northern Ireland");
  assert.strictEqual(row(P, "Spain La Liga 1").name, "La Liga");
  assert.deepStrictEqual(rows.filter((x) => x.on).map((x) => x.league), ["England Premier League", "Spain La Liga 1"]);
  assert.ok(row(P, "Nigeria Premier League").vol && row(P, "England League 1").vol, "added and third-tier leagues are volatile");
});

test("a switch in Settings is the reader's yes: stored like All leagues > Edit, builder on All leagues", () => {
  const store = {};
  const P = page(LEAGUES, store);
  P.L.set(["Nigeria Premier League"], true);
  assert.strictEqual(row(P, "Nigeria Premier League").on, true);
  assert.deepStrictEqual(JSON.parse(store["sw.bldpick"]), { "Nigeria Premier League": 1 });
  assert.strictEqual(store["sw.volin"], undefined, "no blanket yes to every volatile league");
  assert.strictEqual(P.top(), false, "a change here would do nothing under Favourite leagues");
  assert.ok(P.renders() > 0, "the builder repaints");
  P.L.set(["England Premier League", "England League 1"], false);
  assert.strictEqual(row(P, "England Premier League").on, false);
  assert.deepStrictEqual(JSON.parse(store["sw.bldpick"]), { "Nigeria Premier League": 1, "England Premier League": 0 },
    "only a difference from the default is stored");
  assert.strictEqual(page(LEAGUES, store).L.rows().find((x) => x.league === "Nigeria Premier League").on, true, "survives a reload");
});

test("the Settings page groups by country, and a country's switch is on only when all its leagues are", () => {
  const html = UI.leaguesHtml([
    { league: "England Premier League", country: "England", name: "Premier League", vol: false, on: true },
    { league: "England League 1", country: "England", name: "League 1", vol: true, on: false },
    { league: "Spain La Liga 1", country: "Spain", name: "La Liga", vol: false, on: true },
  ]);
  assert.ok(html.indexOf('data-lgc="England"') < html.indexOf('data-lgc="Spain"'), "countries A to Z");
  assert.match(html, /<b>England<\/b><small>1 of 2 on<\/small>[\s\S]*?data-lc="England" aria-checked="false"/);
  assert.match(html, /data-lc="Spain" aria-checked="true"/);
  assert.match(html, /League 1<small>Volatile<\/small>/);
  assert.match(html, /data-ll="England League 1" aria-checked="false"/);
  assert.match(html, /id='swaLgFind'/);
  assert.match(UI.leaguesHtml([{ league: "X <b>", country: "X", name: "<b>", vol: false, on: true }]), /&lt;b&gt;/, "names are escaped");
});

test("Settings shows the Leagues row only when the page can answer, with the count", () => {
  const base = { theme: "dark", book: "sporty", marks: {}, mail: false, devices: null };
  assert.ok(!/swaLg/.test(UI.settingsHtml(base)));
  assert.match(UI.settingsHtml(Object.assign({ leagues: { on: 70, n: 105 } }, base)), /id='swaLg'[\s\S]*70 of 105 leagues on/);
});
