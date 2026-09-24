"use strict";

/**
 * A very small PostgREST client.
 *
 * No SDK on purpose: this project has zero dependencies, node 20 has fetch,
 * and Supabase's REST surface is a handful of URLs. Adding @supabase/supabase-js
 * to write three tables would be the largest thing in the tree.
 *
 * The service-role key lives here and only here, and this module is only ever
 * required by files under api/ and scripts/. It must never be reachable from
 * public/ - the key bypasses row-level security, so a copy of it in the page
 * would be a public write handle on the record.
 *
 * Everything degrades to a no-op when the environment is not configured, so a
 * local build, a preview deploy, or a fork with no secrets behaves exactly as
 * the site did before any of this existed.
 */

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TIMEOUT_MS = 8000;

function configured() { return !!(URL_BASE && KEY); }

function headers(extra) {
  return Object.assign({
    "apikey": KEY,
    "Authorization": "Bearer " + KEY,
    "Content-Type": "application/json",
  }, extra || {});
}

async function call(path, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL_BASE + "/rest/v1/" + path,
      Object.assign({ signal: ctrl.signal }, init));
    const text = await r.text();
    if (!r.ok) return { ok: false, why: "http " + r.status + " " + explain(text) };
    return { ok: true, body: text ? JSON.parse(text) : null };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e) };
  } finally {
    clearTimeout(t);
  }
}

/* PostgREST answers an error with {code, details, hint, message}, and `details`
   comes first and is long - it prints the entire failing row. Truncating the
   body at 200 characters therefore threw away `message`, which is the half
   that names the column. A not-null violation read as "Failing row contains
   (2026-09-01, Halifax, Hartlepool, ..." and stopped, so the build reported a
   failure it could not describe. Lead with the message. */
function explain(text) {
  try {
    const o = JSON.parse(text);
    if (o && (o.message || o.code)) {
      return [o.code, o.message, o.hint].filter(Boolean).join(" | ").slice(0, 300);
    }
  } catch (e) { /* not JSON - fall through to the raw body */ }
  return String(text || "").slice(0, 200);
}

/* The `model` column is newer than the tables, and the code that writes it
   ships before anyone runs the migration. PostgREST answers an unknown column
   with a schema-cache complaint naming it, so recognise that one case, drop
   the column and write the row anyway.
   Losing a snapshot costs a page some numbers. Losing the row costs a result
   that nothing downstream will ever recover - the live feed has already
   forgotten the match. So the row always wins. */
function missingModelColumn(why) {
  return /model/i.test(String(why || "")) &&
         /(column|schema cache|PGRST204|42703)/i.test(String(why || ""));
}
function withoutModel(rows) {
  return rows.map(r => { const { model, ...rest } = r; return rest; });
}

/* Insert, ignoring anything already there. First write wins by design: a
   result we already hold is not replaced by a later report of the same match,
   because the failure that matters is a wrong score overwriting a right one. */
async function insertResults(rows) {
  if (!configured()) return { ok: false, why: "not configured", inserted: 0 };
  if (!rows || !rows.length) return { ok: true, inserted: 0 };
  const post = (rs) => call("results", {
    method: "POST",
    headers: headers({ "Prefer": "resolution=ignore-duplicates,return=representation" }),
    body: JSON.stringify(rs),
  });
  let out = await post(rows);
  if (!out.ok && missingModelColumn(out.why)) out = await post(withoutModel(rows));
  if (!out.ok) return { ok: false, why: out.why, inserted: 0 };
  return { ok: true, inserted: Array.isArray(out.body) ? out.body.length : 0 };
}

/* Correct a row we already hold.
 *
 * insertResults above is first-write-wins, which is right when two reports of
 * the same match compete on equal footing - but it also meant a score the
 * sweep guessed could never be put right, by anything. That is how five wrong
 * results sat on the board with no way to reach them.
 *
 * This is the one path allowed to overwrite, and only in the direction that
 * matters: an inferred score giving way to an observed one. `source` records
 * which it now is, so a corrected row is never re-corrected and the payload
 * can tell a verified result from a guess.
 */
