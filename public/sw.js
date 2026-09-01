/* Soccerwizard service worker - offline shell + fresh data
 *
 * Bump VERSION on any change here: the activate handler deletes every cache
 * whose name does not match, which is what clears a stale shell.
 *
 * The page itself is network-first. It used to be cache-first, which meant a
 * phone or an installed app served the previous index.html on every launch and
 * only picked up a deploy on some later run, so shipped fixes appeared not to
 * exist. Static assets stay cache-first, since those are the ones worth having
 * instantly and they change under a new name when they change at all.
 */
const VERSION = "sw-v7";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/wiz-logo.png"];

/* THE KILL SWITCH. Set to true, deploy, and every installed worker deletes its
 * caches, unregisters itself and reloads its tabs onto the plain network.
 *
 * This exists because a service worker is the only thing here that outlives a
 * deploy. Everything else is fixed by shipping a correction; a worker that
 * serves a broken shell keeps serving it, and the reader has no obvious way
 * back. Rolling forward is not a recovery plan when the broken code is the
 * thing deciding what "forward" means.
 *
 * Browsers revalidate the worker script on navigation, so this reaches a phone
 * on its next visit without the reader doing anything. Leave it true for a few
 * days before removing the worker entirely, or clients that were offline
 * during the window will never hear about it. */
const KILL = false;

/* Hashed bundles are immutable and arrive under a new name on every deploy, so
 * the cache would otherwise grow by one copy of the app per deploy and never
 * shrink. Nothing evicts it: the cache name only changes when this file does.
 * Twenty-four is several deploys' worth of history, which is all that is ever
 * useful - an older bundle can only be served to a page that stopped asking
 * for it. */
const HASHED = /^\/app\.[0-9a-z]+\.(js|css)$/i;
const ASSET_MAX = 24;

self.addEventListener("install", function (e) {
  self.skipWaiting();
  if (KILL) return;
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});

self.addEventListener("activate", function (e) {
  if (KILL) {
    /* Order matters: drop the caches first, so that if unregister() or the
       reload fails the worker is at least no longer able to answer with
       anything stale. */
    e.waitUntil(
      caches.keys()
        .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
        .then(function () { return self.registration.unregister(); })
        .then(function () { return self.clients.matchAll({ type: "window" }); })
        .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); })
        .catch(function () {})
    );
    return;
  }
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Cache.keys() answers in insertion order, so the excess to drop is the front
   of the list - the bundles cached longest ago. */
function trimAssets(c) {
  return c.keys().then(function (keys) {
    var hashed = keys.filter(function (k) {
      try { return HASHED.test(new URL(k.url).pathname); } catch (err) { return false; }
    });
    if (hashed.length <= ASSET_MAX) return null;
    return Promise.all(hashed.slice(0, hashed.length - ASSET_MAX).map(function (k) { return c.delete(k); }));
  }).catch(function () { return null; });
}

function keep(req, res) {
  if (!res || res.status !== 200 || res.type !== "basic") return;
  var copy = res.clone();
  caches.open(VERSION).then(function (c) {
    return c.put(req, copy).then(function () { return trimAssets(c); });
  }).catch(function () {});
}

self.addEventListener("fetch", function (e) {
  if (KILL) return;
  var req = e.request;
  if (req.method !== "GET") return;
  /* Only handle http(s). Extension-injected requests use chrome-extension://
     (and similar schemes), which Cache.put rejects with a TypeError.

     This read `req.url.split(":")[0]` and tested it against /^https?:$/. The
     split yields "https" with no colon; the pattern requires the colon. So it
     matched NOTHING, and the worker returned early on every request it was
     ever given - no offline shell, no cache-first assets, no network-first
     page. It shipped in 9cfdea0 and silently disabled the entire file, which
     is why the two fixes after it appeared to change nothing.

     Compare the parsed protocol instead: it carries the colon by definition
     and cannot drift from what the URL actually is. */
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  /* Live data / APIs: straight to the network, and never written to the cache.
     There is deliberately no cache fallback here. Nothing ever stores these,
     so a fallback could only ever return undefined, and the callers already
     handle a failed fetch - fetchPayload retries and then falls back to the
     other route by itself. */
  if (/\/api\//.test(url.pathname) || url.host.indexOf("railway.app") >= 0) {
    e.respondWith(fetch(req));
    return;
  }

  /* The manifest goes with the page, not with the assets.
     It was being served cache-first, which is how a fixed manifest stayed
     broken: Chrome reads this file to decide whether the site can be
     installed at all, and it was reading a copy from an earlier deploy. The
     background refresh does not help, because the answer has already been
     given by then. Unlike a hashed asset the manifest keeps one name forever,
     so cache-first is the wrong default for it. */
  var isManifest = url.pathname === "/manifest.webmanifest";

  // The page: network first, cache only as the offline fallback. A navigation
  // request covers a normal load; the Accept sniff catches the rest.
  var isPage = isManifest || req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") >= 0;

  if (isPage) {
    e.respondWith(
      fetch(req).then(function (res) {
        keep(req, res);
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          /* The shell stands in for a page that will not load. It must not
             stand in for the manifest, which would hand Chrome an HTML
             document where it expects JSON. */
          return isManifest ? Response.error() : caches.match("/index.html");
        });
      })
    );
    return;
  }

  /* Assets, and predictions.json: cache-first, refreshed in the background.
     A stale payload is deliberately allowed to paint. The board carries its
     own build time and the page compares it - anything older than
     PAYLOAD_MAX_AGE_MS makes fetchPayload call refreshPayload(), which asks
     /api/predictions and so goes to the network above, not to this cache.
     Painting instantly and correcting beats a blank screen on a slow phone,
     which is the whole reason this file exists. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        keep(req, res);
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
