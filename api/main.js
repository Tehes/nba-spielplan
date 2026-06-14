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

/* Broadcast Region Codes:
1 = USA
14 = Germany
*/
const DEFAULT_BROADCAST_REGION_CODE = "14";
const BROADCAST_REGION_CODES = new Map([
	["de", "14"],
	["us", "1"],
]);

const LEAGUES = {
	nba: {
		id: "nba",
		leagueId: "00",
		scheduleBaseUrl: "https://cdn.nba.com/static/json/staticData",
		scoreboardUrl: "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
		boxscoreBaseUrl: "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_",
		playByPlayBaseUrl: "https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_",
		topExcitementPrefixes: new Set(["002", "004", "005"]),
		origin: "https://www.nba.com",
		recapHost: "NBA.com",
	},
	wnba: {
		id: "wnba",
		leagueId: "10",
		scheduleBaseUrl: "https://cdn.wnba.com/static/json/staticData",
		scoreboardUrl: "https://cdn.wnba.com/static/json/liveData/scoreboard/todaysScoreboard_10.json",
		boxscoreBaseUrl: "https://cdn.wnba.com/static/json/liveData/boxscore/boxscore_",
		playByPlayBaseUrl: "https://cdn.wnba.com/static/json/liveData/playbyplay/playbyplay_",
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
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Vary": "Origin",
};

const TOP_EXCITEMENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const TOP_EXCITEMENT_BATCH_SIZE = 8;
const TOP_EXCITEMENT_MAX_ITEMS = 10;
const TOP_EXCITEMENT_MIN_AGE_MS = 6 * 60 * 60 * 1000;
const TOP_EXCITEMENT_RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

const TEAM_IDS_BY_LEAGUE = {
	nba: {
		ATL: 1610612737,
		BOS: 1610612738,
		BKN: 1610612751,
		CHA: 1610612766,
		CHI: 1610612741,
		CLE: 1610612739,
		DET: 1610612765,
		IND: 1610612754,
		MIA: 1610612748,
		MIL: 1610612749,
		NYK: 1610612752,
		ORL: 1610612753,
		PHI: 1610612755,
		TOR: 1610612761,
		WAS: 1610612764,
		DAL: 1610612742,
		DEN: 1610612743,
		GSW: 1610612744,
		HOU: 1610612745,
		LAC: 1610612746,
		LAL: 1610612747,
		MEM: 1610612763,
		MIN: 1610612750,
		NOP: 1610612740,
		OKC: 1610612760,
		PHX: 1610612756,
		POR: 1610612757,
		SAC: 1610612758,
		SAS: 1610612759,
		UTA: 1610612762,
	},
	wnba: {
		ATL: 1611661330,
		CHI: 1611661329,
		CON: 1611661323,
		DAL: 1611661321,
		GSV: 1611661331,
		IND: 1611661325,
		LAS: 1611661320,
		LVA: 1611661319,
		MIN: 1611661324,
		NYL: 1611661313,
		PDX: 1611661327,
		PHX: 1611661317,
		SEA: 1611661328,
		TOR: 1611661332,
		WAS: 1611661322,
	},
};

// NBA stats standings use TeamID but the frontend styles teams by tricode.
const TEAM_TRICODE_BY_ID_BY_LEAGUE = Object.fromEntries(
	Object.entries(TEAM_IDS_BY_LEAGUE).map(([leagueId, teams]) => [
		leagueId,
		Object.fromEntries(Object.entries(teams).map(([tricode, teamId]) => [teamId, tricode])),
	]),
);

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
		const schedule = await fetchUpstream(getScheduleUrl(league), league);
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

function getBroadcastRegionCode(url) {
	const region = url.searchParams.get("region");

	if (region === "none") {
		return DEFAULT_BROADCAST_REGION_CODE;
	}

	if (region) {
		return BROADCAST_REGION_CODES.get(region) || DEFAULT_BROADCAST_REGION_CODE;
	}

	return DEFAULT_BROADCAST_REGION_CODE;
}

function getScheduleUrl(league, regionCode = DEFAULT_BROADCAST_REGION_CODE) {
	return `${league.scheduleBaseUrl}/scheduleLeagueV2_${regionCode}.json`;
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
				console.warn("[excitement backfill] game skipped", league.id, game.gameId, error);
			}
		}

		await writeTopExcitementState(kv, league, season, eligibleGames.length);
	} catch (error) {
		console.error("[excitement backfill] background batch failed", league.id, season, error);
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

function methodNotAllowed(origin) {
	return new Response("Method Not Allowed", {
		status: 405,
		headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
	});
}

async function handleTopExcitement(url, origin, league) {
	// TODO: Wire the future Top-10 frontend view to this read-only endpoint.
	const limit = getTopExcitementLimit(url);
	const season = await getSeasonYear(league);
	const kv = await getKv();
	const keys = getTopExcitementKeys(league.id, season);
	const [topEntry, metaEntry] = await kv.getMany([keys.top, keys.meta]);
	const topValue = topEntry.value || {};
	const metaValue = metaEntry.value || {};
	const cachedItems = Array.isArray(topValue.items) ? topValue.items : [];
	const cachedCount = Number(metaValue.cachedCount ?? topValue.cachedCount) || 0;
	const eligibleCount = Number(metaValue.eligibleCount ?? topValue.eligibleCount) || 0;
	const complete = Boolean(metaValue.complete ?? topValue.complete ?? false);

	return respondWithCors({
		league: league.id,
		season,
		updatedAt: topValue.updatedAt || metaValue.updatedAt || null,
		complete,
		cachedCount,
		eligibleCount,
		items: cachedItems.slice(0, limit),
	}, origin);
}

async function handleBackfillExcitement(origin, league, context) {
	const scheduleJson = await fetchUpstream(getScheduleUrl(league), league);
	const season = getScheduleSeason(scheduleJson);
	const eligibleGames = getTopExcitementEligibleGames(scheduleJson, league);
	const kv = await getKv();
	const keys = getTopExcitementKeys(league.id, season);
	const [topEntry, metaEntry] = await kv.getMany([keys.top, keys.meta]);
	const topValue = topEntry.value || {};
	const metaValue = metaEntry.value || {};
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
		complete,
		processingQueued,
		cachedCount,
		eligibleCount,
	}, origin);
}

