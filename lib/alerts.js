"use strict";
/* THE ADMIN'S ALERTS (owner, 16 Oct 2026: "log every alert"). Everything that
   comes in, newest first, built from what the site already keeps - no table of
   its own: a user's reply (lib/messages.js), a paid pass and whether it made a
   Founding Wizard (payments), a slip that landed (site_slips), a new account.
   The page marks the ones newer than the admin last looked (public/account-ui.js). */

const naira = (kobo) => "₦" + Math.round((Number(kobo) || 0) / 100).toLocaleString("en-GB");
const PASS = { day: "Day", week: "Week", month: "Month" };
const BOOK = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet", betway: "Betway" };
const textOf = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/* messages, readers, payments, slips: what each source answered (null or [] when it could not).
   Returns at most `max` alerts {at, kind, title, detail, uid?}, newest first. */
function buildAlerts(src, max) {
  const s = src || {};
  const who = new Map((s.readers || []).map((r) => [r.id, r]));
  const name = (id) => { const r = who.get(id); return r ? (r.name || r.email || "A user") : "A user"; };
  const out = [];
  for (const m of s.messages || []) {
    if (!m || !m.user_id || m.from_admin) continue;
    out.push({ at: m.created_at, kind: "reply", title: name(m.user_id) + " replied", detail: textOf(m.body).slice(0, 140), uid: m.user_id });
  }
  for (const p of s.payments || []) {
    if (!p || !p.paid_at) continue;
    out.push({ at: p.paid_at, kind: p.founder ? "founder" : "payment",
      title: name(p.user_id) + (p.founder ? " became a Founding Wizard" : " bought a " + (PASS[p.pass] || "") + " pass"),
      detail: (PASS[p.pass] || p.pass) + " pass · " + naira(p.amount_kobo), uid: p.user_id });
  }
  for (const x of s.slips || []) {
    if (!x || x.status !== "landed" || !x.settled_at) continue;
    out.push({ at: x.settled_at, kind: "win", title: "A slip landed" + (Number(x.total_odds) > 1 ? " at x" + Number(x.total_odds).toFixed(2) : ""),
      detail: (BOOK[x.book] || x.book || "") + (x.code ? " " + x.code : "") + (x.leg_count ? " · " + x.leg_count + " games" : "") });
  }
  for (const r of s.readers || []) {
    if (!r || !r.created_at) continue;
    out.push({ at: r.created_at, kind: "signup", title: name(r.id) + " joined", detail: r.email || "", uid: r.id });
  }
  return out.filter((a) => isFinite(Date.parse(a.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, max || 100);
}

module.exports = { buildAlerts };
