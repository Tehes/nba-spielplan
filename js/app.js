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
Name        Description                 Value Type              Example
lscd        League Schedule             Array of JSON Objects
mscd	    Month Schedule              Array of JSON Objects
mon         Month                       String                  "June"
g           Games                       Array of JSON Objects
gid         Game ID                     String                  "0041500407"
gcode	    Game Code	                String	                "20160619/CLEGSW"
seri	    Playoff Series Summary	    String	                "CLE wins series 4-3"
gdte	    Game Date                   String                  "2016-06-19"
an	        Arena	                    String	                "ORACLE Arena"
ac	        Arena City	                String	                "Oakland"
as	        Arena State	                String	                "CA"
bd	        Broadcast Information	    JSON Object
b	        Broadcasters	            Array of JSON Objects
v	        Visiting Team Information	JSON Object
h	        Home Team Information	    JSON Object
tid	        Team ID	                    Integer                 1610612739
re	        W-L Record	                String	                "16-5"
ta	        Team Abbreviation	        String	                "CLE"
tn	        Team Name	                String	                "Cavaliers"
tc	        Team City	                String	                "Cleveland"
s	        Team Score	                String	                "93"
gdtutc	    Game Date UTC	            String	                "2016-06-20"
utctm	    UTC Time	                String	                "00:00"
-------------------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------------------
New API (scheduleLeagueV2)
--------------------------------------------------------------------------------------
leagueSchedule       Root object
  gameDates[]        Array of dates; each has `games[]`
    games[]          Array of games with rich fields
      gameId         String            e.g. "0022500095"
      gameCode       String            e.g. "20251024/SASNOP"
      gameStatus     Number            1 = Scheduled, 2 = Live, 3 = Final, 4 = Postponed
      gameStatusText String            e.g. "Final", "Final/OT", "3rd Qtr"
      gameDateTimeUTC ISO 8601 UTC     e.g. "2025-10-25T00:00:00Z"
      arenaName      String            e.g. "Smoothie King Center"
      arenaCity      String            e.g. "New Orleans"
      arenaState     String            e.g. "LA"

      homeTeam       Object
        teamId       Number            e.g. 1610612740
        teamCity     String            e.g. "New Orleans"
        teamName     String            e.g. "Pelicans"
        teamTricode  String            e.g. "NOP"
        wins         Number            current wins (pre/post game)
        losses       Number            current losses
        score        Number            final/live score (may be 0 or missing if not started)

      awayTeam       Object
        teamId       Number            e.g. 1610612759
        teamCity     String            e.g. "San Antonio"
        teamName     String            e.g. "Spurs"
        teamTricode  String            e.g. "SAS"
        wins         Number
        losses       Number
        score        Number

      broadcasters   Object            nested lists (natl/home/away tv/radio/ott)
      seriesText     String            e.g. "Neutral Site", ""
      gameLabel      String            e.g. "Preseason", "Regular Season"
      gameSubLabel   String            e.g. "NBA Abu Dhabi Game"
-------------------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------------------
tid         team ID                     Integer                 1610612738
see         seed                        Integer                 1
w           wins                        Integer                 29
l           losses                      Integer                 9
gb          games behind                Integer                 0.000
gbd         games behind division       Integer                 0.000
gbl         games behind league         Integer                 0.00000
tc          team city                   String                  "Boston"
tn          team name                   String                  "Celtics"
ta          team abbreviation           String                  "BOS"
str         streak                      String                  "L 1"
l10         last 10 games               String                  "7-3"
dr          division record             String                  "10-1"
cr          conference record           String                  "22-6"
hr          home record                 String                  "18-0"
ar          away record                 String                  "11-9"
-------------------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------------------------------
Variables
---------------------------------------------------------------------------------------------------*/
const params = new URLSearchParams(document.location.search);

const year = params.get("year") || "2025";
const scheduleURL = "https://nba-spielplan.tehes.deno.net/schedule";
/*
if the above URL is not working, use this one:
https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/league/00_full_schedule.json
*/
const standingsURL =
	`https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/00_standings.json`;
