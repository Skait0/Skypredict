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

/* Published tips (not the sweep's bare scores) from `since`, every page: PostgREST answers
   at most 1,000 rows a call, which cut the model test's record at 10 Oct (18 Oct 2026). */
async function publishedSince(since) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const rows = [];
  for (let off = 0; off < 50000; off += 1000) {
    const out = await call("results?select=match_date,tip,hit&source=neq.sweep&match_date=gte." + encodeURIComponent(since) +
      "&order=match_date.asc&limit=1000&offset=" + off, { method: "GET", headers: headers() });
    if (!out.ok) return { ok: false, why: out.why, rows };
    const got = Array.isArray(out.body) ? out.body : [];
    rows.push(...got);
    if (got.length < 1000) break;
  }
  return { ok: true, rows };
}

/* MATCH STATISTICS ON A RESULT (25 Sep 2026): corners hc/ac and total shots
   hsh/ash, filled from API-Football after full time so corners and shots legs
   can be settled - before, no result carried them and those legs went void.
   Like `model`, the columns may not exist yet when this ships: an unknown
   column is recognised and the read retried without them, so results never
   stop flowing because a migration has not run. */
const STAT_COLS = ["hc", "ac", "hsh", "ash"];
function missingStatColumn(why) {
  const w = String(why || "");
  return /\b(hc|ac|hsh|ash)\b/.test(w) && /(column|schema cache|PGRST204|42703)/i.test(w);
}

/* Everything from `sinceDate` (YYYY-MM-DD) forward. */
/* seq: the goal order ("HHAH"), for grading "3 or more goals in a row" when
   the score alone cannot (11 Oct 2026). Same rule as the stats columns: until
   the migration has run, the read is retried without it. */
