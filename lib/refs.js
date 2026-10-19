"use strict";
/* Tracking links: soccerwizard.live/?t=<tag> (owner, 19 Oct 2026). The page keeps the first tag a device
   arrived with (sw.ref) and tells api/ref.js once as a visit, and again once
   an account signs in on that device. The admin's Status tab reads summary(). */
const TAG_RE = /^[a-z0-9_-]{1,24}$/;
const WHO_RE = /^[A-Za-z0-9_-]{8,64}$/;
const tag = (v) => { const s = String(v == null ? "" : v).toLowerCase(); return TAG_RE.test(s) ? s : null; };

/* hits: ref_hits rows; users: {id, created_at} of every 'user' hit; paid:
   paid payments {user_id, amount_kobo, paid_at} of those users. An account is
   NEW when it was made after its device first came through the tag (a minute
   of slack for clocks). A pass counts when it was paid after the account's
   own hit on that tag, so a reader who had already paid is not credited. */
function summary(hits, users, paid) {
  const made = new Map(users.map((u) => [u.id, Date.parse(u.created_at)]));
  const out = new Map();
  const row = (r) => out.get(r) || out.set(r, { ref: r, visits: 0, users: 0, newUsers: 0, passes: 0, naira: 0, first: null }).get(r);
  const firstVisit = new Map();
  for (const h of hits) {
    const r = row(h.ref), at = Date.parse(h.at);
    if (r.first == null || at < Date.parse(r.first)) r.first = h.at;
    if (h.kind === "visit") { r.visits++; if (!firstVisit.has(h.ref) || at < firstVisit.get(h.ref)) firstVisit.set(h.ref, at); }
  }
  for (const h of hits) {
    if (h.kind !== "user") continue;
    const r = row(h.ref), at = Date.parse(h.at), c = made.get(h.who);
    r.users++;
    if (c >= (firstVisit.has(h.ref) ? firstVisit.get(h.ref) : at) - 60e3) r.newUsers++;
    for (const p of paid) if (p.user_id === h.who && Date.parse(p.paid_at) >= at) { r.passes++; r.naira += Math.round((p.amount_kobo | 0) / 100); }
  }
  return [...out.values()].sort((a, b) => b.visits - a.visits);
}

module.exports = { tag, summary, WHO_RE };
