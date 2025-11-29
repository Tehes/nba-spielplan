/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

async function fetchData(url, updateFunction, forceNetwork = false) {
	const cacheName = "nba-data-cache"; // never change "-data-" because its used in cleanup
	const isCoreData = coreCacheUrls.has(url);
	const cache = isCoreData ? await caches.open(cacheName) : null;

	if (!forceNetwork && cache) {
		const cachedResponse = await cache.match(url);
		if (cachedResponse) {
			const cachedJson = await cachedResponse.json();
			console.log("Cached data loaded");
			const alreadyRendered = isCoreData && renderedCoreCacheUrls.has(url);
			if (!alreadyRendered) {
				updateFunction(cachedJson);
				if (isCoreData) {
					renderedCoreCacheUrls.add(url);
				}
			}
			return;
		}
	}

	console.log("Fetching from network...");

	try {
		const networkResponse = await fetch(url);
		if (networkResponse.ok) {
			const clonedResponse = isCoreData ? networkResponse.clone() : null;
			const json = await networkResponse.json();
			console.log("Fresh data fetched:", json);
			if (cache && clonedResponse) {
				cache.put(url, clonedResponse);
			}
			updateFunction(json);
		} else {
			throw new Error(`Network error! Status: ${networkResponse.status}`);
		}
	} catch (error) {
		console.error("Fetching fresh data failed:", error);
	}
}

/* --------------------------------------------------------------------------------------------------
Variables
---------------------------------------------------------------------------------------------------*/
// API Endpoints
const scheduleURL = "https://nba-spielplan.tehes.deno.net/schedule";
const standingsURL = "https://nba-spielplan.tehes.deno.net/standings";
const todaysScoreboardURL = "https://nba-spielplan.tehes.deno.net/scoreboard";
const boxscoreURL = "https://nba-spielplan.tehes.deno.net/boxscore";
const playByPlayURL = "https://nba-spielplan.tehes.deno.net/playbyplay";
const coreCacheUrls = new Set([scheduleURL, standingsURL]);

// Data Holders
let liveById = new Map();
let livePoll = null;
const excitementCache = new Map();

let schedule;
let standings;
let games = {};

let currentBoxscore = null;
let currentPlayByPlay = null;

let eastData = [];
let westData = [];

let standingsEast;
let standingsWest;
let playoffTeams;

const renderedCoreCacheUrls = new Set();
let lastCheckedDay = new Date().toLocaleDateString("de-DE", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

// DOM Elements

const todayEl = document.querySelector("#today");
const moreEl = document.querySelector("#more");
const progressValue = document.querySelector("#progress-value");
const teamPicker = document.querySelector("select");
const checkboxShowScores = document.querySelector(".show-scores input");
const checkboxShowRating = document.querySelector(".show-rating input");
const checkboxHidePastGames = document.querySelector(".hide-past-games input");
const checkboxPrimetime = document.querySelector(".filter-primetime input");
const checkboxPlayByPlayMadeShots = document.querySelector("#playbyplay-panel input");
const backdropEl = document.querySelector("#backdrop");
const gameOverlayEl = document.querySelector("#game-overlay");
const gameOverlayCloseBtn = gameOverlayEl.querySelector(".close");
const periodsEl = document.querySelector("#periods");
const teamStatsEl = document.querySelector("#team-stats");
const teamsEl = document.querySelector("#teams");
const gameOverlay = document.getElementById("game-overlay");
const gameTabs = gameOverlay.querySelectorAll(".tab");
const gameExcitementEl = document.querySelector("#game-excitement");
const gameExcitementValueEl = document.querySelector("#game-excitement-value");
const gameExcitementLabelEl = document.querySelector("#game-excitement-label");

// Constants
const GAME_MAX_DURATION_MS = (3 * 60 + 15) * 60 * 1000; // 3h 15m
const TOTAL_REGULAR_SEASON_GAMES = 1230;
const AUTO_REFRESH_INTERVAL_MS = 1 * 60 * 1000; // 1 minute

// Load saved states
checkboxPrimetime.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_primetime") || "false",
);

checkboxShowScores.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_showScores") || "true",
);

checkboxShowRating.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_showRating") || "false",
);

checkboxPlayByPlayMadeShots.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_pbp_madeShotsOnly") || "false",
);

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/

function updateLive(liveJson) {
	const arr = liveJson?.scoreboard?.games ?? [];
	liveById = new Map(arr.map((g) => [g.gameId, g]));
	renderTodaysGames();

	if (!gameOverlayEl.classList.contains("hidden")) {
		const gameId = gameOverlayEl.dataset.gameId;
		const liveGame = liveById.get(gameId);

		if (liveGame?.gameStatus === 2) {
			const bsUrl = `${boxscoreURL}/${gameId}`;
			fetchData(
				bsUrl,
				(json) => {
					currentBoxscore = json;
					renderBoxscore(json);
				},
				true,
			);

			const pbpUrl = `${playByPlayURL}/${gameId}`;
			fetchData(
				pbpUrl,
				(pbpJson) => {
					currentPlayByPlay = pbpJson;
					renderPlayByPlay(pbpJson);
				},
				true,
			);
		}
	}
}

function fetchLiveOnce() {
	fetchData(todaysScoreboardURL, updateLive, true);
}

function startLivePolling() {
	if (!livePoll) {
		console.log("Starting live polling...");
		fetchLiveOnce();
		livePoll = setInterval(fetchLiveOnce, AUTO_REFRESH_INTERVAL_MS); // 60 seconds
	}
}

function stopLivePolling() {
	if (livePoll) {
		console.log("Stopping live polling");
		clearInterval(livePoll);
		livePoll = null;
	}
}

function getGameState(game, live, now = new Date()) {
	const start = game?.localDate instanceof Date ? game.localDate : new Date(game?.localDate);
	const startMs = start?.getTime?.() ?? NaN;
	const hasValidStart = Number.isFinite(startMs);
	const isPostponed = game?.gameStatus === 4;
	const isFinal = game?.gameStatus === 3 || live?.gameStatus === 3;
	const inLiveWindow = hasValidStart &&
		!isFinal &&
		!isPostponed &&
		now.getTime() >= startMs &&
		now.getTime() < startMs + GAME_MAX_DURATION_MS;
	const isLive = !isFinal && !isPostponed && (live?.gameStatus === 2 || inLiveWindow);

	return { isPostponed, isFinal, isLive, inLiveWindow };
}

function prepareGameData() {
	const allGames = schedule.leagueSchedule.gameDates.flatMap((d) => d.games || []);

	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

	allGames.forEach((game) => {
		game.localDate = new Date(game.gameDateTimeUTC);

		// Format date and time for display
		if (Number.isNaN(game.localDate.getTime())) {
			game.date = "Noch offen";
			game.time = "HH:MM";
		} else {
			game.date = game.localDate.toLocaleDateString("de-DE", {
				weekday: "short",
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
			});
			game.time = game.localDate.toLocaleTimeString("de-DE", {
				hour: "2-digit",
				minute: "2-digit",
			});
		}

		const live = liveById.get(game.gameId);
		const { isPostponed, isFinal, isLive } = getGameState(game, live, now);
		const isToday = game.localDate >= todayStart && game.localDate < tomorrowStart;

		if ((isToday && !isPostponed) || isLive) {
			games.today.push(game);
		} else if (isFinal) {
			games.finished.push(game);
		} else if (game.localDate >= tomorrowStart && !isPostponed) {
			games.scheduled.push(game);
		}

		// Playoff games
		if (isFinal && game.seriesText !== "") {
			games.playoffs.push(game);
		}
	});

	games.today.sort((a, b) => a.localDate - b.localDate);
	games.finished.sort((a, b) => a.localDate - b.localDate);
	games.scheduled.sort((a, b) => a.localDate - b.localDate);
}

function setProgressBar() {
	const notPre = (g) => g.gameLabel !== "Preseason";

	const done = (games.finished?.filter(notPre).filter((g) => g.gameStatus === 3).length ?? 0) +
		(games.today?.filter(notPre).filter((g) => g.gameStatus === 3).length ?? 0);

	const pct = Math.floor((done * 100) / TOTAL_REGULAR_SEASON_GAMES);

	progressValue.style.width = `${pct}%`;
	progressValue.textContent = `${pct}%`;
}

