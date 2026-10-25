/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/
import {
	API_BASE_URL,
	BUCKETS_URL,
	getBroadcastLabels,
	getLiveLabel,
	LEAGUE_STORAGE_KEY,
	LEAGUES,
	LOCALES,
	MANIFEST_BY_LANGUAGE,
	messages,
	MODE_STORAGE_KEY,
	MODES,
	SCHEDULE_CACHE_VERSION,
	STANDINGS_CACHE_VERSION,
	SUPPORTED_LEAGUES,
	SUPPORTED_MODES,
} from "./game-shared.js";
import { getGamePageUrl } from "./game-links.js";
import { setTeamLogo } from "./team-logos.js";
import { computeGameExcitement } from "./excitement.js";
import { initServiceWorkerRegistration, SERVICE_WORKER_CONFIG } from "./service-worker-registration.js";

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
const NBA_DIVISION_ORDER = [
	"Atlantic",
	"Central",
	"Southeast",
	"Northwest",
	"Pacific",
	"Southwest",
];
let currentMode = getInitialMode();
let currentLanguage = getModeLanguage(currentMode);
let currentLocale = getLocale(currentLanguage);
let currentLeague = getInitialLeague();
let currentBroadcastRegion = getModeBroadcastRegion(currentMode);

// Data Holders
let liveById = new Map();
let livePoll = null;
const excitementCache = new Map();
const topExcitementByLeague = new Map();

let schedule;
let standings;
let activeSeason = null;
let games = {
	today: [],
	finished: [],
	scheduled: [],
};
let istBracket = null;
let playoffBracket = null;

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
let selectedDay = getInitialSelectedDay();
const selectedBroadcasters = new Set();
let broadcasterSelectionOnOpen = null;

// DOM Elements
const todayHeadlineEl = document.querySelector("#today-headline");
const todayPrevButton = document.querySelector("#today-prev");
const todayNextButton = document.querySelector("#today-next");
const todayEl = document.querySelector("#today");
const todayInfoEl = document.querySelector("#info");
const moreEl = document.querySelector("#more");
const topExcitementHeadlineEl = document.querySelector("#top-excitement-headline");
const topExcitementEl = document.querySelector("#top-excitement");
const progressValue = document.querySelector("#progress-value");
const requestWarningEl = document.querySelector("#request-warning");
const modePicker = document.querySelector("#mode-picker");
const leagueTabs = document.querySelectorAll("#league-tabs .tab");
const overallStandingsEl = document.querySelector("#overall-standings");
const conferenceStandingsWrapperEl = document.querySelector(".conference-standings-wrapper");
const conferenceStandingsEls = document.querySelectorAll(".conference-standings");
const checkboxConferenceStandings = document.querySelector(".standings-conference-toggle input");
const divisionStandingsEl = document.querySelector("#division-standings");
const divisionStandingsToggleEl = document.querySelector(".standings-division-toggle");
const checkboxDivisionStandings = document.querySelector(".standings-division-toggle input");
const teamPicker = document.querySelector("#team-picker");
const broadcasterPicker = document.querySelector("#broadcaster-picker");
const broadcasterSummary = broadcasterPicker.querySelector("summary span");
const broadcasterList = broadcasterPicker.querySelector(".broadcaster-list");
const broadcasterResetButton = broadcasterPicker.querySelector("button");
const broadcasterOptionTemplate = document.querySelector("#template-broadcaster-option");
const checkboxShowScores = document.querySelector(".show-scores input");
const checkboxShowRating = document.querySelector(".show-rating input");
const checkboxHidePastGames = document.querySelector(".hide-past-games input");
const checkboxPrimetime = document.querySelector(".filter-primetime input");
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

function getInitialMode() {
	const url = new URL(globalThis.location.href);
	const urlMode = url.searchParams.get("mode");

	if (SUPPORTED_MODES.has(urlMode)) {
		return urlMode;
	}

	const storedMode = localStorage.getItem(MODE_STORAGE_KEY);
	if (SUPPORTED_MODES.has(storedMode)) {
		return storedMode;
	}

	return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en-us";
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

function getInitialSelectedDay() {
	const date = new URL(globalThis.location.href).searchParams.get("date");
	if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
		const day = new Date(`${date}T00:00:00`);
		if (!Number.isNaN(day.getTime()) && getCalendarDayKey(day) === date) {
			return day;
		}
	}
	return getStartOfCalendarDay(new Date());
}

function getLocale(language) {
	return LOCALES[language] || LOCALES.de;
}

function getModeLanguage(mode) {
	return MODES[mode]?.language || MODES.de.language;
}

