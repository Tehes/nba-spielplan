export function getGamePageUrl(gameId, league, mode) {
	const url = new URL("../game.html", import.meta.url);
	url.search = new URLSearchParams({ id: gameId, league, mode }).toString();
	return url.href;
}

export async function shareGame(gameId, league, mode, title) {
	const url = getGamePageUrl(gameId, league, mode);

	if (navigator.share) {
		try {
			await navigator.share({ title, url });
			return;
		} catch (error) {
			if (error.name === "AbortError") {
				return;
			}
			console.warn("Native sharing failed; offering the game link instead:", error);
		}
	}

	try {
		await navigator.clipboard.writeText(url);
	} catch (error) {
		console.warn("Game link could not be copied:", error);
	}
}
