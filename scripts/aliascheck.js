"use strict";
/**
 * Does the shipped matcher pair these two names, and how?
 *
 *   node scripts/aliascheck.js "Ath Madrid" "Atletico Madrid" ...
 *
 * Every pair on the command line, or the built-in list of the ones the live
 * console reported. Reads normTeam/simTeams out of public/index.html the same
 * way scripts/b9match.js and scripts/mkcode.js do, so this measures the matcher
 * that ships rather than an idea of it.
 *
 * EXACT means the two names normalise to the same string and the pair is taken
 * before the clock is even consulted. Anything else is the fuzzy pass, and a
 * fuzzy pass that only clears the bar because the kick-off times agree is the
 * shape of the Barcelona SC bug - see sameSlot in index.html.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function grab(name) {
  const re = new RegExp("(?:^|\\n)((?:var|const|function)\\s+" + name + "\\b)", "m");
  const m = re.exec(src);
  if (!m) throw new Error("not found in index.html: " + name);
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
  throw new Error("could not find the end of " + name);
}

const NAMES = ["TEAM_ALIASES", "normTeam", "normTeamRaw", "tokset", "teamMarkers",
               "sameVariant", "containsWords", "simTeams"];
const M = new Function(
  NAMES.map(grab).join("\n") +
  "\nvar NT_CACHE=Object.create(null),NT_SIZE=0;const NT_MAX=20000;" +
  "\nreturn {normTeam:normTeam,simTeams:simTeams};")();

/* Reported by the live console on 8 Sep 2026. Each was paired only because the
   kick-off times agreed - the names alone were not enough. */
const PAIRS = [
  ["Ath Madrid", "Atletico Madrid"],
  ["Ath Madrid", "Atl. Madrid"],
  ["Sociedad", "Real Sociedad"],
  ["FC Koln", "Cologne"],
  ["Hamburg", "Hamburger SV"],
  ["Nurnberg", "1 FC Nuremberg"],
  ["Hannover", "Hannover 96"],
  ["FCSB", "Fotbal Club FCSB"],
  ["Petrolul", "FC Petrolul Ploiesti"],
  ["Sheffield Weds", "Sheffield Wednesday"],
  ["Wigan", "Wigan Athletic"],
  ["M'gladbach", "Monchengladbach"],
  ["Ekenas", "EIF"],
];

const args = process.argv.slice(2);
const pairs = args.length >= 2
  ? args.reduce((a, v, i) => (i % 2 ? a : a.concat([[v, args[i + 1]]])), []).filter((p) => p[1])
  : PAIRS;

let exact = 0, fuzzy = 0, weak = 0;
for (const [ours, theirs] of pairs) {
  const a = M.normTeam(ours), b = M.normTeam(theirs);
  const sim = M.simTeams(ours, theirs);
  const verdict = a === b ? "EXACT" : sim >= 0.6 ? "fuzzy" : "TOO WEAK";
  if (a === b) exact++; else if (sim >= 0.6) fuzzy++; else weak++;
  console.log(
    verdict.padEnd(9) + String(sim.toFixed(2)).padStart(5) + "  " +
    (ours + "  ->  " + theirs).padEnd(46) + a + (a === b ? "" : "  |  " + b));
}
console.log(`\n${exact} exact, ${fuzzy} fuzzy, ${weak} too weak of ${pairs.length}`);
if (weak) process.exitCode = 1;
