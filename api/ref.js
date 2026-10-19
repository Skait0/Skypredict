"use strict";
/* POST /api/ref {ref, v} - a device that arrived through a tracking link
   (lib/refs.js). Records the visit by device id, and the account when one is
   signed in here. Same-site POST only, rate limited per device, and a
   database failure still answers ok: tracking must never break a visit. */
const H = require("../lib/auth/http.js");
const S = require("../lib/auth/session.js");
const RF = require("../lib/refs.js");
const { report } = require("../lib/report.js");

function make(deps) {
  const { db } = deps;
  const now = deps.now || Date.now;
  return async function handler(req, res) {
    if (req.method !== "POST") return H.sendJson(res, 405, { error: "method" });
    const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error });
    const body = await H.readJson(req, 512);
    const ref = RF.tag(body && body.ref), v = body && String(body.v || "");
    if (!ref || !RF.WHO_RE.test(v)) return H.sendJson(res, 400, { error: "bad_shape" });
    let cookies = null;
    try {
      if (!(await db.rlHit("ref:" + v, 3600, 20))) return H.sendJson(res, 200, { ok: true });
      await db.addRefHit(ref, "visit", v);
      const s = await S.readSession(db, req, now()).catch(() => null);
      /* readSession may extend the session; pass its cookie on like every route. */
      if (s && s.state === "ok") { cookies = s.setCookie ? [s.setCookie] : null; await db.addRefHit(ref, "user", s.userId); }
    } catch (e) { await report(e, { route: "ref" }); }
    return H.sendJson(res, 200, { ok: true }, cookies);
  };
}
module.exports = make({ db: require("../lib/auth/db.js") });
module.exports.make = make;
