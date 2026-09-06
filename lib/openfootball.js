"use strict";
/**
 * openfootball match text -> rows.
 *
 * The format, by example:
 *
 *   2-3 (2-0)                        90 min 2-3, half time 2-0
 *   3-2 a.e.t. (3-0, 1-0)            90 min 3-0, half time 1-0   (3-2 after ET)
 *   0-1 a.e.t. (0-0)                 90 min 0-0, half time unknown
 *   4-3 pen. 1-1 a.e.t. (1-1, 0-1)   90 min 1-1, half time 0-1   (4-3 a shootout)
 *
 * THE RULE: when `a.e.t.` appears the parenthesised list is (90 minutes,
 * half time); otherwise it is (half time) and the bare pair is 90 minutes.
 * Any shootout pair is discarded.
 *
 * We take the 90-minute score because that is what the domestic model is
 * fitted on. Handing an extra-time or shootout score to the fit is not a
 * slightly wrong result, it is a match that never happened, and it would be
 * invisible in every check downstream.
 *
 * Anything that does not fit one of those four shapes is DROPPED and reported.
 * The corpus is worth less than its trustworthiness.
 *
 * Dates are deliberately not parsed. The fit works per season, and the season
 * comes from the filename, so a date carry-forward across "Tue Sep 16 2025"
 * and the bare "Wed Sep 17" that follows it would be risk with no buyer.
 */

/* "  18:45  Home Club (ESP)     v Away Club (ENG)         0-2 (0-0)" */
const LINE = /^\s*(?:\d{1,2}:\d{2}\s+)?(.+?)\s+v\s+(.+?)\s\s+(\d.*?)\s*$/;
const TAG = /^(.*?)\s*\(([A-Z]{3})\)$/;

function pairs(tail) {
  const re = /(\d+)-(\d+)/g;
  const out = [];
  let m;
  while ((m = re.exec(tail))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

function score(tail) {
  const all = pairs(tail);
  if (!all.length) return { why: "no score" };
  const pen = /pen\./i.test(tail);
  const aet = /a\.?e\.?t\.?/i.test(tail);
  let ft, ht;
  if (aet) {
    /* drop the shootout pair when there is one: [aet, ft90, ht?] */
    const rest = pen ? all.slice(1) : all;
    if (rest.length < 2) return { why: "extra time without a 90-minute score" };
    ft = rest[1];
    ht = rest[2] || null;
    if (rest[0][0] < ft[0] || rest[0][1] < ft[1])
      return { why: "extra time score is behind the 90-minute score" };
  } else {
    if (pen) return { why: "penalties without extra time" };
    ft = all[0];
    ht = all[1] || null;
  }
  if (ht && (ht[0] > ft[0] || ht[1] > ft[1]))
    return { why: "half-time score is ahead of the 90-minute score" };
  return { hg: ft[0], ag: ft[1], hth: ht ? ht[0] : null, hta: ht ? ht[1] : null,
           aet: aet, pen: pen };
}

function parse(text) {
  const rows = [], dropped = [];
  for (const raw of String(text == null ? "" : text).split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;                       /* headers, dates, blank lines */
    const h = TAG.exec(m[1].trim()), a = TAG.exec(m[2].trim());
    if (!h || !a) { dropped.push({ line: raw, why: "club without a country tag" }); continue; }
    const s = score(m[3]);
    if (s.why) { dropped.push({ line: raw, why: s.why }); continue; }
    rows.push({ home: h[1], homeCC: h[2], away: a[1], awayCC: a[2],
                hg: s.hg, ag: s.ag, hth: s.hth, hta: s.hta,
                aet: s.aet, pen: s.pen });
  }
  return { rows, dropped };
}

module.exports = { parse };