// Helper to format ISO 8601 PTxxMxxS durations to M:SS
function formatMinutes(isoDuration) {
	if (!isoDuration || typeof isoDuration !== "string") return "";

	const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
	if (!match) return "";

	const minutes = match[1] ? parseInt(match[1], 10) : 0;
	const secondsFloat = match[2] ? parseFloat(match[2]) : 0;
	const totalSeconds = Math.round(minutes * 60 + secondsFloat);

	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;

	return `${m}:${String(s).padStart(2, "0")}`;
}

function parseClockToSeconds(isoDuration) {
	if (!isoDuration || typeof isoDuration !== "string") return NaN;

	const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
	if (!match) return NaN;

	const minutes = match[1] ? parseInt(match[1], 10) : 0;
	const secondsFloat = match[2] ? parseFloat(match[2]) : 0;

	return Math.round(minutes * 60 + secondsFloat);
}

function getOvertimeCount(actions) {
	const maxPeriod = (actions || []).reduce(
		(max, action) => Math.max(max, Number(action?.period) || 0),
		0,
	);
	return Math.max(0, maxPeriod - 4);
}

// Build a label for live games based on period and gameClock from live scoreboard data
function getLiveLabel(live) {
	if (!live) return "LIVE";

	// Pregame
	if (live.gameStatus === 1) {
		return "in Kürze";
	}

	const period = Number(live.period);
	const clockStr = formatMinutes(live.gameClock);

	const isOT = period > 4;
	const otIndex = period - 4;
	const otLabel = otIndex === 1 ? "OT" : `OT${otIndex}`;

	// End of periods or OT
	if (clockStr === "0:00") {
		if (period === 2) {
			return "Halbzeit";
		}
		if (!isOT) {
			return `Ende Q${period}`;
		}
		return `Ende ${otLabel}`;
	}

	// running time of periods
	if (!isOT) {
		return `Q${period} ${clockStr}`;
	}

	// running time of OT
	return `${otLabel} ${clockStr}`;
}

function renderTodaysGames() {
	todayEl.replaceChildren();

	const now = new Date();
	let needsPolling = false;

	if (games.today.length > 0) {
		games.today.forEach((g) => {
			const live = liveById.get(g.gameId);
			const { isFinal, isLive } = getGameState(g, live, now);
			const template = document.querySelector("#template-today");
			const clone = template.content.cloneNode(true);
			const card = clone.querySelector(".card");
			card.dataset.gameCode = g.gameCode;
			card.dataset.gameId = g.gameId;

			const homeTeam = clone.querySelector(".home-team");
			const visitingTeam = clone.querySelector(".visiting-team");
			const homeLogo = homeTeam.querySelector(".logo");
			const visitingLogo = visitingTeam.querySelector(".logo");
			const homeName = homeTeam.querySelector(".name");
			const visitingName = visitingTeam.querySelector(".name");
			const homeAbbr = homeTeam.querySelector(".abbr");
			const visitingAbbr = visitingTeam.querySelector(".abbr");
			const homeWL = homeTeam.querySelector(".wl");
			const visitingWL = visitingTeam.querySelector(".wl");
			const homeScore = homeTeam.querySelector(".score");
			const visitingScore = visitingTeam.querySelector(".score");
			const date = clone.querySelector(".date");
			const gameLabelEl = clone.querySelector(".game-label");
			const label = g.gameLabel || g.gameSubtype || "";
			const subLabel = g.gameSubLabel;

			// Team UI
			homeTeam.style.setProperty("--team-color", `var(--${g.homeTeam.teamTricode})`);
			visitingTeam.style.setProperty("--team-color", `var(--${g.awayTeam.teamTricode})`);
			homeLogo.src = `img/${g.homeTeam.teamTricode}.svg`;
			homeLogo.onerror = () => (homeLogo.src = "img/no-logo.svg");
			visitingLogo.src = `img/${g.awayTeam.teamTricode}.svg`;
			visitingLogo.onerror = () => (visitingLogo.src = "img/no-logo.svg");
			homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`;
			visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`;
			homeAbbr.textContent = g.homeTeam.teamTricode;
			visitingAbbr.textContent = g.awayTeam.teamTricode;

			gameLabelEl.textContent = label
				? (subLabel ? `${label} – ${subLabel}` : label)
				: subLabel;

			if (isLive) needsPolling = true;

			if (isFinal) {
				// FINAL
				date.classList.remove("live");
				if (checkboxShowRating.checked) {
					const cachedScore = excitementCache.get(g.gameId);
					if (cachedScore != null) {
						date.textContent = `${(cachedScore / 10).toFixed(1)}/10`;
					} else {
						date.textContent = "Lädt…";
						fetchExcitementForGame(g.gameId)
							.then((score) => {
								date.textContent = `${(score / 10).toFixed(1)}/10`;
							})
							.catch(() => {
								date.textContent = "Beendet";
							});
					}
				} else {
					date.textContent = "Beendet";
				}
				if (checkboxShowScores.checked) {
					const liveAway = live?.awayTeam?.score;
					const liveHome = live?.homeTeam?.score;
					const h = Number.isFinite(liveHome) ? liveHome : g.homeTeam.score;
					const a = Number.isFinite(liveAway) ? liveAway : g.awayTeam.score;
					homeScore.textContent = h ?? "";
					visitingScore.textContent = a ?? "";
					const hNum = Number(h);
					const aNum = Number(a);
					if (Number.isFinite(hNum) && Number.isFinite(aNum)) {
						homeScore.classList.toggle("lower", hNum < aNum);
						visitingScore.classList.toggle("lower", aNum < hNum);
					}
				} else {
					homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
					visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
				}
			} else if (isLive) {
				// LIVE
				date.classList.add("live");
				date.innerHTML = getLiveLabel(live);

				const liveAway = live?.awayTeam?.score;
				const liveHome = live?.homeTeam?.score;

				if (checkboxShowScores.checked) {
					const a = Number.isFinite(liveAway) ? liveAway : "—";
					const h = Number.isFinite(liveHome) ? liveHome : "—";
					homeScore.textContent = h;
					visitingScore.textContent = a;
				} else {
					homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
					visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
				}
			} else {
				// SCHEDULED
				date.classList.remove("live");
				date.textContent = g.time;
				homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
				visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
			}

			// Attach click handler for final or live games
			if (isFinal || isLive) {
				card.dataset.clickable = "true";
				card.addEventListener("click", () => {
					openGameOverlay(g.gameId, g.awayTeam.teamTricode, g.homeTeam.teamTricode);
				});
			}

			todayEl.appendChild(clone);
		});
	} else {
		todayEl.textContent = "Heute finden keine Spiele statt.";
	}

	if (needsPolling) {
		if (!livePoll) fetchLiveOnce();
		startLivePolling();
	} else {
		stopLivePolling();
	}
}

