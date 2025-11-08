## NBA Schedule (nba-spielplan)

NBA Schedule is a lightweight Progressive Web App (PWA) that shows every NBA game in your local
timezone, keeps live scores in sync, and lets you filter the schedule for exactly what you care
about—without ads or trackers. The UI is written in plain HTML/CSS/JS, backed by a tiny Deno edge
function that shields the official NBA JSON feeds and adds caching plus derived standings.

---

### Check It Out

Visit the live build at https://tehes.github.io/nba-spielplan/ and explore the schedule directly in
your browser.

---

### Feature Tour

- **Today view**
  - Shows every game scheduled for the current day in your timezone.
  - Displays team logos, colors, records, and automatically switches between scheduled, live, and
    final states.
  - Polls the live scoreboard every minute while at least one game is live, overlaying in-progress
    scores and linking to the NBA play-by-play page.
  - Allows hiding scores (records are shown instead) for spoiler-free browsing.

- **More games view**
  - Lists recent results plus upcoming games, grouped by date.
  - Filters by franchise (team picker), hides already played games, or restricts the list to “prime
    time” tip-offs (18:00–23:59 local time).
  - Uses team color accents so you can scan cards quickly.

- **Season context**
  - Progress bar keeps track of the percentage of the 1,230 regular-season games that are finished.
  - Automatic standings tables for both conferences (W-L, games behind, streak, home/away splits).
  - Dynamically generated playoff bracket that plugs in the top six seeds, projects play‑in winners,
    and updates round-by-round once results are available.

- **Offline-ready PWA**
  - Installable via `manifest.json`, Apple touch meta tags, and service-worker registration.
  - Service worker applies a cache-first, stale-while-revalidate strategy for the shell, fonts, and
    API calls so the schedule works offline.
  - Client-side Cache Storage keeps the most recent schedule/standings payloads and reuses them
    between visits until fresh data arrives.

- **Quality-of-life touches**
  - Preferences for “show scores” and “prime time only” persist in `localStorage`.
  - Data automatically refreshes when the tab becomes visible or when a new day starts.
  - Clean typography with the Kanit font, team color variables, and responsive cards for mobile and
    desktop.
  - Privacy-friendly analytics via Umami.

---

### Data Flow & Backend

The backend is powered by a Deno Deploy edge function (api/main.js), which proxies and sanitizes NBA
endpoints:

| Endpoint          | Purpose                                | Notes                                                                                      |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/schedule`       | Raw league schedule from `cdn.nba.com` | Cached in-memory for 5 minutes to avoid hammering the upstream API.                        |
| `/standings`      | Derived standings table                | Recomputed from the cached schedule so preseason and neutral tournament games are ignored. |
| `/scoreboard`     | Live in-day scoreboard feed            | Always proxied without caching to keep scores real-time.                                   |
| `/playoffbracket` | Official bracket JSON                  | Direct proxy so CORS headers stay permissive.                                              |

The frontend consumes these endpoints via `fetchData`, which first checks the Cache API before
hitting the network. When games are live, the app polls `/scoreboard` every minute and merges the
fresh scores into the already-rendered cards.
