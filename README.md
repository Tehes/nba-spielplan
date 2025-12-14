## NBA Schedule (german: nba-spielplan)

NBA Schedule is a lightweight Progressive Web App (PWA) that shows every NBA game in your local
timezone, keeps live scores in sync, and lets you filter the schedule for exactly what you care
about—without ads or trackers. The UI is written in plain HTML/CSS/JS, backed by a tiny Deno edge
function that shields the official NBA JSON feeds, handles derived standings, and caches only the
season year for bracket calls.

---

### Check It Out

Visit the live build at https://nba-spielplan.de/ and explore the schedule directly in
your browser.

---

### Feature Tour

- **Today view**
  - Shows every game scheduled for the current day in your timezone.
  - Displays team logos, colors, records, and automatically switches between scheduled, live, and
    final states.
  - Polls the live scoreboard every minute while at least one game is live, overlaying in-progress
    scores.
  - Cards are clickable and open the built-in boxscore + play-by-play overlay.

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
  - NBA Cup bracket (In-Season Tournament) that renders quarterfinals onward once the official
    bracket feed lists all matchups.

- **Offline-ready PWA**
  - Installable via `manifest.json`, Apple touch meta tags, and service-worker registration.
  - Service worker applies a cache-first, stale-while-revalidate strategy for the shell, fonts, and
    API calls so the schedule works offline.
  - Client-side Cache Storage keeps the most recent schedule/standings payloads and reuses them
    between visits until fresh data arrives.

- **Quality-of-life touches**
  - Preferences for “show scores” and “prime time only” persist in `localStorage`.
  - Data automatically refreshes when the tab becomes visible or when a new day starts.

- **Boxscore overlay**
  - Opens when clicking any live or finished game.
  - Shows full period scoring (Q1–Q4, OT1+).
  - Lists starters and bench with complete statlines (MIN, PTS, REB, AST, STL, BLK, TOV, PF, FG, 3P,
    FT).
  - Uses static HTML templates for fast client‑side rendering.
  - Works offline if the data was previously cached.

- **Excitement meter (german: Spannungsmeter)**
  - Calculates an excitement score (0–100) for finished games from play-by-play closeness, lead
    changes, comebacks, crunch-time moments, offense, and OT bonuses.
  - Shows a labeled 1–10 rating above the overlay tabs once a game is final.

- **Play-by-Play Tab**
  - Live-by-play feed with time, description, and score delta.
  - Toggle to show only made shots for a quick scoring view.

- **Lightweight & fast**
  - Minimal bundle, no frameworks, fast loading even on slow networks.
  - Focuses on the essentials only, avoiding the bloat of typical sports apps.

- **Clear, uncluttered UI**
  - Schedule-first design with clean typography and color‑coded teams.
  - Optimized for quick scanning on both mobile and desktop.

- **App-like experience**
  - Can be added to the Homescreen and behaves like a native app.
  - Auto-refreshes on day changes and tab visibility.

- **Privacy-first**
  - No ads, no third-party scripts, no trackers of any kind.
  - Only lightweight Umami analytics, self-hosted and privacy-friendly.

---

### Data Flow & Backend

The backend is powered by a Deno Deploy edge function (api/main.js), which proxies and sanitizes NBA
endpoints:

| Endpoint          | Purpose                                | Notes                                                                                      |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/schedule`       | Raw league schedule from `cdn.nba.com` | Fetched fresh per request; client Cache API handles reuse.                                 |
| `/standings`      | Derived standings table                | Recomputed from the fresh schedule; client Cache API keeps the payload warm.               |
| `/scoreboard`     | Live in-day scoreboard feed            | Always proxied without caching; powers the boxscore overlay and in-day score updates.      |
| `/playoffbracket` | Official bracket JSON                  | Uses a 24h-cached season year, then proxies the official bracket feed.                     |
| `/istbracket`     | NBA Cup (IST) bracket JSON             | Uses a 24h-cached season year, then proxies the official ISTBracket feed.                  |
| `/boxscore/:id`   | Per-game boxscore                      | Uncached proxy to the NBA live boxscore JSON.                                              |
| `/playbyplay/:id` | Per-game play-by-play                  | Uncached proxy to the NBA live play-by-play JSON.                                          |

The frontend consumes these endpoints via `fetchData`, which first checks the Cache API before
hitting the network. When games are live, the app polls `/scoreboard` every minute and merges the
fresh scores into the already-rendered cards. The client caches `schedule`, `standings`, and
`istbracket` responses (`nba-data-cache`) and the service worker uses stale-while-revalidate for the
app shell and API calls on the same origin.

---

### Development

- Service Worker toggles live in `js/app.js`: set `useServiceWorker` to `false` for local debugging
  or bump `serviceWorkerVersion` to force a fresh cache on deploy.
