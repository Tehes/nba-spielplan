import {
	API_BASE_URL,
	getBroadcastLabels,
	getExcitementVerdictKey,
	getLiveLabel,
	LEAGUES,
	LOCALES,
	messages,
	MODE_STORAGE_KEY,
	MODES,
} from "./game-shared.js";
import { createGameRenderer } from "./game-renderer.js";
import { shareGame } from "./game-links.js";
import { computeGameExcitement } from "./excitement.js";
import { initServiceWorkerRegistration, SERVICE_WORKER_CONFIG } from "./service-worker-registration.js";

const REFRESH_INTERVAL_MS = 60000;
const SCHEDULE_REFRESH_MS = 15 * 60000;
let gameId = "";
let leagueId = "nba";
let mode = "de";
let scheduleGames = [];
let game = null;
let boxscore = null;
let playByPlay = null;
let renderer = null;
let refreshing = false;
let refreshPending = false;
let lastScheduleRefresh = 0;
let rating = null;
let ratingRequested = false;
let statsLoaded = false;

const detailsEl = document.querySelector("#game-details");
const heroEl = document.querySelector("#game-hero");
const titleEl = document.querySelector("#game-title");
const contextEl = document.querySelector("#game-context");
const awayEl = document.querySelector("#away-team");
const homeEl = document.querySelector("#home-team");
const stateEl = document.querySelector("#game-state");
const scoreEl = document.querySelector("#game-score");
const dateEl = document.querySelector("#game-date");
const metaEl = document.querySelector("#game-meta");
const warningEl = document.querySelector("#request-warning");
const messageEl = document.querySelector("#game-message");
const messageTextEl = document.querySelector("#game-message-text");
const retryButton = document.querySelector("#game-retry");
const shareButton = document.querySelector("#game-share");
const feedbackEl = document.querySelector("#game-share-feedback");
const scheduleLink = document.querySelector("#schedule-link");
const modePicker = document.querySelector("#mode-picker");
const madeShotsCheckbox = document.querySelector("#playbyplay-panel input");
const tabs = document.querySelectorAll("#game-details .tab");
const pregameNote = document.querySelector("#pregame-note");
const periodsHeading = document.querySelector("#periods-heading");
const periodsEl = document.querySelector("#periods");
const statsHeading = document.querySelector("#team-stats-heading");
const statsEl = document.querySelector("#team-stats");
const teamsEl = document.querySelector("#teams");
const playsEl = document.querySelector("#playbyplay");
const excitementEl = document.querySelector("#game-excitement");
const excitementValue = document.querySelector("#game-excitement-value");
const excitementLabel = document.querySelector("#game-excitement-label");
const recapEl = document.querySelector("#game-recap-link");

function t(key, replacements = {}) {
	let text = messages[MODES[mode].language][key] || messages.de[key] || key;
	Object.entries(replacements).forEach(([name, value]) => {
		text = text.split(`{${name}}`).join(String(value));
	});
	return text;
}

function getLocale() {
	return LOCALES[MODES[mode].language];
}

function getTeamColorValue(code) {
	return `var(--${LEAGUES[leagueId].colorPrefix}${code}, var(--neutral400))`;
}

function getTeamLogoSrc(code) {
	return `${LEAGUES[leagueId].logoPath}/${code}.svg`;
}

function getApiUrl(path) {
	const url = new URL(path, API_BASE_URL);
	url.searchParams.set("league", leagueId);
	if (path === "/schedule") {
		url.searchParams.set("region", MODES[mode].broadcastRegion);
	}
	return url;
}

async function fetchGameData(path, options) {
	const response = await fetch(getApiUrl(path), { cache: "no-store", ...options });
	if (!response.ok) {
		throw new Error(`${path}: HTTP ${response.status}`);
	}
	return response.json();
}

function getCurrentGameData() {
	return boxscore && boxscore.gameStatus >= game.gameStatus ? boxscore : game;
}

function getGameStatus() {
	return getCurrentGameData().gameStatus;
}

async function loadSchedule() {
	const requestedMode = mode;
	const data = await fetchGameData("/schedule");
	if (!Array.isArray(data?.leagueSchedule?.gameDates)) {
		throw new Error("Invalid schedule response");
	}
	scheduleGames = data.leagueSchedule.gameDates.flatMap((date) => date.games || []);
	game = scheduleGames.find((item) => item.gameId === gameId) || null;
	lastScheduleRefresh = requestedMode === mode ? Date.now() : 0;
}

