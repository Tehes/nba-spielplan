import { computeGameExcitement } from "https://tehes.github.io/nba-spielplan/js/excitement.js";

// === Constants ===
const LEAGUE_STANDINGS_URL = "https://stats.nba.com/stats/leaguestandingsv3";

const BASE_UPSTREAM_HEADERS = {
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
	"Accept": "*/*",
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"Sec-Fetch-Dest": "empty",
	"Sec-Fetch-Mode": "cors",
	"Sec-Fetch-Site": "same-site",
	"Priority": "u=4",
};

// Note: 14 is the region code for Germany in the schedule feed. It covers german broadcasters.
const LEAGUES = {
	nba: {
		id: "nba",
		leagueId: "00",
		scheduleUrl: "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_14.json",
		scoreboardUrl: "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
		boxscoreBaseUrl: "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_",
		playByPlayBaseUrl: "https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_",
		regularSeasonPrefix: "002",
		topExcitementPrefixes: new Set(["002", "004", "005"]),
		origin: "https://www.nba.com",
		recapHost: "NBA.com",
	},
	wnba: {
		id: "wnba",
		leagueId: "10",
		scheduleUrl: "https://cdn.wnba.com/static/json/staticData/scheduleLeagueV2_14.json",
		scoreboardUrl: "https://cdn.wnba.com/static/json/liveData/scoreboard/todaysScoreboard_10.json",
		boxscoreBaseUrl: "https://cdn.wnba.com/static/json/liveData/boxscore/boxscore_",
		playByPlayBaseUrl: "https://cdn.wnba.com/static/json/liveData/playbyplay/playbyplay_",
		regularSeasonPrefix: "102",
		topExcitementPrefixes: new Set(["102", "104"]),
		origin: "https://www.wnba.com",
		recapHost: "WNBA.com",
	},
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

const TOP_EXCITEMENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const TOP_EXCITEMENT_BATCH_SIZE = 8;
const TOP_EXCITEMENT_MAX_ITEMS = 10;
const TOP_EXCITEMENT_MIN_AGE_MS = 6 * 60 * 60 * 1000;
const TOP_EXCITEMENT_RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

const TEAM_DATA_BY_LEAGUE = {
	nba: {
		ATL: { teamId: 1610612737, conf: "E", div: "Southeast" },
		BOS: { teamId: 1610612738, conf: "E", div: "Atlantic" },
		BKN: { teamId: 1610612751, conf: "E", div: "Atlantic" },
		CHA: { teamId: 1610612766, conf: "E", div: "Southeast" },
		CHI: { teamId: 1610612741, conf: "E", div: "Central" },
		CLE: { teamId: 1610612739, conf: "E", div: "Central" },
		DET: { teamId: 1610612765, conf: "E", div: "Central" },
		IND: { teamId: 1610612754, conf: "E", div: "Central" },
		MIA: { teamId: 1610612748, conf: "E", div: "Southeast" },
		MIL: { teamId: 1610612749, conf: "E", div: "Central" },
		NYK: { teamId: 1610612752, conf: "E", div: "Atlantic" },
		ORL: { teamId: 1610612753, conf: "E", div: "Southeast" },
		PHI: { teamId: 1610612755, conf: "E", div: "Atlantic" },
		TOR: { teamId: 1610612761, conf: "E", div: "Atlantic" },
		WAS: { teamId: 1610612764, conf: "E", div: "Southeast" },
		DAL: { teamId: 1610612742, conf: "W", div: "Southwest" },
		DEN: { teamId: 1610612743, conf: "W", div: "Northwest" },
		GSW: { teamId: 1610612744, conf: "W", div: "Pacific" },
		HOU: { teamId: 1610612745, conf: "W", div: "Southwest" },
		LAC: { teamId: 1610612746, conf: "W", div: "Pacific" },
		LAL: { teamId: 1610612747, conf: "W", div: "Pacific" },
		MEM: { teamId: 1610612763, conf: "W", div: "Southwest" },
		MIN: { teamId: 1610612750, conf: "W", div: "Northwest" },
		NOP: { teamId: 1610612740, conf: "W", div: "Southwest" },
		OKC: { teamId: 1610612760, conf: "W", div: "Northwest" },
		PHX: { teamId: 1610612756, conf: "W", div: "Pacific" },
		POR: { teamId: 1610612757, conf: "W", div: "Northwest" },
		SAC: { teamId: 1610612758, conf: "W", div: "Pacific" },
		SAS: { teamId: 1610612759, conf: "W", div: "Southwest" },
		UTA: { teamId: 1610612762, conf: "W", div: "Northwest" },
	},
	wnba: {
		ATL: { teamId: 1611661330, conf: "E", div: "" },
		CHI: { teamId: 1611661329, conf: "E", div: "" },
		CON: { teamId: 1611661323, conf: "E", div: "" },
		DAL: { teamId: 1611661321, conf: "W", div: "" },
		GSV: { teamId: 1611661331, conf: "W", div: "" },
		IND: { teamId: 1611661325, conf: "E", div: "" },
		LAS: { teamId: 1611661320, conf: "W", div: "" },
		LVA: { teamId: 1611661319, conf: "W", div: "" },
		MIN: { teamId: 1611661324, conf: "W", div: "" },
		NYL: { teamId: 1611661313, conf: "E", div: "" },
		PDX: { teamId: 1611661327, conf: "W", div: "" },
		PHX: { teamId: 1611661317, conf: "W", div: "" },
		SEA: { teamId: 1611661328, conf: "W", div: "" },
		TOR: { teamId: 1611661332, conf: "W", div: "" },
		WAS: { teamId: 1611661322, conf: "E", div: "" },
	},
};

// NBA stats standings use TeamID but the frontend styles teams by tricode.
const TEAM_TRICODE_BY_ID_BY_LEAGUE = Object.fromEntries(
	Object.entries(TEAM_DATA_BY_LEAGUE).map(([leagueId, teams]) => [
		leagueId,
		Object.fromEntries(Object.entries(teams).map(([tricode, team]) => [team.teamId, tricode])),
	]),
);

const getMeta = (tricode, league) => TEAM_DATA_BY_LEAGUE[league.id]?.[tricode] || { conf: "?", div: "?" };

// === Cache (only for Season Year) ===
const cachedSeasonYears = new Map();
const SEASON_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let kvPromise = null;
const topExcitementProcessing = new Set();

function getKv() {
	if (!kvPromise) {
		kvPromise = Deno.openKv();
	}

	return kvPromise;
}

async function getSeasonYear(league) {
	const now = Date.now();
	const cached = cachedSeasonYears.get(league.id);

	if (cached && (now - cached.cachedAt) < SEASON_TTL_MS) {
		console.log("[cache hit] seasonYear", league.id, cached.seasonYear);
		return cached.seasonYear;
	}

	try {
		console.log("[cache miss] fetching seasonYear via schedule", league.id);
		const schedule = await fetchUpstream(league.scheduleUrl, league);
		const seasonYear = schedule?.leagueSchedule?.seasonYear;

		if (!seasonYear) {
			throw new Error("Season year missing in schedule response");
		}

		cachedSeasonYears.set(league.id, { seasonYear, cachedAt: now });
		return seasonYear;
	} catch (err) {
		if (cached) {
			console.log("[seasonYear fallback] using last known good", league.id, cached.seasonYear);
			return cached.seasonYear;
		}
		throw err;
	}
}

// === Helper Functions ===
function getUpstreamHeaders(league, isStats = false) {
	const headers = {
		...BASE_UPSTREAM_HEADERS,
		"Referer": `${league.origin}/`,
		"Origin": league.origin,
	};

	if (isStats) {
		headers["Sec-Fetch-Site"] = "cross-site";
		headers["x-nba-stats-origin"] = "stats";
		headers["x-nba-stats-token"] = "true";
	}

	return headers;
}

async function fetchUpstream(url, league, isStats = false) {
	const res = await fetch(url, { headers: getUpstreamHeaders(league, isStats) });
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

async function proxyWithCors(url, origin, league, isStats = false) {
	const res = await fetch(url, { headers: getUpstreamHeaders(league, isStats) });
	const headers = new Headers(res.headers);
	Object.entries(withCors(origin)).forEach(([k, v]) => headers.set(k, v));
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}
	return new Response(res.body, { status: res.status, headers });
}

function getLeague(url) {
	const leagueId = url.searchParams.get("league") || "nba";
	return LEAGUES[leagueId] || null;
}

function getOfficialStandingsUrl(season, league, groupBy = "conf") {
	const params = new URLSearchParams({
		GroupBy: groupBy,
		LeagueID: league.leagueId,
		Season: season,
		SeasonType: "Regular Season",
		Section: "overall",
	});
	return `${LEAGUE_STANDINGS_URL}?${params.toString()}`;
}

function getScheduleSeason(scheduleJson) {
	return scheduleJson?.leagueSchedule?.seasonYear ||
		scheduleJson?.meta?.seasonYear ||
		"unknown";
}

function getTopExcitementLimit(url) {
	const rawLimit = Number(url.searchParams.get("limit"));

	if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
		return 5;
	}

	return Math.min(TOP_EXCITEMENT_MAX_ITEMS, Math.floor(rawLimit));
}

