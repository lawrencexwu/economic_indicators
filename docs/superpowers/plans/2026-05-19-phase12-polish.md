# Phase 12 Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expandable indicator rows with Recharts charts, mobile card layout, stale/error badges, score descriptions, `WhatChangedFeed`, `UpcomingReleases` home-page components, and ETL `next_expected_release` computation.

**Architecture:** All frontend work stays in the existing Next.js App Router + TypeScript + Tailwind stack. `IndicatorTable` is the only component that becomes a Client Component (`"use client"`); all pages remain Server Components. `DetailChart` is a separate file, lazy-loaded via `React.lazy` + `Suspense` so Recharts stays out of the initial bundle. ETL reads `release_calendar.yaml` patterns and writes `next_expected_release` to each indicator JSON. `WhatChangedFeed` computes score deltas entirely on the frontend from existing data.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Recharts 3.x (already installed), Python 3.12 / uv, YAML

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `web/lib/types.ts` | Modify | Add `next_expected_release?: string \| null` to `Indicator` |
| `web/lib/data.ts` | Modify | Add `isStale(ind: Indicator): boolean` |
| `web/lib/scoring.ts` | Modify | Add `describeScore()` + private `DESCRIPTION_MAP` |
| `web/components/Nav.tsx` | Modify | Add `aria-current="page"` to active link |
| `web/components/DetailChart.tsx` | Create | Recharts `LineChart`, 5yr window, shaded bands, lazy-imported |
| `web/components/IndicatorTable.tsx` | Rewrite | `"use client"`, expand state, mobile cards, stale badges |
| `web/components/WhatChangedFeed.tsx` | Create | Score-delta feed (∣delta∣ > 10) for home page |
| `web/components/UpcomingReleases.tsx` | Create | Next 5 releases from `next_expected_release` |
| `web/app/page.tsx` | Modify | Add 2-col `WhatChangedFeed` + `UpcomingReleases` below Verdict |
| `etl/src/main.py` | Modify | `compute_next_release()` + write field to every payload |
| `economic_indicators/README.md` | Create | Repo-level README |

---

### Task 1: Types + `isStale()`

**Files:**
- Modify: `web/lib/types.ts`
- Modify: `web/lib/data.ts`

- [ ] **Step 1: Add `next_expected_release` to `Indicator` in `web/lib/types.ts`**

