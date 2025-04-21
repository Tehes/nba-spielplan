/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

async function fetchData(url, updateFunction, forceNetwork = false) {
    const cacheName = 'nba-data-cache';
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
stt	        Game Status	                String	                "Final"
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

const year = params.get("year") || "2024";
const scheduleURL = `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/league/00_full_schedule.json`;
/* 
In case the other json fails, here is a second url that I could implement
https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json
*/
const standingsURL = `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/00_standings.json`;
let schedule;
let standings;
let games = {};
let conferences;
let conferenceStandings;

let standingsEast;
let standingsWest;
let playoffTeams;

let renderCount = 0;
let lastCheckedDay = new Date().toLocaleDateString("de-DE", { year: 'numeric', month: '2-digit', day: '2-digit' });

const templateToday = document.querySelector("#template-today");
const templateMore = document.querySelector("#template-more");
const todayEl = document.querySelector("#today");
const moreEl = document.querySelector("#more");
const today = new Date();
const progressValue = document.querySelector("#progress-value");
const teamPicker = document.querySelector("select");
const checkboxHidePastGames = document.querySelectorAll("input[type='checkbox']")[0];
const checkboxPrimetime = document.querySelectorAll("input[type='checkbox']")[1];

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/
function prepareGameData() {
    const allGames = schedule.lscd.flatMap(month => month.mscd.g);

    allGames.forEach(game => {
        game.localDate = new Date(Date.parse(game.gdtutc + "T" + game.utctm + "+00:00"));

        if (game.gdtutc === "TBD") {
            game.date = "Noch offen";
            game.time = "HH:MM";
        }
        else {
            game.date = game.localDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
            game.time = game.localDate.toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' });
        }

        // IF GAME IS TODAY NO MATTER IF FINISHED OR NOT
        if (today.toLocaleDateString("de-DE") == game.localDate.toLocaleDateString("de-DE") && game.stt !== "PPD") {
            games.today.push(game);
        }
        // IF GAME STATUS IS FINISHED
        else if (game.stt === "Final") {
            games.finished.push(game);
        }
        // GAME IS SCHEDULED
        else if (game.localDate.toLocaleDateString("de-DE") > today.toLocaleDateString("de-DE")) {
            games.scheduled.push(game);
        }

        // add playoff games to its own array
        if (game.stt === "Final" && game.seri !== "") {
            games.playoffs.push(game);
        }
    });

    games.today.sort((a, b) => a.localDate - b.localDate);
    games.finished.sort((a, b) => a.localDate - b.localDate);
    games.scheduled.sort((a, b) => a.localDate - b.localDate);
}

function setProgressBar() {
    let AllGames = (games.today.length - 1) + (games.finished.length - 1) + (games.scheduled.length - 1);
    let progress = games.finished.length - 1;

    games.today.forEach(g => {
        if (g.stt === "Final") {
            progress++;
        }
    });

    let gamespercentage = parseInt(progress * 100 / AllGames);
    progressValue.style.width = `${gamespercentage}%`;
    progressValue.textContent = `${gamespercentage}%`;

    if (gamespercentage === 100) {
        checkboxHidePastGames.checked = false;
    }
}

function renderTodaysGames() {
    todayEl.innerHTML = "";
    if (games.today.length > 0) {
        games.today.forEach(g => {
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

            if (g.stt === "Final") {
                date.textContent = `${g.v.s}:${g.h.s}`;
            }
            else if (now >= g.localDate) {
                const link = document.createElement("a");
                link.href = `https://www.nba.com/game/${g.v.ta}-vs-${g.h.ta}-${g.gid}/play-by-play`;
                link.textContent = "LIVE";
                link.target = "_blank";

                date.appendChild(link);
                date.classList.add("live");
            }
            else {
                date.textContent = `${g.time} Uhr`;
                date.dataset.gameCode = g.gcode;
            }

            todayEl.appendChild(clone);
        });
    }
    else {
        todayEl.innerHTML = "Heute finden keine Spiele statt."
    }
}

function renderMoreGames() {
    let dateHeadline = "";
    moreEl.innerHTML = "";

    let gamesToDisplay = [];

    if (checkboxHidePastGames.checked) {
        gamesToDisplay = games.scheduled;
    }
    else {
        gamesToDisplay = games.finished.concat(games.scheduled);
    }

    if (checkboxPrimetime.checked) {
        gamesToDisplay = gamesToDisplay.filter(g => {
            const [hours, minutes] = g.time.split(":").map(Number);
            const gameHour = hours + minutes / 60;

            // Prime-Time zwischen 18:00 und Mitternacht
            return gameHour >= 18 && gameHour < 24;
        });
    }

    gamesToDisplay.forEach(g => {
        if (dateHeadline === "" || dateHeadline !== g.date) {
            dateHeadline = g.date;

            let h3El = document.createElement("h3");
            let headlineText = document.createTextNode(g.date);
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

        if (g.stt === "Final") {
            date.textContent = `${g.v.s}:${g.h.s}`;
        }
        else {
            date.textContent = `${g.time} Uhr`;
        }

        moreEl.appendChild(clone);
    });
    filterTeams();
}

function renderStandings() {
    const rows = [standingsEast.querySelectorAll("tr:not(:first-of-type)"), standingsWest.querySelectorAll("tr:not(:first-of-type)")];

    for (let i = 0; i < rows.length; i++) {
        rows[i].forEach((row, index) => {
            let cells = row.querySelectorAll("td");
            row.dataset.ta = conferenceStandings[i][index].ta;
            cells[1].textContent = conferenceStandings[i][index].ta;
            cells[2].textContent = `${conferenceStandings[i][index].w}-${conferenceStandings[i][index].l}`;
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
        const otherTeams = document.querySelectorAll(`#more .card:not([data-abbr*="${selectedTeam}"])`);
        for (const card of otherTeams) {
            card.remove();
        }
        const emptyHeadlines = document.querySelectorAll("#more h3:not(:has(+ .card))");
        for (const emptyHeadline of emptyHeadlines) {
            emptyHeadline.remove();
        }
    }
}

function findLastRegularSeasonGame() {
    const allGames = schedule.lscd.flatMap(month => month.mscd.g);

    // Group games by date
    const gamesByDate = allGames.reduce(function (groupedGames, game) {
        const gameDate = game.gdtutc.split("T")[0]; // Extract only the date
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
    const allGames = schedule.lscd.flatMap(month => month.mscd.g);

    // Find the last regular season day
    const lastRegularSeasonDay = findLastRegularSeasonGame();

    // Filter all games after the last regular season day and exclude Playoff games (with seri)
    const playInGames = allGames
        .filter(function (game) {
            const gameDate = game.gdtutc.split("T")[0];
            const isAfterRegularSeason = new Date(gameDate) > new Date(lastRegularSeasonDay);
            const isNotPlayoffGame = !game.seri; // Exclude playoff games
            return isAfterRegularSeason && isNotPlayoffGame;
        })
        .filter(game => game && game.h && game.v); // Ensure valid games

    // Play-In Teams (7-10) for East and West conferences
    const eastPlayInTeams = conferenceStandings[0].slice(6, 10); // Seeds 7-10 in the East
    const westPlayInTeams = conferenceStandings[1].slice(6, 10); // Seeds 7-10 in the West

    function getWinner(game) {
        const homeScore = parseInt(game.h.s, 10); // Home team score
        const awayScore = parseInt(game.v.s, 10); // Away team score
        return homeScore > awayScore ? game.h : game.v; // Return the winner's full object
    }

    function playInTournament(playInTeams, conferenceIndex) {
        const [seed7, seed8, seed9, seed10] = playInTeams;

        // Game 1: Seed 7 (home) vs Seed 8 → Winner is 7th Seed
        const game1 = playInGames.find(game => game.h.tid === seed7.tid && game.v.tid === seed8.tid);
        const winnerGame1 = getWinner(game1);
        const loserGame1 = winnerGame1.tid === seed7.tid ? seed8 : seed7;

        // Game 2: Seed 9 (home) vs Seed 10 → Loser is out, Winner plays next
        const game2 = playInGames.find(game => game.h.tid === seed9.tid && game.v.tid === seed10.tid);
        const winnerGame2 = getWinner(game2);

        // Game 3: Loser of Game 1 vs Winner of Game 2 → Winner is 8th Seed
        const game3 = playInGames.find(game => game.h.tid === loserGame1.tid && game.v.tid === winnerGame2.tid);
        const winnerGame3 = getWinner(game3);

        playoffTeams[conferenceIndex].push(winnerGame1); // 7th Seed
        playoffTeams[conferenceIndex].push(winnerGame3); // 8th Seed
    }

    // Determine East and West Play-In winners
    playInTournament(eastPlayInTeams, 0); // East is index 0 in playoffTeams
    playInTournament(westPlayInTeams, 1); // West is index 1 in playoffTeams
}

function playoffPicture() {
    const playoffBracket = document.querySelector("#playoffs");
    const playoffHeadline = document.querySelectorAll("h1")[0];
    playoffHeadline.classList.remove("hidden");
    playoffBracket.classList.remove("hidden");

    const conferenceIndex = ["west", "east"];

    let indexesToRemove = [];
    function removeMatchupsFromPlayoffs() {
        for (let i = indexesToRemove.length - 1; i >= 0; i--) {
            games.playoffs.splice(indexesToRemove[i], 1);
        }
        indexesToRemove = [];
    }

    function getMatchups(noOfTeams, thisRound, previousRound) {
        for (let j = 0; j < conferenceIndex.length; j++) {
            for (let i = 0; i < noOfTeams / 2; i++) {
                thisRound[j].push({
                    conference: conferenceIndex[j],
                    series: "0-0",
                    leadingTeam: "",
                    leadingTeamSeed: 0
                });
                if (previousRound[j][i].series.includes("4")) {
                    Object.assign(thisRound[j][i], {
                        teamA: previousRound[j][i].leadingTeam,
                        teamASeed: previousRound[j][i].leadingTeamSeed
                    });
                }
                if (previousRound[j][numberOfTeams - 1 - i].series.includes("4")) {
                    Object.assign(thisRound[j][i], {
                        teamB: previousRound[j][numberOfTeams - 1 - i].leadingTeam,
                        teamBSeed: previousRound[j][numberOfTeams - 1 - i].leadingTeamSeed
                    });
                }
            }
        }
    }

    function playSeries(round) {
        games.playoffs.forEach((g, index) => {
            const teamNames = g.gcode.slice(-6);

            for (let j = 0; j < conferenceIndex.length; j++) {
                for (let i = 0; i < round[j].length; i++) {
                    const matchup = round[j][i];
                    if (teamNames.includes(matchup.teamA) && teamNames.includes(matchup.teamB)) {
                        matchup.series = g.seri.slice(-3);
                        matchup.leadingTeam = g.seri.slice(0, 3);
                        if (matchup.leadingTeam === matchup.teamB) {
                            matchup.series = matchup.series.split("").reverse().join("");
                            matchup.leadingTeamSeed = matchup.teamBSeed;
                        }
                        else {
                            matchup.leadingTeamSeed = matchup.teamASeed;
                        }
                        indexesToRemove.push(index);
                    }
                }
            }
        });
        removeMatchupsFromPlayoffs();
    }

    function renderMatchups(roundNr, round) {
        const matchups = Array.isArray(round) ? round : [round];
        const order = roundNr === 1 ? [0, 3, 2, 1] : [0, 1, 2, 3];

        for (let j = 0; j < conferenceIndex.length; j++) {
            const matchupElements = document.querySelectorAll(`#${conferenceIndex[j]}ern [data-round="${roundNr}"]`);

            for (let i = 0; i < matchupElements.length; i++) {
                matchupElements[order[i]].querySelector(".teamA .score").textContent = matchups[j][i].series.split("-")[0];
                matchupElements[order[i]].querySelector(".teamB .score").textContent = matchups[j][i].series.split("-")[1];
                matchupElements[order[i]].querySelector(".teamA .teamname").textContent = matchups[j][i].teamA;
                matchupElements[order[i]].querySelector(".teamB .teamname").textContent = matchups[j][i].teamB;
                matchupElements[order[i]].querySelector(".teamA .teamname").style.setProperty("background-color", `var(--${matchups[j][i].teamA})`);
                matchupElements[order[i]].querySelector(".teamB .teamname").style.setProperty("background-color", `var(--${matchups[j][i].teamB})`);
            }
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
                leadingTeamSeed: 0
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
        leadingTeamSeed: 0
    };
    if (conferenceFinals[0][0].series.includes("4")) {
        Object.assign(finals, {
            teamA: conferenceFinals[0][0].leadingTeam,
            teamASeed: conferenceFinals[0][0].leadingTeamSeed
        });
    }
    if (conferenceFinals[1][0].series.includes("4")) {
        Object.assign(finals, {
            teamB: conferenceFinals[1][0].leadingTeam,
            teamBSeed: conferenceFinals[1][0].leadingTeamSeed
        });
    }

    games.playoffs.forEach((g, index) => {
        const teamNames = g.gcode.slice(-6);

        if (teamNames.includes(finals.teamA) && teamNames.includes(finals.teamB)) {
            finals.series = g.seri.slice(-3);
            finals.leadingTeam = g.seri.slice(0, 3);
            if (finals.leadingTeam === finals.teamB) {
                finals.series = finals.series.split("").reverse().join("");
                finals.leadingTeamSeed = finals.teamBSeed;
            }
            else {
                finals.leadingTeamSeed = finals.teamASeed;
            }
            indexesToRemove.push(index);
        }
    });
    removeMatchupsFromPlayoffs();

    const finalMatchupElements = document.querySelector("#finals");
    finalMatchupElements.querySelector(".teamA .score").textContent = finals.series.split("-")[0];
    finalMatchupElements.querySelector(".teamB .score").textContent = finals.series.split("-")[1];
    finalMatchupElements.querySelector(".teamA .teamname").textContent = finals.teamA;
    finalMatchupElements.querySelector(".teamB .teamname").textContent = finals.teamB;
    finalMatchupElements.querySelector(".teamA .teamname").style.setProperty("background-color", `var(--${finals.teamA})`);
    finalMatchupElements.querySelector(".teamB .teamname").style.setProperty("background-color", `var(--${finals.teamB})`);
}

function handleScheduleData(json) {
    if (json && json.lscd && json.lscd.length > 0) {
        schedule = json;

        games = {
            today: [],
            finished: [],
            scheduled: [],
            playoffs: []
        };

        prepareGameData();
        setProgressBar();
        renderTodaysGames();
        renderMoreGames();
    } else {
        console.log("Schedule data not available. Skipping schedule rendering.");
    }
}

function handleStandingsData(json) {
    if (json && json.sta && json.sta.co) {
        standings = json;
        playoffTeams = [[], []];

        conferences = standings.sta.co
            .filter(conference => conference.val !== "Intl")
            .map(conference => conference.di.flatMap(division => division.t));

        conferenceStandings = [conferences[1].sort((a, b) => a.see - b.see), conferences[0].sort((a, b) => a.see - b.see)];

        standingsEast = document.querySelector("#east table");
        standingsWest = document.querySelector("#west table");
        renderStandings();

        if (games.playoffs.length > 0) {
            determinePlayInWinners();
            playoffPicture();
        }
    } else {
        console.log("Standings data not available. Skipping standings rendering.");
    }
}

function shouldRerender() {
    const now = new Date();

    const todayString = now.toLocaleDateString("de-DE", { year: 'numeric', month: '2-digit', day: '2-digit' });

    if (lastCheckedDay !== todayString) {
        lastCheckedDay = todayString;
        console.log("New day detected, rerender required.");
        return true;
    }

    const gameJustWentLive = games.today.some(g => {
        const gameTime = new Date(g.localDate);
        const card = document.querySelector(`[data-game-code="${g.gcode}"]`);
        const dateEl = card.querySelector(".date");

        return now >= gameTime && g.stt !== "Final" && !dateEl.classList.contains("live");
    });

    if (gameJustWentLive) {
        console.log("A game just went live, rerender required.");
        return true;
    }
    console.log("no rerendering needed");
    return false;
}

function shouldReloadData() {
    const nextGame = JSON.parse(localStorage.getItem('nba_nextScheduledGame'));

    if (nextGame) {
        const nextGameDate = new Date(nextGame.localDate);
        const gameDuration = 2 * 60 * 60 * 1000; // 2 hours
        const expectedEndTime = new Date(nextGameDate.getTime() + gameDuration);
        const now = new Date();

        console.log(`Next game: ${nextGameDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} | Expected end: ${expectedEndTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} | Now: ${now.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);

        if (now > expectedEndTime) {
            console.log("Next scheduled game is in the past. Data should be reloaded.");
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
        games.today.filter(game => game.stt !== "Final")
    );

    if (allScheduledGames.length === 0) {
        return;
    }

    const nextGame = allScheduledGames.reduce((soonest, game) => {
        const gameDate = new Date(game.localDate);
        return gameDate < new Date(soonest.localDate) ? game : soonest;
    });

    localStorage.setItem('nba_nextScheduledGame', JSON.stringify(nextGame));
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

async function init() {
    document.addEventListener("touchstart", function () { }, false);
    teamPicker.addEventListener("change", renderMoreGames, false);
    checkboxHidePastGames.addEventListener("change", renderMoreGames, false);
    checkboxPrimetime.addEventListener("change", renderMoreGames, false);

    document.addEventListener("DOMContentLoaded", function () {
        loadData();
    });

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === 'visible') {
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
window.app = {
    init
};

window.app.init();

/* --------------------------------------------------------------------------------------------------
Service Worker configuration. Toggle 'useServiceWorker' to enable or disable the Service Worker.
---------------------------------------------------------------------------------------------------*/
const useServiceWorker = true; // Set to "true" if you want to register the Service Worker, "false" to unregister

async function registerServiceWorker() {
    try {
        const currentPath = window.location.pathname;
        const registration = await navigator.serviceWorker.register(`${currentPath}service-worker.js`);
        console.log("Service Worker registered with scope:", registration.scope);
    } catch (error) {
        console.log("Service Worker registration failed:", error);
    }
}

async function unregisterServiceWorkers() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
        const success = await registration.unregister();
        if (success) {
            console.log("Service Worker successfully unregistered.");
        }
    }
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        if (useServiceWorker) {
            await registerServiceWorker();
        } else {
            await unregisterServiceWorkers();
        }
    });
}
