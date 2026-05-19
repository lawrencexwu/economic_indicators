import type { DataPoint, Indicator, ScoreZone } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = -100, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** YoY % change from a level series (data sorted newest-first). */
function yoy(data: DataPoint[], periodsBack: number): number | null {
  if (data.length <= periodsBack) return null;
  const current = data[0].value;
  const prior = data[periodsBack].value;
  if (!prior) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

/** MoM % change from a level series (data sorted newest-first). */
function mom(data: DataPoint[]): number | null {
  if (data.length < 2) return null;
  const curr = data[0].value;
  const prev = data[1].value;
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** 3-month annualized % change. */
function ann3m(data: DataPoint[]): number | null {
  if (data.length < 4) return null;
  const curr = data[0].value;
  const prior3m = data[3].value;
  if (!prior3m) return null;
  return ((curr / prior3m) ** 4 - 1) * 100;
}

/**
 * Z-score of current value vs trailing window (data sorted newest-first).
 * Returns score where +1 std = +33, clamped to ±100.
 * higherIsGood: if true, z>0 → positive score; if false, inverted.
 */
function zScore(
  data: DataPoint[],
  windowPeriods: number,
  higherIsGood: boolean
): number | null {
  if (data.length < 4) return null;
  const window = data.slice(0, Math.min(data.length, windowPeriods)).map((d) => d.value);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const std = Math.sqrt(window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / window.length);
  if (std === 0) return 0;
  const z = (data[0].value - mean) / std;
  const raw = higherIsGood ? z * 33 : -z * 33;
  return clamp(raw);
}

// ── Threshold helpers ─────────────────────────────────────────────────────────

type Tier = [number, number]; // [threshold, score] — evaluated top-to-bottom

function threshold(value: number, tiers: Tier[]): number {
  for (const [thresh, score] of tiers) {
    if (value > thresh) return score;
  }
  return tiers[tiers.length - 1][1];
}

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

// ── Per-indicator scoring functions ──────────────────────────────────────────

function scoreYieldCurve(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;

  // Re-steepening from inversion: curve just crossed above 0 after being
  // negative for 6+ months. Historically a near-recession signal, not bullish.
  if (v > 0 && ind.data.length >= 2) {
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const priorWindow = ind.data.slice(1).filter((d) => new Date(d.date) >= sixMonthsAgo);
    if (priorWindow.length >= 20 && priorWindow.every((d) => d.value < 0)) {
      return -50;
    }
  }

  // Value is in percent (e.g. 0.93 = 93bps)
  return threshold(v, [
    [2.0, 70],
    [1.0, 40],
    [0.5, 10],
    [0.0, -20],
    [-0.5, -50],
    [-1.0, -80],
    [-Infinity, -100],
  ]);
}

function scoreClaims4wMA(ind: Indicator): number | null {
  const { data } = ind;
  if (!data.length) return null;
  const current = data[0].value;
  const lookback = Math.min(data.length, 156); // ~3 years weekly
  const window = data.slice(0, lookback).map((d) => d.value);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const std = Math.sqrt(window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / window.length);
  const z = std > 0 ? (current - mean) / std : 0;
  const prior8w = data[Math.min(8, data.length - 1)].value;
  const momentum = prior8w > 0 ? (current - prior8w) / prior8w : 0;
  return clamp(-50 * z - 100 * momentum);
}

function scoreCFNAI(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [1.0, -30],
    [0.7, 0],
    [0.2, 60],
    [-0.7, 20],
    [-1.5, -60],
    [-Infinity, -100],
  ]);
}

function scoreSahm(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [0.75, -100],
    [0.50, -70],
    [0.35, -40],
    [0.20, 0],
    [-Infinity, 40],
  ]);
}

function scoreNYFedRecessionProb(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [50, -90],
    [30, -60],
    [15, -30],
    [5, 0],
    [-Infinity, 30],
  ]);
}

