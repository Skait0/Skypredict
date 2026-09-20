"use strict";

/**
 * WEB PUSH: the parts that can be wrong silently.
 *
 * A push that is signed wrongly comes back as a bare 401 from Google with no
 * explanation, and a push sent at the wrong moment wakes somebody up. Both are
 * cheap to assert here and expensive to discover in production.
 */

const test = require("node:test");
const assert = require("node:assert");

const DB = require("../lib/supabase.js");

test("the push helpers refuse to run unconfigured rather than throwing", async () => {
  /* No SUPABASE_URL in the test environment, so every call takes the guard
     path. It must be the same shape as every other helper in the file: an
     answer, not an exception, because the caller is a daily workflow. */
  const put = await DB.putPushSub({ endpoint: "https://fcm.googleapis.com/x", p256dh: "k", auth: "a" });
  assert.strictEqual(put.ok, false);
  const list = await DB.listPushSubs();
  assert.strictEqual(list.ok, false);
  assert.deepStrictEqual(list.rows, []);
});

test("dropping nothing is a no-op, not a request", async () => {
  const out = await DB.dropPushSubs([]);
  assert.deepStrictEqual(out, { ok: true, dropped: 0 });
});

test("a subscription with no endpoint is never stored", async () => {
  const out = await DB.putPushSub({ p256dh: "k", auth: "a" });
  assert.strictEqual(out.ok, false);
  assert.match(out.why, /nothing to store/);
});

test("dropPushSubs escapes a backslash before the closing quote, not after", () => {
  /* Old code did .replace(/"/g, '\\"') only. For endpoint `x\`, that produces
     the list literal `"x\"` - the trailing backslash escapes the closing
     quote instead of ending the value, merging it with whatever follows in
     the list. Backslash-first escaping keeps the quote a real terminator:
     `x\` becomes `"x\\"`, a value containing one escaped backslash. */
  const out = DB.pgInFilter(['x\\', 'a"b']);
  assert.strictEqual(out, '("x\\\\","a\\"b")');
});

const crypto = require("crypto");
const V = require("../lib/vapid.js");

/* A throwaway pair, generated per run. The real pair lives in a GitHub secret
   and never appears in this repo. */
function pair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKeyB64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey,
  };
}

