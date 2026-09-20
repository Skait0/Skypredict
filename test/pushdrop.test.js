"use strict";

/**
 * The sweep that runs on the worst morning.
 *
 * dropPushSubs is only ever busy when a push service has expired a lot of
 * subscriptions at once, and the whole list used to go into one PostgREST
 * `in.()` filter in the query string. A push endpoint is about 200 characters
 * and percent-encoding roughly doubles that, so forty of them is an ~8 KB
 * request line - exactly the default header buffer in Kong and nginx, which
 * answer 414 and drop the request. The one call that matters, failing on the
 * one day it matters.
 *
 * Its own file because lib/supabase.js reads SUPABASE_URL once at module load:
 * test/push.test.js deletes those variables before requiring it, so nothing
 * there can reach a configured code path.
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = "https://stub.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";
const DB = require("../lib/supabase.js");

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

/* Shaped like the real thing: FCM endpoints are a long opaque registration
   token, and it is the length that breaks the URL, not the count. */
function endpoints(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push("https://fcm.googleapis.com/fcm/send/" + String(i).padStart(4, "0") + "x".repeat(150));
  }
  return out;
}

function record(answer) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    const r = answer ? answer(urls.length) : true;
    return { ok: r, status: r ? 204 : 414, text: async () => "" };
  };
  return urls;
}

test("sixty dead subscriptions go out in chunks no proxy will refuse", async () => {
  const urls = record();
  const out = await DB.dropPushSubs(endpoints(60));

  assert.deepStrictEqual(out, { ok: true, dropped: 60 });
  assert.strictEqual(urls.length, 3, "20 per request, so 60 is three requests");
  for (const u of urls) {
    assert.ok(Buffer.byteLength(u) < 6000,
      "a request line of " + Buffer.byteLength(u) + " bytes is inside 8 KB with room to spare");
  }
});

test("a sweep that fails halfway reports what actually went, not what it tried", async () => {
  /* The old code returned list.length on success and 0 on failure, and the
     caller logged neither - it logged the length of the list it handed over.
     A delete that 414'd every single morning read as a clean sweep. */
  const urls = record((n) => n < 2);
  const out = await DB.dropPushSubs(endpoints(60));

  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.dropped, 20, "the first chunk did land, and the rows are gone");
  assert.match(out.why, /414/);
  assert.strictEqual(urls.length, 2, "stop at the first refusal rather than hammering");
});

test("one dead subscription is still one request", async () => {
  const urls = record();
  const out = await DB.dropPushSubs(endpoints(1));
  assert.deepStrictEqual(out, { ok: true, dropped: 1 });
  assert.strictEqual(urls.length, 1);
});
