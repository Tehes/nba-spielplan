/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

async function fetchData(url, updateFunction, forceNetwork = false) {
	const cacheName = "nba-data-cache";
	const cache = await caches.open(cacheName);

	if (!forceNetwork) {
		const cachedResponse = await cache.match(url);
		if (cachedResponse) {
			const cachedJson = await cachedResponse.json();
			console.log("Cached data loaded");
			if (renderCount < 2) {
				updateFunction(cachedJson);
				renderCount++;
			}
			return;
		}
	}

	console.log("Fetching from network...");

	try {
		const networkResponse = await fetch(url);
		if (networkResponse.ok) {
			const clonedResponse = networkResponse.clone();
			const json = await networkResponse.json();
			console.log("Fresh data fetched:", json);
			cache.put(url, clonedResponse);
			updateFunction(json);
		} else {
			throw new Error(`Network error! Status: ${networkResponse.status}`);
		}
	} catch (error) {
		console.error("Fetching fresh data failed:", error);
	}
}

/* --------------------------------------------------------------------------------------
/schedule endpoint
--------------------------------------------------------------------------------------
leagueSchedule       Root object
  gameDates[]        	Array of dates; each has `games[]`
    games[]          	Array of games with rich fields
      gameId         	String            e.g. "0022500095"
      gameCode       	String            e.g. "20251024/SASNOP"
      gameStatus     	Number            1 = Scheduled, 2 = Live, 3 = Final, 4 = Postponed
      gameStatusText 	String            e.g. "Final", "Final/OT", "3rd Qtr"
      gameDateTimeUTC	ISO 8601 UTC     e.g. "2025-10-25T00:00:00Z"
      arenaName      	String            e.g. "Smoothie King Center"
      arenaCity      	String            e.g. "New Orleans"
      arenaState     	String            e.g. "LA"

      homeTeam       	Object
        teamId       	Number            e.g. 1610612740
        teamCity     	String            e.g. "New Orleans"
        teamName     	String            e.g. "Pelicans"
        teamTricode  	String            e.g. "NOP"
        wins         	Number            current wins (pre/post game)
        losses       	Number            current losses
        score        	Number            final/live score (may be 0 or missing if not started)

      awayTeam       	Object
        teamId       	Number            e.g. 1610612759
        teamCity     	String            e.g. "San Antonio"
        teamName     	String            e.g. "Spurs"
        teamTricode  	String            e.g. "SAS"
        wins         	Number
        losses       	Number
        score        	Number

      broadcasters   	Object            nested lists (natl/home/away tv/radio/ott)
      seriesText     	String            e.g. "Neutral Site", ""
      gameLabel      	String            e.g. "Preseason"
      gameSubLabel   	String            e.g. "NBA Abu Dhabi Game"
-------------------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------------------
/standings endpoint
--------------------------------------------------------------------------------------
Root Object
  season       Season identifier               String      "2025-26"
  updatedAt    Timestamp (ISO)                 String      "2025-10-26T13:43:40.638Z"
  east[]       Eastern Conference teams        Array
  west[]       Western Conference teams        Array

Team Object (element within east[] / west[])
  teamId       Team ID                         Number      1610612741
  teamTricode  Abbreviation                    String      "CHI"
  teamCity     City                            String      "Chicago"
  teamName     Team name                       String      "Bulls"
  wins         Wins                            Number      2
  losses       Losses                          Number      0
  winPct       Win percentage                  Number      1
  gb           Games behind                    Number      0 | 1 | 1.5 | …
  streak       Current streak                  String      "W 2" | "L 1"
  home         Home record                     String      "1-0"
  away         Away record                     String      "1-0"

Notes
- The arrays `east` and `west` are already sorted in order (1 → n).
- Seeds are implicitly defined by array position (index + 1).
- Preseason games are already excluded from these standings (calculated from schedule data).
-------------------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------------------------------
Variables
---------------------------------------------------------------------------------------------------*/
const scheduleURL = "https://nba-spielplan.tehes.deno.net/schedule";
const standingsURL = "https://nba-spielplan.tehes.deno.net/standings";

