"use strict";
/* TODAY AT A GLANCE (owner, 18 Oct 2026: "start win approvals and today at a glance").
 * One admin card with the day in numbers: our picks, the ladder, codes, accounts,
 * payments, wins waiting for the owner's OK and the Buffer queues. Pure: api/account.js
 * (action "today") gathers the inputs. */
const WIN = require("./winpost.js");
const L = require("./ladder.js");

function tipsOn(results, day) {
  const rows = (results || []).filter((r) => r && r.match_date === day && r.source !== "sweep" && typeof r.hit === "boolean");
  return { n: rows.length, hit: rows.filter((r) => r.hit).length };
}

function glance(x) {
  const { day, yesterday, dayOf } = x, st = x.stats || {};
  const hits = x.hits || [], posts = x.posts || [];
  const postedIds = new Set(posts.map((p) => String(p.key).split("|")[1]));
  const wins = hits.filter((h) => h.status === "landed" && WIN.rankOf(WIN.paid(h).odds));
  const pays = (x.payments || []).filter((p) => p && p.paid_at && dayOf(Date.parse(p.paid_at)) === day);
  return {
    day,
    tips: { today: tipsOn(x.results, day), yesterday: tipsOn(x.results, yesterday) },
    ladder: (x.ladder || []).map((r) => ({ rung: r.rung, state: L.rungState(r, x.results || []), games: (r.legs || []).length }))
      .sort((a, b) => a.rung - b.rung),
    codes: st.codesToday == null ? null : st.codesToday,
    signups: st.signupsToday == null ? null : st.signupsToday,
    active: st.activeToday == null ? null : st.activeToday,
    payments: { n: pays.length, naira: Math.round(pays.reduce((s, p) => s + (Number(p.amount_kobo) || 0), 0) / 100) },
    wins: {
      today: wins.filter((h) => h.settled_at && dayOf(Date.parse(h.settled_at)) === day).length,
      waiting: wins.filter((h) => !postedIds.has(String(h.id))).map((h) => ({ id: h.id, odds: WIN.paid(h).odds })),
    },
    buffer: x.buffer || null,
  };
}

module.exports = { glance, tipsOn };
