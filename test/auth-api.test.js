// test/auth-api.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb, fakeRes, postReq, getReq, sessionCookie } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");
const realGoogle = require("../lib/auth/google.js");
const realEmail = require("../lib/auth/emailcode.js");

process.env.AUTH_PEPPER = "p".repeat(64);
process.env.GOOGLE_CLIENT_ID = "cid";
process.env.GOOGLE_CLIENT_SECRET = "sec";
const { make } = require("../api/auth.js");

function world() {
  let T = Date.UTC(2026, 8, 29, 10);
  const clock = () => T;
  const db = fakeDb(clock);
  const w = { db, sent: [], alerts: [], claims: null, verify: async () => ({ ok: false, why: "sig" }), advance(ms) { T += ms; }, clock };
  const google = Object.assign({}, realGoogle, {
    verifyIdToken: async (jwt, o) => w.verify(jwt, o),
    exchangeCode: async () => "h." + Buffer.from(JSON.stringify(w.claims)).toString("base64url") + ".s" });
  const email = Object.assign({}, realEmail, {
    sendCode: async (e, c) => { w.sent.push({ e, c }); return true; },
    sendNewDevice: async (e) => { w.alerts.push(e); return true; } });
  const turnstile = { verify: async (tok) => tok === "ok" };
  const handler = make({ db, google, turnstile, email, now: clock });
  w.call = async (req) => { const res = fakeRes(); await handler(req, res); return res; };
  return w;
}
process.env.AUTH_ENABLED = "1";

async function emailSignIn(w, addr, ua, cookie) {
  await w.call(postReq("email/send", { email: addr, turnstile: "ok" }));
  const code = w.sent[w.sent.length - 1].c;
  const h = Object.assign({}, ua ? { "user-agent": ua } : null, cookie ? { cookie } : null);
  return w.call(postReq("email/verify", { email: addr, code }, Object.keys(h).length ? h : null));
}
async function googleStart(w, ip) {
  const h = ip ? { "x-forwarded-for": ip } : null;
  const prep = await w.call(postReq("google/prepare", { return: "/booking-codes" }, h));
  const start = await w.call(getReq("google/start", { a: new URL("https://x" + prep.json().start).searchParams.get("a") }, h));
  const loc = new URL(start.headers.location);
  const attempt = w.db.t.attempts[w.db.t.attempts.length - 1];
  w.claims = { iss: "https://accounts.google.com", aud: "cid", sub: "g-1", email: "Ade@Gmail.com", email_verified: true,
    nonce: attempt.nonce, iat: w.clock() / 1000, exp: w.clock() / 1000 + 3600 };
  return { state: loc.searchParams.get("state"), start };
}

test("switched off, every route is a plain 404", async () => {
  const w = world();
  process.env.AUTH_ENABLED = "0";
  try {
    for (const r of ["google/prepare", "email/send", "devices", "nope"]) assert.strictEqual((await w.call(postReq(r, {}))).code, 404, r);
  } finally { process.env.AUTH_ENABLED = "1"; }
});

test("cross-site requests are refused before any work", async () => {
  const w = world();
  assert.strictEqual((await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }, { origin: "https://evil.example" }))).code, 403);
  const noHeader = postReq("email/send", { email: "a@b.com", turnstile: "ok" }); delete noHeader.headers["x-sw-request"];
  assert.strictEqual((await w.call(noHeader)).code, 403);
  assert.strictEqual((await w.call(getReq("email/send"))).code, 405);
  assert.strictEqual(w.sent.length, 0);
});

test("Review Focus 4: capitals and spaces in the email, spaces in the code, still signs in", async () => {
  const w = world();
  assert.strictEqual((await w.call(postReq("email/send", { email: "  Ade@Gmail.COM ", turnstile: "ok" }))).code, 200);
  assert.strictEqual(w.sent[0].e, "ade@gmail.com");
  const c = w.sent[0].c;
  const r = await w.call(postReq("email/verify", { email: "ade@gmail.com ", code: " " + c.slice(0, 3) + " " + c.slice(3) + " " }));
  assert.strictEqual(r.code, 200);
  assert.ok(sessionCookie(r));
  const dev = await w.call(getReq("devices", {}, { cookie: sessionCookie(r) }));
  assert.strictEqual(dev.json().devices.length, 1);
  assert.strictEqual(dev.json().devices[0].current, true);
  assert.strictEqual(dev.json().devices[0].label, "Chrome on Android");
});

