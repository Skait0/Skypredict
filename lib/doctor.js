"use strict";
/* THE CODE DOCTOR: a booking code in, our model's read on every leg out.
 *
 * Pure - no network - so the Telegram webhook (api/tg.js) and the tests share
 * one implementation. Legs come from the upstream reader (/api/slip shape:
 * {home, away, kickoff, prediction, odds}); fixtures are predictions.json's.
 *
 * Matching is by team names and kickoff, not by bookmaker event id:
 * predictions.json carries no book ids. Names are normalised the way the
 * X replies were matched on 24 Sep (16 of 17 legs found on a real code).
 */

const ORACLE = require("./oracle.js");
const BOOK_NAMES = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa" };

/* Our probability for a market, read off a predictions.json fixture. Every
   field is a fraction. Unders and "no" are the complement of the line we
   price. The MIX pairs are the site's "X or Y" markets. */
const FIELD = {
  "1": "home_p", "X": "draw_p", "2": "away_p",
  "1X": "dc1x", "12": "dc12", "X2": "dcx2",
  "OVER_1.5": "o15", "OVER_2.5": "o25", "OVER_3.5": "o35",
  "GG": "btts", "FH_OVER_0.5": "fh_o05",
  "HOME_OVER_0.5": "h_o05", "HOME_OVER_1.5": "h_o15",
  "AWAY_OVER_0.5": "a_o05", "AWAY_OVER_1.5": "a_o15",
  "MIX_1_OV_1.5": "home_o15", "MIX_2_OV_1.5": "away_o15", "MIX_X_OV_1.5": "draw_o15",
  "MIX_1_OV_2.5": "home_o25", "MIX_2_OV_2.5": "away_o25", "MIX_X_OV_2.5": "draw_o25",
  "MIXGG_1": "home_btts", "MIXGG_2": "away_btts", "MIXGG_X": "draw_btts",
};
const COMPLEMENT = { "UNDER_1.5": "o15", "UNDER_2.5": "o25", "UNDER_3.5": "o35", "NG": "btts" };

function probOf(f, code) {
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  if (FIELD[code]) return num(f[FIELD[code]]);
  if (COMPLEMENT[code]) { const v = num(f[COMPLEMENT[code]]); return v == null ? null : 1 - v; }
  return null;
}

/* "Portugal over 1.5", not "HOME_OVER_1.5". */
function label(leg) {
  const h = leg.home || "Home", a = leg.away || "Away", c = leg.prediction;
  const L = {
    "1": h + " to win", "2": a + " to win", "X": "Draw",
    "1X": h + " or draw", "X2": a + " or draw", "12": "Either team to win",
    "GG": "Both teams to score", "NG": "Not both to score", "FH_OVER_0.5": "Goal in the 1st half",
    "HOME_OVER_0.5": h + " to score", "AWAY_OVER_0.5": a + " to score",
    "HOME_OVER_1.5": h + " over 1.5", "AWAY_OVER_1.5": a + " over 1.5",
    "MIX_1_OV_1.5": h + " or over 1.5", "MIX_2_OV_1.5": a + " or over 1.5", "MIX_X_OV_1.5": "Draw or over 1.5",
    "MIX_1_OV_2.5": h + " or over 2.5", "MIX_2_OV_2.5": a + " or over 2.5", "MIX_X_OV_2.5": "Draw or over 2.5",
    "MIXGG_1": h + " or both score", "MIXGG_2": a + " or both score", "MIXGG_X": "Draw or both score",
  };
  if (L[c]) return L[c];
  const m = /^(OVER|UNDER)_(\d\.5)$/.exec(c || "");
  if (m) return (m[1] === "OVER" ? "Over " : "Under ") + m[2] + " goals";
  return String(c || "a market");
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\bturkiye\b/, "turkey").replace(/\bir iran\b/, "iran").replace(/\bczechia\b/, "czech republic")
    .replace(/[^a-z]/g, "");
}

/* Exact names first. Then the results matcher (lib/oracle.js), which already
   solves "our short name vs a book's full one" - Inverness C for Inverness
   Caledonian Thistle FC, Morton for Greenock Morton FC - and keeps reserve and
   youth sides apart. Fuzzy only inside the kickoff window, and only when one
   fixture answers: a guess would put our number on somebody else's game.
   Found on 24 Sep: our own daily code read as "0 we can read" because every
   leg was a Scottish club spelt the long way. */