function renderMoreGames() {
	let dateHeadline = "";
	moreEl.innerHTML = "";

	let gamesToDisplay = [];

	if (checkboxHidePastGames.checked) {
		gamesToDisplay = games.scheduled;
	} else {
		gamesToDisplay = games.finished.concat(games.scheduled);
	}

	if (checkboxPrimetime.checked) {
		gamesToDisplay = gamesToDisplay.filter((g) => {
			const [hours, minutes] = g.time.split(":").map(Number);
			const gameHour = hours + minutes / 60;

			// Primetime
			return gameHour >= 18 && gameHour < 24;
		});
	}

	gamesToDisplay.forEach((g) => {
		if (dateHeadline === "" || dateHeadline !== g.date) {
			dateHeadline = g.date;
			const h3El = document.createElement("h3");
			const headlineText = document.createTextNode(g.date);
			h3El.dataset.timestamp = g.localDate.getTime();
			h3El.appendChild(headlineText);
			moreEl.appendChild(h3El);

			if (!checkboxHidePastGames.checked && games.scheduled[0]?.localDate === g.localDate) {
				const anchorTop = document.createElement("div");
				anchorTop.classList.add("jump-link");
				const anchorLink = document.createElement("a");
				anchorLink.textContent = "zu den heutigen Spielen";
				anchorTop.appendChild(anchorLink);
				anchorLink.href = "#top";
				moreEl.insertBefore(anchorTop, h3El);
			}
		}

		const template = document.querySelector("#template-more");
		const clone = template.content.cloneNode(true);

		const card = clone.querySelector(".card");
		const homeTeam = clone.querySelector(".home-team");
		const visitingTeam = clone.querySelector(".visiting-team");
		const homeName = homeTeam.querySelector(".name");
		const visitingName = visitingTeam.querySelector(".name");
		const homeWL = homeTeam.querySelector(".wl");
		const visitingWL = visitingTeam.querySelector(".wl");
		const homeColor = homeTeam.querySelector(".color");
		const visitingColor = visitingTeam.querySelector(".color");
		const homeAbbr = homeTeam.querySelector(".abbr");
		const visitingAbbr = visitingTeam.querySelector(".abbr");
		const homeScore = homeTeam.querySelector(".score");
		const visitingScore = visitingTeam.querySelector(".score");
		const date = clone.querySelector(".date");
		const gameLabelEl = clone.querySelector(".game-label");
		const label = (g.gameLabel || "").trim();
		const subLabel = (g.gameSubLabel || "").trim();

		homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`;
		visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`;
		homeAbbr.textContent = g.homeTeam.teamTricode;
		homeColor.style.setProperty("--team-color", `var(--${g.homeTeam.teamTricode})`);
		visitingAbbr.textContent = g.awayTeam.teamTricode;
		visitingColor.style.setProperty("--team-color", `var(--${g.awayTeam.teamTricode})`);
		card.dataset.abbr = `${g.awayTeam.teamTricode}/${g.homeTeam.teamTricode}`;
		date.textContent = `${g.time} Uhr`;
		gameLabelEl.textContent = label ? subLabel ? `${label} – ${subLabel}` : label : subLabel;

		if (g.gameStatus === 3) {
			homeScore.textContent = g.homeTeam.score ?? "";
			visitingScore.textContent = g.awayTeam.score ?? "";
			const hNum = Number(g.homeTeam.score);
			const aNum = Number(g.awayTeam.score);
			if (Number.isFinite(hNum) && Number.isFinite(aNum)) {
				homeScore.classList.toggle("lower", hNum < aNum);
				visitingScore.classList.toggle("lower", aNum < hNum);
			}
			card.dataset.gameId = g.gameId;
			card.dataset.clickable = "true";
			card.addEventListener("click", () => {
				openGameOverlay(g.gameId, g.awayTeam.teamTricode, g.homeTeam.teamTricode);
			});
		} else {
			homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
			visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
		}

		moreEl.appendChild(clone);
	});
	filterTeams();
}

function scrollToLastPastHeadline() {
	const headlines = moreEl.querySelectorAll("h3");
	if (!headlines.length) return;

	let bestHeadline = null;
	let bestTimestamp = null;
	const now = Date.now();

	headlines.forEach((h3) => {
		const timestamp = Number(h3.dataset.timestamp);
		if (!timestamp) return;

		// Find the latest timestamp that is still in the past
		if (timestamp < now && (!bestTimestamp || timestamp > bestTimestamp)) {
			bestTimestamp = timestamp;
			bestHeadline = h3;
		}
	});

	if (bestHeadline) {
		bestHeadline.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	}
}

function renderStandings() {
	const rows = [
		standingsWest.querySelectorAll("tr:not(:first-of-type)"),
		standingsEast.querySelectorAll("tr:not(:first-of-type)"),
	];

	const dataByConf = [westData, eastData];

	for (let confIdx = 0; confIdx < rows.length; confIdx++) {
		const rowsForTable = rows[confIdx];
		const data = dataByConf[confIdx];

		rowsForTable.forEach((row, index) => {
			const team = data[index];
			if (!team) return;

			const cells = row.querySelectorAll("td");
			row.style.setProperty("--team-color", `var(--${team.teamTricode})`);
			cells[1].textContent = team.teamTricode; // Name/abbr
			cells[2].textContent = `${team.wins}-${team.losses}`; // W-L
			cells[3].textContent = team.gb; // GB
			cells[4].textContent = team.streak; // STR
			cells[5].textContent = team.home; // Home
			cells[6].textContent = team.away; // Away

			// Seeds 1–6 are direct playoff teams
			if (index < 6) {
				playoffTeams[confIdx].push({
					ta: team.teamTricode,
					tid: team.teamId,
				});
			}
		});
	}
}

function filterTeams() {
	const selectedTeam = teamPicker.value;

	if (selectedTeam !== "") {
		const otherTeams = document.querySelectorAll(
			`#more .card:not([data-abbr*="${selectedTeam}"])`,
		);
		for (const card of otherTeams) {
			card.remove();
		}
		const emptyHeadlines = document.querySelectorAll(
			"#more h3:not(:has(+ .card))",
		);
		for (const emptyHeadline of emptyHeadlines) {
			emptyHeadline.remove();
		}
	}
}

function findLastRegularSeasonGame() {
	const allGames = schedule.leagueSchedule.gameDates.flatMap((d) => d.games || []);

	// Group games by date
	const gamesByDate = allGames.reduce(function (groupedGames, game) {
		const gameDate = new Date(game.gameDateTimeUTC).toISOString().slice(0, 10); // YYYY-MM-DD
		if (!groupedGames[gameDate]) {
			groupedGames[gameDate] = [];
		}
		groupedGames[gameDate].push(game);
		return groupedGames;
	}, {});

	// Get all dates with exactly 15 games
	const daysWith15Games = Object.keys(gamesByDate).filter(function (date) {
		return gamesByDate[date].length === 15;
	});

	// Sort the dates in ascending order and return the last one
	const lastRegularSeasonDay = daysWith15Games
		.sort((a, b) => new Date(a) - new Date(b))
		.pop();

	return lastRegularSeasonDay;
}

function determinePlayInWinners() {
	const allGames = schedule.leagueSchedule.gameDates.flatMap((d) => d.games || []);

	// Find the last regular season day
	const lastRegularSeasonDay = findLastRegularSeasonGame();

	// Filter all games after the last regular season day and exclude Playoff series games (seriesText present)
	const playInGames = allGames
		.filter(function (game) {
			const gameDate = new Date(game.gameDateTimeUTC).toISOString().slice(0, 10);
			const isAfterRegularSeason = new Date(gameDate) > new Date(lastRegularSeasonDay);
			const isNotPlayoffGame = !game.seriesText; // exclude playoffs
			return isAfterRegularSeason && isNotPlayoffGame;
		})
		.filter((game) => game && game.homeTeam && game.awayTeam);

	// Not enough reliable Play-In data — abort safely
	if (!playInGames || playInGames.length < 3) return;

	// Play-In Teams (7-10) for East and West conferences from new standings data
	const eastPlayInTeams = eastData.slice(6, 10).map((t) => ({
		tid: t.teamId,
		ta: t.teamTricode,
	}));
	const westPlayInTeams = westData.slice(6, 10).map((t) => ({
		tid: t.teamId,
		ta: t.teamTricode,
	}));

	function getWinner(game) {
		if (!game || !game.homeTeam || !game.awayTeam) return null;
		const homeScore = parseInt(game.homeTeam.score, 10);
		const awayScore = parseInt(game.awayTeam.score, 10);
		if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
		return homeScore > awayScore
			? { tid: game.homeTeam.teamId, ta: game.homeTeam.teamTricode }
			: { tid: game.awayTeam.teamId, ta: game.awayTeam.teamTricode };
	}

	function playInTournament(playInTeams, conferenceIndex) {
		const [seed7, seed8, seed9, seed10] = playInTeams;

		// Game 1: Seed 7 (home) vs Seed 8 → Winner is 7th Seed
		const game1 = playInGames.find((game) =>
			game.homeTeam.teamId === seed7.tid && game.awayTeam.teamId === seed8.tid
		);
		const winnerGame1 = getWinner(game1);
		if (!winnerGame1) return;
		const loserGame1 = winnerGame1.tid === seed7.tid ? seed8 : seed7;

		// Game 2: Seed 9 (home) vs Seed 10 → Loser out, Winner advances
		const game2 = playInGames.find((game) =>
			game.homeTeam.teamId === seed9.tid && game.awayTeam.teamId === seed10.tid
		);
		const winnerGame2 = getWinner(game2);
		if (!winnerGame2) return;

		// Game 3: Loser of Game 1 vs Winner of Game 2 → Winner is 8th Seed
		const game3 = playInGames.find((game) =>
			game.homeTeam.teamId === loserGame1.tid && game.awayTeam.teamId === winnerGame2.tid
		);
		const winnerGame3 = getWinner(game3);
		if (!winnerGame3) return;

		playoffTeams[conferenceIndex].push(winnerGame1); // 7th Seed
		playoffTeams[conferenceIndex].push(winnerGame3); // 8th Seed
	}

	// Determine East and West Play-In winners
	playInTournament(eastPlayInTeams, 0); // East
	playInTournament(westPlayInTeams, 1); // West
}

