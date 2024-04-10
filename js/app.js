/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

async function fetchData(url) {
    const response = await fetch(url);
    const json = await response.json();
    return json;
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
let params = new URLSearchParams(document.location.search);

const year = params.get("year") || "2023";
const scheduleURL = `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/league/00_full_schedule.json`;
/* 
In case the other json fails, here is a second url that I could implement
https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json
*/
const standingsURL = `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/00_standings.json`;
const schedule = await fetchData(scheduleURL);
const standings = await fetchData(standingsURL);
const games = {
    today: [],
    finished: [],
    scheduled: [],
    playoffs: []
}

const conferences = standings.sta.co.map(conference => conference.di.flatMap(division => division.t));
const conferenceStandings = [conferences[1].sort((a, b) => a.see - b.see), conferences[0].sort((a, b) => a.see - b.see)];

const standingsEast = document.querySelector("#east table");
const standingsWest = document.querySelector("#west table");

const playoffTeams = [[], []];

const templateToday = document.querySelector("#template-today");
const templateMore = document.querySelector("#template-more");
const todayEl = document.querySelector("#today");
const moreEl = document.querySelector("#more");
const today = new Date();
const progressValue = document.querySelector("#progress-value");
const teamPicker = document.querySelector("select");
const checkbox = document.querySelector("input[type='checkbox']");

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/
function prepareGameData() {
    const allGames = schedule.lscd.flatMap(month => month.mscd.g);

    allGames.forEach(game => {
        game.localDate = new Date(Date.parse(game.gdtutc + "T" + game.utctm + "+00:00"));

        game.date = game.localDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
        game.time = game.localDate.toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' });

        // IF GAME IS TODAY NO MATTER IF FINISHED OR NOT
        if (today.toLocaleDateString("de-DE") == game.localDate.toLocaleDateString("de-DE")) {
            games.today.push(game);
        }
        // IF GAME STATUS IS FINISHED
        else if (game.stt === "Final" || game.stt === "PPD") {
            games.finished.push(game);
            // add playoff games to its own array
            if (game.seri !== "") {
                games.playoffs.push(game);
            }
        }
        // GAME IS SCHEDULED
        else {
            games.scheduled.push(game);
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
        checkbox.checked = false;
    }
}

function renderTodaysGames() {
    todayEl.innerHTML = "";
    games.today.forEach(g => {
        const clone = templateToday.content.cloneNode(true);

        const homeTeam = clone.querySelector(".home-team");
        const visitingTeam = clone.querySelector(".visiting-team");
        const homeLogo = clone.querySelectorAll("img")[1];
        const homeAbbr = clone.querySelector(".h-abbr");
        const visitingAbbr = clone.querySelector(".v-abbr");
        const visitingLogo = clone.querySelectorAll("img")[0];
        const homeName = clone.querySelector(".h-name");
        const visitingName = clone.querySelector(".v-name");
        const date = clone.querySelector(".date");
        const series = clone.querySelector(".series");

        homeTeam.style.setProperty("background-color", `var(--${g.h.ta})`);
        visitingTeam.style.setProperty("background-color", `var(--${g.v.ta})`);
        homeLogo.src = `img/${g.h.ta}.svg`;
        visitingLogo.src = `img/${g.v.ta}.svg`;
        homeName.textContent = `${g.h.tc} ${g.h.tn}`;
        visitingName.textContent = `${g.v.tc} ${g.v.tn}`;
        homeAbbr.textContent = g.h.ta;
        visitingAbbr.textContent = g.v.ta;
        series.textContent = g.seri;

        if (g.stt === "Final") {
            date.textContent = `${g.v.s}:${g.h.s}`;
        }
        else {
            date.textContent = `${g.time} Uhr`;
            date.dataset.gameCode = g.gcode;
        }

        todayEl.appendChild(clone);
    });
}

function renderMoreGames() {
    let dateHeadline = "";
    moreEl.innerHTML = "";

    let gamesToDisplay = [];

    if (checkbox.checked) {
        gamesToDisplay = games.scheduled;
    }
    else {
        gamesToDisplay = games.finished.concat(games.scheduled);
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
            if (index < 8) {
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
    }
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
        removeMatchupsFromPlayoffs()
    }

    function renderMatchups(roundNr, round) {
        const matchupElements = document.querySelectorAll(`[data-round="${roundNr}"]`);
        const matchups = Array.isArray(round) ? round.flat() : [round];

        matchups.forEach((matchup, index) => {
            matchupElements[index].querySelector(".teamA .score").textContent = matchup.series.split("-")[0];
            matchupElements[index].querySelector(".teamB .score").textContent = matchup.series.split("-")[1];
            matchupElements[index].querySelector(".teamA .teamname").textContent = matchup.teamA;
            matchupElements[index].querySelector(".teamB .teamname").textContent = matchup.teamB;
            matchupElements[index].querySelector(".teamA .teamname").style.setProperty("background-color", `var(--${matchup.teamA})`);
            matchupElements[index].querySelector(".teamB .teamname").style.setProperty("background-color", `var(--${matchup.teamB})`);
        });
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
    removeMatchupsFromPlayoffs()
    renderMatchups(4, finals);
}

function init() {
    document.addEventListener("touchstart", function () { }, false);
    teamPicker.addEventListener("change", renderMoreGames, false);
    checkbox.addEventListener("change", renderMoreGames, false);
    prepareGameData();
    setProgressBar();
    renderTodaysGames();
    renderMoreGames();
    renderStandings();
    if (games.playoffs.length > 0) {
        playoffPicture();
    }
}

/* --------------------------------------------------------------------------------------------------
public members, exposed with return statement
---------------------------------------------------------------------------------------------------*/
window.app = {
    init
};

window.app.init();