const liveURL = "https://nba-spielplan.tehes.deno.net/scoreboard";
let liveById = new Map();
let livePoll = null;

let schedule;
let standings;
let games = {};

let eastData = [];
let westData = [];

let standingsEast;
let standingsWest;
let playoffTeams;

let renderCount = 0;
let lastCheckedDay = new Date().toLocaleDateString("de-DE", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const templateToday = document.querySelector("#template-today");
const templateMore = document.querySelector("#template-more");
const todayEl = document.querySelector("#today");
const moreEl = document.querySelector("#more");
const progressValue = document.querySelector("#progress-value");
const teamPicker = document.querySelector("select");
const checkboxShowScores = document.querySelectorAll("input[type='checkbox']")[0];
const checkboxHidePastGames = document.querySelectorAll("input[type='checkbox']")[1];
const checkboxPrimetime = document.querySelectorAll("input[type='checkbox']")[2];
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

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------------
Live Scoreboard Functions
---------------------------------------------------------------------------------------------------*/
function updateLive(liveJson) {
	const arr = liveJson?.scoreboard?.games ?? [];
	liveById = new Map(arr.map((g) => [g.gameId, g]));
	renderTodaysGames();
}

function fetchLiveOnce() {
	fetchData(liveURL, updateLive, true);
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

		const isPostponed = game.gameStatus === 4;
		const isFinal = game.gameStatus === 3;
		const isToday = game.localDate >= todayStart && game.localDate < tomorrowStart;

		const isLiveWindow = now >= game.localDate &&
			now < new Date(game.localDate.getTime() + GAME_MAX_DURATION_MS) &&
			!isFinal && !isPostponed;

		if ((isToday && !isPostponed) || isLiveWindow) {
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

function renderTodaysGames() {
	todayEl.replaceChildren();
	let hasLive = false;

	if (games.today.length > 0) {
		games.today.forEach((g) => {
			const clone = templateToday.content.cloneNode(true);
			const card = clone.querySelector(".card");
			card.dataset.gameCode = g.gameCode;

			const homeTeam = clone.querySelector(".home-team");
			const visitingTeam = clone.querySelector(".visiting-team");
			const homeLogo = clone.querySelectorAll("img")[1];
			const homeAbbr = clone.querySelector(".h-abbr");
			const homeWL = clone.querySelector(".h-wl");
			const homeName = clone.querySelector(".h-name");
			const homeScore = clone.querySelector(".h-score");
			const visitingAbbr = clone.querySelector(".v-abbr");
			const visitingWL = clone.querySelector(".v-wl");
			const visitingLogo = clone.querySelectorAll("img")[0];
			const visitingName = clone.querySelector(".v-name");
			const visitingScore = clone.querySelector(".v-score");
			const date = clone.querySelector(".date");
			const gameLabelEl = clone.querySelector(".game-label");
			const label = g.gameLabel || g.gameSubtype || "";
			const subLabel = g.gameSubLabel;

			const now = new Date();

			homeTeam.style.setProperty("--team-color", `var(--${g.homeTeam.teamTricode})`);
			visitingTeam.style.setProperty("--team-color", `var(--${g.awayTeam.teamTricode})`);
			homeLogo.src = `img/${g.homeTeam.teamTricode}.svg`;
			homeLogo.onerror = () => homeLogo.src = "img/no-logo.svg";
			visitingLogo.src = `img/${g.awayTeam.teamTricode}.svg`;
			visitingLogo.onerror = () => visitingLogo.src = "img/no-logo.svg";
			homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`;
			visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`;
			homeAbbr.textContent = g.homeTeam.teamTricode;
			visitingAbbr.textContent = g.awayTeam.teamTricode;

			gameLabelEl.textContent = label
				? subLabel ? `${label} – ${subLabel}` : label
				: subLabel;

			const isLiveWindow = now >= g.localDate &&
				now < new Date(g.localDate.getTime() + GAME_MAX_DURATION_MS);

			if (g.gameStatus === 3) {
				// FINAL
				date.classList.remove("live");
				date.textContent = "Final";
				if (checkboxShowScores.checked) {
					homeScore.textContent = g.homeTeam.score ?? "";
					visitingScore.textContent = g.awayTeam.score ?? "";
					const hNum = Number(g.homeTeam.score);
					const aNum = Number(g.awayTeam.score);
					if (Number.isFinite(hNum) && Number.isFinite(aNum)) {
						homeScore.classList.toggle("lower", hNum < aNum);
						visitingScore.classList.toggle("lower", aNum < hNum);
					}
				} else {
					homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
					visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
				}
			} else if (isLiveWindow) {
				// LIVE
				hasLive = true;

				date.classList.add("live");
				const link = document.createElement("a");
				link.href =
					`https://www.nba.com/game/${g.awayTeam.teamTricode}-vs-${g.homeTeam.teamTricode}-${g.gameId}/play-by-play`;
				link.target = "_blank";
				link.textContent = "LIVE";
				date.replaceChildren(link);

				// Overlay: Scoreboard data if available
				const live = liveById.get(g.gameId);
				if (live) {
					const a = live.awayTeam?.score;
					const h = live.homeTeam?.score;

					if (live.gameStatus === 2) {
						// Still live
						link.textContent = live.gameStatusText || "LIVE";
						if (
							checkboxShowScores.checked && Number.isFinite(a) && Number.isFinite(h)
						) {
							homeScore.textContent = h ?? "";
							visitingScore.textContent = a ?? "";
						}
					} else if (live.gameStatus === 3) {
						// Just finished
						date.classList.remove("live");
						date.textContent = "Final";
						if (checkboxShowScores.checked) {
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
					}
				}
			} else {
				// SCHEDULED
				date.classList.remove("live");
				date.textContent = g.time;
				homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
				visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
			}

			todayEl.appendChild(clone);
		});
	} else {
		todayEl.textContent = "Heute finden keine Spiele statt.";
	}

	// Polling zentral steuern
	if (hasLive) {
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

			// Prime-Time zwischen 18:00 und Mitternacht
			return gameHour >= 18 && gameHour < 24;
		});
	}

	gamesToDisplay.forEach((g) => {
		if (dateHeadline === "" || dateHeadline !== g.date) {
			dateHeadline = g.date;

			const h3El = document.createElement("h3");
			const headlineText = document.createTextNode(g.date);
			h3El.appendChild(headlineText);
			moreEl.appendChild(h3El);
		}

		const clone = templateMore.content.cloneNode(true);

		const card = clone.querySelector(".card");
		const homeName = clone.querySelector(".h-name");
		const visitingName = clone.querySelector(".v-name");
		const homeWL = clone.querySelector(".h-wl");
		const homeColor = clone.querySelector(".h-color");
		const homeAbbr = clone.querySelector(".h-abbr");
		const visitingAbbr = clone.querySelector(".v-abbr");
		const visitingWL = clone.querySelector(".v-wl");
		const visitingColor = clone.querySelector(".v-color");
		const date = clone.querySelector(".date");
		const gameLabelEl = clone.querySelector(".game-label");
		const label = (g.gameLabel || "").trim();
		const subLabel = (g.gameSubLabel || "").trim();

		homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`;
		visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`;
		homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
		homeAbbr.textContent = g.homeTeam.teamTricode;
		homeColor.style.setProperty("--team-color", `var(--${g.homeTeam.teamTricode})`);
		visitingAbbr.textContent = g.awayTeam.teamTricode;
		visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
		visitingColor.style.setProperty("--team-color", `var(--${g.awayTeam.teamTricode})`);
		card.dataset.abbr = `${g.awayTeam.teamTricode}/${g.homeTeam.teamTricode}`;
		gameLabelEl.textContent = label ? subLabel ? `${label} – ${subLabel}` : label : subLabel;

		if (g.gameStatus === 3) {
			date.textContent = `${(g.awayTeam.score ?? "")} : ${(g.homeTeam.score ?? "")}`;
		} else {
			date.textContent = `${g.time} Uhr`;
		}

		moreEl.appendChild(clone);
	});
	filterTeams();
}

function renderStandings() {
	const rows = [
		standingsEast.querySelectorAll("tr:not(:first-of-type)"),
		standingsWest.querySelectorAll("tr:not(:first-of-type)"),
	];

	const dataByConf = [westData, eastData];

	for (let confIdx = 0; confIdx < rows.length; confIdx++) {
		const rowsForTable = rows[confIdx];
		const data = dataByConf[confIdx];

		rowsForTable.forEach((row, index) => {
			const team = data[index];
			if (!team) return;

			const cells = row.querySelectorAll("td");
			row.dataset.ta = team.teamTricode;
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
		console.warn("Playoff picture skipped: playoffTeams incomplete", {
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
		const tmpl = document.getElementById("tmpl-matchup");

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
			console.warn("Skipping playoffPicture: missing play-in winners", {
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
		const gameTime = new Date(g.localDate);
		const liveWindowEnd = new Date(gameTime.getTime() + GAME_MAX_DURATION_MS);
		const card = document.querySelector(`[data-game-code="${g.gameCode}"]`);
		if (!card) return false;
		const dateEl = card.querySelector(".date");

		const shouldBeLive = now >= gameTime && now < liveWindowEnd && g.gameStatus !== 3;
		const isLive = dateEl.classList.contains("live");

		// Rerender if we need to toggle the "live" state
		return shouldBeLive !== isLive;
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
		const gameDuration = 2 * 60 * 60 * 1000; // 2 hours
		const expectedEndTime = new Date(nextGameDate.getTime() + gameDuration);
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

async function loadData() {
	await fetchData(scheduleURL, handleScheduleData);
	storeNextScheduledGame();
	await fetchData(standingsURL, handleStandingsData);

	if (shouldReloadData()) {
		await fetchData(scheduleURL, handleScheduleData, true);
		await fetchData(standingsURL, handleStandingsData, true);
	}
}

function init() {
	document.addEventListener("touchstart", function () {}, false);
	teamPicker.addEventListener("change", renderMoreGames, false);
	checkboxHidePastGames.addEventListener("change", renderMoreGames, false);
	checkboxPrimetime.addEventListener("change", renderMoreGames, false);

	checkboxPrimetime.addEventListener("change", () => {
		localStorage.setItem("nba-spielplan_primetime", checkboxPrimetime.checked);
		renderMoreGames();
	});

	checkboxShowScores.addEventListener("change", () => {
		localStorage.setItem("nba-spielplan_showScores", checkboxShowScores.checked);
		renderTodaysGames();
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
			renderCount = 0;
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
Service Worker configuration. Toggle 'useServiceWorker' to enable or disable the Service Worker.
---------------------------------------------------------------------------------------------------*/
const useServiceWorker = true; // Set to "true" if you want to register the Service Worker, "false" to unregister
const serviceWorkerVersion = "2025-11-08-v2"; // Increment this version to force browsers to fetch a new service-worker.js

async function registerServiceWorker() {
	try {
		// Force bypassing the HTTP cache so even Safari checks for a new
		// service-worker.js on every load.
		const registration = await navigator.serviceWorker.register(
			`./service-worker.js?v=${serviceWorkerVersion}`,
			{
				scope: "./",
				// updateViaCache is ignored by Safari but helps other browsers
				updateViaCache: "none",
			},
		);
		// Immediately ping for an update to catch fresh versions that may
		// have been cached by the browser.
		registration.update();
		console.log(
			"Service Worker registered with scope:",
			registration.scope,
		);
	} catch (error) {
		console.log("Service Worker registration failed:", error);
	}
}

async function unregisterServiceWorkers() {
	const registrations = await navigator.serviceWorker.getRegistrations();
	if (registrations.length === 0) return;

	await Promise.all(registrations.map((r) => r.unregister()));
	console.log("All service workers unregistered – reloading page…");
	// Hard reload to ensure starting without cache
	globalThis.location.reload();
}

if ("serviceWorker" in navigator) {
	globalThis.addEventListener("DOMContentLoaded", async () => {
		if (useServiceWorker) {
			await registerServiceWorker();
		} else {
			await unregisterServiceWorkers();
		}
	});
}
