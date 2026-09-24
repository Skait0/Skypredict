"use strict";
/* RESERVE SIDES AS CLUBS OF THEIR OWN - and never as their first team.
 *
 * Jong Ajax, Barcelona B and Stuttgart II play full seasons in senior leagues.
 * They used to be refused outright, which lost 140 of the Eerste Divisie's 380
 * games a season. They are rated now, as themselves. The one failure that
 * must stay impossible is the one the refusal existed for: a reserve game
 * priced off the first team. */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");
const L = require("../lib/liveresults.js");

const D = new Date("2024-03-01T00:00:00Z");
const m = (league, home, away) => ({ date: D, league, home, away, hg: 1, ag: 0 });
const ERE = "Netherlands Eredivisie", EER = "Netherlands Eerste Divisie";
const PF = "Spain Primera Federacion", LL = "Spain La Liga 1", BG = "Bulgaria Vtora Liga";

const idx = M.buildIndex([
  m(ERE, "Ajax", "PSV Eindhoven"), m(ERE, "AZ Alkmaar", "Utrecht"),
  m(EER, "Jong Ajax", "Cambuur"), m(EER, "Jong PSV U21", "Willem II"),
  m(LL, "Real Madrid", "Ath Madrid"),
  m(PF, "Real Madrid II", "Atlético Madrid II"), m(PF, "Alcorcon", "Barcelona B"),
  m(BG, "Ludogorets II", "CSKA Sofia II"), m(BG, "CSKA 1948 Sofia II", "Sportist Svoge"),
]);
const li = (l) => idx.lIdx[l];

test("a reserve side resolves to itself, whatever the feed calls it", () => {
  assert.equal(M.matchTeam(idx, "Jong Ajax", li(EER)), "Jong Ajax");
  assert.equal(M.matchTeam(idx, "Jong PSV", li(EER)), "Jong PSV U21");
  assert.equal(M.matchTeam(idx, "Atletico Madrid B", li(PF)), "Atlético Madrid II");
  assert.equal(M.matchTeam(idx, "Real Madrid Castilla", li(PF)), "Real Madrid II");
  assert.equal(M.matchTeam(idx, "PFC Ludogorets Razgrad II", li(BG)), "Ludogorets II");
  assert.equal(M.matchTeam(idx, "PFC CSKA SOFIA II", li(BG)), "CSKA Sofia II");
});

test("a reserve side never becomes its first team", () => {
  /* In the first team's own league there is no reserve side to land on, and
     the fuzzy pass that would have reached Ajax is never run for it. */
  assert.equal(M.matchTeam(idx, "Jong Ajax", li(ERE)), null);
  assert.equal(M.matchTeam(idx, "Real Madrid Castilla", li(LL)), null);
  assert.equal(M.matchTeam(idx, "Atletico Madrid B", li(LL)), null);
  /* And never by spelling across the whole index, which is how a cup tie is
     placed - only its exact name finds it there, and that name is itself. */
  assert.equal(M.matchTeam(idx, "Jong AFC Ajax", null), null);
  assert.equal(M.matchTeam(idx, "Jong Ajax", null), "Jong Ajax");
});

test("the first team is untouched by its reserve side", () => {
  assert.equal(M.matchTeam(idx, "AFC Ajax", li(ERE)), "Ajax");
  assert.equal(M.matchTeam(idx, "Ajax", null), "Ajax");
  assert.equal(M.matchTeam(idx, "Willem II Tilburg", li(EER)), "Willem II");
});

test("youth and women's sides are still refused", () => {
  for (const n of ["Ajax U19", "Jong Ajax U19", "Ajax Women", "Ajax W", "Ajax Youth"]) {
    assert.equal(M.matchTeam(idx, n, li(EER)), null, n);
    assert.equal(M.reserveBase(n), null, n);
  }
});

test("two reserve sides of one parent's name do not pick one at random", () => {
  /* CSKA Sofia II and CSKA 1948 Sofia II are two clubs; a bare "CSKA II"
     could be either, so it is neither. */
  assert.equal(M.matchTeam(idx, "CSKA II", li(BG)), null);
});

test("a reserve side is minted only in a league where reserves are members", () => {
  const boot = new Set([EER, "Denmark 1. Division"]);
  const allowed = new Set([EER, "Denmark 1. Division"]);
  const rows = [
    { league: EER, home: "Jong Utrecht", away: "Cambuur", hg: 2, ag: 1 },
    { league: EER, home: "Utrecht U19", away: "Cambuur", hg: 0, ag: 0 },
    { league: "Denmark 1. Division", home: "Hvidovre", away: "Brondby II", hg: 1, ag: 1 },
  ];
  const out = L.resolve(rows, idx, allowed, "2024-03-01", boot);
  assert.deepEqual(out.matches.map((x) => x.home + " v " + x.away), ["Jong Utrecht v Cambuur"]);
  assert.equal(out.dropped.club, 2);
});