function getTopExcitementKeys(leagueId, season) {
	const prefix = ["excitement", leagueId, season];

	return {
		prefix,
		gamePrefix: [...prefix, "game"],
		top: [...prefix, "top"],
		meta: [...prefix, "meta"],
	};
}

function getTopExcitementGameKey(leagueId, season, gameId) {
	return ["excitement", leagueId, season, "game", gameId];
}

function isTopExcitementGame(game, league, now = new Date()) {
	if (game?.gameStatus !== 3 || typeof game?.gameId !== "string") {
		return false;
	}

	if (!league.topExcitementPrefixes.has(game.gameId.slice(0, 3))) {
		return false;
	}

	const gameDate = new Date(game.gameDateTimeUTC);

	return !Number.isNaN(gameDate.getTime()) &&
		now.getTime() - gameDate.getTime() >= TOP_EXCITEMENT_MIN_AGE_MS;
}

function getTopExcitementEligibleGames(scheduleJson, league, now = new Date()) {
	const dates = scheduleJson?.leagueSchedule?.gameDates ?? [];

	return dates
		.flatMap((date) => date.games ?? [])
		.filter((game) => isTopExcitementGame(game, league, now))
		.sort((a, b) => new Date(b.gameDateTimeUTC) - new Date(a.gameDateTimeUTC));
}

