import { formatMinutes, getGameLocalDate } from "./game-shared.js";

export function createGameRenderer(gameOverlayEl, options) {
	const { t, getTeamColorValue, getTeamLogoSrc, getScheduleGames, getLocale } = options;
	const documentEl = gameOverlayEl.ownerDocument;
	const periodsEl = gameOverlayEl.querySelector("#periods");
	const teamStatsEl = gameOverlayEl.querySelector("#team-stats");
	const teamsEl = gameOverlayEl.querySelector("#teams");
	const previousMatchupsSectionEl = documentEl.querySelector("#previous-matchups-section");
	const previousMatchupsEl = documentEl.querySelector("#previous-matchups");
	const checkboxPlayByPlayMadeShots = gameOverlayEl.querySelector("#playbyplay-panel input");

	function renderBoxscore(json) {
		const game = json && json.game;
		if (!game || game.gameId !== gameOverlayEl.dataset.gameId) {
			return;
		}

		renderOverview(game);
		teamsEl.replaceChildren();
		renderBoxscoreTeam(game.awayTeam, game.gameStatus === 2);
		renderBoxscoreTeam(game.homeTeam, game.gameStatus === 2);
	}

	function renderPlayByPlay(json) {
		if (json?.game && json.game.gameId !== gameOverlayEl.dataset.gameId) {
			return;
		}
		const actions = json?.game?.actions || [];
		const template = documentEl.getElementById("template-play-by-play");
		const panel = documentEl.querySelector("#playbyplay");

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

	function renderOverview(game) {
		renderBoxscorePeriods(game);
		renderBoxscoreTeamStats(game);
	}

	function renderBoxscoreTeamStats(game) {
		const homeTeam = game?.homeTeam;
		const awayTeam = game?.awayTeam;
		const homeStats = game.gameStatus === 1 ? {} : homeTeam?.statistics || {};
		const awayStats = game.gameStatus === 1 ? {} : awayTeam?.statistics || {};

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
		const pregame = game.gameStatus === 1;
		const periods = pregame
			? [1, 2, 3, 4].map((period) => ({ period, periodType: "REGULAR" }))
			: (home.periods && home.periods.length ? home.periods : away.periods) || [];
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
				cell.textContent = pregame ? 0 : periodData ? periodData.score : "";
				row.appendChild(cell);
			});

			const totalCell = document.createElement("td");
			totalCell.textContent = pregame ? 0 : team.score ?? "";
			row.appendChild(totalCell);

			tbody.appendChild(row);
		}

		addTeamRow(away);
		addTeamRow(home);

		table.appendChild(tbody);
	}

	function renderBoxscoreTeam(team, isLive) {
		const template = documentEl.querySelector("#template-boxscore");
		const section = template.content.firstElementChild.cloneNode(true);
		section.querySelectorAll("[data-i18n]").forEach((element) => {
			element.textContent = t(element.dataset.i18n);
		});
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
		section.querySelector(".on-court-legend").classList.toggle("hidden", !isLive);

		fillPlayersTable(startersBody, starters, isLive);
		fillPlayersTable(benchBody, bench, isLive);

		if (!bench.length) {
			benchWrapper.remove();
		}

		teamsEl.appendChild(section);
	}

	function fillPlayersTable(tbody, players, isLive) {
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
			if (isLive && p.oncourt === "1") {
				const indicator = document.createElement("span");
				indicator.classList.add("on-court-indicator");
				indicator.title = t("onCourt");
				playerCell.appendChild(indicator);
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

		const template = documentEl.querySelector("#template-previous-matchup");

		previousGames.forEach((game) => {
			const item = template.content.firstElementChild.cloneNode(true);
			const gameDate = getGameLocalDate(game);
			const awayTeam = game.awayTeam;
			const homeTeam = game.homeTeam;
			const awayScore = awayTeam.score;
			const homeScore = homeTeam.score;
			const hasScores = awayScore !== null && awayScore !== undefined && awayScore !== "" &&
				homeScore !== null && homeScore !== undefined && homeScore !== "";

			item.querySelector(".date").textContent = gameDate.toLocaleDateString(getLocale(), {
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
			awayEl.querySelector(".name").textContent = `${awayTeam.teamCity} ${awayTeam.teamName}`.trim();
			awayEl.querySelector(".abbr").textContent = awayTeam.teamTricode;
			homeEl.style.setProperty("--team-color", getTeamColorValue(homeTeam.teamTricode));
			homeEl.querySelector(".name").textContent = `${homeTeam.teamCity} ${homeTeam.teamName}`.trim();
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

	return { renderBoxscore, renderOverview, renderPlayByPlay, renderPreviousMatchups };
}
