const TEAM_CONF = {
	ATL: "East",
	BOS: "East",
	BKN: "East",
	CHA: "East",
	CHI: "East",
	CLE: "East",
	DAL: "West",
	DEN: "West",
	DET: "East",
	GSW: "West",
	HOU: "West",
	IND: "East",
	LAC: "West",
	LAL: "West",
	MEM: "West",
	MIA: "East",
	MIL: "East",
	MIN: "West",
	NOP: "West",
	NYK: "East",
	OKC: "West",
	ORL: "East",
	PHI: "East",
	PHX: "West",
	POR: "West",
	SAC: "West",
	SAS: "West",
	TOR: "East",
	UTA: "West",
	WAS: "East",
};

Deno.serve(async (req) => {
	const url = new URL(req.url);
	const PATH = url.pathname;

	// Helper: fetch schedule data
	async function fetchSchedule() {
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
		if (!res.ok) throw new Error(`Upstream error: ${res.status}`);
		return res.json();
	}

	// Helper: extract season year from schedule
	async function getSeasonYear() {
		const data = await fetchSchedule();
		const seasonString = data?.leagueSchedule?.seasonYear || "2025-26";
		return seasonString.split("-")[0];
	}

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

	function buildStandingsFromSchedule(scheduleJson) {
		const season = scheduleJson?.meta?.seasonYear || scheduleJson?.leagueSchedule?.seasonYear ||
			"unknown";
		const dates = scheduleJson?.leagueSchedule?.gameDates ?? [];
		const games = dates.flatMap((d) => d.games ?? []);

		// Seed all teams from the full schedule (incl. preseason) so 0–0 teams appear at season start
		const team = new Map();
		const ensure = (t) => {
			if (!t || !t.teamId) return null;
			if (!team.has(t.teamId)) {
				team.set(t.teamId, {
					teamId: t.teamId,
					teamTricode: t.teamTricode,
					teamCity: t.teamCity,
					teamName: t.teamName,
					wins: 0,
					losses: 0,
					homeW: 0,
					homeL: 0,
					awayW: 0,
					awayL: 0,
					lastResults: [],
					lastGameUTC: null,
				});
			}
			return team.get(t.teamId);
		};

		for (const g of games) {
			if (g?.homeTeam) ensure(g.homeTeam);
			if (g?.awayTeam) ensure(g.awayTeam);
		}

		// Completed regular-season games only
		const done = games
			.filter((g) => g?.gameStatus === 3 && g?.gameLabel !== "Preseason")
			.sort((a, b) => new Date(a.gameDateTimeUTC) - new Date(b.gameDateTimeUTC));

		for (const g of done) {
			const home = ensure(g.homeTeam);
			const away = ensure(g.awayTeam);
			const homeWon = (Number(g.homeTeam?.score) ?? 0) > (Number(g.awayTeam?.score) ?? 0);

			if (homeWon) {
				home.wins++;
				home.homeW++;
				home.lastResults.push("W");
				away.losses++;
				away.awayL++;
				away.lastResults.push("L");
			} else {
				home.losses++;
				home.homeL++;
				home.lastResults.push("L");
				away.wins++;
				away.awayW++;
				away.lastResults.push("W");
			}

			home.lastGameUTC = g.gameDateTimeUTC;
			away.lastGameUTC = g.gameDateTimeUTC;
		}

		const finalize = (rows) => {
			// Sort by winPct, wins, losses, tricode
			rows.sort((a, b) => {
				const ap = a.wins + a.losses ? a.wins / (a.wins + a.losses) : 0;
				const bp = b.wins + b.losses ? b.wins / (b.wins + b.losses) : 0;
				if (bp !== ap) return bp - ap;
				if (b.wins !== a.wins) return b.wins - a.wins;
				if (a.losses !== b.losses) return a.losses - b.losses;
				return a.teamTricode.localeCompare(b.teamTricode);
			});
			const leader = rows[0];
			const lw = leader?.wins ?? 0;
			const ll = leader?.losses ?? 0;
			return rows.map((r) => {
				const gp = r.wins + r.losses;
				const winPct = gp ? +(r.wins / gp).toFixed(3) : 0;
				// Streak
				let streak = 0;
				let sChar = "";
				for (let i = r.lastResults.length - 1; i >= 0; i--) {
					if (sChar === "" || r.lastResults[i] === sChar) {
						sChar = r.lastResults[i];
						streak++;
					} else break;
				}
				const gb = leader ? ((lw - r.wins) + (r.losses - ll)) / 2 : 0;
				return {
					teamId: r.teamId,
					teamTricode: r.teamTricode,
					teamCity: r.teamCity,
					teamName: r.teamName,
					wins: r.wins,
					losses: r.losses,
					winPct,
					gb: +gb.toFixed(1),
					streak: sChar ? `${sChar} ${streak}` : "—",
					home: `${r.homeW}-${r.homeL}`,
					away: `${r.awayW}-${r.awayL}`,
				};
			});
		};

		const all = Array.from(team.values());
		const east = all.filter((t) => TEAM_CONF[t.teamTricode] === "East");
		const west = all.filter((t) => TEAM_CONF[t.teamTricode] === "West");

		return {
			season,
			updatedAt: new Date().toISOString(),
			east: finalize(east),
			west: finalize(west),
		};
	}

	try {
		// --- /schedule: fetch and proxy with CORS ---
		if (PATH === "/schedule") {
			console.log("[/schedule] proxying schedule");
			return fetchJsonWithCors(
				"https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json",
			);
		}

		// --- /standings: construct from schedule ---
		if (PATH === "/standings") {
			const data = await fetchSchedule();
			const payload = buildStandingsFromSchedule(data);
			console.log("[/standings] built standings for season", payload.season);
			return new Response(JSON.stringify(payload), {
				status: 200,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"Access-Control-Allow-Origin": "*",
					"Cache-Control": "public, max-age=60, stale-while-revalidate=300",
				},
			});
		}

		// --- /playoffbracket: fetch with current season year ---
		if (PATH === "/playoffbracket") {
			const year = await getSeasonYear();
			const playoffUrl =
				`https://stats.nba.com/stats/playoffbracket?LeagueID=00&SeasonYear=${year}&State=2`;
			console.log("[/playoffbracket] ->", playoffUrl);
			return fetchJsonWithCors(playoffUrl);
		}

		// --- /scoreboard: proxy with CORS ---
		if (PATH === "/scoreboard") {
			console.log("[/scoreboard] proxying scoreboard");
			return fetchJsonWithCors(
				"https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
			);
		}

		return new Response("Not Found", {
			status: 404,
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
			},
		});
	} catch (err) {
		console.error("[error]", err);
		return new Response(`Error: ${err?.message || String(err)}`, {
			status: 500,
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}
});
