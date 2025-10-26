// === Constants ===
const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
const SCOREBOARD_URL =
	"https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";

const DEFAULT_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
	"Accept": "application/json, text/plain, */*",
};

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const EAST_TEAMS = new Set([
	"ATL",
	"BOS",
	"BKN",
	"CHA",
	"CHI",
	"CLE",
	"DET",
	"IND",
	"MIA",
	"MIL",
	"NYK",
	"ORL",
	"PHI",
	"TOR",
	"WAS",
]);
const WEST_TEAMS = new Set([
	"DAL",
	"DEN",
	"GSW",
	"HOU",
	"LAC",
	"LAL",
	"MEM",
	"MIN",
	"NOP",
	"OKC",
	"PHX",
	"POR",
	"SAC",
	"SAS",
	"UTA",
]);

// === Helper Functions ===
async function fetchUpstream(url) {
	const res = await fetch(url, { headers: DEFAULT_HEADERS });
	if (!res.ok) throw new Error(`Upstream error (${res.status}): ${url}`);
	return res.json();
}

function respondWithCors(data, cacheMaxAge = 0) {
	const headers = {
		"content-type": "application/json; charset=utf-8",
		...CORS_HEADERS,
	};
	if (cacheMaxAge > 0) {
		headers["Cache-Control"] = `public, max-age=${cacheMaxAge}, stale-while-revalidate=300`;
	}
	return new Response(JSON.stringify(data), { status: 200, headers });
}

async function proxyWithCors(url) {
	const res = await fetch(url, { headers: DEFAULT_HEADERS });
	const headers = new Headers(res.headers);
	Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}
	return new Response(res.body, { status: res.status, headers });
}

function buildStandingsFromSchedule(scheduleJson) {
	const season = scheduleJson?.meta?.seasonYear ||
		scheduleJson?.leagueSchedule?.seasonYear ||
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
	const east = all.filter((t) => EAST_TEAMS.has(t.teamTricode));
	const west = all.filter((t) => WEST_TEAMS.has(t.teamTricode));

	return {
		season,
		updatedAt: new Date().toISOString(),
		east: finalize(east),
		west: finalize(west),
	};
}

// === Server ===
Deno.serve(async (req) => {
	const url = new URL(req.url);
	const PATH = url.pathname;

	// Handle CORS preflight
	if (req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: CORS_HEADERS,
		});
	}

	try {
		if (PATH === "/schedule") {
			console.log("[/schedule] proxying");
			return proxyWithCors(SCHEDULE_URL);
		}

		if (PATH === "/standings") {
			const data = await fetchUpstream(SCHEDULE_URL);
			const payload = buildStandingsFromSchedule(data);
			console.log("[/standings] season", payload.season);
			return respondWithCors(payload, 60);
		}

		if (PATH === "/scoreboard") {
			console.log("[/scoreboard] proxying");
			return proxyWithCors(SCOREBOARD_URL);
		}

		if (PATH === "/playoffbracket") {
			const data = await fetchUpstream(SCHEDULE_URL);
			const seasonString = data?.leagueSchedule?.seasonYear || "2025-26";
			const year = seasonString.split("-")[0];
			const playoffUrl =
				`https://stats.nba.com/stats/playoffbracket?LeagueID=00&SeasonYear=${year}&State=2`;
			console.log("[/playoffbracket] ->", playoffUrl);
			return proxyWithCors(playoffUrl);
		}

		return new Response("Not Found", {
			status: 404,
			headers: {
				...CORS_HEADERS,
				"content-type": "text/plain; charset=utf-8",
			},
		});
	} catch (err) {
		console.error("[error]", err);
		return new Response(`Error: ${err.message}`, {
			status: 500,
			headers: {
				...CORS_HEADERS,
				"content-type": "text/plain; charset=utf-8",
			},
		});
	}
});
