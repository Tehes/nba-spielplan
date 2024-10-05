const DYNAMIC_CACHE_NAME = "nba-dynamic-cache-v1"; // Für dynamische JSON-Inhalte
const STATIC_CACHE_NAME = "nba-static-cache-v1"; // Für statische Ressourcen

self.addEventListener("fetch", (event) => {
    if (event.request.method === "GET") {
        const requestUrl = new URL(event.request.url);

        if (requestUrl.hostname === "data.nba.com") {
            event.respondWith(
                caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        event.waitUntil(
                            fetch(event.request).then((networkResponse) => {
                                caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                                    cache.put(event.request, networkResponse.clone());
                                });
                            })
                        );
                        return cachedResponse;
                    } else {
                        return fetch(event.request).then((networkResponse) => {
                            return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            });
                        });
                    }
                })
            );
        } else {
            event.respondWith(
                caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        event.waitUntil(
                            fetch(event.request).then((networkResponse) => {
                                caches.open(STATIC_CACHE_NAME).then((cache) => {
                                    cache.put(event.request, networkResponse.clone());
                                });
                            })
                        );
                        return cachedResponse;
                    } else {
                        return fetch(event.request).then((networkResponse) => {
                            return caches.open(STATIC_CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            });
                        });
                    }
                })
            );
        }
    } else {
        event.respondWith(fetch(event.request));
    }
});