function scoreNAHBIndex(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [60, 60],
    [50, 30],
    [40, 0],
    [30, -30],
    [20, -60],
    [-Infinity, -90],
  ]);
}

function scoreNAHBTraffic(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [50, 60],
    [40, 20],
    [30, -20],
    [20, -50],
    [-Infinity, -80],
  ]);
}

/** CPI / headline PCE YoY scoring (scale: % YoY from level series). */
function scoreCPIYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [4.0, -80],
    [3.0, -50],
    [2.5, -20],
    [2.0, 20],
    [-Infinity, 60],
  ]);
}

/** Core PCE YoY — Fed's preferred gauge, tighter bands. */
function scoreCorePCEYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [3.5, -90],
    [3.0, -60],
    [2.5, -30],
    [2.3, 0],
    [2.0, 30],
    [-Infinity, 60],
  ]);
}

/** ECI — quarterly, look back 4 quarters for YoY. */
function scoreECI(ind: Indicator): number | null {
  const pct = yoy(ind.data, 4);
  if (pct === null) return null;
  return threshold(pct, [
    [5.0, -80],
    [4.0, -50],
    [3.5, -20],
    [3.0, 20],
    [-Infinity, 60],
  ]);
}

/** 5-year breakeven inflation (already in %, direct). */
function scoreBreakeven5y(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [3.5, -80],
    [3.0, -50],
    [2.5, -20],
    [2.0, 20],
    [-Infinity, 40],
  ]);
}

/** Unemployment rate — needs context (level + direction). */
function scoreUnemploymentRate(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  // Direction: is unemployment rising?
  const rising =
    ind.data.length >= 3 &&
    ind.data[0].value > ind.data[2].value;
  // Base score from level (higher = more slack = dovish Fed = mild bull)
  const base = threshold(v, [
    [6.0, -30], // recession territory
    [5.0, 0],
    [4.5, 20],
    [4.0, 10],
    [3.5, -10], // overheating concern
    [-Infinity, -20],
  ]);
  // If rising, add bearish tilt (growth slowing)
  const adj = rising ? -10 : 10;
  return clamp(base + adj);
}

/** Average hourly earnings — YoY from level. */
function scoreAHEYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [5.0, -80],
    [4.0, -50],
    [3.5, -20],
    [3.0, 20],
    [-Infinity, 60],
  ]);
}

/** ISM headline (Mfg and Services). */
function scoreISM(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [55, 70],
    [52, 40],
    [50, 10],
    [48, -20],
    [45, -50],
    [-Infinity, -80],
  ]);
}

/** ISM Customer Inventories — inverted (low = customers need to restock). */
function scoreISMCustomerInv(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [55, -30],
    [50, -10],
    [45, 10],
    [-Infinity, 30],
  ]);
}

/** ISM Prices Paid — high prices = bearish. */
function scoreISMPricesPaid(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [70, -40],
    [60, -20],
    [50, 0],
    [-Infinity, 20],
  ]);
}

/** NFIB Small Business Optimism. */
function scoreNFIB(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [100, 50],
    [98, 20],
    [95, -10],
    [90, -30],
    [-Infinity, -60],
  ]);
}

/** Inventory / Sales ratio — higher = more bearish (inventory glut). */
function scoreInventorySalesRatio(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [1.45, -50],
    [1.40, -25],
    [1.30, 0],
    [-Infinity, 30],
  ]);
}

/** JOLTS Quits Rate — high quits = tight labor market = bullish short-term. */
function scoreJOLTSQuits(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [3.0, 20],
    [2.5, 0],
    [2.0, -20],
    [-Infinity, -50],
  ]);
}

/** Real GDP annualized growth (A191RL1Q225SBEA already in %). */
function scoreGDPGrowth(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [3.0, 50],
    [2.0, 20],
    [1.0, 0],
    [0.0, -30],
    [-Infinity, -80],
  ]);
}