function getNbaRecapUrl(gameId, awayTeamTricode, homeTeamTricode) {
	const away = String(awayTeamTricode || "").toLowerCase();
	const home = String(homeTeamTricode || "").toLowerCase();

	return `https://www.nba.com/game/${away}-vs-${home}-${gameId}?watchRecap=true`;
}

function getWnbaRecapUrl(gameId) {
	return `https://www.wnba.com/game/${gameId}?watchRecap=true`;
}

function getRecapUrl(game, league) {
	if (league.id === "wnba") {
		return getWnbaRecapUrl(game.gameId);
	}

	return getNbaRecapUrl(
		game.gameId,
		game.awayTeam?.teamTricode,
		game.homeTeam?.teamTricode,
	);
}

function getBroadcastLabels(game) {
	const labels = new Set();
	const broadcasters = [
		...(game.broadcasters?.intlTvBroadcasters || []),
		...(game.broadcasters?.intlOttBroadcasters || []),
	];

	broadcasters.forEach((broadcaster) => {
		const display = broadcaster.broadcasterDisplay || "";
		const abbreviation = broadcaster.broadcasterAbbreviation || "";

		if (
			display.startsWith("Sky Sport") ||
			abbreviation.startsWith("SKYGermany") ||
			abbreviation.startsWith("SkyGermany")
		) {
			labels.add("Sky");
			return;
		}

		if (display) {
			labels.add(display);
		}
	});

	return Array.from(labels);
}

function getTopExcitementTeam(team) {
	return {
		teamId: team?.teamId || null,
		teamTricode: team?.teamTricode || "",
		teamCity: team?.teamCity || "",
		teamName: team?.teamName || "",
	};
}

