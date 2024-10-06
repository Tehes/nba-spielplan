const STATIC_CACHE_NAME = "nba-static-cache-v3"; // Für statische Ressourcen

self.addEventListener("fetch", (event) => {
    if (event.request.method === "GET") {
        const requestUrl = new URL(event.request.url);

        // Überprüfen, ob die Anfrage **nicht** an "data.nba.com" gerichtet ist (d. h. nur statische Ressourcen cachen)
        if (requestUrl.hostname !== "data.nba.com") {
            event.respondWith(
                caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        // Wenn gecachte Daten vorhanden sind, gebe sie zurück und aktualisiere den Cache im Hintergrund
                        event.waitUntil(
                            fetch(event.request).then((networkResponse) => {
                                caches.open(STATIC_CACHE_NAME).then((cache) => {
                                    cache.put(event.request, networkResponse.clone());
                                }).catch(() => {
                                    // Leise Fehler ignorieren
                                });
                            }).catch(() => {
                                // Leise Fehler ignorieren
                            })
                        );
                        return cachedResponse;
                    } else {
                        // Hole die Ressource aus dem Netzwerk und cache sie
                        return fetch(event.request).then((networkResponse) => {
                            return caches.open(STATIC_CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            }).catch(() => {
                                // Leise Fehler ignorieren
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
            // Für Anfragen an "data.nba.com" immer direkt aus dem Netzwerk laden, ohne zu cachen
            event.respondWith(fetch(event.request).catch(() => {
                // Leise Fehler ignorieren
            }));
        }
    } else {
        // Für andere Methoden (z. B. POST) immer direkt aus dem Netzwerk laden
        event.respondWith(fetch(event.request).catch(() => {
            // Leise Fehler ignorieren
        }));
    }
});