/** Real GDP level (GDPC1) — compute annualized QoQ growth rate. */
function scoreGDPReal(ind: Indicator): number | null {
  if (ind.data.length < 2) return null;
  const curr = ind.data[0].value;
  const prev = ind.data[1].value;
  if (!prev) return null;
  const annualizedPct = ((curr / prev) ** 4 - 1) * 100;
  return threshold(annualizedPct, [
    [3.0, 50],
    [2.0, 20],
    [1.0, 0],
    [0.0, -30],
    [-Infinity, -80],
  ]);
}

/** Industrial Production — YoY from index level. */
function scoreIndustrialProduction(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [3.0, 50],
    [1.0, 20],
    [0.0, 0],
    [-2.0, -30],
    [-Infinity, -60],
  ]);
}

/** Capacity Utilization — already in %, use level directly. */
function scoreCapacityUtilization(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [82, -30], // overheating
    [80, -10],
    [78, 0], // long-run average
    [75, -10],
    [70, -30],
    [-Infinity, -50],
  ]);
}

/** Durable Goods / Core Capex — 3-month annualized trend from level. */
function scoreDurableGoods(ind: Indicator): number | null {
  const pct = ann3m(ind.data);
  if (pct === null) return null;
  return threshold(pct, [
    [10, 50],
    [3, 20],
    [0, 0],
    [-5, -30],
    [-Infinity, -60],
  ]);
}

/** NFP payrolls — MoM absolute change (level series in persons). */
function scoreNFP(ind: Indicator): number | null {
  if (ind.data.length < 2) return null;
  const change = ind.data[0].value - ind.data[1].value;
  // change in raw counts; 200k+ = good, <50k = warning, negative = bad
  return threshold(change, [
    [300_000, 70],
    [200_000, 40],
    [100_000, 10],
    [50_000, -10],
    [0, -40],
    [-Infinity, -80],
  ]);
}

/** Temp help employment — YoY % (leads full NFP by 2-3 months). */
function scoreTempHelp(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [5, 50],
    [0, 10],
    [-5, -30],
    [-Infinity, -70],
  ]);
}

/** C&I Loans and Total Loans — YoY growth from level. */
function scoreLoanGrowth(ind: Indicator): number | null {
  const pct = yoy(ind.data, 52); // weekly, look back 52 weeks
  if (pct === null) {
    const pct12 = yoy(ind.data, 12);
    if (pct12 === null) return null;
    return threshold(pct12, [
      [8, 30],
      [3, 10],
      [0, -10],
      [-5, -40],
      [-Infinity, -70],
    ]);
  }
  return threshold(pct, [
    [8, 30],
    [3, 10],
    [0, -10],
    [-5, -40],
    [-Infinity, -70],
  ]);
}

/** Retail Sales MoM % change. */
function scoreRetailSales(ind: Indicator): number | null {
  const pct = mom(ind.data);
  if (pct === null) return null;
  return threshold(pct, [
    [1.5, 60],
    [0.5, 30],
    [0.0, 0],
    [-0.5, -30],
    [-Infinity, -60],
  ]);
}

/** PCE / Real durable PCE — YoY growth from level. */
function scorePCEYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [5, 60],
    [2.5, 30],
    [1.0, 0],
    [0.0, -30],
    [-Infinity, -70],
  ]);
}

/** UMich Sentiment — z-score vs 3-year trailing + direction. */
function scoreUMich(ind: Indicator): number | null {
  return zScore(ind.data, 36, true);
}

/** Housing Permits / Starts — YoY % from level. */
function scoreHousingYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [20, 60],
    [5, 30],
    [0, 0],
    [-10, -30],
    [-Infinity, -60],
  ]);
}

/** Continuing Claims — z-score (higher = more bearish). */
function scoreContinuingClaims(ind: Indicator): number | null {
  return zScore(ind.data, 156, false);
}

/** Long-term unemployment (15+ weeks) — z-score, higher is bearish. */
function scoreUnempLongterm(ind: Indicator): number | null {
  return zScore(ind.data, 36, false);
}

