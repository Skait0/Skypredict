"use strict";
/* THE MESSAGE BOARD's queries (owner, 14 Oct 2026; sql/messages.sql). The admin
   writes to everyone or to chosen readers; a reader reads their inbox and
   replies in it. Service-role PostgREST only, like lib/auth/db.js: ids are
   checked before any URL is built. GIF search is GIPHY's (Tenor's API closed on
   30 Jun 2026), proxied so the key never reaches a page. */
const { call, headers } = require("./supabase.js");
const { UUID_RE } = require("./auth/crypto.js");

const okId = (id) => typeof id === "string" && UUID_RE.test(id);
const COLS = "select=id,created_at,user_id,from_admin,body";
const rows = (r) => (r.ok && Array.isArray(r.body) ? r.body : null);

/* One reader's inbox: their thread and every broadcast, newest first. null = the table is not there. */
async function inboxOf(uid) {
  if (!okId(uid)) return null;
  return rows(await call("messages?" + COLS + "&deleted_at=is.null&or=(user_id.eq." + uid + ",user_id.is.null)" +
    "&order=created_at.desc&limit=100", { headers: headers() }));
}
/* hidden: the messages this reader deleted from their inbox (sql/messages.sql,
   added 14 Oct 2026). Read without it while that column is not there yet, so
   the inbox keeps working before the SQL is run. */
async function readsOf(uid) {
  if (!okId(uid)) return null;
  let r = rows(await call("message_reads?select=read_at,banner_at,hidden&user_id=eq." + uid, { headers: headers() }));
  if (!r) r = rows(await call("message_reads?select=read_at,banner_at&user_id=eq." + uid, { headers: headers() }));
  if (!r) return null;
  const x = r[0] || { read_at: null, banner_at: null };
  return Object.assign(x, { hidden: Array.isArray(x.hidden) ? x.hidden.map(Number) : [] });
}
/* Deleting from the inbox hides the message for this reader only; a broadcast
   stays for everyone else. id 0 is the welcome. Capped so the row stays small. */
async function hide(uid, id) {
  if (!okId(uid) || !/^\d{1,18}$/.test(String(id))) return false;
  const cur = await readsOf(uid);
  if (!cur) return false;
  const list = cur.hidden.filter((x) => x !== Number(id)).concat([Number(id)]).slice(-500);
  const r = await call("message_reads?on_conflict=user_id", { method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([{ user_id: uid, hidden: list }]) });
  return r.ok;
}
/* field: read_at (the inbox) or banner_at (the banner). Only that column changes. */
async function markRead(uid, field, iso) {
  if (!okId(uid) || (field !== "read_at" && field !== "banner_at")) return false;
  const r = await call("message_reads?on_conflict=user_id", { method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([{ user_id: uid, [field]: iso }]) });
  return r.ok;
}
async function add(list) {
  const r = await call("messages", { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(list) });
  return rows(r);
}
async function unsend(id, iso) {
  if (!/^\d{1,18}$/.test(String(id))) return false;
  const r = await call("messages?id=eq." + id + "&from_admin=is.true&deleted_at=is.null",
    { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify({ deleted_at: iso }) });
  return r.ok && Array.isArray(r.body) && r.body.length === 1;
}
/* Everything the admin's Messages tab shows: every thread and every broadcast. */
const all = async () => rows(await call("messages?" + COLS + "&deleted_at=is.null&order=created_at.desc&limit=500", { headers: headers() }));
const threadOf = async (uid) => okId(uid)
  ? rows(await call("messages?" + COLS + "&deleted_at=is.null&user_id=eq." + uid + "&order=created_at.desc&limit=100", { headers: headers() })) : null;
/* Readers' replies the admin has not read yet. */
async function repliesSince(iso) {
  const r = rows(await call("messages?select=id&from_admin=is.false&deleted_at=is.null" +
    (iso ? "&created_at=gt." + encodeURIComponent(iso) : "") + "&limit=100", { headers: headers() }));
  return r ? r.length : null;
}
async function readers() {
  const r = await call("rpc/admin_readers", { method: "POST", headers: headers(), body: "{}" });
  return r.ok && Array.isArray(r.body) ? r.body : null;
}
const pushCount = async (uid) => okId(uid)
  ? (rows(await call("push_subs?select=endpoint&user_id=eq." + uid, { headers: headers() })) || []).length : 0;

/* PHONE PUSH FOR A NEW MESSAGE (owner, 14 Oct 2026: "do the phone push for new
   messages"). The push is empty; the service worker asks /api/push?a=note what
   to show (sql/push_notes.sql). Only subscriptions linked to an account: a
   broadcast goes to every signed-in phone, a direct message to its readers'.
   Ids go into the URL 50 at a time, which keeps the request line short. */
async function noteSubs(uids, note, iso) {
  const parts = uids ? [] : ["user_id=not.is.null"];
  if (uids) for (let i = 0; i < uids.length; i += 50) {
    const ids = uids.slice(i, i + 50).filter(okId);
    if (ids.length) parts.push("user_id=in.(" + ids.join(",") + ")");
  }
  const subs = [];
  for (const f of parts) {
    const r = await call("push_subs?select=endpoint&" + f, { method: "PATCH", headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({ note, note_at: iso }) });
    if (r.ok && Array.isArray(r.body)) r.body.forEach((s) => subs.push({ endpoint: s.endpoint }));
  }
  return subs;
}

/* GIPHY search, or what is trending when q is empty. null = no key or no answer. */
async function gifs(q, env) {
  const key = (env || process.env).GIPHY_API_KEY;
  if (!key) return null;
  const u = "https://api.giphy.com/v1/gifs/" + (q ? "search" : "trending") + "?api_key=" + encodeURIComponent(key) +
    (q ? "&q=" + encodeURIComponent(String(q).slice(0, 50)) : "") + "&limit=24&rating=pg-13";
  try {
    const j = await (await fetch(u, { signal: AbortSignal.timeout(6000) })).json();
    return (j.data || []).map((g) => {
      const im = (g.images && g.images.fixed_height_small) || {};
      return { url: String(im.webp || im.url || "").split("?")[0], w: Number(im.width) || 0, h: Number(im.height) || 0, title: String(g.title || "").slice(0, 60) };
    }).filter((g) => /^https:\/\/media\d?\.giphy\.com\/media\//.test(g.url));
  } catch (e) { return null; }
}

module.exports = { inboxOf, readsOf, markRead, hide, add, unsend, all, threadOf, repliesSince, readers, pushCount, gifs, noteSubs };
