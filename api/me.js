"use strict";
/* /api/me - who is signed in, their synced things, and saving them.
   GET answers 404 while AUTH_ENABLED is off (the page then shows no account
   UI at all), 401 when signed out, else the stored copy. POST merges what the
   page sent with the stored copy (lib/sync.js) and saves it conditionally on
   the version it read, retrying on a clash, so two devices saving at once
   both keep everything. Spec section 6. */
const H = require("../lib/auth/http.js");
const S = require("../lib/auth/session.js");
const Y = require("../lib/sync.js");
const A = require("../lib/access.js");
const { report } = require("../lib/report.js");

function bodySize(req) {
  const b = req.body;
  if (typeof b === "string") return Buffer.byteLength(b);
  try { return Buffer.byteLength(JSON.stringify(b || {})); } catch (e) { return Infinity; }
}

function make(deps) {
  const { db } = deps;
  const now = deps.now || Date.now;
  return async function handler(req, res) {
    if (!H.enabled()) return H.notFound(res);
    const post = req.method === "POST";
    if (post) { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
    else if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" });
    const t = now();
    try {
      const s = await S.readSession(db, req, t);
      if (s.state !== "ok") return H.sendJson(res, 401, { error: "signed_out", reason: s.reason || null },
        s.state === "ended" ? [S.clearCookie(S.COOKIE)] : null);
      const cookies = s.setCookie ? [s.setCookie] : null;
      const user = await db.userById(s.userId);
      if (!user) return H.sendJson(res, 401, { error: "signed_out", reason: "deleted" }, [S.clearCookie(S.COOKIE)]);

      if (!post) {
        const row = await db.getUserData(s.userId);
        return H.sendJson(res, 200, { signedIn: true, email: user.email, version: row ? row.version : 0,
          data: row ? row.data : Y.empty(), entitlements: await A.entitlements(db, s.userId, A.FEATURES, t) }, cookies);
      }

      if (!(await db.rlHit("me:" + s.userId, 60, 60))) return H.sendJson(res, 429, { error: "slow_down", minutes: 1 });
      if (bodySize(req) > Y.MAX_BYTES + 1024) return H.sendJson(res, 413, { error: "too_big" });
      const body = await H.readJson(req, Y.MAX_BYTES + 1024);
      if (!body) return H.sendJson(res, 400, { error: "bad_shape" });
      const v = Y.validate(body.data);
      if (!v.ok) return H.sendJson(res, v.error === "too_big" ? 413 : 400, { error: v.error });
      for (let i = 0; i < 3; i++) {
        const row = await db.getUserData(s.userId);
        const merged = Y.merge(row ? row.data : null, v.data, t);
        const put = await db.putUserData(s.userId, merged, row ? row.version : 0);
        if (put.ok) return H.sendJson(res, 200, { version: put.version, data: merged }, cookies);
        if (!put.conflict) throw new Error("user_data save failed");
      }
      return H.sendJson(res, 409, { error: "busy" }, cookies);
    } catch (e) {
      await report(e, { route: "me" });
      return H.sendJson(res, 500, { error: "server" });
    }
  };
}

module.exports = make({ db: require("../lib/auth/db.js") });
module.exports.make = make;
