/* Soccerwizard service worker — offline shell + fresh data
 *
 * Bump CACHE on any change here: the activate handler deletes every cache
 * whose name does not match, which is what clears a stale shell.
 *
 * The page itself is network-first. It used to be cache-first, which meant a
 * phone or an installed app served the previous index.html on every launch and
 * only picked up a deploy on some later run — so shipped fixes appeared not to
 * exist. Static assets stay cache-first, since those are the ones worth having
 * instantly and they change under a new name when they change at all.
 */
const CACHE = "sw-v5";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/wiz-logo.png"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Live data / APIs: always try network first, don't cache stale predictions.
  if (/\/api\//.test(url.pathname) || url.host.indexOf("railway.app") >= 0) {
    e.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  // The page: network first, cache only as the offline fallback. A navigation
  // request covers a normal load; the Accept sniff catches the rest.
  var isPage = req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") >= 0;

  if (isPage) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("/index.html");
        });
      })
    );
    return;
  }

  // Assets: cache-first, refreshed in the background.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
