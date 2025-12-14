// === Constants ===
const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";
const SCOREBOARD_URL =
	"https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const BOXSCORE_BASE_URL = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_";
const PLAYBYPLAY_BASE_URL = "https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_";

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
		.filter((g) =>
			g?.gameStatus === 3 &&
			g?.gameLabel !== "Preseason" &&
			!(g?.gameLabel === "Emirates NBA Cup" &&
				g?.gameSubLabel?.toLowerCase() === "championship")
		)
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

		// Punkte für Differenz
		home.ptsFor += hs;
		home.ptsAgainst += as;
		away.ptsFor += as;
		away.ptsAgainst += hs;

		// Win/Loss + Home/Away/Neutral
		if (isNeutral) {
			// Gesamtbilanz & Streaks
			winner.wins++;
			loser.losses++;
			winner.lastResults.push("W");
			loser.lastResults.push("L");
			// Neutral-Splits
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

		// Head-to-Head Tabelle pflegen
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

	// Division-Leader ermitteln – entries() → values()
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

	// --- Comparator mit (vereinfachten) NBA-Tie-Breakern für 2er-Gleichstand ---
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
			return bHBpct - aHBpct; // höherer Head-to-Head-Prozentsatz zuerst
		}

		// 2) Division-Sieger vor Nicht-Division-Sieger (gilt in Conference-Standings)
		const aDivLeader = divisionLeaders.has(a.teamId);
		const bDivLeader = divisionLeaders.has(b.teamId);
		if (aDivLeader !== bDivLeader) return aDivLeader ? -1 : 1;

		// 3) Division-Record (nur wenn gleiche Division)
		if (a.div && b.div && a.div === b.div) {
			const aDivPct = (a.divW + a.divL) ? a.divW / (a.divW + a.divL) : 0;
			const bDivPct = (b.divW + b.divL) ? b.divW / (b.divW + b.divL) : 0;
			if (bDivPct !== aDivPct) return bDivPct - aDivPct;
		}

		// 4) Conference-Record
		const aConfPct = (a.confW + a.confL) ? a.confW / (a.confW + a.confL) : 0;
		const bConfPct = (b.confW + b.confL) ? b.confW / (b.confW + b.confL) : 0;
		if (bConfPct !== aConfPct) return bConfPct - aConfPct;

		// 5) Punktedifferenz (über alle Spiele)
		const aDiff = a.ptsFor - a.ptsAgainst;
		const bDiff = b.ptsFor - b.ptsAgainst;
		if (bDiff !== aDiff) return bDiff - aDiff;

		// Fallback stabil
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

	// CORS preflight
	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	try {
		// --- /schedule: fetch fresh ---
		if (PATH === "/schedule") {
			return proxyWithCors(SCHEDULE_URL);
		}

		// --- /standings: fetch fresh ---
		if (PATH === "/standings") {
			const data = await fetchUpstream(SCHEDULE_URL);
			const payload = buildStandingsFromSchedule(data);
			console.log("[/standings] season", payload.season);
			return respondWithCors(payload, 60);
		}

		// --- /playoffbracket: use cached season year only ---
		if (PATH === "/playoffbracket") {
			const seasonString = await getSeasonYear();
			const year = seasonString.split("-")[0];
			const playoffUrl =
				`https://stats.nba.com/stats/playoffbracket?LeagueID=00&SeasonYear=${year}&State=2`;
			return proxyWithCors(playoffUrl);
		}

		// --- /istbracket: use cached season year only ---
		if (PATH === "/istbracket") {
			const seasonString = await getSeasonYear();
			const year = seasonString.split("-")[0];
			const istBracketUrl =
				`https://cdn.nba.com/static/json/staticData/brackets/${year}/ISTBracket.json`;
			return proxyWithCors(istBracketUrl);
		}

		// --- /scoreboard: KEIN Cache (immer live) ---
		if (PATH === "/scoreboard") {
			return proxyWithCors(SCOREBOARD_URL);
		}

		// --- /boxscore/:gameId: KEIN Cache (immer live) ---
		if (PATH.startsWith("/boxscore/")) {
			const gameId = PATH.slice("/boxscore/".length);

			// einfache Validierung, damit kein Unsinn durchgeht
			if (!/^\d{10}$/.test(gameId)) {
				return new Response("Invalid gameId", {
					status: 400,
					headers: {
						...CORS_HEADERS,
						"content-type": "text/plain; charset=utf-8",
					},
				});
			}

			const boxscoreUrl = `${BOXSCORE_BASE_URL}${gameId}.json`;
			return proxyWithCors(boxscoreUrl);
		}

		// --- /playbyplay/:gameId: KEIN Cache (immer live) ---
		if (PATH.startsWith("/playbyplay/")) {
			const gameId = PATH.slice("/playbyplay/".length);

			// einfache Validierung, damit kein Unsinn durchgeht
			if (!/^\d{10}$/.test(gameId)) {
				return new Response("Invalid gameId", {
					status: 400,
					headers: {
						...CORS_HEADERS,
						"content-type": "text/plain; charset=utf-8",
					},
				});
			}

			const playbyplayUrl = `${PLAYBYPLAY_BASE_URL}${gameId}.json`;
			return proxyWithCors(playbyplayUrl);
		}

		return new Response("Not Found", {
			status: 404,
			headers: { ...CORS_HEADERS, "content-type": "text/plain; charset=utf-8" },
		});
	} catch (err) {
		console.error("[error]", err);
		return new Response(`Error: ${err.message}`, {
			status: 500,
			headers: { ...CORS_HEADERS, "content-type": "text/plain; charset=utf-8" },
		});
	}
});