async function loadGameStats() {
	const results = await Promise.allSettled([
		fetchGameData(`/boxscore/${gameId}`),
		fetchGameData(`/playbyplay/${gameId}`),
	]);
	results.forEach((result, index) => {
		if (result.status === "rejected") {
			console.warn("Game detail refresh failed:", result.reason);
			warningEl.classList.remove("hidden");
			return;
		}
		const dataGame = result.value?.game;
		if (
			dataGame?.gameId !== gameId ||
			(index === 0 && (!dataGame.awayTeam || !dataGame.homeTeam)) ||
			(index === 1 && !Array.isArray(dataGame.actions))
		) {
			console.warn("Game detail feed returned invalid data.");
			warningEl.classList.remove("hidden");
			return;
		}
		if (index === 0) {
			boxscore = result.value.game;
		} else {
			playByPlay = result.value;
		}
	});
	statsLoaded = true;
}

async function loadRating() {
	if (ratingRequested || getGameStatus() !== 3) {
		return;
	}
	ratingRequested = true;
	try {
		const data = await fetchGameData("/fetch-excitement", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ gameIds: [gameId] }),
		});
		const score = data?.scores?.[gameId];
		if (score !== undefined && Number.isFinite(Number(score))) {
			rating = Number(score);
		}
	} catch (error) {
		console.warn("Game rating unavailable; using play-by-play:", error);
	}
}

async function refreshGame() {
	if (document.visibilityState === "hidden") {
		return;
	}
	if (refreshing) {
		refreshPending = true;
		return;
	}
	refreshing = true;
	warningEl.classList.add("hidden");
	try {
		if (!game || Date.now() - lastScheduleRefresh >= SCHEDULE_REFRESH_MS) {
			await loadSchedule();
		}
		if (!game) {
			showMessage("gameNotFound");
			return;
		}

		const start = new Date(game.gameDateTimeUTC).getTime();
		if (getGameStatus() !== 3 && Date.now() >= start - 5 * 60000) {
			try {
				const data = await fetchGameData("/scoreboard");
				const live = data?.scoreboard?.games?.find((item) => item.gameId === gameId);
				if (live) {
					game = {
						...game,
						...live,
						awayTeam: { ...game.awayTeam, ...live.awayTeam },
						homeTeam: { ...game.homeTeam, ...live.homeTeam },
					};
				}
			} catch (error) {
				console.warn("Live scoreboard refresh failed:", error);
				warningEl.classList.remove("hidden");
			}
		}

		renderGame();
		if (getGameStatus() >= 2 || game.gameStatus >= 2) {
			await loadGameStats();
			await loadRating();
		}
		renderGame();
	} catch (error) {
		console.error("Game details could not be loaded:", error);
		if (game) {
			warningEl.classList.remove("hidden");
			renderGame();
		} else {
			showMessage("gameLoadFailed", true);
		}
	} finally {
		refreshing = false;
		if (refreshPending) {
			refreshPending = false;
			refreshGame();
		}
	}
}

function showMessage(key, canRetry = false) {
	messageTextEl.dataset.i18n = key;
	messageTextEl.textContent = t(key);
	retryButton.classList.toggle("hidden", !canRetry);
	messageEl.classList.remove("hidden");
	heroEl.classList.add("hidden");
	detailsEl.classList.add("hidden");
	metaEl.classList.add("hidden");
	shareButton.disabled = true;
}

function renderHeroTeam(element, team, liveTeam) {
	const logo = element.querySelector(".team-logo");
	const src = getTeamLogoSrc(team.teamTricode);
	if (logo.getAttribute("src") !== src) {
		logo.src = src;
		logo.onerror = () => {
			logo.onerror = null;
			logo.src = "img/no-logo.svg";
		};
	}
	logo.alt = `${team.teamCity} ${team.teamName}`;
	element.querySelector(".team-city").textContent = team.teamCity;
	element.querySelector(".team-name").textContent = team.teamName;
	element.querySelector(".team-record").textContent = team.wins !== undefined && team.losses !== undefined
		? `${team.wins}–${team.losses}`
		: "";
	return liveTeam?.score ?? team.score;
}

