Deno.serve(async (req) => {
	const url = new URL(req.url);
	const headers = new Headers({ "Access-Control-Allow-Origin": "*" });

	if (url.pathname === "/nba/schedule") {
		const res = await fetch(
			"https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json",
		);
		const body = await res.text();
		return new Response(body, { status: 200, headers });
	}

	if (url.pathname === "/nba/standings") {
		const res = await fetch(
			"https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&Section=overall",
		);
		const body = await res.text();
		return new Response(body, { status: 200, headers });
	}

	return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
});