let schedule;
let standings;
let games = {};
let conferences;
let conferenceStandings;

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
const today = new Date();
const progressValue = document.querySelector("#progress-value");
const teamPicker = document.querySelector("select");
const checkboxHidePastGames = document.querySelectorAll("input[type='checkbox']")[0];
const checkboxPrimetime = document.querySelectorAll("input[type='checkbox']")[1];
const GAME_MAX_DURATION_MS = (3 * 60 + 15) * 60 * 1000; // 3h 15m

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/
// --- Adapter: map new scheduleLeagueV2 to legacy lscd/mscd.g shape (minimal fields only)
function adaptSchedule(json) {
	// If it already looks like legacy (has lscd), pass through unchanged
	if (json && Array.isArray(json.lscd)) return json;

	// New format detection: leagueSchedule.gameDates[].games[]
	const ls = json && json.leagueSchedule;
	if (!ls || !Array.isArray(ls.gameDates)) return json; // unknown shape → passthrough

	return {
		...json,
		leagueSchedule: {
			...ls,
			gameDates: ls.gameDates.map((d) => ({
				...d,
				games: (d.games || []).map((g) => ({
					...g,
					gid: String(g.gameId ?? ""),
					gcode: g.gameCode ?? "",
					seri: g.seriesText ?? "",
					v: {
						tid: g.awayTeam?.teamId ?? 0,
						ta: g.awayTeam?.teamTricode ?? "",
						tn: g.awayTeam?.teamName ?? "",
						tc: g.awayTeam?.teamCity ?? "",
						re: `${g.awayTeam?.wins ?? 0}-${g.awayTeam?.losses ?? 0}`,
						s: g.awayTeam?.score != null ? String(g.awayTeam.score) : "",
					},
					h: {
						tid: g.homeTeam?.teamId ?? 0,
						ta: g.homeTeam?.teamTricode ?? "",
						tn: g.homeTeam?.teamName ?? "",
						tc: g.homeTeam?.teamCity ?? "",
						re: `${g.homeTeam?.wins ?? 0}-${g.homeTeam?.losses ?? 0}`,
						s: g.homeTeam?.score != null ? String(g.homeTeam.score) : "",
					},
				})),
			})),
		},
	};
}

