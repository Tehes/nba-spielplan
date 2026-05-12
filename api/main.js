// === Constants ===
const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_14.json";
const SCOREBOARD_URL = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const BOXSCORE_BASE_URL = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_";
const PLAYBYPLAY_BASE_URL = "https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_";
const LEAGUE_STANDINGS_URL = "https://stats.nba.com/stats/leaguestandingsv3";

const DEFAULT_HEADERS = {
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
	"Accept": "*/*",
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"Referer": "https://www.nba.com/",
	"Origin": "https://www.nba.com",
	"Sec-Fetch-Dest": "empty",
	"Sec-Fetch-Mode": "cors",
	"Sec-Fetch-Site": "same-site",
	"Priority": "u=4",
};

const APP_ORIGIN = "https://tehes.github.io";
const PROD_ORIGIN = "https://nba-spielplan.de";
const DEV_ORIGIN = "http://127.0.0.1:5500";
const ALLOWED_ORIGINS = new Set([
	APP_ORIGIN,
	PROD_ORIGIN,
	DEV_ORIGIN,
]);

const BASE_CORS_HEADERS = {
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Vary": "Origin",
};

const TEAM_META = {
	ATL: { conf: "E", div: "Southeast" },
	BOS: { conf: "E", div: "Atlantic" },
	BKN: { conf: "E", div: "Atlantic" },
	CHA: { conf: "E", div: "Southeast" },
	CHI: { conf: "E", div: "Central" },
	CLE: { conf: "E", div: "Central" },
	DET: { conf: "E", div: "Central" },
	IND: { conf: "E", div: "Central" },
	MIA: { conf: "E", div: "Southeast" },
	MIL: { conf: "E", div: "Central" },
	NYK: { conf: "E", div: "Atlantic" },
	ORL: { conf: "E", div: "Southeast" },
	PHI: { conf: "E", div: "Atlantic" },
	TOR: { conf: "E", div: "Atlantic" },
	WAS: { conf: "E", div: "Southeast" },
	DAL: { conf: "W", div: "Southwest" },
	DEN: { conf: "W", div: "Northwest" },
	GSW: { conf: "W", div: "Pacific" },
	HOU: { conf: "W", div: "Southwest" },
	LAC: { conf: "W", div: "Pacific" },
	LAL: { conf: "W", div: "Pacific" },
	MEM: { conf: "W", div: "Southwest" },
	MIN: { conf: "W", div: "Northwest" },
	NOP: { conf: "W", div: "Southwest" },
	OKC: { conf: "W", div: "Northwest" },
	PHX: { conf: "W", div: "Pacific" },
	POR: { conf: "W", div: "Northwest" },
	SAC: { conf: "W", div: "Pacific" },
	SAS: { conf: "W", div: "Southwest" },
	UTA: { conf: "W", div: "Northwest" },
};

// NBA stats standings use TeamID but the frontend styles teams by tricode.
const TEAM_TRICODE_BY_ID = {
	1610612737: "ATL",
	1610612738: "BOS",
	1610612739: "CLE",
	1610612740: "NOP",
	1610612741: "CHI",
	1610612742: "DAL",
	1610612743: "DEN",
	1610612744: "GSW",
	1610612745: "HOU",
	1610612746: "LAC",
	1610612747: "LAL",
	1610612748: "MIA",
	1610612749: "MIL",
	1610612750: "MIN",
	1610612751: "BKN",
	1610612752: "NYK",
	1610612753: "ORL",
	1610612754: "IND",
	1610612755: "PHI",
	1610612756: "PHX",
	1610612757: "POR",
	1610612758: "SAC",
	1610612759: "SAS",
	1610612760: "OKC",
	1610612761: "TOR",
	1610612762: "UTA",
	1610612763: "MEM",
	1610612764: "WAS",
	1610612765: "DET",
	1610612766: "CHA",
};

const getMeta = (tricode) => TEAM_META[tricode] || { conf: "?", div: "?" };