function playoffPicture() {
	// Guard: require 8 teams per conference (6 + 2 play-in). If not complete, skip rendering.
	if (
		!Array.isArray(playoffTeams) || playoffTeams.length < 2 ||
		!Array.isArray(playoffTeams[0]) || !Array.isArray(playoffTeams[1]) ||
		playoffTeams[0].length < 8 || playoffTeams[1].length < 8
	) {
		console.log("Playoff picture skipped: playoffTeams incomplete", {
			west: playoffTeams?.[0]?.length ?? 0,
			east: playoffTeams?.[1]?.length ?? 0,
		});
		return;
	}
	const playoffBracket = document.querySelector("#playoffs");
	const playoffHeadline = document.querySelectorAll("h1")[0];
	playoffHeadline.classList.remove("hidden");
	playoffBracket.classList.remove("hidden");

	const conferenceIndex = ["west", "east"];

	function getMatchups(noOfTeams, thisRound, previousRound) {
		for (let j = 0; j < conferenceIndex.length; j++) {
			for (let i = 0; i < noOfTeams / 2; i++) {
				thisRound[j].push({
					conference: conferenceIndex[j],
					series: "0-0",
					leadingTeam: "",
					leadingTeamSeed: 0,
				});
				if (previousRound[j][i].series.includes("4")) {
					Object.assign(thisRound[j][i], {
						teamA: previousRound[j][i].leadingTeam,
						teamASeed: previousRound[j][i].leadingTeamSeed,
					});
				}
				if (
					previousRound[j][numberOfTeams - 1 - i].series.includes("4")
				) {
					Object.assign(thisRound[j][i], {
						teamB: previousRound[j][numberOfTeams - 1 - i].leadingTeam,
						teamBSeed: previousRound[j][numberOfTeams - 1 - i]
							.leadingTeamSeed,
					});
				}
			}
		}
	}

	/* consumes playoff games that belong to the provided round and
       returns once all match‑ups have been updated. Remaining games
       (for later rounds) are kept in games.playoffs                */
	function playSeries(round) {
		const remainingGames = [];

		games.playoffs.forEach((g) => {
			const teamNames = g.gameCode.slice(-6);
			let consumed = false;

			for (const conference of round) {
				for (const matchup of conference) {
					if (
						teamNames.includes(matchup.teamA) &&
						teamNames.includes(matchup.teamB)
					) {
						// update matchup infos
						matchup.series = g.seriesText.slice(-3);
						matchup.leadingTeam = g.seriesText.slice(0, 3);

						if (matchup.leadingTeam === matchup.teamB) {
							matchup.series = matchup.series.split("").reverse()
								.join("");
							matchup.leadingTeamSeed = matchup.teamBSeed;
						} else {
							matchup.leadingTeamSeed = matchup.teamASeed;
						}
						consumed = true;
						break; // inner loop
					}
				}
				if (consumed) break; // outer loop
			}

			if (!consumed) remainingGames.push(g); // keep games for the next rounds
		});

		games.playoffs = remainingGames;
	}

	function renderMatchups(roundNr, round) {
		const isFinals = roundNr === 4;
		const tmpl = document.getElementById("template-matchup");

		// Parent-Container
		const parentWest = document.querySelector("#western");
		const parentEast = document.querySelector("#eastern");
		const parentFinals = document.querySelector("#finals");

		// Remove old matchups for this round
		if (isFinals) {
			parentFinals.querySelectorAll(`[data-round="4"]`).forEach((el) => el.remove());
		} else {
			[parentWest, parentEast].forEach((p) =>
				p.querySelectorAll(`[data-round="${roundNr}"]`).forEach((el) => el.remove())
			);
		}

		// Helper to clone and fill template, simplified: just append
		const fillClone = (parent, m) => {
			const node = tmpl.content.firstElementChild.cloneNode(true);
			if (roundNr === 2) {
				node.classList.add("semi-conference-finals");
			} else if (roundNr === 3) {
				node.classList.add("conference-finals");
			}
			node.dataset.round = roundNr;

			node.querySelector(".teamA .score").textContent = m.series.split("-")[0];
			node.querySelector(".teamB .score").textContent = m.series.split("-")[1];
			node.querySelector(".teamA .teamname").textContent = m.teamA || "";
			node.querySelector(".teamB .teamname").textContent = m.teamB || "";

			// Set background color for teamA and teamB (undefined yields var(--undefined))
			const teamANameEl = node.querySelector(".teamA .teamname");
			teamANameEl.style.setProperty(
				"background-color",
				`var(--${m.teamA})`,
			);

			const teamBNameEl = node.querySelector(".teamB .teamname");
			teamBNameEl.style.setProperty(
				"background-color",
				`var(--${m.teamB})`,
			);

			parent.appendChild(node);
		};

		if (isFinals) {
			// Finals is a single matchup object
			fillClone(parentFinals, round);
			return;
		}

		// Rounds 1–3: round is [westArray, eastArray]
		for (let confIdx = 0; confIdx < round.length; confIdx++) {
			const matchups = round[confIdx];
			// Now, order is always in natural order
			const order = matchups.map((_, i) => i);

			order.forEach((matchupIdx) => {
				const parent = confIdx === 0 ? parentWest : parentEast;
				fillClone(parent, matchups[matchupIdx]);
			});
		}
	}

	// first Round
	const firstRound = [[], []];
	let numberOfTeams = 8;

	for (let j = 0; j < conferenceIndex.length; j++) {
		for (let i = 0; i < numberOfTeams / 2; i++) {
			firstRound[j].push({
				conference: conferenceIndex[j],
				teamA: playoffTeams[j][i].ta,
				teamASeed: i + 1,
				teamB: playoffTeams[j][numberOfTeams - 1 - i].ta,
				teamBSeed: playoffTeams[0].length - i,
				series: "0-0",
				leadingTeam: "",
				leadingTeamSeed: 0,
			});
		}
	}

	playSeries(firstRound);
	renderMatchups(1, firstRound);

	//second Round
	const secondRound = [[], []];
	numberOfTeams = 4;

	getMatchups(numberOfTeams, secondRound, firstRound);
	playSeries(secondRound);
	renderMatchups(2, secondRound);

	//conference Finals
	const conferenceFinals = [[], []];
	numberOfTeams = 2;

	getMatchups(numberOfTeams, conferenceFinals, secondRound);
	playSeries(conferenceFinals);
	renderMatchups(3, conferenceFinals);

	//finals
	const finals = {
		series: "0-0",
		leadingTeam: "",
		leadingTeamSeed: 0,
	};
	if (conferenceFinals[0][0].series.includes("4")) {
		Object.assign(finals, {
			teamA: conferenceFinals[0][0].leadingTeam,
			teamASeed: conferenceFinals[0][0].leadingTeamSeed,
		});
	}
	if (conferenceFinals[1][0].series.includes("4")) {
		Object.assign(finals, {
			teamB: conferenceFinals[1][0].leadingTeam,
			teamBSeed: conferenceFinals[1][0].leadingTeamSeed,
		});
	}

	games.playoffs.forEach((g) => {
		const teamNames = g.gameCode.slice(-6);

		if (
			teamNames.includes(finals.teamA) && teamNames.includes(finals.teamB)
		) {
			finals.series = g.seriesText.slice(-3);
			finals.leadingTeam = g.seriesText.slice(0, 3);
			if (finals.leadingTeam === finals.teamB) {
				finals.series = finals.series.split("").reverse().join("");
				finals.leadingTeamSeed = finals.teamBSeed;
			} else {
				finals.leadingTeamSeed = finals.teamASeed;
			}
		}
	});

	// Render the finals using the template-based renderer
	renderMatchups(4, finals);
}

