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

/* A prediction has no score yet, and the results table was built for finished
   matches: `hg` is NOT NULL. Same shape of answer as the model column below -
   recognise the one case, adjust the row, write it anyway.
   
   The placeholder is -1, and the choice matters. 0 would have been a plausible
   score, and a plausible wrong score is the failure this whole confirmation
   path exists to prevent; -1 cannot be mistaken for a result by a person or by
   a query. It is never published: a row written by the build carries source
   "build", confirmScores refuses to trust one, and only a score from a source
   that watched the match can replace it - at which point verifyResult
   overwrites all three columns.
   
   Sending null first is deliberate. The day somebody runs
   `ALTER TABLE results ALTER COLUMN hg DROP NOT NULL` (and ag), the first
   insert succeeds and this fallback quietly stops being used. */
const UNPLAYED = -1;
function notNullViolation(why) {
  return /23502/.test(String(why || ""));
}
function withPlaceholderScore(rows) {
  return rows.map((r) => Object.assign({}, r, {
    hg: r.hg == null ? UNPLAYED : r.hg,
    ag: r.ag == null ? UNPLAYED : r.ag,
    hit: r.hit == null ? false : r.hit,
  }));
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
  if (!out.ok && notNullViolation(out.why)) out = await post(withPlaceholderScore(rows));
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

module.exports = {
  configured, insertResults, recentResults, verifyResult, UNPLAYED,
  upsertLiveSeen, listLiveSeen, deleteLiveSeen,
};
