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

/* UNCONFIGURED BY CONSTRUCTION, NOT BY LUCK.
 *
 * The tests below assert the not-configured branch of the push helpers. They
 * used to pass only because the shell happened to export no Supabase
 * credentials - and the spec's handover tells the owner to export exactly
 * those before running the live check. In that shell the same assertions made
 * a real request and inserted a row into the live push_subs table.
 *
 * Deleted here rather than in a test.before, because lib/supabase.js reads
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY once at module load: unsetting
 * them after the require would change nothing at all. */
const REAL_SUPABASE = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function restoreSupabaseEnv() {
  for (const [name, v] of [["SUPABASE_URL", REAL_SUPABASE.url],
                           ["SUPABASE_SERVICE_ROLE_KEY", REAL_SUPABASE.key]]) {
    if (v === undefined) delete process.env[name];
    else process.env[name] = v;
  }
}
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
test.after(restoreSupabaseEnv);

const DB = require("../lib/supabase.js");

test("the push helpers refuse to run unconfigured rather than throwing", async () => {
  /* The guard path, which the env deletion above makes unreachable-by-accident
     rather than merely unlikely. It must be the same shape as every other
     helper in the file: an answer, not an exception, because the caller is a
     daily workflow. */
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

const S = require("../lib/pushsend.js");

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
  assert.strictEqual(out.failed, 1, "429 is the next push's problem, not a dead row");
  assert.deepStrictEqual(out.dead, ["https://fcm.googleapis.com/fcm/send/gone"]);

  /* The push itself: no body at all, which is the whole reason there is no
     encryption in this repo. */
  const one = seen[0].init;
  assert.strictEqual(one.method, "POST");
  assert.strictEqual(one.body, undefined);
  assert.strictEqual(one.headers.Authorization, "vapid t=tok, k=PUB");
  assert.strictEqual(one.headers.TTL, "3600");
});

test("a push service that never answers costs a retry, not a subscriber", async () => {
  const fetchImpl = async () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  };
  const out = await S.sendAll([{ endpoint: "https://fcm.googleapis.com/fcm/send/slow" }],
    { fetchImpl, jwt: () => "tok", publicKey: "PUB" });
  assert.strictEqual(out.failed, 1);
  assert.deepStrictEqual(out.dead, []);
  assert.strictEqual(out.sent, 0);
});

test("pushTo signs with the env keys and hands the dead rows to the drop", async () => {
  const keys = pair();
  let handed = null;
  process.env.VAPID_PRIVATE_KEY = keys.privateKeyB64;
  process.env.VAPID_PUBLIC_KEY = "PUB";
  try {
    const out = await S.pushTo(
      [{ endpoint: "https://fcm.googleapis.com/fcm/send/ok" }, { endpoint: "https://fcm.googleapis.com/fcm/send/gone" }],
      { fetchImpl: async (url) => (url.endsWith("gone") ? { ok: false, status: 410 } : { ok: true, status: 201 }),
        drop: async (list) => { handed = list; return { ok: true, dropped: list.length }; } });
    assert.deepStrictEqual(out, { sent: 1, failed: 0, dropped: 1 });
    assert.deepStrictEqual(handed, ["https://fcm.googleapis.com/fcm/send/gone"]);
  } finally {
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
  }
  assert.strictEqual(await S.pushTo([{ endpoint: "https://fcm.googleapis.com/fcm/send/ok" }]), null,
    "no keys, nothing sent");
});

/* ------------------------------------------------ what the push says */

const PR = require("../api/push.js");
const BOARD = {
  potd: { home: "Arsenal", away: "Chelsea", date: "2026-10-12" },
  potdNext: { home: "Stuttgart II", away: "Hoffenheim II", date: "2026-10-13" },
  fixtures: [
    { home: "Arsenal", away: "Chelsea", date: "2026-10-12", tip: "Home Win", ko: "17:30" },
    { home: "Stuttgart II", away: "Hoffenheim II", date: "2026-10-13", tip: "Over 1.5", time: "17:00" },
  ],
};

test("the 9am push names today's pick, even when the board was built yesterday", () => {
  const nine = Date.UTC(2026, 9, 13, 8, 0);       /* 09:00 Lagos */
  const n = PR.potdNote(nine, BOARD);
  assert.match(n.title, /Pick of the day/);
  assert.strictEqual(n.body, "Stuttgart II vs Hoffenheim II · Over 1.5 · 17:00");
  assert.doesNotMatch(n.body, /%/, "no win-chance numbers in reader copy");
  assert.strictEqual(n.url, "/");
});

test("no pick for today still says something", () => {
  const n = PR.potdNote(Date.UTC(2026, 9, 20, 8, 0), BOARD);
  assert.ok(n.title && n.body, "a push that shows nothing is a strike against us");
});

function res() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = () => {};
  r.json = (o) => { r.body = o; return r; };
  return r;
}

test("the worker's note: the reader's own line once, then the pick", async () => {
  const real = DB.takePushNote;
  let held = { note: { title: "Your slip landed! 🔥🧙", body: "X", url: "/" }, note_at: new Date().toISOString() };
  DB.takePushNote = async () => { const r = held; held = null; return r; };
  try {
    const ep = "https://fcm.googleapis.com/fcm/send/abc";
    const a = res(); await PR({ method: "GET", query: { a: "note", endpoint: ep } }, a);
    assert.strictEqual(a.body.title, "Your slip landed! 🔥🧙");
    const b = res(); await PR({ method: "GET", query: { a: "note", endpoint: ep } }, b);
    assert.ok(b.body.title && b.body.title !== a.body.title, "read once, then the pick of the day");
    const c = res(); await PR({ method: "GET", query: { a: "note", endpoint: "https://evil.example/x" } }, c);
    assert.deepStrictEqual(c.body, {}, "a stranger's URL is never looked up");
  } finally { DB.takePushNote = real; }
});

test("only the cron can send the morning push", async () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "s3cret";
  try {
    const r = res();
    await PR({ method: "GET", query: { a: "morning" }, headers: { authorization: "Bearer nope" } }, r);
    assert.strictEqual(r.code, 401);
  } finally { if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before; }
});

test("Vercel cron sends the morning push at 09:02 Lagos", () => {
  const v = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "vercel.json"), "utf8"));
  const c = v.crons.find((x) => x.path === "/api/push?a=morning");
  assert.ok(c, "no cron for the morning push");
  assert.strictEqual(c.schedule, "2 8 * * *", "08:02 UTC is 09:02 in Lagos");
  assert.strictEqual(v.functions["api/push.js"].includeFiles, "public/predictions.json");
});