function handleScheduleData(json) {
	if (json?.leagueSchedule?.gameDates?.length) {
		schedule = json;

		games = {
			today: [],
			finished: [],
			scheduled: [],
			playoffs: [],
		};

		prepareGameData();
		setProgressBar();
		renderTodaysGames();
		if (games.scheduled.length === 0 && checkboxHidePastGames.checked) {
			checkboxHidePastGames.checked = false;
		}
		renderMoreGames();
	} else {
		console.log(
			"Schedule data not available. Skipping schedule rendering.",
		);
	}
}

function handleStandingsData(json) {
	if (!json || !Array.isArray(json.east) || !Array.isArray(json.west)) {
		console.log("Standings data not available. Skipping standings rendering.");
		return;
	}

	standings = json;
	playoffTeams = [[], []];

	// Store new-format arrays directly
	eastData = standings.east.slice(); // already sorted by your endpoint
	westData = standings.west.slice();

	standingsEast = document.querySelector("#east table");
	standingsWest = document.querySelector("#west table");

	renderStandings();

	// If we already have playoff games, try to compute picture (requires seeded teams)
	if (games.playoffs.length > 0) {
		determinePlayInWinners();
		const westCount = playoffTeams[0]?.length ?? 0;
		const eastCount = playoffTeams[1]?.length ?? 0;
		if (westCount >= 8 && eastCount >= 8) {
			playoffPicture();
		} else {
			console.log("Skipping playoffPicture: missing play-in winners", {
				westCount,
				eastCount,
			});
		}
	}
}

