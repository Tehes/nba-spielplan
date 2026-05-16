export const EXCITEMENT_RATING_PROFILES = {
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

function parseClockToSeconds(isoDuration) {
	if (!isoDuration || typeof isoDuration !== "string") return NaN;

	const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
	if (!match) return NaN;

	const minutes = match[1] ? parseInt(match[1], 10) : 0;
	const secondsFloat = match[2] ? parseFloat(match[2]) : 0;

	return Math.round(minutes * 60 + secondsFloat);
}

export function computeGameExcitement(playByPlayJson, leagueId = "nba") {
	const actions = playByPlayJson?.game?.actions;

	if (!Array.isArray(actions) || actions.length === 0) {
		return 0;
	}

	const profile = EXCITEMENT_RATING_PROFILES[leagueId] || EXCITEMENT_RATING_PROFILES.nba;

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
		return 0;
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
