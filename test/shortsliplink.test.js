"use strict";
/* THE SHARE LINK FOR A SLIP WITH NO BOOKING CODE.
 *
 * Slip of the day is shared before anybody books it, so there is no code to
 * key a short link on, and its Share button fell through to `/s?p=...` - 401
 * characters of base64 measured on the live site with seven legs, and the long
 * form does not carry the code or the book either. rememberSlipLink registers
 * the payload under its own hash when the section renders; this pins that the
 * key is a shape a bookmaker's code can never take, and that the tap uses the
 * short link only when it belongs to the slip being shared.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const SL = require("../lib/sliplink.js");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

/* The two functions under test, run against stubs for everything the page
   gives them. slipPayload is stubbed rather than grabbed: it resolves fixtures
   off the live board, which is a different unit with its own tests. */
function sandbox(payloadOf) {
  const posted = [];
  const shared = [];
  const env = {
    SHORT_SLIP: null,
    slipPayload: payloadOf,
    slipUrl: (picks) => "https://x.test/s?p=" + "A".repeat(380),
    shareText: () => "text",
    shareSlipImage: () => Promise.resolve(false),   // no image share: the fallback path
    doShare: (t, u) => shared.push(u),
    fetch: (u, o) => {
      posted.push(JSON.parse(o.body));
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
    },
    location: { origin: "https://x.test" },
    window: { crypto: globalThis.crypto },
    crypto: globalThis.crypto,
    TextEncoder,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  };
  const names = Object.keys(env);
  const body = grab("rememberSlipLink") + "\n" + grab("shareSlip") + `
    return { rememberSlipLink, shareSlip, get SHORT_SLIP(){return SHORT_SLIP;},
             set SHORT_SLIP(v){SHORT_SLIP=v;} };`;
  const made = new Function(...names, "var SHORT_SLIP=null;" + body)(
    ...names.map((n) => env[n]));
  return { api: made, posted, shared };
}

/* Wait for the async hash-and-post to land, not a fixed 30ms: under the full
   suite's load 30ms was sometimes too short and the test failed on timing. */
async function until(ok, ms = 2000) {
  const t = Date.now();
  while (!ok() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 5));
}

test("the key is a shape no bookmaker code can collide with", async () => {
  const { api, posted } = sandbox(() => "ThunLausanne2026-09-02OVER_1.51.2591");
  api.rememberSlipLink([{}], "sporty");
  await until(() => posted.length >= 1);
  assert.equal(posted.length, 1, "nothing was registered");
  const key = posted[0].code;
  assert.match(key, /^S-[0-9A-F]{12}$/, "key is " + key);
  /* The server validates with cleanCode, so a key it rejects is a link that
     never gets shortened. */
  assert.equal(SL.cleanCode(key), key);
  /* SportyBet and Bet9ja codes are alphanumeric - the hyphen is what makes a
     collision with a real booking code impossible. */
  assert.ok(key.includes("-"));
  assert.equal(posted[0].book, "sporty");
});

test("the same slip registers under the same key twice", async () => {
  const raw = "ThunLausanne2026-09-02OVER_1.51.2591";
  const { api, posted } = sandbox(() => raw);
  api.rememberSlipLink([{}], "sporty");
  api.rememberSlipLink([{}], "sporty");
  await until(() => posted.length >= 2);
  assert.equal(posted[0].code, posted[1].code, "one slip, two rows");
});

test("the tap shares the short link once it has landed", async () => {
  const raw = "ThunLausanne2026-09-02OVER_1.51.2591";
  const { api, shared } = sandbox(() => raw);
  api.rememberSlipLink([{}], "sporty");
  await until(() => api.SHORT_SLIP);
  api.shareSlip([{}], 1.25);
  await until(() => shared.length >= 1);
  assert.equal(shared.length, 1);
  assert.match(shared[0], /^https:\/\/x\.test\/s\/S-[0-9A-F]{12}$/);
  assert.ok(shared[0].length < 60, "still " + shared[0].length + " characters");
});

test("a link from a different slip is never reused", async () => {
  let raw = "ThunLausanne2026-09-02OVER_1.51.2591";
  const { api, shared } = sandbox(() => raw);
  api.rememberSlipLink([{}], "sporty");
  await until(() => api.SHORT_SLIP);
  raw = "BayernUnion2026-09-03OVER_1.51.1883";  // rebuilt
  api.shareSlip([{}], 1.18);
  await until(() => shared.length >= 1);
  assert.match(shared[0], /\/s\?p=/, "shared a cached link for a slip that changed");
});

test("nothing registered still shares, on the long link", async () => {
  const { api, shared, posted } = sandbox(() => "ThunLausanne2026-09-02OVER_1.51.2591");
  api.shareSlip([{}], 1.25);
  await until(() => shared.length >= 1);
  assert.equal(posted.length, 0);
  assert.match(shared[0], /\/s\?p=/);
});

test("an unencodable slip registers nothing rather than a dead row", async () => {
  const { api, posted } = sandbox(() => "");
  api.rememberSlipLink([{}], "sporty");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(posted, []);
});
