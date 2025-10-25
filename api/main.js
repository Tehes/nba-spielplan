const STATS_URL =
	"https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&Section=overall";

// Helper to build headers for stats.nba.com
function statsHeaders(cookie = "") {
	const h = new Headers({
		...STANDINGS_HEADERS,
		"x-nba-stats-origin": "league",
		"x-nba-stats-token": "true",
		// Some CDNs misbehave with h2 + compression; identity helps sometimes
		"Accept-Encoding": "identity",
		"Cache-Control": "no-cache",
	});
	if (cookie) h.set("Cookie", cookie);
	return h;
}

// 1) direct try
let r = await fetch(STATS_URL, { headers: statsHeaders(), redirect: "follow" });
let sourceNote = "upstream=stats.nba.com (direct)";

// 2) if blocked, warm up cookies from nba.com and retry with Cookie header
if (!r.ok || r.status === 403) {
	const cookie = await warmUpNbaCookie();
	r = await fetch(STATS_URL, { headers: statsHeaders(cookie), redirect: "follow" });
	sourceNote = `upstream=stats.nba.com (cookie warmup: ${cookie ? "yes" : "no"})`;
}

const cors = new Headers({ "Access-Control-Allow-Origin": "*" });
cors.set(
	"content-type",
	r.headers.get("content-type") ||
		(r.ok ? "application/json; charset=utf-8" : "text/plain; charset=utf-8"),
);

// On errors, include diagnostic info in body
if (!r.ok) {
	const text = await r.text();
	const diag = `status=${r.status}; ${sourceNote}\n---\n${text.substring(0, 800)}`;
	return new Response(diag, { status: r.status, headers: cors });
}

// Success: forward body
const body = await r.text();
return new Response(body, { status: 200, headers: cors });