/** PPI YoY from level. */
function scorePPIYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  // High PPI = margin pressure = mildly bearish for equities
  return threshold(pct, [
    [8, -60],
    [4, -30],
    [2, 0],
    [0, 10],
    [-Infinity, 20],
  ]);
}

/** Regional Fed surveys (Empire, Philly) — z-score. */
function scoreRegionalFed(ind: Indicator): number | null {
  return zScore(ind.data, 36, true);
}

/** Case-Shiller HPI YoY. */
function scoreCaseShillerYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [10, 40],
    [5, 20],
    [0, 0],
    [-5, -30],
    [-Infinity, -60],
  ]);
}

/** Challenger layoffs — YoY change, higher = more bearish. */
function scoreChallenger(ind: Indicator): number | null {
  // Use z-score vs trailing (value in thousands)
  return zScore(ind.data, 12, false);
}

/** Cass Freight — YoY from index level. */
function scoreCassFreight(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [5, 30],
    [0, 0],
    [-5, -30],
    [-Infinity, -60],
  ]);
}

/** AAR Carloads — value is already YoY % change. */
function scoreAARCarloads(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  return threshold(v, [
    [5, 30],
    [0, 10],
    [-2, -10],
    [-5, -30],
    [-Infinity, -60],
  ]);
}

/** MBA Purchase/Refi — z-score (higher = more demand = bullish housing).
 *  Falls back to WoW direction (±20) when history is too thin for z-score. */
function scoreMBA(ind: Indicator): number | null {
  if (ind.data.length >= 4) return zScore(ind.data, 52, true);
  const m = mom(ind.data);
  if (m === null) return null;
  return clamp(m > 0 ? 20 : -20);
}

/** Fed Funds rate — score vs neutral rate (~2.5-3.0%). */
function scoreFedFunds(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  // Real neutral rate ~2.5%; restrictive above, accommodative below
  return threshold(v, [
    [5.5, -70], // very restrictive
    [4.5, -40],
    [3.5, -20],
    [2.5, 0],  // near neutral
    [1.5, 30],
    [-Infinity, 60], // very accommodative
  ]);
}

/** Consumer credit outstanding — YoY growth (higher = stronger demand, but
 *  too high = overleveraging). Mildly directional. */
function scoreConsumerCredit(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [10, -20], // overleveraging risk
    [5, 20],
    [0, 0],
    [-5, -30],
    [-Infinity, -60],
  ]);
}

/** Existing / New Home Sales — YoY from level. */
function scoreHomeSalesYoY(ind: Indicator): number | null {
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  return threshold(pct, [
    [20, 60],
    [5, 30],
    [0, 0],
    [-10, -30],
    [-Infinity, -60],
  ]);
}

// ── Credit / Financial Conditions ────────────────────────────────────────────

function scoreHYSpread(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null || v === undefined) return null;
  if (v < 3.0) return 60;
  if (v < 4.0) return 20;
  if (v < 5.0) return -20;
  if (v < 6.5) return -60;
  return -100;
}

function scoreIGSpread(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null || v === undefined) return null;
  if (v < 0.8) return 60;
  if (v < 1.2) return 20;
  if (v < 1.8) return -20;
  if (v < 2.5) return -60;
  return -100;
}

function scoreNFCI(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null || v === undefined) return null;
  if (v < -0.5) return 60;
  if (v < -0.1) return 20;
  if (v < 0.1) return 0;
  if (v < 0.5) return -30;
  if (v < 1.0) return -60;
  return -100;
}

function scoreTIPSRealYield(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null || v === undefined) return null;
  if (v < 0.0) return 80;
  if (v < 0.5) return 40;
  if (v < 1.0) return 10;
  if (v < 1.5) return -20;
  if (v < 2.0) return -50;
  return -80;
}

// ── Dispatch map ──────────────────────────────────────────────────────────────

type ScoringFn = (ind: Indicator) => number | null;