function getModeBroadcastRegion(mode) {
	return MODES[mode]?.broadcastRegion || MODES.de.broadcastRegion;
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

function addActiveSeasonQuery(url) {
	return activeSeason ? addApiQueryParam(url, "season", activeSeason) : url;
}

function getScheduleUrl() {
	const scheduleUrl = addApiQueryParam(getLeagueApiUrl("/schedule"), "region", currentBroadcastRegion);
	return addApiQueryParam(scheduleUrl, "scheduleVersion", SCHEDULE_CACHE_VERSION);
}

function getStandingsUrl() {
	const standingsUrl = addApiQueryParam(
		getLeagueApiUrl("/standings"),
		"standingsVersion",
		STANDINGS_CACHE_VERSION,
	);
	return addActiveSeasonQuery(standingsUrl);
}

function getScoreboardUrl() {
	return getLeagueApiUrl("/scoreboard");
}

function getPlayByPlayUrl(gameId, leagueId = currentLeague) {
	return getLeagueApiUrl(`/playbyplay/${gameId}`, leagueId);
}

function getBackfillExcitementUrl(leagueId = currentLeague) {
	return getLeagueApiUrl("/backfill-excitement", leagueId);
}

function getFetchExcitementUrl(leagueId = currentLeague) {
	return getLeagueApiUrl("/fetch-excitement", leagueId);
}

function getTopExcitementUrl(leagueId = currentLeague) {
	return addApiQueryParam(getLeagueApiUrl("/top-excitement", leagueId), "limit", "10");
}

function getExcitementCacheKey(leagueId, gameId) {
	return `${leagueId}:${gameId}`;
}

function getIstBracketUrl() {
	return addActiveSeasonQuery(getLeagueApiUrl("/istbracket"));
}

function getPlayoffBracketUrl() {
	return addActiveSeasonQuery(getLeagueApiUrl("/playoffbracket"));
}

function getCoreCacheUrls() {
	const urls = [getScheduleUrl(), getStandingsUrl()];

	if (getCurrentLeague().supportsIstBracket) {
		urls.push(getIstBracketUrl());
	}
	if (getCurrentLeague().supportsPlayoffBracket) {
		urls.push(getPlayoffBracketUrl());
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

function getCalendarDayKey(date) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function getStartOfCalendarDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarDays(date, days) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameCalendarDay(a, b) {
	return getCalendarDayKey(a) === getCalendarDayKey(b);
}

function getCalendarDayTime(date) {
	return getStartOfCalendarDay(date).getTime();
}

function hasValidLocalDate(game) {
	return game?.localDate instanceof Date && !Number.isNaN(game.localDate.getTime());
}

function t(key, replacements = {}) {
	const dictionary = messages[currentLanguage] || messages.de;
	let text = dictionary[key] || messages.de[key] || key;

	Object.entries(replacements).forEach(([name, value]) => {
		text = text.split(`{${name}}`).join(String(value));
	});

	return text;
}

function getScheduleDateBounds() {
	let min = null;
	let max = null;

	getScheduleGames().forEach((game) => {
		if (!hasValidLocalDate(game)) {
			return;
		}

		const day = getStartOfCalendarDay(game.localDate);

		if (!min || day < min) {
			min = day;
		}
		if (!max || day > max) {
			max = day;
		}
	});

	return { min, max };
}

function isSelectedDayToday() {
	return isSameCalendarDay(selectedDay, new Date());
}

function formatSelectedDayHeadline() {
	const today = getStartOfCalendarDay(new Date());

	if (isSameCalendarDay(selectedDay, today)) {
		return t("todayHeadline");
	}
	if (isSameCalendarDay(selectedDay, addCalendarDays(today, -1))) {
		return t("yesterdayHeadline");
	}
	if (isSameCalendarDay(selectedDay, addCalendarDays(today, 1))) {
		return t("tomorrowHeadline");
	}

	return selectedDay.toLocaleDateString(currentLocale, {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

function updateTodayNavigation() {
	if (!todayHeadlineEl || !todayPrevButton || !todayNextButton) {
		return;
	}

	const { min, max } = getScheduleDateBounds();
	const selectedTime = selectedDay.getTime();

	todayHeadlineEl.textContent = formatSelectedDayHeadline();
	todayPrevButton.title = t("previousDay");
	todayNextButton.title = t("nextDay");
	todayPrevButton.disabled = !min || selectedTime <= min.getTime();
	todayNextButton.disabled = !max || selectedTime >= max.getTime();
}

function resetSelectedDay() {
	selectedDay = getStartOfCalendarDay(new Date());
	syncSelectedDayUrl();
	updateTodayNavigation();
}

function moveSelectedDay(days) {
	const { min, max } = getScheduleDateBounds();

	if (!min || !max) {
		return;
	}

	const nextDay = addCalendarDays(selectedDay, days);

	if (days < 0 && nextDay.getTime() < min.getTime()) {
		return;
	}
	if (days > 0 && nextDay.getTime() > max.getTime()) {
		return;
	}

	selectedDay = nextDay;
	syncSelectedDayUrl();
	renderTodaysGames();
	renderMoreGames();
}

function sortGamesByLocalDate(gamesToSort) {
	return gamesToSort.slice().sort((a, b) => a.localDate - b.localDate);
}

function getSelectedDayGames() {
	if (isSelectedDayToday()) {
		return sortGamesByLocalDate(games.today);
	}

	const selectedDayKey = getCalendarDayKey(selectedDay);
	const dayGames = getScheduleGames().filter((game) => {
		return hasValidLocalDate(game) && getCalendarDayKey(game.localDate) === selectedDayKey;
	});

	return sortGamesByLocalDate(dayGames);
}

function getMoreViewGames() {
	const selectedDayTime = selectedDay.getTime();
	const selectedGameIds = new Set(getSelectedDayGames().map((game) => game.gameId));
	let gamesToDisplay = games.finished.concat(games.today, games.scheduled).filter((game) => {
		return hasValidLocalDate(game) &&
			!selectedGameIds.has(game.gameId) &&
			getCalendarDayTime(game.localDate) !== selectedDayTime;
	});

	if (checkboxHidePastGames.checked) {
		gamesToDisplay = gamesToDisplay.filter((game) => {
			return getCalendarDayTime(game.localDate) > selectedDayTime;
		});
	}

	if (checkboxPrimetime.checked) {
		gamesToDisplay = gamesToDisplay.filter((g) => {
			const gameHour = g.localDate.getHours() + g.localDate.getMinutes() / 60;

			// Primetime
			return gameHour >= 18 && gameHour < 24;
		});
	}

	if (selectedBroadcasters.size) {
		gamesToDisplay = gamesToDisplay.filter((game) => {
			return getBroadcastLabels(game, currentBroadcastRegion, currentLanguage)
				.some((provider) => selectedBroadcasters.has(provider));
		});
	}

	return sortGamesByLocalDate(gamesToDisplay);
}

function shouldPollLiveGames(now) {
	return games.today.some((game) => {
		const live = liveById.get(game.gameId);
		const { isLive } = getGameState(game, live, now);
		return isLive;
	});
}

function syncModeUrl() {
	const url = new URL(globalThis.location.href);
	url.searchParams.set("mode", currentMode);
	url.searchParams.delete("lang");
	url.searchParams.delete("region");

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

function syncSelectedDayUrl() {
	const url = new URL(globalThis.location.href);
	if (isSelectedDayToday()) {
		url.searchParams.delete("date");
	} else {
		url.searchParams.set("date", getCalendarDayKey(selectedDay));
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

	if (modePicker) {
		modePicker.value = currentMode;
	}

	updateLeagueTabs();
	updateStandingsViewControls();
	updateTeamPicker();

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
		updateBroadcasterPicker();
		setProgressBar();
		updateTeamPicker();
		renderTodaysGames();
		renderMoreGames();
		renderTopExcitementGames();
		updateBrackets();
		storeNextScheduledGame();
	}

	if (standings) {
		renderStandings();
	}
}

function applyMode() {
	currentLanguage = getModeLanguage(currentMode);
	currentBroadcastRegion = getModeBroadcastRegion(currentMode);
	currentLocale = getLocale(currentLanguage);
	localStorage.setItem(MODE_STORAGE_KEY, currentMode);
	syncModeUrl();
	syncSelectedDayUrl();
	applyStaticTranslations();
	rerenderLocalizedUi();
}

function setMode(mode) {
	if (!SUPPORTED_MODES.has(mode) || mode === currentMode) {
		return;
	}

	selectedBroadcasters.clear();
	broadcasterSelectionOnOpen = null;
	broadcasterPicker.open = false;
	const previousScheduleUrl = getScheduleUrl();
	currentMode = mode;
	applyMode();

	if (getScheduleUrl() !== previousScheduleUrl) {
		resetLeagueData();
		loadData();
	}
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

function getScheduleSeason(scheduleJson) {
	return scheduleJson?.leagueSchedule?.seasonYear || scheduleJson?.meta?.seasonYear || null;
}

function getValidScheduleGames(scheduleJson) {
	const dates = scheduleJson?.leagueSchedule?.gameDates ?? [];

	return dates.flatMap((date) => date.games ?? []).filter((game) => {
		const gameDate = new Date(game?.gameDateTimeUTC);
		return typeof game?.gameId === "string" &&
			game.gameId.length > 0 &&
			!Number.isNaN(gameDate.getTime());
	});
}

function isCurrentSeasonResponse(json) {
	return typeof json?.season === "string" && (!activeSeason || json.season === activeSeason);
}

function resetSeasonDependentData() {
	standings = null;
	istBracket = null;
	playoffBracket = null;
	eastData = [];
	westData = [];
	overallData = [];
	divisionsData = {};
	excitementCache.clear();
	topExcitementByLeague.delete(currentLeague);
	resetStandingsRows();
	resetTopExcitementSection();
	resetCupBracket();
	resetPlayoffBracket();
	updateStandingsViewControls();
}

function resetLeagueData() {
	selectedBroadcasters.clear();
	broadcasterSelectionOnOpen = null;
	broadcasterPicker.open = false;
	stopLivePolling();
	liveById = new Map();
	excitementCache.clear();
	topExcitementByLeague.clear();
	schedule = null;
	updateBroadcasterPicker();
	standings = null;
	activeSeason = null;
	games = {
		today: [],
		finished: [],
		scheduled: [],
	};
	istBracket = null;
	playoffBracket = null;
	eastData = [];
	westData = [];
	overallData = [];
	divisionsData = {};
	resetSelectedDay();
	loadStandingsViewPreferences();
	renderedCoreCacheUrls.clear();
	todayEl.replaceChildren();
	moreEl.replaceChildren();
	resetTopExcitementSection();
	progressValue.style.width = "0%";
	progressValue.textContent = "";
	resetCupBracket();
	resetPlayoffBracket();
	resetStandingsRows();
	updateStandingsViewControls();
	updateTeamPicker();
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
	globalThis.umami?.track("Schedule", { action: "leagueChange", league: currentLeague });
	startExcitementBackfill(currentLeague);
	loadData();
}

/* --------------------------------------------------------------------------------------------------
PREPARATION
---------------------------------------------------------------------------------------------------*/
function prepareGameData() {
	const allGames = schedule.leagueSchedule.gameDates.flatMap((d) => d.games || []);

	const now = new Date();
	const todayStart = getStartOfCalendarDay(now);
	const tomorrowStart = addCalendarDays(todayStart, 1);

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

function isPostseasonGame(game) {
	return getCurrentLeague().postseasonPrefixes.some((prefix) => {
		return game?.gameId?.startsWith(prefix) === true;
	});
}

function getTeamRecordLabel(team) {
	return `${team.wins}-${team.losses}`;
}

function getTeamMetaLabel(game, team, preferPostseasonSeed = false) {
	if (preferPostseasonSeed && !checkboxShowScores.checked && isPostseasonGame(game)) {
		const seed = Number(team?.seed);
		return seed > 0 ? `#${seed}` : getTeamRecordLabel(team);
	}

	return getTeamRecordLabel(team);
}

function renderTeamMetaLabels(game, homeWL, visitingWL, preferPostseasonSeed = false) {
	homeWL.textContent = getTeamMetaLabel(game, game.homeTeam, preferPostseasonSeed);
	visitingWL.textContent = getTeamMetaLabel(game, game.awayTeam, preferPostseasonSeed);
}

function getRegularSeasonProgressPercentage() {
	const teamCount = eastData.length + westData.length;
	if (teamCount === 0) {
		return null;
	}

	const done = (games.finished?.filter((g) => g.gameStatus === 3 && isRegularSeasonGame(g)).length ?? 0) +
		(games.today?.filter((g) => g.gameStatus === 3 && isRegularSeasonGame(g)).length ?? 0);
	const total = teamCount * getCurrentLeague().regularSeasonGamesPerTeam / 2;

	return Math.min(100, Math.floor((done * 100) / total));
}

function setProgressBar() {
	const pct = getRegularSeasonProgressPercentage();
	if (pct === null) {
		progressValue.style.width = "0%";
		progressValue.textContent = "";
		return;
	}

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

	const hasTopScore = Boolean(topCode) && Number.isFinite(topScoreNum);
	const hasBottomScore = Boolean(bottomCode) && Number.isFinite(bottomScoreNum);

	teamANameEl.textContent = topCode || "";
	if (topCode) {
		teamANameEl.style.setProperty("background-color", getTeamColorValue(topCode));
	}

	teamBNameEl.textContent = bottomCode || "";
	if (bottomCode) {
		teamBNameEl.style.setProperty("background-color", getTeamColorValue(bottomCode));
	}

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
	delete playoffsEl.dataset.bracketLayout;
	playoffsEl.classList.add("hidden");
	playoffsHeadlineEl.classList.add("hidden");
}

function createPlayoffMatchup(series, classes, options = {}) {
	const node = createMatchupNode(series, null, options);
	node.classList.add(...classes);
	return node;
}

function appendPlayoffSide(columnEl, side, firstRoundSeries, semifinals, finalSeries) {
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
			finalSeries,
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

	westernEl.replaceChildren();
	easternEl.replaceChildren();
	finalsEl.replaceChildren();
	westernEl.classList.add("conference-west");
	westernEl.classList.remove("conference-east");

	if (currentLeague === "wnba") {
		const firstRound = series.filter((s) => s.roundNumber === 1);
		const semifinals = series.filter((s) => s.roundNumber === 2);
		const wnbaFinals = series.find((s) => s.roundNumber === 3);

		playoffsEl.dataset.bracketLayout = "single-side";
		appendPlayoffSide(westernEl, "left", firstRound, semifinals, wnbaFinals);
		playoffsHeadlineEl.classList.remove("hidden");
		playoffsEl.classList.remove("hidden");
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

	delete playoffsEl.dataset.bracketLayout;
	easternEl.classList.add("conference-east");
	easternEl.classList.remove("conference-west");

	playoffsHeadlineEl.classList.remove("hidden");
	playoffsEl.classList.remove("hidden");

	appendPlayoffSide(westernEl, "left", westFirstRound, westSemifinals, westConferenceFinal);
	appendPlayoffSide(
		easternEl,
		"right",
		eastFirstRound,
		eastSemifinals,
		eastConferenceFinal,
	);
	finalsEl.appendChild(createPlayoffMatchup(nbaFinals, ["round-4"], { scoreMode: "series" }));
}

function updateBrackets() {
	if (getCurrentLeague().supportsIstBracket) {
		updateCupBracket();
	} else {
		resetCupBracket();
	}

	if (getCurrentLeague().supportsPlayoffBracket) {
		updatePlayoffBracket();
	} else {
		resetPlayoffBracket();
	}
}

/* --------------------------------------------------------------------------------------------------
TODAY
---------------------------------------------------------------------------------------------------*/
function renderEmptyTodayState() {
	const template = document.querySelector("#template-empty-today");
	const clone = template.content.cloneNode(true);
	const emptyState = clone.querySelector(".empty-state");
	const textEl = clone.querySelector(".empty-state-text");
	const ctaEl = clone.querySelector(".empty-state .action-link");

	emptyState.querySelector(".empty-state-title").textContent = isSelectedDayToday()
		? t("noGamesToday")
		: t("noGamesSelectedDay");
	textEl.textContent = t("emptyStateLead");
	ctaEl.href = BUCKETS_URL;
	ctaEl.textContent = t("emptyStateCta");

	todayEl.appendChild(clone);
}

function renderTodaysGames() {
	todayEl.replaceChildren();
	updateTodayNavigation();

	const now = new Date();
	const selectedGames = getSelectedDayGames();
	const needsPolling = shouldPollLiveGames(now);
	const pendingExcitementRatings = [];
	const ratingLeague = currentLeague;

	todayInfoEl.classList.toggle("hidden", selectedGames.length === 0);

	if (selectedGames.length > 0) {
		selectedGames.forEach((g) => {
			const live = liveById.get(g.gameId);
			const { isPostponed, isFinal, isLive } = getGameState(g, live, now);
			const template = document.querySelector("#template-today");
			const clone = template.content.cloneNode(true);
			const card = clone.querySelector(".card");
			card.dataset.gameCode = g.gameCode;
			card.dataset.gameId = g.gameId;
			card.href = getGamePageUrl(g.gameId, currentLeague, currentMode);

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
			setTeamLogo(homeLogo, g.homeTeam.teamTricode, currentLeague);
			setTeamLogo(visitingLogo, g.awayTeam.teamTricode, currentLeague);
			homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`.trim();
			visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`.trim();
			homeAbbr.textContent = g.homeTeam.teamTricode;
			visitingAbbr.textContent = g.awayTeam.teamTricode;

			gameLabelEl.textContent = label ? (subLabel ? `${label} – ${subLabel}` : label) : subLabel;
			broadcastLabelEl.textContent = getBroadcastLabels(g, currentBroadcastRegion, currentLanguage).join(" · ");

			if (isFinal) {
				// FINAL
				date.classList.remove("live");
				if (checkboxShowRating.checked) {
					const cacheKey = getExcitementCacheKey(ratingLeague, g.gameId);
					const cachedScore = excitementCache.get(cacheKey);
					if (cachedScore != null) {
						date.textContent = formatExcitementRating(cachedScore);
					} else {
						date.textContent = "…";
						pendingExcitementRatings.push({ gameId: g.gameId, element: date });
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
					renderTeamMetaLabels(g, homeWL, visitingWL, true);
				}
			} else if (isLive) {
				// LIVE
				date.classList.add("live");
				date.innerHTML = getLiveLabel(live, t);

				const liveAway = live?.awayTeam?.score;
				const liveHome = live?.homeTeam?.score;

				if (checkboxShowScores.checked) {
					const a = Number.isFinite(liveAway) ? liveAway : "—";
					const h = Number.isFinite(liveHome) ? liveHome : "—";
					homeScore.textContent = h;
					visitingScore.textContent = a;
				} else {
					renderTeamMetaLabels(g, homeWL, visitingWL);
				}
			} else {
				// SCHEDULED
				date.classList.remove("live");
				date.textContent = isPostponed ? "PPD" : g.time;
				renderTeamMetaLabels(g, homeWL, visitingWL);
			}

			todayEl.appendChild(clone);
		});
	} else {
		renderEmptyTodayState();
	}

	hydrateExcitementRatings(pendingExcitementRatings, ratingLeague).catch((error) => {
		console.warn("Excitement ratings could not be hydrated:", error);
	});

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

function startExcitementBackfill(leagueId = currentLeague) {
	fetch(getBackfillExcitementUrl(leagueId), { method: "POST" })
		.then((response) => {
			if (!response.ok) {
				throw new Error(`Excitement backfill failed: ${response.status}`);
			}
			return response.json();
		})
		.then((data) => {
			console.log("Excitement backfill started:", data);
		})
		.catch((error) => {
			console.warn("Excitement backfill could not be started:", error);
		});
}

function formatExcitementRating(score) {
	return `${(score / 10).toFixed(1)}/10`;
}

async function fetchExcitementScoresFromKv(gameIds, leagueId = currentLeague) {
	const uncachedGameIds = Array.from(new Set(gameIds)).filter((gameId) => {
		return typeof gameId === "string" && !excitementCache.has(getExcitementCacheKey(leagueId, gameId));
	});

	if (!uncachedGameIds.length) {
		return { scores: {}, missing: [] };
	}

	try {
		const response = await fetch(getFetchExcitementUrl(leagueId), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ gameIds: uncachedGameIds }),
		});

		if (!response.ok) {
			throw new Error(`Excitement fetch failed: ${response.status}`);
		}

		const data = await response.json();
		const scores = data?.scores && typeof data.scores === "object" ? data.scores : {};

		Object.entries(scores).forEach(([gameId, score]) => {
			const numericScore = Number(score);
			if (Number.isFinite(numericScore)) {
				excitementCache.set(getExcitementCacheKey(leagueId, gameId), numericScore);
			}
		});

		const responseMissing = Array.isArray(data?.missing) ? data.missing : [];
		const missing = Array.from(
			new Set(responseMissing.concat(
				uncachedGameIds.filter((gameId) => {
					return !excitementCache.has(getExcitementCacheKey(leagueId, gameId));
				}),
			)),
		);

		return { scores, missing };
	} catch (error) {
		console.warn("KV excitement fetch failed; using play-by-play fallback:", error);
		return { scores: {}, missing: uncachedGameIds };
	}
}

function setRatingElement(element, gameId, leagueId, score) {
	const card = element.closest(".card");

	if (
		currentLeague !== leagueId ||
		!element.isConnected ||
		card?.dataset.gameId !== gameId
	) {
		return;
	}

	element.textContent = formatExcitementRating(score);
}

function setRatingElementFallback(element, gameId, leagueId) {
	const card = element.closest(".card");

	if (
		currentLeague !== leagueId ||
		!element.isConnected ||
		card?.dataset.gameId !== gameId
	) {
		return;
	}

	element.textContent = t("final");
}

async function hydrateExcitementRatings(ratings, leagueId = currentLeague) {
	const pendingRatings = ratings.filter(({ gameId }) => {
		return !excitementCache.has(getExcitementCacheKey(leagueId, gameId));
	});

	if (!pendingRatings.length) {
		return;
	}

	const pendingGameIds = pendingRatings.map(({ gameId }) => gameId);
	const { missing } = await fetchExcitementScoresFromKv(pendingGameIds, leagueId);
	const missingGameIds = new Set(missing);

	pendingRatings.forEach(({ gameId, element }) => {
		const cachedScore = excitementCache.get(getExcitementCacheKey(leagueId, gameId));
		if (cachedScore != null) {
			setRatingElement(element, gameId, leagueId, cachedScore);
		}
	});

	missingGameIds.forEach((gameId) => {
		fetchExcitementForGame(gameId, leagueId)
			.then((score) => {
				pendingRatings
					.filter((rating) => rating.gameId === gameId)
					.forEach(({ element }) => {
						setRatingElement(element, gameId, leagueId, score);
					});
			})
			.catch(() => {
				pendingRatings
					.filter((rating) => rating.gameId === gameId)
					.forEach(({ element }) => {
						setRatingElementFallback(element, gameId, leagueId);
					});
			});
	});
}

function fetchExcitementForGame(gameId, leagueId = currentLeague) {
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
		)
			.then((loaded) => {
				if (!loaded) {
					reject(new Error("Play-by-play excitement fetch failed"));
				}
			})
			.catch(reject);
	});
}

function getScheduleGames() {
	return schedule?.leagueSchedule?.gameDates?.flatMap((date) => date.games || []) || [];
}

/* --------------------------------------------------------------------------------------------------
MORE GAMES
---------------------------------------------------------------------------------------------------*/

function getBroadcasterSelection() {
	return Array.from(selectedBroadcasters).sort().join(" · ") || "all";
}

function updateBroadcasterSummary() {
	broadcasterSummary.textContent = selectedBroadcasters.size
		? Array.from(selectedBroadcasters).sort((a, b) => a.localeCompare(b, currentLocale)).join(" · ")
		: t("allBroadcasters");
}

function updateBroadcasterPicker() {
	const providers = Array.from(
		new Set(
			getScheduleGames().flatMap((game) => {
				return getBroadcastLabels(game, currentBroadcastRegion, currentLanguage);
			}),
		),
	).sort((a, b) => a.localeCompare(b, currentLocale));

	for (const provider of selectedBroadcasters) {
		if (!providers.includes(provider)) {
			selectedBroadcasters.delete(provider);
			broadcasterSelectionOnOpen = null;
		}
	}

	broadcasterPicker.classList.toggle("hidden", providers.length === 0);
	if (!providers.length) {
		broadcasterPicker.open = false;
	}
	broadcasterList.replaceChildren();
	providers.forEach((provider) => {
		const option = broadcasterOptionTemplate.content.cloneNode(true);
		const input = option.querySelector("input");
		option.querySelector(".name").textContent = provider;
		input.value = provider;
		input.checked = selectedBroadcasters.has(provider);
		broadcasterList.appendChild(option);
	});
	updateBroadcasterSummary();
}

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

function renderMoreEmptyState() {
	const emptyState = document.createElement("div");
	emptyState.classList.add("empty-state");
	emptyState.textContent = t("noMoreScheduledGames");
	moreEl.appendChild(emptyState);
}

function renderMoreGames() {
	let dateHeadline = "";
	let jumpLinkInserted = false;
	moreEl.innerHTML = "";

	const selectedDayTime = selectedDay.getTime();
	const gamesToDisplay = getMoreViewGames();

	if (!gamesToDisplay.length) {
		renderMoreEmptyState();
		return;
	}

	gamesToDisplay.forEach((g) => {
		if (dateHeadline === "" || dateHeadline !== g.date) {
			dateHeadline = g.date;
			const h3El = document.createElement("h3");
			const headlineText = document.createTextNode(g.date);
			h3El.dataset.timestamp = g.localDate.getTime();
			h3El.appendChild(headlineText);
			moreEl.appendChild(h3El);

			if (
				!checkboxHidePastGames.checked &&
				!jumpLinkInserted &&
				getCalendarDayTime(g.localDate) > selectedDayTime
			) {
				const anchorTop = document.createElement("div");
				anchorTop.classList.add("jump-link");
				const anchorLink = document.createElement("a");
				anchorLink.classList.add("action-link");
				anchorLink.textContent = isSelectedDayToday() ? t("jumpToToday") : t("jumpToSelectedDay");
				anchorTop.appendChild(anchorLink);
				anchorLink.href = "#today-headline";
				moreEl.insertBefore(anchorTop, h3El);
				jumpLinkInserted = true;
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
		const live = liveById.get(g.gameId);
		const { isPostponed, isFinal, isLive } = getGameState(g, live);

		homeName.textContent = `${g.homeTeam.teamCity} ${g.homeTeam.teamName}`.trim();
		visitingName.textContent = `${g.awayTeam.teamCity} ${g.awayTeam.teamName}`.trim();
		homeAbbr.textContent = g.homeTeam.teamTricode;
		homeColor.style.setProperty("--team-color", getTeamColorValue(g.homeTeam.teamTricode));
		visitingAbbr.textContent = g.awayTeam.teamTricode;
		visitingColor.style.setProperty("--team-color", getTeamColorValue(g.awayTeam.teamTricode));
		card.dataset.abbr = `${g.awayTeam.teamTricode}/${g.homeTeam.teamTricode}`;
		card.dataset.gameId = g.gameId;
		card.href = getGamePageUrl(g.gameId, currentLeague, currentMode);
		if (isLive) {
			date.classList.add("live");
			date.innerHTML = getLiveLabel(live, t);
		} else {
			date.classList.remove("live");
			date.textContent = isPostponed ? "PPD" : t("scheduledTime", { time: g.time });
		}
		gameLabelEl.textContent = label ? subLabel ? `${label} – ${subLabel}` : label : subLabel;
		broadcastLabelEl.textContent = getBroadcastLabels(g, currentBroadcastRegion, currentLanguage).join(" · ");

		if (isFinal) {
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
		} else if (isLive) {
			const liveAway = live?.awayTeam?.score;
			const liveHome = live?.homeTeam?.score;
			homeScore.textContent = Number.isFinite(liveHome) ? liveHome : "—";
			visitingScore.textContent = Number.isFinite(liveAway) ? liveAway : "—";
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

function resetTopExcitementSection() {
	topExcitementEl.replaceChildren();
	topExcitementEl.classList.add("hidden");
	topExcitementHeadlineEl.classList.add("hidden");
}

function getTopExcitementTeamName(team) {
	return `${team?.teamCity || ""} ${team?.teamName || ""}`.trim();
}

function getTopExcitementGameLabel(item) {
	const label = (item.gameLabel || "").trim();
	const subLabel = (item.gameSubLabel || "").trim();

	return label ? subLabel ? `${label} – ${subLabel}` : label : subLabel;
}

function formatTopExcitementGameDate(item) {
	const gameDate = new Date(item.gameDateTimeUTC);

	if (Number.isNaN(gameDate.getTime())) {
		return t("notScheduled");
	}

	return gameDate.toLocaleDateString(currentLocale, {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
	});
}

function renderTopExcitementCard(item) {
	const template = document.querySelector("#template-top-excitement");
	const clone = template.content.cloneNode(true);
	const card = clone.querySelector(".card");
	const homeTeam = clone.querySelector(".home-team");
	const visitingTeam = clone.querySelector(".visiting-team");
	const homeScore = Number(item.homeScore);
	const visitingScore = Number(item.awayScore);
	const scheduleGame = getScheduleGames().find((game) => game.gameId === item.gameId);

	clone.querySelector(".rating").textContent = formatExcitementRating(Number(item.excitement));
	clone.querySelector(".date").textContent = formatTopExcitementGameDate(item);
	clone.querySelector(".game-label").textContent = getTopExcitementGameLabel(item);

	homeTeam.querySelector(".name").textContent = getTopExcitementTeamName(item.homeTeam);
	homeTeam.querySelector(".abbr").textContent = item.homeTeam?.teamTricode || "";
	homeTeam.querySelector(".score").textContent = Number.isFinite(homeScore) ? homeScore : "";
	homeTeam.querySelector(".color").style.setProperty(
		"--team-color",
		getTeamColorValue(item.homeTeam?.teamTricode),
	);

	visitingTeam.querySelector(".name").textContent = getTopExcitementTeamName(item.awayTeam);
	visitingTeam.querySelector(".abbr").textContent = item.awayTeam?.teamTricode || "";
	visitingTeam.querySelector(".score").textContent = Number.isFinite(visitingScore) ? visitingScore : "";
	visitingTeam.querySelector(".color").style.setProperty(
		"--team-color",
		getTeamColorValue(item.awayTeam?.teamTricode),
	);

	if (Number.isFinite(homeScore) && Number.isFinite(visitingScore)) {
		homeTeam.querySelector(".score").classList.toggle("lower", homeScore < visitingScore);
		visitingTeam.querySelector(".score").classList.toggle("lower", visitingScore < homeScore);
	}

	if (scheduleGame) {
		card.dataset.gameId = item.gameId;
		card.href = getGamePageUrl(item.gameId, currentLeague, currentMode);
	}

	return clone;
}

function renderTopExcitementGames() {
	const topExcitement = topExcitementByLeague.get(currentLeague);
	const items = Array.isArray(topExcitement?.items)
		? topExcitement.items.filter((item) => Number.isFinite(Number(item.excitement)))
		: [];

	resetTopExcitementSection();

	if (getRegularSeasonProgressPercentage() !== 100 || items.length === 0) {
		return;
	}

	items.forEach((item) => {
		topExcitementEl.appendChild(renderTopExcitementCard(item));
	});

	topExcitementHeadlineEl.classList.remove("hidden");
	topExcitementEl.classList.remove("hidden");
}

async function loadTopExcitementGames(leagueId = currentLeague) {
	if (getRegularSeasonProgressPercentage() !== 100) {
		resetTopExcitementSection();
		return;
	}

	if (topExcitementByLeague.has(leagueId)) {
		renderTopExcitementGames();
		return;
	}

	try {
		const response = await fetch(getTopExcitementUrl(leagueId));

		if (!response.ok) {
			throw new Error(`Top excitement fetch failed: ${response.status}`);
		}

		const data = await response.json();
		const items = Array.isArray(data?.items) ? data.items : [];

		if (!items.length) {
			if (currentLeague === leagueId) {
				resetTopExcitementSection();
			}
			return;
		}

		topExcitementByLeague.set(leagueId, { items });

		if (currentLeague === leagueId) {
			renderTopExcitementGames();
		}
	} catch (error) {
		console.warn("Top excitement games could not be loaded:", error);

		if (currentLeague === leagueId) {
			topExcitementByLeague.delete(leagueId);
			resetTopExcitementSection();
		}
	}
}

function scrollToLastPastHeadline() {
	const headlines = moreEl.querySelectorAll("h3");
	if (!headlines.length) return;

	let bestHeadline = null;
	let bestTimestamp = null;
	const selectedDayTime = selectedDay.getTime();

	headlines.forEach((h3) => {
		const timestamp = Number(h3.dataset.timestamp);
		if (!timestamp) return;

		// Find the latest date group before the selected day
		if (timestamp < selectedDayTime && (!bestTimestamp || timestamp > bestTimestamp)) {
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
	const scheduleSeason = getScheduleSeason(json);
	const validGames = getValidScheduleGames(json);

	if (scheduleSeason && validGames.length > 0) {
		const seasonChanged = activeSeason && activeSeason !== scheduleSeason;
		if (seasonChanged) {
			console.log("Active season changed", activeSeason, scheduleSeason);
			resetSeasonDependentData();
		}

		activeSeason = scheduleSeason;
		schedule = json;

		games = {
			today: [],
			finished: [],
			scheduled: [],
		};

		prepareGameData();
		updateBroadcasterPicker();
		setProgressBar();
		renderTodaysGames();
		renderMoreGames();
		loadTopExcitementGames();
		updateBrackets();
	} else {
		console.log(
			"Schedule data not available. Skipping schedule rendering.",
		);
	}
}

function handleStandingsData(json) {
	if (
		!isCurrentSeasonResponse(json) ||
		!Array.isArray(json.east) ||
		!Array.isArray(json.west)
	) {
		console.log("Standings data not available. Skipping standings rendering.");
		return;
	}

	activeSeason = activeSeason || json.season;
	standings = json;

	// Store new-format arrays directly
	eastData = standings.east.slice();
	westData = standings.west.slice();
	overallData = getOverallStandingsData();
	divisionsData = standings.divisions || {};
	setProgressBar();
	loadTopExcitementGames();

	standingsOverall = document.querySelector("#overall table");
	standingsEast = document.querySelector("#east table");
	standingsWest = document.querySelector("#west table");

	updateTeamPicker();
	renderStandings();
}

function handleIstBracketData(json) {
	if (
		!isCurrentSeasonResponse(json) ||
		json.available === false ||
		!Array.isArray(json.bracket?.istBracketSeries)
	) {
		istBracket = null;
		resetCupBracket();
		console.log("IST bracket data not available. Skipping cup bracket rendering.");
		return;
	}

	activeSeason = activeSeason || json.season;
	istBracket = json;
	updateBrackets();
}

function handlePlayoffBracketData(json) {
	if (
		!isCurrentSeasonResponse(json) ||
		json.available === false ||
		!Array.isArray(json.bracket?.playoffBracketSeries)
	) {
		playoffBracket = null;
		resetPlayoffBracket();
		console.log("Playoff bracket data not available. Skipping playoff bracket rendering.");
		return;
	}

	activeSeason = activeSeason || json.season;
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

	if (getCurrentLeague().supportsIstBracket) {
		await fetchData(getIstBracketUrl(), handleIstBracketData);
	} else {
		resetCupBracket();
	}
	if (getCurrentLeague().supportsPlayoffBracket) {
		await fetchData(getPlayoffBracketUrl(), handlePlayoffBracketData);
	} else {
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

	if (getCurrentLeague().supportsIstBracket) {
		await fetchData(getIstBracketUrl(), handleIstBracketData, true);
	}
	if (getCurrentLeague().supportsPlayoffBracket) {
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
	applyMode();
	globalThis.umami?.track("Schedule", {
		action: "init",
		league: currentLeague,
		mode: currentMode,
		language: currentLanguage,
		broadcastRegion: currentBroadcastRegion,
		showScores: checkboxShowScores.checked,
		showExcitementRating: checkboxShowRating.checked,
		hidePastGames: checkboxHidePastGames.checked,
		primeTimeOnly: checkboxPrimetime.checked,
		showConferenceStandings,
		showDivisionStandings,
	});
	todayPrevButton.addEventListener("click", () => {
		moveSelectedDay(-1);
	});
	todayNextButton.addEventListener("click", () => {
		moveSelectedDay(1);
	});
	document.addEventListener("touchstart", function () {}, false);
	modePicker.addEventListener("change", () => {
		setMode(modePicker.value);
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
	broadcasterPicker.addEventListener("toggle", () => {
		const selection = getBroadcasterSelection();
		if (broadcasterPicker.open) {
			broadcasterSelectionOnOpen = selection;
			return;
		}

		const selectionChanged = broadcasterSelectionOnOpen !== null && broadcasterSelectionOnOpen !== selection;
		broadcasterSelectionOnOpen = null;
		if (selectionChanged) {
			globalThis.umami?.track("Schedule", {
				action: "broadcasterFilter",
				broadcasters: selection,
				league: currentLeague,
				mode: currentMode,
			});
		}
	});
	broadcasterList.addEventListener("change", (event) => {
		const input = event.target;
		if (input.checked) {
			selectedBroadcasters.add(input.value);
		} else {
			selectedBroadcasters.delete(input.value);
		}
		updateBroadcasterSummary();
		renderMoreGames();
	});
	broadcasterResetButton.addEventListener("click", () => {
		selectedBroadcasters.clear();
		broadcasterList.querySelectorAll("input").forEach((input) => {
			input.checked = false;
		});
		updateBroadcasterSummary();
		renderMoreGames();
	});
	document.addEventListener("click", (event) => {
		if (!broadcasterPicker.contains(event.target)) {
			broadcasterPicker.open = false;
		}
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && broadcasterPicker.open) {
			broadcasterPicker.open = false;
			broadcasterPicker.querySelector("summary").focus();
		}
	});
	teamPicker.addEventListener("change", () => {
		globalThis.umami?.track("Schedule", {
			action: "teamFilter",
			league: currentLeague,
			team: teamPicker.value || "all",
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

	document.addEventListener("DOMContentLoaded", async function () {
		await loadData();
		startExcitementBackfill(currentLeague);
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

initServiceWorkerRegistration(SERVICE_WORKER_CONFIG);
