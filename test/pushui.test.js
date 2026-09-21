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

test("the control is on the hub and on a day page", () => {
  const day = { date: "2026-09-20", codes: { sporty: "QZ5TFX" }, legs: [] };
  assert.match(P.renderCodesHub([day], () => null), /id="pushAsk"/);
  assert.match(P.renderCodesDay(day, () => null), /id="pushAsk"/);
});

test("and it ships with the CSS that makes it a pill", () => {
  /* PUSH_CSS is a template literal, and a comment inside it once carried a
     backtick: the literal closed on that line, the rest parsed as one string
     multiplied by another, and PUSH_CSS became NaN. Both pages kept rendering
     - CSS ignores a stray "NaN" silently - and the control sat there unstyled
     for a week. Nothing else in the suite reads the emitted stylesheet, so
     nothing caught it. This does. */
  const day = { date: "2026-09-20", codes: { sporty: "QZ5TFX" }, legs: [] };
  for (const [name, html] of [["hub", P.renderCodesHub([day], () => null)],
                              ["day", P.renderCodesDay(day, () => null)]]) {
    assert.ok(html.includes(".ck-askb{"), name + " ships no button CSS");
    assert.ok(html.includes(".ck-how"), name + " ships no steps CSS");
    /* Comments ship with the CSS, and the one above this block says "NaN" on
       purpose - strip them before looking for the real thing. */
    assert.ok(!/NaN/.test(html.replace(/\/\*[\s\S]*?\*\//g, "")),
      name + " has a stylesheet that evaluated to NaN");
  }
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
  opts = opts || {};
  /* What the run did, as opposed to what its source says it would do. */
  const calls = { fetch: [], unsubscribed: 0, subscribeOpts: null };
  const host = { innerHTML: "", hidden: true, _click: null, _calls: calls,
    addEventListener(type, cb) { if (type === "click") this._click = cb; } };
  const sub = { endpoint: "https://push.example/ep",
    toJSON: () => ({ endpoint: "https://push.example/ep", keys: { p256dh: "a", auth: "b" } }),
    unsubscribe: () => { calls.unsubscribed++; return Promise.resolve(true); } };
  const reg = { pushManager: {
    getSubscription: () => Promise.resolve(opts.existingSub ? sub : null),
    subscribe: (o) => { calls.subscribeOpts = o; return Promise.resolve(sub); },
  } };
  const document = { getElementById: () => host };
  const Notification = { permission: "default",
    requestPermission: () => Promise.resolve(opts.permission || "granted") };
  /* The script gates on `"Notification" in window`, not `in navigator` - the
     stub has to put it there or every run returns on the first line. */
  const window = { Notification,
    matchMedia: () => ({ matches: !!opts.standalone }) };
  /* Safari on iOS exposes PushManager ONLY inside an installed app, so a stub
     that always has it cannot see the bug this file's iPhone test exists for. */
  if (!opts.noPushManager) window.PushManager = function () {};
  const navigator = { userAgent: opts.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    serviceWorker: { getRegistration: () => Promise.resolve(null),
      register: () => Promise.resolve(reg) } };
  const answer = opts.fetch || (() => Promise.resolve({ ok: true, status: 200 }));
  const fetch = (url, init) => { calls.fetch.push({ url, init }); return answer(url, init); };
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

test("an iPhone that has not installed the site is told why, not given a button", () => {
  /* Apple requires the PWA installed before web push works at all, so the
     button would ask for permission and then fail. Drive the real script with
     an iPhone user agent outside a standalone window and read what it drew. */
  const host = runPushScript(P.pushControl(), {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15",
    standalone: false,
  });
  assert.match(host.innerHTML, /home screen/i);
  assert.doesNotMatch(host.innerHTML, /ck-askb/, "a button here can never work");
  assert.strictEqual(host.hidden, false, "the explanation is the whole point - show it");
});

test("and it is told so in Safari, which has no PushManager to gate on", () => {
  /* The bug this was written for. The capability guard ran first, and mobile
     Safari fails it: PushManager exists only inside an installed app. So the
     page that was supposed to explain the install showed nothing at all, and
     the button appeared only where it was already working. */
  const host = runPushScript(P.pushControl(), {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15",
    standalone: false,
    noPushManager: true,
  });
  assert.match(host.innerHTML, /Home Screen/i, "mobile Safari was shown nothing");
  assert.strictEqual(host.hidden, false);
});

test("the X in-app browser is not told to tap a Share button it does not have", () => {
  /* Where this page's readers actually come from: a link in the X app opens
     in X's own webview on iPhone, and that webview cannot add anything to the
     Home Screen. "Tap Share and Add to Home Screen" sent them looking for a
     button that could never work. */
  const host = runPushScript(P.pushControl(), {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 Twitter for iPhone",
    standalone: false,
    noPushManager: true,
  });
  assert.match(host.innerHTML, /Open in Safari/,
    "the only route out of an in-app browser is Safari");
  assert.doesNotMatch(host.innerHTML.split("<details")[0],
    /add Soccerwizard to your Home Screen/,
    "the first line must not instruct something this browser cannot do");
  assert.strictEqual(host.hidden, false);
});

test("Safari gets the Share glyph and the steps in order", () => {
  const host = runPushScript(P.pushControl(), {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15",
    standalone: false,
    noPushManager: true,
  });
  assert.match(host.innerHTML, /<svg/, "naming a button is weaker than showing it");
  const steps = host.innerHTML.match(/<li>/g) || [];
  assert.strictEqual(steps.length, 3, "Share, Add to Home Screen, Add");
  assert.ok(host.innerHTML.indexOf("Add to Home Screen") > host.innerHTML.indexOf("Share"),
    "the steps have to be in the order they are tapped");
});

test("an installed iPhone app is given the button, not the install note", async () => {
  const host = runPushScript(P.pushControl(), {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15",
    standalone: true,
  });
  await flush();
  assert.match(host.innerHTML, /ck-askb/, "an installed app can do this");
});

test("turning it off deletes the row and the subscription", async () => {
  const host = runPushScript(P.pushControl(), { existingSub: true });
  await flush();
  assert.match(host.innerHTML, /Notifications on/, "starts in the subscribed state");
  host._click({ target: { closest: () => true } });
  await flush();

  const del = host._calls.fetch.filter((c) => c.init && c.init.method === "DELETE");
  assert.strictEqual(del.length, 1, "the row has to go, or the daily send keeps trying");
  assert.strictEqual(JSON.parse(del[0].init.body).endpoint, "https://push.example/ep");
  assert.strictEqual(host._calls.unsubscribed, 1,
    "the browser subscription has to go too, or the push still arrives");
  assert.doesNotMatch(host.innerHTML, /Notifications on/);
});

test("the subscription is userVisibleOnly, which is not optional", async () => {
  /* Chrome refuses a subscribe() without it outright, and a push that shows
     nothing earns the browser's own "this site was updated in the
     background" notice, which is worse than any message we could write. */
  const host = runPushScript(P.pushControl(), {});
  await flush();
  host._click({ target: { closest: () => true } });
  await flush();
  assert.ok(host._calls.subscribeOpts, "subscribe() was never called");
  assert.strictEqual(host._calls.subscribeOpts.userVisibleOnly, true);
});

test("declining the prompt takes the button away", async () => {
  /* Otherwise the control sits there looking live, and the next tap re-asks a
     browser that has already made up its mind. */
  const host = runPushScript(P.pushControl(), { permission: "denied" });
  await flush();
  assert.strictEqual(host.hidden, false, "drawn before the tap");
  host._click({ target: { closest: () => true } });
  await flush();
  assert.strictEqual(host.hidden, true);
  assert.strictEqual(host._calls.fetch.length, 0, "nothing to tell the server about");
});

test("a VAPID_PUBLIC_KEY that is not a key ships no control either", () => {
  /* It is interpolated into inline JS: an unquoted paste or a truncated copy
     is a syntax error on the page, or a button that throws inside subscribe()
     after asking for permission. Neither is better than no button. */
  const saved = process.env.VAPID_PUBLIC_KEY;
  try {
    for (const bad of ["not a key", DUMMY_KEY.slice(0, 40), '";alert(1);var x="',
                       Buffer.alloc(65).toString("base64url")]) {
      process.env.VAPID_PUBLIC_KEY = bad;
      assert.strictEqual(P.pushControl(), "", "shipped a control for: " + bad);
    }
  } finally { process.env.VAPID_PUBLIC_KEY = saved; }
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
