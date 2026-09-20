"use strict";

/**
 * The ask. The rules it has to obey are not stylistic:
 *
 * An unprompted permission dialog is how an origin gets permanently blocked by
 * Chrome, so the ask is never on load - only on a tap, and only where somebody
 * has just read a code.
 *
 * On iOS, web push requires the PWA to be installed first. A button that looks
 * live and does nothing is worse than a sentence explaining why.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

/* pushControl() reads VAPID_PUBLIC_KEY at call time, not at module load, and
 * returns "" with no control at all when it is unset - that's a real branch
 * (Fix round 2, test below), not a missing fixture. Every other test in this
 * file needs a key present to exercise the control itself, so one is set here
 * and restored after the file runs, rather than relying on whatever a shell
 * happens to export - a suite that only passes because VAPID_PUBLIC_KEY leaked
 * in from outside is red for everyone else.
 *
 * Shaped like the real thing (base64url of a 65-byte uncompressed P-256
 * point starting 0x04) so key()'s decode path is exercised honestly instead
 * of short-circuiting on a short dummy string. Not a real key. */
const DUMMY_KEY = (() => {
  const buf = Buffer.alloc(65);
  buf[0] = 4;
  for (let i = 1; i < 65; i++) buf[i] = i;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
})();
const REAL_KEY = process.env.VAPID_PUBLIC_KEY;
test.before(() => { process.env.VAPID_PUBLIC_KEY = DUMMY_KEY; });
test.after(() => {
  if (REAL_KEY === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = REAL_KEY;
});

test("the ask only ever happens on a tap", () => {
  const html = P.pushControl();
  const clickAt = html.indexOf('addEventListener("click"');
  const askAt = html.indexOf("Notification.requestPermission(");
  assert.ok(clickAt >= 0, "must register a click handler");
  assert.ok(askAt >= 0, "must call requestPermission somewhere");
  assert.ok(clickAt < askAt,
    "permission must be requested inside the click handler, never before it");
  const count = html.split("Notification.requestPermission(").length - 1;
  assert.strictEqual(count, 1, "requestPermission must be called exactly once");
});

test("a browser that cannot do this is shown nothing", () => {
  const html = P.pushControl();
  assert.match(html, /"PushManager" in window/);
  assert.match(html, /Notification\.permission==="denied"/);
});

test("an iPhone that has not installed the site is told why", () => {
  const html = P.pushControl();
  assert.match(html, /standalone/);
  assert.match(html, /home screen/i);
});

test("the control is on the hub and on a day page", () => {
  const day = { date: "2026-09-20", codes: { sporty: "QZ5TFX" }, legs: [] };
  assert.match(P.renderCodesHub([day], () => null), /id="pushAsk"/);
  assert.match(P.renderCodesDay(day, () => null), /id="pushAsk"/);
});

test("turning it off deletes the row and the subscription", () => {
  const html = P.pushControl();
  assert.match(html, /method:"DELETE"/);
  assert.match(html, /unsubscribe\(\)/);
});

/* fetch() resolves on a 503 same as on a 200 - only a network failure rejects.
 * If the script does not read r.ok, a reader who taps subscribe while
 * Supabase is down ends up with a browser subscription, a button that says
 * "Notifications on", and a server that never heard about it: no notification
 * ever arrives and nothing tells them why. Run the actual emitted script
 * against a fetch stub that returns {ok:false, status:503} and check it does
 * not draw the "on" state. */
function extractScript(html) {
  return html.match(/<script>([\s\S]*)<\/script>/)[1];
}

function runPushScript(html, opts) {
  const host = { innerHTML: "", hidden: true, _click: null,
    addEventListener(type, cb) { if (type === "click") this._click = cb; } };
  const sub = { endpoint: "https://push.example/ep",
    toJSON: () => ({ endpoint: "https://push.example/ep", keys: { p256dh: "a", auth: "b" } }) };
  const reg = { pushManager: {
    getSubscription: () => Promise.resolve(opts.existingSub ? sub : null),
    subscribe: () => Promise.resolve(sub),
  } };
  const document = { getElementById: () => host };
  const Notification = { permission: "default",
    requestPermission: () => Promise.resolve("granted") };
  /* The script gates on `"Notification" in window`, not `in navigator` - the
     stub has to put it there or every run returns on the first line. */
  const window = { PushManager: function () {}, Notification,
    matchMedia: () => ({ matches: false }) };
  const navigator = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    serviceWorker: { getRegistration: () => Promise.resolve(null),
      register: () => Promise.resolve(reg) } };
  const fetch = opts.fetch || (() => Promise.resolve({ ok: true, status: 200 }));
  const atob = (s) => Buffer.from(s, "base64").toString("binary");
  const run = new Function("document", "navigator", "window", "Notification", "fetch", "atob",
    extractScript(html));
  run(document, navigator, window, Notification, fetch, atob);
  return host;
}

async function flush(n) {
  for (let i = 0; i < (n || 8); i++) await Promise.resolve();
}

test("a subscribe that Supabase never stored does not draw as subscribed", async () => {
  const html = P.pushControl();
  const host = runPushScript(html, {
    fetch: () => Promise.resolve({ ok: false, status: 503 }),
  });
  await flush();
  host._click({ target: { closest: () => true } });
  await flush();
  assert.doesNotMatch(host.innerHTML, /Notifications on/,
    "must not claim success when the server rejected the subscription");
});

test("a subscribe the server accepts does draw as subscribed", async () => {
  const html = P.pushControl();
  const host = runPushScript(html, {
    fetch: () => Promise.resolve({ ok: true, status: 200 }),
  });
  await flush();
  host._click({ target: { closest: () => true } });
  await flush();
  assert.match(host.innerHTML, /Notifications on/);
});

test("with no VAPID_PUBLIC_KEY, pushControl ships no control at all", () => {
  const saved = process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PUBLIC_KEY;
  try {
    assert.strictEqual(P.pushControl(), "",
      "a button that can never work is worse than no button");
  } finally {
    process.env.VAPID_PUBLIC_KEY = saved;
  }
});
