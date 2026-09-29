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
  assert.deepStrictEqual(G.checkClaims(good(), opts), { ok: true, sub: "1098", email: "ade@gmail.com" });
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
