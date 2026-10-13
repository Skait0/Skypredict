"use strict";
/* The admin's site switches (sql/admin.sql, one row keyed 'site'):
     booksOff  bookmakers whose booking is paused, e.g. ["sporty"]
     notice    one line shown to every reader at the top of the page
     maint     maintenance mode: every reader sees the maintenance page and all
               booking stops (owner, 13 Oct 2026); maintMsg is its one line
   FAILS OPEN. A read that fails answers "nothing off, no notice": a database
   blip must never stop every bookie booking at once. Cached for 30 seconds per
   function instance, so a switch takes effect within half a minute. */
const { call, headers } = require("./supabase.js");
const { KEYS } = require("./books.js");

const TTL_MS = 30e3;
const NOTICE_MAX = 200;
const MAINT_MAX = 120;
const EMPTY = Object.freeze({ booksOff: [], notice: "", maint: false, maintMsg: "" });
let cached = null, cachedAt = 0;

/* Only known bookies and a trimmed, single-line notice survive, whatever is stored. */
function clean(v) {
  const o = v && typeof v === "object" ? v : {};
  const booksOff = (Array.isArray(o.booksOff) ? o.booksOff : [])
    .map((k) => String(k).toLowerCase()).filter((k, i, a) => KEYS.includes(k) && a.indexOf(k) === i);
  const notice = String(o.notice == null ? "" : o.notice).replace(/\s+/g, " ").trim().slice(0, NOTICE_MAX);
  const maintMsg = String(o.maintMsg == null ? "" : o.maintMsg).replace(/\s+/g, " ").trim().slice(0, MAINT_MAX);
  return { booksOff, notice, maint: o.maint === true, maintMsg };
}

async function get(now) {
  const t = now || Date.now();
  if (cached && t - cachedAt < TTL_MS) return cached;
  const r = await call("site_flags?key=eq.site&select=value", { headers: headers() });
  const row = r.ok && Array.isArray(r.body) ? r.body[0] : null;
  cached = r.ok ? clean(row && row.value) : EMPTY;
  cachedAt = t;
  return cached;
}

async function set(value, byUserId) {
  const v = clean(value);
  const r = await call("site_flags?on_conflict=key", { method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ key: "site", value: v, updated_at: new Date().toISOString(),
      updated_by: /^[0-9a-f-]{36}$/i.test(String(byUserId)) ? byUserId : null }) });
  if (r.ok) { cached = v; cachedAt = Date.now(); }
  return r.ok ? v : null;
}

/* Maintenance stops every bookie at once. */
const isOff = async (book) => { const f = await get(); return f.maint || f.booksOff.includes(String(book).toLowerCase()); };

module.exports = { get, set, clean, isOff, NOTICE_MAX, MAINT_MAX, _reset: () => { cached = null; cachedAt = 0; } };
