# StatVault — Sports Analytics & Fantasy Hub

A single-page sports analytics, fantasy and betting-research hub: live scores and standings, deep player and team stats, fantasy tools, prediction models and AI scouting reports.

> Cloudflare version: [sports-analytics-hub-cloudflare](https://github.com/nikkimasani/sports-analytics-hub-cloudflare) · https://statvault-cloudflare.pages.dev

**Live:** https://sports-analytics-hub-eight.vercel.app

## What's inside

- **Scores & news** — dashboard, live scores, league standings, sports news
- **Stats** — player and team statistics, compare players, leaderboards, advanced metrics, player deep dive, head-to-head, career arcs, depth charts, streaks, injury impact
- **Models** — prediction and projection models, season simulator, playoff probability, win-probability charts, matchup heatmaps, power rankings, trends & insights
- **Fantasy** — draft assistant, mock drafts, roster optimizer, waiver wire, trade analyzer, league import, custom scoring builder, DFS lineup optimizer
- **Betting research** — betting models, prop bet analyzer, bankroll tracker
- **AI scouting reports** and a research-papers section
- Watchlist, settings and data export; installable PWA

## How it's built

Plain HTML/CSS/JS (no build step) plus three Vercel serverless functions.

| Path | What it does |
|---|---|
| `index.html`, `styles.css`, `data.js` | The app |
| `api/espn.js` | Proxies ESPN's public site API for scores, standings and stats |
| `api/odds.js` | The Odds API proxy (needs `ODDS_API_KEY`) |
| `api/scout.js` | AI scouting reports via Anthropic (needs `ANTHROPIC_API_KEY`) |
| `sw.js`, `manifest.json` | PWA |
| `vercel.json` | Routes `/api/*` to functions and everything else to `index.html` |

## Run locally

```bash
npx vercel dev
```

## Environment variables

| Variable | Used for |
|---|---|
| `ODDS_API_KEY` | Betting odds |
| `ANTHROPIC_API_KEY` | AI scouting reports |

## Deploy

Push to `main`; Vercel deploys automatically.