function findFixture(fixtures, leg) {
  const ko = Number(leg.kickoff) || Date.parse(leg.kickoff || "");
  const h = norm(leg.home), a = norm(leg.away);
  if (!h || !a) return null;
  const near = (f) => !ko || !f.kickoff || Math.abs(Date.parse(f.kickoff) - ko) < 3 * 3600e3;
  const exact = fixtures.find((f) => norm(f.home) === h && norm(f.away) === a && near(f));
  if (exact || !ko) return exact || null;
  const fuzzy = fixtures.filter((f) => f.kickoff && near(f) &&
    ORACLE.sameVariant(f.home, leg.home) && ORACLE.sameVariant(f.away, leg.away) &&
    ORACLE.similarity(f.home, leg.home) >= 1 && ORACLE.similarity(f.away, leg.away) >= 1);
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

/* Everything the reply needs, as data. */
function examine(legs, fixtures) {
  const rows = [], unpriced = [];
  for (let leg of legs || []) {
    if (!leg || !leg.prediction) { unpriced.push({ leg, why: "no market" }); continue; }
    const f = findFixture(fixtures || [], leg);
    const p = f ? probOf(f, leg.prediction) : null;
    if (p == null) { unpriced.push({ leg, why: f ? "market we do not price" : "not on our board" }); continue; }
    const implied = leg.odds > 1 ? 1 / leg.odds : null;
    /* Our board's names, not the book's: "Inverness C or draw" reads better
       on a phone than "Inverness Caledonian Thistle FC or draw". */
    leg = Object.assign({}, leg, { home: f.home || leg.home, away: f.away || leg.away });
    const name = label(leg);
    /* "Draw" or "Over 2.5 goals" alone does not say which game. */
    const bare = !(leg.home && name.includes(leg.home)) && !(leg.away && name.includes(leg.away));
    rows.push({ leg, p, implied, name: bare ? name + " (" + (leg.home || "") + " v " + (leg.away || "") + ")" : name });
  }
  rows.sort((x, y) => y.p - x.p);
  const all = rows.length ? rows.reduce((t, r) => t * r.p, 1) : null;
  return { rows, unpriced, total: (legs || []).length, allPriced: rows.length > 0 && !unpriced.length, all };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pc = (p) => Math.round(p * 100) + "%";

/* Telegram HTML. Short on a phone: top three, bottom three, and the one line
   that says what the whole slip's chance is, when we can say it honestly. */
function reply(book, code, legs, fixtures, site) {
  const ex = examine(legs, fixtures);
  const B = BOOK_NAMES[book] || book;
  const out = ["🩺 <b>Code doctor</b> · " + esc(B) + " <code>" + esc(code) + "</code>",
    ex.total + " game" + (ex.total === 1 ? "" : "s") + " · " + ex.rows.length + " we can read"];
  if (!ex.rows.length) {
    out.push("", "None of these games are on our board, so the model has nothing to say about them.");
  } else {
    /* Never the same leg in both lists: on a five-leg slip the top three and
       the bottom three share one. Strongest takes up to half. */
    const nTop = Math.min(3, Math.ceil(ex.rows.length / 2));
    const top = ex.rows.slice(0, nTop);
    const low = ex.rows.slice(nTop).slice(-3).reverse();
    out.push("", "💪 <b>Strongest</b>");
    for (const r of top) out.push(esc(r.name) + " · <b>" + pc(r.p) + "</b>");
    if (low.length) {
      out.push("", "⚠️ <b>Weakest</b>");
      for (const r of low) {
        const cheap = r.implied && r.p < r.implied - 0.05;
        out.push(esc(r.name) + " · <b>" + pc(r.p) + "</b>" +
          (cheap ? " - the odds price it at " + pc(r.implied) : ""));
      }
    }
    if (ex.allPriced && ex.all != null) {
      out.push("", "🎯 Chance all " + ex.total + " land, by our model: <b>" +
        (ex.all < 0.01 ? "under 1%" : pc(ex.all)) + "</b>");
    }
  }
  if (ex.unpriced.length) out.push("", "❓ " + ex.unpriced.length + " we can't read (not on our board, or a market we don't price).");
  const link = site + "/?book=" + encodeURIComponent(book) + "&code=" + encodeURIComponent(code);
  out.push("", "🔁 <a href=\"" + esc(link + "&go=convert") + "\">Convert to another bookie</a> · " +
    "<a href=\"" + esc(link + "&go=safer") + "\">Make it safer</a>",
    "", "<i>Estimates, not certainties. 18+</i>");
  return out.join("\n");
}

/* A code, and the book if the message names one. */
function parse(text) {
  const t = String(text || "");
  const book = /bet ?9ja/i.test(t) ? "bet9ja" : /betking/i.test(t) ? "betking" :
    /betpawa/i.test(t) ? "betpawa" : /sporty/i.test(t) ? "sporty" : null;
  const words = t.replace(/https?:\/\/\S+/g, (u) => {
    const m = /(?:shareCode|bookABetCode|code)=([A-Za-z0-9]{4,16})/i.exec(u); return m ? " " + m[1] + " " : " ";
  }).split(/[^A-Za-z0-9]+/);
  const NOT = /^(sporty|sportybet|bet9ja|betking|betpawa|code|booking|please|check|this|what|help|start)$/i;
  /* Codes are 5-12 letters and digits, often with no digit at all (RQWKNC).
     Prefer what looks like one - typed in capitals, or carrying a digit -
     over an ordinary word of the same length. */
  const cand = words.filter((w) => /^[A-Za-z0-9]{5,12}$/.test(w) && !NOT.test(w));
  const code = cand.find((w) => /^[A-Z0-9]+$/.test(w) || /\d/.test(w)) || (cand.length === 1 ? cand[0] : null);
  return { code: code && code.toUpperCase(), book };
}

module.exports = { examine, reply, parse, probOf, label, findFixture, BOOK_NAMES };