async function verifyResult(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  const q = "results?match_date=eq." + encodeURIComponent(row.match_date) +
            "&home=eq." + encodeURIComponent(row.home) +
            "&away=eq." + encodeURIComponent(row.away);
  const out = await call(q, {
    method: "PATCH",
    headers: headers({ "Prefer": "return=minimal" }),
    body: JSON.stringify({
      hg: Number(row.hg), ag: Number(row.ag), hit: !!row.hit, source: "oracle",
    }),
  });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

/* EVERY RESULT WE HAVE EVER VERIFIED, FOR THE PAGES THAT MUST NOT DISAPPEAR.
 *
 * A match page used to live for about four weeks and then 404 - the board's
 * results window is 14 days, so a page fell out of the build and its URL went
 * with it. Google discovers a URL, queues it, crawls it late and finds nothing;
 * do that a few hundred times and "Discovered - currently not indexed" is the
 * only sane response. 1,080 pages sat in exactly that state.
 *
 * `source` is what makes this safe, and it is why verifyResult writes it. A
 * `sweep` row is the sweep's own inference from watching a match vanish from
 * the live feed, and lib/oracle.js measured that guess wrong on three of five
 * matches. Those never reach a permanent page. Anything else has had its score
 * observed rather than deduced.
 *
 * The 5000 ceiling is PostgREST's and is inherited from recentResults. At the
 * current ~29 verified results a day it binds in about six months, and because
 * the order is newest-first the rows it would drop are the oldest - so the
 * symptom would be old pages starting to 404 again rather than a failure. Page
 * this when the archive gets close. */
async function verifiedResults() {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const q = "results?select=match_date,league,home,away,hg,ag,tip,hit,tip_p,model,source" +
            "&source=neq.sweep&order=match_date.desc&limit=5000";
  const out = await call(q, { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* Everything from `sinceDate` (YYYY-MM-DD) forward. */
async function recentResults(sinceDate) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const q = "results?select=match_date,league,home,away,hg,ag,tip,hit,tip_p,model,source" +
            "&match_date=gte." + encodeURIComponent(sinceDate) +
            "&order=match_date.desc&limit=5000";
  const out = await call(q, { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* ------------------------------------------------------- live_seen
   Neither feed we have reports a finished match. The live feed carries only
   games in play - HT, H1, H2 - and a match simply disappears from it when it
   ends; the fixtures feed carries odds and no scores at all. So a final score
   can only be had by watching a match while it is on and noticing when it
   goes, which means remembering what was there last time. A serverless
   function keeps nothing between calls, so the memory lives here. */
async function upsertLiveSeen(rows) {
  if (!configured()) return { ok: false, why: "not configured", n: 0 };
  if (!rows || !rows.length) return { ok: true, n: 0 };
  const post = (rs) => call("live_seen", {
    method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rs),
  });
  let out = await post(rows);
  if (!out.ok && missingModelColumn(out.why)) out = await post(withoutModel(rows));
  return out.ok ? { ok: true, n: rows.length } : { ok: false, why: out.why, n: 0 };
}

async function listLiveSeen() {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const out = await call("live_seen?select=*&limit=2000", { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

async function deleteLiveSeen(keys) {
  if (!configured() || !keys || !keys.length) return { ok: true, n: 0 };
  const list = keys.map(k => '"' + String(k).replace(/"/g, '') + '"').join(",");
  const out = await call("live_seen?match_key=in.(" + encodeURIComponent(list) + ")", {
    method: "DELETE", headers: headers({ "Prefer": "return=minimal" }),
  });
  return out.ok ? { ok: true, n: keys.length } : { ok: false, why: out.why, n: 0 };
}

/* ------------------------------------------------------- shared slips

   A slip's booking code is already a short unique name for it - SportyBet
   minted it, the reader has it, and it is six or seven characters. Keyed on
   that, a share link is `/s/MS0LJY` instead of four hundred characters of
   base64.

   The payload stored here is OUR self-contained one, not a list of SportyBet
   event ids. Their lookup endpoint does exist and returns references only, and
   the single feed that maps those ids to team names drops a match at kick-off,
   so resolving them would leave a shared slip with missing games a few hours
   after it was sent. That is the rot the payload format exists to avoid. */

/* THE FREE-PERIOD BOOKING QUOTA.
 *
 * One row per booking, counted per subject per Lagos day. A row rather than a
 * counter column because an insert is atomic over PostgREST without a stored
 * procedure, while "read, add one, write" over HTTP is a race with no lock
 * around it. Two requests can still both pass the read and both book, so the
 * cap is soft by a request or two under concurrency - which is the right trade
 * for a cost control, and the wrong one for anything that must be exact.
 *
 * `subject` is either a device id or a hashed address - see lib/quota.js. It
 * reaches a URL filter, so its shape is checked here rather than trusted.
 *
 * A FAILURE ANSWERS null, NEVER 0. Zero means "counted, and it was none";
 * null means "could not tell". Only the second may open the gate, and
 * conflating them turns a Supabase outage into an unlimited free-for-all that
 * reports itself as normal. */
const SUBJECT_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function countBookings(subject, day, cap) {
  if (!configured()) return { ok: false, why: "not configured", n: null };
  const s = String(subject == null ? "" : subject);
  if (!SUBJECT_RE.test(s)) return { ok: false, why: "not a subject", n: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return { ok: false, why: "not a day", n: null };
  /* Capped in the query. This runs on the busiest route on the site and needs
     to know whether the cap was passed, not how far past it someone went - an
     unbounded select here is how a limiter becomes the outage it prevents.
     One past the cap, so the boundary itself is still visible. */
  const lim = Math.max(1, Math.min(1000, Number(cap) || 10)) + 1;
  /* call() adds no headers of its own - every caller supplies them - and this
     one did not, so the GET went out unauthenticated and PostgREST answered
     "401 No API key found in request". The gate failed open, which is why
     nothing looked broken from outside. */
  const out = await call("book_quota?select=id&subject=eq." + encodeURIComponent(s) +
                         "&day=eq." + encodeURIComponent(day) + "&limit=" + lim,
                         { headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, n: null };
  return { ok: true, n: Array.isArray(out.body) ? out.body.length : 0 };
}

/* `src` is which surface booked it (board, builder, safer, ...) - see
   bookgate.srcOf. It went in on 24 Sep 2026 because Vercel's log export drops
   query strings, so this table is the only place attribution can be counted.
   A DATABASE WITHOUT THE COLUMN MUST STILL COUNT THE BOOKING: PostgREST
   refuses an unknown column with a 4xx, and losing that row would quietly
   switch off the daily limit. So a 4xx with src retries once without it. An
   outage (5xx, timeout) does not retry - the reader is waiting on this. */
async function recordBooking(subject, day, src) {
  if (!configured()) return { ok: false, why: "not configured" };
  const s = String(subject == null ? "" : subject);
  if (!SUBJECT_RE.test(s)) return { ok: false, why: "not a subject" };
  const row = { subject: s, day: day };
  const tag = /^[a-z]{1,16}$/.test(String(src || "")) ? String(src) : null;
  const post = (r) => call("book_quota", {
    method: "POST",
    headers: headers({ "Prefer": "return=minimal" }),
    body: JSON.stringify([r]),
  });
  let out = await post(tag ? Object.assign({ src: tag }, row) : row);
  if (!out.ok && tag && /^http 4\d\d/.test(String(out.why))) out = await post(row);
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

async function putSharedSlip(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  if (!row || !row.code || !row.payload) return { ok: false, why: "nothing to store" };
  /* merge-duplicates: the same code booked twice is the same slip, and the
     second write should not fail. */
  const out = await call("shared_slips", {
    method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([row]),
  });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

async function getSharedSlip(code) {
  if (!configured()) return { ok: false, why: "not configured", row: null };
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z0-9-]{4,24}$/.test(c)) return { ok: false, why: "not a code", row: null };
  const out = await call(
    "shared_slips?code=eq." + encodeURIComponent(c) + "&select=code,book,payload&limit=1",
    { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, row: null };
  const rows = Array.isArray(out.body) ? out.body : [];
  return { ok: true, row: rows[0] || null };
}

/* ---------------------------------------------------------------- push subs */

async function putPushSub(row) {
  /* Validated before the configured() guard, not after: an unconfigured
     environment must not mask a caller sending garbage, and the shape check
     is the cheaper, more specific failure to report. */
  if (!row || !row.endpoint || !row.p256dh || !row.auth) {
    return { ok: false, why: "nothing to store" };
  }
  if (!configured()) return { ok: false, why: "not configured" };
  /* merge-duplicates: the same browser re-subscribing is the same reader, and
     the second write must not 409. */
  const out = await call("push_subs", {
    method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{
      endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth,
    }]),
  });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

/* endpoint only. The sender POSTs an empty push, so `p256dh` and `auth` are
   never read by anything today - selecting them only put a table's worth of
   key material on the wire once a day for nothing. Widen this the day a
   payload-bearing push needs them. */
async function listPushSubs() {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const out = await call("push_subs?select=endpoint", {
    method: "GET", headers: headers(),
  });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* PostgREST's `in.()` list uses backslash as its escape character, so a value
   containing one must have it escaped before the quote-escaping runs -
   otherwise a trailing backslash swallows the closing quote and merges two
   list entries (or 400s the whole batch). Backslash first, then quotes. */
function pgInFilter(list) {
  return "(" + list.map((e) => '"' + e.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + ")";
}

/* Chunked, and not because of a row limit: a push endpoint is about 200
   characters, percent-encoding roughly doubles that in a URL, and PostgREST
   takes the whole `in.()` list in the query string. Forty dead endpoints is an
   ~8 KB request line, which is exactly where Kong and nginx put their default
   header buffer - so the delete 414s on the one morning it matters, the
   morning a push service expired hundreds of subscriptions at once.
   Twenty per request measures ~4.3 KB on real-length FCM endpoints, which
   leaves room for the rest of the request line and the headers beside it. */
const DROP_CHUNK = 20;

async function dropPushSubs(endpoints) {
  const list = (endpoints || []).filter(Boolean);
  if (!list.length) return { ok: true, dropped: 0 };
  if (!configured()) return { ok: false, why: "not configured", dropped: 0 };
  let dropped = 0;
  for (let i = 0; i < list.length; i += DROP_CHUNK) {
    const chunk = list.slice(i, i + DROP_CHUNK);
    const out = await call("push_subs?endpoint=in." + encodeURIComponent(pgInFilter(chunk)), {
      method: "DELETE", headers: headers(),
    });
    /* A part-done sweep answers ok:false carrying what did land, rather than
       claiming the whole list or none of it. The rows left behind are still
       dead, so tomorrow's run sweeps them again - but the log has to say the
       number the database confirmed, or a failing delete reads as a success
       every single morning. */
    if (!out.ok) return { ok: false, why: out.why, dropped };
    dropped += chunk.length;
  }
  return { ok: true, dropped };
}

module.exports = {
  configured, insertResults, recentResults, verifiedResults, verifyResult,
  countBookings, recordBooking,
  upsertLiveSeen, listLiveSeen, deleteLiveSeen,
  putSharedSlip, getSharedSlip,
  putPushSub, listPushSubs, dropPushSubs,
  pgInFilter,
};