function shouldRerender() {
	const now = new Date();

	const todayString = now.toLocaleDateString("de-DE", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

	if (lastCheckedDay !== todayString) {
		lastCheckedDay = todayString;
		console.log("New day detected, rerender required.");
		return true;
	}

	const gameTimeWindowChanged = games.today.some((g) => {
		const card = document.querySelector(`[data-game-code="${g.gameCode}"]`);
		if (!card) return false;
		const dateEl = card.querySelector(".date");

		const live = liveById.get(g.gameId);
		const { isLive } = getGameState(g, live, now);
		const isLiveClass = dateEl.classList.contains("live");

		// Rerender if we need to toggle the "live" state
		return isLive !== isLiveClass;
	});

	if (gameTimeWindowChanged) {
		console.log("Live state changed by time window, rerender required.");
		return true;
	}
	console.log("no rerendering needed");
	return false;
}

function shouldReloadData() {
	const nextGame = JSON.parse(localStorage.getItem("nba_nextScheduledGame"));

	if (nextGame) {
		const nextGameDate = new Date(nextGame.localDate);
		const expectedEndTime = new Date(nextGameDate.getTime() + GAME_MAX_DURATION_MS);
		const now = new Date();

		console.log(
			`Next game: ${
				nextGameDate.toLocaleString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				})
			} | Expected end: ${
				expectedEndTime.toLocaleTimeString("de-DE", {
					hour: "2-digit",
					minute: "2-digit",
				})
			} | Now: ${
				now.toLocaleString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				})
			}`,
		);

		if (now > expectedEndTime) {
			console.log(
				"Next scheduled game is in the past. Data should be reloaded.",
			);
			return true;
		} else {
			console.log("Cache still valid.");
			return false;
		}
	} else {
		console.log("No next scheduled game found. Data should be reloaded.");
		return true;
	}
}

function storeNextScheduledGame() {
	const allScheduledGames = games.scheduled.concat(
		games.today.filter((game) => game.gameStatus !== 3),
	);

	if (allScheduledGames.length === 0) {
		return;
	}

	const nextGame = allScheduledGames.reduce((soonest, game) => {
		const gameDate = new Date(game.localDate);
		return gameDate < new Date(soonest.localDate) ? game : soonest;
	});

	localStorage.setItem("nba_nextScheduledGame", JSON.stringify(nextGame));
}

function computeGameExcitement(playByPlayJson) {
	const actions = playByPlayJson?.game?.actions;

	if (!Array.isArray(actions) || actions.length === 0) {
		return 0;
	}

	let lastHomeScore = 0;
	let lastAwayScore = 0;
	const scoringEvents = [];

	actions.forEach((action) => {
		const homeScore = Number(action.scoreHome);
		const awayScore = Number(action.scoreAway);

		if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;
		if (homeScore === lastHomeScore && awayScore === lastAwayScore) return;

		scoringEvents.push({
			homeScore,
			awayScore,
			period: Number(action.period),
			clock: action.clock,
		});

		lastHomeScore = homeScore;
		lastAwayScore = awayScore;
	});

	if (!scoringEvents.length) {
		return 0;
	}

	let closenessSum = 0;
	let leadChanges = 0;
	let ties = 0;
	let leader = "tie";
	let maxHomeDeficit = 0;
	let maxAwayDeficit = 0;
	let countHighCrunch = 0;
	let countMediumCrunch = 0;
	let countLightCrunch = 0;
	let totalCrunchEvents = 0;
	let minLateDiff = Infinity;

	const lastEvent = scoringEvents[scoringEvents.length - 1];
	const finalHomeScore = lastEvent?.homeScore;
	const finalAwayScore = lastEvent?.awayScore;
	const hasFinalScores = Number.isFinite(finalHomeScore) && Number.isFinite(finalAwayScore);
	const finalMargin = hasFinalScores ? Math.abs(finalHomeScore - finalAwayScore) : Infinity;
	let marginFactor = 0;
	if (Number.isFinite(finalMargin)) {
		if (finalMargin <= 5) {
			marginFactor = 1;
		} else if (finalMargin >= 20) {
			marginFactor = 0;
		} else {
			marginFactor = 1 - (finalMargin - 5) / 15;
		}
	}

	scoringEvents.forEach((ev) => {
		const diff = Math.abs(ev.homeScore - ev.awayScore);
		const closeness = Math.max(0, 1 - diff / 20);
		closenessSum += closeness;

		const leaderDiff = ev.homeScore - ev.awayScore;
		let nextLeader = "tie";
		if (leaderDiff > 0) nextLeader = "home";
		else if (leaderDiff < 0) nextLeader = "away";

		if (nextLeader !== leader) {
			if (nextLeader === "tie") {
				ties++;
			} else if (leader !== "tie") {
				leadChanges++;
			}
		}
		leader = nextLeader;

		if (leaderDiff > 0) {
			maxAwayDeficit = Math.max(maxAwayDeficit, leaderDiff);
		} else if (leaderDiff < 0) {
			maxHomeDeficit = Math.max(maxHomeDeficit, Math.abs(leaderDiff));
		}

		if (ev.period >= 4) {
			minLateDiff = Math.min(minLateDiff, diff);
			const secondsRemaining = parseClockToSeconds(ev.clock);
			if (Number.isFinite(secondsRemaining)) {
				if (secondsRemaining <= 300) {
					totalCrunchEvents++;
					if (diff <= 3) {
						countHighCrunch++;
					} else if (diff <= 7) {
						countMediumCrunch++;
					} else if (diff <= 12) {
						countLightCrunch++;
					}
				}
			}
		}
	});

	const avgCloseness = closenessSum / scoringEvents.length;
	const closenessScore = Math.round(avgCloseness * 40);

	const swingsScore = Math.min(25, leadChanges * 2 + ties);

	let winnerMaxDeficit = 0;

	if (Number.isFinite(finalHomeScore) && Number.isFinite(finalAwayScore)) {
		if (finalHomeScore > finalAwayScore) {
			winnerMaxDeficit = maxHomeDeficit;
		} else if (finalAwayScore > finalHomeScore) {
			winnerMaxDeficit = maxAwayDeficit;
		}
	}

	let comebackScore = 0;
	if (winnerMaxDeficit >= 20) {
		comebackScore = 10;
	} else if (winnerMaxDeficit >= 15) {
		comebackScore = 8;
	} else if (winnerMaxDeficit >= 10) {
		comebackScore = 6;
	} else if (winnerMaxDeficit >= 6) {
		comebackScore = 4;
	}
	let crunchRelevance = 0;
	if (minLateDiff <= 5) {
		crunchRelevance = 1;
	} else if (minLateDiff <= 8) {
		crunchRelevance = 0.5;
	}
	const adjustedBase = (comebackScore * 0.5) + (comebackScore * 0.5 * crunchRelevance);
	comebackScore = Math.round(adjustedBase * marginFactor);

	let crunchTimeScore = 0;
	if (totalCrunchEvents > 0) {
		const ratioHigh = countHighCrunch / totalCrunchEvents;
		const ratioMedium = countMediumCrunch / totalCrunchEvents;
		const ratioLight = countLightCrunch / totalCrunchEvents;
		const crunchScoreRaw = (ratioHigh * 20) + (ratioMedium * 15) + (ratioLight * 8);
		const rawClamped = Math.min(crunchScoreRaw, 20);
		crunchTimeScore = Math.round(rawClamped * 1.25);
		crunchTimeScore = Math.round(crunchTimeScore * (0.7 + 0.3 * marginFactor));
	}

	const totalPoints = hasFinalScores ? finalHomeScore + finalAwayScore : 0;

	let offenseScore = 0;
	if (finalMargin <= 10) {
		let offenseBase = 0;
		if (totalPoints >= 230) {
			offenseBase = 5;
		} else if (totalPoints > 180) {
			offenseBase = ((totalPoints - 180) / 50) * 5;
		}
		offenseBase = Math.max(0, Math.min(5, offenseBase));
		offenseScore = Math.round(offenseBase * marginFactor);
	}

	const overtimeCount = getOvertimeCount(actions);
	let otBonus = 0;
	if (overtimeCount === 1) {
		otBonus = 5;
	} else if (overtimeCount >= 2) {
		otBonus = 10;
	}

	const rawScore = closenessScore +
		swingsScore +
		crunchTimeScore +
		comebackScore +
		offenseScore +
		otBonus;
	const score = Math.max(0, Math.min(100, Math.round(rawScore)));

	return score;
}

function fetchExcitementForGame(gameId) {
	if (excitementCache.has(gameId)) {
		return Promise.resolve(excitementCache.get(gameId));
	}

	const url = `${playByPlayURL}/${gameId}`;

	return new Promise((resolve, reject) => {
		fetchData(
			url,
			(pbpJson) => {
				try {
					const score = computeGameExcitement(pbpJson);
					excitementCache.set(gameId, score);
					resolve(score);
				} catch (err) {
					reject(err);
				}
			},
			true,
		).catch(reject);
	});
}

function updateGameExcitementMeter(playByPlayJson) {
	const gameId = gameOverlayEl.dataset.gameId;
	const actions = playByPlayJson?.game?.actions || [];
	const hasData = playByPlayJson && actions.length > 0;
	const matchesGame = hasData && playByPlayJson?.game?.gameId === gameId;

	if (!matchesGame) {
		gameExcitementEl.classList.add("hidden");
		gameExcitementValueEl.style.width = "0%";
		gameExcitementValueEl.textContent = "0%";
		gameExcitementLabelEl.textContent = "";
		return;
	}

	const live = liveById.get(gameId);
	const game = games.finished.concat(games.today).find((g) => g.gameId === gameId);
	const { isFinal } = getGameState(game, live);

	if (!isFinal) {
		gameExcitementEl.classList.add("hidden");
		gameExcitementValueEl.style.width = "0%";
		gameExcitementValueEl.textContent = "0%";
		gameExcitementLabelEl.textContent = "";
		return;
	}

	const score = computeGameExcitement(playByPlayJson);
	const rating = (score / 10).toFixed(1);

	gameExcitementValueEl.style.width = `${score}%`;
	gameExcitementValueEl.textContent = `${score}%`;

	let label = "";
	if (score >= 80) {
		label = `Bewertung: ${rating}/10 · Pflichtprogramm`;
	} else if (score >= 60) {
		label = `Bewertung: ${rating}/10 · sehenswert`;
	} else if (score >= 40) {
		label = `Bewertung: ${rating}/10 · solide`;
	} else if (score >= 20) {
		label = `Bewertung: ${rating}/10 · eher einseitig`;
	} else {
		label = `Bewertung: ${rating}/10 · skippen`;
	}

	gameExcitementLabelEl.textContent = label;
}

// Game overlay helpers
function openGameOverlay(gameId, awayTeamTricode, homeTeamTricode) {
	backdropEl.classList.remove("hidden");
	gameOverlayEl.classList.remove("hidden");
	gameOverlayEl.dataset.gameId = gameId;
	gameOverlayEl.dataset.awayTeam = awayTeamTricode || "";
	gameOverlayEl.dataset.homeTeam = homeTeamTricode || "";

	// render cached data first (if matching)
	if (currentBoxscore && currentBoxscore.game && currentBoxscore.game.gameId === gameId) {
		renderBoxscore(currentBoxscore);
	}
	if (currentPlayByPlay?.game?.gameId === gameId) {
		renderPlayByPlay(currentPlayByPlay);
		updateGameExcitementMeter(currentPlayByPlay);
	}

	// fetch fresh data if live or not cached
	const liveGame = liveById.get(gameId);
	const forceFresh = liveGame?.gameStatus === 2;

	const bsUrl = `${boxscoreURL}/${gameId}`;
	const pbpUrl = `${playByPlayURL}/${gameId}`;
	fetchData(
		bsUrl,
		(json) => {
			currentBoxscore = json;
			renderBoxscore(json);
		},
		forceFresh,
	);

	fetchData(
		pbpUrl,
		(pbpJson) => {
			currentPlayByPlay = pbpJson;
			renderPlayByPlay(pbpJson);
			updateGameExcitementMeter(pbpJson);
		},
		forceFresh,
	);
}

function closeGameOverlay() {
	backdropEl.classList.add("hidden");
	gameOverlayEl.classList.add("hidden");
	gameOverlayEl.dataset.gameId = "";
	gameOverlayEl.dataset.awayTeam = "";
	gameOverlayEl.dataset.homeTeam = "";

	// Reset UI
	teamsEl.replaceChildren();
	periodsEl.querySelector("thead").replaceChildren();
	periodsEl.querySelector("tbody").replaceChildren();
	renderBoxscoreTeamStats(null);
	renderPlayByPlay(null);
	updateGameExcitementMeter(null);
}

function renderBoxscore(json) {
	const game = json && json.game;
	if (!game) {
		return;
	}

	renderBoxscorePeriods(game);
	renderBoxscoreTeamStats(game);
	teamsEl.replaceChildren();
	renderBoxscoreTeam(game.awayTeam);
	renderBoxscoreTeam(game.homeTeam);
}

function renderPlayByPlay(json) {
	const actions = json?.game?.actions || [];
	const template = document.getElementById("template-play-by-play");
	const panel = document.querySelector("#playbyplay");

	if (!actions.length) {
		panel.replaceChildren();
		const p = document.createElement("p");
		p.textContent = "Lade Spielaktionen…";
		playByPlayPanel.appendChild(p);
		return;
	}
	panel.replaceChildren();

	const filtered = actions.filter((a) => {
		if (a.actionType === "substitution") return false;
		if (checkboxPlayByPlayMadeShots.checked && a.shotResult !== "Made") return false;
		return true;
	});

	filtered.forEach((action) => {
		const item = template.content.firstElementChild.cloneNode(true);

		if (action.teamTricode) {
			item.style.setProperty("--team-color", `var(--${action.teamTricode})`);
		}

		const timeEl = item.querySelector(".time");
		const descEl = item.querySelector(".description");
		const scoreEl = item.querySelector(".score");
		const awayTeamEl = scoreEl.querySelector(".score-away .team");
		const homeTeamEl = scoreEl.querySelector(".score-home .team");
		const awayValueEl = scoreEl.querySelector(".score-away .score-value");
		const homeValueEl = scoreEl.querySelector(".score-home .score-value");

		const clock = formatMinutes(action.clock);
		const period = Number(action.period);
		let periodLabel = "";

		if (period <= 4) {
			periodLabel = `Q${period}`;
		} else {
			const otIndex = period - 4;
			periodLabel = otIndex === 1 ? "OT" : `OT${otIndex}`;
		}

		const timeLabel = `${periodLabel} - ${clock}`;
		timeEl.textContent = timeLabel;
		descEl.textContent = action.description || "";

		// show score only if made shot
		if (action.shotResult === "Made") {
			const scoredTeam = action.teamTricode;
			const awayTeam = gameOverlayEl.dataset.awayTeam;
			const homeTeam = gameOverlayEl.dataset.homeTeam;

			awayTeamEl.textContent = awayTeam;
			awayValueEl.textContent = action.scoreAway;
			awayValueEl.classList.toggle("made", awayTeam === scoredTeam);

			homeTeamEl.textContent = homeTeam;
			homeValueEl.textContent = action.scoreHome;
			homeValueEl.classList.toggle("made", homeTeam === scoredTeam);
		} else {
			scoreEl.classList.add("hidden");
		}

		panel.appendChild(item);
	});
}

function renderBoxscoreTeamStats(game) {
	const homeTeam = game?.homeTeam;
	const awayTeam = game?.awayTeam;
	const homeStats = game.homeTeam?.statistics || {};
	const awayStats = game.awayTeam?.statistics || {};

	teamStatsEl.querySelectorAll(".bar").forEach((bar) => {
		bar.style.width = "50%";
		bar.textContent = "–";
		bar.style.removeProperty("--team-color");
	});

	if (!homeTeam || !awayTeam) {
		return;
	}

	teamStatsEl.querySelectorAll(".stat").forEach((wrapper) => {
		const key = wrapper.dataset.stat;
		if (!key) return;

		const homeBar = wrapper.querySelector(".bar.home");
		const awayBar = wrapper.querySelector(".bar.away");

		const homeValue = Number(homeStats?.[key]) || 0;
		const awayValue = Number(awayStats?.[key]) || 0;

		const total = homeValue + awayValue;
		const homeShare = total ? Math.round((homeValue / total) * 100) : 50;
		const awayShare = total ? 100 - homeShare : 50;

		homeBar.style.setProperty("width", `${Math.min(100, Math.max(0, homeShare))}%`);
		awayBar.style.setProperty("width", `${Math.min(100, Math.max(0, awayShare))}%`);
		homeBar.style.setProperty("--team-color", `var(--${homeTeam.teamTricode})`);
		awayBar.style.setProperty("--team-color", `var(--${awayTeam.teamTricode})`);
		homeBar.textContent = `${homeValue}`;
		awayBar.textContent = `${awayValue}`;
	});
}

function renderBoxscorePeriods(game) {
	const home = game.homeTeam;
	const away = game.awayTeam;
	const periods = (home.periods && home.periods.length ? home.periods : away.periods) || [];
	const table = periodsEl.querySelector(".periods-table");
	const thead = table.querySelector("thead");
	const tbody = table.querySelector("tbody");

	thead.replaceChildren();
	tbody.replaceChildren();

	const headRow = document.createElement("tr");
	const teamTh = document.createElement("th");
	teamTh.textContent = "Team";
	headRow.appendChild(teamTh);

	let overtimeIndex = 1;
	periods.forEach((p) => {
		const th = document.createElement("th");
		if (p.periodType === "OVERTIME") {
			th.textContent = `OT${overtimeIndex}`;
			overtimeIndex++;
		} else {
			th.textContent = `Q${p.period}`;
		}
		headRow.appendChild(th);
	});

	const totalTh = document.createElement("th");
	totalTh.textContent = "Gesamt";
	headRow.appendChild(totalTh);

	thead.appendChild(headRow);
	table.appendChild(thead);

	function addTeamRow(team) {
		const row = document.createElement("tr");
		const labelCell = document.createElement("td");
		labelCell.textContent = team.teamTricode;
		row.style.setProperty("--team-color", `var(--${team.teamTricode})`);
		row.appendChild(labelCell);

		periods.forEach((p) => {
			const cell = document.createElement("td");
			const periodData = team.periods &&
				team.periods.find(
					(tp) => tp.period === p.period && tp.periodType === p.periodType,
				);
			cell.textContent = periodData ? periodData.score : "";
			row.appendChild(cell);
		});

		const totalCell = document.createElement("td");
		totalCell.textContent = team.score ?? "";
		row.appendChild(totalCell);

		tbody.appendChild(row);
	}

	addTeamRow(away);
	addTeamRow(home);

	table.appendChild(tbody);
}

function renderBoxscoreTeam(team) {
	const template = document.querySelector("#template-boxscore");
	const section = template.content.firstElementChild.cloneNode(true);
	section.style.setProperty("--team-color", `var(--${team.teamTricode})`);

	const teamLogo = section.querySelector(".team-logo");
	const teamName = section.querySelector(".team-name");

	teamLogo.src = `img/${team.teamTricode}.svg`;
	teamLogo.alt = `${team.teamCity} ${team.teamName} Logo`;
	teamLogo.onerror = () => {
		teamLogo.src = "img/no-logo.svg";
	};

	teamName.textContent = `${team.teamCity} ${team.teamName}`;

	const players = (team.players || []).filter(
		(p) => p.status === "ACTIVE" && p.played === "1",
	);

	const starters = players
		.filter((p) => p.starter === "1")
		.sort((a, b) => a.order - b.order);

	const bench = players
		.filter((p) => p.starter !== "1")
		.sort((a, b) => a.order - b.order);

	const startersBody = section.querySelector(".starters tbody");
	const benchBody = section.querySelector(".bench tbody");
	const benchWrapper = section
		.querySelector(".bench")
		.closest(".players-wrapper");

	fillPlayersTable(startersBody, starters);
	fillPlayersTable(benchBody, bench);

	if (!bench.length) {
		benchWrapper.remove();
	}

	teamsEl.appendChild(section);
}

function fillPlayersTable(tbody, players) {
	players.forEach((p) => {
		const s = p.statistics || {};
		const tr = document.createElement("tr");

		const nameTd = document.createElement("td");
		const playerCell = document.createElement("div");
		playerCell.classList.add("player-cell");
		nameTd.appendChild(playerCell);
		const nameSpan = document.createElement("span");
		nameSpan.classList.add("player-name");
		playerCell.appendChild(nameSpan);
		nameSpan.textContent = p.nameI || p.name || "";
		if (p.starter === "1") {
			const posSpan = document.createElement("span");
			posSpan.classList.add("player-pos");
			posSpan.textContent = p.position || "";
			playerCell.appendChild(posSpan);
		}
		tr.appendChild(nameTd);

		const minTd = document.createElement("td");
		minTd.textContent = formatMinutes(s.minutes || s.minutesCalculated);
		tr.appendChild(minTd);

		const ptsTd = document.createElement("td");
		ptsTd.textContent = s.points ?? "";
		tr.appendChild(ptsTd);

		const rebTd = document.createElement("td");
		rebTd.textContent = s.reboundsTotal ?? "";
		tr.appendChild(rebTd);

		const astTd = document.createElement("td");
		astTd.textContent = s.assists ?? "";
		tr.appendChild(astTd);

		const stlTd = document.createElement("td");
		stlTd.textContent = s.steals ?? "";
		tr.appendChild(stlTd);

		const blkTd = document.createElement("td");
		blkTd.textContent = s.blocks ?? "";
		tr.appendChild(blkTd);

		const tovTd = document.createElement("td");
		tovTd.textContent = s.turnovers ?? "";
		tr.appendChild(tovTd);

		const pfTd = document.createElement("td");
		pfTd.textContent = s.foulsPersonal ?? "";
		tr.appendChild(pfTd);

		const fgTd = document.createElement("td");
		const fgMade = s.fieldGoalsMade ?? 0;
		const fgAtt = s.fieldGoalsAttempted ?? 0;
		fgTd.textContent = fgAtt ? `${fgMade}-${fgAtt}` : "";
		tr.appendChild(fgTd);

		const tpTd = document.createElement("td");
		const tpm = s.threePointersMade ?? 0;
		const tpa = s.threePointersAttempted ?? 0;
		tpTd.textContent = tpa ? `${tpm}-${tpa}` : "";
		tr.appendChild(tpTd);

		const ftTd = document.createElement("td");
		const ftm = s.freeThrowsMade ?? 0;
		const fta = s.freeThrowsAttempted ?? 0;
		ftTd.textContent = fta ? `${ftm}-${fta}` : "";
		tr.appendChild(ftTd);

		const pmlTd = document.createElement("td");
		pmlTd.textContent = s.plusMinusPoints ?? "";
		tr.appendChild(pmlTd);

		tbody.appendChild(tr);
	});
}

async function loadData() {
	await fetchData(scheduleURL, handleScheduleData);
	storeNextScheduledGame();
	await fetchData(standingsURL, handleStandingsData);

	if (shouldReloadData()) {
		await fetchData(scheduleURL, handleScheduleData, true);
		await fetchData(standingsURL, handleStandingsData, true);
	}
}

function switchTab(tab) {
	const targetId = tab.dataset.target;
	const targetPanel = gameOverlay.querySelector(`#${targetId}`);

	// Toggle tab buttons
	gameOverlay.querySelectorAll(".tab").forEach((t) => {
		t.classList.toggle("is-active", t === tab);
	});

	// Toggle panels
	gameOverlay.querySelectorAll(".panel").forEach((panel) => {
		panel.classList.toggle("is-active", panel === targetPanel);
	});
}

function init() {
	backdropEl.addEventListener("click", closeGameOverlay);
	gameOverlayCloseBtn.addEventListener("click", closeGameOverlay);
	gameTabs.forEach((tab) => {
		tab.addEventListener("click", () => switchTab(tab));
	});
	document.addEventListener("touchstart", function () {}, false);
	teamPicker.addEventListener("change", renderMoreGames);
	checkboxHidePastGames.addEventListener("change", () => {
		renderMoreGames();
		if (!checkboxHidePastGames.checked) {
			scrollToLastPastHeadline();
		}
	});

	checkboxPrimetime.addEventListener("change", () => {
		localStorage.setItem("nba-spielplan_primetime", checkboxPrimetime.checked);
		renderMoreGames();
	});

	checkboxShowRating.addEventListener("change", () => {
		localStorage.setItem("nba-spielplan_showRating", checkboxShowRating.checked);
		renderTodaysGames();
	});

	checkboxShowScores.addEventListener("change", () => {
		localStorage.setItem("nba-spielplan_showScores", checkboxShowScores.checked);
		renderTodaysGames();
	});

	checkboxPlayByPlayMadeShots.addEventListener("change", () => {
		localStorage.setItem(
			"nba-spielplan_pbp_madeShotsOnly",
			checkboxPlayByPlayMadeShots.checked,
		);
		if (currentPlayByPlay && gameOverlayEl.dataset.gameId === currentPlayByPlay.game.gameId) {
			renderPlayByPlay(currentPlayByPlay);
		}
	});

	document.addEventListener("DOMContentLoaded", function () {
		loadData();
	});

	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState === "visible") {
			loadData();
		}
	});

	setInterval(() => {
		if (shouldRerender()) {
			renderedCoreCacheUrls.clear();
			loadData();
		}
	}, 60000);
}

