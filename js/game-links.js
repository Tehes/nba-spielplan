export function getGamePageUrl(gameId, league, mode) {
	const url = new URL("../game.html", import.meta.url);
	url.search = new URLSearchParams({ id: gameId, league, mode }).toString();
	return url.href;
}

export async function shareGame(gameId, league, mode, title, feedback, t) {
	const url = getGamePageUrl(gameId, league, mode);
	feedback.textContent = "";

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
		feedback.textContent = t("linkCopied");
	} catch (error) {
		console.warn("Game link could not be copied:", error);
		feedback.textContent = `${t("copyLinkManually")} ${url}`;
	}
}