Inside the `Indicator` interface, after the `score` field, add (optional so existing JSON files without the field don't break):

```ts
export interface Indicator {
  id: string;
  name: string;
  fred_ticker: string | null;
  category: string;
  page: string;
  tier: number;
  weight: number;
  frequency: string;
  source_type: string;
  last_updated?: string;
  current_value: number | null;
  previous_value: number | null;
  data: DataPoint[];
  metadata: IndicatorMetadata;
  score: number | null;
  next_expected_release?: string | null;
}
```

- [ ] **Step 2: Add `isStale()` to `web/lib/data.ts`**

Append to the end of `web/lib/data.ts`:

```ts
import type { Indicator } from "./types";

const STALENESS_MS: Record<string, number> = {
  weekly:    10 * 24 * 60 * 60 * 1000,
  monthly:   45 * 24 * 60 * 60 * 1000,
  quarterly: 100 * 24 * 60 * 60 * 1000,
};

export function isStale(ind: Indicator): boolean {
  if (!ind.last_updated) return true;
  const threshold = STALENESS_MS[ind.frequency] ?? STALENESS_MS.monthly;
  return Date.now() - new Date(ind.last_updated).getTime() > threshold;
}
```

Note: `data.ts` already imports `Indicator` at the top — do not add a duplicate import; just append the `STALENESS_MS` constant and the exported function.

- [ ] **Step 3: Verify TypeScript compiles**

Run from `web/` directory:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Commit**
```bash
git add web/lib/types.ts web/lib/data.ts
git commit -m "feat: add next_expected_release type and isStale() utility"
```

---

### Task 2: Nav `aria-current="page"`

**Files:**
- Modify: `web/components/Nav.tsx`

- [ ] **Step 1: Add `aria-current` to the active Link**

In `web/components/Nav.tsx`, the `Link` element inside the `LINKS.map` needs one new prop when `active` is true:

```tsx
<Link
  key={href}
  href={href}
  aria-current={active ? "page" : undefined}
  style={{
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--text)" : "var(--muted)",
    background: active ? "var(--border)" : "transparent",
    textDecoration: "none",
    transition: "color 0.15s, background 0.15s",
  }}
>
  {label}
</Link>
```

- [ ] **Step 2: Commit**
```bash
git add web/components/Nav.tsx
git commit -m "fix: add aria-current=page to active nav link"
```

---

### Task 3: `describeScore()` in `scoring.ts`

**Files:**
- Modify: `web/lib/scoring.ts`

This task adds four private helpers (`describeThresholdBand`, `fmtScore`, `fmtPct`, `describeZScore`) plus the private `DESCRIPTION_MAP` and the exported `describeScore()` function.

All code below is appended to `web/lib/scoring.ts` (the file already defines `clamp`, `yoy`, `mom`, `ann3m`, `zScore`, `threshold`, `Tier`, and all scoring functions — this task only adds new code, never removes existing code).

- [ ] **Step 1: Insert private helpers immediately after the `threshold()` function definition**

Find the comment `// ── Per-indicator scoring functions` in `scoring.ts`. Insert the following block **above** that comment (i.e., right after the `threshold` function body closes):

```ts
// ── describeScore helpers ─────────────────────────────────────────────────────

function describeThresholdBand(value: number, tiers: Tier[]): string {
  for (let i = 0; i < tiers.length; i++) {
    const [thresh] = tiers[i];
    if (thresh === -Infinity || value > thresh) {
      const hi = i > 0 ? tiers[i - 1][0] : null;
      if (hi === null) return `above ${thresh}`;
      if (thresh === -Infinity) return `< ${hi}`;
      return `${thresh}–${hi}`;
    }
  }
  return "?";
}

function fmtScore(score: number | null): string {
  if (score === null) return "?";
  return score > 0 ? `+${score}` : String(score);
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function describeZScore(
  ind: Indicator,
  windowPeriods: number,
  higherIsGood: boolean,
  windowLabel: string
): string | null {
  if (ind.data.length < 4) return null;
  const win = ind.data.slice(0, Math.min(ind.data.length, windowPeriods)).map((d) => d.value);
  const mean = win.reduce((a, b) => a + b, 0) / win.length;
  const std = Math.sqrt(win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / win.length);
  if (std === 0) return null;
  const z = (ind.data[0].value - mean) / std;
  const score = clamp(higherIsGood ? z * 33 : -z * 33);
  return `Z-score: ${z >= 0 ? "+" : ""}${z.toFixed(1)}σ vs ${windowLabel} → ${fmtScore(score)}`;
}
```

- [ ] **Step 2: Append `DESCRIPTION_MAP` and `describeScore()` at the bottom of `scoring.ts` (after `SCORING_MAP` and before the `// ── Public API` comment)**

```ts
// ── Description map ───────────────────────────────────────────────────────────

type DescribeFn = (ind: Indicator) => string | null;

// Tier constants mirror those used in the scoring functions above.
const ISM_TIERS: Tier[]          = [[55,70],[52,40],[50,10],[48,-20],[45,-50],[-Infinity,-80]];
const ISM_CUST_INV_TIERS: Tier[] = [[55,-30],[50,-10],[45,10],[-Infinity,30]];
const ISM_PRICES_TIERS: Tier[]   = [[70,-40],[60,-20],[50,0],[-Infinity,20]];
const NAHB_INDEX_TIERS: Tier[]   = [[60,60],[50,30],[40,0],[30,-30],[20,-60],[-Infinity,-90]];
const NAHB_TRAFFIC_TIERS: Tier[] = [[50,60],[40,20],[30,-20],[20,-50],[-Infinity,-80]];
const YIELD_TIERS: Tier[]        = [[2.0,70],[1.0,40],[0.5,10],[0.0,-20],[-0.5,-50],[-1.0,-80],[-Infinity,-100]];
const CFNAI_TIERS: Tier[]        = [[1.0,-30],[0.7,0],[0.2,60],[-0.7,20],[-1.5,-60],[-Infinity,-100]];
const SAHM_TIERS: Tier[]         = [[0.75,-100],[0.50,-70],[0.35,-40],[0.20,0],[-Infinity,40]];
const NYFED_TIERS: Tier[]        = [[50,-90],[30,-60],[15,-30],[5,0],[-Infinity,30]];
const BREAKEVEN_TIERS: Tier[]    = [[3.5,-80],[3.0,-50],[2.5,-20],[2.0,20],[-Infinity,40]];
const UNEMP_BASE_TIERS: Tier[]   = [[6.0,-30],[5.0,0],[4.5,20],[4.0,10],[3.5,-10],[-Infinity,-20]];
const CPI_TIERS: Tier[]          = [[4.0,-80],[3.0,-50],[2.5,-20],[2.0,20],[-Infinity,60]];
const CORE_PCE_TIERS: Tier[]     = [[3.5,-90],[3.0,-60],[2.5,-30],[2.3,0],[2.0,30],[-Infinity,60]];
const PPI_TIERS: Tier[]          = [[8,-60],[4,-30],[2,0],[0,10],[-Infinity,20]];
const AHE_ECI_TIERS: Tier[]      = [[5.0,-80],[4.0,-50],[3.5,-20],[3.0,20],[-Infinity,60]];
const IP_TIERS: Tier[]           = [[3.0,50],[1.0,20],[0.0,0],[-2.0,-30],[-Infinity,-60]];
const CAP_UTIL_TIERS: Tier[]     = [[82,-30],[80,-10],[78,0],[75,-10],[70,-30],[-Infinity,-50]];
const DURABLE_TIERS: Tier[]      = [[10,50],[3,20],[0,0],[-5,-30],[-Infinity,-60]];
const NFP_TIERS: Tier[]          = [[300_000,70],[200_000,40],[100_000,10],[50_000,-10],[0,-40],[-Infinity,-80]];
const TEMP_HELP_TIERS: Tier[]    = [[5,50],[0,10],[-5,-30],[-Infinity,-70]];
const HOUSING_YOY_TIERS: Tier[]  = [[20,60],[5,30],[0,0],[-10,-30],[-Infinity,-60]];
const HOME_SALES_TIERS: Tier[]   = [[20,60],[5,30],[0,0],[-10,-30],[-Infinity,-60]];
const CASE_SHILLER_TIERS: Tier[] = [[10,40],[5,20],[0,0],[-5,-30],[-Infinity,-60]];
const RETAIL_TIERS: Tier[]       = [[1.5,60],[0.5,30],[0.0,0],[-0.5,-30],[-Infinity,-60]];
const PCE_YOY_TIERS: Tier[]      = [[5,60],[2.5,30],[1.0,0],[0.0,-30],[-Infinity,-70]];
const LOAN_TIERS: Tier[]         = [[8,30],[3,10],[0,-10],[-5,-40],[-Infinity,-70]];
const CREDIT_TIERS: Tier[]       = [[10,-20],[5,20],[0,0],[-5,-30],[-Infinity,-60]];
const NFIB_TIERS: Tier[]         = [[100,50],[98,20],[95,-10],[90,-30],[-Infinity,-60]];
const INV_SALES_TIERS: Tier[]    = [[1.45,-50],[1.40,-25],[1.30,0],[-Infinity,30]];
const JOLTS_QUITS_TIERS: Tier[]  = [[3.0,20],[2.5,0],[2.0,-20],[-Infinity,-50]];
const GDP_GROWTH_TIERS: Tier[]   = [[3.0,50],[2.0,20],[1.0,0],[0.0,-30],[-Infinity,-80]];
const FED_FUNDS_TIERS: Tier[]    = [[5.5,-70],[4.5,-40],[3.5,-20],[2.5,0],[1.5,30],[-Infinity,60]];
const AAR_TIERS: Tier[]          = [[5,30],[0,10],[-2,-10],[-5,-30],[-Infinity,-60]];
const CASS_TIERS: Tier[]         = [[5,30],[0,0],[-5,-30],[-Infinity,-60]];

function describeLevel(v: number, tiers: Tier[], decimals = 1): string {
  const band = describeThresholdBand(v, tiers);
  const score = threshold(v, tiers);
  return `Level: ${v.toFixed(decimals)} → ${band} → ${fmtScore(score)}`;
}

function describeYoY(ind: Indicator, periods: number, tiers: Tier[]): string | null {
  const pct = yoy(ind.data, periods);
  if (pct === null) return null;
  const band = describeThresholdBand(pct, tiers);
  const score = threshold(pct, tiers);
  return `YoY: ${fmtPct(pct)} → ${band}% → ${fmtScore(score)}`;
}

function describeMoM(ind: Indicator, tiers: Tier[]): string | null {
  const pct = mom(ind.data);
  if (pct === null) return null;
  const band = describeThresholdBand(pct, tiers);
  const score = threshold(pct, tiers);
  return `MoM: ${fmtPct(pct)} → ${band}% → ${fmtScore(score)}`;
}

function describeAnn3m(ind: Indicator, tiers: Tier[]): string | null {
  const pct = ann3m(ind.data);
  if (pct === null) return null;
  const band = describeThresholdBand(pct, tiers);
  const score = threshold(pct, tiers);
  return `3m ann: ${fmtPct(pct)} → ${band}% → ${fmtScore(score)}`;
}

const DESCRIPTION_MAP: Record<string, DescribeFn> = {
  // ── ISM-style level threshold ──────────────────────────────────────────────
  ism_mfg:                 (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_TIERS),
  ism_mfg_new_orders:      (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_TIERS),
  ism_mfg_production:      (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_TIERS),
  ism_mfg_employment:      (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_TIERS),
  ism_services:            (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_TIERS),
  ism_services_new_orders: (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_TIERS),
  ism_mfg_customer_inv:    (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_CUST_INV_TIERS),
  ism_mfg_prices_paid:     (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_PRICES_TIERS),
  ism_services_prices_paid:(ind) => ind.current_value === null ? null : describeLevel(ind.current_value, ISM_PRICES_TIERS),
  nahb_index:              (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, NAHB_INDEX_TIERS),
  nahb_traffic:            (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, NAHB_TRAFFIC_TIERS),
  yield_curve_10y3m:       (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, YIELD_TIERS, 2),
  yield_curve_10y2y:       (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, YIELD_TIERS, 2),
  cfnai_ma3:               (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, CFNAI_TIERS, 2),
  cfnai:                   (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, CFNAI_TIERS, 2),
  sahm_rule:               (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, SAHM_TIERS, 2),
  ny_fed_recession_prob:   (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, NYFED_TIERS),
  breakeven_5y:            (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, BREAKEVEN_TIERS, 2),
  capacity_utilization:    (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, CAP_UTIL_TIERS),
  nfib_optimism:           (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, NFIB_TIERS),
  inventory_sales_ratio:   (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, INV_SALES_TIERS, 2),
  jolts_quits_rate:        (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, JOLTS_QUITS_TIERS, 1),
  gdp_growth_rate:         (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, GDP_GROWTH_TIERS),
  fed_funds_rate:          (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, FED_FUNDS_TIERS, 2),
  aar_carloads:            (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, AAR_TIERS),

  // ── YoY % from level series ───────────────────────────────────────────────
  cpi_core:                (ind) => describeYoY(ind, 12, CPI_TIERS),
  cpi_headline:            (ind) => describeYoY(ind, 12, CPI_TIERS),
  core_pce:                (ind) => describeYoY(ind, 12, CORE_PCE_TIERS),
  pce_deflator:            (ind) => describeYoY(ind, 12, CORE_PCE_TIERS),
  ppi_final_demand:        (ind) => describeYoY(ind, 12, PPI_TIERS),
  ppi_crude_ex_food_energy:(ind) => describeYoY(ind, 12, PPI_TIERS),
  eci:                     (ind) => describeYoY(ind, 4,  AHE_ECI_TIERS),
  avg_hourly_earnings:     (ind) => describeYoY(ind, 12, AHE_ECI_TIERS),
  industrial_production:   (ind) => describeYoY(ind, 12, IP_TIERS),
  housing_permits_1f:      (ind) => describeYoY(ind, 12, HOUSING_YOY_TIERS),
  housing_starts:          (ind) => describeYoY(ind, 12, HOUSING_YOY_TIERS),
  housing_starts_1f:       (ind) => describeYoY(ind, 12, HOUSING_YOY_TIERS),
  existing_home_sales:     (ind) => describeYoY(ind, 12, HOME_SALES_TIERS),
  new_home_sales:          (ind) => describeYoY(ind, 12, HOME_SALES_TIERS),
  case_shiller_hpi:        (ind) => describeYoY(ind, 12, CASE_SHILLER_TIERS),
  consumer_credit:         (ind) => describeYoY(ind, 12, CREDIT_TIERS),
  pce:                     (ind) => describeYoY(ind, 12, PCE_YOY_TIERS),
  pce_real_durable:        (ind) => describeYoY(ind, 12, PCE_YOY_TIERS),
  cass_freight:            (ind) => describeYoY(ind, 12, CASS_TIERS),
  nfp_temp_help:           (ind) => describeYoY(ind, 12, TEMP_HELP_TIERS),
  nfp_trucks:              (ind) => describeYoY(ind, 12, TEMP_HELP_TIERS),
  ci_loans: (ind) => {
    const pct52 = yoy(ind.data, 52);
    const pct = pct52 !== null ? pct52 : yoy(ind.data, 12);
    if (pct === null) return null;
    return `YoY: ${fmtPct(pct)} → ${describeThresholdBand(pct, LOAN_TIERS)}% → ${fmtScore(threshold(pct, LOAN_TIERS))}`;
  },
  total_loans: (ind) => {
    const pct52 = yoy(ind.data, 52);
    const pct = pct52 !== null ? pct52 : yoy(ind.data, 12);
    if (pct === null) return null;
    return `YoY: ${fmtPct(pct)} → ${describeThresholdBand(pct, LOAN_TIERS)}% → ${fmtScore(threshold(pct, LOAN_TIERS))}`;
  },

  // ── MoM % ─────────────────────────────────────────────────────────────────
  retail_sales: (ind) => describeMoM(ind, RETAIL_TIERS),

  // ── 3-month annualized ────────────────────────────────────────────────────
  durable_goods_orders:       (ind) => describeAnn3m(ind, DURABLE_TIERS),
  core_capex_orders:          (ind) => describeAnn3m(ind, DURABLE_TIERS),
  durable_goods_ex_transport: (ind) => describeAnn3m(ind, DURABLE_TIERS),
  factory_orders:             (ind) => describeAnn3m(ind, DURABLE_TIERS),

  // ── Z-score ───────────────────────────────────────────────────────────────
  umich_sentiment:         (ind) => describeZScore(ind, 36,  true,  "3yr"),
  mba_purchase:            (ind) => describeZScore(ind, 52,  true,  "1yr"),
  mba_refi:                (ind) => describeZScore(ind, 52,  true,  "1yr"),
  empire_state_mfg:        (ind) => describeZScore(ind, 36,  true,  "3yr"),
  philly_fed_mfg:          (ind) => describeZScore(ind, 36,  true,  "3yr"),
  richmond_fed_mfg:        (ind) => describeZScore(ind, 36,  true,  "3yr"),
  kc_fed_mfg:              (ind) => describeZScore(ind, 36,  true,  "3yr"),
  continuing_claims:       (ind) => describeZScore(ind, 156, false, "3yr"),
  unemp_longterm:          (ind) => describeZScore(ind, 36,  false, "3yr"),
  challenger_layoffs:      (ind) => describeZScore(ind, 12,  false, "1yr"),
  jolts_openings:          (ind) => describeZScore(ind, 36,  true,  "3yr"),
  business_inventories:    (ind) => describeZScore(ind, 36,  false, "3yr"),
  labor_force_participation:(ind) => describeZScore(ind, 36, true,  "3yr"),

  // claims_4wma uses z-score + momentum blend; show just the z-score component
  claims_4wma: (ind) => {
    if (!ind.data.length) return null;
    const lookback = Math.min(ind.data.length, 156);
    const win = ind.data.slice(0, lookback).map((d) => d.value);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const std = Math.sqrt(win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / win.length);
    if (std === 0) return null;
    const z = (ind.data[0].value - mean) / std;
    return `Z-score: ${z >= 0 ? "+" : ""}${z.toFixed(1)}σ vs 3yr → ${fmtScore(scoreClaims4wMA(ind))}`;
  },
  initial_claims: (ind) => {
    if (!ind.data.length) return null;
    const lookback = Math.min(ind.data.length, 156);
    const win = ind.data.slice(0, lookback).map((d) => d.value);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const std = Math.sqrt(win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / win.length);
    if (std === 0) return null;
    const z = (ind.data[0].value - mean) / std;
    return `Z-score: ${z >= 0 ? "+" : ""}${z.toFixed(1)}σ vs 3yr → ${fmtScore(scoreClaims4wMA(ind))}`;
  },

  // ── Special cases ─────────────────────────────────────────────────────────

  nfp_payrolls: (ind) => {
    if (ind.data.length < 2) return null;
    const change = ind.data[0].value - ind.data[1].value;
    const sign = change >= 0 ? "+" : "";
    const band = describeThresholdBand(change, NFP_TIERS);
    return `MoM: ${sign}${Math.round(change / 1000)}k → ${band} → ${fmtScore(threshold(change, NFP_TIERS))}`;
  },

  gdp_real: (ind) => {
    if (ind.data.length < 2) return null;
    const curr = ind.data[0].value;
    const prev = ind.data[1].value;
    if (!prev) return null;
    const annPct = ((curr / prev) ** 4 - 1) * 100;
    const band = describeThresholdBand(annPct, GDP_GROWTH_TIERS);
    return `QoQ ann: ${fmtPct(annPct)} → ${band}% → ${fmtScore(threshold(annPct, GDP_GROWTH_TIERS))}`;
  },

  unemployment_rate: (ind) => {
    const v = ind.current_value;
    if (v === null) return null;
    const rising = ind.data.length >= 3 && ind.data[0].value > ind.data[2].value;
    const base = threshold(v, UNEMP_BASE_TIERS);
    const adj = rising ? -10 : 10;
    return `Level: ${v.toFixed(1)}% → base ${fmtScore(base)} ${rising ? "↑rising" : "↓stable"} → ${fmtScore(clamp(base + adj))}`;
  },
  unemployment_u6: (ind) => {
    const v = ind.current_value;
    if (v === null) return null;
    const rising = ind.data.length >= 3 && ind.data[0].value > ind.data[2].value;
    const base = threshold(v, UNEMP_BASE_TIERS);
    const adj = rising ? -10 : 10;
    return `Level: ${v.toFixed(1)}% → base ${fmtScore(base)} ${rising ? "↑rising" : "↓stable"} → ${fmtScore(clamp(base + adj))}`;
  },
};

export function describeScore(ind: Indicator): string | null {
  const fn = DESCRIPTION_MAP[ind.id];
  if (!fn) return null;
  try {
    return fn(ind);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**
```bash
cd web && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Commit**
```bash
git add web/lib/scoring.ts
git commit -m "feat: add describeScore() with DESCRIPTION_MAP for all scored indicators"
```

---

### Task 4: Create `DetailChart.tsx`

**Files:**
- Create: `web/components/DetailChart.tsx`

Recharts is already installed (`recharts: ^3.8.1` in `web/package.json`). This component is lazy-loaded — do not import it directly from any non-lazy location.

- [ ] **Step 1: Create `web/components/DetailChart.tsx`**

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type { ScoredIndicator } from "@/lib/types";
import { zoneColor } from "@/lib/scoring";

interface Props {
  ind: ScoredIndicator;
  height?: number;
}

// [threshold value, shadedBelow]
// shadedBelow=true  → fill area BELOW threshold red (bad low values)
// shadedBelow=false → fill area ABOVE threshold red (bad high values)
const CHART_THRESHOLDS: Record<string, [number, boolean]> = {
  ism_mfg:             [50, true],
  ism_mfg_new_orders:  [50, true],
  ism_mfg_production:  [50, true],
  ism_mfg_employment:  [50, true],
  ism_services:        [50, true],
  ism_services_new_orders: [50, true],
  nahb_index:          [50, true],
  nahb_traffic:        [50, true],
  yield_curve_10y3m:   [0,  true],
  yield_curve_10y2y:   [0,  true],
  sahm_rule:           [0.5, false],
  cfnai_ma3:           [0,  true],
  ny_fed_recession_prob: [30, false],
};

export default function DetailChart({ ind, height = 160 }: Props) {
  const data = ind.data.slice(0, 60).reverse();
  const color = zoneColor(ind.zone);
  const tier = CHART_THRESHOLDS[ind.id];

  const formatXTick = (dateStr: string) => {
    const d = new Date(dateStr);
    const thisYear = new Date().getFullYear();
    return d.getFullYear() === thisYear
      ? d.toLocaleDateString("en-US", { month: "short" })
      : String(d.getFullYear());
  };

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXTick}
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--muted)", fontSize: 9 }}
            itemStyle={{ color }}
            formatter={(value: number) => [value.toFixed(2), ind.name]}
            labelFormatter={(label) =>
              new Date(label as string).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })
            }
          />
          {tier && (
            <>
              <ReferenceArea
                y1={tier[1] ? undefined : tier[0]}
                y2={tier[1] ? tier[0] : undefined}
                fill="#e74c5c"
                fillOpacity={0.06}
              />
              <ReferenceLine
                y={tier[0]}
                stroke="#5b9cf5"
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                label={{ value: String(tier[0]), fill: "#5b9cf5", fontSize: 9, position: "left" }}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd web && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**
```bash
git add web/components/DetailChart.tsx
git commit -m "feat: add DetailChart with 5yr Recharts line and threshold shading"
```

---

### Task 5: Rewrite `IndicatorTable.tsx`

**Files:**
- Rewrite: `web/components/IndicatorTable.tsx`

This becomes a `"use client"` component. It renders a `<table>` (hidden on mobile via `className="hidden sm:block"`) and a card list (`className="flex flex-col gap-2 sm:hidden"`). Both share `expandedId` state. `DetailChart` is lazy-loaded.

- [ ] **Step 1: Rewrite `web/components/IndicatorTable.tsx`**

```tsx
"use client";

import React, { useState, Suspense } from "react";
import type { ScoredIndicator } from "@/lib/types";
import { zoneColor, formatValue, describeScore } from "@/lib/scoring";
import { isStale } from "@/lib/data";
import SparkLine from "./SparkLine";

const DetailChart = React.lazy(() => import("./DetailChart"));

interface Props {
  indicators: ScoredIndicator[];
  showSparkline?: boolean;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Taipei",
  });
}

function formatNextRelease(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Taipei",
  });
}

export default function IndicatorTable({ indicators, showSparkline = true }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id);
    }
    if (e.key === "Escape") setExpandedId(null);
  }

  const colCount = showSparkline ? 5 : 4;

  return (
    <>
      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden sm:block" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Indicator", "Value", "Score", "Wt", ...(showSparkline ? ["Trend"] : [])].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "6px 10px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind) => {
              const score = ind.computed_score;
              const color = zoneColor(ind.zone);
              const isExpanded = expandedId === ind.id;
              const stale = isStale(ind);
              const description = isExpanded ? describeScore(ind) : null;

              return (
                <React.Fragment key={ind.id}>
                  <tr
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                      background: isExpanded ? "var(--surface)" : "transparent",
                      lineHeight: 1.4,
                    }}
                  >
                    {/* Name cell — clickable */}
                    <td style={{ padding: "8px 10px", color: "var(--text)", maxWidth: 240 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggle(ind.id)}
                        onKeyDown={(e) => handleKeyDown(e, ind.id)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: "#5b9cf5",
                            width: 10,
                            flexShrink: 0,
                            paddingTop: 2,
                          }}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {ind.name}
                            {stale && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  color: "#f5a623",
                                  fontWeight: 400,
                                  fontFamily: "var(--font-geist-mono), monospace",
                                }}
                              >
                                ⚠ stale
                              </span>
                            )}
                          </div>
                          {ind.metadata?.what_it_measures && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 2,
                                maxWidth: 220,
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {ind.metadata.what_it_measures.trim().slice(0, 100)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Value */}
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "var(--font-geist-mono), monospace",
                        color: ind.current_value === null ? "var(--muted)" : "var(--text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ind.current_value === null ? (
                        <span style={{ fontSize: 11 }}>no data</span>
                      ) : (
                        formatValue(ind)
                      )}
                    </td>

                    {/* Score */}
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "var(--font-geist-mono), monospace",
                        color: score !== null ? color : "var(--muted)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ind.current_value === null
                        ? "—"
                        : score !== null
                        ? score > 0
                          ? `+${score}`
                          : String(score)
                        : "—"}
                    </td>

                    {/* Weight */}
                    <td style={{ padding: "8px 10px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      ×{ind.weight}
                    </td>

                    {/* Sparkline */}
                    {showSparkline && (
                      <td style={{ padding: "4px 10px" }}>
                        <SparkLine
                          data={ind.data.slice(0, 24)}
                          color={score !== null ? color : "var(--muted)"}
                          width={100}
                          height={32}
                        />
                      </td>
                    )}
                  </tr>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={colCount}
                        style={{
                          padding: 0,
                          background: "var(--surface)",
                          borderBottom: "2px solid var(--border)",
                        }}
                      >
                        {/* Chart area */}
                        <div style={{ padding: "16px 16px 0" }}>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              marginBottom: 8,
                            }}
                          >
                            5-Year History · Hover to inspect
                          </div>
                          <Suspense
                            fallback={
                              <div
                                style={{
                                  height: 160,
                                  background: "var(--border)",
                                  borderRadius: 6,
                                }}
                              />
                            }
                          >
                            <DetailChart ind={ind} height={160} />
                          </Suspense>
                        </div>

                        {/* Bottom 3-column strip */}
                        <div
                          style={{
                            padding: "12px 16px 16px",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 16,
                          }}
                        >
                          {/* Col 1: Current */}
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              Current
                            </div>
                            <div
                              style={{
                                fontSize: 32,
                                fontWeight: 700,
                                fontFamily: "var(--font-geist-mono), monospace",
                                color: score !== null ? color : "var(--muted)",
                                lineHeight: 1,
                              }}
                            >
                              {formatValue(ind)}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                              {formatDate(ind.last_updated)}
                              {ind.previous_value !== null && (
                                <> · prev {ind.previous_value.toFixed(1)}</>
                              )}
                            </div>
                            {ind.next_expected_release && (
                              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                                Next: {formatNextRelease(ind.next_expected_release)}
                              </div>
                            )}
                          </div>

                          {/* Col 2: Why? */}
                          <div
                            style={{
                              background: "var(--border)",
                              borderRadius: 6,
                              padding: "10px 12px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              Why{" "}
                              {score !== null
                                ? score > 0
                                  ? `+${score}`
                                  : score
                                : "?"}
                              ?
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.7 }}>
                              {description ?? (
                                <span style={{ color: "var(--muted)" }}>No score formula</span>
                              )}
                            </div>
                          </div>

                          {/* Col 3: What it measures */}
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              What it measures
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                              {ind.metadata?.what_it_measures
                                ? ind.metadata.what_it_measures.trim().slice(0, 150)
                                : "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list (hidden on desktop) ── */}
      <div className="flex flex-col gap-2 sm:hidden">
        {indicators.map((ind) => {
          const score = ind.computed_score;
          const color = zoneColor(ind.zone);
          const isExpanded = expandedId === ind.id;
          const stale = isStale(ind);
          const description = isExpanded ? describeScore(ind) : null;

          return (
            <div
              key={ind.id}
              style={{
                background: isExpanded ? "#111827" : "var(--surface)",
                border: `1px solid ${isExpanded ? "#2a3a5c" : "var(--border)"}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Card header — tappable */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggle(ind.id)}
                onKeyDown={(e) => handleKeyDown(e, ind.id)}
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: isExpanded ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                    {ind.name}
                    {stale && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#f5a623", fontWeight: 400 }}>
                        ⚠
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                    {ind.frequency} · ×{ind.weight}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {showSparkline && (
                    <SparkLine
                      data={ind.data.slice(0, 24)}
                      color={score !== null ? color : "var(--muted)"}
                      width={56}
                      height={24}
                    />
                  )}
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: "var(--font-geist-mono), monospace",
                        color: "var(--text)",
                        lineHeight: 1,
                      }}
                    >
                      {ind.current_value === null ? "—" : formatValue(ind)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: score !== null ? color : "var(--muted)",
                        fontFamily: "var(--font-geist-mono), monospace",
                      }}
                    >
                      {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
                    </div>
                  </div>
                  <span style={{ color: isExpanded ? "#5b9cf5" : "var(--muted)", fontSize: 12 }}>
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {/* Expanded card content */}
              {isExpanded && (
                <div style={{ padding: "10px 12px" }}>
                  <Suspense
                    fallback={
                      <div style={{ height: 80, background: "var(--border)", borderRadius: 6 }} />
                    }
                  >
                    <DetailChart ind={ind} height={80} />
                  </Suspense>
                  {description && (
                    <div
                      style={{
                        marginTop: 8,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 11,
                        color: "var(--text)",
                        lineHeight: 1.6,
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>Why </span>
                      <span style={{ color, fontWeight: 700 }}>
                        {score !== null ? (score > 0 ? `+${score}` : score) : "?"}
                      </span>
                      <span style={{ color: "var(--muted)" }}>? </span>
                      {description}
                    </div>
                  )}
                  {ind.metadata?.what_it_measures && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 10,
                        color: "var(--muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      {ind.metadata.what_it_measures.trim().slice(0, 150)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd web && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Start dev server and verify in browser**
```bash
cd web && pnpm dev
```
Open http://localhost:3000/cycle:
- Click any indicator row → expands in-place with chart + 3-column strip
- Click again (or press Esc) → collapses
- Tab to focus a row name, press Enter → expands (keyboard accessibility)
- Stale indicators show amber `⚠ stale` badge
- Resize browser window to < 640px → table disappears, card list appears
- Tap a card on mobile → expands with compact chart

- [ ] **Step 4: Commit**
```bash
git add web/components/IndicatorTable.tsx
git commit -m "feat: expandable indicator rows, mobile cards, stale badges, keyboard nav"
```

---

### Task 6: Create `WhatChangedFeed.tsx`

**Files:**
- Create: `web/components/WhatChangedFeed.tsx`

This is a pure Server Component (no `"use client"`). It computes score deltas from existing data.

- [ ] **Step 1: Create `web/components/WhatChangedFeed.tsx`**

```tsx
import type { ScoredIndicator } from "@/lib/types";
import { computeScore, getScoreZone, zoneColor } from "@/lib/scoring";

interface Props {
  indicators: Record<string, ScoredIndicator | null>;
}

interface ChangedItem {
  ind: ScoredIndicator;
  currentScore: number;
  previousScore: number;
  delta: number;
}

export default function WhatChangedFeed({ indicators }: Props) {
  const changed: ChangedItem[] = [];

  for (const ind of Object.values(indicators)) {
    if (!ind || ind.previous_value === null || ind.data.length < 2) continue;
    const currentScore = computeScore(ind);
    const prevInd = { ...ind, current_value: ind.previous_value, data: ind.data.slice(1) };
    const previousScore = computeScore(prevInd);
    if (currentScore === null || previousScore === null) continue;
    const delta = currentScore - previousScore;
    if (Math.abs(delta) > 10) {
      changed.push({ ind, currentScore, previousScore, delta });
    }
  }

  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const rows = changed.slice(0, 6);

  return (
    <div className="card">
      <span className="label" style={{ display: "block", marginBottom: 10 }}>
        What Changed
      </span>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          No significant moves since last release.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(({ ind, currentScore, previousScore, delta }) => {
            const color = zoneColor(getScoreZone(currentScore));
            const arrow = delta > 0 ? "↑" : "↓";
            return (
              <div
                key={ind.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "4px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color, fontSize: 14, width: 14, flexShrink: 0 }}>{arrow}</span>
                <span
                  style={{
                    flex: 1,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ind.name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    color: "var(--muted)",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                  }}
                >
                  {previousScore > 0 ? `+${previousScore}` : previousScore}
                  {" → "}
                  {currentScore > 0 ? `+${currentScore}` : currentScore}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    color,
                    fontWeight: 700,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add web/components/WhatChangedFeed.tsx
git commit -m "feat: add WhatChangedFeed component for score-delta home feed"
```

---

### Task 7: Create `UpcomingReleases.tsx`

**Files:**
- Create: `web/components/UpcomingReleases.tsx`

Pure Server Component. Reads `next_expected_release` from indicators, shows next 5. Highlights rows within 24h in amber.

- [ ] **Step 1: Create `web/components/UpcomingReleases.tsx`**

```tsx
import type { ScoredIndicator } from "@/lib/types";

interface Props {
  indicators: Record<string, ScoredIndicator | null>;
}

export default function UpcomingReleases({ indicators }: Props) {
  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;

  const upcoming = Object.values(indicators)
    .filter(
      (ind): ind is ScoredIndicator => !!ind && typeof ind.next_expected_release === "string"
    )
    .filter((ind) => new Date(ind.next_expected_release!).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.next_expected_release!).getTime() -
        new Date(b.next_expected_release!).getTime()
    )
    .slice(0, 5);

  return (
    <div className="card">
      <span className="label" style={{ display: "block", marginBottom: 10 }}>
        Upcoming Releases
      </span>
      {upcoming.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          No scheduled releases available.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {upcoming.map((ind) => {
            const releaseMs = new Date(ind.next_expected_release!).getTime();
            const isImminent = releaseMs - now < MS_24H;
            const dateLabel = new Date(ind.next_expected_release!).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "Asia/Taipei",
            });

            return (
              <div
                key={ind.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: isImminent ? "rgba(245,166,35,0.08)" : "transparent",
                  border: isImminent
                    ? "1px solid rgba(245,166,35,0.3)"
                    : "1px solid transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: isImminent ? "#f5a623" : "var(--muted)",
                    whiteSpace: "nowrap",
                    minWidth: 90,
                  }}
                >
                  {dateLabel}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ind.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add web/components/UpcomingReleases.tsx
git commit -m "feat: add UpcomingReleases component showing next 5 indicator releases"
```

---

### Task 8: Update `app/page.tsx`

**Files:**
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `web/app/page.tsx`, add three imports after the existing import block:

```tsx
import WhatChangedFeed from "@/components/WhatChangedFeed";
import UpcomingReleases from "@/components/UpcomingReleases";
import type { ScoredIndicator } from "@/lib/types";
```

(`computeScore` and `getScoreZone` are already imported from `@/lib/scoring`.)

- [ ] **Step 2: Build `allScored` after `dashboard` is destructured**

In the component body, after:
```tsx
const { masterScore, masterZone, cyclePhase, pages, verdict } = dashboard;
```
add:
```tsx
  const allScored: Record<string, ScoredIndicator | null> = {};
  for (const [id, ind] of Object.entries(all)) {
    if (!ind) { allScored[id] = null; continue; }
    const computed_score = computeScore(ind);
    const zone = getScoreZone(computed_score);
    allScored[id] = { ...ind, computed_score, zone };
  }
```

- [ ] **Step 3: Add the two-column row below the Verdict card**

After the closing `</div>` of the `{/* Verdict */}` card block (which ends around the existing line `</div>`), add:

```tsx
      {/* What Changed + Upcoming Releases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WhatChangedFeed indicators={allScored} />
        <UpcomingReleases indicators={allScored} />
      </div>
```

- [ ] **Step 4: Verify TypeScript compiles**
```bash
cd web && npx tsc --noEmit
```

- [ ] **Step 5: Test in browser**

Open http://localhost:3000:
- "What Changed" and "Upcoming Releases" cards appear below Verdict
- On mobile (< 640px) they stack vertically

Note: `UpcomingReleases` will show "No scheduled releases available" until the ETL runs in Task 9 and populates `next_expected_release` in the JSON files.

- [ ] **Step 6: Commit**
```bash
git add web/app/page.tsx
git commit -m "feat: add WhatChangedFeed and UpcomingReleases to home page"
```

---

### Task 9: ETL — `compute_next_release()` in `main.py`

**Files:**
- Modify: `etl/src/main.py`

- [ ] **Step 1: Add imports at the top of `etl/src/main.py`**

The file already has `from datetime import datetime, timezone`. Add `timedelta` and the standard library `calendar` module:

```python
import calendar as cal
from datetime import datetime, timedelta, timezone
from datetime import date as _Date
```

Replace the existing `from datetime import datetime, timezone` line with these three lines.

- [ ] **Step 2: Add helpers and `compute_next_release()` before `def main()`**

Insert the following block immediately before `def main() -> None:`:

```python
# ─── Next-release computation ─────────────────────────────────────────────────

_WEEKDAY = {
    "monday": 0, "tuesday": 1, "wednesday": 2,
    "thursday": 3, "friday": 4,
}


def _next_weekday(reference: datetime, target_wd: int) -> datetime:
    """Return next UTC midnight for target_wd weekday (always future, never today)."""
    days_ahead = (target_wd - reference.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    d = (reference + timedelta(days=days_ahead)).date()
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _nth_weekday(year: int, month: int, wd: int, n: int) -> _Date:
    """Return the nth occurrence of weekday wd in year/month. n is 1-based."""
    first = _Date(year, month, 1)
    delta = (wd - first.weekday()) % 7
    return _Date(year, month, 1 + delta + (n - 1) * 7)


def _last_weekday(year: int, month: int, wd: int) -> _Date:
    """Return the last occurrence of weekday wd in year/month."""
    _, last_day = cal.monthrange(year, month)
    last = _Date(year, month, last_day)
    delta = (last.weekday() - wd) % 7
    return last - timedelta(days=delta)


def _nth_bday(year: int, month: int, n: int) -> _Date:
    """Return the nth business day (Mon–Fri) in year/month."""
    count = 0
    d = _Date(year, month, 1)
    _, last_day = cal.monthrange(year, month)
    while d.day <= last_day:
        if d.weekday() < 5:
            count += 1
            if count == n:
                return d
        d += timedelta(days=1)
    return _Date(year, month, last_day)


def _advance_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


_PATTERN_NTH_WD: dict[str, tuple[int, int]] = {
    "first_friday":    (4, 1),
    "first_thursday":  (3, 1),
    "second_tuesday":  (1, 2),
    "second_friday":   (4, 2),
    "third_wednesday": (2, 3),
    "fourth_tuesday":  (1, 4),
}
_PATTERN_LAST_WD: dict[str, int] = {
    "last_monday":   0,
    "last_tuesday":  1,
    "last_thursday": 3,
}
_PATTERN_BDAY: dict[str, int] = {
    "first_business_day": 1,
    "third_business_day": 3,
}


def compute_next_release(indicator_id: str, calendar_patterns: dict) -> str | None:
    """Return ISO8601 UTC string of the next expected release, or None if unknown."""
    now = datetime.now(timezone.utc)

    entry = None
    for pattern_data in calendar_patterns.values():
        if indicator_id in pattern_data.get("indicators", []):
            entry = pattern_data
            break
    if entry is None:
        return None

    # Weekly patterns have a release_day key
    release_day = entry.get("release_day")
    if release_day:
        target_wd = _WEEKDAY.get(release_day)
        if target_wd is None:
            return None
        return _next_weekday(now, target_wd).isoformat()

    # Monthly patterns have a pattern key
    pattern = entry.get("pattern")
    if not pattern:
        return None  # daily / mid-month approximations → not computable

    year, month = now.year, now.month
    for attempt in range(2):
        y, m = (year, month) if attempt == 0 else _advance_month(year, month)
        d: _Date | None = None

        if pattern in _PATTERN_NTH_WD:
            wd, n = _PATTERN_NTH_WD[pattern]
            d = _nth_weekday(y, m, wd, n)
        elif pattern in _PATTERN_LAST_WD:
            d = _last_weekday(y, m, _PATTERN_LAST_WD[pattern])
        elif pattern in _PATTERN_BDAY:
            d = _nth_bday(y, m, _PATTERN_BDAY[pattern])
        else:
            return None

        dt = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        if dt > now:
            return dt.isoformat()

    return None
```

- [ ] **Step 3: Add `next_expected_release` to FRED payload in `main()`**

In `main()`, find the FRED block where `payload` is assembled. After the `payload = { ... }` dict literal (which ends with `"score": None,` and `}`), and before `write_indicator(ind_id, payload)`, add:

```python
                payload["next_expected_release"] = compute_next_release(ind_id, calendar)
```

- [ ] **Step 4: Add `next_expected_release` to scraper payload in `main()`**

In the scraper block, similarly, before `write_indicator(ind_id, payload)` add:

```python
                payload["next_expected_release"] = compute_next_release(ind_id, calendar)
```

- [ ] **Step 5: Smoke-test `compute_next_release`**

Run from the `etl/` directory:

```bash
cd "/Users/lwu/Desktop/Economic Indicators/economic_indicators/etl"
.venv/bin/python -c "
from src.main import compute_next_release, load_release_calendar
c = load_release_calendar()
print('claims_4wma     :', compute_next_release('claims_4wma', c))
print('nfp_payrolls    :', compute_next_release('nfp_payrolls', c))
print('consumer_conf   :', compute_next_release('consumer_confidence', c))
print('yield_curve     :', compute_next_release('yield_curve_10y3m', c))
print('unknown         :', compute_next_release('does_not_exist', c))
"
```

Expected output:
- `claims_4wma`: an ISO date for the next Thursday (weekly)
- `nfp_payrolls`: an ISO date for the next first Friday of a month
- `consumer_confidence`: an ISO date for the next last Tuesday of a month
- `yield_curve_10y3m`: `None` (daily, no `pattern` key)
- `unknown`: `None`

- [ ] **Step 6: Commit**
```bash
git add etl/src/main.py
git commit -m "feat: ETL computes and writes next_expected_release per indicator"
```

---

### Task 10: Create `README.md`

**Files:**
- Create: `economic_indicators/README.md`

- [ ] **Step 1: Create `economic_indicators/README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**
```bash
git add economic_indicators/README.md
git commit -m "docs: add README with architecture, pages, scoring, and setup"
```

---

## Self-Review

**Spec coverage:**
- [x] Expandable table rows — Task 5
- [x] Only one row open at a time (`expandedId` state) — Task 5
- [x] Esc to close — Task 5
- [x] 5-year chart window (`slice(0, 60).reverse()`) — Task 4
- [x] Shaded threshold bands (`ReferenceArea`) — Task 4
- [x] `ReferenceLine` at threshold — Task 4
- [x] Recharts lazy-loaded (`React.lazy` + `Suspense`) — Task 5
- [x] Mobile card layout below 640px — Task 5
- [x] `describeScore()` + `DESCRIPTION_MAP` — Task 3
- [x] Stale badges — Tasks 1 + 5
- [x] Missing data → "no data" badge + "—" score — Task 5
- [x] `next_expected_release` in TypeScript types — Task 1
- [x] `next_expected_release` in ETL — Task 9
- [x] "Next: May 22" display in expanded panel — Task 5
- [x] `WhatChangedFeed` — Task 6
- [x] `UpcomingReleases` — Task 7
- [x] Home page 2-col row — Task 8
- [x] Amber highlight for within-24h releases — Task 7
- [x] `aria-current="page"` on Nav — Task 2
- [x] Keyboard expand (`role="button"`, `tabIndex`, `onKeyDown`) — Task 5
- [x] `aria-expanded` — Task 5
- [x] README — Task 10

**Placeholder scan:** No TBD, TODO, or incomplete sections.

**Type consistency:**
- `isStale(ind: Indicator)` — `IndicatorTable` receives `ScoredIndicator extends Indicator` → compatible
- `describeScore(ind: Indicator)` — same, compatible
- `next_expected_release?: string | null` — optional field, old JSON files without it don't cause runtime errors
- `WhatChangedFeed` and `UpcomingReleases` both accept `Record<string, ScoredIndicator | null>` — matches what `app/page.tsx` passes in Task 8
- `DetailChart` receives `ScoredIndicator` — `IndicatorTable` passes individual `ScoredIndicator` items from its `indicators` prop
- `CHART_THRESHOLDS` key type `[number, boolean]` matches how `DetailChart` destructures it as `tier[0]` and `tier[1]`
