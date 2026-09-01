"use strict";

/**
 * The service worker, which had no tests at all.
 *
 * It is the only file here that outlives a deploy. Everything else is fixed by
 * shipping a correction; a worker that decides wrongly what to serve keeps
 * deciding it on someone's phone, across visits, after the bug is fixed. That
 * makes it the worst file in the repo to be guessing about, and until now it
 * was the only one nothing asserted anything about.
 *
 * The worker is loaded from its real source with a stub `self`, `caches` and
 * `fetch`, the same way the front-end tests lift functions out of index.html -
 * a reimplementation here would test a worker we do not ship.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const SW = path.join(__dirname, "..", "public", "sw.js");
const SRC = fs.readFileSync(SW, "utf8");

/* ------------------------------------------------------------- the stubs */

class Res {
  constructor(body, opts) {
    opts = opts || {};
    this.body = body;
    this.status = opts.status === undefined ? 200 : opts.status;
    this.type = opts.type === undefined ? "basic" : opts.type;
  }
  clone() { return new Res(this.body, { status: this.status, type: this.type }); }
  static error() { return new Res(null, { status: 0, type: "error" }); }
}

function req(url, opts) {
  opts = opts || {};
  const h = opts.headers || {};
  return {
    url: url.indexOf("://") > 0 ? url : "https://www.soccerwizard.live" + url,
    method: opts.method || "GET",
    mode: opts.mode || "no-cors",
    headers: { get: (k) => h[String(k).toLowerCase()] || null },
  };
}

function makeCaches() {
  const stores = new Map();
  function open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const cache = {
      put: (rq, rs) => { m.set(rq.url, rs); return Promise.resolve(); },
      /* Insertion order, which is what the trim relies on. */
      keys: () => Promise.resolve([...m.keys()].map((u) => ({ url: u }))),
      delete: (k) => Promise.resolve(m.delete(k.url || k)),
      match: (rq) => Promise.resolve(m.get(typeof rq === "string"
        ? "https://www.soccerwizard.live" + rq : rq.url)),
      addAll: (list) => { list.forEach((u) => m.set("https://www.soccerwizard.live" + u, new Res(u))); return Promise.resolve(); },
    };
    return Promise.resolve(cache);
  }
  return {
    stores,
    api: {
      open,
      keys: () => Promise.resolve([...stores.keys()]),
      delete: (n) => Promise.resolve(stores.delete(n)),
      match: (rq) => {
        const want = typeof rq === "string" ? "https://www.soccerwizard.live" + rq : rq.url;
        for (const m of stores.values()) if (m.has(want)) return Promise.resolve(m.get(want));
        return Promise.resolve(undefined);
      },
    },
  };
}

/* Loads the real sw.js. `kill` rewrites the one constant, which is exactly what
   deploying the kill switch does. */
function load(opts) {
  opts = opts || {};
  const src = SRC.replace("const KILL = false;", "const KILL = " + (opts.kill ? "true" : "false") + ";");
  assert.ok(src !== SRC || !opts.kill, "the KILL constant was not found to rewrite");

  const on = {};
  const c = makeCaches();
  const state = { fetches: [], navigated: [], unregistered: false, waits: [] };

  const netFor = opts.net || (() => Promise.resolve(new Res("net")));
  const fetchStub = (rq) => { state.fetches.push(rq.url); return netFor(rq); };

  const self = {
    addEventListener: (t, f) => { on[t] = f; },
    skipWaiting: () => {},
    registration: { unregister: () => { state.unregistered = true; return Promise.resolve(true); } },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(state.windows || []),
    },
  };

  new Function("self", "caches", "fetch", "Response", "URL", src)(
    self, c.api, fetchStub, Res, URL);

  return { on, caches: c, state, self };
}

/* Drives one fetch event and resolves to whatever the worker answered, or the
   string "passthrough" when it declined to handle the request at all. */
