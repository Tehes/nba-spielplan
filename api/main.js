function withCORS(h = new Headers()) {
	h.set("Access-Control-Allow-Origin", "*");
	return h;
}

Deno.serve(async (req) => {
	const url = new URL(req.url);

	if (url.pathname === "/schedule") {
		const upstream = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
		const r = await fetch(upstream);
		const h = withCORS(new Headers());
		h.set("content-type", r.headers.get("content-type") || "application/json; charset=utf-8");
		return new Response(await r.text(), { status: r.status, headers: h });
	}
});
