"use strict";
/* /api/account/export and /api/account/delete (vercel.json rewrites
   /api/account/:action to /api/account?action=:action). Delete needs a
   sign-in from the last 10 minutes, so a borrowed, already-open phone cannot
   wipe an account. Spec section 8. */
const H = require("../lib/auth/http.js");
const S = require("../lib/auth/session.js");
const { report } = require("../lib/report.js");

const REAUTH_MS = 10 * 60e3;

function make(deps) {
  const { db } = deps;
  const now = deps.now || Date.now;
  return async function handler(req, res) {
    if (!H.enabled()) return H.notFound(res);
    const action = String((req.query || {}).action || "");
    if (action === "delete") { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
    else if (action === "export") { if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" }); }
    else return H.notFound(res);
    const t = now();
    try {
      const s = await S.readSession(db, req, t);
      if (s.state !== "ok") return H.sendJson(res, 401, { error: "signed_out", reason: s.reason || null },
        s.state === "ended" ? [S.clearCookie(S.COOKIE)] : null);

      if (action === "export") {
        const user = await db.userById(s.userId);
        if (!user) return H.sendJson(res, 401, { error: "signed_out", reason: "deleted" }, [S.clearCookie(S.COOKIE)]);
        const row = await db.getUserData(s.userId);
        const devices = (await db.liveSessions(s.userId, new Date(t).toISOString()))
          .map((d) => ({ label: d.label, created_at: d.created_at, last_used_at: d.last_used_at }));
        res.setHeader("Content-Disposition", 'attachment; filename="soccerwizard-my-data.json"');
        return H.sendJson(res, 200, {
          profile: { email: user.email, google_linked: !!user.google_sub, created_at: user.created_at },
          data: row ? row.data : null, devices,
        });
      }

      if (!(t - Date.parse(s.session.created_at) <= REAUTH_MS)) return H.sendJson(res, 403, { error: "reauth" });
      if (!(await db.deleteUser(s.userId))) throw new Error("delete failed");
      return H.sendJson(res, 200, { ok: true }, [S.clearCookie(S.COOKIE)]);
    } catch (e) {
      await report(e, { route: "account/" + action });
      return H.sendJson(res, 500, { error: "server" });
    }
  };
}

module.exports = make({ db: require("../lib/auth/db.js") });
module.exports.make = make;
