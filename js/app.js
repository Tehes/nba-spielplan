/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

async function fetchSchedule() {
    const response = await fetch('https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/2023/league/00_full_schedule.json');
    const json = await response.json();
    return json;
}

/* --------------------------------------------------------------------------------------------------
Variables
---------------------------------------------------------------------------------------------------*/
const data = await fetchSchedule();

let games = [];

data.lscd.forEach(months => {
    // objects.push(game.mscd.g)
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

/*
h.ta = short name for home team
h.tn = home team name
h.tc = home team city
v.ta = short name for away team
v.tn = away team name
v.tc = away team city
localDate = time object in local timezone
dateString = date in german format
*/

console.log(games[0].h.ta);
console.log(games[0].h.tn);
console.log(games[0].h.tc);
console.log(games[0].v.ta);
console.log(games[0].v.tn);
console.log(games[0].v.tc);
console.log(games[0].localDate);
console.log(games[0].dateString);

/* --------------------------------------------------------------------------------------------------
functions
---------------------------------------------------------------------------------------------------*/

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
