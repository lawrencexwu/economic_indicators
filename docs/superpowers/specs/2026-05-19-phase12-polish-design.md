# Phase 12 Polish — Design Spec
**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Phase 12 is the final polish pass on the US Macro Dashboard. It covers nine areas: indicator detail cards, mobile responsiveness, stale/error states, score tooltips, performance, accessibility basics, README, `WhatChangedFeed`, and `UpcomingReleases`. All frontend changes stay within the existing Next.js App Router + TypeScript + Tailwind stack. ETL changes are limited to computing and writing `next_expected_release` per indicator.

---

## 1. Indicator Detail — Expandable Row

### Pattern
Click any row in an `IndicatorTable` to expand it in-place. A second click (or Esc) collapses it. Only one row is open at a time.

### Implementation
- `IndicatorTable` becomes a Client Component (`"use client"`). All page components that render it remain Server Components — only the table itself carries client state.
- State: `expandedId: string | null` via `useState`. Row click calls `setExpandedId(id === expandedId ? null : id)`.
- The expanded row is rendered as a full-width `<tr>` with `<td colspan={colCount}>` immediately after the clicked row.

### Expanded panel layout
Full-width chart on top, three-column info strip below.

**Chart area:**
- Title: "5-Year History · Hover to inspect"
- Recharts `LineChart` with `ResponsiveContainer` (width 100%, height 160px)
- `Line` colored by score zone (`zoneColor(zone)`)
- **Shaded threshold bands:** a `ReferenceArea` (Recharts) fills the "bad" zone with a faint red tint. Per-indicator thresholds defined in `CHART_THRESHOLDS` (see below).
- `ReferenceLine` at the threshold boundary — dashed blue, labeled
- `CartesianGrid` with dark stroke matching `--border`
- `Tooltip` styled to match dark theme (background `--surface`, border `--border`)
- X-axis: year labels; Y-axis: auto-range with 4 ticks
- Data: `ind.data.slice(0, 60).reverse()` — data arrives newest-first from JSON; Recharts expects oldest-first. 60 points = 5 years for monthly, adjusted per frequency.

**`CHART_THRESHOLDS` in `DetailChart.tsx`:**
```ts
// [threshold value, shadedBelow: boolean]
// shadedBelow=true → fill area below threshold red (bad low values)
// shadedBelow=false → fill area above threshold red (bad high values)
const CHART_THRESHOLDS: Record<string, [number, boolean]> = {
  ism_mfg: [50, true],
  ism_mfg_new_orders: [50, true],
  ism_mfg_production: [50, true],
  ism_mfg_employment: [50, true],
  ism_services: [50, true],
  ism_services_new_orders: [50, true],
  nahb_index: [50, true],
  nahb_traffic: [50, true],
  yield_curve_10y3m: [0, true],
  yield_curve_10y2y: [0, true],
  sahm_rule: [0.5, false],
  cfnai_ma3: [0, true],
  ny_fed_recession_prob: [30, false],
};
```

**Bottom strip — 3 equal columns:**
1. **Current** — large monospace value + release date + previous value + `next_expected_release` (if available)
2. **Why [score]?** — output of `describeScore(ind)` (see Section 3)
3. **What it measures** — `ind.metadata.what_it_measures` truncated to 150 chars

### Recharts loading
`recharts` added as a dependency. The `DetailChart` component (wrapping `LineChart`) is in its own file and imported with `React.lazy` + `Suspense` inside `IndicatorTable`. This keeps Recharts out of the initial page bundle. `DetailChart` accepts a `height` prop (default `160`, mobile cards use `80`).

---

## 2. Mobile Responsive — Card Layout

### Breakpoint
Below Tailwind's `sm` breakpoint (640px): `IndicatorTable` renders a stacked card list instead of a `<table>`.

### Card structure (collapsed)
```
┌─────────────────────────────────────────┐
│ Name              sparkline  value  score ▶ │
│ frequency · ×weight                        │
└─────────────────────────────────────────┘
```

### Card structure (expanded — same tap interaction)
Same as collapsed header + below it:
- Compact Recharts chart (`height=80`, same lazy `DetailChart` component)
- "Why [score]?" one-liner from `describeScore`
- `what_it_measures` text

