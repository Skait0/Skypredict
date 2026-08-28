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
    if (!r.ok) return { ok: false, why: "http " + r.status + " " + text.slice(0, 200) };
    return { ok: true, body: text ? JSON.parse(text) : null };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e) };
  } finally {
    clearTimeout(t);
  }
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

/* Everything from `sinceDate` (YYYY-MM-DD) forward. */
async function recentResults(sinceDate) {
  if (!configured()) return { ok: false, why: "not configured", rows: [] };
  const q = "results?select=match_date,league,home,away,hg,ag,tip,hit,tip_p,model" +
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
  configured, insertResults, recentResults,
  upsertLiveSeen, listLiveSeen, deleteLiveSeen,
};