test("a code works once", async () => {
  const w = world();
  await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }));
  const code = w.sent[0].c;
  assert.strictEqual((await w.call(postReq("email/verify", { email: "a@b.com", code }))).code, 200);
  const again = await w.call(postReq("email/verify", { email: "a@b.com", code }));
  assert.strictEqual(again.code, 400); assert.strictEqual(again.json().error, "used");
  assert.strictEqual(sessionCookie(again), null);
});

test("five wrong tries kill the code, and the right one no longer works", async () => {
  const w = world();
  await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }));
  const code = w.sent[0].c, wrong = code === "000000" ? "111111" : "000000";
  for (let i = 1; i <= 4; i++) {
    const r = await w.call(postReq("email/verify", { email: "a@b.com", code: wrong }));
    assert.deepStrictEqual(r.json(), { error: "wrong", left: 5 - i });
  }
  assert.deepStrictEqual((await w.call(postReq("email/verify", { email: "a@b.com", code: wrong }))).json(), { error: "dead" });
  const late = await w.call(postReq("email/verify", { email: "a@b.com", code }));
  assert.strictEqual(late.code, 400); assert.strictEqual(sessionCookie(late), null);
});

test("an expired code is refused", async () => {
  const w = world();
  await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }));
  w.advance(realEmail.CODE_TTL_MS + 1);
  assert.deepStrictEqual((await w.call(postReq("email/verify", { email: "a@b.com", code: w.sent[0].c }))).json(), { error: "expired" });
});

test("no email without the bot check, and not more than 3 per address in 15 minutes", async () => {
  const w = world();
  assert.deepStrictEqual((await w.call(postReq("email/send", { email: "a@b.com", turnstile: "bad" }))).json(), { error: "bot" });
  for (let i = 0; i < 3; i++) assert.strictEqual((await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }))).code, 200);
  const fourth = await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }));
  assert.strictEqual(fourth.code, 429); assert.deepStrictEqual(fourth.json(), { error: "slow_down", minutes: 15 });
  assert.strictEqual(w.sent.length, 3);
});

test("the answer to 'send me a code' is the same whether or not the account exists", async () => {
  const w = world();
  await emailSignIn(w, "known@b.com");
  const a = await w.call(postReq("email/send", { email: "known@b.com", turnstile: "ok" }));
  const b = await w.call(postReq("email/send", { email: "unknown@b.com", turnstile: "ok" }));
  assert.strictEqual(a.code, b.code); assert.strictEqual(a.body, b.body);
});

