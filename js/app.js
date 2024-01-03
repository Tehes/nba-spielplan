/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

async function fetchSchedule(year) {
    const response = await fetch(`https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${year}/league/00_full_schedule.json`);
    const json = await response.json();
    return json;
}

/*
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
dateString  date and time in german     String                  "7.10.2023 - 18:00 Uhr"
*/

/* --------------------------------------------------------------------------------------------------
Variables
---------------------------------------------------------------------------------------------------*/
const data = await fetchSchedule("2023");
const games = [];
const template = document.querySelector("template");
const todayEl = document.querySelector("#today");
const today = new Date();

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/
function prepareGameData() {
    data.lscd.forEach(months => {
        months.mscd.g.forEach(game => {
            game.localDate = new Date(Date.parse(game.gdtutc + "T" + game.utctm + "+00:00"));

            let year = game.localDate.getFullYear();
            let month = game.localDate.getMonth() + 1;
            let day = game.localDate.getDate();
            game.hours = game.localDate.getHours().toString().padStart(2, '0');
            game.minutes = game.localDate.getMinutes().toString().padStart(2, '0');

            game.dateString = `${day}.${month}.${year} - ${game.hours}:${game.minutes} Uhr`;

            games.push(game);
        });
    });

    function compareDate(a, b) {
        return a.localDate - b.localDate;
    }

    games.sort(compareDate);
}

function renderTodaysGames() {
    todayEl.innerHTML = "";
    games.forEach(g => {
        if (today.toLocaleDateString("de-DE") == g.localDate.toLocaleDateString("de-DE")) {
            console.log(g.stt)

            const clone = template.content.cloneNode(true);

            const homeTeam = clone.querySelector(".home-team");
            const visitingTeam = clone.querySelector(".visiting-team");
            const homeLogo = clone.querySelectorAll("img")[1];
            const homeAbbr = clone.querySelector(".h-abbr");
            const visitingAbbr = clone.querySelector(".v-abbr");
            const visitingLogo = clone.querySelectorAll("img")[0];
            const homeName = clone.querySelector(".h-name");
            const visitingName = clone.querySelector(".v-name");
            const date = clone.querySelector(".date");

            homeTeam.style.setProperty("background-color", `var(--${g.h.ta})`);
            visitingTeam.style.setProperty("background-color", `var(--${g.v.ta})`);
            homeLogo.src = `img/${g.h.ta}.svg`;
            visitingLogo.src = `img/${g.v.ta}.svg`;
            homeName.textContent = `${g.h.tc} ${g.h.tn}`;
            visitingName.textContent = `${g.v.tc} ${g.v.tn}`;
            homeAbbr.textContent = g.h.ta;
            visitingAbbr.textContent = g.v.ta;
            
            if (g.stt === "Final") {
                date.textContent = `${g.v.s}:${g.h.s}`;
            }
            else {
                date.textContent = `${g.hours}:${g.minutes} Uhr`;
            }
            

            todayEl.appendChild(clone);
        }
    });
}


function init() {
    document.addEventListener("touchstart", function () { }, false);
    prepareGameData();
    renderTodaysGames();
}

/* --------------------------------------------------------------------------------------------------
public members, exposed with return statement
---------------------------------------------------------------------------------------------------*/
window.app = {
    init
};

app.init();