const SCORING_MAP: Record<string, ScoringFn> = {
  yield_curve_10y3m: scoreYieldCurve,
  yield_curve_10y2y: scoreYieldCurve,
  claims_4wma: scoreClaims4wMA,
  initial_claims: scoreClaims4wMA, // similar z-score approach
  continuing_claims: scoreContinuingClaims,
  cfnai_ma3: scoreCFNAI,
  cfnai: scoreCFNAI,
  sahm_rule: scoreSahm,
  ny_fed_recession_prob: scoreNYFedRecessionProb,
  nahb_index: scoreNAHBIndex,
  nahb_traffic: scoreNAHBTraffic,
  unemp_longterm: scoreUnempLongterm,
  cpi_core: scoreCPIYoY,
  cpi_headline: scoreCPIYoY,
  core_pce: scoreCorePCEYoY,
  pce_deflator: scoreCorePCEYoY,
  ppi_final_demand: scorePPIYoY,
  ppi_crude_ex_food_energy: scorePPIYoY,
  eci: scoreECI,
  breakeven_5y: scoreBreakeven5y,
  unemployment_rate: scoreUnemploymentRate,
  unemployment_u6: scoreUnemploymentRate,
  labor_force_participation: (ind) => {
    // Higher participation = more labor supply = dovish (mild bull)
    return zScore(ind.data, 36, true);
  },
  avg_hourly_earnings: scoreAHEYoY,
  fed_funds_rate: scoreFedFunds,
  empire_state_mfg: scoreRegionalFed,
  philly_fed_mfg: scoreRegionalFed,
  richmond_fed_mfg: scoreRegionalFed,
  kc_fed_mfg: scoreRegionalFed,
  dallas_fed_mfg: scoreRegionalFed,
  ci_loans: scoreLoanGrowth,
  total_loans: scoreLoanGrowth,
  mba_purchase: scoreMBA,
  mba_refi: scoreMBA,
  aar_carloads: scoreAARCarloads,
  challenger_layoffs: scoreChallenger,
  cass_freight: scoreCassFreight,
  ism_mfg: scoreISM,
  ism_mfg_new_orders: scoreISM,
  ism_mfg_production: scoreISM,
  ism_mfg_employment: scoreISM,
  ism_mfg_customer_inv: scoreISMCustomerInv,
  ism_mfg_prices_paid: scoreISMPricesPaid,
  ism_services: scoreISM,
  ism_services_new_orders: scoreISM,
  ism_services_prices_paid: scoreISMPricesPaid,
  industrial_production: scoreIndustrialProduction,
  capacity_utilization: scoreCapacityUtilization,
  durable_goods_orders: scoreDurableGoods,
  core_capex_orders: scoreDurableGoods,
  durable_goods_ex_transport: scoreDurableGoods,
  factory_orders: scoreDurableGoods,
  business_inventories: (ind) => zScore(ind.data, 36, false), // higher inventory = mildly bearish
  inventory_sales_ratio: scoreInventorySalesRatio,
  nfib_optimism: scoreNFIB,
  nfp_payrolls: scoreNFP,
  nfp_temp_help: scoreTempHelp,
  nfp_trucks: scoreTempHelp,
  avg_weekly_hours_mfg: scoreRegionalFed,
  housing_permits_1f: scoreHousingYoY,
  housing_starts: scoreHousingYoY,
  housing_starts_1f: scoreHousingYoY,
  existing_home_sales: scoreHomeSalesYoY,
  new_home_sales: scoreHomeSalesYoY,
  case_shiller_hpi: scoreCaseShillerYoY,
  retail_sales: scoreRetailSales,
  pce: scorePCEYoY,
  pce_real_durable: scorePCEYoY,
  umich_sentiment: scoreUMich,
  consumer_credit: scoreConsumerCredit,
  jolts_openings: (ind) => zScore(ind.data, 36, true), // higher openings = tight market = mildly bull
  jolts_quits_rate: scoreJOLTSQuits,
  gdp_real: scoreGDPReal,
  gdp_growth_rate: scoreGDPGrowth,
  // lei, consumer_confidence, richmond_fed, kc_fed, dallas_fed: scrapers not yet implemented → null

  // ── Fiscal page ───────────────────────────────────────────────────────────
  debt_to_gdp: scoreDebtToGDP,
  interest_to_gdp: scoreInterestToGDP,
  interest_to_receipts: scoreInterestToReceipts,
  primary_deficit_pct: scorePrimaryDeficit,
  fed_balance_to_gdp: scoreFedBalanceToGDP,
  tic_foreign_holdings: scoreTICForeignHoldings,
  dxy_index: scoreDXY,

  // ── Credit / Financial Conditions ─────────────────────────────────────────
  hy_credit_spread: scoreHYSpread,
  ig_credit_spread: scoreIGSpread,
  nfci: scoreNFCI,
  tips_real_yield: scoreTIPSRealYield,
};

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
const DEBT_GDP_TIERS: Tier[]     = [[130,-40],[100,-20],[70,0],[-Infinity,20]];
const INTEREST_GDP_TIERS: Tier[] = [[4,-60],[3,-30],[2,-10],[-Infinity,10]];
const INTEREST_RCV_TIERS: Tier[] = [[20,-60],[15,-30],[10,-10],[-Infinity,20]];
const PRIMARY_DEF_TIERS: Tier[]  = [[5,-40],[3,-20],[-3,0],[-Infinity,30]];

