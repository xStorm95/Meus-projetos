/* ORION — Service Worker (PWA)
 * Estratégia conservadora: o ERP nunca serve dados de negócio do cache.
 * Somente assets estáticos são cacheados. Requisições /api sempre vão à rede.
 */
const CACHE = "orion-static-v1";
const STATIC_ASSETS = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Remove qualquer cache que não seja o atual (inclui os da marca anterior).
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // nunca cachear dados
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((r) => r ?? new Response("Sem conexão", { status: 503 })),
      ),
    );
    return;
  }
  if (/\.(svg|png|jpg|jpeg|webp|woff2?|css|js|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          }),
      ),
    );
  }
});
