"use strict";
const test = require("node:test");
const assert = require("node:assert");
const G = require("../lib/auth/google.js");
const NOW = Date.UTC(2026, 8, 29, 10);
const good = () => ({ iss: "https://accounts.google.com", aud: "cid", sub: "1098", email: "Ade@Gmail.com",
  email_verified: true, nonce: "n1", iat: NOW / 1000 - 5, exp: NOW / 1000 + 3600 });
const opts = { clientId: "cid", nonce: "n1", nowMs: NOW };

test("PKCE challenge is S256 of the verifier (RFC 7636 appendix B)", () => {
  assert.strictEqual(G.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("the Google URL asks for openid email with state, nonce and PKCE", () => {
  const u = new URL(G.authUrl({ clientId: "cid", redirectUri: "https://www.soccerwizard.live/api/auth/google/callback",
    state: "st", nonce: "n1", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" }));
  assert.strictEqual(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const q = Object.fromEntries(u.searchParams);
  assert.deepStrictEqual(q, { response_type: "code", client_id: "cid",
    redirect_uri: "https://www.soccerwizard.live/api/auth/google/callback", scope: "openid email",
    state: "st", nonce: "n1", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256", prompt: "select_account" });
});

test("good claims pass and the email comes back normalised", () => {
  assert.deepStrictEqual(G.checkClaims(good(), opts), { ok: true, sub: "1098", email: "ade@gmail.com", name: "" });
  assert.strictEqual(G.checkClaims(Object.assign(good(), { iss: "accounts.google.com" }), opts).ok, true);
});

test("every broken claim is refused", () => {
  const cases = {
    iss: { iss: "https://evil.example" },
    aud: { aud: "someone-else" },
    exp: { exp: NOW / 1000 - 1 },
    iat: { iat: NOW / 1000 + 600 },
    nonce: { nonce: "n2" },
    unverified: { email_verified: false },
    sub: { sub: "" },
    email: { email: "not-an-email" },
  };
  for (const why of Object.keys(cases)) {
    const r = G.checkClaims(Object.assign(good(), cases[why]), opts);
    assert.deepStrictEqual(r, { ok: false, why }, why);
  }
  assert.strictEqual(G.checkClaims(Object.assign(good(), { nonce: undefined }), opts).ok, false, "missing nonce");
  assert.deepStrictEqual(G.checkClaims(null, opts), { ok: false, why: "no_token" });
});

test("an ID token that is not three base64url parts decodes to nothing", () => {
  const body = Buffer.from(JSON.stringify({ sub: "1" })).toString("base64url");
  assert.deepStrictEqual(G.decodePayload("h." + body + ".s"), { sub: "1" });
  for (const bad of ["", "a.b", "a.%%%.c", "a.b.c.d", null]) assert.strictEqual(G.decodePayload(bad), null, String(bad));
});

test("the code exchange posts the verifier and returns only the id_token", async () => {
  let seen = null;
  global.fetch = async (url, init) => { seen = { url: String(url), init }; return { ok: true, status: 200, json: async () => ({ id_token: "a.b.c", access_token: "x" }) }; };
  const t = await G.exchangeCode({ code: "c1", verifier: "v1", clientId: "cid", clientSecret: "sec", redirectUri: "https://x/cb" });
  assert.strictEqual(t, "a.b.c");
  assert.strictEqual(seen.url, "https://oauth2.googleapis.com/token");
  const f = new URLSearchParams(seen.init.body);
  assert.strictEqual(f.get("grant_type"), "authorization_code");
  assert.strictEqual(f.get("code_verifier"), "v1");
  assert.strictEqual(f.get("client_secret"), "sec");
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) });
  assert.strictEqual(await G.exchangeCode({ code: "c1", verifier: "v1", clientId: "cid", clientSecret: "sec", redirectUri: "https://x/cb" }), null);
  global.fetch = async () => { throw new Error("down"); };
  assert.strictEqual(await G.exchangeCode({ code: "c1", verifier: "v1", clientId: "cid", clientSecret: "sec", redirectUri: "https://x/cb" }), null);
  delete global.fetch;
});

const crypto = require("crypto");
function keyPair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: Object.assign(publicKey.export({ format: "jwk" }), { kid, alg: "RS256", use: "sig" }) };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(k, claims, header) {
  const h = b64(Object.assign({ alg: "RS256", kid: k.kid, typ: "JWT" }, header || {})), p = b64(claims);
  return h + "." + p + "." + crypto.sign("RSA-SHA256", Buffer.from(h + "." + p), k.privateKey).toString("base64url");
}
const VNOW = Date.UTC(2026, 8, 30, 12);
const vgood = (o) => Object.assign({ iss: "https://accounts.google.com", aud: "cid", sub: "g-9", email: "Tunde.A@gmail.com",
  email_verified: true, given_name: "Tunde", nonce: "n1", iat: VNOW / 1000 - 5, exp: VNOW / 1000 + 3600 }, o || {});
function certs(keys, counter) {
  return async () => { if (counter) counter.n++; return { ok: true, headers: { get: () => "public, max-age=3600" }, json: async () => ({ keys: keys.map((k) => k.jwk) }) }; };
}

test("verifyIdToken: a Google-signed token with our audience and nonce passes, and gives a first name", async () => {
  G._resetKeys();
  const k = keyPair("k1");
  const r = await G.verifyIdToken(sign(k, vgood()), { clientId: "cid", nonce: "n1", nowMs: VNOW, fetch: certs([k]) });
  assert.deepStrictEqual(r, { ok: true, sub: "g-9", email: "tunde.a@gmail.com", name: "Tunde" });
});

test("verifyIdToken refuses: wrong key, tampered body, wrong aud, wrong nonce, expired, alg none, HS256", async () => {
  G._resetKeys();
  const k = keyPair("k1"), other = keyPair("k1");
  const o = { clientId: "cid", nonce: "n1", nowMs: VNOW, fetch: certs([k]) };
  assert.strictEqual((await G.verifyIdToken(sign(other, vgood()), o)).why, "sig");
  const t = sign(k, vgood()).split("."); t[1] = b64(vgood({ email: "evil@x.com" }));
  assert.strictEqual((await G.verifyIdToken(t.join("."), o)).why, "sig");
  assert.strictEqual((await G.verifyIdToken(sign(k, vgood({ aud: "other" })), o)).why, "aud");
  assert.strictEqual((await G.verifyIdToken(sign(k, vgood({ nonce: "n2" })), o)).why, "nonce");
  assert.strictEqual((await G.verifyIdToken(sign(k, vgood({ exp: VNOW / 1000 - 1 })), o)).why, "exp");
  assert.strictEqual((await G.verifyIdToken(b64({ alg: "none", kid: "k1" }) + "." + b64(vgood()) + ".", o)).why, "alg");
  assert.strictEqual((await G.verifyIdToken(sign(k, vgood(), { alg: "HS256" }), o)).why, "alg");
  assert.strictEqual((await G.verifyIdToken("garbage", o)).why, "shape");
});

test("verifyIdToken caches Google's keys and refetches once for a new kid", async () => {
  G._resetKeys();
  const k1 = keyPair("k1"), k2 = keyPair("k2"), n = { n: 0 };
  let set = [k1];
  const fetch = async () => certs(set, n)();
  const o = { clientId: "cid", nonce: "n1", nowMs: VNOW, fetch };
  assert.ok((await G.verifyIdToken(sign(k1, vgood()), o)).ok);
  assert.ok((await G.verifyIdToken(sign(k1, vgood()), o)).ok);
  assert.strictEqual(n.n, 1, "second call used the cache");
  set = [k1, k2];
  assert.ok((await G.verifyIdToken(sign(k2, vgood()), o)).ok, "rotated key found after one refetch");
  assert.strictEqual(n.n, 2);
  assert.strictEqual((await G.verifyIdToken(sign(keyPair("k3"), vgood()), o)).why, "kid");
});

test("verifyIdToken says keys when Google's key endpoint is down", async () => {
  G._resetKeys();
  const r = await G.verifyIdToken(sign(keyPair("k1"), vgood()), { clientId: "cid", nonce: "n1", nowMs: VNOW, fetch: async () => { throw new Error("down"); } });
  assert.deepStrictEqual(r, { ok: false, why: "keys" });
});