function missingSeqColumn(why) {
  const w = String(why || "");
  return /\bseq\b/.test(w) && /(column|schema cache|PGRST204|42703)/i.test(w);
}
async function recentResults(sinceDate) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const q = (extra) => "results?select=match_date,league,home,away,hg,ag,tip,hit,tip_p,model,source" + extra +
            "&match_date=gte." + encodeURIComponent(sinceDate) +
            "&order=match_date.desc&limit=5000";
  let out = await call(q("," + STAT_COLS.join(",") + ",seq,hth,hta"), { method: "GET", headers: headers() });
  if (!out.ok && missingHalfColumn(out.why)) out = await call(q("," + STAT_COLS.join(",") + ",seq"), { method: "GET", headers: headers() });
  if (!out.ok && missingSeqColumn(out.why)) out = await call(q("," + STAT_COLS.join(",")), { method: "GET", headers: headers() });
  if (!out.ok && missingStatColumn(out.why)) out = await call(q(""), { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* Results from `sinceDate` whose statistics have not been filled. Empty, not
   an error, when the columns do not exist yet - there is nothing to fill. */
async function resultsWithoutStats(sinceDate) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const q = "results?select=match_date,league,home,away,hg,ag&hc=is.null" +
            "&match_date=gte." + encodeURIComponent(sinceDate) + "&limit=500";
  const out = await call(q, { method: "GET", headers: headers() });
  if (!out.ok && missingStatColumn(out.why)) return { ok: true, rows: [], noColumns: true };
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* Write one result's statistics. Only these columns are touched - the score,
   the verdict and its source are never rewritten from here. */
async function patchStats(row, stats) {
  if (!configured()) return { ok: false, why: "not configured" };
  const body = {};
  for (const k of STAT_COLS) if (stats && Number.isFinite(stats[k])) body[k] = stats[k];
  if (body.hc == null || body.ac == null) return { ok: false, why: "no corners to write" };
  const q = "results?match_date=eq." + encodeURIComponent(row.match_date) +
            "&home=eq." + encodeURIComponent(row.home) +
            "&away=eq." + encodeURIComponent(row.away);
  const out = await call(q, { method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify(body) });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

/* Write one result's goal order. Only seq is touched. */
async function patchSeq(row, seq) {
  if (!configured()) return { ok: false, why: "not configured" };
  if (!/^[HA]{1,30}$/.test(String(seq || ""))) return { ok: false, why: "not a goal order" };
  const q = "results?match_date=eq." + encodeURIComponent(row.match_date) +
            "&home=eq." + encodeURIComponent(row.home) +
            "&away=eq." + encodeURIComponent(row.away);
  const out = await call(q, { method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify({ seq }) });
  if (out.ok) return { ok: true };
  return { ok: false, why: out.why, noColumn: missingSeqColumn(out.why) };
}

/* The half-time score (sql/results_ht.sql), for the first-half markets. Same shape
   as patchSeq: a table without the columns says so, and the caller stops asking. */
function missingHalfColumn(why) {
  const w = String(why || "");
  return /\bht[ha]\b/.test(w) && /(column|schema cache|PGRST204|42703)/i.test(w);
}
async function patchHalf(row, hth, hta) {
  if (!configured()) return { ok: false, why: "not configured" };
  if (!Number.isInteger(hth) || !Number.isInteger(hta) || hth < 0 || hta < 0) return { ok: false, why: "not a half-time score" };
  const q = "results?match_date=eq." + encodeURIComponent(row.match_date) +
            "&home=eq." + encodeURIComponent(row.home) +
            "&away=eq." + encodeURIComponent(row.away);
  const out = await call(q, { method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify({ hth, hta }) });
  if (out.ok) return { ok: true };
  return { ok: false, why: out.why, noColumn: missingHalfColumn(out.why) };
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
/* ":" is for a signed-in account, "u:<id>" (lib/bookgate.js). Without it every
   account failed this check, the gate failed open and accounts booked without
   limit (owner, 16 Oct 2026: 20 codes on a new free account). */
const SUBJECT_RE = /^[A-Za-z0-9_:-]{1,72}$/;   /* 72: "t-" plus a 64-character device id */

async function countBookings(subject, day, cap, uptoId) {
  if (!configured()) return { ok: false, why: "not configured", n: null };
  const s = String(subject == null ? "" : subject);
  if (!SUBJECT_RE.test(s)) return { ok: false, why: "not a subject", n: null };
  const all = day === "*";   /* lib/quota.js ALL_DAYS: the lifetime trial */
  if (!all && !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return { ok: false, why: "not a day", n: null };
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
                         (all ? "" : "&day=eq." + encodeURIComponent(day)) +
                         (Number.isSafeInteger(uptoId) ? "&id=lte." + uptoId : "") + "&limit=" + lim,
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

/* HOLD A PLACE BEFORE BOOKING (16 Oct 2026). The gate used to count, book
   (seconds at the bookmaker) and only then write the row, so two bookings sent
   together both read the same count and both got a code. Now the row goes in
   first and the gate counts only rows up to its own id: the earliest N win,
   whatever order the counts come back in. A booking that fails gives its
   place back with releaseBooking. */
async function holdBooking(subject, day, src) {
  if (!configured()) return { ok: false, why: "not configured" };
  const s = String(subject == null ? "" : subject);
  if (!SUBJECT_RE.test(s)) return { ok: false, why: "not a subject" };
  const row = { subject: s, day: day };
  const tag = /^[a-z]{1,16}$/.test(String(src || "")) ? String(src) : null;
  const post = (r) => call("book_quota?select=id", {
    method: "POST",
    headers: headers({ "Prefer": "return=representation" }),
    body: JSON.stringify([r]),
  });
  let out = await post(tag ? Object.assign({ src: tag }, row) : row);
  if (!out.ok && tag && /^http 4\d\d/.test(String(out.why))) out = await post(row);
  const id = out.ok && Array.isArray(out.body) && out.body[0] ? Number(out.body[0].id) : NaN;
  return Number.isSafeInteger(id) ? { ok: true, id } : { ok: false, why: out.why || "no id" };
}

async function releaseBooking(id) {
  if (!configured() || !Number.isSafeInteger(id)) return { ok: false };
  const out = await call("book_quota?id=eq." + id, {
    method: "DELETE", headers: headers({ "Prefer": "return=minimal" }),
  });
  return { ok: !!out.ok };
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
    /* user_id only when signed in: a column left out of an upsert is left alone,
       so subscribing again while signed out does not unlink the account. */
    body: JSON.stringify([Object.assign({
      endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth,
    }, row.user_id ? { user_id: row.user_id } : {})]),
  });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

/* "Your slip landed" (sql/push_notes.sql): every subscription on one account. */
async function pushSubsForUser(userId) {
  if (!configured() || !/^[0-9a-f-]{36}$/i.test(String(userId || ""))) return [];
  const out = await call("push_subs?select=endpoint&user_id=eq." + userId, { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) ? out.body : [];
}

async function setPushNote(endpoints, note, atIso) {
  const list = (endpoints || []).filter(Boolean);
  if (!list.length || !configured()) return false;
  const out = await call("push_subs?endpoint=in." + encodeURIComponent(pgInFilter(list)), {
    method: "PATCH", headers: headers({ "Prefer": "return=minimal" }),
    body: JSON.stringify({ note, note_at: atIso }),
  });
  return out.ok;
}

/* Read once: the worker shows the line, and it is cleared so the next push
   (the 9am pick) does not show it again. */
async function takePushNote(endpoint) {
  if (!configured()) return null;
  const q = "push_subs?endpoint=eq." + encodeURIComponent(endpoint) + "&note=not.is.null";
  const out = await call(q + "&select=note,note_at&limit=1", { method: "GET", headers: headers() });
  const r = out.ok && Array.isArray(out.body) ? out.body[0] : null;
  if (!r) return null;
  await call(q, { method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify({ note: null, note_at: null }) });
  return r;
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

/* ------------------------------------------------------- tg_follows
   "Follow my slip" in the Telegram bot - see sql/tg_follows.sql and
   api/tgfollow.js. Following the same code twice updates the row rather than
   adding a second one (unique chat_id+code). */
/* CONNECT TELEGRAM (sql/tglinks.sql, lib/tglink.js). One Telegram per account:
   the account's old link goes first, then this Telegram's row is replaced. */
const TG_RE = /^tg-[0-9a-f]{24}$/, UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function putTgLink(tg, userId) {
  if (!configured() || !TG_RE.test(String(tg)) || !UUID_RE.test(String(userId))) return { ok: false };
  await call("tg_links?user_id=eq." + userId, { method: "DELETE", headers: headers({ "Prefer": "return=minimal" }) });
  const out = await call("tg_links?on_conflict=tg", {
    method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ tg, user_id: userId, linked_at: new Date().toISOString() }]),
  });
  return { ok: !!out.ok, why: out.why };
}
/* Whether an account has a Telegram connected: true, false, or null if unreadable. */
async function tgLinkedFor(userId) {
  if (!configured() || !UUID_RE.test(String(userId))) return null;
  const out = await call("tg_links?select=tg&user_id=eq." + userId + "&limit=1", { headers: headers() });
  return out.ok && Array.isArray(out.body) ? out.body.length > 0 : null;
}
/* The account behind a hashed Telegram id, or null (unlinked, or unreadable). */
async function tgUserOf(tg) {
  if (!configured() || !TG_RE.test(String(tg))) return null;
  const out = await call("tg_links?select=user_id&tg=eq." + tg + "&limit=1", { headers: headers() });
  return out.ok && Array.isArray(out.body) && out.body[0] ? out.body[0].user_id : null;
}

async function putFollow(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  /* IGNORE, NOT MERGE (code review, 24 Sep): merging reset `seen` and `done`,
     so following a slip twice announced every settled leg again. `added`
     says whether this was new. */
  const out = await call("tg_follows?on_conflict=chat_id,code", {
    method: "POST",
    headers: headers({ "Prefer": "resolution=ignore-duplicates,return=representation" }),
    body: JSON.stringify([row]),
  });
  return out.ok ? { ok: true, added: Array.isArray(out.body) && out.body.length > 0 } : { ok: false, why: out.why };
}
async function openFollows(chatId) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const q = "tg_follows?select=id,chat_id,book,code,legs,seen,last_kickoff&done=eq.false" +
            (chatId != null ? "&chat_id=eq." + encodeURIComponent(chatId) : "") + "&limit=2000";
  const out = await call(q, { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}
async function patchFollow(id, patch) {
  if (!configured()) return { ok: false, why: "not configured" };
  const out = await call("tg_follows?id=eq." + encodeURIComponent(id), {
    method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify(patch),
  });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

/* ------------------------------------------------------- bot_feedback
   Thumbs up / down under the bot's answers (sql/bot_feedback.sql). A second
   tap on one answer is ignored, not merged. */
async function putBotVote(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  const out = await call("bot_feedback?on_conflict=who,msg", { method: "POST",
    headers: headers({ "Prefer": "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify([row]) });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}
async function botVotes(days) {
  if (!configured()) return [];
  const since = new Date(Date.now() - (Number(days) || 7) * 864e5).toISOString();
  const out = await call("bot_feedback?select=job,vote&at=gte." + encodeURIComponent(since) + "&limit=10000", { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) ? out.body : [];
}

/* ------------------------------------------------------- social_log
   The social engine's record (sql/social_log.sql, api/social.js). */
async function socialRecent(days) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const since = new Date(Date.now() - (Number(days) || 3) * 864e5).toISOString();
  const out = await call("social_log?select=key,channel,kind,posted_at&posted_at=gte." + encodeURIComponent(since) +
    "&order=posted_at.desc&limit=500", { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}
async function socialHas(key) {
  if (!configured()) return false;
  const out = await call("social_log?select=key&key=eq." + encodeURIComponent(key) + "&limit=1", { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) && out.body.length > 0;
}
/* Every win post so far (key win|<slip id>|<channel>), for the admin's list. */
async function winPosts() {
  if (!configured()) return [];
  const out = await call("social_log?select=key,channel,posted_at&kind=eq.win&order=posted_at.asc&limit=2000", { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) ? out.body : [];
}
async function logSocial(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  const out = await call("social_log", { method: "POST",
    headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify([row]) });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}

/* ------------------------------------------------------- site_slips
   Every code booked on the site, graded every ten minutes - see sql/site_slips.sql
   and lib/slipwatch.js. A code saved twice (a retried request) keeps its first row. */
async function putSiteSlip(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  const out = await call("site_slips?on_conflict=book,code", { method: "POST",
    headers: headers({ "Prefer": "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify([row]) });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}
/* Only slips built from our picks (lib/slipwatch.js READER_SRCS): rows saved before
   the reader's own codes stopped being saved are filtered out of every list here. */
const OURS = "&or=(src.is.null,src.not.in.(convert,editor,trim,change))";
async function siteSlipsWhere(filter, limit) {
  if (!configured()) return [];
  const out = await call("site_slips?select=id,book,code,src,subject,status,legs,seen,untracked,leg_count,total_odds,last_kickoff,notified&" +
    filter + "&order=created_at.asc&limit=" + (Number(limit) || 500), { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) ? out.body : [];
}
const newSiteSlips = (n) => siteSlipsWhere("status=eq.new", n || 25);
const openSiteSlips = () => siteSlipsWhere("status=eq.open", 2000);
/* Slips waiting on "check", for the ledger's second look (lib/slipwatch.js). */
const checkSiteSlips = (n) => siteSlipsWhere("status=eq.check" + OURS, n || 60);
async function patchSiteSlip(id, patch) {
  if (!configured()) return false;
  const out = await call("site_slips?id=eq." + encodeURIComponent(id), {
    method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify(patch) });
  return out.ok;
}
/* The admin page's list: landed, plus every-gradable-leg-won slips to check by hand. */
async function siteSlipHits(limit) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const out = await call("site_slips?select=id,book,code,status,total_odds,leg_count,untracked,legs,seen,who,src,created_at,settled_at" +
    "&and=(or(status.eq.landed,and(status.eq.check,total_odds.gte.20)),or(src.is.null,src.not.in.(convert,editor,trim,change)))" +
    "&order=settled_at.desc&limit=" + (Number(limit) || 200), { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* Landed slips settled since `iso`, for the win posts (lib/winpost.js). */
async function landedSlipsSince(iso) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const out = await call("site_slips?select=id,book,status,total_odds,leg_count,legs,seen,settled_at&status=eq.landed" + OURS +
    "&settled_at=gte." + encodeURIComponent(iso) + "&order=total_odds.desc&limit=50", { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}

/* One slip, for its win banner (api/slipcard.js ?w=<id>): only what the banner
   draws, never the code or who booked it. Null for anything but one row. */
async function siteSlipById(id) {
  if (!configured() || !/^\d{1,18}$/.test(String(id || ""))) return null;
  const out = await call("site_slips?select=id,status,total_odds,leg_count,legs,seen&id=eq." + id + "&limit=1",
    { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) && out.body[0] || null;
}

/* ------------------------------------------------------- admin
   The admin page's numbers (sql/admin.sql admin_stats) and one member's recent
   codes. Only Family & friends book under their account ("u:<id>"); everyone
   else is counted by device, so their codes cannot be tied to an account. */
async function adminStats() {
  if (!configured()) return { ok: false, why: "not configured", stats: null };
  const out = await call("rpc/admin_stats", { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: "{}" });
  return out.ok ? { ok: true, stats: out.body || {} } : { ok: false, why: out.why, stats: null };
}
/* Only a slip still waiting on "check" can be settled, so a double tap or a second
   admin cannot flip a settled one. changed=false means it was not "check" any more. */
/* THE AUDIT LOG (sql/admin.sql admin_audit). Insert and read only. */
async function logAdmin(row) {
  if (!configured()) return false;
  const out = await call("admin_audit", { method: "POST", headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify([row]) });
  return out.ok;
}
async function adminLog(limit) {
  if (!configured()) return { ok: false, rows: [] };
  const out = await call("admin_audit?select=at,admin_email,action,target,detail&order=at.desc&limit=" + (Number(limit) || 100),
    { method: "GET", headers: headers() });
  return out.ok ? { ok: true, rows: Array.isArray(out.body) ? out.body : [] } : { ok: false, rows: [] };
}
/* One slip with what the admin's Check needs: the code to read back and the graded legs. */
async function siteSlipForCheck(id) {
  if (!configured() || !/^\d{1,18}$/.test(String(id || ""))) return null;
  const out = await call("site_slips?select=id,book,code,status,legs,seen,untracked,leg_count,total_odds,created_at&id=eq." + id + "&limit=1",
    { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) && out.body[0] || null;
}
async function settleCheckSlip(id, to) {
  if (!configured() || !/^\d{1,18}$/.test(String(id || "")) || (to !== "landed" && to !== "lost")) return { ok: false };
  /* settled_at moves to now: the win posts (lib/winpost.js) take slips settled today, and
     a check confirmed by hand days later must count as today's win (owner, 16 Oct 2026). */
  const out = await call("site_slips?id=eq." + id + "&status=eq.check", { method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify({ status: to, settled_at: new Date().toISOString() }) });
  const row = Array.isArray(out.body) && out.body.length === 1 ? out.body[0] : null;
  return out.ok ? { ok: true, changed: !!row, row } : { ok: false };
}
async function slipsBySubject(subject, limit) {
  if (!configured() || !/^u:[0-9a-f-]{36}$/i.test(String(subject || ""))) return [];
  const out = await call("site_slips?select=book,code,status,total_odds,leg_count,created_at&subject=eq." +
    encodeURIComponent(subject) + "&order=created_at.desc&limit=" + (Number(limit) || 10), { method: "GET", headers: headers() });
  return out.ok && Array.isArray(out.body) ? out.body : [];
}

/* ------------------------------------------------------- big_odds */
async function putBigOdds(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  const out = await call("big_odds?on_conflict=day", { method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([row]) });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}
async function getBigOdds(day) {
  if (!configured()) return { ok: false, why: "not configured", row: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return { ok: false, why: "not a day", row: null };
  const out = await call("big_odds?select=day,odds,codes,legs&day=eq." + day, { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, row: null };
  return { ok: true, row: Array.isArray(out.body) && out.body[0] || null };
}

/* ------------------------------------------------------- daily ladder + autopilot
   (sql/ladder.sql, lib/ladder.js, api/ladder.js) */
const RUNG_SET = [5, 10, 20, 100, 1000];
async function putLadder(row) {
  if (!configured()) return { ok: false, why: "not configured" };
  const out = await call("daily_ladder?on_conflict=day,rung", { method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([row]) });
  return out.ok ? { ok: true } : { ok: false, why: out.why };
}
async function getLadder(day) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return { ok: false, why: "not a day", rows: [] };
  const out = await call("daily_ladder?select=day,rung,odds,codes,legs&day=eq." + day + "&order=rung.asc", { method: "GET", headers: headers() });
  if (!out.ok) return { ok: false, why: out.why, rows: [] };
  return { ok: true, rows: Array.isArray(out.body) ? out.body : [] };
}
/* Every day's rungs, for the /booking-codes day pages (scripts/prebuild.js). Five rows a day. */
async function allLadder() {
  if (!configured()) return { ok: false, rows: [] };
  const out = await call("daily_ladder?select=day,rung,odds,codes,legs&order=day.asc,rung.asc&limit=5000", { method: "GET", headers: headers() });
  return out.ok ? { ok: true, rows: Array.isArray(out.body) ? out.body : [] } : { ok: false, rows: [] };
}
async function getAutopilot(userId) {
  if (!configured() || !UUID_RE.test(String(userId))) return { ok: false, row: null };
  const out = await call("autopilot?select=rung,book,push,tg_chat,last_sent_day&user_id=eq." + userId + "&limit=1", { headers: headers() });
  return out.ok ? { ok: true, row: Array.isArray(out.body) && out.body[0] || null } : { ok: false, row: null };
}
/* rung null turns it off (the row goes). Only the fields given change. */
async function putAutopilot(userId, set) {
  if (!configured() || !UUID_RE.test(String(userId))) return { ok: false };
  if (set && set.rung === null) {
    const out = await call("autopilot?user_id=eq." + userId, { method: "DELETE", headers: headers({ "Prefer": "return=minimal" }) });
    return { ok: !!out.ok };
  }
  const row = Object.assign({ user_id: userId, updated_at: new Date().toISOString() }, set);
  if (row.rung != null && !RUNG_SET.includes(row.rung)) return { ok: false, why: "rung" };
  const out = await call("autopilot?on_conflict=user_id", { method: "POST",
    headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([row]) });
  return { ok: !!out.ok, why: out.why };
}
/* Every reader still to be sent today's slip. */
async function autopilotDue(day) {
  if (!configured()) return { ok: false, rows: [] };
  const out = await call("autopilot?select=user_id,rung,book,push,tg_chat,last_sent_day&or=(last_sent_day.is.null,last_sent_day.neq." + day + ")", { headers: headers() });
  return out.ok ? { ok: true, rows: Array.isArray(out.body) ? out.body : [] } : { ok: false, rows: [] };
}
async function markAutopilotSent(userId, day) {
  if (!configured() || !UUID_RE.test(String(userId))) return false;
  const out = await call("autopilot?user_id=eq." + userId, { method: "PATCH",
    headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify({ last_sent_day: day }) });
  return !!out.ok;
}

module.exports = { call, headers, putBigOdds, getBigOdds,
  putLadder, getLadder, allLadder, getAutopilot, putAutopilot, autopilotDue, markAutopilotSent,
  configured, insertResults, recentResults, verifiedResults, publishedSince, verifyResult,
  resultsWithoutStats, patchStats, missingStatColumn, STAT_COLS, patchSeq, missingSeqColumn, patchHalf, missingHalfColumn,
  countBookings, recordBooking, holdBooking, releaseBooking,
  upsertLiveSeen, listLiveSeen, deleteLiveSeen,
  putSharedSlip, getSharedSlip,
  putPushSub, listPushSubs, dropPushSubs, pushSubsForUser, setPushNote, takePushNote,
  putTgLink, tgUserOf, tgLinkedFor,
  putFollow, openFollows, patchFollow, putBotVote, botVotes,
  putSiteSlip, newSiteSlips, openSiteSlips, checkSiteSlips, patchSiteSlip, siteSlipHits, landedSlipsSince, siteSlipById,
  socialRecent, logSocial, socialHas, winPosts,
  adminStats, slipsBySubject, settleCheckSlip, siteSlipForCheck, logAdmin, adminLog,
  pgInFilter,
};
