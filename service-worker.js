/*
 * Generic Service Worker template
 * 1. Uses a cache‑first / stale‑while‑revalidate strategy for all GET requests.
 * 2. Ignores non‑GET requests to avoid “Uncaught (in promise) TypeError: Failed to fetch” when offline.
 * 3. Cleans up old caches on activation.
 */

const CACHE_NAME = `app_name-cache-${new URL(location).searchParams.get("v") || "default"}`; // Name of the dynamic cache

const ALLOWED_ORIGINS = new Set([
	self.location.origin,
	"https://fonts.googleapis.com",
	"https://fonts.gstatic.com",
]);

// Install event
self.addEventListener("install", () => {
	self.skipWaiting();
});

// Fetch event – cache‑first / stale‑while‑revalidate for **GET** requests only
self.addEventListener("fetch", (event) => {
	// Ignore non‑GET requests (POST, WebSocket upgrade, etc.)
	if (event.request.method !== "GET") return;
	// Skip requests with unsupported schemes (e.g., chrome-extension://)
	if (!event.request.url.startsWith("http")) return;

	// Only cache allowed origins
	const reqOrigin = new URL(event.request.url).origin;
	if (!ALLOWED_ORIGINS.has(reqOrigin)) return;

	event.respondWith(
		caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
			if (cachedResponse) {
				// Return cached response immediately and update in the background
				event.waitUntil(
					fetch(event.request)
						.then((networkResponse) =>
							caches.open(CACHE_NAME).then((cache) => {
								cache.put(event.request, networkResponse.clone());
							})
						)
						.catch(() => {}),
				);
				return cachedResponse; // stale (cached) response
			}

			// Not in cache – fetch from network, then cache dynamically
			return fetch(event.request)
				.then((networkResponse) =>
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, networkResponse.clone());
						return networkResponse; // fresh network response
					})
				)
				.catch(() =>
					// Offline fallback: attempt cache again (ignore query string);
					// if it's a navigation request, return the shell page.
					caches.match(event.request, { ignoreSearch: true }).then((resp) => {
						if (resp) return resp;
						if (event.request.mode === "navigate") {
							return caches.match("./");
						}
						return new Response("", { status: 503, statusText: "Offline" });
					})
				);
		}),
	);
});

// Activate event to clear old caches
self.addEventListener("activate", (event) => {
	const cacheWhitelist = [CACHE_NAME]; // Only keep the current cache
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cacheName) => {
					if (!cacheWhitelist.includes(cacheName)) {
						// Delete old caches
						return caches.delete(cacheName);
					}
				}),
			);
		}),
	);
	self.clients.claim(); // Ensure service worker takes control of the page immediately
});
