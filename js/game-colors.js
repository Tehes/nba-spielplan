import { LEAGUES } from "./game-shared.js";

// Primary and alternative backgrounds used by the matchup color selection.
export const DISTANCE_THRESHOLD = 0.270;
export const TIE_TOLERANCE = 0.015;
const teamColors = {};

// Matrices: https://bottosson.github.io/posts/oklab/ (linear sRGB to OKLab).
function hexToOklab(hex) {
	const rgb = hex.slice(1).match(/../g).map((channel) => {
		const value = parseInt(channel, 16) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	const [r, g, b] = rgb;
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	];
}

function selectCombination(pair, threshold, tolerance) {
	const primary = pair.combinations[0];
	if (primary.distance >= threshold) {
		return primary;
	}
	const maximum = Math.max(...pair.combinations.map((combination) => combination.distance));
	// Filter against the absolute maximum, avoiding order-dependent pairwise ties.
	const candidates = pair.combinations.filter((combination) => maximum - combination.distance <= tolerance + 1e-12);
	candidates.sort((a, b) => a.alternatives - b.alternatives || b.distance - a.distance
		|| a.variants[0] - b.variants[0] || a.variants[1] - b.variants[1]);
	return candidates[0];
}

export function compareMatchupColors(firstTeam, secondTeam, threshold = DISTANCE_THRESHOLD, tolerance = TIE_TOLERANCE) {
	const teams = [firstTeam, secondTeam].sort((a, b) => a.code.localeCompare(b.code));
	const colors = teams.map((team) => team.colors.map((hex) => ({ hex, lab: hexToOklab(hex) })));
	const combinations = [];
	for (let a = 0; a < colors[0].length; a++) {
		for (let b = 0; b < colors[1].length; b++) {
			combinations.push({
				variants: [a, b],
				distance: Math.hypot(...colors[0][a].lab.map((value, index) => value - colors[1][b].lab[index])),
				alternatives: a + b,
			});
		}
	}
	const chosen = selectCombination({ combinations }, threshold, tolerance);
	return { teams, colors, combinations, chosen };
}

function getPalette(leagueId) {
	if (!LEAGUES[leagueId]) {
		return null;
	}
	if (!teamColors[leagueId]) {
		// Read root tokens once; detail-page overrides must not become the base palette.
		const styles = getComputedStyle(document.documentElement);
		const prefix = `--${LEAGUES[leagueId].colorPrefix}`;
		const palette = {};
		for (const property of styles) {
			const code = property.slice(prefix.length);
			if (!property.startsWith(prefix) || !/^[A-Z]{3}$/.test(code)) {
				continue;
			}
			const colors = [property, `${property}-alternate`].map((name) => styles.getPropertyValue(name).trim().toUpperCase());
			if (!colors.every((hex) => /^#[0-9A-F]{6}$/.test(hex))) {
				throw new Error(`Missing or invalid team colors: ${leagueId}/${code}`);
			}
			palette[code] = colors;
		}
		if (!Object.keys(palette).length) {
			throw new Error(`Team color stylesheet not loaded: ${leagueId}`);
		}
		teamColors[leagueId] = palette;
	}
	return teamColors[leagueId];
}

export function getTeamColorPairs(leagueId = "nba") {
	return Object.entries(getPalette(leagueId)).sort(([a], [b]) => a.localeCompare(b))
		.map(([code, colors]) => ({ code, colors: [...colors] }));
}

export function getMatchupColors(awayCode, homeCode, leagueId = "nba") {
	const palette = getPalette(leagueId);
	if (!palette || awayCode === homeCode || ![awayCode, homeCode].every((code) => Object.hasOwn(palette, code))) {
		return null;
	}
	const result = compareMatchupColors(
		{ code: awayCode, colors: palette[awayCode] },
		{ code: homeCode, colors: palette[homeCode] },
	);
	return Object.fromEntries(result.teams.map((team, index) => [team.code, result.colors[index][result.chosen.variants[index]]]));
}