function fire(on, request) {
  let answered = null;
  const e = { request, respondWith: (p) => { answered = p; }, waitUntil: () => {} };
  on.fetch(e);
  return answered === null ? Promise.resolve("passthrough") : Promise.resolve(answered);
}

/* -------------------------------------------------------------- the API */

test("api requests go to the network and are never cached", async () => {
  const w = load();
  const res = await fire(w.on, req("/api/predictions"));
  assert.strictEqual(res.body, "net");
  for (const m of w.caches.stores.values()) {
    assert.strictEqual(m.has("https://www.soccerwizard.live/api/predictions"), false,
      "a prediction payload must never be written to the cache");
  }
});

test("the railway host counts as api too", async () => {
  const w = load();
  await fire(w.on, req("https://web-production-798c0.up.railway.app/api/livescores"));
  assert.strictEqual(w.state.fetches.length, 1, "it must reach the network");
});

test("a failed api call rejects rather than resolving to undefined", async () => {
  /* The old code answered a failed API fetch with caches.match(req), which
     nothing ever populates, so the caller got a promise resolving to undefined
     instead of a rejection - a fetch that neither succeeded nor threw. The
     callers already retry and fall back to the other route on a throw. */
  const w = load({ net: () => Promise.reject(new Error("offline")) });
  await assert.rejects(() => fire(w.on, req("/api/predictions")));
});

/* -------------------------------------------------------------- the page */

test("the page is network-first", async () => {
  const w = load();
  const res = await fire(w.on, req("/", { mode: "navigate" }));
  assert.strictEqual(res.body, "net");
  assert.strictEqual(w.state.fetches.length, 1);
});

test("the page falls back to cache when the network is gone", async () => {
  const w = load({ net: () => Promise.reject(new Error("offline")) });
  const c = await w.caches.api.open("sw-v7");
  await c.put(req("/"), new Res("cached page"));
  const res = await fire(w.on, req("/", { mode: "navigate" }));
  assert.strictEqual(res.body, "cached page");
});

test("an uncached page falls back to the shell, but the manifest does not", async () => {
  /* Handing Chrome an HTML document where it expects JSON is how a broken
     manifest stays broken. */
  const w = load({ net: () => Promise.reject(new Error("offline")) });
  const c = await w.caches.api.open("sw-v7");
  await c.put(req("/index.html"), new Res("shell"));

  const page = await fire(w.on, req("/some/deep/link", { mode: "navigate" }));
  assert.strictEqual(page.body, "shell");

  const man = await fire(w.on, req("/manifest.webmanifest"));
  assert.strictEqual(man.type, "error", "the shell must not stand in for the manifest");
});

test("an html accept header counts as a page even without navigate mode", async () => {
  const w = load();
  await fire(w.on, req("/x", { headers: { accept: "text/html,*/*" } }));
  assert.strictEqual(w.state.fetches.length, 1);
});

/* ------------------------------------------------------------- the assets */

test("assets are served from cache first", async () => {
  const w = load();
  const c = await w.caches.api.open("sw-v7");
  await c.put(req("/app.abc123.js"), new Res("cached bundle"));
  const res = await fire(w.on, req("/app.abc123.js"));
  assert.strictEqual(res.body, "cached bundle");
});

test("an uncached asset comes from the network", async () => {
  const w = load();
  const res = await fire(w.on, req("/app.new.js"));
  assert.strictEqual(res.body, "net");
});

/* --------------------------------------------------------- the cache trim */

test("hashed bundles are capped, oldest dropped first", async () => {
  /* Every deploy emits a new app.<hash>.js under a name nothing will ever ask
     for again. The cache name only changes when sw.js changes, so without a
     trim a phone accumulates one copy of the app per deploy, forever. */
  const w = load();
  const c = await w.caches.api.open("sw-v7");
  for (let i = 0; i < 30; i++) await c.put(req("/app.h" + i + ".js"), new Res("b" + i));

  await fire(w.on, req("/app.h30.js"));
  await new Promise((r) => setTimeout(r, 10));

  const keys = await c.keys();
  const hashed = keys.filter((k) => /^\/app\./.test(new URL(k.url).pathname));
  assert.ok(hashed.length <= 24, "expected the cap to hold, got " + hashed.length);
  assert.strictEqual(hashed.some((k) => k.url.endsWith("/app.h0.js")), false,
    "the oldest bundle should have gone first");
  assert.ok(hashed.some((k) => k.url.endsWith("/app.h30.js")),
    "the one just fetched must survive its own trim");
});