/* --------------------------------------------------------------------------------------------------
public members, exposed with return statement
---------------------------------------------------------------------------------------------------*/
globalThis.app = {
	init,
};

globalThis.app.init();

/* --------------------------------------------------------------------------------------------------
 * Service Worker configuration
 * - USE_SERVICE_WORKER: enable or disable SW for this project
 * - SERVICE_WORKER_VERSION: bump to force new SW and new cache
 * - AUTO_RELOAD_ON_SW_UPDATE: reload page once after an update
 -------------------------------------------------------------------------------------------------- */
const USE_SERVICE_WORKER = true;
const SERVICE_WORKER_VERSION = "2025-11-29-v1";
const AUTO_RELOAD_ON_SW_UPDATE = true;

/* --------------------------------------------------------------------------------------------------
 * Project detection
 * - GitHub Pages: user.github.io/projektname/... -> slug = "projektname", scope = /projektname/
 * - Everything else (localhost, custom domain): whole origin is one project
 -------------------------------------------------------------------------------------------------- */
function getProjectInfo() {
	const url = new URL(globalThis.location.href);
	const pathParts = url.pathname.split("/").filter(Boolean);
	const hostname = url.hostname;

	const isGitHubPages = hostname.endsWith("github.io");

	let projectScope;
	let projectSlug;

	if (isGitHubPages && pathParts.length > 0) {
		// Example: https://user.github.io/project/
		const first = pathParts[0].toLowerCase();
		projectScope = `${url.origin}/${first}/`;
		projectSlug = first;
	} else {
		// Example: http://127.0.0.1:5500/ or https://nba-spielplan.de/
		projectScope = `${url.origin}/`;
		projectSlug = hostname.replace(/[^\w-]/g, "_").toLowerCase();
	}

	const isGitHubUserRoot = isGitHubPages && pathParts.length === 0;

	return { projectScope, projectSlug, isGitHubUserRoot };
}

