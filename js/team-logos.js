import { getTeamColorPairs } from "./game-colors.js";
import { LEAGUES } from "./game-shared.js";

const TEAM_LOGOS = {
	nba: {
		UTA: {
			dark: { file: "UTA-D.svg", background: 1 },
		},
		TOR: {
			dark: { file: "TOR-D.svg", background: 1 },
		},
		HOU: {
			light: { file: "HOU-L.svg", background: 0 },
			dark: { file: "HOU-D.svg", background: 1 },
		},
	},
	wnba: {
		TOR: {
			light: { file: "TOR-L.svg", background: 1 },
			dark: { file: "TOR-D.svg", background: 0 },
		},
		PDX: {
			light: { file: "PDX-L.svg", background: 1 },
			dark: { file: "PDX-D.svg", background: 0 },
		},
	},
};

export function getTeamLogoSrc(code, leagueId = "nba", backgroundColor) {
	const league = LEAGUES[leagueId];
	const variants = TEAM_LOGOS[leagueId]?.[code];
	if (!variants) {
		return `${league.logoPath}/${code}.svg`;
	}
	const background = backgroundColor ?? getComputedStyle(document.documentElement)
		.getPropertyValue(`--${league.colorPrefix}${code}`);
	// Variants are matched to reviewed backgrounds, not an arbitrary lightness cutoff.
	const colors = getTeamColorPairs(leagueId).find((team) => team.code === code).colors;
	const variant = Object.values(variants).find((item) => colors[item.background] === background.trim().toUpperCase());
	return `${league.logoPath}/${variant?.file ?? `${code}.svg`}`;
}

export function setTeamLogo(image, code, leagueId = "nba", backgroundColor) {
	const src = getTeamLogoSrc(code, leagueId, backgroundColor);
	if (image.getAttribute("src") === src) {
		return;
	}
	const fallback = `${LEAGUES[leagueId].logoPath}/${code}.svg`;
	image.onerror = () => {
		if (image.getAttribute("src") !== fallback) {
			image.src = fallback;
			return;
		}
		image.onerror = null;
		image.src = "img/no-logo.svg";
	};
	image.src = src;
}