function renderGame() {
	const currentGame = getCurrentGameData();
	const status = getGameStatus();
	const postponed = game.postponedStatus === "Y" || game.gameStatusText === "PPD";
	const pregame = status === 1;
	const awayScore = renderHeroTeam(awayEl, game.awayTeam, currentGame.awayTeam);
	const homeScore = renderHeroTeam(homeEl, game.homeTeam, currentGame.homeTeam);
	const title =
		`${game.awayTeam.teamCity} ${game.awayTeam.teamName} @ ${game.homeTeam.teamCity} ${game.homeTeam.teamName}`;
	titleEl.textContent = title;
	document.title = `${title} – ${t("appName")}`;
	contextEl.textContent = [LEAGUES[leagueId].label, game.gameLabel || game.gameSubtype, game.gameSubLabel].filter(
		Boolean,
	).join(" · ");
	heroEl.style.setProperty("--away-color", getTeamColorValue(game.awayTeam.teamTricode));
	heroEl.style.setProperty("--home-color", getTeamColorValue(game.homeTeam.teamTricode));
	stateEl.classList.toggle("is-live", status === 2 && !postponed);
	stateEl.textContent = postponed
		? t("postponed")
		: status === 3
		? t("final")
		: status === 2
		? getLiveLabel(currentGame, t)
		: t("beforeTipoff");
	const date = new Date(game.gameDateTimeUTC);
	const validDate = !Number.isNaN(date.getTime());
	scoreEl.textContent = pregame
		? postponed
			? "–"
			: validDate
			? date.toLocaleTimeString(getLocale(), { hour: "numeric", minute: "2-digit" })
			: t("notScheduled")
		: `${awayScore ?? "–"} : ${homeScore ?? "–"}`;
	dateEl.textContent = validDate
		? date.toLocaleString(getLocale(), {
			weekday: "short",
			day: "numeric",
			month: "long",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZoneName: "short",
		})
		: t("notScheduled");
	metaEl.textContent = [
		game.arenaName,
		game.arenaCity,
		...getBroadcastLabels(game, MODES[mode].broadcastRegion, MODES[mode].language),
	].filter(Boolean).join(" · ");

	detailsEl.dataset.gameId = gameId;
	detailsEl.dataset.awayTeam = game.awayTeam.teamTricode;
	detailsEl.dataset.homeTeam = game.homeTeam.teamTricode;
	pregameNote.classList.toggle("hidden", !pregame);
	[periodsHeading, periodsEl, statsHeading, statsEl].forEach((element) => {
		element.classList.toggle("hidden", pregame || !boxscore);
	});
	if (boxscore && !pregame) {
		renderer.renderBoxscore({ game: boxscore });
	} else {
		teamsEl.textContent = t(pregame ? "statsAfterTipoff" : statsLoaded ? "noBoxscore" : "loading");
	}
	renderer.renderPreviousMatchups();
	if (playByPlay?.game.actions.length) {
		renderer.renderPlayByPlay(playByPlay);
	} else {
		playsEl.textContent = t(pregame ? "statsAfterTipoff" : statsLoaded ? "noPlayByPlay" : "loading");
	}
	renderRating();
	recapEl.classList.toggle("hidden", status !== 3);
	if (status === 3) {
		const anchor = recapEl.querySelector("a");
		anchor.href = leagueId === "wnba"
			? `https://www.wnba.com/game/${gameId}?watchRecap=true`
			: `https://www.nba.com/game/${game.awayTeam.teamTricode.toLowerCase()}-vs-${game.homeTeam.teamTricode.toLowerCase()}-${gameId}?watchRecap=true`;
		anchor.textContent = t("watchRecapHost", { host: LEAGUES[leagueId].recapHost });
	}
	heroEl.classList.remove("hidden");
	detailsEl.classList.remove("hidden");
	metaEl.classList.remove("hidden");
	messageEl.classList.add("hidden");
	shareButton.disabled = false;
}

