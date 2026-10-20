export const API_BASE_URL = "https://nba-spielplan.tehes.deno.net";
export const MODE_STORAGE_KEY = "nba-spielplan_mode";
export const LEAGUE_STORAGE_KEY = "nba-spielplan_league";
export const SCHEDULE_CACHE_VERSION = "4";
export const STANDINGS_CACHE_VERSION = "4";
export const MODES = {
	de: {
		language: "de",
		broadcastRegion: "de",
	},
	"en-us": {
		language: "en",
		broadcastRegion: "us",
	},
	en: {
		language: "en",
		broadcastRegion: "none",
	},
};
export const SUPPORTED_MODES = new Set(Object.keys(MODES));
export const LEAGUES = {
	nba: {
		id: "nba",
		label: "NBA",
		query: "",
		storagePrefix: "nba",
		logoPath: "img/NBA",
		colorPrefix: "",
		regularSeasonPrefix: "002",
		postseasonPrefixes: ["004", "005"],
		regularSeasonGamesPerTeam: 82,
		recapHost: "nba.com",
		supportsIstBracket: true,
		supportsPlayoffBracket: true,
	},
	wnba: {
		id: "wnba",
		label: "WNBA",
		query: "?league=wnba",
		storagePrefix: "wnba",
		logoPath: "img/WNBA",
		colorPrefix: "wnba-",
		regularSeasonPrefix: "102",
		postseasonPrefixes: ["104"],
		regularSeasonGamesPerTeam: 44,
		recapHost: "wnba.com",
		supportsIstBracket: false,
		supportsPlayoffBracket: true,
	},
};
export const SUPPORTED_LEAGUES = new Set(Object.keys(LEAGUES));
export const LOCALES = {
	de: "de-DE",
	en: "en-US",
};
export const MANIFEST_BY_LANGUAGE = {
	de: "manifest.json",
	en: "manifest-en.json",
};
export const BUCKETS_URL = "https://tehes.github.io/buckets/";
export const messages = {
	de: {
		appName: "NBA-Spielplan",
		gameDetails: "Detailseite öffnen",
		shareGame: "Teilen",
		linkCopied: "Link kopiert.",
		copyLinkManually: "Link zum Kopieren:",
		backToSchedule: "Spielplan",
		gameNotFound: "Diese Partie ist im aktuellen Spielplan nicht verfügbar.",
		gameLoadFailed: "Die Spieldaten konnten nicht geladen werden.",
		retry: "Erneut versuchen",
		beforeTipoff: "Vor dem Tip-off",
		statsAfterTipoff: "Statistiken sind nach Spielbeginn verfügbar.",
		noBoxscore: "Keine Boxscore-Daten verfügbar.",
		postponed: "Verschoben",
		documentTitle: "NBA-Spielplan – schnell, werbefrei, offlinefähig",
		metaDescription:
			"Alle NBA-Spiele automatisch in deiner Zeitzone – mit Live-Scores und Prime-Time-Filter. Schnell, werbefrei, offline nutzbar. Einfach zum Homescreen hinzufügen und wie eine App starten.",
		ogTitle: "NBA-Spielplan in deiner Zeitzone – schnell, werbefrei, offline nutzbar",
		ogDescription:
			"Alle NBA-Spiele automatisch in deiner Zeitzone – schnell, werbefrei und auch offline nutzbar. Einfach zum Homescreen hinzufügen und wie eine App starten.",
		seasonProgress: "Saisonfortschritt",
		requestWarning: "Einige Daten konnten nicht aktualisiert werden. Bitte versuche es später erneut.",
		todayHeadline: "Heute",
		yesterdayHeadline: "Gestern",
		tomorrowHeadline: "Morgen",
		previousDay: "Vorheriger Tag",
		nextDay: "Nächster Tag",
		showScores: "Ergebnisse anzeigen",
		showRating: "Spielbewertung anzeigen",
		info: "Info",
		away: "Gast",
		home: "Heim",
		standingsJump: "Zur Tabelle",
		moreGames: "weitere Spiele",
		topExcitementGames: "Top 10 spannendste Spiele",
		noMoreScheduledGames: "Keine weiteren Spiele geplant.",
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
		noGamesToday: "Heute keine Spiele.",
		noGamesSelectedDay: "An diesem Tag finden keine Spiele statt.",
		emptyStateLead:
			"Spiel selbst eins: Buckets ist ein Trumpf-Kartenspiel mit Basketball-Stars. Du vergleichst NBA- und WNBA-Spielerkarten, wählst die stärkste Statistik und spielst vier Viertel gegen die CPU.",
		emptyStateCta: "Spiel selbst",
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
		jumpToSelectedDay: "zum gewählten Tag",
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
		gameDetails: "Open game details",
		shareGame: "Share",
		linkCopied: "Link copied.",
		copyLinkManually: "Link to copy:",
		backToSchedule: "Schedule",
		gameNotFound: "This game is not available in the current schedule.",
		gameLoadFailed: "Game data could not be loaded.",
		retry: "Try again",
		beforeTipoff: "Before tip-off",
		statsAfterTipoff: "Stats will be available after tip-off.",
		noBoxscore: "No boxscore data available.",
		postponed: "Postponed",
		documentTitle: "NBA Schedule – fast, ad-free, offline-ready",
		metaDescription:
			"All NBA games automatically in your time zone with live scores and a prime-time filter. Fast, ad-free, offline-ready. Add it to your home screen and launch it like an app.",
		ogTitle: "NBA schedule in your time zone – fast, ad-free, offline-ready",
		ogDescription:
			"All NBA games automatically in your time zone with live scores and a prime-time filter. Fast, ad-free, and available offline. Add it to your home screen and launch it like an app.",
		seasonProgress: "Season Progress",
		requestWarning: "Some data could not be updated. Please try again later.",
		todayHeadline: "Today",
		yesterdayHeadline: "Yesterday",
		tomorrowHeadline: "Tomorrow",
		previousDay: "Previous day",
		nextDay: "Next day",
		showScores: "Show scores",
		showRating: "Show game rating",
		info: "Info",
		away: "Away",
		home: "Home",
		standingsJump: "Jump to standings",
		moreGames: "More games",
		topExcitementGames: "Top 10 most exciting games",
		noMoreScheduledGames: "No more games scheduled.",
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
		noGamesSelectedDay: "No games on this day.",
		emptyStateLead:
			"Play one yourself: Buckets is a Top Trumps-style card game with basketball stars. Compare NBA and WNBA player cards, pick the strongest stat, and play four quarters against the CPU.",
		emptyStateCta: "Play yourself",
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
		jumpToSelectedDay: "jump to selected day",
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

export function formatMinutes(isoDuration) {
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

export function getGameLocalDate(game) {
	const localDate = game?.localDate instanceof Date ? game.localDate : new Date(game?.gameDateTimeUTC);

	if (Number.isNaN(localDate.getTime())) {
		return null;
	}

	return localDate;
}

export function getExcitementVerdictKey(score) {
	if (score >= 90) {
		return "verdictInstantClassic";
	}
	if (score >= 80) {
		return "verdictMustWatch";
	}
	if (score >= 70) {
		return "verdictVeryWatchable";
	}
	if (score >= 60) {
		return "verdictWatchable";
	}
	if (score >= 50) {
		return "verdictSolid";
	}
	if (score >= 40) {
		return "verdictLopsided";
	}
	if (score >= 30) {
		return "verdictHighlightsOnly";
	}
	return "verdictSkip";
}

export function getBroadcastLabels(game, currentBroadcastRegion, currentLanguage) {
	if (currentBroadcastRegion === "none") {
		return [];
	}

	const labels = new Set();
	const broadcasters = [
		...(game.broadcasters?.nationalTvBroadcasters || []),
		...(game.broadcasters?.nationalOttBroadcasters || []),
		...(game.broadcasters?.intlTvBroadcasters || []),
		...(game.broadcasters?.intlOttBroadcasters || []),
	];

	broadcasters.forEach((broadcaster) => {
		const display = broadcaster.broadcasterDisplay || "";
		const abbreviation = broadcaster.broadcasterAbbreviation || "";

		if (
			currentLanguage === "de" &&
			(
				display.startsWith("Sky Sport") ||
				abbreviation.startsWith("SKYGermany") ||
				abbreviation.startsWith("SkyGermany")
			)
		) {
			labels.add("Sky");
			return;
		}

		if (display === "NBC Sports Network") {
			labels.add("NBCSN");
			return;
		}

		if (display) {
			labels.add(display);
		}
	});

	return Array.from(labels);
}

export function getLiveLabel(live, t) {
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