// === Cache (only for Season Year) ===
let cachedSeasonYear = null;
let seasonYearCachedAt = 0;
const SEASON_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function getSeasonYear() {
	const now = Date.now();

	if (cachedSeasonYear && (now - seasonYearCachedAt) < SEASON_TTL_MS) {
		console.log("[cache hit] seasonYear", cachedSeasonYear);
		return cachedSeasonYear;
	}

	try {
		console.log("[cache miss] fetching seasonYear via schedule");
		const schedule = await fetchUpstream(SCHEDULE_URL);
		const seasonYear = schedule?.leagueSchedule?.seasonYear;

		if (!seasonYear) {
			throw new Error("Season year missing in schedule response");
		}

		cachedSeasonYear = seasonYear;
		seasonYearCachedAt = now;
		return seasonYear;
	} catch (err) {
		if (cachedSeasonYear) {
			console.log("[seasonYear fallback] using last known good", cachedSeasonYear);
			return cachedSeasonYear;
		}
		throw err;
	}
}

// === Helper Functions ===
async function fetchUpstream(url) {
	const res = await fetch(url, { headers: DEFAULT_HEADERS });
	if (!res.ok) throw new Error(`Upstream error (${res.status}): ${url}`);
	return res.json();
}

function withCors(origin, headers = {}) {
	const corsHeaders = { ...BASE_CORS_HEADERS };
	if (origin && ALLOWED_ORIGINS.has(origin)) {
		corsHeaders["Access-Control-Allow-Origin"] = origin;
	}
	return { ...corsHeaders, ...headers };
}

function getOrigin(req) {
	return req.headers.get("origin") || "";
}

function respondWithCors(data, origin, cacheMaxAge = 0) {
	const headers = withCors(origin, {
		"content-type": "application/json; charset=utf-8",
	});
	if (cacheMaxAge > 0) {
		headers["Cache-Control"] = `public, max-age=${cacheMaxAge}, stale-while-revalidate=300`;
	}
	return new Response(JSON.stringify(data), { status: 200, headers });
}

async function proxyWithCors(url, origin) {
	const res = await fetch(url, { headers: DEFAULT_HEADERS });
	const headers = new Headers(res.headers);
	Object.entries(withCors(origin)).forEach(([k, v]) => headers.set(k, v));
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}
	return new Response(res.body, { status: res.status, headers });
}

function getOfficialStandingsUrl(season) {
	const params = new URLSearchParams({
		GroupBy: "conf",
		LeagueID: "00",
		Season: season,
		SeasonType: "Regular Season",
		Section: "overall",
	});
	return `${LEAGUE_STANDINGS_URL}?${params.toString()}`;
}

function getCell(row, headerIndex, name) {
	return row[headerIndex.get(name)];
}

function buildStandingsFromOfficialData(standingsJson, season) {
	const resultSet = standingsJson?.resultSets?.find((set) => set?.name === "Standings");
	const headers = resultSet?.headers ?? [];
	const rows = resultSet?.rowSet ?? [];

	if (!Array.isArray(headers) || !Array.isArray(rows) || rows.length === 0) {
		throw new Error("Official standings response is missing standings rows");
	}

	const headerIndex = new Map(headers.map((header, index) => [header, index]));
	const east = [];
	const west = [];

	// Keep this payload shape identical to buildStandingsFromSchedule().
	for (const row of rows) {
		const teamId = getCell(row, headerIndex, "TeamID");
		const teamTricode = TEAM_TRICODE_BY_ID[teamId];
		const conference = getCell(row, headerIndex, "Conference");
		const target = conference === "East" ? east : conference === "West" ? west : null;

		if (!teamTricode || !target) {
			throw new Error(`Official standings response contains unknown team or conference: ${teamId}`);
		}

		target.push({
			teamId,
			teamTricode,
			teamCity: getCell(row, headerIndex, "TeamCity"),
			teamName: getCell(row, headerIndex, "TeamName"),
			wins: Number(getCell(row, headerIndex, "WINS")) || 0,
			losses: Number(getCell(row, headerIndex, "LOSSES")) || 0,
			winPct: Number(getCell(row, headerIndex, "WinPCT")) || 0,
			gb: Number(getCell(row, headerIndex, "ConferenceGamesBack")) || 0,
			streak: getCell(row, headerIndex, "strCurrentStreak") || "—",
			home: getCell(row, headerIndex, "HOME") || "0-0",
			away: getCell(row, headerIndex, "ROAD") || "0-0",
			neutral: getCell(row, headerIndex, "NEUTRAL") || "0-0",
			conf: getCell(row, headerIndex, "ConferenceRecord") || "0-0",
			div: getCell(row, headerIndex, "DivisionRecord") || "0-0",
			diff: Number(getCell(row, headerIndex, "DiffTotalPoints")) || 0,
			isDivisionLeader: getCell(row, headerIndex, "DivisionRank") === 1,
		});
	}

	return {
		season,
		updatedAt: new Date().toISOString(),
		east,
		west,
	};
}

