"use strict";
/* ONE LEG, SETTLED FROM A RESULTS ROW, FOR THE SERVER (owner, 13 Oct 2026: "when
 * there are thousands of tickets that have played legs we cant grade, how do we
 * grade that?").
 *
 * The page has graded every market our builder books since September (gradeLeg in
 * public/index.html): goals, results, combinations, handicaps, "3 in a row", and
 * corners and shots off the counts lib/statsfill.js fills from API-Football. The
 * slip ledger only knew goal markets, so a board slip with a corners leg landed in
 * "check" for a person to settle by hand. This is the page's grader, word for word
 * (test/legrade.test.js holds the two to the same answers), plus the two markets
 * the page cannot settle and the server now can: a goal in the first half and win
 * either half, off the half-time score API-Football gives with every result.
 *
 * gradeLeg(code, row) -> true (won), false (lost), 0.5 (push: the stake comes
 * back), or null (cannot be known from this row, yet or ever). Null is never a
 * miss. `row` is a results row: hg, ag, and where filled hc/ac (corners),
 * hsh/ash (shots), seq (goal order), hth/hta (half-time score).
 */

function nr3Grade(hg, ag, w, seq) {
  if (typeof hg !== "number" || typeof ag !== "number") return null;
  const h = w !== "a", a = w !== "h";
  const hYes = hg >= 3 && ag === 0, aYes = ag >= 3 && hg === 0;
  if ((h && hYes) || (a && aYes)) return false;
  if ((!h || hg <= 2) && (!a || ag <= 2)) return true;
  if (typeof seq === "string" && /^[HA]*$/.test(seq) && seq.length === hg + ag &&
      (seq.match(/H/g) || []).length === hg) {
    const runH = /HHH/.test(seq), runA = /AAA/.test(seq);
    return !((h && runH) || (a && runA));
  }
  return null;
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null));
const cnt = (v) => { const n = num(v); return n != null && n >= 0 ? n : null; };

/* The page's gradeLeg(f, c, hg, ag, st), with the row standing in for hg/ag/st. */
function fromScore(c, hg, ag, st) {
  const d = hg - ag, tot = hg + ag, both = hg > 0 && ag > 0;
  switch (c) {
    case "1": return d > 0;
    case "2": return d < 0;
    case "X": return d === 0;
    case "1X": return d >= 0;
    case "X2": return d <= 0;
    case "12": return d !== 0;
    case "GG": return both;
    case "OVER_1.5": return tot > 1.5;
    case "OVER_2.5": return tot > 2.5;
    case "OVER_3.5": return tot > 3.5;
    case "HOME_OVER_0.5": return hg > 0.5;
    case "HOME_OVER_1.5": return hg > 1.5;
    case "AWAY_OVER_0.5": return ag > 0.5;
    case "AWAY_OVER_1.5": return ag > 1.5;
    case "MIX_X_OV_1.5": return d === 0 || tot > 1.5;
    case "MIX_1_OV_1.5": return d > 0 || tot > 1.5;
    case "MIX_2_OV_1.5": return d < 0 || tot > 1.5;
    case "MIX_X_OV_2.5": return d === 0 || tot > 2.5;
    case "MIX_1_OV_2.5": return d > 0 || tot > 2.5;
    case "MIX_2_OV_2.5": return d < 0 || tot > 2.5;
    case "MIXGG_X": return d === 0 || both;
    case "MIXGG_1": return d > 0 || both;
    case "MIXGG_2": return d < 0 || both;
    case "UNDER_1.5": return tot < 1.5;
    case "UNDER_2.5": return tot < 2.5;
    case "UNDER_3.5": return tot < 3.5;
    case "UNDER_4.5": return tot < 4.5;
    case "OVER_0.5": return tot > 0.5;
    case "NR3_ANY": return nr3Grade(hg, ag, "any", st && st.seq);
    case "NR3_H": return nr3Grade(hg, ag, "h", st && st.seq);
    case "NR3_A": return nr3Grade(hg, ag, "a", st && st.seq);
    case "NG": return !both;
    case "HOME_UNDER_0.5": return hg < 0.5;
    case "HOME_UNDER_1.5": return hg < 1.5;
    case "AWAY_UNDER_0.5": return ag < 0.5;
    case "AWAY_UNDER_1.5": return ag < 1.5;
    case "MIX_1_UN_2.5": return d > 0 || tot < 2.5;
    case "MIX_2_UN_2.5": return d < 0 || tot < 2.5;
    case "MIX_X_UN_2.5": return d === 0 || tot < 2.5;
    case "MIXNG_1": return d > 0 || !both;
    case "MIXNG_2": return d < 0 || !both;
    case "MIXNG_X": return d === 0 || !both;
  }
  const ah = /^(?:AH_([12])_(-?[\d.]+)|DNB_([12]))$/.exec(c || "");
  if (ah) {
    const side = ah[1] || ah[3], n = ah[1] ? parseFloat(ah[2]) : 0;
    if (!isFinite(n) || Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) return null;
    let m = d + n; if (side === "2") m = -m;
    return m > 0 ? true : (m === 0 ? 0.5 : false);
  }
  const ck = /^CORNERS_(?:([HA])_)?(OV|UN)_([\d.]+)$/.exec(c || ""), sk = /^SHOTS_(?:([HA])_)?(OV|UN)_([\d.]+)$/.exec(c || "");
  if (ck || sk) {
    if (!st) return null;
    let n, ln, ov;
    if (ck) {
      const chn = cnt(st.hc), can = cnt(st.ac);
      if (chn == null || can == null) return null;
      n = ck[1] === "H" ? chn : (ck[1] === "A" ? can : chn + can); ln = parseFloat(ck[3]); ov = ck[2] === "OV";
    } else {
      const shn = cnt(st.hsh), san = cnt(st.ash);
      if (shn == null || san == null) return null;
      n = sk[1] === "H" ? shn : (sk[1] === "A" ? san : shn + san); ln = parseFloat(sk[3]); ov = sk[2] === "OV";
    }
    if (!isFinite(ln) || Math.abs(ln - Math.round(ln)) < 1e-9) return null;
    return ov ? n > ln : n < ln;
  }
  return null;
}

/* What the page cannot settle and the server can: the half-time score. */
function fromHalf(c, hg, ag, row) {
  const wh = /^WINHALF_([HA])_([YN])$/.exec(c || "");
  if (c !== "FH_OVER_0.5" && !wh) return undefined;   /* not a half market */
  const hth = cnt(row.hth), hta = cnt(row.hta);
  if (hth == null || hta == null || hth > hg || hta > ag) return null;   /* no score, or one that cannot be this match's */
  if (c === "FH_OVER_0.5") return hth + hta > 0.5;
  {
    const sh = hg - hth, sa = ag - hta;
    const won = wh[1] === "H" ? (hth > hta || sh > sa) : (hta > hth || sa > sh);
    return wh[2] === "Y" ? won : !won;
  }
}

function gradeLeg(code, row) {
  if (!row) return null;
  const hg = num(row.hg), ag = num(row.ag);
  if (hg == null || ag == null) return null;
  const c = String(code || "");
  const half = fromHalf(c, hg, ag, row);
  if (half !== undefined) return half;
  return fromScore(c, hg, ag, row);
}

module.exports = { gradeLeg, nr3Grade };