async function handleFetchExcitement(req, origin, league) {
	let body;

	try {
		body = await req.json();
	} catch (_error) {
		return new Response("Invalid JSON body", {
			status: 400,
			headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
		});
	}

	if (!body || !Array.isArray(body.gameIds)) {
		return new Response("gameIds must be an array", {
			status: 400,
			headers: withCors(origin, { "content-type": "text/plain; charset=utf-8" }),
		});
	}

	const gameIds = Array.from(new Set(body.gameIds.filter((gameId) => typeof gameId === "string")));
	const season = await getSeasonYear(league);
	const kv = await getKv();
	const scores = {};
	const missing = [];

	await Promise.all(gameIds.map(async (gameId) => {
		const entry = await kv.get(getTopExcitementGameKey(league.id, season, gameId));
		const excitement = entry.value?.excitement;

		if (Number.isFinite(excitement)) {
			scores[gameId] = excitement;
		} else {
			missing.push(gameId);
		}
	}));

	return respondWithCors({
		league: league.id,
		season,
		scores,
		missing,
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

// === Server ===
Deno.serve(async (req, context) => {
	const url = new URL(req.url);
	const PATH = url.pathname;
	const origin = req.headers.get("origin") || "";
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
			return proxyWithCors(getScheduleUrl(league, getBroadcastRegionCode(url)), origin, league);
		}

		if (PATH === "/top-excitement") {
			if (req.method !== "GET") {
				return methodNotAllowed(origin);
			}

			return handleTopExcitement(url, origin, league);
		}

		if (PATH === "/backfill-excitement") {
			if (req.method !== "POST") {
				return methodNotAllowed(origin);
			}

			return handleBackfillExcitement(origin, league, context);
		}

		if (PATH === "/fetch-excitement") {
			if (req.method !== "POST") {
				return methodNotAllowed(origin);
			}

			return handleFetchExcitement(req, origin, league);
		}

		// --- /standings: fetch fresh ---
		if (PATH === "/standings") {
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
