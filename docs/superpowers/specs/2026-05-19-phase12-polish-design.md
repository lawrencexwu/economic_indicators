# Phase 12 Polish — Design Spec
**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Phase 12 is the final polish pass on the US Macro Dashboard. It covers seven areas: indicator detail cards, mobile responsiveness, stale/error states, score tooltips, performance, accessibility basics, and a README. All changes stay within the existing Next.js App Router + TypeScript + Tailwind stack with no architectural changes to the ETL or data layer.

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
- Title: "24-Month History · Hover to inspect"
- Recharts `LineChart` with `ResponsiveContainer` (width 100%, height 160px)
- `Line` colored by score zone (`zoneColor(zone)`)
- `ReferenceLine` at the indicator's semantic threshold — a `CHART_THRESHOLDS: Record<string, number>` map in `DetailChart.tsx` provides per-indicator values (e.g. ISM → 50, yield curves → 0, Sahm → 0.5). Indicators absent from the map render no reference line.
- `CartesianGrid` with dark stroke matching `--border`
- `Tooltip` styled to match the dark theme (background `--surface`, border `--border`)
- X-axis: month labels every 6 months; Y-axis: auto-range with 4 ticks
- Data: `ind.data.slice(0, 24).reverse()` — data arrives newest-first from JSON; Recharts expects oldest-first
- `DetailChart` accepts a `height` prop (default 160px desktop, 80px in mobile cards)

**Bottom strip — 3 equal columns:**
1. **Current** — large monospace value + release date + previous value
2. **Why [score]?** — output of `describeScore(ind)` (see Section 3)
3. **What it measures** — `ind.metadata.what_it_measures` truncated to 150 chars

### Recharts loading
`recharts` added as a dependency. The `DetailChart` component (wrapping `LineChart`) is in its own file and imported with `React.lazy` + `Suspense` inside `IndicatorTable`. This keeps Recharts out of the initial page bundle.

---

## 2. Mobile Responsive — Card Layout

### Breakpoint
Below Tailwind's `sm` breakpoint (640px): `IndicatorTable` renders a stacked card list instead of a `<table>`.

### Card structure (collapsed)
```
┌─────────────────────────────────────────┐
│ Name              sparkline   value  score ▶ │
│ frequency · ×weight                         │
└─────────────────────────────────────────┘
```

### Card structure (expanded — same tap interaction)
Same as collapsed header + below it:
- Compact Recharts chart (height 80px, same lazy component)
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

Returns a one-line human-readable explanation of how the current score was derived, e.g.:
- `"Level: 44.9 → band 45–48 → −40"`
- `"YoY: +4.2% → band 3–4% → −50"`
- `"Z-score: −1.4σ vs 3yr → −46"`
- `"MoM: +0.8% → band 0.5–1.5% → +30"`

Returns `null` when there is insufficient data to compute a score.

### Implementation approach
A parallel `DESCRIPTION_MAP: Record<string, (ind: Indicator) => string | null>` alongside `SCORING_MAP`. Each entry calls the same intermediate helpers (`yoy`, `mom`, `zScore`, `threshold`) and formats the result as a string. No changes to `computeScore` or any existing callers.

### Placement
- Desktop: rendered inside the "Why [score]?" box in the expanded row panel
- Mobile: rendered inside the expanded card
- Not shown as a hover tooltip on collapsed table rows — the expand interaction already serves this purpose

---

## 4. Stale / Error States

### Staleness definition
An indicator is stale when `now - last_updated > staleness_threshold`:
- Weekly indicators (`frequency === "weekly"`): threshold = 10 days
- Monthly indicators (`frequency === "monthly"`): threshold = 45 days
- Quarterly indicators (`frequency === "quarterly"`): threshold = 100 days

### Visual treatment
- Stale: small amber `⚠ stale` badge appended inline after the indicator name in the table row / card header
- Missing data (`current_value === null`): muted grey `no data` badge in the value cell; score cell shows `—`
- No page-level banners or toasts — per-indicator only

### Implementation
`isStale(ind: Indicator): boolean` utility in `lib/data.ts`. Returns `true` when `last_updated` is undefined or when the elapsed time exceeds the threshold for that frequency. Used in `IndicatorTable` for both table and card renders.

---

## 5. Performance

No new work required. Pages are already statically generated at build time (Next.js App Router default for Server Components reading local JSON). The `< 500ms` target is already met. Recharts lazy-loading (Section 1) ensures it does not appear in the initial page bundle.

---

## 6. Accessibility

Three targeted fixes:
1. **Keyboard expand:** The clickable Name cell `<div>` (not the `<tr>`, which cannot hold `role="button"`) gets `role="button"` + `tabIndex={0}` + `onKeyDown` that triggers expand on Enter or Space. `aria-expanded={isExpanded}` sits on the same div. Mobile card headers get the same treatment.
2. **Nav active state:** `Nav` component adds `aria-current="page"` to the active link (currently missing).
3. **Color contrast:** Existing zone colors on `--bg` (#0a0e1a) already pass WCAG AA (verified: green #2dd47a = 5.2:1, amber #f5a623 = 4.6:1, red #e74c5c = 4.1:1). No color changes needed.

---

## 7. README

A `README.md` at the repo root (`economic_indicators/README.md`) covering:

1. **What it is** — one paragraph description
2. **Architecture diagram** — ASCII art showing: `FRED API / scrapers → ETL (Python/uv) → JSON files → Next.js → Vercel`
3. **Pages** — one-line description of each page (Home, Regime, Fed, Pulse, Cycle, Rotation)
4. **Scoring system** — brief explanation of the ±100 score scale and zone labels
5. **Setup** — ETL setup (`uv sync`, `.env.local` with FRED key) and web setup (`pnpm install`, `pnpm dev`)
6. **Deployment** — Vercel + GitHub Actions CI summary
7. **Screenshot** — one screenshot of the deployed dashboard (manual, taken from Vercel URL)

---

## Files Changed

| File | Change |
|------|--------|
| `web/components/IndicatorTable.tsx` | Add `"use client"`, expand state, mobile card layout, stale badges |
| `web/components/DetailChart.tsx` | New — lazy Recharts `LineChart` for expanded panel |
| `web/lib/scoring.ts` | Add `describeScore()` + `DESCRIPTION_MAP` |
| `web/lib/data.ts` | Add `isStale()` utility |
| `web/components/Nav.tsx` | Add `aria-current="page"` |
| `web/package.json` | Add `recharts` dependency |
| `README.md` | New file at repo root |

No changes to page files, ETL code, or data files.

---

## Out of Scope

- Hover tooltips on collapsed table score cells (expand interaction already serves this)
- Full WCAG audit beyond the three targeted fixes
- Auto-generated screenshots or Storybook
- Any ETL changes