test("only a real push service may be handed a daily POST", () => {
  assert.ok(V.allowedEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(V.allowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"));
  assert.ok(V.allowedEndpoint("https://web.push.apple.com/abc"));
  assert.ok(V.allowedEndpoint("https://xyz.notify.windows.com/w/?token=1"));
  /* The route is unauthenticated, so this list is the security boundary: a
     stranger otherwise hands us a URL of their choosing and we POST to it
     every day, from our own infrastructure, for free. */
  assert.strictEqual(V.allowedEndpoint("https://evil.example/x"), false);
  assert.strictEqual(V.allowedEndpoint("http://fcm.googleapis.com/x"), false, "https only");
  assert.strictEqual(V.allowedEndpoint("https://fcm.googleapis.com.evil.example/x"), false,
    "a suffix check that matches a prefix is not a check");
  assert.strictEqual(V.allowedEndpoint(""), false);
});

test("the JWT is what a push service will actually accept", () => {
  const k = pair();
  const now = Date.UTC(2026, 8, 20, 12, 0, 0);
  const jwt = V.jwtFor("https://fcm.googleapis.com/fcm/send/abc",
    { privateKeyB64: k.privateKeyB64, subject: "mailto:tobi@soccerwizard.live", nowMs: now });

  const [h, p, s] = jwt.split(".");
  const head = JSON.parse(Buffer.from(h, "base64url").toString());
  const body = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.deepStrictEqual(head, { typ: "JWT", alg: "ES256" });
  /* The audience is the ORIGIN of the endpoint. Sending the full path is the
     classic mistake and earns a 401 with no body. */
  assert.strictEqual(body.aud, "https://fcm.googleapis.com");
  assert.strictEqual(body.sub, "mailto:tobi@soccerwizard.live");
  assert.ok(body.exp > now / 1000, "already expired");
  assert.ok(body.exp - now / 1000 <= 86400, "push services reject an exp more than 24h out");

  const sig = Buffer.from(s, "base64url");
  /* Raw r||s, 64 bytes - NOT the DER encoding node hands back by default. A
     DER signature is the other silent 401. */
  assert.strictEqual(sig.length, 64);
  const ok = crypto.verify("sha256", Buffer.from(h + "." + p),
    { key: k.publicKey, dsaEncoding: "ieee-p1363" }, sig);
  assert.ok(ok, "the signature does not verify against its own key");
});

test("nobody is woken up at half past eleven", () => {
  /* Lagos is UTC+1, so 23:30 Lagos is 22:30Z. */
  assert.strictEqual(V.quietHours(Date.UTC(2026, 8, 20, 22, 30)), true);
  assert.strictEqual(V.quietHours(Date.UTC(2026, 8, 20, 4, 0)), true, "05:00 Lagos");
  assert.strictEqual(V.quietHours(Date.UTC(2026, 8, 20, 6, 0)), false, "07:00 Lagos");
  assert.strictEqual(V.quietHours(Date.UTC(2026, 8, 20, 12, 0)), false, "13:00 Lagos");
  assert.strictEqual(V.quietHours(Date.UTC(2026, 8, 20, 20, 59)), false, "21:59 Lagos");
  assert.strictEqual(V.quietHours(Date.UTC(2026, 8, 20, 21, 0)), true, "22:00 Lagos exactly");
});

const S = require("../scripts/pushcode.js");

test("the sender announces the newest code, not today's", () => {
  /* mkcode runs at midday UTC, so for half the clock there is no entry dated
     today. code-today.json follows the same rule and the two must agree, or
     the notification names a day the site is not showing. */
  const got = S.newestEntry({
    "2026-09-19": { date: "2026-09-19", codes: { sporty: "A" }, legs: [1] },
    "2026-09-20": { date: "2026-09-20", codes: { sporty: "B" }, legs: [1, 2] },
  });
  assert.strictEqual(got.date, "2026-09-20");
  assert.strictEqual(S.newestEntry({}), null);
  assert.strictEqual(
    S.newestEntry({ "2026-09-20": { date: "2026-09-20", codes: {}, legs: [] } }), null,
    "an entry with no bookmaker code is nothing to announce");
});

test("the sender waits for the deploy rather than pointing at yesterday", async () => {
  /* The mint commits, Vercel builds, and a push sent immediately arrives
     before the site serves the new code. The reader taps and lands on
     yesterday's - which is exactly the complaint this feature exists to fix. */
  let n = 0;
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ date: ++n < 3 ? "2026-09-19" : "2026-09-20" }),
  });
  const ok = await S.awaitDeploy("2026-09-20", { fetchImpl, tries: 5, waitMs: 0 });
  assert.strictEqual(ok, true);
  assert.strictEqual(n, 3, "it must keep asking until the date matches");
});

test("a deploy that never lands sends nothing at all", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ date: "2026-09-19" }) });
  const ok = await S.awaitDeploy("2026-09-20", { fetchImpl, tries: 3, waitMs: 0 });
  assert.strictEqual(ok, false);
});

test("a dead subscription is dropped, a busy push service is left alone", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith("gone")) return { status: 410, ok: false };
    if (url.endsWith("busy")) return { status: 429, ok: false };
    return { status: 201, ok: true };
  };
  const out = await S.sendAll(
    [{ endpoint: "https://fcm.googleapis.com/fcm/send/ok" },
     { endpoint: "https://fcm.googleapis.com/fcm/send/gone" },
     { endpoint: "https://fcm.googleapis.com/fcm/send/busy" }],
    { fetchImpl, jwt: () => "tok", publicKey: "PUB" });

  assert.strictEqual(out.sent, 1);
  assert.strictEqual(out.failed, 1, "429 is tomorrow's problem, not a dead row");
  assert.deepStrictEqual(out.dead, ["https://fcm.googleapis.com/fcm/send/gone"]);

  /* The push itself: no body at all, which is the whole reason there is no
     encryption in this repo. */
  const one = seen[0].init;
  assert.strictEqual(one.method, "POST");
  assert.strictEqual(one.body, undefined);
  assert.strictEqual(one.headers.Authorization, "vapid t=tok, k=PUB");
  assert.strictEqual(one.headers.TTL, "3600");
});

test("a missing or broken codes file does not crash the sender", async () => {
  /* The read/parse in main() is the one place a workflow could go red for
     free after the code has already published. Break the read the same way
     an absent or half-written file would, and assert the behaviour: no
     rejection, no non-zero exit code - not a source string. */
  const fs = require("fs");
  const realRead = fs.readFileSync;
  fs.readFileSync = () => { throw new Error("ENOENT: no such file or directory"); };
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    await assert.doesNotReject(() => S.main());
    assert.notStrictEqual(process.exitCode, 1);
  } finally {
    fs.readFileSync = realRead;
    process.exitCode = before;
  }
});
