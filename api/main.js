// Browser-like headers for NBA CDN requests (used by multiple routes)
const STANDINGS_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
	"Accept": "application/json, text/plain, */*",
	"Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
	"Origin": "https://www.nba.com",
	"Referer": "https://www.nba.com/standings",
	// Additional fetch hints some CDNs key on
	"sec-fetch-site": "same-origin",
	"sec-fetch-mode": "cors",
	"sec-fetch-dest": "empty",
	// Client hints (best-effort)
	"sec-ch-ua": '"Chromium";v="127", "Not=A?Brand";v="99"',
	"sec-ch-ua-mobile": "?0",
	"sec-ch-ua-platform": "macOS",
};

// Helper to fetch NBA CDN with consistent headers
async function pullNBA(url) {
	return await fetch(url, { headers: STANDINGS_HEADERS, redirect: "follow" });
}

Deno.serve(async (req) => {
	const url = new URL(req.url);
	const headers = new Headers({ "Access-Control-Allow-Origin": "*" });

	try {
		if (url.pathname === "/nba/schedule") {
			const res = await fetch(
				"https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json",
				{
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
						"Accept": "application/json, text/plain, */*",
					},
				},
			);
			const body = await res.text();
			return new Response(body, { status: 200, headers });
		}

		if (url.pathname === "/nba/standings") {
			const PRIMARY = "https://cdn.nba.com/static/json/staticData/standingsLeagueV2.json";
			const FALLBACK = "https://cdn.nba.com/static/json/staticData/standingsLeagueV2_1.json";

			let r = await pullNBA(PRIMARY);
			if (!r.ok) {
				// Try the versioned backup some deployments use
				r = await pullNBA(FALLBACK);
			}

			const cors = new Headers({ "Access-Control-Allow-Origin": "*" });
			cors.set(
				"content-type",
				r.headers.get("content-type") ||
					(r.ok ? "application/json; charset=utf-8" : "text/plain; charset=utf-8"),
			);
			const body = await r.text();
			return new Response(body, { status: r.status, headers: cors });
		}

		return new Response("Not Found", {
			status: 404,
			headers: { "Content-Type": "text/plain" },
		});
	} catch (err) {
		return new Response(`Error: ${err.message}`, {
			status: 500,
			headers: { "Content-Type": "text/plain" },
		});
	}
});
