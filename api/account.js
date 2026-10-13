"use strict";
/* /api/account/export, /delete, /grants, /grant and /revoke (vercel.json
   rewrites /api/account/:action to /api/account?action=:action). The admin
   only actions (ADMIN_GET, ADMIN_POST) list, add and remove Family & friends
   grants, list landed slips, read and set the site switches (lib/flags.js),
   read the numbers, look a reader up by email and sign them out everywhere. Delete needs a
   sign-in from the last 10 minutes, so a borrowed, already-open phone cannot
   wipe an account. Spec section 8. */
const H = require("../lib/auth/http.js");
const S = require("../lib/auth/session.js");
const K = require("../lib/auth/consent.js");
const R = require("../lib/roles.js");
const C = require("../lib/auth/crypto.js");
const { report } = require("../lib/report.js");

const REAUTH_MS = 10 * 60e3;
const ADMIN_GET = ["grants", "hits", "flags", "stats", "lookup", "slipdetail", "audit"];
const ADMIN_POST = ["grant", "revoke", "setflags", "signout", "settle"];

function make(deps) {
  const { db } = deps;
  const now = deps.now || Date.now;
  const env = deps.env || process.env;
  /* The booked-slip ledger (lib/slipwatch.js); a dep so tests need no database. */
  const slips = deps.slips || { hits: (n) => require("../lib/supabase.js").siteSlipHits(n),
    settle: (id, to) => require("../lib/supabase.js").settleCheckSlip(id, to),
    byId: (id) => require("../lib/supabase.js").siteSlipForCheck(id),
    read: (book, code) => require("../lib/upstream.js").readSlip(book, code),
    results: async (since) => (await require("../lib/supabase.js").recentResults(since)).rows || [] };
  /* The admin's switches and numbers; deps too, for the same reason. */
  const flags = deps.flags || require("../lib/flags.js");
  const admin = deps.admin || { stats: () => require("../lib/supabase.js").adminStats(),
    slipsOf: (subject) => require("../lib/supabase.js").slipsBySubject(subject, 10) };
  /* THE AUDIT LOG (sql/admin.sql): every admin change, and every look at a reader's
     private details, with who did it. A failed write never undoes or blocks the
     action - it is reported, so a gap in the log is itself on record. */
  const audit = deps.audit || { log: (row) => require("../lib/supabase.js").logAdmin(row),
    list: (n) => require("../lib/supabase.js").adminLog(n) };
  return async function handler(req, res) {
    if (!H.enabled()) return H.notFound(res);
    const action = String((req.query || {}).action || "");
    if (action === "delete") { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
    else if (action === "consent") { if (req.method === "POST") { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); } else if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" }); }
    else if (action === "export") { if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" }); }
    else if (ADMIN_GET.includes(action)) { if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" }); }
    else if (ADMIN_POST.includes(action)) { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
    else return H.notFound(res);
    const t = now();
    try {
      const s = await S.readSession(db, req, t);
      if (s.state !== "ok") return H.sendJson(res, 401, { error: "signed_out", reason: s.reason || null },
        s.state === "ended" ? [S.clearCookie(S.COOKIE)] : null);

      if (ADMIN_GET.includes(action) || ADMIN_POST.includes(action)) {
        const user = await db.userById(s.userId);
        if (!user || (await R.roleOf(db, user, env)) !== "admin") return H.sendJson(res, 403, { error: "forbidden" });
        const record = async (what, target, detail) => {
          let ok = false;
          try { ok = await audit.log({ at: new Date(t).toISOString(), admin_email: user.email, action: what,
            target: target == null ? null : String(target).slice(0, 200), detail: detail || {} }); } catch (e) { ok = false; }
          if (!ok) await report(new Error("admin audit write failed: " + what), { route: "account/audit" });
        };
        if (action === "audit") {
          const got = await audit.list(200);
          return got && got.ok ? H.sendJson(res, 200, { log: got.rows }) : H.sendJson(res, 503, { error: "unavailable" });
        }
        /* Slips booked on the site that landed (or need a manual check), newest first. */
        if (action === "hits") {
          const got = await slips.hits(200);
          if (!got || !got.ok) return H.sendJson(res, 503, { error: "unavailable" });
          /* Each landed win carries what sharing it needs: the rank banner and both captions. */
          const WIN = require("../lib/winpost.js"), SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
          const hits = (got.rows || []).map((h) => (h.status === "landed" && WIN.rankOf(h.total_odds))
            ? Object.assign({}, h, { share: { img: WIN.imageUrl(SITE, h), x: WIN.caption(h, "x"), tg: WIN.caption(h, "tg") } }) : h);
          return H.sendJson(res, 200, { hits });
        }
        /* Every leg of one booked slip in words, with a score and a verdict where a
           score settles it (lib/slipdetail.js). When the bookie no longer reads the
           code back, the ledger's graded legs are all there is, and it says so. */
        if (action === "slipdetail") {
          const id = String((req.query || {}).id || "");
          if (!/^\d{1,18}$/.test(id)) return H.sendJson(res, 400, { error: "bad_request" });
          const row = await slips.byId(id);
          if (!row) return H.sendJson(res, 404, { error: "no_slip" });
          const legs = await slips.read(row.book, row.code);
          const DET = require("../lib/slipdetail.js");
          const since = new Date(Date.parse(row.created_at || "") - 2 * 864e5 || t - 14 * 864e5).toISOString().slice(0, 10);
          const results = await slips.results(since);
          if (legs) return H.sendJson(res, 200, { readBack: true, legs: DET.detail(legs, results) });
          /* Fallback: the graded legs the ledger kept, with what it saw. */
          const seen = row.seen || {};
          return H.sendJson(res, 200, { readBack: false, untracked: row.untracked | 0,
            legs: (row.legs || []).map((l, i) => ({ match: l.home + " v " + l.away, pick: l.name, odds: null,
              verdict: seen[i] || null, score: null, why: seen[i] ? "" : "No result yet." })) });
        }
        /* A "check" slip settled by the owner after looking it up on the bookmaker. */
        if (action === "settle") {
          const b = (await H.readJson(req, 256)) || {};
          const id = String(b.id || ""), to = b.status;
          if (!/^\d{1,18}$/.test(id) || (to !== "landed" && to !== "lost")) return H.sendJson(res, 400, { error: "bad_request" });
          const got = await slips.settle(id, to);
          if (!got || !got.ok) return H.sendJson(res, 503, { error: "unavailable" });
          if (!got.changed) return H.sendJson(res, 409, { error: "not_check" });
          await record("settle", "slip " + id, { status: to });
          return H.sendJson(res, 200, { ok: true });
        }
        if (action === "flags") {
          if (flags._reset) flags._reset(); // the admin sees the stored switches, not a cached copy
          return H.sendJson(res, 200, await flags.get());
        }
        if (action === "setflags") {
          const before = await flags.get();
          const done = await flags.set((await H.readJson(req, 2048)) || {}, s.userId);
          if (!done) return H.sendJson(res, 503, { error: "unavailable" });
          await record("setflags", null, { before: { booksOff: before.booksOff, notice: before.notice, maint: before.maint }, after: done });
          return H.sendJson(res, 200, done);
        }
        if (action === "stats") {
          const got = await admin.stats();
          return got && got.ok ? H.sendJson(res, 200, got.stats) : H.sendJson(res, 503, { error: "unavailable" });
        }
        if (action === "lookup") {
          const email = C.normEmail((req.query || {}).email);
          if (!email) return H.sendJson(res, 400, { error: "bad_email" });
          const u = await db.userByEmail(email);
          const grant = await db.grantFor(email);
          await record("lookup", email, { found: !!u });
          /* A grant can exist before the person signs up, so "no account" still says whether they have one. */
          if (!u) return H.sendJson(res, 200, { found: false, email, ff: !!grant });
          const role = await R.roleOf(db, u, env);
          const devices = (await db.liveSessions(u.id, new Date(t).toISOString()))
            .map((d) => ({ label: d.label, last_used_at: d.last_used_at }));
          return H.sendJson(res, 200, { found: true, email: u.email, role, plan: R.planLabel(role), ff: !!grant,
            google: !!u.google_sub, created_at: u.created_at, last_seen_at: u.last_seen_at, devices,
            codes: role === "ff" ? await admin.slipsOf("u:" + u.id) : null });
        }
        if (action === "signout") {
          const email = C.normEmail(((await H.readJson(req, 512)) || {}).email);
          const u = email ? await db.userByEmail(email) : null;
          if (!u) return H.sendJson(res, 404, { error: "no_user" });
          if (u.id === s.userId) return H.sendJson(res, 400, { error: "self" });
          if (!(await db.endAllSessions(u.id, "admin", new Date(t).toISOString()))) return H.sendJson(res, 503, { error: "unavailable" });
          await record("signout", email);
          return H.sendJson(res, 200, { ok: true });
        }
        if (action === "grants") {
          const rows = (await db.listGrants()).filter((g) => !g.revoked_at);
          return H.sendJson(res, 200, { grants: rows.map((g) => ({ email: g.email, created_at: g.created_at })) });
        }
        const email = C.normEmail(((await H.readJson(req, 512)) || {}).email);
        if (!email) return H.sendJson(res, 400, { error: "bad_email" });
        const done = action === "grant" ? await db.upsertGrant(email, s.userId) : await db.revokeGrant(email, new Date(t).toISOString());
        if (!done) return H.sendJson(res, 503, { error: "unavailable" });
        await record(action, email);
        return H.sendJson(res, 200, { ok: true });
      }

      if (action === "consent") {
        if (req.method === "POST") {
          const body = (await H.readJson(req, 256)) || {};
          if (body.on === true) await K.record(db, s.userId, true, "account", t);
          else await db.revokeConsent(s.userId, new Date(t).toISOString());
        }
        const c = await db.consentFor(s.userId);
        return H.sendJson(res, 200, { on: !!(c && !c.revoked_at) });
      }

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
          email_consent: await db.consentFor(s.userId),
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
