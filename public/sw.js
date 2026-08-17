/* Soccerwizard service worker — offline shell + fresh data */
const CACHE = "sw-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/wiz-logo.png"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function(){}); }));
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

  // App shell / assets: cache-first, refresh in background.
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
