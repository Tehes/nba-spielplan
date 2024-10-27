const STATIC_CACHE_NAME = "nba-static-cache-v13"; // Erhöhe die Versionsnummer bei jeder Änderung

self.addEventListener("install", () => {
    self.skipWaiting(); // Aktiviert sofort den neuen Service Worker
});

self.addEventListener("activate", (event) => {
    // Lösche alte Caches beim Aktivieren
    const cacheWhitelist = [STATIC_CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName); // Lösche alle alten Caches
                    }
                })
            );
        })
    );
    self.clients.claim(); // Service Worker übernimmt sofort die Kontrolle
});

// Fetch-Event: Statische Ressourcen aus dem Cache laden, aber kein JSON von data.nba.com
self.addEventListener("fetch", (event) => {
    if (event.request.method === "GET") {
        const requestUrl = new URL(event.request.url);

        if (requestUrl.hostname !== "data.nba.com") {
            event.respondWith(
                caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        event.waitUntil(
                            fetch(event.request).then((networkResponse) => {
                                caches.open(STATIC_CACHE_NAME).then((cache) => {
                                    cache.put(event.request, networkResponse.clone());
                                });
                            }).catch(() => {
                                // Leise Fehler ignorieren
                            })
                        );
                        return cachedResponse;
                    } else {
                        return fetch(event.request).then((networkResponse) => {
                            return caches.open(STATIC_CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            });
                        }).catch(() => {
                            // Leise Fehler ignorieren
                        });
                    }
                }).catch(() => {
                    // Leise Fehler ignorieren
                })
            );
        } else {
            event.respondWith(fetch(event.request).catch(() => {
                // Leise Fehler ignorieren
            }));
        }
    } else {
        event.respondWith(fetch(event.request).catch(() => {
            // Leise Fehler ignorieren
        }));
    }
});