function buildTopExcitementGameRecord(game, league, season, excitement) {
	return {
		league: league.id,
		season,
		gameId: game.gameId,
		gameDateTimeUTC: game.gameDateTimeUTC,
		awayTeam: getTopExcitementTeam(game.awayTeam),
		homeTeam: getTopExcitementTeam(game.homeTeam),
		awayScore: Number(game.awayTeam?.score) || 0,
		homeScore: Number(game.homeTeam?.score) || 0,
		excitement,
		gameLabel: game.gameLabel || "",
		gameSubLabel: game.gameSubLabel || "",
		broadcastLabels: getBroadcastLabels(game),
		recapUrl: getRecapUrl(game, league),
		recapHost: league.recapHost,
		updatedAt: new Date().toISOString(),
	};
}

function sortTopExcitementRecords(records) {
	return records.slice().sort((a, b) => {
		if (b.excitement !== a.excitement) {
			return b.excitement - a.excitement;
		}

		return new Date(b.gameDateTimeUTC) - new Date(a.gameDateTimeUTC);
	});
}

async function readTopExcitementGameRecords(kv, leagueId, season) {
	const keys = getTopExcitementKeys(leagueId, season);
	const records = [];

	for await (const entry of kv.list({ prefix: keys.gamePrefix })) {
		if (entry.value) {
			records.push(entry.value);
		}
	}

	return records;
}

async function writeTopExcitementState(kv, league, season, eligibleCount) {
	const keys = getTopExcitementKeys(league.id, season);
	const records = await readTopExcitementGameRecords(kv, league.id, season);
	const sortedRecords = sortTopExcitementRecords(records);
	const items = sortedRecords.slice(0, TOP_EXCITEMENT_MAX_ITEMS);
	const now = new Date().toISOString();
	const cachedCount = records.length;
	const complete = cachedCount >= eligibleCount;

	await kv.set(keys.top, {
		league: league.id,
		season,
		updatedAt: now,
		complete,
		cachedCount,
		eligibleCount,
		items,
	}, { expireIn: TOP_EXCITEMENT_TTL_MS });

	await kv.set(keys.meta, {
		league: league.id,
		season,
		updatedAt: now,
		complete,
		cachedCount,
		eligibleCount,
	}, { expireIn: TOP_EXCITEMENT_TTL_MS });

	return { records, items, cachedCount, complete, updatedAt: now };
}

function selectTopExcitementBatch(eligibleGames, cachedGameIds, now = new Date()) {
	const recentThreshold = now.getTime() - TOP_EXCITEMENT_RECENT_WINDOW_MS;
	const missingGames = eligibleGames.filter((game) => !cachedGameIds.has(game.gameId));
	const recentGames = missingGames.filter((game) => {
		return new Date(game.gameDateTimeUTC).getTime() >= recentThreshold;
	});
	const olderGames = missingGames.filter((game) => {
		return new Date(game.gameDateTimeUTC).getTime() < recentThreshold;
	});

	return recentGames
		.concat(olderGames)
		.slice(0, TOP_EXCITEMENT_BATCH_SIZE);
}

async function computeTopExcitementGame(kv, game, league, season) {
	const playByPlayUrl = `${league.playByPlayBaseUrl}${game.gameId}.json`;
	const playByPlayJson = await fetchUpstream(playByPlayUrl, league);
	const excitement = computeGameExcitement(playByPlayJson, league.id);
	const record = buildTopExcitementGameRecord(game, league, season, excitement);

	await kv.set(
		getTopExcitementGameKey(league.id, season, game.gameId),
		record,
		{ expireIn: TOP_EXCITEMENT_TTL_MS },
	);
}

async function processTopExcitementBatch(league, season, eligibleGames) {
	const processingKey = `${league.id}:${season}`;

	if (topExcitementProcessing.has(processingKey)) {
		return;
	}

	topExcitementProcessing.add(processingKey);

	try {
		const kv = await getKv();
		const records = await readTopExcitementGameRecords(kv, league.id, season);
		const cachedGameIds = new Set(records.map((record) => record.gameId));
		const batch = selectTopExcitementBatch(eligibleGames, cachedGameIds);

		if (!batch.length) {
			await writeTopExcitementState(kv, league, season, eligibleGames.length);
			return;
		}

		for (const game of batch) {
			try {
				await computeTopExcitementGame(kv, game, league, season);
			} catch (error) {
				console.warn("[/top-excitement] game skipped", league.id, game.gameId, error);
			}
		}

		await writeTopExcitementState(kv, league, season, eligibleGames.length);
	} catch (error) {
		console.error("[/top-excitement] background batch failed", league.id, season, error);
	} finally {
		topExcitementProcessing.delete(processingKey);
	}
}

