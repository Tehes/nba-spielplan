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

// Helper to warm up NBA.com and extract Akamai bot-manager cookies
async function warmUpNbaCookie() {
	// Hit the real standings page to obtain Akamai bot-manager cookie (ak_bmsc, sometimes bm_sv)
	const warm = await fetch("https://www.nba.com/standings", {
		redirect: "follow",
		headers: {
			"User-Agent": STANDINGS_HEADERS["User-Agent"],
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": STANDINGS_HEADERS["Accept-Language"],
			"Upgrade-Insecure-Requests": "1",
		},
	});
	// Many CDNs set multiple Set-Cookie headers; merge what we can access
	const setCookie = warm.headers.get("set-cookie") || "";
	// Extract ak_bmsc=...; and bm_sv=...; if present (best-effort)
	const parts = setCookie.split(/,(?=[^;]+=)/g); // split multiple Set-Cookie
	const cookies = [];
	for (const p of parts) {
		const m = p.match(/^(ak_bmsc|bm_sv|bm_mi|bm_sz|bm_svs)=([^;]+);/);
		if (m) cookies.push(`${m[1]}=${m[2]}`);
	}
	return cookies.join("; ");
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
			const STATS_URL =
				"https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&Section=overall";
			// 1) try direct (may work depending on POP/IP)
			let r = await fetch(STATS_URL, {
				headers: {
					...STANDINGS_HEADERS,
					"x-nba-stats-origin": "league",
					"x-nba-stats-token": "true",
				},
				redirect: "follow",
			});

			// 2) if blocked, warm up cookies from nba.com and retry with Cookie header
			if (!r.ok || r.status === 403) {
				const cookie = await warmUpNbaCookie();
				const hdrs = new Headers({
					...STANDINGS_HEADERS,
					"x-nba-stats-origin": "league",
					"x-nba-stats-token": "true",
				});
				if (cookie) hdrs.set("Cookie", cookie);
				r = await fetch(STATS_URL, { headers: hdrs, redirect: "follow" });
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