test("Google: the happy path in one browser lands on the return path, signed in", async () => {
  const w = world();
  const g = await googleStart(w);
  assert.strictEqual(g.start.code, 302);
  assert.match(g.start.headers.location, /^https:\/\/accounts\.google\.com\//);
  assert.match(g.start.cookies()[0], /^__Host-sw_oauth=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  const cb = await w.call(getReq("google/callback", { code: "c1", state: g.state }, { cookie: S.OAUTH_COOKIE + "=" + g.state }));
  assert.strictEqual(cb.code, 302);
  assert.strictEqual(cb.headers.location, "/booking-codes");
  assert.ok(sessionCookie(cb));
  assert.strictEqual(w.db.t.users[0].email, "ade@gmail.com");
  assert.strictEqual(w.db.t.users[0].google_sub, "g-1");
});

test("Google: a replayed or forged state gets nothing", async () => {
  const w = world();
  const g = await googleStart(w);
  const cookie = { cookie: S.OAUTH_COOKIE + "=" + g.state };
  await w.call(getReq("google/callback", { code: "c1", state: g.state }, cookie));
  const replay = await w.call(getReq("google/callback", { code: "c1", state: g.state }, cookie));
  assert.strictEqual(replay.code, 400); assert.strictEqual(sessionCookie(replay), null);
  const forged = await w.call(getReq("google/callback", { code: "c1", state: "f".repeat(64) }, { cookie: S.OAUTH_COOKIE + "=" + "f".repeat(64) }));
  assert.strictEqual(forged.code, 400); assert.strictEqual(sessionCookie(forged), null);
});

test("Google: a start link works once", async () => {
  const w = world();
  const prep = await w.call(postReq("google/prepare", {}));
  const a = new URL("https://x" + prep.json().start).searchParams.get("a");
  assert.strictEqual((await w.call(getReq("google/start", { a }))).code, 302);
  assert.strictEqual((await w.call(getReq("google/start", { a }))).code, 400);
});

test("Google: a claim that fails (wrong nonce) signs nobody in", async () => {
  const w = world();
  const g = await googleStart(w);
  w.claims.nonce = "other";
  const cb = await w.call(getReq("google/callback", { code: "c1", state: g.state }, { cookie: S.OAUTH_COOKIE + "=" + g.state }));
  assert.strictEqual(cb.code, 400); assert.strictEqual(sessionCookie(cb), null);
  assert.strictEqual(w.db.t.users.length, 0);
});

test("Google finished in another browser signs nobody in, even on the same network", async () => {
  const w = world();
  const g = await googleStart(w, "102.89.9.9");
  // Same public IP (shared Wi-Fi / carrier NAT), but no oauth cookie: a different browser.
  const cb = await w.call(getReq("google/callback", { code: "c1", state: g.state }, { "x-forwarded-for": "102.89.9.9" }));
  assert.strictEqual(cb.code, 400);
  assert.match(cb.body, /Finish in the same browser/);
  assert.strictEqual(sessionCookie(cb), null);
  assert.strictEqual(w.db.t.users.length, 0);
  assert.strictEqual(w.db.t.sessions.length, 0);
});

test("prepare hands the page only the start link", async () => {
  const w = world();
  const prep = await w.call(postReq("google/prepare", {}));
  assert.deepStrictEqual(Object.keys(prep.json()), ["start"]);
});

test("the new-device email goes out from the second sign-in on, not the first", async () => {
  const w = world();
  await emailSignIn(w, "a@b.com");
  assert.deepStrictEqual(w.alerts, []);
  await emailSignIn(w, "a@b.com");
  assert.deepStrictEqual(w.alerts, ["a@b.com"]);
});

test("a reader can end only their own devices", async () => {
  const w = world();
  const a = sessionCookie(await emailSignIn(w, "a@b.com"));
  const b = sessionCookie(await emailSignIn(w, "b@b.com"));
  const aId = (await w.call(getReq("devices", {}, { cookie: a }))).json().devices[0].id;
  const r = await w.call(postReq("devices/end", { id: aId }, { cookie: b }));
  assert.strictEqual(r.code, 404);
  assert.strictEqual((await w.call(getReq("devices", {}, { cookie: a }))).code, 200, "A still signed in");
});

test("a fourth device signs out the oldest, which then sees why", async () => {
  const w = world();
  const first = sessionCookie(await emailSignIn(w, "a@b.com"));
  // The fake limiter has no windows; clear it so the 3-codes-per-15-minutes rule does not stop the test.
  for (let i = 0; i < 3; i++) { w.advance(1000); w.db.t.rl = {}; await emailSignIn(w, "a@b.com"); }
  const r = await w.call(getReq("devices", {}, { cookie: first }));
  assert.strictEqual(r.code, 401);
  assert.deepStrictEqual(r.json(), { error: "signed_out", reason: "displaced" });
});

test("signing in again in the same browser replaces that browser's session, not another device's", async () => {
  const w = world();
  const a = sessionCookie(await emailSignIn(w, "a@b.com"));
  w.advance(1000); w.db.t.rl = {};
  const b = sessionCookie(await emailSignIn(w, "a@b.com"));
  w.advance(1000); w.db.t.rl = {};
  const c = sessionCookie(await emailSignIn(w, "a@b.com"));
  w.advance(1000); w.db.t.rl = {};
  const again = sessionCookie(await emailSignIn(w, "a@b.com", null, a));
  assert.notStrictEqual(again, a, "device A gets a fresh session token");
  assert.strictEqual((await w.call(getReq("devices", {}, { cookie: b }))).code, 200, "B still signed in");
  assert.strictEqual((await w.call(getReq("devices", {}, { cookie: c }))).code, 200, "C still signed in");
  const aToken = a.split("=")[1];
  const aSession = w.db.t.sessions.find((s) => s.token_hash === require("../lib/auth/crypto.js").sha256hex(aToken));
  assert.strictEqual(aSession.end_reason, "replaced");
});

test("sign out everywhere ends every session", async () => {
  const w = world();
  const one = sessionCookie(await emailSignIn(w, "a@b.com"));
  const two = sessionCookie(await emailSignIn(w, "a@b.com"));
  const r = await w.call(postReq("logout-all", {}, { cookie: one }));
  assert.strictEqual(r.code, 200);
  assert.match(r.cookies()[0], /^__Host-sw_session=; .*Max-Age=0$/);
  assert.strictEqual((await w.call(getReq("devices", {}, { cookie: two }))).code, 401);
});

test("a missing or short pepper stops sign-in rather than weakening it", async () => {
  const w = world();
  const saved = process.env.AUTH_PEPPER; process.env.AUTH_PEPPER = "short";
  try { assert.strictEqual((await w.call(postReq("email/send", { email: "a@b.com", turnstile: "ok" }))).code, 503); }
  finally { process.env.AUTH_PEPPER = saved; }
});

async function oneTap(w, body, h) {
  const n = (await w.call(postReq("google/nonce", {}, h))).json();
  w.verify = async (jwt, o) => jwt === "good" && o.nonce === n.nonce && o.clientId === "cid"
    ? { ok: true, sub: "g-7", email: "tunde.a@gmail.com", name: "Tunde" } : { ok: false, why: "sig" };
  return w.call(postReq("google/onetap", Object.assign({ credential: "good", nonce_id: n.nonce_id }, body || {}), h));
}

test("One Tap: a nonce, a verified token, a session, first-time flag and a first name", async () => {
  const w = world();
  const r = await oneTap(w);
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.json(), { ok: true, first: true, name: "Tunde" });
  assert.ok(sessionCookie(r));
  assert.strictEqual(w.db.t.users[0].google_sub, "g-7");
  const again = await oneTap(w);
  assert.strictEqual(again.json().first, false, "second sign-in is not first");
});

test("Review Focus 3: the same One Tap nonce cannot be used twice", async () => {
  const w = world();
  const n = (await w.call(postReq("google/nonce", {}))).json();
  w.verify = async (jwt, o) => o.nonce === n.nonce ? { ok: true, sub: "g-7", email: "t@x.com", name: "" } : { ok: false, why: "nonce" };
  const b = { credential: "good", nonce_id: n.nonce_id };
  assert.strictEqual((await w.call(postReq("google/onetap", b))).code, 200);
  const second = await w.call(postReq("google/onetap", b));
  assert.strictEqual(second.code, 401);
  assert.deepStrictEqual(second.json(), { error: "google_failed" });
  assert.strictEqual(w.db.t.sessions.length, 1);
});

test("One Tap refuses a bad token, an unknown or expired nonce, a redirect-flow attempt id, and reports Google down", async () => {
  const w = world();
  const n = (await w.call(postReq("google/nonce", {}))).json();
  w.verify = async () => ({ ok: false, why: "sig" });
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: n.nonce_id }))).code, 401);
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: "00000000-0000-4000-8000-999999999999" }))).code, 401);
  const prep = await w.call(postReq("google/prepare", {}));
  const aid = new URL("https://x" + prep.json().start).searchParams.get("a");
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: aid }))).code, 401, "a redirect attempt is not a One Tap nonce");
  const n2 = (await w.call(postReq("google/nonce", {}))).json();
  w.advance(11 * 60e3);
  w.verify = async () => ({ ok: true, sub: "s", email: "a@b.com", name: "" });
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: n2.nonce_id }))).code, 401, "expired nonce");
  const n3 = (await w.call(postReq("google/nonce", {}))).json();
  w.verify = async () => ({ ok: false, why: "keys" });
  const down = await w.call(postReq("google/onetap", { credential: "x", nonce_id: n3.nonce_id }));
  assert.strictEqual(down.code, 503);
  assert.deepStrictEqual(down.json(), { error: "google_down" });
});

