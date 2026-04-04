/* =====================================================
   ENROLLGEN SERVICE WORKER
   Caches the app shell for offline capability.
   ===================================================== */

const CACHE_NAME = "enrollgen-v1";
const isLocalhost =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

// Install — pre-cache app shell
self.addEventListener("install", (event) => {
  if (isLocalhost) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/", "/index.html"]);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  if (isLocalhost) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
    );
    self.clients.claim();
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener("fetch", (event) => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension")) return;
  if (isLocalhost) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for same-origin requests
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback to index.html for navigation requests (SPA)
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});
