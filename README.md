# US Macro Dashboard

A systematic daily-updated dashboard tracking 60+ US macroeconomic indicators for equity positioning decisions. Each indicator is scored on a ±100 scale and aggregated into page-level and master composite scores.

## Architecture

```
FRED API / Web Scrapers
        │
        ▼
ETL (Python / uv)           etl/src/main.py
        │  writes JSON per indicator
        ▼
data/indicators/<id>.json
        │  read at build time (no API calls in Next.js)
        ▼
Next.js App Router          web/
        │
        ▼
Vercel (static site, rebuilt daily)
```

## Pages

| Page | What it shows |
|------|---------------|
| **Home** | Master Composite score, Business Cycle phase, Page Scores summary, What Changed feed, Upcoming Releases |
| **Regime** | Recession risk: yield curve, Sahm Rule, CFNAI, LEI, claims |
| **Fed** | Inflation and labor market indicators driving Fed policy decisions |
| **Pulse** | High-frequency weekly indicators: claims, MBA, AAR rail, regional surveys |
| **Cycle** | Activity cycle: ISM PMIs, GDP, industrial production, NFIB |
| **Rotation** | Sector rotation signals: housing, consumer spending, sentiment |

## Scoring System

Each indicator is scored **±100** using one of:

- **Level threshold** — ISM above/below 50, yield curve spread, Sahm Rule
- **YoY % change bands** — CPI, payrolls, retail sales, industrial production
- **Z-score vs trailing window** — UMich sentiment, MBA applications, claims

Score zones:

| Score | Zone |
|-------|------|
| +60 to +100 | STRONG BULL |
| +20 to +59  | BULL |
| −19 to +19  | NEUTRAL |
| −20 to −59  | BEAR |
| −60 to −100 | STRONG BEAR |

Page scores are weighted averages of their indicators. The Master Composite is a weighted average across all pages.

## Setup

### ETL

```bash
cd etl
uv sync
cp .env.local.example .env.local   # add FRED_API_KEY=<your_key>
uv run python -m src.main
```

Data is written to `data/indicators/<id>.json`. Run daily via GitHub Actions.

### Web

```bash
cd web
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
```

## Deployment

The dashboard is deployed on **Vercel**. GitHub Actions CI runs the ETL on a daily cron schedule, commits the updated JSON files, and pushes — which triggers a Vercel rebuild.

Required GitHub secrets:
- `FRED_API_KEY` — FRED API key (never hardcoded in source)
- Vercel deploy hook URL

## Screenshot

*(Add a screenshot from the deployed Vercel URL here)*
