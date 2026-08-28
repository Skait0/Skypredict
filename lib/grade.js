"use strict";

/**
 * Grade one published tip against a final score.
 *
 * There are two graders in this project and they disagreed. lib/model.js's
 * gradeTip decides the record at build time and is careful. The page's tipEval
 * decides what a live card says - and ended every unrecognised label on a
 * guess:
 *
 *     return res(tot >= 2);
 *
 * which quietly graded "Over 2.5" as landed on a 1-1, and inverted "Under 2.5"
 * outright: 0-0 read as a miss, 3-0 as a hit. That was display-only until the
 * full-time ledger started writing tipEval's verdict down as a permanent
 * result, at which point a wrong grade stops being a wrong badge and becomes a
 * wrong row in the record the site's accuracy claim rests on.
 *
 * So: one grader, shared, that never guesses. An unrecognised label returns
 * null rather than a coin flip, and a market we cannot settle from a final
 * score - a first-half line, with no half-time score to hand - returns null
 * too. Callers must treat null as "not graded", never as a miss.
 *
 * Returns true (landed), false (missed), or null (cannot be known).
 */
function gradeLabel(label, hg, ag, half) {
  if (label == null) return null;
  const t = String(label).trim();
  if (typeof hg !== "number" || typeof ag !== "number") return null;
  if (!isFinite(hg) || !isFinite(ag)) return null;

  const diff = hg - ag, tot = hg + ag, both = hg > 0 && ag > 0;

  if (t === "Home win") return diff > 0;
  if (t === "Away win") return diff < 0;
  if (t === "Draw") return diff === 0;
  if (t === "Both teams score") return both;

  /* A first-half market cannot be settled from a full-time score. The live
     feed carries no half-time score, so this is genuinely unknowable rather
     than something to approximate from the total - which is what the old
     grader did, calling any game with a goal in it a win. */
  if (/^First half goal/i.test(t)) {
    if (!half || half.hth == null || half.hta == null) return null;
    return (half.hth + half.hta) > 0;
  }

  // Double chance. Matched on prefix: the labels carry a trailing gloss
  // ("X2, draw or away").
  if (t.indexOf("1X") === 0) return diff >= 0;
  if (t.indexOf("X2") === 0) return diff <= 0;
  if (t.indexOf("12") === 0) return diff !== 0;

  // Combination markets, before the plain goal lines so "Draw or over 2.5"
  // is not read as an over.
  let m = /^Draw or over\s*([\d.]+)/i.exec(t);
  if (m) return diff === 0 || tot > parseFloat(m[1]);
  if (/^Draw or both/i.test(t)) return diff === 0 || both;
  m = /^Both score and over\s*([\d.]+)/i.exec(t);
  if (m) return both && tot > parseFloat(m[1]);

  // Plain goal lines, at whatever line the label names.
  m = /^Over\s*([\d.]+)/i.exec(t);
  if (m) return tot > parseFloat(m[1]);
  m = /^Under\s*([\d.]+)/i.exec(t);
  if (m) return tot < parseFloat(m[1]);

  return null;
}

/**
 * The market a tip belongs to, for reporting accuracy by market rather than as
 * one blended number.
 *
 * One headline percentage hides the mix, and the mix moves: adding Over 1.5 to
 * the graded set lifted the overall figure without the model getting any
 * better, because Over 1.5 lands more often than a double chance does. Broken
 * out, that is visible instead of flattering - and it is the more useful shape
 * for a reader deciding which of our calls to trust.
 *
 * Goal lines keep their own line ("Over 1.5" is a different bet from
 * "Over 2.5"); everything else groups by family.
 */
function marketOf(label) {
  if (label == null) return "Other";
  const t = String(label).trim();
  if (t === "Home win" || t === "Away win" || t === "Draw") return "Match result";
  if (t === "Both teams score") return "Both to score";
  if (/^First half goal/i.test(t)) return "First-half goal";
  if (t.indexOf("1X") === 0 || t.indexOf("X2") === 0 || t.indexOf("12") === 0)
    return "Double chance";
  if (/^Draw or /i.test(t) || /^Both score and /i.test(t)) return "Combo";
  let m = /^Over\s*([\d.]+)/i.exec(t);
  if (m) return "Over " + m[1];
  m = /^Under\s*([\d.]+)/i.exec(t);
  if (m) return "Under " + m[1];
  return "Other";
}

module.exports = { gradeLabel, marketOf };