test("One Tap links an existing email account instead of making a second one", async () => {
  const w = world();
  await emailSignIn(w, "tunde.a@gmail.com");
  const r = await oneTap(w);
  assert.strictEqual(r.json().first, false);
  assert.strictEqual(w.db.t.users.length, 1);
  assert.strictEqual(w.db.t.users[0].google_sub, "g-7");
});

test("Review Focus 4: an unticked box writes no consent on any path; a ticked one does, with its source", async () => {
  const w = world();
  await oneTap(w, { optin: false });
  await emailSignIn(w, "b@x.com");
  const g = await googleStart(w);
  await w.call(getReq("google/callback", { state: g.state, code: "c" }, { cookie: S.OAUTH_COOKIE + "=" + g.state }));
  assert.deepStrictEqual(w.db.t.consent, {});

  const w2 = world();
  await oneTap(w2, { optin: true });
  const uid = w2.db.t.users[0].id;
  assert.strictEqual(w2.db.t.consent[uid].source, "google-onetap");

  const w3 = world();
  await w3.call(postReq("email/send", { email: "c@x.com", turnstile: "ok" }));
  await w3.call(postReq("email/verify", { email: "c@x.com", code: w3.sent[0].c, optin: true }));
  assert.strictEqual(w3.db.t.consent[w3.db.t.users[0].id].source, "email-code");

  const w4 = world();
  const prep = await w4.call(postReq("google/prepare", { optin: true }));
  const start = await w4.call(getReq("google/start", { a: new URL("https://x" + prep.json().start).searchParams.get("a") }));
  const loc = new URL(start.headers.location), a = w4.db.t.attempts[0];
  w4.claims = { iss: "https://accounts.google.com", aud: "cid", sub: "g-2", email: "d@x.com", email_verified: true,
    nonce: a.nonce, iat: w4.clock() / 1000, exp: w4.clock() / 1000 + 3600 };
  const st = loc.searchParams.get("state");
  await w4.call(getReq("google/callback", { state: st, code: "c" }, { cookie: S.OAUTH_COOKIE + "=" + st }));
  assert.strictEqual(w4.db.t.consent[w4.db.t.users[0].id].source, "google-redirect");
});

