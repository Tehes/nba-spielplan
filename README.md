# NBA/WNBA Schedule (german: nba-spielplan)

NBA/WNBA Schedule is a lightweight Progressive Web App (PWA) that shows NBA and WNBA games in your
local timezone, keeps live scores in sync, and lets you filter the schedule for exactly what you
care about—without ads or trackers. The UI is written in plain HTML/CSS/JS, backed by a tiny Deno
edge function that shields the official NBA and WNBA JSON feeds, normalizes official standings, and
coordinates the active season across feeds while storing season-scoped excitement ratings in KV.

---

## Check It Out

Visit the live build at [nba-spielplan.de](https://nba-spielplan.de/) and explore the schedule directly in
your browser.

For English-speaking users in the US, link directly to
[nba-spielplan.de/?mode=en-us](https://nba-spielplan.de/?mode=en-us) to open the English UI with
US broadcast labels immediately.

The app defaults to the NBA, but users can switch to the WNBA in the top menu. Direct links can use
`?league=nba` or `?league=wnba`; the selected league is stored locally between visits.

---

## Feature Tour

- **Today view**
  - Shows every game scheduled for the current day in your timezone.
  - Lets you move backward or forward by day from the headline controls, switching the headline to
    yesterday, tomorrow, or a specific date.
  - Displays team logos, colors, records, and automatically switches between scheduled, live, and
    final states.
  - Shows broadcast labels based on the selected mode: German broadcasts in `DE`, US broadcasts in
    `EN (US)`, and no broadcast labels in `EN`.
  - Polls the live scoreboard every minute while at least one game is live, overlaying in-progress
    scores.
  - Entire game cards link to the game detail page, including scheduled, live, and finished games.
  - A selected day other than today is stored in the URL as `date=YYYY-MM-DD`, so browser Back
    and reloading restore it. Today uses no date parameter; without a valid date, the schedule starts with today.

- **More games view**
  - Lists recent results plus upcoming games, grouped by date.
  - Adjusts around the selected Today view date so the currently focused day is not duplicated.
  - Filters by franchise (team picker), hides already played games, or restricts the list to “prime
    time” tip-offs (18:00–23:59 local time).
  - Uses team color accents so you can scan cards quickly.
  - Shows broadcast labels based on the selected mode.

- **Broadcaster filter**
  - Find games in the More games view that are listed for the broadcasters you use.
  - Select one or more providers; games match if any selected provider carries them. Combine the
    selection with the team, prime-time, and past-games filters.
  - Provider options come from the loaded schedule for the selected league and region. The filter
    is hidden when no providers are available, including in the global `EN` mode.
  - Defaults to all providers, including games without broadcast information. Selection resets on
    reload or league/mode changes.

- **League menu**
  - Top menu switches between NBA and WNBA schedules.
  - Team filters, logos, colors, standings, boxscores, play-by-play data, and recap links follow the
    active league.
  - NBA remains the default for existing links and cached users.

- **Season context**
  - Progress bar keeps track of the percentage of finished regular-season games for the active
    league, using the active standings team count and configured games per team.
  - NBA conference standings and WNBA overall standings (W-L, games behind, streak, home/away
    splits), with NBA divisions and WNBA conferences available as secondary views.
  - Official NBA and WNBA playoff brackets that render round-by-round once the active season's feed
    becomes available.
  - NBA Cup bracket (In-Season Tournament) that renders quarterfinals onward once the official
    bracket feed lists all matchups.

- **Offline-ready PWA**
  - Installable via `manifest.json`, Apple touch meta tags, and service-worker registration.
  - Service worker keeps the app shell and fonts available through a stale-while-revalidate strategy.
  - Client-side Cache Storage keeps the most recent season-specific schedule, standings, and bracket
    payloads and reuses them between visits until fresh data arrives.

- **Quality-of-life touches**
  - German and English UI localization, with a language and broadcast mode picker in the top menu.
  - English users in the US can be sent straight to `https://nba-spielplan.de/?mode=en-us`.
  - Preferences for league, mode, “show scores”, “show game rating”, and “prime time only”
    persist in `localStorage`.
  - Data automatically refreshes when the tab becomes visible or when a new day starts.

- **Game details**
  - Open when clicking a game card.
  - Splits game details into Overview, Boxscore, and Play-by-Play tabs.
  - Shows previous head-to-head matchups between the two teams before the selected game.
  - Shows full period scoring (Q1–Q4, OT1+).
  - Lists starters and bench with complete statlines (MIN, PTS, REB, AST, STL, BLK, TOV, PF, FG, 3P,
    FT).
  - Marks players currently on the court with a red dot during live games.
  - “Animated Replay” opens finished NBA and WNBA games in
    [Hoops Replay](https://github.com/Tehes/hoops-replay), another project by the same author, in a new
    tab. Replay availability depends on Hoops Replay.
  - Adds a direct NBA.com or WNBA.com recap link for finished games, opening the official game recap
    externally.
  - Uses static HTML templates for fast client‑side rendering.

- **Excitement meter (german: Spannungsmeter)**
  - Calculates an excitement score (0–100) for finished games from play-by-play closeness, lead
    changes, comebacks, crunch-time moments, offense, and OT bonuses.
  - Shows a labeled 1–10 rating between the hero card and game details once a game is final.
  - Reads cached ratings from the backend first and falls back to client-side play-by-play
    calculation for missing games.
  - Shows a Top 10 list of the most exciting games once regular-season progress reaches 100%,
    using cached backend ratings.

- **Shareable game detail page**
  - `game.html?id=0022600001&league=nba&mode=de` opens a standalone game page. `league` accepts
    `nba` or `wnba`; `mode` uses the same `de`, `en-us`, and `en` values as the schedule.
  - The team-colored header shows the matchup, local tip-off, venue, broadcasts, and live or final
    score. Scores are always visible here, independently of the schedule's spoiler preference.
  - Overview, Boxscore, and Play-by-Play use the game rendering module. `#overview`, `#boxscore`,
    and `#playbyplay` can select a tab directly.
  - Active games refresh every minute while the page is visible. Scheduled games check for tip-off;
    the schedule refreshes every 15 minutes, and finished games stop polling.
  - Before scheduled NBA tip-off, Overview shows estimated win probabilities when FanDuel odds are
    available. Team-colored bars and rounded percentages add up to 100%. Odds refresh at most every
    five minutes while the page is visible, using the endpoint's 60-second HTTP cache.
  - The detail page saves its schedule and odds in the existing data cache for offline visits.
    Cached odds appear immediately; successful refreshes replace them, including an empty feed.
    Odds are hidden from scheduled tip-off onward and for live, finished, or postponed games.
  - Share on the detail page uses the direct `game.html` URL on the site's current origin, including its game ID,
    league, and language mode. Browsers without native sharing copy the link instead. Social previews
    use game-detail metadata and the shared site image.
  - Only games in the current schedule are supported. Unavailable games show a link back to the
    schedule; no season archive is maintained.

- **Calendar export**
  - Download an ICS calendar file from the detail page for upcoming NBA and WNBA games with a
    confirmed tip-off time. The button disappears at tip-off and is hidden for postponed games.
  - Includes the matchup, start time, venue, detail-page link, and an estimated three-hour duration.
  - Generates the file entirely in the browser. Import behavior depends on the device and calendar
    app; imported events do not automatically update if a game is rescheduled.

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
  - No ads or advertising trackers.
  - Uses lightweight Umami analytics loaded from `cloud.umami.is`.

---

## Data Flow & Backend

The backend is powered by a Deno Deploy edge function (api/main.js), which proxies and sanitizes NBA
and WNBA endpoints. NBA is the default; league-aware endpoints also accept `?league=nba` or
`?league=wnba`. The schedule endpoint accepts `?region=de`, `?region=us`, or `?region=none` for
broadcast labels.

| Endpoint               | Purpose                         | Notes                                                                                    |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `/schedule`            | Raw league schedule             | Fetched fresh per request; client Cache API handles reuse.                               |
| `/standings`           | Normalized standings            | Uses the active season's official feed and includes NBA divisions.                       |
| `/scoreboard`          | Live in-day scoreboard feed     | Always proxied without caching; powers the game detail page and in-day score updates. |
| `/odds`                | Estimated win probabilities     | NBA-only; normalizes FanDuel win odds to 100%; HTTP-cacheable for 60 seconds.             |
| `/top-excitement`      | Top excitement-rated games      | Read-only KV endpoint for the current season's cached highlight list.                    |
| `/backfill-excitement` | Excitement cache warmup         | POST endpoint that queues one lazy, batch-limited KV backfill for the active league.     |
| `/fetch-excitement`    | Specific cached ratings         | POST endpoint that reads requested game IDs from KV and returns `scores` plus `missing`. |
| `/playoffbracket`      | Official playoff bracket JSON   | NBA/WNBA; returns `available: false` until the active season's feed exists.              |
| `/istbracket`          | NBA Cup (IST) bracket JSON      | NBA-only; returns `available: false` until the active season's feed exists.              |
| `/boxscore/:id`        | Per-game boxscore               | Uncached proxy to the active league's live boxscore JSON.                                |
| `/playbyplay/:id`      | Per-game play-by-play           | Uncached proxy to the active league's live play-by-play JSON.                            |

The backend advances each league's active season only when the new schedule contains a valid game
and persists that monotonic state in KV. The frontend includes the active season in standings and
bracket cache URLs so old payloads cannot mix with a new schedule. Core endpoints are consumed via
`fetchData`, which first checks the Cache API before hitting the network. When games are live, the app polls `/scoreboard` every minute and merges the
fresh scores into the already-rendered cards. Excitement ratings are KV-first: after the initial
page data load, the client starts a non-blocking `/backfill-excitement` request, then batches
specific finished game IDs through `/fetch-excitement`; only `missing` IDs fall back to client-side
play-by-play calculation. Once regular-season progress reaches 100%, the client reads
`/top-excitement` and renders the cached Top 10 list when items are available. The client keeps NBA
and WNBA cache keys separate for schedule, standings, scoreboard, next-game markers, and excitement
ratings. NBA and WNBA playoff brackets remain hidden until the official feed contains series for
the active season. The service worker uses stale-while-revalidate for the app shell and allowed static assets,
while core API payloads use the client's separate data cache.

The `/odds` endpoint returns `{ updatedAt, games }`. Each game includes `gameId`, `homeTeamId`,
`awayTeamId`, `homeWinProbability`, and `awayWinProbability`; probabilities are percentages that
sum to 100. Only FanDuel's US `2way` market is used. Games without valid FanDuel win odds are
omitted, and an empty feed returns `games: []`. Each request reaching the API fetches the NBA feed
again, without an API cache or KV reads or writes. Responses use `Cache-Control: public, max-age=60`
without `stale-while-revalidate`. The detail page requests odds with `cache: "default"` and stores
the latest valid response separately in Cache API storage for offline use.

---

## Development

- Shared Service Worker settings live in `js/service-worker-registration.js`. Set
  `SERVICE_WORKER_CONFIG.useServiceWorker` to `false` for local debugging, or bump its
  `serviceWorkerVersion` once for an application update. Both HTML pages use the same version.

### Pregame odds

Manual verification:

1. Open an upcoming NBA game with odds in German and English; verify team colors and percentages
   adding up to 100% above previous matchups.
2. Revisit the game offline after loading it online; verify cached odds appear before tip-off.
3. Verify odds disappear when a fresh feed omits the game, at scheduled tip-off, or for live,
   finished, and postponed games. WNBA games must not request or display NBA odds.

### Game sharing

Publish the frontend files, including `game.html` and the shared JavaScript modules. Sharing uses
ordinary detail-page URLs and requires no additional backend routes or Deno deployment. The static
HTML contains the same social preview for every matchup; the URL parameters select the correct game
when the page opens. The detail page omits a fixed `og:url` so preview services can use the requested
URL, including its game parameters.

Manual verification:

1. Open scheduled and finished NBA and WNBA games; verify team colors, local dates, scores, and stats.
2. Follow a live game through its next refresh and final state; simulate a failed request and recovery.
3. Select a schedule day, open a game by clicking its card, then use browser Back to verify the
   selected day is restored. Open the game again and share it from the detail page.
4. Check all three tabs, language changes, and the schedule link at mobile and desktop widths.
5. After deployment, share a direct detail-page URL and verify the common site preview and correct
   destination; check an unavailable game's link back to the schedule.

## License and usage

This project is source-available, not open source.

You may view and modify the code for personal, educational, and non-commercial purposes.

If you publicly redistribute this project or a modified version of it, you must:

- link to the original project repository
- include a visible attribution to the original project and author, where technically and contextually appropriate
- clearly mark your version as modified and unofficial

Commercial use, paid hosting, resale, and misleading rebranding are not allowed without prior written permission.
