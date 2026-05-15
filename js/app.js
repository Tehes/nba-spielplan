/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/
import { initServiceWorkerRegistration } from "./service-worker-registration.js";

async function fetchData(url, updateFunction, forceNetwork = false) {
	const cacheName = "nba-data-cache"; // never change "-data-" because its used in cleanup
	const isCoreData = getCoreCacheUrls().has(url);
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
			return true;
		}
	}

	console.log("Fetching from network...");

	try {
		const fetchOptions = forceNetwork ? { cache: "no-store" } : undefined;
		const networkResponse = await fetch(url, fetchOptions);
		if (networkResponse.ok) {
			const clonedResponse = isCoreData ? networkResponse.clone() : null;
			const json = await networkResponse.json();
			console.log("Fresh data fetched:", json);
			if (cache && clonedResponse) {
				cache.put(url, clonedResponse);
			}
			updateFunction(json);
			return true;
		} else {
			throw new Error(`Network error! Status: ${networkResponse.status}`);
		}
	} catch (error) {
		console.error("Fetching fresh data failed:", error);
		markRequestFailed();
		return false;
	}
}

/* --------------------------------------------------------------------------------------------------
Variables
---------------------------------------------------------------------------------------------------*/
// API Endpoints
const API_BASE_URL = "https://nba-spielplan.tehes.deno.net";
const LANGUAGE_STORAGE_KEY = "nba-spielplan_lang";
const LEAGUE_STORAGE_KEY = "nba-spielplan_league";
const SCHEDULE_CACHE_VERSION = "2";
const STANDINGS_CACHE_VERSION = "3";
const SUPPORTED_LANGUAGES = new Set(["de", "en"]);
const LEAGUES = {
	nba: {
		id: "nba",
		label: "NBA",
		query: "",
		storagePrefix: "nba",
		logoPath: "img/NBA",
		colorPrefix: "",
		regularSeasonPrefix: "002",
		totalRegularSeasonGames: 1230,
		recapHost: "nba.com",
		supportsBrackets: true,
	},
	wnba: {
		id: "wnba",
		label: "WNBA",
		query: "?league=wnba",
		storagePrefix: "wnba",
		logoPath: "img/WNBA",
		colorPrefix: "wnba-",
		regularSeasonPrefix: "102",
		totalRegularSeasonGames: 330,
		recapHost: "wnba.com",
		supportsBrackets: false,
	},
};
const SUPPORTED_LEAGUES = new Set(Object.keys(LEAGUES));
const EXCITEMENT_RATING_PROFILES = {
	nba: {
		closeMargin: 5,
		blowoutMargin: 20,
		closenessDenominator: 20,
		bigDeficitThreshold: 10,
		mediumDeficitThreshold: 15,
		largeDeficitThreshold: 20,
		comebackCloseMargin: 3,
		comebackMediumMargin: 6,
		lateCloseMargin: 5,
		lateMediumMargin: 8,
		crunchHighMargin: 3,
		crunchMediumMargin: 7,
		crunchLightMargin: 12,
		crunchSeconds: 300,
		offenseMaxMargin: 10,
		offenseMinTotal: 180,
		offenseRange: 50,
	},
	wnba: {
		closeMargin: 5,
		blowoutMargin: 17,
		closenessDenominator: 17,
		bigDeficitThreshold: 8,
		mediumDeficitThreshold: 13,
		largeDeficitThreshold: 17,
		comebackCloseMargin: 3,
		comebackMediumMargin: 6,
		lateCloseMargin: 5,
		lateMediumMargin: 7,
		crunchHighMargin: 3,
		crunchMediumMargin: 6,
		crunchLightMargin: 10,
		crunchSeconds: 300,
		offenseMaxMargin: 8,
		offenseMinTotal: 150,
		offenseRange: 42,
	},
};
const NBA_DIVISION_ORDER = [
	"Atlantic",
	"Central",
	"Southeast",
	"Northwest",
	"Pacific",
	"Southwest",
];
const LOCALES = {
	de: "de-DE",
	en: "en-US",
};
const MANIFEST_BY_LANGUAGE = {
	de: "manifest.json",
	en: "manifest-en.json",
};
const messages = {
	de: {
		appName: "NBA-Spielplan",
		documentTitle: "NBA-Spielplan – schnell, werbefrei, offlinefähig",
		metaDescription:
			"Alle NBA-Spiele automatisch in deiner Zeitzone – mit Live-Scores und Prime-Time-Filter. Schnell, werbefrei, offline nutzbar. Einfach zum Homescreen hinzufügen und wie eine App starten.",
		ogTitle: "NBA-Spielplan in deiner Zeitzone – schnell, werbefrei, offline nutzbar",
		ogDescription:
			"Alle NBA-Spiele automatisch in deiner Zeitzone – schnell, werbefrei und auch offline nutzbar. Einfach zum Homescreen hinzufügen und wie eine App starten.",
		seasonProgress: "Saisonfortschritt",
		requestWarning: "Einige Daten konnten nicht aktualisiert werden. Bitte versuche es später erneut.",
		todayHeadline: "Heute",
		showScores: "Ergebnisse anzeigen",
		showRating: "Spielbewertung anzeigen",
		info: "Info",
		away: "Gast",
		home: "Heim",
		standingsJump: "Zur Tabelle",
		moreGames: "weitere Spiele",
		allTeams: "Alle Teams",
		hidePastGames: "vergangene Spiele ausblenden",
		primetimeOnly: "Nur Prime-Time-Spiele",
		standingsTeam: "Name",
		standingsHome: "Home",
		standingsAway: "Away",
		overallStandings: "Gesamttabelle",
		showConferenceStandings: "Konferenz-Tabellen anzeigen",
		showDivisionStandings: "Division-Tabellen anzeigen",
		backToTop: "Zurück nach oben",
		overview: "Übersicht",
		boxscore: "Boxscore",
		playByPlay: "Play by Play",
		excitement: "Spannung",
		quarterByQuarter: "Viertelverlauf",
		teamComparison: "Team-Vergleich",
		previousMatchups: "Letzte Duelle",
		twoPoints: "2 Punkte",
		threePoints: "3 Punkte",
		freeThrows: "Freiwürfe",
		rebounds: "Rebounds",
		assists: "Assists",
		steals: "Steals",
		blocks: "Blocks",
		turnovers: "Turnover",
		fouls: "Fouls",
		showMadeShotsOnly: "Zeige nur getroffene Würfe",
		noPlayByPlay: "Keine Play-by-Play-Daten verfügbar.",
		starters: "Starter",
		bench: "Bank",
		notScheduled: "Noch offen",
		timePlaceholder: "HH:MM",
		loading: "Lädt…",
		final: "Beendet",
		noGamesToday: "Heute finden keine Spiele statt.",
		liveSoon: "in Kürze",
		halftime: "Halbzeit",
		endQuarter: "Ende Q{period}",
		endOvertime: "Ende {label}",
		loadingPlays: "Lade Spielaktionen…",
		watchRecap: "Recap auf NBA.com ansehen",
		watchRecapHost: "Recap auf {host} ansehen",
		team: "Team",
		total: "Gesamt",
		jumpToToday: "zu den heutigen Spielen",
		scheduledTime: "{time} Uhr",
		ratingLabel: "Bewertung: {rating}/10 · {verdict}",
		verdictInstantClassic: "Instant Classic",
		verdictMustWatch: "Pflichtprogramm",
		verdictVeryWatchable: "sehr sehenswert",
		verdictWatchable: "sehenswert",
		verdictSolid: "solide",
		verdictLopsided: "eher einseitig",
		verdictHighlightsOnly: "Highlights reichen",
		verdictSkip: "skippen",
	},
	en: {
		appName: "NBA Schedule",
		documentTitle: "NBA Schedule – fast, ad-free, offline-ready",
		metaDescription:
			"All NBA games automatically in your time zone with live scores and a prime-time filter. Fast, ad-free, offline-ready. Add it to your home screen and launch it like an app.",
		ogTitle: "NBA schedule in your time zone – fast, ad-free, offline-ready",
		ogDescription:
			"All NBA games automatically in your time zone with live scores and a prime-time filter. Fast, ad-free, and available offline. Add it to your home screen and launch it like an app.",
		seasonProgress: "Season Progress",
		requestWarning: "Some data could not be updated. Please try again later.",
		todayHeadline: "Today",
		showScores: "Show scores",
		showRating: "Show game rating",
		info: "Info",
		away: "Away",
		home: "Home",
		standingsJump: "Jump to standings",
		moreGames: "More games",
		allTeams: "All teams",
		hidePastGames: "Hide past games",
		primetimeOnly: "Prime-time games only",
		standingsTeam: "Team",
		standingsHome: "Home",
		standingsAway: "Away",
		overallStandings: "Overall standings",
		showConferenceStandings: "Show conference standings",
		showDivisionStandings: "Show division standings",
		backToTop: "Back to top",
		overview: "Overview",
		boxscore: "Boxscore",
		playByPlay: "Play by Play",
		excitement: "Excitement",
		quarterByQuarter: "Quarter by quarter",
		teamComparison: "Team comparison",
		previousMatchups: "Previous matchups",
		twoPoints: "2 Points",
		threePoints: "3 Points",
		freeThrows: "Free throws",
		rebounds: "Rebounds",
		assists: "Assists",
		steals: "Steals",
		blocks: "Blocks",
		turnovers: "Turnovers",
		fouls: "Fouls",
		showMadeShotsOnly: "Show made shots only",
		noPlayByPlay: "No play-by-play data available.",
		starters: "Starters",
		bench: "Bench",
		notScheduled: "TBD",
		timePlaceholder: "HH:MM",
		loading: "Loading…",
		final: "Final",
		noGamesToday: "No games today.",
		liveSoon: "Soon",
		halftime: "Halftime",
		endQuarter: "End Q{period}",
		endOvertime: "End {label}",
		loadingPlays: "Loading play-by-play…",
		watchRecap: "Watch recap on NBA.com",
		watchRecapHost: "Watch recap on {host}",
		team: "Team",
		total: "Total",
		jumpToToday: "jump to today's games",
		scheduledTime: "{time}",
		ratingLabel: "Rating: {rating}/10 · {verdict}",
		verdictInstantClassic: "Instant Classic",
		verdictMustWatch: "must-watch",
		verdictVeryWatchable: "very watchable",
		verdictWatchable: "worth watching",
		verdictSolid: "solid",
		verdictLopsided: "rather one-sided",
		verdictHighlightsOnly: "highlights are enough",
		verdictSkip: "skip it",
	},
};
let currentLanguage = getInitialLanguage();
let currentLocale = getLocale(currentLanguage);
let currentLeague = getInitialLeague();

