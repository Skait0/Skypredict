"use strict";
/* /api/auth/* - every sign-in route in one function. vercel.json rewrites
   /api/auth/:path* to /api/auth?route=:path*. Each route checks, in order:
   the feature switch, method + CSRF, rate limits, input, then does the work.
   A user id only ever comes from a session or from claims we just verified.
   Spec sections 4 and 5; decisions beyond the spec's letter are listed in the
   plan's Task 10 (HMAC state, conditional claims). Google sign-in must finish
   in the same browser that started it - there is no cross-browser handoff. */
const crypto = require("crypto");
const H = require("../lib/auth/http.js");
const S = require("../lib/auth/session.js");
const C = require("../lib/auth/crypto.js");
const { report } = require("../lib/report.js");

const ATTEMPT_MS = 10 * 60e3;
const iso = (ms) => new Date(ms).toISOString();
const firstIp = (req) => String(((req.headers || {})["x-forwarded-for"]) || "").split(",")[0].trim();
const uaOf = (req) => String(((req.headers || {})["user-agent"]) || "");
const POST_ROUTES = new Set(["google/prepare", "email/send", "email/verify", "logout", "logout-all", "devices/end"]);

function make(deps) {
  const { db, google, turnstile } = deps;
  const E = deps.email;
  const now = deps.now || Date.now;
  const pepper = () => process.env.AUTH_PEPPER || "";
  const stateFor = (a) => C.hmacHex(pepper(), "state:" + a.id + ":" + a.nonce);
  const redirectUri = () => H.ORIGIN + "/api/auth/google/callback";
  const emailKey = (email) => C.hmacHex(pepper(), "email:" + email).slice(0, 32);

  const signedOut = (res, s) => H.sendJson(res, 401, { error: "signed_out", reason: s.reason || null },
    s.state === "ended" ? [S.clearCookie(S.COOKIE)] : null);

  async function signIn(req, user, existed, ua, t) {
    /* Signing in again in the same browser must end that browser's own old
       session first - otherwise it sits alongside the new one, eating a
       device slot until the 4-device cap displaces someone else's session
       to make room for a duplicate of this one. */
    const old = await S.readSession(db, req, t);
    if (old.state === "ok") await db.endSessions([old.session.id], "replaced", iso(t));
    const s = await S.startSession(db, user.id, ua, t);
    if (!s) throw new Error("session insert failed");
    await db.touchUser(user.id, iso(t));
    if (existed) await E.sendNewDevice(user.email, C.deviceLabel(ua));
    return s;
  }

  async function findOrCreateByEmail(email) {
    const u = await db.userByEmail(email);
    if (u) return { user: u, existed: true };
    const made = await db.createUser({ email });
    if (made) return { user: made, existed: false };
    const again = await db.userByEmail(email);          // lost a race with a parallel first sign-in
    return again ? { user: again, existed: true } : null;
  }

  async function mustSession(req, res, t) {
    const s = await S.readSession(db, req, t);
    if (s.state !== "ok") { signedOut(res, s); return null; }
    return s;
  }

  const routes = {
    "google/prepare": async (req, res, t) => {
      if (!(await db.rlHit("gp:" + H.ipKey(req), 3600, 30))) return H.sendJson(res, 429, { error: "slow_down", minutes: 60 });
      const body = (await H.readJson(req, 2048)) || {};
      const id = crypto.randomUUID(), nonce = C.randomToken(), handoff = C.randomToken();
      const row = await db.insertAttempt({
        id, nonce, state_hash: C.sha256hex(stateFor({ id, nonce })), code_verifier: C.randomToken(),
        return_to: H.safeReturn(body.return), handoff_hash: C.sha256hex(handoff), ip_hash: H.ipKey(req),
        expires_at: iso(t + ATTEMPT_MS),
      });
      if (!row) throw new Error("attempt insert failed");
      return H.sendJson(res, 200, { start: "/api/auth/google/start?a=" + id });
    },

    "google/start": async (req, res, t) => {
      const a = await db.attemptById(String((req.query || {}).a || ""));
      if (!a || a.consumed_at || Date.parse(a.expires_at) <= t || !(await db.startAttempt(a.id, iso(t))))
        return H.sendHtml(res, 400, "Sign-in expired", "Go back and tap Continue with Google again.");
      const state = stateFor(a);
      return H.redirect(res, google.authUrl({ clientId: process.env.GOOGLE_CLIENT_ID, redirectUri: redirectUri(),
        state, nonce: a.nonce, verifier: a.code_verifier }), [S.cookie(S.OAUTH_COOKIE, state, 600)]);
    },

    "google/callback": async (req, res, t) => {
      const q = req.query || {};
      const fail = (why) => {
        if (why !== "google:access_denied") report(new Error("google sign-in refused: " + why), { route: "google/callback" });
        return H.sendHtml(res, 400, "Sign-in failed", "Google sign-in did not finish. Go back and try again, or use the email code.",
          [S.clearCookie(S.OAUTH_COOKIE)]);
      };
      if (q.error) return fail("google:" + String(q.error).slice(0, 40));
      const state = String(q.state || "");
      if (!/^[0-9a-f]{64}$/.test(state)) return fail("state shape");
      const a = await db.attemptByState(C.sha256hex(state));
      if (!a || !a.started_at || Date.parse(a.expires_at) <= t) return fail("state unknown or expired");
      if (!(await db.consumeAttempt(a.id, iso(t)))) return fail("state replayed");
      const sameBrowser = C.sameHex(S.readCookie(req, S.OAUTH_COOKIE) || "", state);
      if (!sameBrowser) return H.sendHtml(res, 400, "Finish in the same browser",
        "Google sign-in has to finish in the browser where you started it. Go back to Soccerwizard and use Email me a code instead.",
        [S.clearCookie(S.OAUTH_COOKIE)]);
      const idToken = await google.exchangeCode({ code: String(q.code || ""), verifier: a.code_verifier,
        clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri() });
      const claims = google.checkClaims(google.decodePayload(idToken), { clientId: process.env.GOOGLE_CLIENT_ID, nonce: a.nonce, nowMs: t });
      if (!claims.ok) return fail("claims " + claims.why);
      let user = await db.userBySub(claims.sub), existed = !!user;
      if (!user) {
        const r = await findOrCreateByEmail(claims.email);
        if (!r) throw new Error("user create failed");
        user = r.user; existed = r.existed;
        if (!user.google_sub) await db.linkGoogle(user.id, claims.sub);
      }
      const s = await signIn(req, user, existed, uaOf(req), t);
      return H.redirect(res, H.safeReturn(a.return_to), [s.cookie, S.clearCookie(S.OAUTH_COOKIE)]);
    },

    "email/send": async (req, res, t) => {
      const body = (await H.readJson(req, 4096)) || {};
      const email = C.normEmail(body.email);
      if (!email) return H.sendJson(res, 400, { error: "bad_email" });
      if (!(await db.rlHit("send:ip:" + H.ipKey(req), 3600, 10))) return H.sendJson(res, 429, { error: "slow_down", minutes: 60 });
      if (!(await turnstile.verify(body.turnstile, firstIp(req)))) return H.sendJson(res, 400, { error: "bot" });
      if (!(await db.rlHit("send:e:" + emailKey(email), 900, 3))) return H.sendJson(res, 429, { error: "slow_down", minutes: 15 });
      await db.killCodes(email, iso(t));
      const code = E.newCode();
      if (!(await db.insertCode({ email, code_hash: E.codeHash(pepper(), email, code), expires_at: iso(t + E.CODE_TTL_MS) })))
        throw new Error("code insert failed");
      if (!(await E.sendCode(email, code))) {
        await report(new Error("Resend refused a code email"), { route: "email/send" });
        return H.sendJson(res, 502, { error: "send_failed" });
      }
      return H.sendJson(res, 200, { ok: true });
    },

    "email/verify": async (req, res, t) => {
      const body = (await H.readJson(req, 1024)) || {};
      const email = C.normEmail(body.email);
      if (!email) return H.sendJson(res, 400, { error: "bad_email" });
      if (!(await db.rlHit("verify:ip:" + H.ipKey(req), 3600, 20))) return H.sendJson(res, 429, { error: "slow_down", minutes: 60 });
      const row = await db.latestCode(email);
      const st = E.checkCode(row, pepper(), email, body.code, t);
      if (st === "none" || st === "used") return H.sendJson(res, 400, { error: "used" });
      if (st === "expired" || st === "dead") return H.sendJson(res, 400, { error: st });
      /* Take the try before looking at the answer: two parallel guesses cannot
         both count as the same try. */
      if (!(await db.claimTry(row.id, row.attempts | 0))) return H.sendJson(res, 409, { error: "busy" });
      const tries = (row.attempts | 0) + 1;
      if (st === "wrong") {
        if (tries >= E.MAX_TRIES) { await db.consumeCode(row.id, iso(t)); return H.sendJson(res, 400, { error: "dead" }); }
        return H.sendJson(res, 400, { error: "wrong", left: E.MAX_TRIES - tries });
      }
      if (!(await db.consumeCode(row.id, iso(t)))) return H.sendJson(res, 400, { error: "used" });
      const r = await findOrCreateByEmail(email);
      if (!r) throw new Error("user create failed");
      const s = await signIn(req, r.user, r.existed, uaOf(req), t);
      return H.sendJson(res, 200, { ok: true }, [s.cookie]);
    },

    "logout": async (req, res, t) => {
      const s = await S.readSession(db, req, t);
      if (s.state === "ok") await db.endSessions([s.session.id], "logout", iso(t));
      return H.sendJson(res, 200, { ok: true }, [S.clearCookie(S.COOKIE)]);
    },

    "logout-all": async (req, res, t) => {
      const s = await mustSession(req, res, t);
      if (!s) return;
      await db.endAllSessions(s.userId, "logout_all", iso(t));
      return H.sendJson(res, 200, { ok: true }, [S.clearCookie(S.COOKIE)]);
    },

    "devices": async (req, res, t) => {
      const s = await mustSession(req, res, t);
      if (!s) return;
      const live = await db.liveSessions(s.userId, iso(t));
      return H.sendJson(res, 200, { devices: live.map((d) => ({ id: d.id, label: d.label,
        created_at: d.created_at, last_used_at: d.last_used_at, current: d.id === s.session.id })) }, s.setCookie ? [s.setCookie] : null);
    },

    "devices/end": async (req, res, t) => {
      const s = await mustSession(req, res, t);
      if (!s) return;
      const body = (await H.readJson(req, 512)) || {};
      const live = await db.liveSessions(s.userId, iso(t));
      const target = live.find((d) => d.id === body.id);
      if (!target) return H.sendJson(res, 404, { error: "not_found" });
      await db.endSessions([target.id], "ended_by_user", iso(t));
      return H.sendJson(res, 200, { ok: true }, target.id === s.session.id ? [S.clearCookie(S.COOKIE)] : null);
    },
  };

  return async function handler(req, res) {
    if (!H.enabled()) return H.notFound(res);
    let route = (req.query || {}).route;
    route = Array.isArray(route) ? route.join("/") : String(route || "");
    if (!Object.prototype.hasOwnProperty.call(routes, route)) return H.notFound(res);
    if (POST_ROUTES.has(route)) {
      const g = H.guardPost(req);
      if (g) return H.sendJson(res, g.status, { error: g.error });
    } else if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" });
    if (pepper().length < 32) {
      await report(new Error("AUTH_PEPPER missing or short"), { route });
      return H.sendJson(res, 503, { error: "not_configured" });
    }
    try { return await routes[route](req, res, now()); }
    catch (e) { await report(e, { route }); return H.sendJson(res, 500, { error: "server" }); }
  };
}

module.exports = make({ db: require("../lib/auth/db.js"), google: require("../lib/auth/google.js"),
  turnstile: require("../lib/auth/turnstile.js"), email: require("../lib/auth/emailcode.js") });
module.exports.make = make;
