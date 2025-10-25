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
			const upstream = "https://cdn.nba.com/static/json/staticData/standingsLeagueV2.json";
			const r = await fetch(upstream, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
					"Accept": "application/json, text/plain, */*",
					"Origin": "https://www.nba.com",
					"Referer": "https://www.nba.com/",
					"Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
				},
			});

			const h = new Headers({ "Access-Control-Allow-Origin": "*" });
			h.set(
				"content-type",
				r.headers.get("content-type") || "application/json; charset=utf-8",
			);
			const body = await r.text();
			return new Response(body, { status: r.status, headers: h });
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
