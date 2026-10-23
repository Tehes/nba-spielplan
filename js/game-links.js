export function getGamePageUrl(gameId, league, mode) {
	const url = new URL("../game.html", import.meta.url);
	url.search = new URLSearchParams({ id: gameId, league, mode }).toString();
	return url.href;
}

function escapeCalendarText(text) {
	return text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");
}

function formatCalendarDate(date) {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function downloadGameCalendar({ gameId, league, mode, title, start, location, description }) {
	const url = getGamePageUrl(gameId, league, mode);
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//NBA-Spielplan//Game Calendar//EN",
		"BEGIN:VEVENT",
		`UID:${league}-${gameId}@nba-spielplan.de`,
		`DTSTAMP:${formatCalendarDate(new Date())}`,
		`DTSTART:${formatCalendarDate(start)}`,
		`DTEND:${formatCalendarDate(new Date(start.getTime() + 3 * 60 * 60 * 1000))}`,
		"TRANSP:TRANSPARENT",
		`SUMMARY:${escapeCalendarText(title)}`,
		`LOCATION:${escapeCalendarText(location)}`,
		`DESCRIPTION:${escapeCalendarText(`${description}\n${url}`)}`,
		`URL:${url}`,
		"END:VEVENT",
		"END:VCALENDAR",
	];
	const encoder = new TextEncoder();
	const foldedLines = lines.map((line) => {
		let folded = "";
		let length = 0;
		// Fold at 75 octets without splitting UTF-8 characters (RFC 5545).
		for (const character of line) {
			const size = encoder.encode(character).length;
			if (length + size > 75) {
				folded += "\r\n ";
				length = 1;
			}
			folded += character;
			length += size;
		}
		return folded;
	});
	const blob = new Blob([`${foldedLines.join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
	const objectUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = objectUrl;
	link.download = `${league}-${gameId}.ics`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
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