function prepareGameData() {
	const allGames = schedule.leagueSchedule.gameDates.flatMap((d) => d.games || []);

	allGames.forEach((game) => {
		game.localDate = new Date(game.gameDateTimeUTC);

		if (!iso || Number.isNaN(game.localDate.getTime())) {
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

		// IF GAME IS TODAY NO MATTER IF FINISHED OR NOT
		if (
			today.toLocaleDateString("de-DE") ==
				game.localDate.toLocaleDateString("de-DE") && game.gameStatus !== 4 /* postponed */
		) {
			games.today.push(game);
		} // IF GAME STATUS IS FINISHED
		else if (game.gameStatus === 3) {
			games.finished.push(game);
		} // GAME IS SCHEDULED
		else if (
			game.localDate.toLocaleDateString("de-DE") >
				today.toLocaleDateString("de-DE")
		) {
			games.scheduled.push(game);
		}

		// add playoff games to its own array
		if (game.gameStatus === 3 && game.seri !== "") {
			games.playoffs.push(game);
		}
	});

	games.today.sort((a, b) => a.localDate - b.localDate);
	games.finished.sort((a, b) => a.localDate - b.localDate);
	games.scheduled.sort((a, b) => a.localDate - b.localDate);
}

function setProgressBar() {
	const AllGames = (games.today.length - 1) + (games.finished.length - 1) +
		(games.scheduled.length - 1);
	let progress = games.finished.length - 1;

	games.today.forEach((g) => {
		if (g.gameStatus === 3) {
			progress++;
		}
	});

	const gamespercentage = parseInt(progress * 100 / AllGames);
	progressValue.style.width = `${gamespercentage}%`;
	progressValue.textContent = `${gamespercentage}%`;

	if (gamespercentage === 100) {
		checkboxHidePastGames.checked = false;
	}
}

function renderTodaysGames() {
	todayEl.replaceChildren();
	if (games.today.length > 0) {
		games.today.forEach((g) => {
			const clone = templateToday.content.cloneNode(true);
			clone.querySelector(".card").dataset.gameCode = g.gcode;

			const homeTeam = clone.querySelector(".home-team");
			const visitingTeam = clone.querySelector(".visiting-team");
			const homeLogo = clone.querySelectorAll("img")[1];
			const homeAbbr = clone.querySelector(".h-abbr");
			const homeWL = clone.querySelector(".h-wl");
			const visitingAbbr = clone.querySelector(".v-abbr");
			const visitingWL = clone.querySelector(".v-wl");
			const visitingLogo = clone.querySelectorAll("img")[0];
			const homeName = clone.querySelector(".h-name");
			const visitingName = clone.querySelector(".v-name");
			const date = clone.querySelector(".date");
			const now = new Date();

			homeTeam.style.setProperty("--team-color", `var(--${g.h.ta})`);
			visitingTeam.style.setProperty("--team-color", `var(--${g.v.ta})`);
			homeLogo.src = `img/${g.h.ta}.svg`;
			homeLogo.onerror = () => homeLogo.src = "img/no-logo.svg";

			visitingLogo.src = `img/${g.v.ta}.svg`;
			visitingLogo.onerror = () => visitingLogo.src = "img/no-logo.svg";
			homeName.textContent = `${g.h.tc} ${g.h.tn}`;
			visitingName.textContent = `${g.v.tc} ${g.v.tn}`;
			homeAbbr.textContent = g.h.ta;
			visitingAbbr.textContent = g.v.ta;
			homeWL.textContent = g.h.re;
			visitingWL.textContent = g.v.re;

			if (g.gameStatus === 3) {
				date.textContent = `${g.v.s}:${g.h.s}`;
			} else if (
				now >= g.localDate &&
				now < new Date(g.localDate.getTime() + GAME_MAX_DURATION_MS)
			) {
				const link = document.createElement("a");
				link.href = `https://www.nba.com/game/${g.v.ta}-vs-${g.h.ta}-${g.gid}/play-by-play`;
				link.textContent = "LIVE";
				link.target = "_blank";

				// ensure we don't accumulate multiple links/text nodes
				date.appendChild(link);
				date.classList.add("live");
			} else {
				date.classList.remove("live");
				date.textContent = `${g.time} Uhr`;
				date.dataset.gameCode = g.gcode;
			}

			todayEl.appendChild(clone);
		});
	} else {
		todayEl.innerHTML = "Heute finden keine Spiele statt.";
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
		const homeAbbr = clone.querySelector(".h-abbr");
		const visitingAbbr = clone.querySelector(".v-abbr");
		const date = clone.querySelector(".date");

		homeName.textContent = `${g.h.tc} ${g.h.tn}`;
		visitingName.textContent = `${g.v.tc} ${g.v.tn}`;
		homeAbbr.textContent = g.h.ta;
		visitingAbbr.textContent = g.v.ta;
		card.dataset.abbr = `${g.v.ta}/${g.h.ta}`;

		if (g.gameStatus === 3) {
			date.textContent = `${g.v.s}:${g.h.s}`;
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

	for (let i = 0; i < rows.length; i++) {
		rows[i].forEach((row, index) => {
			const cells = row.querySelectorAll("td");
			row.dataset.ta = conferenceStandings[i][index].ta;
			cells[1].textContent = conferenceStandings[i][index].ta;
			cells[2].textContent = `${conferenceStandings[i][index].w}-${
				conferenceStandings[i][index].l
			}`;
			cells[3].textContent = conferenceStandings[i][index].gb;
			cells[4].textContent = conferenceStandings[i][index].str;
			cells[5].textContent = conferenceStandings[i][index].hr;
			cells[6].textContent = conferenceStandings[i][index].ar;
			// add seed 1 - 8 to playoff Teams
			if (index < 6) {
				playoffTeams[i].push(conferenceStandings[i][index]);
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

	// Filter all games after the last regular season day and exclude Playoff games (with seri)
	const playInGames = allGames
		.filter(function (game) {
			const gameDate = new Date(game.gameDateTimeUTC).toISOString().slice(0, 10);
			const isAfterRegularSeason = new Date(gameDate) > new Date(lastRegularSeasonDay);
			const isNotPlayoffGame = !game.seri; // Exclude playoff games
			return isAfterRegularSeason && isNotPlayoffGame;
		})
		.filter((game) => game && game.h && game.v); // Ensure valid games
	// Not enough reliable Play-In data — abort safely
	if (!playInGames || playInGames.length < 3) return;

	// Play-In Teams (7-10) for East and West conferences
	const eastPlayInTeams = conferenceStandings[0].slice(6, 10); // Seeds 7-10 in the East
	const westPlayInTeams = conferenceStandings[1].slice(6, 10); // Seeds 7-10 in the West

	function getWinner(game) {
		if (!game || !game.h || !game.v) return null;
		const homeScore = parseInt(game.h.s, 10);
		const awayScore = parseInt(game.v.s, 10);
		if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
		return homeScore > awayScore ? game.h : game.v; // Return the winner's team object
	}

	function playInTournament(playInTeams, conferenceIndex) {
		const [seed7, seed8, seed9, seed10] = playInTeams;

		// Game 1: Seed 7 (home) vs Seed 8 → Winner is 7th Seed
		const game1 = playInGames.find((game) =>
			game.h.tid === seed7.tid && game.v.tid === seed8.tid
		);
		const winnerGame1 = getWinner(game1);
		if (!winnerGame1) return;
		const loserGame1 = winnerGame1.tid === seed7.tid ? seed8 : seed7;

		// Game 2: Seed 9 (home) vs Seed 10 → Loser is out, Winner plays next
		const game2 = playInGames.find((game) =>
			game.h.tid === seed9.tid && game.v.tid === seed10.tid
		);
		const winnerGame2 = getWinner(game2);
		if (!winnerGame2) return;

		// Game 3: Loser of Game 1 vs Winner of Game 2 → Winner is 8th Seed
		const game3 = playInGames.find((game) =>
			game.h.tid === loserGame1.tid && game.v.tid === winnerGame2.tid
		);
		const winnerGame3 = getWinner(game3);
		if (!winnerGame3) return;

		playoffTeams[conferenceIndex].push(winnerGame1); // 7th Seed
		playoffTeams[conferenceIndex].push(winnerGame3); // 8th Seed
	}

	// Determine East and West Play-In winners
	playInTournament(eastPlayInTeams, 0); // East is index 0 in playoffTeams
	playInTournament(westPlayInTeams, 1); // West is index 1 in playoffTeams
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
			const teamNames = g.gcode.slice(-6);
			let consumed = false;

			for (const conference of round) {
				for (const matchup of conference) {
					if (
						teamNames.includes(matchup.teamA) &&
						teamNames.includes(matchup.teamB)
					) {
						// update matchup infos
						matchup.series = g.seri.slice(-3);
						matchup.leadingTeam = g.seri.slice(0, 3);

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
		const teamNames = g.gcode.slice(-6);

		if (
			teamNames.includes(finals.teamA) && teamNames.includes(finals.teamB)
		) {
			finals.series = g.seri.slice(-3);
			finals.leadingTeam = g.seri.slice(0, 3);
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
	json = adaptSchedule(json);
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
		renderMoreGames();
	} else {
		console.log(
			"Schedule data not available. Skipping schedule rendering.",
		);
	}
}

function handleStandingsData(json) {
	if (json && json.sta && json.sta.co) {
		standings = json;
		playoffTeams = [[], []];

		conferences = standings.sta.co
			.filter((conference) => conference.val !== "Intl")
			.map((conference) => conference.di.flatMap((division) => division.t));

		conferenceStandings = [
			conferences[1].sort((a, b) => a.see - b.see),
			conferences[0].sort((a, b) => a.see - b.see),
		];

		standingsEast = document.querySelector("#east table");
		standingsWest = document.querySelector("#west table");
		renderStandings();

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
	} else {
		console.log(
			"Standings data not available. Skipping standings rendering.",
		);
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
		const card = document.querySelector(`[data-game-code="${g.gcode}"]`);
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
const serviceWorkerVersion = "2025-10-05-v1"; // Increment this version to force browsers to fetch a new service-worker.js

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
