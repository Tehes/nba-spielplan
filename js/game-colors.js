import { LEAGUES } from "./game-shared.js";

// Primary and alternative backgrounds used by the matchup color selection.
// Visually reviewed UI thresholds, not standardized perceptual limits.
export const SIMILARITY_DEFAULTS = {
	hue: 45,
	lightness: 0.30,
	chroma: 0.04,
	improvement: 0.04,
	contrastImprovement: 0.5,
};
const teamColors = {};

function hexToLinearRgb(hex) {
	return hex.slice(1).match(/../g).map((channel) => {
		const value = parseInt(channel, 16) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
}

// Matrices: https://bottosson.github.io/posts/oklab/ (linear sRGB to OKLab).
function hexToOklab(hex) {
	const [r, g, b] = hexToLinearRgb(hex);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	];
}

function getColorContrast(firstHex, secondHex) {
	const luminances = [firstHex, secondHex].map((hex) => {
		const [r, g, b] = hexToLinearRgb(hex);
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	});
	return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

export function compareMatchupColors(firstTeam, secondTeam) {
	const teams = [firstTeam, secondTeam].sort((a, b) => a.code.localeCompare(b.code));
	const colors = teams.map((team) => team.colors.map((hex) => ({ hex, lab: hexToOklab(hex) })));
	const combinations = [];
	for (let a = 0; a < colors[0].length; a++) {
		for (let b = 0; b < colors[1].length; b++) {
			combinations.push({
				variants: [a, b],
				distance: Math.hypot(...colors[0][a].lab.map((value, index) => value - colors[1][b].lab[index])),
				contrast: getColorContrast(colors[0][a].hex, colors[1][b].hex),
			});
		}
	}
	return { teams, colors, combinations };
}

export function compareAppearance(first, second, settings) {
	const chroma = [first, second].map((lab) => Math.hypot(lab[1], lab[2]));
	const hueReliable = chroma.every((value) => value >= settings.chroma);
	const angles = [first, second].map((lab) => Math.atan2(lab[2], lab[1]) * 180 / Math.PI);
	const angle = Math.abs(angles[0] - angles[1]);
	const hue = hueReliable ? Math.min(angle, 360 - angle) : null;
	const lightness = Math.abs(first[0] - second[0]);
	// Different lightness must not hide similar hues; neutral colors have no reliable hue.
	const similar = hue === null ? lightness < settings.lightness : hue < settings.hue;
	return { chroma, hue, lightness, similar };
}

export function selectSimilarMatchup(result, homeCode, settings = SIMILARITY_DEFAULTS) {
	for (const combination of result.combinations) {
		combination.appearance = compareAppearance(
			result.colors[0][combination.variants[0]].lab,
			result.colors[1][combination.variants[1]].lab,
			settings,
		);
	}
	const homeIndex = result.teams.findIndex((team) => team.code === homeCode);
	const primary = result.combinations[0];
	const alternative = result.combinations.find((combination) =>
		combination.variants[homeIndex] === 0 && combination.variants[1 - homeIndex] === 1
	);
	// Neutral primary pairs need light-dark separation even when overall OKLab distance barely changes.
	const neutral = primary.appearance.hue === null;
	const improvement = neutral ? alternative.contrast - primary.contrast : alternative.distance - primary.distance;
	const minimum = neutral ? settings.contrastImprovement : settings.improvement;
	result.chosen = primary.appearance.similar && improvement > 0 && improvement >= minimum ? alternative : primary;
	return result;
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
			const colors = [property, `${property}-alternate`].map((name) =>
				styles.getPropertyValue(name).trim().toUpperCase()
			);
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
	selectSimilarMatchup(result, homeCode);
	return Object.fromEntries(
		result.teams.map((team, index) => [team.code, result.colors[index][result.chosen.variants[index]]]),
	);
}
