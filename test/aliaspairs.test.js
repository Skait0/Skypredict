"use strict";
/* THE NAMES THE LIVE CONSOLE SAID WE WERE ONLY MATCHING BY LUCK.
 *
 * On 8 Sep 2026 the board paired 506 of 530 fixtures, and a long list of the
 * ones it did pair came through the line "[sporty] BY KICK-OFF: ...". That
 * prefix is the matcher saying the NAMES were not enough and the kick-off
 * times carried it: Ath Madrid against Atletico Madrid, FC Koln against
 * Cologne, M'gladbach against Monchengladbach, FCSB against Fotbal Club FCSB.
 *
 * Matching on the clock works until two fixtures share a slot, which is
 * exactly how the Barcelona SC bug happened - see sameSlot in index.html. So
 * every pair below has to agree on the NAME.
 *
 * A note on Monchengladbach, because it is the one that bites: SportyBet
 * spells it "Borussia M´gladbach" with an acute accent, Bet9ja spells it
 * "Monchengladbach", and we spell it "M'gladbach" with an apostrophe. Aliasing
 * our side to one of them broke the other, which is why all four spellings are
 * folded onto one canonical here and tested together.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const re = new RegExp("(?:^|\\n)((?:var|const|function)\\s+" + name + "\\b)", "m");
  const m = re.exec(src);
  assert.ok(m, "not found in index.html: " + name);
  const i = m.index + m[0].indexOf(m[1]);
  const isFn = m[1].startsWith("function");
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") { depth++; started = true; }
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (isFn && started && depth === 0 && c === "}") return src.slice(i, k + 1);
    } else if (c === ";" && depth === 0 && !isFn) return src.slice(i, k + 1);
  }
  assert.fail("could not find the end of " + name);
}

const M = new Function(
  ["TEAM_ALIASES", "normTeam", "normTeamRaw", "tokset", "teamMarkers",
   "sameVariant", "containsWords", "simTeams"].map(grab).join("\n") +
  "\nvar NT_CACHE=Object.create(null),NT_SIZE=0;const NT_MAX=20000;" +
  "\nreturn {normTeam:normTeam,simTeams:simTeams};")();

/* ours, theirs - every one reported by the live console as clock-matched. */
const PAIRS = [
  ["Ath Madrid", "Atletico Madrid"], ["Ath Madrid", "Atl. Madrid"],
  ["Sociedad", "Real Sociedad"], ["FC Koln", "Cologne"],
  ["Hamburg", "Hamburger SV"], ["Nurnberg", "1 FC Nuremberg"],
  ["FCSB", "Fotbal Club FCSB"], ["Sheffield Weds", "Sheffield Wednesday"],
  ["Ekenas", "EIF"],
  ["M'gladbach", "Monchengladbach"], ["M'gladbach", "Borussia M´gladbach"],
  ["M'gladbach", "Borussia Monchengladbach"],
];

test("the names match without help from the clock", () => {
  const weak = [];
  for (const [ours, theirs] of PAIRS) {
    if (M.normTeam(ours) !== M.normTeam(theirs)) {
      weak.push(`${ours} -> ${theirs} (${M.normTeam(ours)} | ${M.normTeam(theirs)})`);
    }
  }
  assert.deepStrictEqual(weak, [],
    "these fall back to matching on kick-off time, which is how a fixture gets " +
    "paired with the wrong one when two share a slot");
});

/* Prefix pairs. These never needed an alias - "Hannover" against "Hannover 96"
   scores 1.80 on its own - but they are listed so that a change to normTeam or
   to the marker list cannot quietly drop them below the 1.2 bar. */
const FUZZY = [
  ["Hannover", "Hannover 96"], ["Petrolul", "FC Petrolul Ploiesti"],
  ["Wigan", "Wigan Athletic"],
];

test("the prefix pairs stay well clear of the threshold", () => {
  for (const [ours, theirs] of FUZZY) {
    const s = M.simTeams(ours, theirs);
    assert.ok(s >= 1.2, `${ours} -> ${theirs} scores ${s.toFixed(2)}, under the 1.2 bar`);
  }
});

test("an alias never folds two different clubs together", () => {
  /* The failure an alias table exists to avoid is the one it can also cause.
     Reserve and B sides are the usual casualties. */
  const distinct = [
    ["Atletico Madrid", "Athletic Bilbao"],
    ["Hamburg", "Hamburger SV II"],
    ["Cologne", "Koln II"],
    ["Monchengladbach", "Borussia Dortmund"],
    ["Real Sociedad", "Real Sociedad B"],
  ];
  for (const [a, b] of distinct) {
    assert.notStrictEqual(M.normTeam(a), M.normTeam(b),
      a + " and " + b + " now normalise to the same club");
  }
});