function runBackgroundTask(context, promise) {
	const waitUntil = context && typeof context.waitUntil === "function" ? context.waitUntil.bind(context) : null;
	const edgeRuntime = globalThis["EdgeRuntime"];
	const edgeWaitUntil = edgeRuntime && typeof edgeRuntime.waitUntil === "function"
		? edgeRuntime.waitUntil.bind(edgeRuntime)
		: null;

	if (waitUntil) {
		waitUntil(promise);
		return;
	}

	if (edgeWaitUntil) {
		edgeWaitUntil(promise);
		return;
	}

	promise.catch((error) => {
		console.error("[background task failed]", error);
	});
}

async function handleTopExcitement(url, origin, league, context) {
	const limit = getTopExcitementLimit(url);
	const scheduleJson = await fetchUpstream(league.scheduleUrl, league);
	const season = getScheduleSeason(scheduleJson);
	const eligibleGames = getTopExcitementEligibleGames(scheduleJson, league);
	const kv = await getKv();
	const keys = getTopExcitementKeys(league.id, season);
	const [topEntry, metaEntry] = await kv.getMany([keys.top, keys.meta]);
	const topValue = topEntry.value || {};
	const metaValue = metaEntry.value || {};
	const cachedItems = Array.isArray(topValue.items) ? topValue.items : [];
	const cachedCount = Number(metaValue.cachedCount ?? topValue.cachedCount) || 0;
	const eligibleCount = eligibleGames.length;
	const complete = eligibleCount === 0 || cachedCount >= eligibleCount;
	const processingKey = `${league.id}:${season}`;
	const processingQueued = !complete && !topExcitementProcessing.has(processingKey);

	if (processingQueued) {
		runBackgroundTask(
			context,
			processTopExcitementBatch(league, season, eligibleGames),
		);
	}

	return respondWithCors({
		league: league.id,
		season,
		updatedAt: topValue.updatedAt || metaValue.updatedAt || null,
		complete,
		processingQueued,
		cachedCount,
		eligibleCount,
		items: cachedItems.slice(0, limit),
	}, origin);
}

function getCell(row, headerIndex, name) {
	return row[headerIndex.get(name)];
}

function createStandingsTeam(row, headerIndex, teamTricode) {
	return {
		teamId: getCell(row, headerIndex, "TeamID"),
		teamTricode,
		teamCity: getCell(row, headerIndex, "TeamCity"),
		teamName: getCell(row, headerIndex, "TeamName"),
		wins: Number(getCell(row, headerIndex, "WINS")) || 0,
		losses: Number(getCell(row, headerIndex, "LOSSES")) || 0,
		winPct: Number(getCell(row, headerIndex, "WinPCT")) || 0,
		gb: Number(getCell(row, headerIndex, "ConferenceGamesBack")) || 0,
		playoffRank: Number(getCell(row, headerIndex, "PlayoffRank")) || 0,
		leagueRank: Number(getCell(row, headerIndex, "LeagueRank")) || 0,
		leagueGb: Number(getCell(row, headerIndex, "LeagueGamesBack")) || 0,
		divisionRank: Number(getCell(row, headerIndex, "DivisionRank")) || 0,
		divisionGb: Number(getCell(row, headerIndex, "DivisionGamesBack")) || 0,
		streak: getCell(row, headerIndex, "strCurrentStreak") || "—",
		home: getCell(row, headerIndex, "HOME") || "0-0",
		away: getCell(row, headerIndex, "ROAD") || "0-0",
		neutral: getCell(row, headerIndex, "NEUTRAL") || "0-0",
		conf: getCell(row, headerIndex, "ConferenceRecord") || "0-0",
		div: getCell(row, headerIndex, "DivisionRecord") || "0-0",
		division: getCell(row, headerIndex, "Division") || "",
		diff: Number(getCell(row, headerIndex, "DiffTotalPoints")) || 0,
		isDivisionLeader: getCell(row, headerIndex, "DivisionRank") === 1,
	};
}

