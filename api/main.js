Deno.serve((req) => {
	const url = new URL(req.url);

	// Helper: fetch & forward JSON from upstream with CORS
	async function fetchJsonWithCors(upstream) {
		const res = await fetch(upstream, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
				"Accept": "application/json, text/plain, */*",
			},
		});
		const headers = new Headers(res.headers);
		headers.set("Access-Control-Allow-Origin", "*");
		if (!headers.has("content-type")) {
			headers.set("content-type", "application/json; charset=utf-8");
		}
		return new Response(res.body, { status: res.status, headers });
	}

	// --- Route table ---
	const routes = {
		"/schedule": "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json",
		"/scoreboard":
			"https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
		// add more here later (e.g. standings, boxscore by id)
	};

	try {
		const upstream = routes[url.pathname];
		if (upstream) return fetchJsonWithCors(upstream);

		return new Response("Not Found", {
			status: 404,
			headers: new Headers({
				"content-type": "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
			}),
		});
	} catch (err) {
		return new Response(`Error: ${err?.message || String(err)}`, {
			status: 500,
			headers: new Headers({
				"content-type": "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
			}),
		});
	}
});
