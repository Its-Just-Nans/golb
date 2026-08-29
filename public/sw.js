var cacheName = "golb-pwa";

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request, {
      signal: AbortSignal.timeout(2000),
    });
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  event.respondWith(networkFirst(event.request));
});
