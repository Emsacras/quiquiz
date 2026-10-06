const CACHE = "quiquiz-shell-v14";
const PRECACHE = [
  "/",
  "/index.html",
  "/css/style.css",
  "/css/theme-cuicui.css",
  "/js/app.js",
  "/js/images.js",
  "/js/scores.js",
  "/js/onboarding.js",
  "/js/admin-mod.js",
  "/js/report.js",
  "/js/learning.js",
  "/js/progress.js",
  "/js/profile.js",
  "/js/router.js",
  "/assets/favicon.png",
  "/assets/placeholder.svg",
  "/assets/mascot/cui-cui.png",
  "/assets/mascot/fail.png",
  "/assets/mascot/victory.png",
  "/assets/filler/borderleft.png",
  "/assets/filler/borderright.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() =>
      self.clients.claim(),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/") || url.pathname.startsWith("/auth/")) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  // JS/CSS : réseau d’abord pour ne jamais rester coincé sur un ancien app.js.
  if (url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
