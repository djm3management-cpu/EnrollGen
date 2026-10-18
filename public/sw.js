/* =====================================================
   ENROLLGEN SERVICE WORKER
   Caches the app shell for offline capability.
   ===================================================== */

const CACHE_NAME = "enrollgen-v3";
const isLocalhost =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

function shouldRuntimeCache(request, response) {
  if (!response.ok || response.status === 206 || request.headers.has("range") || !request.url.startsWith(self.location.origin)) {
    return false;
  }

  const url = new URL(request.url);
  return (
    request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname.startsWith("/assets/citizenship-docs/") ||
    url.pathname.startsWith("/videos/") ||
    url.pathname.startsWith("/wallpapers/")
  );
}

// Install: pre-cache app shell.
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

// Activate: clean old caches.
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

// Fetch: network first, fall back to cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension")) return;
  if (isLocalhost) return;
  const url = new URL(event.request.url);
  // API/auth/data requests belong entirely to the browser network stack.
  if (url.pathname.startsWith('/.netlify/functions/') || url.pathname.startsWith('/api/') ||
      url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;
  const isStatic = url.origin === self.location.origin && (
    url.pathname.startsWith('/assets/') || url.pathname.startsWith('/videos/') ||
    url.pathname.startsWith('/wallpapers/') || /\.(?:css|js|png|jpg|jpeg|svg|ico|webp|woff2?|mp4|webm)$/.test(url.pathname)
  );
  if (event.request.mode !== 'navigate' && !isStatic) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Avoid caching hashed JS/CSS chunks in the service worker. Browser
        // HTTP cache handles those, and stale chunks can break lazy imports.
        if (shouldRuntimeCache(event.request, response)) {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone))
              .catch(() => { /* Cache failures must not interrupt playback. */ })
          );
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});