// Data Holders
let liveById = new Map();
let livePoll = null;
const excitementCache = new Map();

let schedule;
let standings;
let games = {
	today: [],
	finished: [],
	scheduled: [],
};
let istBracket = null;
let playoffBracket = null;

let currentBoxscore = null;
let currentPlayByPlay = null;

let eastData = [];
let westData = [];
let overallData = [];
let divisionsData = {};
let showConferenceStandings = false;
let showDivisionStandings = false;

let standingsOverall;
let standingsEast;
let standingsWest;

const renderedCoreCacheUrls = new Set();
let lastCheckedDay = getCalendarDayKey(new Date());
let requestCycleFailed = false;

// DOM Elements
const todayEl = document.querySelector("#today");
const moreEl = document.querySelector("#more");
const progressValue = document.querySelector("#progress-value");
const requestWarningEl = document.querySelector("#request-warning");
const languagePicker = document.querySelector("#language-picker");
const leagueTabs = document.querySelectorAll("#league-tabs .tab");
const overallStandingsEl = document.querySelector("#overall-standings");
const conferenceStandingsWrapperEl = document.querySelector(".conference-standings-wrapper");
const conferenceStandingsEls = document.querySelectorAll(".conference-standings");
const checkboxConferenceStandings = document.querySelector(".standings-conference-toggle input");
const divisionStandingsEl = document.querySelector("#division-standings");
const divisionStandingsToggleEl = document.querySelector(".standings-division-toggle");
const checkboxDivisionStandings = document.querySelector(".standings-division-toggle input");
const teamPicker = document.querySelector("#team-picker");
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
const previousMatchupsSectionEl = document.querySelector("#previous-matchups-section");
const previousMatchupsEl = document.querySelector("#previous-matchups");
const gameOverlay = document.getElementById("game-overlay");
const gameTabs = gameOverlay.querySelectorAll(".tab");
const gameExcitementEl = document.querySelector("#game-excitement");
const gameExcitementValueEl = document.querySelector("#game-excitement-value");
const gameExcitementLabelEl = document.querySelector("#game-excitement-label");
const gameRecapLinkEl = document.querySelector("#game-recap-link");
const gameRecapAnchorEl = gameRecapLinkEl.querySelector("a");
const cupHeadlineEl = document.querySelector("#cup-headline");
const cupEl = document.querySelector("#cup");
const cupWestEl = document.querySelector("#cup-west");
const cupEastEl = document.querySelector("#cup-east");
const cupFinalEl = document.querySelector("#cup-final");
const playoffsHeadlineEl = document.querySelector("#playoffs-headline");
const playoffsEl = document.querySelector("#playoffs");
const westernEl = document.querySelector("#western");
const easternEl = document.querySelector("#eastern");
const finalsEl = document.querySelector("#finals");
const manifestLink = document.querySelector("#app-manifest");

// Constants
const GAME_MAX_DURATION_MS = (3 * 60 + 15) * 60 * 1000; // 3h 15m
const NEXT_SCHEDULED_GAME_MAX_LOOKAHEAD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const NEXT_SCHEDULED_GAME_GAP_REFRESH_MS = 30 * 60 * 1000; // 30 minutes
const AUTO_REFRESH_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const CUP_FINAL_HIDE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const FORCE_SHOW_CUP_BRACKET = false;

// Load saved states
checkboxPrimetime.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_primetime") || "false",
);

checkboxShowScores.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_showScores") || "true",
);

checkboxShowRating.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_showRating") || "true",
);

checkboxPlayByPlayMadeShots.checked = JSON.parse(
	localStorage.getItem("nba-spielplan_pbp_madeShotsOnly") || "false",
);

