const VERSION = new URL(self.location).searchParams.get("v") || "default";
const CACHE_NAME = `nba-spielplan-cache-${VERSION}`; // never change "-cache-" because its used in cleanup

const ORIGINS = {
	SELF: self.location.origin,
	GF_CSS: "https://fonts.googleapis.com",
	GF_STATIC: "https://fonts.gstatic.com",
};
const ALLOWED = new Set([ORIGINS.SELF, ORIGINS.GF_CSS, ORIGINS.GF_STATIC]);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((names) =>
			Promise.all(names.map((n) => (n === CACHE_NAME ? null : caches.delete(n))))
		),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET") return;
	if (!req.url.startsWith("http")) return;

	const url = new URL(req.url);
	if (!ALLOWED.has(url.origin)) return;

	// 1) Google Fonts CSS → network-first
	if (url.origin === ORIGINS.GF_CSS) {
		event.respondWith(networkFirst(req, event));
		return;
	}

	// 2) Google Fonts files → cache-first + SWR
	if (url.origin === ORIGINS.GF_STATIC || req.destination === "font") {
		event.respondWith(cacheFirstSWR(req, event));
		return;
	}

	// 3) Same-origin requests → cache-first + SWR
	event.respondWith(cacheFirstSWR(req, event));
});

async function cacheFirstSWR(req, event) {
	const cached = await caches.match(req);
	if (cached) {
		event.waitUntil(fetchAndPut(req));
		return cached;
	}
	try {
		const net = await fetch(req, { cache: "no-store" });
		event.waitUntil(putIfCachable(req, net.clone()));
		return net;
	} catch {
		if (req.mode === "navigate") {
			const shell = await caches.match("./");
			if (shell) return shell;
		}
		return new Response("", { status: 503, statusText: "Offline" });
	}
}

async function networkFirst(req, event) {
	try {
		const net = await fetch(req, { cache: "no-store" });
		event.waitUntil(putIfCachable(req, net.clone()));
		return net;
	} catch {
		const cached = await caches.match(req);
		if (cached) return cached;
		return new Response("", { status: 503, statusText: "Offline" });
	}
}

async function fetchAndPut(req) {
	try {
		const net = await fetch(req, { cache: "no-store" });
		await putIfCachable(req, net);
	} catch {
		// Ignore errors (offline, CORS, opaque, etc.)
	}
}

async function putIfCachable(req, res) {
	if (res && (res.ok || res.type === "opaque" || res.status === 0)) {
		const cache = await caches.open(CACHE_NAME);
		await cache.put(req, res);
	}
}