function isRegularSeasonGame(game) {
	// NBA game IDs encode the stage: 002 = regular season.
	return game?.gameId?.startsWith("002") === true;
}

function buildStandingsFromSchedule(scheduleJson) {
	const season = scheduleJson?.meta?.seasonYear ||
		scheduleJson?.leagueSchedule?.seasonYear || "unknown";
	const dates = scheduleJson?.leagueSchedule?.gameDates ?? [];
	const games = dates.flatMap((d) => d.games ?? []);

	const team = new Map();
	const ensure = (t) => {
		if (!t || !t.teamId) return null;
		if (!team.has(t.teamId)) {
			const meta = getMeta(t.teamTricode);
			team.set(t.teamId, {
				teamId: t.teamId,
				teamTricode: t.teamTricode,
				teamCity: t.teamCity,
				teamName: t.teamName,
				conf: meta.conf,
				div: meta.div,

				wins: 0,
				losses: 0,
				homeW: 0,
				homeL: 0,
				awayW: 0,
				awayL: 0,
				neutralW: 0,
				neutralL: 0,
				confW: 0,
				confL: 0,
				divW: 0,
				divL: 0,
				ptsFor: 0,
				ptsAgainst: 0,
				vs: new Map(), // opponentTeamId -> {w,l}

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

	const done = games
		.filter((g) => g?.gameStatus === 3 && isRegularSeasonGame(g))
		.sort((a, b) => new Date(a.gameDateTimeUTC) - new Date(b.gameDateTimeUTC));

	for (const g of done) {
		const home = ensure(g.homeTeam);
		const away = ensure(g.awayTeam);
		const hs = Number(g.homeTeam?.score) || 0;
		const as = Number(g.awayTeam?.score) || 0;
		const isNeutral = Boolean(g?.isNeutral);
		const homeWon = hs > as;
		const winner = homeWon ? home : away;
		const loser = homeWon ? away : home;

		// Points for differential
		home.ptsFor += hs;
		home.ptsAgainst += as;
		away.ptsFor += as;
		away.ptsAgainst += hs;

		// Win/loss + home/away/neutral
		if (isNeutral) {
			// Overall record and streaks
			winner.wins++;
			loser.losses++;
			winner.lastResults.push("W");
			loser.lastResults.push("L");
			// Neutral splits
			winner.neutralW++;
			loser.neutralL++;
		} else if (homeWon) {
			home.wins++;
			away.losses++;
			home.homeW++;
			away.awayL++;
			home.lastResults.push("W");
			away.lastResults.push("L");
		} else {
			home.losses++;
			away.wins++;
			home.homeL++;
			away.awayW++;
			home.lastResults.push("L");
			away.lastResults.push("W");
		}

		// Conference / Division
		const sameConf = home.conf && away.conf && home.conf === away.conf;
		const sameDiv = sameConf && home.div && away.div && home.div === away.div;

		if (sameConf) {
			if (homeWon) {
				home.confW++;
				away.confL++;
			} else {
				home.confL++;
				away.confW++;
			}
		}

		if (sameDiv) {
			if (homeWon) {
				home.divW++;
				away.divL++;
			} else {
				home.divL++;
				away.divW++;
			}
		}

		// Update head-to-head records
		const hvs = home.vs.get(away.teamId) || { w: 0, l: 0 };
		const avs = away.vs.get(home.teamId) || { w: 0, l: 0 };
		if (homeWon) {
			hvs.w++;
			avs.l++;
		} else {
			hvs.l++;
			avs.w++;
		}
		home.vs.set(away.teamId, hvs);
		away.vs.set(home.teamId, avs);

		home.lastGameUTC = g.gameDateTimeUTC;
		away.lastGameUTC = g.gameDateTimeUTC;
	}

	const all = Array.from(team.values());

	// Determine division leaders
	const divisionLeaders = new Set();
	{
		const byDivision = new Map();
		for (const t of all) {
			if (!byDivision.has(t.div)) byDivision.set(t.div, []);
			byDivision.get(t.div).push(t);
		}
		for (const rows of byDivision.values()) {
			rows.sort((a, b) => {
				const ap = a.wins + a.losses ? a.wins / (a.wins + a.losses) : 0;
				const bp = b.wins + b.losses ? b.wins / (b.wins + b.losses) : 0;
				if (bp !== ap) return bp - ap;
				if (b.wins !== a.wins) return b.wins - a.wins;
				if (a.losses !== b.losses) return a.losses - b.losses;
				return a.teamTricode.localeCompare(b.teamTricode);
			});
			if (rows[0]) divisionLeaders.add(rows[0].teamId);
		}
	}

	// --- Comparator with simplified NBA tiebreakers for two-team ties ---
	function compareTeams(a, b) {
		const ap = a.wins + a.losses ? a.wins / (a.wins + a.losses) : 0;
		const bp = b.wins + b.losses ? b.wins / (b.wins + b.losses) : 0;
		if (bp !== ap) return bp - ap;

		// 1) Head-to-Head
		const aHB = a.vs.get(b.teamId) || { w: 0, l: 0 };
		const bHB = b.vs.get(a.teamId) || { w: 0, l: 0 };
		const aHBpct = (aHB.w + aHB.l) ? aHB.w / (aHB.w + aHB.l) : null;
		const bHBpct = (bHB.w + bHB.l) ? bHB.w / (bHB.w + bHB.l) : null;
		if (aHBpct !== null && bHBpct !== null && aHBpct !== bHBpct) {
			return bHBpct - aHBpct; // Higher head-to-head percentage first
		}

		// 2) Division winner before non-division winner in conference standings
		const aDivLeader = divisionLeaders.has(a.teamId);
		const bDivLeader = divisionLeaders.has(b.teamId);
		if (aDivLeader !== bDivLeader) return aDivLeader ? -1 : 1;

		// 3) Division record for teams in the same division
		if (a.div && b.div && a.div === b.div) {
			const aDivPct = (a.divW + a.divL) ? a.divW / (a.divW + a.divL) : 0;
			const bDivPct = (b.divW + b.divL) ? b.divW / (b.divW + b.divL) : 0;
			if (bDivPct !== aDivPct) return bDivPct - aDivPct;
		}

		// 4) Conference-Record
		const aConfPct = (a.confW + a.confL) ? a.confW / (a.confW + a.confL) : 0;
		const bConfPct = (b.confW + b.confL) ? b.confW / (b.confW + b.confL) : 0;
		if (bConfPct !== aConfPct) return bConfPct - aConfPct;

		// 5) Point differential across all games
		const aDiff = a.ptsFor - a.ptsAgainst;
		const bDiff = b.ptsFor - b.ptsAgainst;
		if (bDiff !== aDiff) return bDiff - aDiff;

		// Stable fallback
		if (b.wins !== a.wins) return b.wins - a.wins;
		if (a.losses !== b.losses) return a.losses - b.losses;
		return a.teamTricode.localeCompare(b.teamTricode);
	}

	const finalize = (rows) => {
		rows.sort(compareTeams);

		const leader = rows[0];
		const lw = leader?.wins ?? 0;
		const ll = leader?.losses ?? 0;

		return rows.map((r) => {
			const gp = r.wins + r.losses;
			const winPct = gp ? +(r.wins / gp).toFixed(3) : 0;
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
				neutral: `${r.neutralW}-${r.neutralL}`,
				conf: `${r.confW}-${r.confL}`,
				div: `${r.divW}-${r.divL}`,
				diff: r.ptsFor - r.ptsAgainst,
				isDivisionLeader: divisionLeaders.has(r.teamId),
			};
		});
	};

	const allTeams = Array.from(team.values());
	const east = allTeams.filter((t) => t.conf === "E");
	const west = allTeams.filter((t) => t.conf === "W");

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
	const origin = getOrigin(req);

	if (!ALLOWED_ORIGINS.has(origin)) {
		return new Response("Forbidden", {
			status: 403,
			headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
		});
	}

	// CORS preflight
	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: withCors(origin) });
	}

	try {
		// --- /schedule: fetch fresh ---
		if (PATH === "/schedule") {
			return proxyWithCors(SCHEDULE_URL, origin);
		}

		// --- /standings: fetch fresh ---
		if (PATH === "/standings") {
			try {
				// Prefer the official NBA standings. If stats.nba.com fails, keep the app usable
				// with the derived standings built from the schedule feed.
				const seasonString = await getSeasonYear();
				const standingsUrl = getOfficialStandingsUrl(seasonString);
				const data = await fetchUpstream(standingsUrl);
				const payload = buildStandingsFromOfficialData(data, seasonString);
				console.log("[/standings] official season", payload.season);
				return respondWithCors(payload, origin, 60);
			} catch (err) {
				console.warn("[/standings] official fallback", err);
				const data = await fetchUpstream(SCHEDULE_URL);
				const payload = buildStandingsFromSchedule(data);
				console.log("[/standings] derived season", payload.season);
				return respondWithCors(payload, origin, 60);
			}
		}

		if (PATH === "/standings-official") {
			const seasonString = await getSeasonYear();
			const standingsUrl = getOfficialStandingsUrl(seasonString);
			const data = await fetchUpstream(standingsUrl);
			const payload = buildStandingsFromOfficialData(data, seasonString);
			console.log("[/standings-official] season", payload.season);
			return respondWithCors(payload, origin, 60);
		}

		// --- /playoffbracket: use cached season year only ---
		if (PATH === "/playoffbracket") {
			const seasonString = await getSeasonYear();
			const year = seasonString.split("-")[0];
			const playoffUrl = `https://stats.nba.com/stats/playoffbracket?LeagueID=00&SeasonYear=${year}&State=2`;
			return proxyWithCors(playoffUrl, origin);
		}

		// --- /istbracket: use cached season year only ---
		if (PATH === "/istbracket") {
			const seasonString = await getSeasonYear();
			const year = seasonString.split("-")[0];
			const istBracketUrl = `https://cdn.nba.com/static/json/staticData/brackets/${year}/ISTBracket.json`;
			return proxyWithCors(istBracketUrl, origin);
		}

		// --- /scoreboard: no cache, always live ---
		if (PATH === "/scoreboard") {
			return proxyWithCors(SCOREBOARD_URL, origin);
		}

		// --- /boxscore/:gameId: no cache, always live ---
		if (PATH.startsWith("/boxscore/")) {
			const gameId = PATH.slice("/boxscore/".length);

			// Basic validation so invalid IDs do not reach the upstream feed.
			if (!/^\d{10}$/.test(gameId)) {
				return new Response("Invalid gameId", {
					status: 400,
					headers: withCors(origin, {
						"content-type": "text/plain; charset=utf-8",
					}),
				});
			}

			const boxscoreUrl = `${BOXSCORE_BASE_URL}${gameId}.json`;
			return proxyWithCors(boxscoreUrl, origin);
		}

		// --- /playbyplay/:gameId: no cache, always live ---
		if (PATH.startsWith("/playbyplay/")) {
			const gameId = PATH.slice("/playbyplay/".length);

			// Basic validation so invalid IDs do not reach the upstream feed.
			if (!/^\d{10}$/.test(gameId)) {
				return new Response("Invalid gameId", {
					status: 400,
					headers: withCors(origin, {
						"content-type": "text/plain; charset=utf-8",
					}),
				});
			}

			const playbyplayUrl = `${PLAYBYPLAY_BASE_URL}${gameId}.json`;
			return proxyWithCors(playbyplayUrl, origin);
		}

		return new Response("Not Found", {
			status: 404,
			headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
		});
	} catch (err) {
		console.error("[error]", err);
		return new Response(`Error: ${err.message}`, {
			status: 500,
			headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
		});
	}
});