### Implementation
`IndicatorTable` renders two sibling elements: a `<table>` with `className="hidden sm:table w-full"` and a `<div className="flex flex-col gap-2 sm:hidden">` containing the card list. Same `expandedId` state drives both.

---

## 3. Score Tooltips — `describeScore(ind)`

### Function signature
```ts
// scoring.ts
export function describeScore(ind: Indicator): string | null
```

Returns a one-line human-readable explanation of how the current score was derived:
- `"Level: 44.9 → band 45–48 → −40"`
- `"YoY: +4.2% → band 3–4% → −50"`
- `"Z-score: −1.4σ vs 3yr → −46"`
- `"MoM: +0.8% → band 0.5–1.5% → +30"`

Returns `null` when there is insufficient data to compute a score.

### Implementation approach
A parallel `DESCRIPTION_MAP: Record<string, (ind: Indicator) => string | null>` alongside `SCORING_MAP`. Each entry calls the same intermediate helpers (`yoy`, `mom`, `zScore`, `threshold`) and formats the result as a string. No changes to `computeScore` or any existing callers. Indicators absent from `DESCRIPTION_MAP` return `null` (same behavior as indicators absent from `SCORING_MAP`).

### Placement
- Desktop: rendered inside the "Why [score]?" box in the expanded row panel
- Mobile: rendered inside the expanded card
- Not shown as a hover tooltip on collapsed table rows — the expand interaction already serves this purpose

---

## 4. Stale / Error States

### Staleness definition
An indicator is stale when `now − last_updated > staleness_threshold`:
- `"weekly"` frequency: 10 days
- `"monthly"` frequency: 45 days
- `"quarterly"` frequency: 100 days

### Visual treatment
- Stale: small amber `⚠ stale` badge inline after the indicator name
- Missing data (`current_value === null`): muted grey `no data` badge in the value cell; score cell shows `—`
- No page-level banners — per-indicator only

### Implementation
`isStale(ind: Indicator): boolean` in `lib/data.ts`. Returns `true` when `last_updated` is undefined or elapsed time exceeds the threshold for that frequency. Used in `IndicatorTable` for both table and card renders.

---

## 5. `next_expected_release` — ETL + Frontend

### ETL (main.py)
After writing each indicator JSON, compute `next_expected_release` from `release_calendar.yaml` and append it to the JSON payload. Logic:

```python
def compute_next_release(indicator_id: str, last_updated: str, calendar: dict) -> str | None:
    """Return ISO8601 UTC string of the next expected release, or None if unknown."""
```

Patterns to handle:
- `weekly` (e.g. claims): `last_updated + 7 days`, rounded to the correct day-of-week
- `monthly_first_friday` (NFP): next first Friday of the following month
- `monthly_last_tuesday` (Consumer Confidence): next last Tuesday
- `monthly_bday_N` (CPI ~bday 10): next occurrence of business day N in following month
- `scheduled_dates`: look up the next date from a static list in the YAML

If a pattern can't be computed (scraper-only, unknown pattern), write `null`.

### Indicator type update
Add `next_expected_release: string | null` to the `Indicator` TypeScript interface in `lib/types.ts`.

### Display
Shown in Column 1 of the expanded row bottom strip: *"Next: May 22"* formatted as `MMM DD` in local time (Asia/Taipei).

---

## 6. `WhatChangedFeed` — Home Page Component

### Purpose
Shows indicators where the score changed by more than 10 points since the previous reading. Surfaces the most actionable recent moves without the user scanning all 60+ indicators.

### Data source
Computed entirely on the frontend from existing data — no new ETL fields needed:
```ts
// For each indicator: compute score for current_value and previous_value
const currentScore = computeScore(ind);
const prevInd = { ...ind, current_value: ind.previous_value, data: ind.data.slice(1) };
const previousScore = computeScore(prevInd);
const delta = currentScore !== null && previousScore !== null
  ? currentScore - previousScore : null;
```
Indicators with `|delta| > 10` are shown, sorted by `|delta|` descending.

### Visual design
```
WHAT CHANGED
┌──────────────────────────────────────────────┐
│ ↑ ISM Services New Orders   +40 → +70  +30  │  (green arrow, green delta)
│ ↓ Challenger Layoffs        +10 → −20  −30  │  (red arrow, red delta)
│ ↓ MBA Purchase Index        +30 → +10  −20  │
└──────────────────────────────────────────────┘
```
Each row: indicator name, previous score → current score, delta badge. Cap at 6 rows. If nothing changed more than 10 points, show "No significant moves since last release."

