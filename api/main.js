// --- Global headers used for NBA endpoints ---
const STANDINGS_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
	"Accept": "application/json, text/plain, */*",
	"Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
	"Origin": "https://www.nba.com",
	"Referer": "https://www.nba.com/standings",
};

// Warm up Akamai bot-manager cookie by visiting the standings page
async function warmUpNbaCookie() {
	const warm = await fetch("https://www.nba.com/standings", {
		redirect: "follow",
		headers: {
			"User-Agent": STANDINGS_HEADERS["User-Agent"],
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": STANDINGS_HEADERS["Accept-Language"],
			"Upgrade-Insecure-Requests": "1",
		},
	});
	const setCookie = warm.headers.get("set-cookie") || "";
	const parts = setCookie.split(/,(?=[^;]+=)/g);
	const cookies = [];
	for (const p of parts) {
		const m = p.match(/^(ak_bmsc|bm_sv|bm_mi|bm_sz|bm_svs)=([^;]+);/);
		if (m) cookies.push(`${m[1]}=${m[2]}`);
	}
	return cookies.join("; ");
}

function withCORS(h = new Headers()) {
	h.set("Access-Control-Allow-Origin", "*");
	h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	h.set("Access-Control-Allow-Headers", "Content-Type");
	h.set("Vary", "Origin");
	return h;
}

function statsHeaders(cookie = "") {
	const h = new Headers({
		...STANDINGS_HEADERS,
		"x-nba-stats-origin": "league",
		"x-nba-stats-token": "true",
		"Accept-Encoding": "identity",
		"Cache-Control": "no-cache",
	});
	if (cookie) h.set("Cookie", cookie);
	return h;
}

Deno.serve(async (req) => {
	try {
		const url = new URL(req.url);

		if (req.method === "OPTIONS") {
			return new Response(null, { headers: withCORS() });
		}

		// --- /nba/schedule : raw pass-through to scheduleLeagueV2_1.json ---
		if (url.pathname === "/nba/schedule") {
			const upstream = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
			try {
				const r = await fetch(upstream, {
					headers: {
						"User-Agent": STANDINGS_HEADERS["User-Agent"],
						"Accept": "application/json, text/plain, */*",
					},
				});
				const h = withCORS(new Headers());
				h.set(
					"content-type",
					r.headers.get("content-type") || "application/json; charset=utf-8",
				);
				const body = await r.text();
				return new Response(body, { status: r.status, headers: h });
			} catch (e) {
				return new Response(String(e), {
					status: 502,
					headers: withCORS(new Headers({ "content-type": "text/plain; charset=utf-8" })),
				});
			}
		}

		// --- /nba/standings : fetch stats.nba.com with headers; retry after cookie warmup ---
		if (url.pathname === "/nba/standings") {
			const STATS_URL =
				"https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&Section=overall";
			try {
				// 1) direct try
				let r = await fetch(STATS_URL, { headers: statsHeaders(), redirect: "follow" });
				let sourceNote = "upstream=stats.nba.com (direct)";

				// 2) if blocked, warm up cookies and retry
				if (!r.ok || r.status === 403) {
					const cookie = await warmUpNbaCookie();
					r = await fetch(STATS_URL, {
						headers: statsHeaders(cookie),
						redirect: "follow",
					});
					sourceNote = `upstream=stats.nba.com (cookie warmup: ${cookie ? "yes" : "no"})`;
				}

				const h = withCORS(new Headers());
				h.set(
					"content-type",
					r.headers.get("content-type") ||
						(r.ok ? "application/json; charset=utf-8" : "text/plain; charset=utf-8"),
				);

				if (!r.ok) {
					const text = await r.text();
					const diag = `status=${r.status}; ${sourceNote}\n---\n${
						text.substring(0, 800)
					}`;
					return new Response(diag, { status: r.status, headers: h });
				}

				const body = await r.text();
				return new Response(body, { status: 200, headers: h });
			} catch (e) {
				return new Response(String(e), {
					status: 502,
					headers: withCORS(new Headers({ "content-type": "text/plain; charset=utf-8" })),
				});
			}
		}

		return new Response("Not Found", {
			status: 404,
			headers: withCORS(new Headers({ "content-type": "text/plain; charset=utf-8" })),
		});
	} catch (err) {
		console.error("unhandled error:", err);
		return new Response("Internal error: " + (err && err.message ? err.message : String(err)), {
			status: 500,
			headers: withCORS(new Headers({ "content-type": "text/plain; charset=utf-8" })),
		});
	}
});
