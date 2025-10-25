Deno.serve(async (req) => {
	const url = new URL(req.url);

	// Helper: add CORS to any headers
	const cors = (base = new Headers()) => {
		base.set("Access-Control-Allow-Origin", "*");
		return base;
	};

	try {
		if (url.pathname === "/schedule") {
			const upstream = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
			const res = await fetch(upstream, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
					"Accept": "application/json, text/plain, */*",
					// If Akamai/H2 hiccups appear again, uncomment the next line:
					// "Accept-Encoding": "identity",
				},
			});

			// Forward upstream headers & status, ensure content-type exists, and add CORS
			const h = cors(new Headers(res.headers));
			if (!h.has("content-type")) h.set("content-type", "application/json; charset=utf-8");

			// Stream the upstream body directly (no buffering or text conversion)
			return new Response(res.body, { status: res.status, headers: h });
		}

		// Default 404 with CORS
		return new Response("Not Found", {
			status: 404,
			headers: cors(new Headers({ "content-type": "text/plain; charset=utf-8" })),
		});
	} catch (err) {
		// Catch-all 500 with CORS
		return new Response(`Error: ${err && err.message ? err.message : String(err)}`, {
			status: 500,
			headers: cors(new Headers({ "content-type": "text/plain; charset=utf-8" })),
		});
	}
});