const {
	projectScope: PROJECT_SCOPE,
	projectSlug: PROJECT_SLUG,
	isGitHubUserRoot,
} = getProjectInfo();

const SW_CACHE_PREFIX = `${PROJECT_SLUG}-cache-`; // SW caches: "<slug>-cache-<version>"

async function shouldSkipServiceWorker(swUrl) {
	try {
		const response = await fetch(swUrl, {
			method: "HEAD",
			cache: "no-store",
		});

		if (response.redirected) {
			console.log(
				`Service Worker skipped: ${swUrl} redirects to ${response.url}. Use the canonical host for PWA features.`,
			);
			return true;
		}

		if (!response.ok) {
			console.log(
				`Service Worker skipped: ${swUrl} returned status ${response.status}.`,
			);
			return true;
		}
	} catch (error) {
		console.log("Service Worker preflight check failed, trying to register anyway:", error);
	}

	return false;
}

/* Service Worker registration and cleanup */
async function registerServiceWorker() {
	try {
		const swUrl = `./service-worker.js?v=${SERVICE_WORKER_VERSION}`;

		if (await shouldSkipServiceWorker(swUrl)) {
			return;
		}

		const registration = await navigator.serviceWorker.register(
			swUrl,
			{ scope: "./", updateViaCache: "none" },
		);

		// check for updates immediately
		registration.update();

		console.log(
			`Service Worker registered for project "${PROJECT_SLUG}" with scope:`,
			registration.scope,
		);
	} catch (error) {
		console.log("Service Worker registration failed:", error);
	}
}

async function unregisterServiceWorkers() {
	const registrations = await navigator.serviceWorker.getRegistrations();
	let changedSomething = false;

	if (registrations.length) {
		// Only unregister SWs whose scope belongs to this project
		const projectRegistrations = registrations.filter(
			(r) => r.scope === PROJECT_SCOPE || r.scope.startsWith(PROJECT_SCOPE),
		);

		if (projectRegistrations.length) {
			await Promise.all(projectRegistrations.map((r) => r.unregister()));
			changedSomething = true;
		}
	}

	if ("caches" in globalThis) {
		const keys = await caches.keys();

		// Remove only Service Worker caches for this project:
		// - SW caches start with "<slug>-cache-"
		// - Data / app caches can use "<slug>-data-cache" and are not touched here
		const swCaches = keys.filter(
			(k) => k.startsWith(SW_CACHE_PREFIX) && !k.includes("-data-cache"),
		);

		if (swCaches.length) {
			await Promise.all(swCaches.map((k) => caches.delete(k)));
			changedSomething = true;
		}
	}

	if (changedSomething) {
		console.log(
			`Service workers and SW caches for project "${PROJECT_SLUG}" cleared. Reloading page...`,
		);
		globalThis.location.reload();
	} else {
		console.log(
			`No service worker or SW caches found for project "${PROJECT_SLUG}". Not reloading again.`,
		);
	}
}

/* Auto reload on SW controller change and init */
if ("serviceWorker" in navigator) {
	const hadControllerAtStart = !!navigator.serviceWorker.controller;
	let hasHandledControllerChange = false;

	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (!hadControllerAtStart) return;
		if (hasHandledControllerChange) return;
		hasHandledControllerChange = true;

		if (AUTO_RELOAD_ON_SW_UPDATE) {
			globalThis.location.reload();
		} else {
			console.log("Service Worker updated; auto reload disabled.");
		}
	});

	globalThis.addEventListener("DOMContentLoaded", async () => {
		// hard safety: never use a service worker on GitHub user root pages
		if (isGitHubUserRoot) {
			console.log(
				"Service Worker disabled on GitHub user root page to avoid affecting project sites.",
			);
			return;
		}

		if (USE_SERVICE_WORKER) {
			await registerServiceWorker();
		} else {
			await unregisterServiceWorkers();
		}
	});
}