// ── Fiscal scoring functions ──────────────────────────────────────────────────

function scoreDebtToGDP(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  if (v > 130) return -40;
  if (v > 100) return -20;
  if (v > 70) return 0;
  return 20;
}

function scoreInterestToGDP(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  if (v > 4) return -60;
  if (v > 3) return -30;
  if (v > 2) return -10;
  return 10;
}

function scoreInterestToReceipts(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  if (v > 20) return -60;
  if (v > 15) return -30;
  if (v > 10) return -10;
  return 20;
}

function scorePrimaryDeficit(ind: Indicator): number | null {
  const v = ind.current_value;
  if (v === null) return null;
  if (v > 5) return -40;
  if (v > 3) return -20;
  if (v > -3) return 0;
  return 30;
}

function scoreFedBalanceToGDP(ind: Indicator): number | null {
  // Weekly data — use 52 weeks ≈ 1 year for YoY change in pp
  if (ind.data.length < 52) return null;
  const curr = ind.data[0].value;
  const prev = ind.data[51].value;
  if (!prev) return null;
  const change = curr - prev; // pp change
  if (change > 5) return -30;
  if (change > 2) return -15;
  if (change > -2) return 0;
  if (change > -5) return 15;
  return 30;
}

function scoreTICForeignHoldings(ind: Indicator): number | null {
  // Monthly — use 12 months for YoY % change
  const pct = yoy(ind.data, 12);
  if (pct === null) return null;
  if (pct > 5) return 20;
  if (pct > 0) return 10;
  if (pct > -5) return -10;
  if (pct > -10) return -20;
  return -40;
}

