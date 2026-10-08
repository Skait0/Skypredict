// lib/penaltydb.js
"use strict";
/* Data access for Penalty Wahala. Every value that reaches a URL is checked
   (ids against the board alphabet, devices against UUID shape, days against
   YYYY-MM-DD) and encodeURIComponent'd. */
const { call, headers } = require("./supabase.js");
const enc = encodeURIComponent;
const ID_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const DEV_RE = /^[0-9a-f-]{36}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const J = (extra) => headers(Object.assign({ "Content-Type": "application/json" }, extra || {}));

async function createMatch(row) {
  const r = await call("penalty_matches", { method: "POST", headers: J({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  return r.ok;
}
async function getMatch(id) {
  if (!ID_RE.test(String(id))) return null;
  const r = await call("penalty_matches?id=eq." + enc(id) + "&select=*", { headers: J() });
  return r.ok && Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
}
async function appendKick(id, n, kicks, patch) {
  if (!ID_RE.test(String(id))) return false;
  const body = Object.assign({}, patch, { friend_kicks: kicks, kicks_n: n + 1 });
  const r = await call("penalty_matches?id=eq." + enc(id) + "&kicks_n=eq." + (n | 0),
    { method: "PATCH", headers: J({ Prefer: "return=representation" }), body: JSON.stringify(body) });
  return r.ok && Array.isArray(r.body) && r.body.length === 1;
}
async function getPlay(day, device) {
  if (!DAY_RE.test(day) || !DEV_RE.test(device)) return null;
  const r = await call("penalty_daily_plays?day=eq." + enc(day) + "&device=eq." + enc(device) + "&select=*", { headers: J() });
  return r.ok && Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
}
async function putPlay(row, prevLen) {
  if (!DAY_RE.test(row.day) || !DEV_RE.test(row.device)) return false;
  if (prevLen === 0) {
    const r = await call("penalty_daily_plays", { method: "POST", headers: J({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    return r.ok;
  }
  const r = await call("penalty_daily_plays?day=eq." + enc(row.day) + "&device=eq." + enc(row.device) + "&shots_n=eq." + (prevLen | 0),
    { method: "PATCH", headers: J({ Prefer: "return=representation" }), body: JSON.stringify({ shots: row.shots, shots_n: row.shots_n, score: row.score == null ? null : row.score }) });
  return r.ok && Array.isArray(r.body) && r.body.length === 1;
}
/* A count, not rows: PostgREST answers HEAD with Prefer count=exact in
   Content-Range ("*\/10"). Kept here because lib/supabase.js's call() returns
   bodies, not headers. Tests replace it through module.exports._count. */
async function count(path) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  try {
    const r = await fetch(base + "/rest/v1/" + path, { method: "HEAD", headers: J({ Prefer: "count=exact" }) });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    return r.ok && m ? +m[1] : null;
  } catch (e) { return null; }
}
async function rankFor(day, score) {
  if (!DAY_RE.test(day)) return null;
  const q = "penalty_daily_plays?day=eq." + enc(day) + "&score=not.is.null";
  const [below, total] = await Promise.all([module.exports._count(q + "&score=lt." + (score | 0)), module.exports._count(q)]);
  return below == null || total == null ? null : { below, total };
}
async function mine(device, sinceIso) {
  if (!DEV_RE.test(device)) return [];
  const r = await call("penalty_matches?challenger_device=eq." + enc(device) + "&finished_at=gt." + enc(sinceIso) +
    "&select=id,friend_name,result,finished_at&order=finished_at.desc&limit=5", { headers: J() });
  return r.ok && Array.isArray(r.body) ? r.body : [];
}

module.exports = { createMatch, getMatch, appendKick, getPlay, putPlay, rankFor, mine, _count: count, ID_RE, DEV_RE };