function renderRating() {
	const final = getGameStatus() === 3;
	if (final && rating === null && playByPlay?.game.actions.length) {
		rating = computeGameExcitement(playByPlay, leagueId);
	}
	excitementEl.classList.toggle("hidden", !final || rating === null);
	if (final && rating !== null) {
		excitementValue.style.width = `${rating}%`;
		excitementValue.textContent = `${rating}%`;
		excitementLabel.textContent = t("ratingLabel", {
			rating: (rating / 10).toFixed(1),
			verdict: t(getExcitementVerdictKey(rating)),
		});
	}
}

function applyMode() {
	document.documentElement.lang = MODES[mode].language;
	modePicker.value = mode;
	document.querySelectorAll("[data-i18n]").forEach((element) => {
		element.textContent = t(element.dataset.i18n);
	});
	const url = new URL(globalThis.location.href);
	url.search = new URLSearchParams({ id: gameId, league: leagueId, mode }).toString();
	globalThis.history.replaceState(null, "", url);
	scheduleLink.href = `./?${new URLSearchParams({ league: leagueId, mode })}`;
	if (game) {
		renderGame();
	}
}

function switchTab() {
	const hash = globalThis.location.hash.slice(1);
	if (hash && !["overview", "boxscore", "playbyplay"].includes(hash)) {
		return;
	}
	const target = ["boxscore", "playbyplay"].includes(globalThis.location.hash.slice(1))
		? globalThis.location.hash.slice(1)
		: "overview";
	tabs.forEach((tab) => {
		tab.classList.toggle("is-active", tab.dataset.target === `${target}-panel`);
	});
	detailsEl.querySelectorAll(".panel").forEach((panel) => {
		panel.classList.toggle("is-active", panel.id === `${target}-panel`);
	});
}

function init() {
	const params = new URL(globalThis.location.href).searchParams;
	gameId = params.get("id") || "";
	leagueId = params.get("league") || "nba";
	let storedMode = null;
	try {
		storedMode = localStorage.getItem(MODE_STORAGE_KEY);
		madeShotsCheckbox.checked = localStorage.getItem("nba-spielplan_pbp_madeShotsOnly") === "true";
	} catch (error) {
		console.warn("Game preferences could not be read:", error);
	}
	const preferredMode = params.get("mode") || storedMode;
	mode = Object.hasOwn(MODES, preferredMode)
		? preferredMode
		: navigator.language?.toLowerCase().startsWith("de")
		? "de"
		: "en-us";
	if (!/^\d{10}$/.test(gameId) || !Object.hasOwn(LEAGUES, leagueId)) {
		leagueId = Object.hasOwn(LEAGUES, leagueId) ? leagueId : "nba";
		applyMode();
		showMessage("gameNotFound");
		return;
	}
	renderer = createGameRenderer(detailsEl, {
		t,
		getTeamColorValue,
		getTeamLogoSrc,
		getScheduleGames: () => scheduleGames,
		getLocale,
	});
	applyMode();
	switchTab();
	tabs.forEach((tab) => {
		tab.addEventListener("click", () => {
			const hash = tab.dataset.target.replace("-panel", "");
			globalThis.history.replaceState(null, "", `#${hash}`);
			switchTab();
		});
	});
	globalThis.addEventListener("hashchange", switchTab);
	modePicker.addEventListener("change", () => {
		mode = modePicker.value;
		try {
			localStorage.setItem(MODE_STORAGE_KEY, mode);
		} catch (error) {
			console.warn("Game language could not be saved:", error);
		}
		feedbackEl.textContent = "";
		applyMode();
		lastScheduleRefresh = 0;
		refreshGame();
	});
	madeShotsCheckbox.addEventListener("change", () => {
		try {
			localStorage.setItem("nba-spielplan_pbp_madeShotsOnly", String(madeShotsCheckbox.checked));
		} catch (error) {
			console.warn("Play-by-play preference could not be saved:", error);
		}
		if (playByPlay) {
			renderer.renderPlayByPlay(playByPlay);
		}
	});
	shareButton.addEventListener("click", () => {
		shareGame(gameId, leagueId, mode, titleEl.textContent, feedbackEl, t);
	});
	retryButton.addEventListener("click", () => refreshGame());
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			refreshGame();
		}
	});
	setInterval(() => {
		if (!game || getGameStatus() !== 3) {
			refreshGame();
		}
	}, REFRESH_INTERVAL_MS);
	refreshGame();
}

initServiceWorkerRegistration(SERVICE_WORKER_CONFIG);
init();