function buildStandingsFromOfficialData(standingsJson, season, league) {
	const resultSet = standingsJson?.resultSets?.find((set) => set?.name === "Standings");
	const headers = resultSet?.headers ?? [];
	const rows = resultSet?.rowSet ?? [];

	if (!Array.isArray(headers) || !Array.isArray(rows) || rows.length === 0) {
		throw new Error("Official standings response is missing standings rows");
	}

	const headerIndex = new Map(headers.map((header, index) => [header, index]));
	const east = [];
	const west = [];
	const teamTricodeById = TEAM_TRICODE_BY_ID_BY_LEAGUE[league.id];

	// Keep this payload shape identical to buildStandingsFromSchedule().
	for (const row of rows) {
		const teamId = getCell(row, headerIndex, "TeamID");
		const teamTricode = teamTricodeById[teamId];
		const conference = getCell(row, headerIndex, "Conference");
		const target = conference === "East" ? east : conference === "West" ? west : null;

		if (!teamTricode || !target) {
			throw new Error(`Official standings response contains unknown team or conference: ${teamId}`);
		}

		target.push(createStandingsTeam(row, headerIndex, teamTricode));
	}

	return {
		season,
		updatedAt: new Date().toISOString(),
		east,
		west,
	};
}

function buildDivisionsFromOfficialData(standingsJson, league) {
	const resultSet = standingsJson?.resultSets?.find((set) => set?.name === "Standings");
	const headers = resultSet?.headers ?? [];
	const rows = resultSet?.rowSet ?? [];

	if (!Array.isArray(headers) || !Array.isArray(rows) || rows.length === 0) {
		throw new Error("Official division standings response is missing standings rows");
	}

	const headerIndex = new Map(headers.map((header, index) => [header, index]));
	const divisions = {};
	const teamTricodeById = TEAM_TRICODE_BY_ID_BY_LEAGUE[league.id];

	for (const row of rows) {
		const teamId = getCell(row, headerIndex, "TeamID");
		const teamTricode = teamTricodeById[teamId];
		const division = getCell(row, headerIndex, "Division");

		if (!teamTricode || !division) {
			throw new Error(`Official division standings response contains unknown team or division: ${teamId}`);
		}

		if (!divisions[division]) {
			divisions[division] = [];
		}

		divisions[division].push(createStandingsTeam(row, headerIndex, teamTricode));
	}

	return divisions;
}

function isRegularSeasonGame(game, league) {
	// NBA/WNBA game IDs encode the stage in the first three digits.
	return game?.gameId?.startsWith(league.regularSeasonPrefix) === true;
}