function getInitialLanguage() {
	const url = new URL(globalThis.location.href);
	const urlLanguage = url.searchParams.get("lang");

	if (SUPPORTED_LANGUAGES.has(urlLanguage)) {
		return urlLanguage;
	}

	const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
	if (SUPPORTED_LANGUAGES.has(storedLanguage)) {
		return storedLanguage;
	}

	return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

function getInitialLeague() {
	const url = new URL(globalThis.location.href);
	const urlLeague = url.searchParams.get("league");

	if (SUPPORTED_LEAGUES.has(urlLeague)) {
		localStorage.setItem(LEAGUE_STORAGE_KEY, urlLeague);
		return urlLeague;
	}

	const storedLeague = localStorage.getItem(LEAGUE_STORAGE_KEY);
	if (SUPPORTED_LEAGUES.has(storedLeague)) {
		return storedLeague;
	}

	return "nba";
}

function getLocale(language) {
	return LOCALES[language] || LOCALES.de;
}

function getCurrentLeague() {
	return LEAGUES[currentLeague] || LEAGUES.nba;
}

function getLeagueApiUrl(path, leagueId = currentLeague) {
	const league = LEAGUES[leagueId] || LEAGUES.nba;
	return `${API_BASE_URL}${path}${league.query}`;
}

function addApiQueryParam(url, key, value) {
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function getScheduleUrl() {
	return addApiQueryParam(getLeagueApiUrl("/schedule"), "scheduleVersion", SCHEDULE_CACHE_VERSION);
}

function getStandingsUrl() {
	return addApiQueryParam(getLeagueApiUrl("/standings"), "standingsVersion", STANDINGS_CACHE_VERSION);
}

function getScoreboardUrl() {
	return getLeagueApiUrl("/scoreboard");
}

function getBoxscoreUrl(gameId) {
	return getLeagueApiUrl(`/boxscore/${gameId}`);
}

function getPlayByPlayUrl(gameId, leagueId = currentLeague) {
	return getLeagueApiUrl(`/playbyplay/${gameId}`, leagueId);
}

function getExcitementCacheKey(leagueId, gameId) {
	return `${leagueId}:${gameId}`;
}

function getIstBracketUrl() {
	return getLeagueApiUrl("/istbracket");
}

function getPlayoffBracketUrl() {
	return getLeagueApiUrl("/playoffbracket");
}

function getCoreCacheUrls() {
	const urls = [getScheduleUrl(), getStandingsUrl()];

	if (getCurrentLeague().supportsBrackets) {
		urls.push(getIstBracketUrl(), getPlayoffBracketUrl());
	}

	return new Set(urls);
}

function getCoreDataDirtyKey() {
	return `${getCurrentLeague().storagePrefix}_coreDataDirty`;
}

function getNextScheduledGameStorageKey() {
	return `${getCurrentLeague().storagePrefix}_nextScheduledGame`;
}

function getStandingsPreferenceStorageKey(preference) {
	return `${getCurrentLeague().storagePrefix}_${preference}`;
}

function loadStandingsViewPreferences() {
	showConferenceStandings = localStorage.getItem(
		getStandingsPreferenceStorageKey("showConferenceStandings"),
	) === "true";
	showDivisionStandings = localStorage.getItem(
		getStandingsPreferenceStorageKey("showDivisionStandings"),
	) === "true";
}

function storeStandingsViewPreference(preference, value) {
	localStorage.setItem(getStandingsPreferenceStorageKey(preference), String(value));
}

function getTeamColorValue(teamTricode) {
	const league = getCurrentLeague();
	return `var(--${league.colorPrefix}${teamTricode})`;
}

function getTeamLogoSrc(teamTricode) {
	return `${getCurrentLeague().logoPath}/${teamTricode}.svg`;
}

function getBroadcastLabels(game) {
	if (currentLanguage !== "de") {
		return [];
	}

	const labels = new Set();
	const broadcasters = [
		...(game.broadcasters?.intlTvBroadcasters || []),
		...(game.broadcasters?.intlOttBroadcasters || []),
	];

	broadcasters.forEach((broadcaster) => {
		const display = broadcaster.broadcasterDisplay || "";
		const abbreviation = broadcaster.broadcasterAbbreviation || "";

		if (
			display.startsWith("Sky Sport") ||
			abbreviation.startsWith("SKYGermany") ||
			abbreviation.startsWith("SkyGermany")
		) {
			labels.add("Sky");
			return;
		}

		if (display) {
			labels.add(display);
		}
	});

	return Array.from(labels);
}

function getCalendarDayKey(date) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function t(key, replacements = {}) {
	const dictionary = messages[currentLanguage] || messages.de;
	let text = dictionary[key] || messages.de[key] || key;

	Object.entries(replacements).forEach(([name, value]) => {
		text = text.split(`{${name}}`).join(String(value));
	});

	return text;
}

function syncLanguageUrl() {
	const url = new URL(globalThis.location.href);

	if (currentLanguage === "en") {
		url.searchParams.set("lang", "en");
	} else {
		url.searchParams.delete("lang");
	}

	globalThis.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function syncLeagueUrl() {
	const url = new URL(globalThis.location.href);

	if (currentLeague === "nba") {
		url.searchParams.delete("league");
	} else {
		url.searchParams.set("league", currentLeague);
	}

	globalThis.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function applyStaticTranslations() {
	document.documentElement.lang = currentLanguage;

	document.querySelectorAll("[data-i18n]").forEach((element) => {
		element.textContent = t(element.dataset.i18n);
	});

	document.querySelectorAll("[data-i18n-content]").forEach((element) => {
		element.setAttribute("content", t(element.dataset.i18nContent));
	});

	const boxscoreTemplate = document.querySelector("#template-boxscore");
	if (boxscoreTemplate) {
		boxscoreTemplate.content.querySelector(".starters thead th").textContent = t("starters");
		boxscoreTemplate.content.querySelector(".bench thead th").textContent = t("bench");
	}

	if (languagePicker) {
		languagePicker.value = currentLanguage;
	}

	updateLeagueTabs();
	updateStandingsViewControls();
	updateTeamPicker();
	updateGameRecapLink();

	if (manifestLink) {
		manifestLink.setAttribute(
			"href",
			MANIFEST_BY_LANGUAGE[currentLanguage] || MANIFEST_BY_LANGUAGE.de,
		);
	}
}

function rerenderLocalizedUi() {
	lastCheckedDay = getCalendarDayKey(new Date());

	if (schedule) {
		prepareGameData();
		setProgressBar();
		updateTeamPicker();
		renderTodaysGames();
		renderMoreGames();
		updateBrackets();
		renderPreviousMatchups();
		storeNextScheduledGame();
	}

	if (standings) {
		renderStandings();
	}

	if (currentBoxscore) {
		renderBoxscore(currentBoxscore);
	}

	if (currentPlayByPlay) {
		renderPlayByPlay(currentPlayByPlay);
		updateGameExcitementMeter(currentPlayByPlay);
	}
}

function applyLanguage() {
	currentLocale = getLocale(currentLanguage);
	localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
	syncLanguageUrl();
	applyStaticTranslations();
	rerenderLocalizedUi();
}

function setLanguage(language) {
	if (!SUPPORTED_LANGUAGES.has(language) || language === currentLanguage) {
		return;
	}

	currentLanguage = language;
	applyLanguage();
}

function updateLeagueTabs() {
	leagueTabs.forEach((tab) => {
		tab.classList.toggle("is-active", tab.dataset.league === currentLeague);
	});
}

function updateStandingsViewControls() {
	const showOverall = currentLeague === "wnba";
	const showConferences = currentLeague !== "wnba" || showConferenceStandings;
	const showDivisionToggle = currentLeague === "nba";
	const showDivisions = showDivisionToggle && showDivisionStandings;

	overallStandingsEl.classList.toggle("hidden", !showOverall);
	conferenceStandingsWrapperEl.classList.toggle("hidden", !showConferences);
	conferenceStandingsEls.forEach((section) => {
		section.classList.toggle("hidden", !showConferences);
	});
	checkboxConferenceStandings.checked = showConferenceStandings;
	divisionStandingsToggleEl.classList.toggle("hidden", !showDivisionToggle);
	divisionStandingsEl.classList.toggle("hidden", !showDivisions);
	checkboxDivisionStandings.checked = showDivisionStandings;

	standingsWest?.classList.toggle("standings--nba", currentLeague === "nba");
	standingsEast?.classList.toggle("standings--nba", currentLeague === "nba");
}

function resetStandingsRows() {
	document.querySelectorAll(".standings tbody").forEach((tbody) => {
		tbody.replaceChildren();
	});
	divisionStandingsEl.replaceChildren();
}

function resetLeagueData() {
	stopLivePolling();
	liveById = new Map();
	excitementCache.clear();
	schedule = null;
	standings = null;
	games = {
		today: [],
		finished: [],
		scheduled: [],
	};
	istBracket = null;
	playoffBracket = null;
	currentBoxscore = null;
	currentPlayByPlay = null;
	eastData = [];
	westData = [];
	overallData = [];
	divisionsData = {};
	loadStandingsViewPreferences();
	renderedCoreCacheUrls.clear();
	todayEl.replaceChildren();
	moreEl.replaceChildren();
	progressValue.style.width = "0%";
	progressValue.textContent = "0%";
	resetCupBracket();
	resetPlayoffBracket();
	resetStandingsRows();
	updateStandingsViewControls();
	updateTeamPicker();
	if (!gameOverlayEl.classList.contains("hidden")) {
		closeGameOverlay();
	}
}

function setLeague(league) {
	if (!SUPPORTED_LEAGUES.has(league) || league === currentLeague) {
		return;
	}

	currentLeague = league;
	localStorage.setItem(LEAGUE_STORAGE_KEY, currentLeague);
	syncLeagueUrl();
	updateLeagueTabs();
	resetLeagueData();
	globalThis.umami?.track("NBA Schedule", { league: currentLeague });
	loadData();
}

/* --------------------------------------------------------------------------------------------------
PREPARATION
---------------------------------------------------------------------------------------------------*/
function prepareGameData() {
	const allGames = schedule.leagueSchedule.gameDates.flatMap((d) => d.games || []);

	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

	games.today = [];
	games.finished = [];
	games.scheduled = [];

	allGames.forEach((game) => {
		game.localDate = new Date(game.gameDateTimeUTC);

		// Format date and time for display
		if (Number.isNaN(game.localDate.getTime())) {
			game.date = t("notScheduled");
			game.time = t("timePlaceholder");
		} else {
			game.date = game.localDate.toLocaleDateString(currentLocale, {
				weekday: "short",
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
			});
			game.time = game.localDate.toLocaleTimeString(currentLocale, {
				hour: "numeric",
				minute: "2-digit",
			});
		}

		const live = liveById.get(game.gameId);
		const { isPostponed, isFinal, isLive } = getGameState(game, live, now);
		const isToday = game.localDate >= todayStart && game.localDate < tomorrowStart;

		if (isToday || isLive) games.today.push(game);
		else if (isFinal) games.finished.push(game);
		else if (game.localDate >= tomorrowStart && !isPostponed) games.scheduled.push(game);
	});

	games.today.sort((a, b) => a.localDate - b.localDate);
	games.finished.sort((a, b) => a.localDate - b.localDate);
	games.scheduled.sort((a, b) => a.localDate - b.localDate);
}

/* --------------------------------------------------------------------------------------------------
PROGRESS BAR
---------------------------------------------------------------------------------------------------*/
function isRegularSeasonGame(game) {
	return game?.gameId?.startsWith(getCurrentLeague().regularSeasonPrefix) === true;
}

function setProgressBar() {
	const done = (games.finished?.filter((g) => g.gameStatus === 3 && isRegularSeasonGame(g)).length ?? 0) +
		(games.today?.filter((g) => g.gameStatus === 3 && isRegularSeasonGame(g)).length ?? 0);

	const pct = Math.min(100, Math.floor((done * 100) / getCurrentLeague().totalRegularSeasonGames));

	progressValue.style.width = `${pct}%`;
	progressValue.textContent = `${pct}%`;
}

function showRequestWarning() {
	requestWarningEl.classList.remove("hidden");
}

function hideRequestWarning() {
	requestWarningEl.classList.add("hidden");
}

function markRequestFailed() {
	requestCycleFailed = true;
	showRequestWarning();
}

function updateLive(liveJson) {
	const arr = liveJson?.scoreboard?.games ?? [];
	liveById = new Map(arr.map((g) => [g.gameId, g]));
	renderTodaysGames();
	updateBrackets();
	markCoreDataDirtyFromLive();
	storeNextScheduledGame();

	if (!gameOverlayEl.classList.contains("hidden")) {
		updateGameRecapLink();

		const gameId = gameOverlayEl.dataset.gameId;
		const liveGame = liveById.get(gameId);

		if (liveGame?.gameStatus === 2) {
			const bsUrl = getBoxscoreUrl(gameId);
			fetchData(
				bsUrl,
				(json) => {
					currentBoxscore = json;
					renderBoxscore(json);
				},
				true,
			);

			const pbpUrl = getPlayByPlayUrl(gameId);
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

/* --------------------------------------------------------------------------------------------------
NBA CUP
---------------------------------------------------------------------------------------------------*/

function createMatchupNode(series, extraClass, options = {}) {
	const tmpl = document.getElementById("template-matchup");
	const node = tmpl.content.firstElementChild.cloneNode(true);
	if (extraClass) {
		node.classList.add(extraClass);
	}
	node.dataset.round = series?.roundNumber ?? "";

	const teamANameEl = node.querySelector(".teamA .teamname");
	const teamBNameEl = node.querySelector(".teamB .teamname");
	const teamAScoreEl = node.querySelector(".teamA .score");
	const teamBScoreEl = node.querySelector(".teamB .score");
	const scoreMode = options.scoreMode || "game";
	const hasSeries = !!series;

	// Defensive: handle falsy series
	const status = Number(series?.nextGameStatus) || 0;
	const isFinal = status === 3;

	// Logical seeds from API
	const highId = series?.highSeedId;
	const lowId = series?.lowSeedId;
	const highCode = series?.highSeedTricode || "";
	const lowCode = series?.lowSeedTricode || "";

	// Visual bracket position from API
	const topId = series?.displayTopTeam;
	const bottomId = series?.displayBottomTeam;

	let topCode = "";
	let bottomCode = "";
	let topScoreNum = null;
	let bottomScoreNum = null;

	if (hasSeries && topId === highId) {
		// Top row = high seed
		topCode = highCode;
		topScoreNum = scoreMode === "series"
			? Number(series?.highSeedSeriesWins)
			: (isFinal ? Number(series?.highSeedScore) : null);
	} else if (hasSeries && topId === lowId) {
		// Top row = low seed
		topCode = lowCode;
		topScoreNum = scoreMode === "series"
			? Number(series?.lowSeedSeriesWins)
			: (isFinal ? Number(series?.lowSeedScore) : null);
	}

	if (hasSeries && bottomId === lowId) {
		// Bottom row = low seed
		bottomCode = lowCode;
		bottomScoreNum = scoreMode === "series"
			? Number(series?.lowSeedSeriesWins)
			: (isFinal ? Number(series?.lowSeedScore) : null);
	} else if (hasSeries && bottomId === highId) {
		// Bottom row = high seed
		bottomCode = highCode;
		bottomScoreNum = scoreMode === "series"
			? Number(series?.highSeedSeriesWins)
			: (isFinal ? Number(series?.highSeedScore) : null);
	}

	const hasTopScore = Number.isFinite(topScoreNum);
	const hasBottomScore = Number.isFinite(bottomScoreNum);

	teamANameEl.textContent = topCode || "";
	teamANameEl.style.setProperty("background-color", `var(--${topCode})`);

	teamBNameEl.textContent = bottomCode || "";
	teamBNameEl.style.setProperty("background-color", `var(--${bottomCode})`);

	// Show "-" unless we have a valid final score
	teamAScoreEl.textContent = hasTopScore ? topScoreNum : "-";
	teamBScoreEl.textContent = hasBottomScore ? bottomScoreNum : "-";

	// Only compare and mark "lower" for real final scores
	if (hasTopScore && hasBottomScore) {
		if (topScoreNum > bottomScoreNum) {
			teamBScoreEl.classList.add("lower");
		} else if (bottomScoreNum > topScoreNum) {
			teamAScoreEl.classList.add("lower");
		}
	}

	return node;
}

function resetCupBracket() {
	cupWestEl.replaceChildren();
	cupEastEl.replaceChildren();
	cupFinalEl.replaceChildren();
	cupEl.classList.add("hidden");
	cupHeadlineEl.classList.add("hidden");
}

function updateCupBracket() {
	const series = istBracket?.bracket?.istBracketSeries || [];
	if (!series.length) {
		resetCupBracket();
		return;
	}

	const quarterFinals = series.filter((s) => s.roundNumber === 1);
	const semifinals = series.filter((s) => s.roundNumber === 2);
	const finalSeries = series.find((s) => s.roundNumber === 3);

	const allQuarterTeamsDecided = quarterFinals.length === 4 &&
		quarterFinals.every((s) => s.highSeedTricode && s.lowSeedTricode);

	let finalIsTooOld = false;
	if (finalSeries && finalSeries.nextGameDateTimeUTC) {
		const finalDate = new Date(finalSeries.nextGameDateTimeUTC);
		finalIsTooOld = Date.now() - finalDate.getTime() > CUP_FINAL_HIDE_MS;
	}

	if (!allQuarterTeamsDecided || (finalIsTooOld && !FORCE_SHOW_CUP_BRACKET)) {
		resetCupBracket();
		return;
	}

	const eastQuarters = quarterFinals
		.filter((s) => s.seriesConference === "East")
		.sort((a, b) => a.displayOrderNumber - b.displayOrderNumber);
	const westQuarters = quarterFinals
		.filter((s) => s.seriesConference === "West")
		.sort((a, b) => a.displayOrderNumber - b.displayOrderNumber);

	const sortedSemis = semifinals.sort((a, b) => a.displayOrderNumber - b.displayOrderNumber);
	const westSemiSeries = sortedSemis[0] || null;
	const eastSemiSeries = sortedSemis[1] || null;

	// empty the cup bracket first
	cupWestEl.replaceChildren();
	cupEastEl.replaceChildren();
	cupFinalEl.replaceChildren();

	// Show the cup bracket
	cupHeadlineEl.classList.remove("hidden");
	cupEl.classList.remove("hidden");

	// West Column: Quarterfinal – Semifinal – Quarterfinal
	const westTopQuarter = createMatchupNode(westQuarters[0]);
	const westBottomQuarter = createMatchupNode(westQuarters[1]);
	const westSemiNode = createMatchupNode(westSemiSeries, "west-semifinal");
	cupWestEl.appendChild(westTopQuarter);
	cupWestEl.appendChild(westSemiNode);
	cupWestEl.appendChild(westBottomQuarter);

	// East Column: Quarterfinal – Semifinal – Quarterfinal
	const eastTopQuarter = createMatchupNode(eastQuarters[0]);
	const eastBottomQuarter = createMatchupNode(eastQuarters[1]);
	const eastSemiNode = createMatchupNode(eastSemiSeries, "east-semifinal");
	cupEastEl.appendChild(eastTopQuarter);
	cupEastEl.appendChild(eastSemiNode);
	cupEastEl.appendChild(eastBottomQuarter);

	// Final in the middle
	const finalNode = createMatchupNode(finalSeries, "final");
	cupFinalEl.appendChild(finalNode);
}

function resetPlayoffBracket() {
	westernEl.replaceChildren();
	easternEl.replaceChildren();
	finalsEl.replaceChildren();
	playoffsEl.classList.add("hidden");
	playoffsHeadlineEl.classList.add("hidden");
}

function createPlayoffMatchup(series, classes, options = {}) {
	const node = createMatchupNode(series, null, options);
	node.classList.add(...classes);
	return node;
}

function appendPlayoffConference(columnEl, side, firstRoundSeries, semifinals, conferenceFinal) {
	const sortedFirstRound = firstRoundSeries
		.slice()
		.sort((a, b) => a.displayOrderNumber - b.displayOrderNumber);
	const sortedSemifinals = semifinals
		.slice()
		.sort((a, b) => a.displayOrderNumber - b.displayOrderNumber);
	const playoffOptions = { scoreMode: "series" };
	const outerBracketClass = side === "left" ? "outer-bracket-left" : "outer-bracket-right";
	const centerConnectorClass = side === "left" ? "center-connector-left" : "center-connector-right";

	columnEl.appendChild(
		createPlayoffMatchup(
			sortedFirstRound[0],
			["round-1", "pair-a", "slot-top"],
			playoffOptions,
		),
	);
	columnEl.appendChild(
		createPlayoffMatchup(
			sortedSemifinals[0],
			["round-2", "pair-a", "slot-top", "semi-conference-finals", outerBracketClass],
			playoffOptions,
		),
	);
	columnEl.appendChild(
		createPlayoffMatchup(
			sortedFirstRound[1],
			["round-1", "pair-a", "slot-bottom"],
			playoffOptions,
		),
	);
	columnEl.appendChild(
		createPlayoffMatchup(
			conferenceFinal,
			["round-3", "conference-finals", centerConnectorClass],
			playoffOptions,
		),
	);
	columnEl.appendChild(
		createPlayoffMatchup(
			sortedFirstRound[2],
			["round-1", "pair-b", "slot-top"],
			playoffOptions,
		),
	);
	columnEl.appendChild(
		createPlayoffMatchup(
			sortedSemifinals[1],
			["round-2", "pair-b", "slot-bottom", "semi-conference-finals", outerBracketClass],
			playoffOptions,
		),
	);
	columnEl.appendChild(
		createPlayoffMatchup(
			sortedFirstRound[3],
			["round-1", "pair-b", "slot-bottom"],
			playoffOptions,
		),
	);
}

function updatePlayoffBracket() {
	const series = playoffBracket?.bracket?.playoffBracketSeries || [];
	if (!series.length) {
		resetPlayoffBracket();
		return;
	}

	const westFirstRound = series.filter((s) => (
		s.roundNumber === 1 && s.seriesConference === "West"
	));
	const eastFirstRound = series.filter((s) => (
		s.roundNumber === 1 && s.seriesConference === "East"
	));
	const westSemifinals = series.filter((s) => (
		s.roundNumber === 2 && s.seriesConference === "West"
	));
	const eastSemifinals = series.filter((s) => (
		s.roundNumber === 2 && s.seriesConference === "East"
	));
	const westConferenceFinal = series.find((s) => (
		s.roundNumber === 3 && s.seriesConference === "West"
	));
	const eastConferenceFinal = series.find((s) => (
		s.roundNumber === 3 && s.seriesConference === "East"
	));
	const nbaFinals = series.find((s) => s.roundNumber === 4);

	westernEl.replaceChildren();
	easternEl.replaceChildren();
	finalsEl.replaceChildren();
	westernEl.classList.add("conference-west");
	westernEl.classList.remove("conference-east");
	easternEl.classList.add("conference-east");
	easternEl.classList.remove("conference-west");

	playoffsHeadlineEl.classList.remove("hidden");
	playoffsEl.classList.remove("hidden");

	appendPlayoffConference(westernEl, "left", westFirstRound, westSemifinals, westConferenceFinal);
	appendPlayoffConference(
		easternEl,
		"right",
		eastFirstRound,
		eastSemifinals,
		eastConferenceFinal,
	);
	finalsEl.appendChild(createPlayoffMatchup(nbaFinals, ["round-4"], { scoreMode: "series" }));
}

function updateBrackets() {
	if (!getCurrentLeague().supportsBrackets) {
		resetCupBracket();
		resetPlayoffBracket();
		return;
	}

	updateCupBracket();
	updatePlayoffBracket();
}

/* --------------------------------------------------------------------------------------------------
TODAY
---------------------------------------------------------------------------------------------------*/
function renderTodaysGames() {
	todayEl.replaceChildren();

	const now = new Date();
	let needsPolling = false;

	if (games.today.length > 0) {
		games.today.forEach((g) => {
			const live = liveById.get(g.gameId);
			const { isPostponed, isFinal, isLive } = getGameState(g, live, now);
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
			const broadcastLabelEl = clone.querySelector(".broadcast-label");
			const label = g.gameLabel || g.gameSubtype || "";
			const subLabel = g.gameSubLabel;

			// Team UI
			homeTeam.style.setProperty("--team-color", getTeamColorValue(g.homeTeam.teamTricode));
			visitingTeam.style.setProperty("--team-color", getTeamColorValue(g.awayTeam.teamTricode));
			homeLogo.src = getTeamLogoSrc(g.homeTeam.teamTricode);
			homeLogo.onerror = () => (homeLogo.src = "img/no-logo.svg");
			visitingLogo.src = getTeamLogoSrc(g.awayTeam.teamTricode);
			visitingLogo.onerror = () => (visitingLogo.src = "img/no-logo.svg");
			homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`.trim();
			visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`.trim();
			homeAbbr.textContent = g.homeTeam.teamTricode;
			visitingAbbr.textContent = g.awayTeam.teamTricode;

			gameLabelEl.textContent = label ? (subLabel ? `${label} – ${subLabel}` : label) : subLabel;
			broadcastLabelEl.textContent = getBroadcastLabels(g).join(" · ");

			if (isLive) needsPolling = true;

			if (isFinal) {
				// FINAL
				date.classList.remove("live");
				if (checkboxShowRating.checked) {
					const cacheKey = getExcitementCacheKey(currentLeague, g.gameId);
					const cachedScore = excitementCache.get(cacheKey);
					if (cachedScore != null) {
						date.textContent = `${(cachedScore / 10).toFixed(1)}/10`;
					} else {
						date.textContent = t("loading");
						fetchExcitementForGame(g.gameId)
							.then((score) => {
								date.textContent = `${(score / 10).toFixed(1)}/10`;
							})
							.catch(() => {
								date.textContent = t("final");
							});
					}
				} else {
					date.textContent = t("final");
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
				date.textContent = isPostponed ? "PPD" : g.time;
				homeWL.textContent = `${g.homeTeam.wins}-${g.homeTeam.losses}`;
				visitingWL.textContent = `${g.awayTeam.wins}-${g.awayTeam.losses}`;
			}

			// Attach click handler for final or live games
			if (isFinal || isLive) {
				card.dataset.clickable = "true";
				card.addEventListener("click", () => {
					globalThis.umami?.track("NBA Schedule", { todayOverlayClicked: true });
					openGameOverlay(g.gameId, g.awayTeam.teamTricode, g.homeTeam.teamTricode);
				});
			}

			todayEl.appendChild(clone);
		});
	} else {
		todayEl.textContent = t("noGamesToday");
	}

	if (needsPolling) {
		if (!livePoll) fetchLiveOnce();
		startLivePolling();
	} else {
		stopLivePolling();
	}
}

function fetchLiveOnce() {
	fetchData(getScoreboardUrl(), updateLive, true);
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
	const statusText = (live?.gameStatusText || game?.gameStatusText || "").toUpperCase();
	const isPostponed = game?.postponedStatus === "Y" ||
		live?.postponedStatus === "Y" ||
		statusText === "PPD";
	const isFinal = game?.gameStatus === 3 || live?.gameStatus === 3;
	const inLiveWindow = hasValidStart &&
		!isFinal &&
		!isPostponed &&
		now.getTime() >= startMs &&
		now.getTime() < startMs + GAME_MAX_DURATION_MS;
	const isLive = !isFinal && !isPostponed && (live?.gameStatus === 2 || inLiveWindow);

	return { isPostponed, isFinal, isLive, inLiveWindow };
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

// Build a label for live games based on period and gameClock from live scoreboard data
function getLiveLabel(live) {
	if (!live) return "LIVE";

	// Pregame
	if (live.gameStatus === 1) {
		return t("liveSoon");
	}

	const period = Number(live.period);
	const clockStr = formatMinutes(live.gameClock);

	const isOT = period > 4;
	const otIndex = period - 4;
	const otLabel = otIndex === 1 ? "OT" : `OT${otIndex}`;

	// End of periods or OT
	if (clockStr === "0:00") {
		if (period === 2) {
			return t("halftime");
		}
		if (!isOT) {
			return t("endQuarter", { period });
		}
		return t("endOvertime", { label: otLabel });
	}

	// running time of periods
	if (!isOT) {
		return `Q${period} ${clockStr}`;
	}

	// running time of OT
	return `${otLabel} ${clockStr}`;
}

/* --------------------------------------------------------------------------------------------------
GAME EXCITEMENT RATING
---------------------------------------------------------------------------------------------------*/
function computeGameExcitement(playByPlayJson, leagueId = currentLeague) {
	const actions = playByPlayJson?.game?.actions;

	if (!Array.isArray(actions) || actions.length === 0) {
		return 0;
	}

	const profile = EXCITEMENT_RATING_PROFILES[leagueId] || EXCITEMENT_RATING_PROFILES.nba;

	// Helpers
	function computeMarginFactor(margin) {
		if (margin <= profile.closeMargin) return 1;
		if (margin >= profile.blowoutMargin) return 0;
		return 1 - (margin - profile.closeMargin) / (profile.blowoutMargin - profile.closeMargin);
	}

	function computeOvertimeBonus(maxPeriod) {
		const overtimeCount = Math.max(0, maxPeriod - 4);
		if (overtimeCount === 1) return 5;
		if (overtimeCount >= 2) return 10;
		return 0;
	}

	function computeTeamComebackIntensity(teamComeback) {
		if (teamComeback.maxDeficit < profile.bigDeficitThreshold) return 0;
		if (!Number.isFinite(teamComeback.bestDiff)) return 0;

		let sizeFactor = 0;
		if (teamComeback.maxDeficit >= profile.largeDeficitThreshold) {
			sizeFactor = 1;
		} else if (teamComeback.maxDeficit >= profile.mediumDeficitThreshold) {
			sizeFactor = 0.8;
		} else if (teamComeback.maxDeficit >= profile.bigDeficitThreshold) {
			sizeFactor = 0.6;
		}

		let distanceFactor = 0;
		if (teamComeback.bestDiff <= profile.comebackCloseMargin) {
			distanceFactor = 1;
		} else if (teamComeback.bestDiff <= profile.comebackMediumMargin) {
			distanceFactor = 0.6;
		}

		const base = sizeFactor * distanceFactor;
		if (!teamComeback.bestPeriod || teamComeback.bestPeriod < 4) {
			return base * 0.7;
		}
		return base;
	}

	function applyComebackScore(intensity, teamWon, opponentWon, winnerWeight, loserWeight) {
		if (intensity <= 0) return 0;
		if (teamWon) return intensity * winnerWeight;
		if (opponentWon) return intensity * loserWeight;
		return 0; // Fallback
	}

	function updateComebackTracking(comeback, deficit, diff, period, threshold) {
		if (deficit > comeback.maxDeficit) {
			comeback.maxDeficit = deficit;
		}
		if (comeback.maxDeficit >= threshold && diff < comeback.bestDiff) {
			comeback.bestDiff = diff;
			comeback.bestPeriod = period;
		}
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

	const lastEvent = scoringEvents.at(-1);
	const { homeScore: finalHomeScore, awayScore: finalAwayScore } = lastEvent;
	const finalMargin = Math.abs(finalHomeScore - finalAwayScore);
	const marginFactor = computeMarginFactor(finalMargin);

	const comebackHome = {
		maxDeficit: 0,
		bestDiff: Infinity,
		bestPeriod: 0,
	};

	const comebackAway = {
		maxDeficit: 0,
		bestDiff: Infinity,
		bestPeriod: 0,
	};

	let closenessSum = 0;
	let leadChanges = 0;
	let ties = 0;
	let leader = "tie";
	let countHighCrunch = 0;
	let countMediumCrunch = 0;
	let countLightCrunch = 0;
	let totalCrunchEvents = 0;
	let minLateDiff = Infinity;

	scoringEvents.forEach((ev) => {
		const diff = Math.abs(ev.homeScore - ev.awayScore);
		const closeness = Math.max(0, 1 - diff / profile.closenessDenominator);
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

		if (leaderDiff < 0) {
			updateComebackTracking(
				comebackHome,
				-leaderDiff,
				diff,
				ev.period,
				profile.bigDeficitThreshold,
			);
		} else if (leaderDiff > 0) {
			updateComebackTracking(
				comebackAway,
				leaderDiff,
				diff,
				ev.period,
				profile.bigDeficitThreshold,
			);
		}

		if (ev.period >= 4) {
			minLateDiff = Math.min(minLateDiff, diff);
			const secondsRemaining = parseClockToSeconds(ev.clock);
			if (Number.isFinite(secondsRemaining) && secondsRemaining <= profile.crunchSeconds) {
				totalCrunchEvents++;
				if (diff <= profile.crunchHighMargin) {
					countHighCrunch++;
				} else if (diff <= profile.crunchMediumMargin) {
					countMediumCrunch++;
				} else if (diff <= profile.crunchLightMargin) {
					countLightCrunch++;
				}
			}
		}
	});

	const avgCloseness = closenessSum / scoringEvents.length;
	const closenessScore = Math.round(avgCloseness * 40);
	const swingsScore = Math.min(25, leadChanges * 2 + ties);
	const lateGameCloseness = minLateDiff <= profile.lateCloseMargin
		? 1
		: minLateDiff <= profile.lateMediumMargin
		? 0.5
		: 0;

	let crunchTimeScore = 0;
	if (totalCrunchEvents > 0) {
		const ratioHigh = countHighCrunch / totalCrunchEvents;
		const ratioMedium = countMediumCrunch / totalCrunchEvents;
		const ratioLight = countLightCrunch / totalCrunchEvents;
		const crunchScoreRaw = (ratioHigh * 20) + (ratioMedium * 15) + (ratioLight * 8);
		const rawClamped = Math.min(crunchScoreRaw, 20);
		crunchTimeScore = Math.round(rawClamped * 1.25 * (0.7 + 0.3 * marginFactor));
	}

	const homeIntensity = computeTeamComebackIntensity(comebackHome);
	const awayIntensity = computeTeamComebackIntensity(comebackAway);

	const homeWon = finalHomeScore > finalAwayScore;
	const awayWon = finalAwayScore > finalHomeScore;
	const winnerWeight = 1;
	const loserWeight = 0.7;

	let comebackScoreBase = 0;
	comebackScoreBase += applyComebackScore(
		homeIntensity,
		homeWon,
		awayWon,
		winnerWeight,
		loserWeight,
	);
	comebackScoreBase += applyComebackScore(
		awayIntensity,
		awayWon,
		homeWon,
		winnerWeight,
		loserWeight,
	);

	comebackScoreBase = Math.min(1, comebackScoreBase);
	let comebackScore = Math.round(comebackScoreBase * 10);
	const comebackScale = 0.5 + 0.5 * lateGameCloseness;
	comebackScore = Math.round(comebackScore * comebackScale * marginFactor);

	const totalPoints = finalHomeScore + finalAwayScore;

	let offenseScore = 0;
	if (finalMargin <= profile.offenseMaxMargin && totalPoints > profile.offenseMinTotal) {
		const offenseBase = Math.min(5, ((totalPoints - profile.offenseMinTotal) / profile.offenseRange) * 5);
		offenseScore = Math.round(offenseBase * marginFactor);
	}

	const maxPeriod = actions.reduce(
		(max, action) => Math.max(max, Number(action?.period) || 0),
		0,
	);
	const otBonus = computeOvertimeBonus(maxPeriod);

	const rawScore = closenessScore +
		swingsScore +
		crunchTimeScore +
		comebackScore +
		offenseScore +
		otBonus;

	return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function fetchExcitementForGame(gameId) {
	const leagueId = currentLeague;
	const cacheKey = getExcitementCacheKey(leagueId, gameId);

	if (excitementCache.has(cacheKey)) {
		return Promise.resolve(excitementCache.get(cacheKey));
	}

	const url = getPlayByPlayUrl(gameId, leagueId);

	return new Promise((resolve, reject) => {
		fetchData(
			url,
			(pbpJson) => {
				try {
					const score = computeGameExcitement(pbpJson, leagueId);
					excitementCache.set(cacheKey, score);
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
	let verdictKey = "";
	if (score >= 90) {
		verdictKey = "verdictInstantClassic";
	} else if (score >= 80) {
		verdictKey = "verdictMustWatch";
	} else if (score >= 70) {
		verdictKey = "verdictVeryWatchable";
	} else if (score >= 60) {
		verdictKey = "verdictWatchable";
	} else if (score >= 50) {
		verdictKey = "verdictSolid";
	} else if (score >= 40) {
		verdictKey = "verdictLopsided";
	} else if (score >= 30) {
		verdictKey = "verdictHighlightsOnly";
	} else {
		verdictKey = "verdictSkip";
	}

	label = t("ratingLabel", { rating, verdict: t(verdictKey) });
	gameExcitementLabelEl.textContent = label;
	gameExcitementEl.classList.remove("hidden");
}

/* --------------------------------------------------------------------------------------------------
GAME OVERLAY
---------------------------------------------------------------------------------------------------*/

function switchTab(tab) {
	const targetId = tab.dataset.target;
	const targetPanel = gameOverlay.querySelector(`#${targetId}`);

	globalThis.umami?.track("NBA Schedule", { overlayTab: targetId });

	// Toggle tab buttons
	gameOverlay.querySelectorAll(".tab").forEach((t) => {
		t.classList.toggle("is-active", t === tab);
	});

	// Toggle panels
	gameOverlay.querySelectorAll(".panel").forEach((panel) => {
		panel.classList.toggle("is-active", panel === targetPanel);
	});
}

function getNbaRecapUrl(gameId, awayTeamTricode, homeTeamTricode) {
	const away = awayTeamTricode.toLowerCase();
	const home = homeTeamTricode.toLowerCase();

	return `https://www.nba.com/game/${away}-vs-${home}-${gameId}?watchRecap=true`;
}

function getWnbaRecapUrl(gameId) {
	return `https://www.wnba.com/game/${gameId}?watchRecap=true`;
}

function getRecapUrl(gameId, awayTeamTricode, homeTeamTricode) {
	if (currentLeague === "wnba") {
		return getWnbaRecapUrl(gameId);
	}

	return getNbaRecapUrl(gameId, awayTeamTricode, homeTeamTricode);
}

function updateGameRecapLink() {
	const gameId = gameOverlayEl.dataset.gameId;
	const awayTeamTricode = gameOverlayEl.dataset.awayTeam;
	const homeTeamTricode = gameOverlayEl.dataset.homeTeam;
	const allGames = (games.finished ?? []).concat(games.today ?? [], games.scheduled ?? []);
	const game = allGames.find((g) => g.gameId === gameId);
	const live = liveById.get(gameId);
	const { isFinal } = getGameState(game, live);

	if (!gameId || !awayTeamTricode || !homeTeamTricode || !isFinal) {
		gameRecapLinkEl.classList.add("hidden");
		gameRecapAnchorEl.removeAttribute("href");
		return;
	}

	const host = getCurrentLeague().recapHost;
	gameRecapAnchorEl.href = getRecapUrl(gameId, awayTeamTricode, homeTeamTricode);
	gameRecapAnchorEl.textContent = t("watchRecapHost", { host });
	gameRecapLinkEl.classList.remove("hidden");
}

function getScheduleGames() {
	return schedule?.leagueSchedule?.gameDates?.flatMap((date) => date.games || []) || [];
}

function getGameLocalDate(game) {
	const localDate = game?.localDate instanceof Date ? game.localDate : new Date(game?.gameDateTimeUTC);

	if (Number.isNaN(localDate.getTime())) {
		return null;
	}

	return localDate;
}

function renderPreviousMatchups() {
	const gameId = gameOverlayEl.dataset.gameId;
	const currentGame = getScheduleGames().find((game) => game.gameId === gameId);
	const currentDate = getGameLocalDate(currentGame);
	const currentAway = currentGame?.awayTeam?.teamTricode;
	const currentHome = currentGame?.homeTeam?.teamTricode;

	previousMatchupsEl.replaceChildren();

	if (!gameId || !currentGame || !currentDate || !currentAway || !currentHome) {
		previousMatchupsSectionEl.classList.add("hidden");
		return;
	}

	const previousGames = getScheduleGames()
		.filter((game) => {
			const gameDate = getGameLocalDate(game);
			const away = game.awayTeam?.teamTricode;
			const home = game.homeTeam?.teamTricode;
			const isSamePair = (away === currentAway && home === currentHome) ||
				(away === currentHome && home === currentAway);

			return game.gameId !== gameId && gameDate && gameDate < currentDate && isSamePair;
		})
		.sort((a, b) => getGameLocalDate(b) - getGameLocalDate(a));

	if (!previousGames.length) {
		previousMatchupsSectionEl.classList.add("hidden");
		return;
	}

	const template = document.querySelector("#template-previous-matchup");

	previousGames.forEach((game) => {
		const item = template.content.firstElementChild.cloneNode(true);
		const gameDate = getGameLocalDate(game);
		const awayTeam = game.awayTeam;
		const homeTeam = game.homeTeam;
		const awayScore = awayTeam.score;
		const homeScore = homeTeam.score;
		const hasScores = awayScore !== null && awayScore !== undefined && awayScore !== "" &&
			homeScore !== null && homeScore !== undefined && homeScore !== "";

		item.querySelector(".previous-matchup-date").textContent = gameDate.toLocaleDateString(currentLocale, {
			weekday: "short",
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		});

		const awayEl = item.querySelector(".away");
		const homeEl = item.querySelector(".home");
		const awayScoreEl = item.querySelector(".away-score");
		const homeScoreEl = item.querySelector(".home-score");

		awayEl.style.setProperty("--team-color", getTeamColorValue(awayTeam.teamTricode));
		awayEl.querySelector(".abbr").textContent = awayTeam.teamTricode;
		homeEl.style.setProperty("--team-color", getTeamColorValue(homeTeam.teamTricode));
		homeEl.querySelector(".abbr").textContent = homeTeam.teamTricode;

		awayScoreEl.textContent = hasScores ? awayScore : "–";
		homeScoreEl.textContent = hasScores ? homeScore : "–";

		if (hasScores) {
			const awayScoreNumber = Number(awayScore);
			const homeScoreNumber = Number(homeScore);
			if (Number.isFinite(awayScoreNumber) && Number.isFinite(homeScoreNumber)) {
				awayScoreEl.classList.toggle("lower", awayScoreNumber < homeScoreNumber);
				homeScoreEl.classList.toggle("lower", homeScoreNumber < awayScoreNumber);
			}
		}

		previousMatchupsEl.appendChild(item);
	});

	previousMatchupsSectionEl.classList.remove("hidden");
}

function openGameOverlay(gameId, awayTeamTricode, homeTeamTricode) {
	backdropEl.classList.remove("hidden");
	gameOverlayEl.classList.remove("hidden");
	gameOverlayEl.dataset.gameId = gameId;
	gameOverlayEl.dataset.awayTeam = awayTeamTricode || "";
	gameOverlayEl.dataset.homeTeam = homeTeamTricode || "";
	updateGameRecapLink();
	renderPreviousMatchups();

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

	const bsUrl = getBoxscoreUrl(gameId);
	const pbpUrl = getPlayByPlayUrl(gameId);
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
	updateGameRecapLink();
	renderPreviousMatchups();

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
		p.textContent = t("loadingPlays");
		panel.appendChild(p);
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
			item.style.setProperty("--team-color", getTeamColorValue(action.teamTricode));
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
	const homeStats = homeTeam?.statistics || {};
	const awayStats = awayTeam?.statistics || {};

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
		homeBar.style.setProperty("--team-color", getTeamColorValue(homeTeam.teamTricode));
		awayBar.style.setProperty("--team-color", getTeamColorValue(awayTeam.teamTricode));
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
	teamTh.textContent = t("team");
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
	totalTh.textContent = t("total");
	headRow.appendChild(totalTh);

	thead.appendChild(headRow);
	table.appendChild(thead);

	function addTeamRow(team) {
		const row = document.createElement("tr");
		const labelCell = document.createElement("td");
		labelCell.textContent = team.teamTricode;
		row.style.setProperty("--team-color", getTeamColorValue(team.teamTricode));
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
	section.style.setProperty("--team-color", getTeamColorValue(team.teamTricode));

	const teamLogo = section.querySelector(".team-logo");
	const teamName = section.querySelector(".team-name");

	teamLogo.src = getTeamLogoSrc(team.teamTricode);
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

/* --------------------------------------------------------------------------------------------------
MORE GAMES
---------------------------------------------------------------------------------------------------*/

function getTeamsForPicker() {
	const teams = new Map();
	const addTeam = (team) => {
		if (!team?.teamTricode) {
			return;
		}

		teams.set(team.teamTricode, {
			teamTricode: team.teamTricode,
			teamCity: team.teamCity || "",
			teamName: team.teamName || "",
		});
	};

	eastData.forEach(addTeam);
	westData.forEach(addTeam);

	if (!teams.size && schedule?.leagueSchedule?.gameDates) {
		getScheduleGames().forEach((game) => {
			addTeam(game.awayTeam);
			addTeam(game.homeTeam);
		});
	}

	return Array.from(teams.values()).sort((a, b) => {
		const aName = `${a.teamCity} ${a.teamName}`.trim() || a.teamTricode;
		const bName = `${b.teamCity} ${b.teamName}`.trim() || b.teamTricode;
		return aName.localeCompare(bName);
	});
}

function updateTeamPicker() {
	if (!teamPicker) {
		return;
	}

	const selectedTeam = teamPicker.value;
	const teams = getTeamsForPicker();
	teamPicker.replaceChildren();

	const allOption = document.createElement("option");
	allOption.value = "";
	allOption.textContent = t("allTeams");
	teamPicker.appendChild(allOption);

	teams.forEach((team) => {
		const option = document.createElement("option");
		option.value = team.teamTricode;
		option.textContent = `${team.teamCity} ${team.teamName}`.trim() || team.teamTricode;
		teamPicker.appendChild(option);
	});

	if (teams.some((team) => team.teamTricode === selectedTeam)) {
		teamPicker.value = selectedTeam;
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
			if (!(g.localDate instanceof Date) || Number.isNaN(g.localDate.getTime())) {
				return false;
			}

			const gameHour = g.localDate.getHours() + g.localDate.getMinutes() / 60;

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
				anchorLink.textContent = t("jumpToToday");
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
		const broadcastLabelEl = clone.querySelector(".broadcast-label");
		const label = (g.gameLabel || "").trim();
		const subLabel = (g.gameSubLabel || "").trim();

		homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`.trim();
		visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`.trim();
		homeAbbr.textContent = g.homeTeam.teamTricode;
		homeColor.style.setProperty("--team-color", getTeamColorValue(g.homeTeam.teamTricode));
		visitingAbbr.textContent = g.awayTeam.teamTricode;
		visitingColor.style.setProperty("--team-color", getTeamColorValue(g.awayTeam.teamTricode));
		card.dataset.abbr = `${g.awayTeam.teamTricode}/${g.homeTeam.teamTricode}`;
		date.textContent = t("scheduledTime", { time: g.time });
		gameLabelEl.textContent = label ? subLabel ? `${label} – ${subLabel}` : label : subLabel;
		broadcastLabelEl.textContent = getBroadcastLabels(g).join(" · ");

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
				globalThis.umami?.track("NBA Schedule", { moreOverlayClicked: true });
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

/* --------------------------------------------------------------------------------------------------
STANDINGS
---------------------------------------------------------------------------------------------------*/

function getOverallStandingsData() {
	return eastData.concat(westData).slice().sort((a, b) => {
		const aRank = Number(a.playoffRank) || Number.POSITIVE_INFINITY;
		const bRank = Number(b.playoffRank) || Number.POSITIVE_INFINITY;

		if (aRank !== bRank) {
			return aRank - bRank;
		}

		if (b.winPct !== a.winPct) {
			return b.winPct - a.winPct;
		}

		if (b.wins !== a.wins) {
			return b.wins - a.wins;
		}

		if (a.losses !== b.losses) {
			return a.losses - b.losses;
		}

		if (b.diff !== a.diff) {
			return b.diff - a.diff;
		}

		return a.teamTricode.localeCompare(b.teamTricode);
	});
}

function createStandingsTable() {
	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const tbody = document.createElement("tbody");
	const headerRow = document.createElement("tr");
	const headers = [
		"",
		t("standingsTeam"),
		"W-L",
		"GB",
		"STR",
		t("standingsHome"),
		t("standingsAway"),
	];

	table.className = "standings";

	headers.forEach((label) => {
		const th = document.createElement("th");
		th.textContent = label;
		headerRow.appendChild(th);
	});

	thead.appendChild(headerRow);
	table.append(thead, tbody);

	return table;
}

function renderStandingsTable(table, data, options = {}) {
	const rankKey = options.rankKey || null;
	const gbKey = options.gbKey || "gb";
	const tbody = table.querySelector("tbody");
	const rows = data.map((team, index) => {
		const row = document.createElement("tr");
		row.style.setProperty("--team-color", getTeamColorValue(team.teamTricode));

		[
			rankKey ? team[rankKey] || index + 1 : index + 1,
			team.teamTricode,
			`${team.wins}-${team.losses}`,
			team[gbKey] ?? team.gb,
			team.streak,
			team.home,
			team.away,
		].forEach((value) => {
			const cell = document.createElement("td");
			cell.textContent = value;
			row.appendChild(cell);
		});

		return row;
	});

	tbody.replaceChildren(...rows);
}

function renderDivisionStandings() {
	divisionStandingsEl.replaceChildren();

	if (currentLeague !== "nba") {
		return;
	}

	NBA_DIVISION_ORDER.forEach((division) => {
		const data = divisionsData[division];

		if (!data?.length) {
			return;
		}

		const section = document.createElement("div");
		const heading = document.createElement("h3");
		const tableWrapper = document.createElement("div");
		const table = createStandingsTable();

		section.className = "division-standings";
		heading.textContent = division;
		tableWrapper.className = "division-standings-table";

		renderStandingsTable(table, data, {
			rankKey: "divisionRank",
			gbKey: "divisionGb",
		});

		tableWrapper.appendChild(table);
		section.append(heading, tableWrapper);
		divisionStandingsEl.appendChild(section);
	});
}

function renderStandings() {
	const tables = [
		{ table: standingsWest, data: westData },
		{ table: standingsEast, data: eastData },
	];

	updateStandingsViewControls();

	if (!standingsOverall || !standingsWest || !standingsEast) {
		return;
	}

	overallData = getOverallStandingsData();
	renderStandingsTable(standingsOverall, overallData, {
		rankKey: "playoffRank",
		gbKey: "leagueGb",
	});

	tables.forEach(({ table, data }) => {
		renderStandingsTable(table, data);
	});

	renderDivisionStandings();
}

/* --------------------------------------------------------------------------------------------------
DATA HANDLERS
---------------------------------------------------------------------------------------------------*/

function handleScheduleData(json) {
	if (json?.leagueSchedule?.gameDates?.length) {
		schedule = json;

		games = {
			today: [],
			finished: [],
			scheduled: [],
		};

		prepareGameData();
		setProgressBar();
		renderTodaysGames();
		if (games.scheduled.length === 0 && checkboxHidePastGames.checked) {
			checkboxHidePastGames.checked = false;
		}
		renderMoreGames();
		updateBrackets();
		renderPreviousMatchups();
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

	// Store new-format arrays directly
	eastData = standings.east.slice();
	westData = standings.west.slice();
	overallData = getOverallStandingsData();
	divisionsData = standings.divisions || {};

	standingsOverall = document.querySelector("#overall table");
	standingsEast = document.querySelector("#east table");
	standingsWest = document.querySelector("#west table");

	updateTeamPicker();
	renderStandings();
}

function handleIstBracketData(json) {
	if (!json || !json.bracket || !Array.isArray(json.bracket.istBracketSeries)) {
		console.log("IST bracket data not available. Skipping cup bracket rendering.");
		return;
	}

	istBracket = json;
	updateBrackets();
}

function handlePlayoffBracketData(json) {
	if (!json || !json.bracket || !Array.isArray(json.bracket.playoffBracketSeries)) {
		console.log("Playoff bracket data not available. Skipping playoff bracket rendering.");
		return;
	}

	playoffBracket = json;
	updateBrackets();
}

function shouldRerender() {
	const now = new Date();

	const todayString = getCalendarDayKey(now);

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

function markCoreDataDirtyFromLive() {
	const allGames = (games.finished ?? []).concat(games.today ?? [], games.scheduled ?? []);
	const hasLiveFinalMissingInSchedule = allGames.some((game) => {
		const live = liveById.get(game.gameId);
		return live?.gameStatus === 3 && game.gameStatus !== 3;
	});

	if (hasLiveFinalMissingInSchedule) {
		localStorage.setItem(getCoreDataDirtyKey(), "true");
	}
}

function readStoredNextScheduledGame() {
	const storedNextGame = localStorage.getItem(getNextScheduledGameStorageKey());

	if (!storedNextGame) {
		return null;
	}

	try {
		return JSON.parse(storedNextGame);
	} catch (error) {
		console.warn("Stored next scheduled game is invalid. Removing stale cache marker.", error);
		localStorage.removeItem(getNextScheduledGameStorageKey());
		return null;
	}
}

function shouldReloadData() {
	if (localStorage.getItem(getCoreDataDirtyKey()) === "true") {
		console.log("Core data marked stale by live data. Data should be reloaded.");
		return true;
	}

	const nextGame = readStoredNextScheduledGame();

	if (nextGame) {
		const nextGameDate = new Date(nextGame.localDate);
		const now = new Date();

		if (Number.isNaN(nextGameDate.getTime())) {
			localStorage.removeItem(getNextScheduledGameStorageKey());
			console.log("Stored next scheduled game has an invalid date. Data should be reloaded.");
			return true;
		}

		if (nextGameDate.getTime() - now.getTime() > NEXT_SCHEDULED_GAME_MAX_LOOKAHEAD_MS) {
			const refreshAfter = new Date(nextGame.refreshAfter);

			if (Number.isNaN(refreshAfter.getTime()) || now.getTime() >= refreshAfter.getTime()) {
				localStorage.removeItem(getNextScheduledGameStorageKey());
				console.log("Distant next scheduled game cache marker expired. Data should be reloaded.");
				return true;
			}

			console.log("Distant next scheduled game cache marker still valid.");
			return false;
		}

		const maxLiveWindowEndTime = new Date(nextGameDate.getTime() + GAME_MAX_DURATION_MS);

		console.log(
			`Next game: ${
				nextGameDate.toLocaleString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				})
			} | Max live window end: ${
				maxLiveWindowEndTime.toLocaleTimeString("de-DE", {
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

		if (now > maxLiveWindowEndTime) {
			console.log(
				"Next scheduled game exceeded max live window. Data should be reloaded.",
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
		games.today,
	).filter((game) => {
		const live = liveById.get(game.gameId);
		const { isPostponed, isFinal } = getGameState(game, live);
		return !isPostponed && !isFinal;
	});

	if (allScheduledGames.length === 0) {
		localStorage.removeItem(getNextScheduledGameStorageKey());
		return;
	}

	const nextGame = allScheduledGames.reduce((soonest, game) => {
		const gameDate = new Date(game.localDate);
		return gameDate < new Date(soonest.localDate) ? game : soonest;
	});
	const nextGameDate = new Date(nextGame.localDate);
	const now = Date.now();
	const storedNextGame = { ...nextGame };

	if (nextGameDate.getTime() - now > NEXT_SCHEDULED_GAME_MAX_LOOKAHEAD_MS) {
		storedNextGame.refreshAfter = new Date(now + NEXT_SCHEDULED_GAME_GAP_REFRESH_MS).toISOString();
		localStorage.setItem(getNextScheduledGameStorageKey(), JSON.stringify(storedNextGame));
		console.log("Next scheduled game is too far ahead. Storing short-lived cache marker.");
		return;
	}

	localStorage.setItem(getNextScheduledGameStorageKey(), JSON.stringify(storedNextGame));
}

async function loadData() {
	requestCycleFailed = false;

	const scheduleLoaded = await fetchData(getScheduleUrl(), handleScheduleData);
	if (scheduleLoaded) {
		markCoreDataDirtyFromLive();
	}
	await fetchData(getStandingsUrl(), handleStandingsData);

	if (getCurrentLeague().supportsBrackets) {
		await fetchData(getIstBracketUrl(), handleIstBracketData);
		await fetchData(getPlayoffBracketUrl(), handlePlayoffBracketData);
	} else {
		resetCupBracket();
		resetPlayoffBracket();
	}

	let canStoreNextScheduledGame = scheduleLoaded;
	const shouldRefreshCoreData = shouldReloadData();

	if (shouldRefreshCoreData) {
		const scheduleReloaded = await fetchData(getScheduleUrl(), handleScheduleData, true);
		canStoreNextScheduledGame = scheduleReloaded;
		if (scheduleReloaded) {
			localStorage.removeItem(getCoreDataDirtyKey());
			markCoreDataDirtyFromLive();
		}
		await fetchData(getStandingsUrl(), handleStandingsData, true);
	}

	if (getCurrentLeague().supportsBrackets) {
		await fetchData(getIstBracketUrl(), handleIstBracketData, true);
		await fetchData(getPlayoffBracketUrl(), handlePlayoffBracketData, true);
	}

	if (canStoreNextScheduledGame) {
		storeNextScheduledGame();
	}

	if (!requestCycleFailed) {
		hideRequestWarning();
	}
}

function init() {
	loadStandingsViewPreferences();
	applyLanguage();
	globalThis.umami?.track("NBA Schedule", {
		league: currentLeague,
		language: currentLanguage,
		showScores: checkboxShowScores.checked,
		showExcitementRating: checkboxShowRating.checked,
		hidePastGames: checkboxHidePastGames.checked,
		primeTimeOnly: checkboxPrimetime.checked,
		showConferenceStandings,
		showDivisionStandings,
	});
	backdropEl.addEventListener("click", closeGameOverlay);
	gameOverlayCloseBtn.addEventListener("click", closeGameOverlay);
	gameTabs.forEach((tab) => {
		tab.addEventListener("click", () => switchTab(tab));
	});
	document.addEventListener("touchstart", function () {}, false);
	languagePicker.addEventListener("change", () => {
		setLanguage(languagePicker.value);
	});
	leagueTabs.forEach((tab) => {
		tab.addEventListener("click", () => {
			setLeague(tab.dataset.league);
		});
	});
	checkboxConferenceStandings.addEventListener("change", () => {
		showConferenceStandings = checkboxConferenceStandings.checked;
		storeStandingsViewPreference("showConferenceStandings", showConferenceStandings);
		updateStandingsViewControls();
	});
	checkboxDivisionStandings.addEventListener("change", () => {
		showDivisionStandings = checkboxDivisionStandings.checked;
		storeStandingsViewPreference("showDivisionStandings", showDivisionStandings);
		updateStandingsViewControls();
	});
	teamPicker.addEventListener("change", () => {
		globalThis.umami?.track("NBA Schedule", {
			league: currentLeague,
			teamPicker: teamPicker.value || "all",
		});
		renderMoreGames();
	});
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
		if (shouldRerender() || shouldReloadData()) {
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
const SERVICE_WORKER_VERSION = "2026-05-16-v1";
const AUTO_RELOAD_ON_SW_UPDATE = true;

initServiceWorkerRegistration({
	useServiceWorker: USE_SERVICE_WORKER,
	serviceWorkerVersion: SERVICE_WORKER_VERSION,
	autoReloadOnUpdate: AUTO_RELOAD_ON_SW_UPDATE,
});