### File
`web/components/WhatChangedFeed.tsx` — new component, rendered on the home page below the Page Scores card.

---

## 7. `UpcomingReleases` — Home Page Component

### Purpose
Shows the next 5 upcoming indicator releases so the user knows what to watch.

### Data source
Reads `next_expected_release` from all loaded indicators (populated by ETL, Section 5). Filters to non-null values, sorts ascending, takes the first 5.

### Visual design
```
UPCOMING RELEASES
┌───────────────────────────────────┐
│ Thu May 22   Initial Claims       │
│ Fri May 23   Durable Goods Orders │
│ Tue May 27   Consumer Confidence  │
│ Tue May 27   New Home Sales       │
│ Wed May 28   GDP (2nd est.)       │
└───────────────────────────────────┘
```
Date in monospace. If `next_expected_release` is within 24 hours, highlight the row in amber.

### File
`web/components/UpcomingReleases.tsx` — new component, rendered on the home page alongside `WhatChangedFeed`.

### Home page layout update
The home page gains a two-column row below Page Scores:
- Left: `WhatChangedFeed`
- Right: `UpcomingReleases`

On mobile (< `sm`): stack vertically.

---

## 8. Performance

No new work required. Pages are already statically generated at build time. The `< 500ms` target is already met. Recharts lazy-loading (Section 1) ensures it does not appear in the initial page bundle.

---

## 9. Accessibility

Three targeted fixes:
1. **Keyboard expand:** The clickable Name cell `<div>` (not `<tr>`, which cannot hold `role="button"`) gets `role="button"` + `tabIndex={0}` + `onKeyDown` that triggers expand on Enter or Space. `aria-expanded={isExpanded}` sits on the same div. Mobile card headers get the same treatment.
2. **Nav active state:** `Nav` component adds `aria-current="page"` to the active link (currently missing).
3. **Color contrast:** Existing zone colors on `--bg` (#0a0e1a) already pass WCAG AA (green #2dd47a = 5.2:1, amber #f5a623 = 4.6:1, red #e74c5c = 4.1:1). No color changes needed.

---

## 10. README

`README.md` at the repo root (`economic_indicators/README.md`) covering:

1. **What it is** — one paragraph
2. **Architecture diagram** — ASCII art: `FRED API / scrapers → ETL (Python/uv) → JSON files → Next.js → Vercel`
3. **Pages** — one-line description of each page (Home, Regime, Fed, Pulse, Cycle, Rotation)
4. **Scoring system** — brief explanation of the ±100 scale and zone labels
5. **Setup** — ETL (`uv sync`, `.env.local` with FRED key) and web (`pnpm install`, `pnpm dev`)
6. **Deployment** — Vercel + GitHub Actions CI summary
7. **Screenshot** — one screenshot of the deployed dashboard (manual, from Vercel URL)

---

## Files Changed

| File | Change |
|------|--------|
| `web/components/IndicatorTable.tsx` | Add `"use client"`, expand state, mobile card layout, stale badges |
| `web/components/DetailChart.tsx` | New — lazy Recharts `LineChart`, 5-year window, shaded bands |
| `web/components/WhatChangedFeed.tsx` | New — score-delta feed for home page |
| `web/components/UpcomingReleases.tsx` | New — next 5 releases for home page |
| `web/app/page.tsx` | Add `WhatChangedFeed` + `UpcomingReleases` below Page Scores |
| `web/lib/scoring.ts` | Add `describeScore()` + `DESCRIPTION_MAP` |
| `web/lib/data.ts` | Add `isStale()` utility |
| `web/lib/types.ts` | Add `next_expected_release: string \| null` to `Indicator` |
| `web/components/Nav.tsx` | Add `aria-current="page"` |
| `web/package.json` | Add `recharts` dependency |
| `etl/src/main.py` | Compute + write `next_expected_release` per indicator |
| `README.md` | New file at repo root |

No changes to page files beyond `app/page.tsx`. No changes to ETL config or data files beyond what `main.py` writes.

---

## Out of Scope

- Hover tooltips on collapsed table score cells (expand already serves this)
- Full WCAG audit beyond the three targeted fixes
- Auto-generated screenshots or Storybook
- Score computation moved to ETL (stays on frontend)