test("the trim leaves the shell alone", async () => {
  /* index.html and the logo are not hashed and must not be counted or evicted;
     they are the offline fallback. */
  const w = load();
  const c = await w.caches.api.open("sw-v7");
  await c.put(req("/index.html"), new Res("shell"));
  await c.put(req("/wiz-logo.png"), new Res("logo"));
  for (let i = 0; i < 30; i++) await c.put(req("/app.k" + i + ".css"), new Res("c" + i));

  await fire(w.on, req("/app.k30.css"));
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(await c.match(req("/index.html")), "the shell must survive");
  assert.ok(await c.match(req("/wiz-logo.png")), "the logo must survive");
});

/* ------------------------------------------------------------ what to skip */

test("non-GET and non-http requests are left alone", async () => {
  const w = load();
  assert.strictEqual(await fire(w.on, req("/api/x", { method: "POST" })), "passthrough");
  assert.strictEqual(await fire(w.on, req("chrome-extension://abc/inject.js")), "passthrough",
    "Cache.put rejects extension schemes with a TypeError");
});

/* ------------------------------------------------------------- activation */

test("activate drops caches from older versions", async () => {
  const w = load();
  await w.caches.api.open("sw-v6");
  await w.caches.api.open("sw-v7");
  const waits = [];
  await w.on.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepStrictEqual([...w.caches.stores.keys()], ["sw-v7"]);
});

/* ------------------------------------------------------------ the kill switch */

test("KILL makes the worker stand aside on every request", async () => {
  const w = load({ kill: true });
  assert.strictEqual(await fire(w.on, req("/", { mode: "navigate" })), "passthrough");
  assert.strictEqual(await fire(w.on, req("/app.abc.js")), "passthrough");
  assert.strictEqual(w.state.fetches.length, 0, "it must not even proxy - the page goes direct");
});

test("KILL deletes every cache, unregisters, and reloads open tabs", async () => {
  const w = load({ kill: true });
  await w.caches.api.open("sw-v6");
  await w.caches.api.open("sw-v7");
  const navigated = [];
  w.state.windows = [{ url: "https://www.soccerwizard.live/", navigate: (u) => navigated.push(u) }];

  const waits = [];
  await w.on.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);

  assert.strictEqual(w.caches.stores.size, 0, "every cache must go, not just the old ones");
  assert.strictEqual(w.state.unregistered, true, "the registration must be torn down");
  assert.deepStrictEqual(navigated, ["https://www.soccerwizard.live/"],
    "open tabs are reloaded onto the network, or they keep the dead worker until closed");
});

test("KILL does not pre-cache the shell on install", async () => {
  const w = load({ kill: true });
  const waits = [];
  w.on.install({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.strictEqual(w.caches.stores.size, 0,
    "a worker on its way out must not populate a cache first");
});

/* --------------------------------------------------------------- the file */

test("the kill switch is off in what we ship", () => {
  assert.match(SRC, /const KILL = false;/,
    "sw.js must never be committed with the kill switch armed");
});

test("the version and the cache name cannot drift apart", () => {
  /* They used to be one constant named CACHE. Two names for one thing is how
     an activate handler ends up deleting the cache it just filled. */
  assert.strictEqual((SRC.match(/const VERSION = "sw-v\d+";/g) || []).length, 1);
  assert.doesNotMatch(SRC, /caches\.open\((?!VERSION)/,
    "every cache open must go through VERSION");
});
