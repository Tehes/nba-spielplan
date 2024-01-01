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
const mainEl = document.querySelector("main");


/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/
data.lscd.forEach(months => {
    months.mscd.g.forEach(game => {
        /*
        date in UTC = gdtutc
        time in UTC = utctm
        */
        game.localDate = new Date(Date.parse(game.gdtutc + "T" + game.utctm + "+00:00"));

        let year = game.localDate.getFullYear();
        let month = game.localDate.getMonth() + 1;
        let day = game.localDate.getDate();
        let hours = game.localDate.getHours().toString().padStart(2, '0');
        let minutes = game.localDate.getMinutes().toString().padStart(2, '0');

        game.dateString = `${day}.${month}.${year} - ${hours}:${minutes} Uhr`;

        games.push(game);
    });
});

function compareDate(a, b) {
    return a.localDate - b.localDate;
}

games.sort(compareDate);

games.forEach(g => {
    const clone = template.content.cloneNode(true);

    const homeLogo = clone.querySelectorAll("img")[1];
    const visitingLogo = clone.querySelectorAll("img")[0];
    const visitingTeam = clone.querySelector(".visiting-team");
    const homeTeam = clone.querySelector(".home-team");
    const date = clone.querySelector(".date")

    homeLogo.src = `img/${g.h.ta}.svg`;
    visitingLogo.src = `img/${g.v.ta}.svg`;
    homeTeam.textContent = `${g.h.tc} ${g.h.tn}`;
    visitingTeam.textContent = `${g.v.tc} ${g.v.tn}`;
    date.textContent = g.dateString;

    mainEl.appendChild(clone);
});

function init() {
    document.addEventListener("touchstart", function () { }, false);
}

/* --------------------------------------------------------------------------------------------------
public members, exposed with return statement
---------------------------------------------------------------------------------------------------*/
window.app = {
    init
};

app.init();
