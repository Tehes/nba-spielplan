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
			const res = await fetch(
				"https://stats.nba.com/stats/leaguestandingsv3?GroupBy=conf&LeagueID=00&Season=2025-26&SeasonType=Regular%20Season&Section=overall",
				{
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
						"Accept": "application/json, text/plain, */*",
						"Origin": "https://www.nba.com",
						"Referer": "https://www.nba.com/",
					},
				},
			);
			const body = await res.text();
			return new Response(body, { status: 200, headers });
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
