"use strict";
/**
 * Thirty leagues gained three seasons of history, and it arrived spelled
 * differently.
 *
 * scripts/apifbackfill.js pulls 2023-24 and 2024-25 for every league in
 * HARVEST_EXTRA from API-Football. Those leagues hold no ratings, so
 * liveresults.resolve mints any club it cannot place - and the SoccerVista
 * harvest had already minted them, in September, under other spellings:
 * Din. Zagreb against Dinamo Zagreb, Lok. Plovdiv against Lokomotiv Plovdiv.
 * Merged as they stood, each became two clubs with half a history.
 *
 * So the aliases are the load-bearing part of that backfill, and the two
 * traps found while writing them are what this file guards:
 *
 *   1. TEAM_ALIAS_SRC is keyed on the NAME, with no league beside it. The
 *      pairing pass proposed "Arsenal" -> "Arsenal Dzerzhinsk" off the
 *      Belarusian top flight, which would have moved Arsenal of London.
 *   2. Puskas Akademia carry a variant word in their own name and were being
 *      refused as a youth side - 66 of Hungary's 396 matches, and every
 *      Hungarian fixture involving them on the live board.
 */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");

const alias = (name) => M.TEAM_ALIAS[M.normName(name)] || null;

test("the API-Football spellings resolve onto the names already on the board", () => {
  const pairs = [
    ["Dinamo Zagreb", "Din. Zagreb"],
    ["Lokomotiv Plovdiv", "Lok. Plovdiv"],
    ["Lokomotiv Sofia", "Lok. Sofia"],
    ["Dunajska Streda", "Dun. Streda"],
    ["Slavia Praha", "Slavia Prague"],
    ["Sparta Praha", "Sparta Prague"],
    ["Ferencvarosi TC", "Ferencvaros"],
    ["Qarabag", "Qarabag Agdam"],
  ];
  for (const [from, to] of pairs) {
    assert.equal(alias(from), M.normName(to),
      `${from} no longer resolves to ${to} - it would be minted as a second club`);
  }
});

test("a name another country's club also owns is never aliased", () => {
  /* The three the pairing pass proposed and the table refuses. Arsenal is the
     one that shows why: the alias has no league on it, so it would apply to
     every Arsenal on every board we publish. */
  for (const name of ["Arsenal", "Aris", "AEL"]) {
    assert.equal(alias(name), null,
      `"${name}" is aliased, and that name belongs to more than one club`);
  }
});

test("Puskas Akademia is a first team, not an academy side", () => {
  assert.equal(M.isVariantSide("Puskas Academy"), false);
  assert.equal(M.isVariantSide("Puskás Akadémia"), false);
  assert.equal(M.isVariantSide("Puskas Akademia"), false);
});

test("the exemption does not open the guard it sits in", () => {
  /* The whole reason the guard exists: a youth game booked off a first-team
     prediction. The exemption matches the full normalised name, so a youth
     side carrying the same club name is still refused. */
  for (const bad of ["Puskas Akademia U19", "Puskas Academy II", "Puskas Akademia Women",
                     "Jong Ajax", "Fenerbahce Akademi U19", "Besiktas W"]) {
    assert.equal(M.isVariantSide(bad), true, `${bad} is being taken for a first team`);
  }
});