test("email/verify now says whether the account is new", async () => {
  const w = world();
  assert.deepStrictEqual((await emailSignIn(w, "e@x.com")).json(), { ok: true, first: true, name: "" });
  assert.deepStrictEqual((await emailSignIn(w, "e@x.com")).json(), { ok: true, first: false, name: "" });
});

const K = require("../lib/auth/consent.js");
test("Review Focus 5: unsubscribe works by GET or by a bare POST, and only with the right token", async () => {
  const w = world();
  await oneTap(w, { optin: true });
  const uid = w.db.t.users[0].id, tok = K.unsubToken(process.env.AUTH_PEPPER, uid);
  const bad = await w.call({ method: "GET", query: { route: "unsub", u: uid, t: "x".repeat(22) }, headers: {} });
  assert.strictEqual(bad.code, 400);
  assert.strictEqual(w.db.t.consent[uid].revoked_at, null);
  const ok = await w.call({ method: "GET", query: { route: "unsub", u: uid, t: tok }, headers: {} });
  assert.strictEqual(ok.code, 200);
  assert.match(ok.body, /You're unsubscribed/);
  assert.ok(w.db.t.consent[uid].revoked_at);
  w.db.t.consent[uid].revoked_at = null;
  const post = await w.call({ method: "POST", query: { route: "unsub", u: uid, t: tok }, headers: {}, body: "List-Unsubscribe=One-Click" });
  assert.strictEqual(post.code, 200, "one-click POST from a mail client carries no X-SW-Request");
  assert.ok(w.db.t.consent[uid].revoked_at);
});