function buildStandingsFromSchedule(scheduleJson, league) {
	const season = scheduleJson?.meta?.seasonYear ||
		scheduleJson?.leagueSchedule?.seasonYear || "unknown";
	const dates = scheduleJson?.leagueSchedule?.gameDates ?? [];
	const games = dates.flatMap((d) => d.games ?? []);

	const team = new Map();
	const ensure = (t) => {
		if (!t || !t.teamId) return null;
		if (!team.has(t.teamId)) {
			const meta = getMeta(t.teamTricode, league);
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
		.filter((g) => g?.gameStatus === 3 && isRegularSeasonGame(g, league))
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
			if (!t.div) continue;
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

	const leagueRows = all.slice().sort(compareTeams);
	const leagueLeader = leagueRows[0];
	const leagueLeaderWins = leagueLeader?.wins ?? 0;
	const leagueLeaderLosses = leagueLeader?.losses ?? 0;
	const leagueRanks = new Map(leagueRows.map((row, index) => {
		const gb = leagueLeader ? ((leagueLeaderWins - row.wins) + (row.losses - leagueLeaderLosses)) / 2 : 0;
		return [row.teamId, {
			rank: index + 1,
			gb: +gb.toFixed(1),
		}];
	}));

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
				playoffRank: leagueRanks.get(r.teamId)?.rank || 0,
				leagueRank: leagueRanks.get(r.teamId)?.rank || 0,
				leagueGb: leagueRanks.get(r.teamId)?.gb || 0,
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
Deno.serve(async (req, context) => {
	const url = new URL(req.url);
	const PATH = url.pathname;
	const origin = getOrigin(req);
	const league = getLeague(url);

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

	if (!league) {
		return new Response("Invalid league", {
			status: 400,
			headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
		});
	}

	try {
		// --- /schedule: fetch fresh ---
		if (PATH === "/schedule") {
			return proxyWithCors(league.scheduleUrl, origin, league);
		}

		if (PATH === "/top-excitement") {
			return handleTopExcitement(url, origin, league, context);
		}

		// --- /standings: fetch fresh ---
		if (PATH === "/standings") {
			try {
				// Prefer the official standings. If stats.nba.com fails, keep the app usable
				// with the derived standings built from the schedule feed.
				const seasonString = await getSeasonYear(league);
				const standingsUrl = getOfficialStandingsUrl(seasonString, league);
				const data = await fetchUpstream(standingsUrl, league, true);
				const payload = buildStandingsFromOfficialData(data, seasonString, league);
				if (league.id === "nba") {
					const divisionsUrl = getOfficialStandingsUrl(seasonString, league, "div");
					const divisionsData = await fetchUpstream(divisionsUrl, league, true);
					payload.divisions = buildDivisionsFromOfficialData(divisionsData, league);
				}
				console.log("[/standings] official season", league.id, payload.season);
				return respondWithCors(payload, origin, 60);
			} catch (err) {
				console.warn("[/standings] official fallback", league.id, err);
				const data = await fetchUpstream(league.scheduleUrl, league);
				const payload = buildStandingsFromSchedule(data, league);
				console.log("[/standings] derived season", league.id, payload.season);
				return respondWithCors(payload, origin, 60);
			}
		}

		if (PATH === "/standings-official") {
			const seasonString = await getSeasonYear(league);
			const standingsUrl = getOfficialStandingsUrl(seasonString, league);
			const data = await fetchUpstream(standingsUrl, league, true);
			const payload = buildStandingsFromOfficialData(data, seasonString, league);
			if (league.id === "nba") {
				const divisionsUrl = getOfficialStandingsUrl(seasonString, league, "div");
				const divisionsData = await fetchUpstream(divisionsUrl, league, true);
				payload.divisions = buildDivisionsFromOfficialData(divisionsData, league);
			}
			console.log("[/standings-official] season", league.id, payload.season);
			return respondWithCors(payload, origin, 60);
		}

		// --- /playoffbracket: use cached season year only ---
		if (PATH === "/playoffbracket") {
			if (league.id !== "nba") {
				return new Response("Bracket not available for league", {
					status: 400,
					headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
				});
			}
			const seasonString = await getSeasonYear(league);
			const year = seasonString.split("-")[0];
			const playoffUrl = `https://stats.nba.com/stats/playoffbracket?LeagueID=00&SeasonYear=${year}&State=2`;
			return proxyWithCors(playoffUrl, origin, league, true);
		}

		// --- /istbracket: use cached season year only ---
		if (PATH === "/istbracket") {
			if (league.id !== "nba") {
				return new Response("Bracket not available for league", {
					status: 400,
					headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
				});
			}
			const seasonString = await getSeasonYear(league);
			const year = seasonString.split("-")[0];
			const istBracketUrl = `https://cdn.nba.com/static/json/staticData/brackets/${year}/ISTBracket.json`;
			return proxyWithCors(istBracketUrl, origin, league);
		}

		// --- /scoreboard: no cache, always live ---
		if (PATH === "/scoreboard") {
			return proxyWithCors(league.scoreboardUrl, origin, league);
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

			const boxscoreUrl = `${league.boxscoreBaseUrl}${gameId}.json`;
			return proxyWithCors(boxscoreUrl, origin, league);
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

			const playbyplayUrl = `${league.playByPlayBaseUrl}${gameId}.json`;
			return proxyWithCors(playbyplayUrl, origin, league);
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
