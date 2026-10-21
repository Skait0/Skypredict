"use strict";
/* 21 Oct 2026: a UEFA Youth League leg ("Bayern Munich v Arsenal FC") was rated by the Wizard's Eye
   with the senior game's numbers, and the converter would pair it with the senior game on another
   book (their events carry no league). Both now refuse a youth, reserve or women's competition. */
const test = require("node:test");
const assert = require("node:assert");
const D = require("../lib/doctor.js");
const C = require("../lib/convert.js");
const { youthComp } = require("../lib/youthcomp.js");

const ko = Date.UTC(2026, 9, 21, 19, 0);
const senior = { home: "Bayern Munich", away: "Arsenal", kickoff: new Date(ko).toISOString(), league: "UEFA Champions League" };
const leg = (league) => ({ home: "Bayern Munich", away: "Arsenal FC", kickoff: ko, league, prediction: "OVER_2.5", odds: 1.5 });

test("youthComp reads youth, reserve and women's competitions, not senior ones", () => {
  assert.ok(youthComp("International Youth UEFA Youth League"));
  assert.ok(youthComp("Scotland Premier League, Women"));
  assert.ok(youthComp("Brazil U20 Copa do Brasil"));
  assert.ok(!youthComp("International Clubs UEFA Champions League"));
  assert.ok(!youthComp("England League One"));
});

test("the Wizard's Eye never rates a Youth League leg with the senior game's numbers", () => {
  const f = Object.assign({}, senior, { probs: {} });
  const ex = D.examine([leg("International Youth UEFA Youth League")], [f]);
  assert.strictEqual(ex.rows.length, 0);
  assert.strictEqual(ex.unpriced[0].why, "not on our board");
});

test("the converter refuses a Youth League leg instead of pairing it with the senior game", () => {
  const evs = [{ id: "e1", home: "Bayern Munich", away: "Arsenal", ko, odds: {} }];
  const youth = C.plan([leg("International Youth UEFA Youth League")], "bet9ja", evs, ko - 3600e3);
  assert.strictEqual(youth.picks.length, 0);
  assert.match(youth.stuck[0].why, /youth or women's/);
  const sen = C.plan([leg("International Clubs UEFA Champions League")], "bet9ja", evs, ko - 3600e3);
  assert.strictEqual(sen.picks.length, 1, "the senior game still crosses");
});
