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
const year = "2023"
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
    scheduled: []
}

const conferences = standings.sta.co.map(conference => conference.di.flatMap(division => division.t));
const easternConference = conferences[0].sort((a, b) => a.see - b.see);
const westernConference = conferences[1].sort((a, b) => a.see - b.see);

const standingsEast = document.querySelector("#east table");
const standingsWest = document.querySelector("#west table");

const templateToday = document.querySelector("#template-today");
const templateMore = document.querySelector("#template-more");
const todayEl = document.querySelector("#today");
const moreEl = document.querySelector("#more");
const today = new Date();
const progressValue = document.querySelector("#progress-value");

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

    let gamespercentage = (progress * 100 / AllGames).toFixed(2);
    progressValue.style.width = `${gamespercentage}%`;
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
        }

        todayEl.appendChild(clone);
    });
}

function renderMoreGames() {
    let dateHeadline = "";
    moreEl.innerHTML = "";
    games.scheduled.forEach(g => {
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

        homeName.textContent = `@ ${g.h.tc} ${g.h.tn}`;
        visitingName.textContent = `${g.v.tc} ${g.v.tn}`;
        homeAbbr.textContent = `@ ${g.h.ta}`;
        visitingAbbr.textContent = g.v.ta;
        card.dataset.code = `${g.v.ta}/${g.h.ta}`;

        if (g.stt === "Final") {
            date.textContent = `${g.v.s}:${g.h.s}`;
        }
        else {
            date.textContent = `${g.time} Uhr`;
        }

        moreEl.appendChild(clone);
    });
}

function renderStandings() {
    const rowsEast = standingsEast.querySelectorAll("tr:not(:first-of-type)");
    
    rowsEast.forEach((row, index) => {
        let cells = row.querySelectorAll("td");
        row.dataset.ta = easternConference[index].ta;
        cells[1].textContent = easternConference[index].ta;
        cells[2].textContent = `${easternConference[index].w}-${easternConference[index].l}`;
        cells[3].textContent = easternConference[index].gb;
        cells[4].textContent = easternConference[index].str;
        cells[5].textContent = easternConference[index].hr;
        cells[6].textContent = easternConference[index].ar;
    });

    const rowsWest= standingsWest.querySelectorAll("tr:not(:first-of-type)");
    
    rowsWest.forEach((row, index) => {
        let cells = row.querySelectorAll("td");
        row.dataset.ta = westernConference[index].ta;
        cells[1].textContent = westernConference[index].ta;
        cells[2].textContent = `${westernConference[index].w}-${westernConference[index].l}`;
        cells[3].textContent = westernConference[index].gb;
        cells[4].textContent = westernConference[index].str;
        cells[5].textContent = westernConference[index].hr;
        cells[6].textContent = westernConference[index].ar;
});
}

function init() {
    document.addEventListener("touchstart", function () { }, false);
    prepareGameData();
    setProgressBar();
    renderTodaysGames();
    renderMoreGames();
    renderStandings();
}

/* --------------------------------------------------------------------------------------------------
public members, exposed with return statement
---------------------------------------------------------------------------------------------------*/
window.app = {
    init
};

window.app.init();