function scoreDXY(ind: Indicator): number | null {
  // Weekly — use 26 weeks ≈ 6 months for % change
  const pct = yoy(ind.data, 26);
  if (pct === null) return null;
  if (pct > 5) return -30;
  if (pct > 2) return -15;
  if (pct > -2) return 0;
  if (pct > -5) return 15;
  return 30;
}

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
  avg_weekly_hours_mfg:    (ind) => describeZScore(ind, 36, true, "3yr"),
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
  dallas_fed_mfg:          (ind) => describeZScore(ind, 36,  true,  "3yr"),
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

  // ── Fiscal ────────────────────────────────────────────────────────────────
  debt_to_gdp: (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, DEBT_GDP_TIERS, 1),
  interest_to_gdp: (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, INTEREST_GDP_TIERS, 2),
  interest_to_receipts: (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, INTEREST_RCV_TIERS, 1),
  primary_deficit_pct: (ind) => ind.current_value === null ? null : describeLevel(ind.current_value, PRIMARY_DEF_TIERS, 2),
  fed_balance_to_gdp: (ind) => {
    if (ind.data.length < 52) return null;
    const curr = ind.data[0].value;
    const prev = ind.data[51].value;
    if (!prev) return null;
    const change = curr - prev;
    const sign = change >= 0 ? "+" : "";
    const score = scoreFedBalanceToGDP(ind);
    return `YoY Δ: ${sign}${change.toFixed(1)}pp (${curr.toFixed(1)}% of GDP) → ${fmtScore(score)}`;
  },
  tic_foreign_holdings: (ind) => {
    const pct = yoy(ind.data, 12);
    if (pct === null) return null;
    const sign = pct >= 0 ? "+" : "";
    const score = scoreTICForeignHoldings(ind);
    return `YoY: ${sign}${fmtPct(pct)} → ${fmtScore(score)}`;
  },
  dxy_index: (ind) => {
    const pct = yoy(ind.data, 26);
    if (pct === null) return null;
    const sign = pct >= 0 ? "+" : "";
    const score = scoreDXY(ind);
    return `6m change: ${sign}${fmtPct(pct)} → ${fmtScore(score)}`;
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

// ── Public API ────────────────────────────────────────────────────────────────

export function computeScore(ind: Indicator): number | null {
  const fn = SCORING_MAP[ind.id];
  if (!fn) return null;
  try {
    return fn(ind);
  } catch {
    return null;
  }
}

export function getScoreZone(score: number | null): ScoreZone {
  if (score === null) return "na";
  if (score >= 60) return "strong_bull";
  if (score >= 20) return "bull";
  if (score >= -20) return "neutral";
  if (score >= -60) return "bear";
  return "strong_bear";
}

export function zoneColor(zone: ScoreZone): string {
  switch (zone) {
    case "strong_bull": return "#16a155";
    case "bull": return "#2dd47a";
    case "neutral": return "#f5a623";
    case "bear": return "#e74c5c";
    case "strong_bear": return "#c0392b";
    default: return "#7a8499";
  }
}

export function zoneClass(zone: ScoreZone): string {
  switch (zone) {
    case "strong_bull": return "zone-strong-bull";
    case "bull": return "zone-bull";
    case "neutral": return "zone-neutral";
    case "bear": return "zone-bear";
    case "strong_bear": return "zone-strong-bear";
    default: return "zone-na";
  }
}

export function zoneLabel(zone: ScoreZone): string {
  switch (zone) {
    case "strong_bull": return "STRONG BULL";
    case "bull": return "BULL";
    case "neutral": return "NEUTRAL";
    case "bear": return "BEAR";
    case "strong_bear": return "STRONG BEAR";
    default: return "N/A";
  }
}

/** Format indicator value for display. */
export function formatValue(ind: Indicator): string {
  const v = ind.current_value;
  if (v === null) return "—";
  const id = ind.id;
  // Rates / spreads — show in %
  if (
    ["yield_curve_10y3m", "yield_curve_10y2y", "breakeven_5y", "fed_funds_rate",
     "unemployment_rate", "unemployment_u6", "labor_force_participation",
     "jolts_quits_rate"].includes(id)
  ) {
    return `${v.toFixed(2)}%`;
  }
  // Claims — raw count → "204k"
  if (["claims_4wma", "initial_claims"].includes(id)) {
    return `${(v / 1000).toFixed(1)}k`;
  }
  // Sahm rule
  if (id === "sahm_rule") return v.toFixed(2);
  // CFNAI
  if (id.startsWith("cfnai")) return v.toFixed(2);
  // NY Fed recession prob
  if (id === "ny_fed_recession_prob") return `${v.toFixed(1)}%`;
  // ISM / NAHB / NFIB — index values 0-100
  if (id.startsWith("ism_") || id.startsWith("nahb_") || id === "nfib_optimism") {
    return v.toFixed(1);
  }
  // GDP growth — already %
  if (id === "gdp_growth_rate") return `${v.toFixed(1)}%`;
  // Capacity utilization
  if (id === "capacity_utilization") return `${v.toFixed(1)}%`;
  // Challenger — thousands
  if (id === "challenger_layoffs") return `${v.toFixed(1)}k`;
  // AAR — already YoY%
  if (id === "aar_carloads") return `${v.toFixed(1)}%`;
  // CPI / PCE deflators / PPI / AHE / ECI — store FRED index levels; show YoY % instead
  if (["cpi_core", "cpi_headline", "core_pce", "pce_deflator",
       "ppi_final_demand", "ppi_crude_ex_food_energy",
       "avg_hourly_earnings", "pce", "pce_real_durable"].includes(id)) {
    const pct = yoy(ind.data, 12);
    return pct !== null ? `${pct.toFixed(1)}%` : `${v.toFixed(1)}`;
  }
  if (id === "eci") {
    const pct = yoy(ind.data, 4);
    return pct !== null ? `${pct.toFixed(1)}%` : `${v.toFixed(1)}`;
  }
  // Credit spreads and TIPS real yield — show as %
  if (["hy_credit_spread", "ig_credit_spread", "tips_real_yield"].includes(id)) {
    return `${v.toFixed(2)}%`;
  }
  // NFCI — 3-decimal index
  if (id === "nfci") return v.toFixed(3);
  // Default: numeric with 1 decimal
  return v.toFixed(1);
}

// Mirrors etl/src/scoring.py transform logic so the histogram shows the same
// values that were z-scored in the ETL.
const YOY_PERIODS: Record<string, number> = {
  daily: 252, weekly: 52, quarterly: 4, monthly: 12, annual: 1,
};
const WINDOW_10Y_PERIODS: Record<string, number> = {
  daily: 2520, weekly: 520, quarterly: 40, monthly: 120, annual: 10,
};

/**
 * Returns the array of transformed values used for z-scoring, windowed the
 * same way the ETL does. Pass to IndicatorHistogram as `values`.
 * Returns null when there is insufficient data.
 */
export function getHistogramValues(ind: Indicator): number[] | null {
  if (!ind.zscore) return null;
  const { transform, window } = ind.zscore;
  const freq = ind.frequency ?? "monthly";
  const raw = ind.data.map((d) => d.value).filter((v): v is number => v !== null && v !== undefined);
  if (raw.length < 4) return null;

  let level: number[];
  if (transform === "yoy") {
    const n = YOY_PERIODS[freq] ?? 12;
    if (raw.length <= n) return null;
    level = [];
    for (let i = 0; i < raw.length - n; i++) {
      const base = raw[i + n];
      if (base !== 0) level.push(raw[i] / base - 1);
    }
    if (level.length < 4) return null;
  } else {
    level = raw;
  }

  const nWindow = window === "full" ? level.length : (WINDOW_10Y_PERIODS[freq] ?? 120);
  return level.slice(0, Math.min(nWindow, level.length));
}

/** Format MoM or YoY delta for display next to value. */
export function formatDelta(ind: Indicator): string {
  if (!ind.data || ind.data.length < 2) return "";
  const curr = ind.data[0].value;
  const prev = ind.data[1].value;
  const diff = curr - prev;
  const sign = diff > 0 ? "+" : "";
  // For rates and spreads
  const id = ind.id;
  if (
    ["yield_curve_10y3m", "yield_curve_10y2y", "breakeven_5y", "fed_funds_rate",
     "unemployment_rate", "unemployment_u6", "labor_force_participation",
     "jolts_quits_rate"].includes(id)
  ) {
    return `${sign}${diff.toFixed(2)}pp`;
  }
  return "";
}
