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
const ADMIN_GET = ["grants", "hits", "flags", "stats", "lookup", "slipdetail", "audit", "readers", "reader", "threads", "gifs"];
const ADMIN_POST = ["grant", "revoke", "setflags", "signout", "settle", "send", "unsend"];
/* THE MESSAGE BOARD (owner, 14 Oct 2026; sql/messages.sql, public/messages.js):
   any signed-in reader reads their inbox, marks it read and replies in it. */
const READER_GET = ["inbox"];
const READER_POST = ["msgread", "msghide", "reply"];
const MSG = require("../public/messages.js");
const REPLY_MAX = 1000, BODY_MAX = 12000, TO_MAX = 200;
/* Readers' replies are off (owner, 14 Oct 2026: "remove the reply for readers
   except i say otherwise"). true puts them back; the inbox needs its reply box back too. */
const REPLIES = false;

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
  const msgs = deps.msgs || require("../lib/messages.js");
  /* A new message pings the readers' phones: the line is stored on each of their
     subscriptions, then an empty push goes out. Overnight (22:00-06:00 Lagos)
     the line waits for the 9am push, like "your slip landed". Returns phones pinged. */
  const ping = deps.ping || (async (uids, note, iso) => {
    const subs = await msgs.noteSubs(uids, note, iso);
    if (!subs.length || require("../lib/vapid.js").quietHours(now())) return 0;
    const out = await require("../lib/pushsend.js").pushTo(subs);
    return (out && out.sent) || 0;
  });
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
    else if (ADMIN_POST.includes(action) || READER_POST.includes(action)) { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
    else if (READER_GET.includes(action)) { if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" }); }
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
        /* A reader's whole file, for the lookup by email and the customer view. */
        const profileOf = async (u) => {
          const role = await R.roleOf(db, u, env);
          const devices = (await db.liveSessions(u.id, new Date(t).toISOString()))
            .map((d) => ({ label: d.label, last_used_at: d.last_used_at }));
          return { found: true, id: u.id, email: u.email, role, plan: R.planLabel(role), ff: !!(await db.grantFor(u.email)),
            google: !!u.google_sub, created_at: u.created_at, last_seen_at: u.last_seen_at, devices,
            codes: role === "ff" ? await admin.slipsOf("u:" + u.id) : null };
        };
        if (action === "readers") {
          const list = await msgs.readers();
          return list ? H.sendJson(res, 200, { readers: list }) : H.sendJson(res, 503, { error: "unavailable" });
        }
        /* THE CUSTOMER VIEW: everything we hold on one reader, and their messages. */
        if (action === "reader") {
          const id = String((req.query || {}).id || "");
          if (!C.UUID_RE.test(id)) return H.sendJson(res, 400, { error: "bad_request" });
          const u = await db.userById(id);
          if (!u) return H.sendJson(res, 404, { error: "no_user" });
          await record("lookup", u.email, { found: true, view: "reader" });
          const p = await profileOf(u);
          const row = await db.getUserData(u.id), data = (row && row.data) || {}, prefs = data.prefs || {};
          const pv = (k) => (prefs[k] && typeof prefs[k] === "object" ? prefs[k].v : null);
          const consent = await db.consentFor(u.id);
          return H.sendJson(res, 200, Object.assign(p, { name: pv("name"), avatar: pv("avatar"), book: pv("book"), theme: pv("theme"),
            slips: Object.keys((data.slips && data.slips.items) || {}).length, record: data.record || null,
            mail: !!(consent && !consent.revoked_at), push: await msgs.pushCount(u.id), thread: (await msgs.threadOf(u.id)) || [] }));
        }
        if (action === "threads") {
          const list = await msgs.all();
          if (!list) return H.sendJson(res, 503, { error: "unavailable" });
          const reads = await msgs.readsOf(s.userId);
          return H.sendJson(res, 200, { messages: list, readAt: (reads && reads.read_at) || null });
        }
        if (action === "gifs") {
          const got = await msgs.gifs(String((req.query || {}).q || ""), env);
          return got ? H.sendJson(res, 200, { gifs: got }) : H.sendJson(res, 503, { error: env.GIPHY_API_KEY ? "unavailable" : "no_key" });
        }
        /* Sent to everyone (one row, user_id null) or to chosen readers (a row each).
           The HTML is cleaned here, whatever the page sent. */
        if (action === "send") {
          const b = (await H.readJson(req, 64 * 1024)) || {};
          const html = MSG.clean(b.html);
          if (MSG.isEmpty(html)) return H.sendJson(res, 400, { error: "empty" });
          if (html.length > BODY_MAX) return H.sendJson(res, 400, { error: "too_long" });
          let to = null;
          if (b.to !== "all") {
            to = [...new Set(Array.isArray(b.to) ? b.to.filter((x) => typeof x === "string" && C.UUID_RE.test(x)) : [])];
            if (!to.length || to.length > TO_MAX) return H.sendJson(res, 400, { error: "bad_request" });
          }
          const at = new Date(t).toISOString();
          const got = await msgs.add((to || [null]).map((uid) => ({ created_at: at, user_id: uid, from_admin: true, body: html })));
          if (!got) return H.sendJson(res, 503, { error: "unavailable" });
          await record("send", to ? to.length + " reader" + (to.length === 1 ? "" : "s") : "everyone", { text: MSG.textOf(html).slice(0, 200), to: to || "all" });
          /* A failed ping never fails the send: the message is already in the inbox. */
          let pinged = 0;
          try {
            const words = MSG.textOf(html);
            pinged = await ping(to, { title: "New message from the Wizard 🔮",
              body: words.length > 120 ? words.slice(0, 117) + "..." : words || "Tap to read it", url: "/?msgs=1" }, at);
          } catch (e) { await report(e, { route: "account/send-push" }); }
          return H.sendJson(res, 200, { ok: true, sent: got.length, ids: got.map((m) => m.id), pinged });
        }
        if (action === "unsend") {
          const id = String(((await H.readJson(req, 256)) || {}).id || "");
          if (!/^\d{1,18}$/.test(id)) return H.sendJson(res, 400, { error: "bad_request" });
          if (!(await msgs.unsend(id, new Date(t).toISOString()))) return H.sendJson(res, 404, { error: "no_message" });
          await record("unsend", "message " + id);
          return H.sendJson(res, 200, { ok: true });
        }
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
          return H.sendJson(res, 200, await profileOf(u));
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

      /* The inbox: the reader's thread, every broadcast, and the welcome, newest
         first. The admin's answer also says how many replies wait for them. */
      if (action === "inbox") {
        const user = await db.userById(s.userId);
        if (!user) return H.sendJson(res, 401, { error: "signed_out", reason: "deleted" }, [S.clearCookie(S.COOKIE)]);
        const [list, reads] = await Promise.all([msgs.inboxOf(s.userId), msgs.readsOf(s.userId)]);
        if (!list || !reads) return H.sendJson(res, 503, { error: "unavailable" });
        const isAdmin = (await R.roleOf(db, user, env)) === "admin";
        const gone = new Set(reads.hidden || []);
        const out = list.map((m) => ({ id: m.id, at: m.created_at, mine: !m.from_admin, bcast: m.user_id == null, body: m.body }));
        out.push({ id: 0, at: user.created_at, mine: false, bcast: false, body: MSG.WELCOME });
        for (let i = out.length - 1; i >= 0; i--) if (gone.has(Number(out[i].id))) out.splice(i, 1);
        const seen = Date.parse(reads.read_at || "") || 0;
        return H.sendJson(res, 200, { messages: out, readAt: reads.read_at, bannerAt: reads.banner_at,
          unread: isAdmin ? 0 : out.filter((m) => !m.mine && Date.parse(m.at) > seen).length,
          adminUnread: isAdmin ? (await msgs.repliesSince(reads.read_at)) || 0 : 0 });
      }
      if (action === "msgread") {
        const what = ((await H.readJson(req, 256)) || {}).what;
        if (what !== "inbox" && what !== "banner") return H.sendJson(res, 400, { error: "bad_request" });
        const done = await msgs.markRead(s.userId, what === "inbox" ? "read_at" : "banner_at", new Date(t).toISOString());
        return done ? H.sendJson(res, 200, { ok: true }) : H.sendJson(res, 503, { error: "unavailable" });
      }
      if (action === "msghide") {
        const id = ((await H.readJson(req, 256)) || {}).id;
        if (!/^\d{1,18}$/.test(String(id))) return H.sendJson(res, 400, { error: "bad_request" });
        return (await msgs.hide(s.userId, id)) ? H.sendJson(res, 200, { ok: true }) : H.sendJson(res, 503, { error: "unavailable" });
      }
      /* A reply is plain text, stored as written and escaped wherever it is drawn. */
      if (action === "reply") {
        if (!REPLIES) return H.sendJson(res, 403, { error: "replies_off" });
        const text = String(((await H.readJson(req, 8192)) || {}).text || "").replace(/\r\n?/g, "\n").trim();
        if (!text) return H.sendJson(res, 400, { error: "empty" });
        if (text.length > REPLY_MAX) return H.sendJson(res, 400, { error: "too_long" });
        if (!(await db.rlHit("msg:" + s.userId, 3600, 20))) return H.sendJson(res, 429, { error: "slow_down" });
        const got = await msgs.add([{ created_at: new Date(t).toISOString(), user_id: s.userId, from_admin: false, body: text }]);
        return got && got[0] ? H.sendJson(res, 200, { ok: true, id: got[0].id }) : H.sendJson(res, 503, { error: "unavailable" });
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
