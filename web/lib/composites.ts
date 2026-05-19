import type { Indicator, ScoredIndicator, PageResult, DashboardData, CyclePhase, ScoreZone, EquitySignal, EquityBiasBreakdown } from "./types";
import { computeScore, getScoreZone, zoneLabel } from "./scoring";

// ── Page definitions ──────────────────────────────────────────────────────────

export const PAGE_IDS = ["regime", "fed", "pulse", "cycle", "rotation", "fiscal"] as const;

export const PAGE_NAMES: Record<string, string> = {
  regime: "Regime / Recession Risk",
  fed: "Fed Reaction Function",
  pulse: "Growth Pulse",
  cycle: "Cycle & Earnings Momentum",
  rotation: "Sector Rotation",
  fiscal: "Fiscal Dominance",
};

/** Master composite weights per page. */
const PAGE_WEIGHTS: Record<string, number> = {
  regime: 0.28,
  fed: 0.22,
  cycle: 0.18,
  pulse: 0.15,
  rotation: 0.10,
  fiscal: 0.07,
};

// ── Scoring ────────────────────────────────────────────────────────────────────

export function scoreIndicator(ind: Indicator): ScoredIndicator {
  const computed_score = computeScore(ind);
  return { ...ind, computed_score, zone: getScoreZone(computed_score) };
}

/** Compute weighted page score from its indicators. */
function pageScore(indicators: ScoredIndicator[]): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const ind of indicators) {
    if (ind.computed_score === null) continue;
    weightedSum += ind.computed_score * ind.weight;
    weightTotal += ind.weight;
  }
  if (weightTotal === 0) return null;
  return Math.round(weightedSum / weightTotal);
}

export function buildPageResult(
  pageId: string,
  indicators: (Indicator | null)[]
): PageResult {
  const scored = indicators
    .filter((ind): ind is Indicator => ind !== null)
    .map(scoreIndicator);

  const score = pageScore(scored);
  return {
    id: pageId,
    name: PAGE_NAMES[pageId] ?? pageId,
    score,
    zone: getScoreZone(score),
    indicators: scored,
    equityBias: buildEquityBiasBreakdown(scored),
  };
}

// ── Equity Bias ───────────────────────────────────────────────────────────────

export function zoneToEquitySignal(zone: ScoreZone): EquitySignal {
  if (zone === "strong_bull" || zone === "bull") return "BULL";
  if (zone === "strong_bear" || zone === "bear") return "BEAR";
  return "NEUTRAL";
}

export function buildEquityBiasBreakdown(indicators: ScoredIndicator[]): EquityBiasBreakdown {
  let bull = 0, neutral = 0, bear = 0;
  for (const ind of indicators) {
    if (ind.computed_score === null) continue;
    const sig = zoneToEquitySignal(ind.zone);
    if (sig === "BULL") bull++;
    else if (sig === "BEAR") bear++;
    else neutral++;
  }
  const total = bull + neutral + bear;
  const signal: EquitySignal =
    total === 0 ? "NEUTRAL" : bull > bear ? "BULL" : bear > bull ? "BEAR" : "NEUTRAL";
  return {
    bull,
    neutral,
    bear,
    total,
    signal,
    pctBull: total > 0 ? Math.round((bull / total) * 100) : 0,
    pctBear: total > 0 ? Math.round((bear / total) * 100) : 0,
  };
}

// ── Business Cycle Phase ──────────────────────────────────────────────────────

export function classifyCyclePhase(
  all: Record<string, Indicator | null>
): CyclePhase | null {
  const cfnai = all["cfnai_ma3"]?.current_value ?? null;
  const sahm = all["sahm_rule"]?.current_value ?? null;
  const curve = all["yield_curve_10y3m"]?.current_value ?? null;
  const unemp = all["unemployment_rate"]?.current_value ?? null;

  // Recession signals
  if (sahm !== null && sahm >= 0.5) return "RECESSION";
  if (cfnai !== null && cfnai < -1.5) return "RECESSION";

  // Late cycle: CFNAI slowing AND yield curve inverted
  if (cfnai !== null && cfnai < 0.2 && curve !== null && curve < 0) return "LATE_CYCLE";

  // Late cycle: CFNAI overheating (above +0.7 = inflation acceleration risk)
  if (cfnai !== null && cfnai > 0.7) return "LATE_CYCLE";

  // Mid expansion: healthy CFNAI
  if (cfnai !== null && cfnai >= 0.2 && cfnai <= 0.7) return "MID_EXPANSION";

  // Recovery: CFNAI below -0.7, improving
  if (cfnai !== null && cfnai < -0.7) {
    // Check if unemployment is elevated (recession aftermath)
    if (unemp !== null && unemp > 5.5) return "RECOVERY";
    return "RECESSION";
  }

  // CFNAI between -0.7 and +0.2 with positive curve = Early/Neutral
  if (cfnai !== null && cfnai >= -0.7 && cfnai < 0.2) {
    return "EARLY_EXPANSION";
  }

  return null;
}

export const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  EARLY_EXPANSION: "Early Expansion",
  MID_EXPANSION: "Mid Expansion",
  LATE_CYCLE: "Late Cycle",
  RECESSION: "Recession",
  RECOVERY: "Recovery",
};

export const CYCLE_PHASE_DESCRIPTIONS: Record<CyclePhase, string> = {
  EARLY_EXPANSION: "Growth re-accelerating. Cyclicals and value lead. Rates stable.",
  MID_EXPANSION: "Sustained growth. Broad market participation. Pro-risk positioning.",
  LATE_CYCLE: "Growth decelerating. Quality over cyclical. Watch credit spreads.",
  RECESSION: "Contraction. Capital preservation. High quality only.",
  RECOVERY: "Emerging from trough. Early cyclicals and credit lead.",
};

export interface AssetClassMap { favor: string[]; avoid: string[]; theme: string; }

export const CYCLE_PHASE_ASSETS: Record<CyclePhase, AssetClassMap> = {
  EARLY_EXPANSION: {
    favor: ["Cyclicals (materials, industrials, discretionary)", "Small caps", "Value", "EM equities", "High-yield credit", "Commodities"],
    avoid: ["Utilities", "Staples", "Long-duration bonds", "Cash drag"],
    theme: "Re-acceleration. Cyclicals and credit lead. Inflation still contained.",
  },
  MID_EXPANSION: {
    favor: ["Growth & tech", "Financials", "Broad equity (all sectors)", "Investment-grade credit"],
    avoid: ["Over-concentration in any single sector", "Excessive defensives"],
    theme: "Broad participation. Stay pro-risk with quality as the anchor.",
  },
  LATE_CYCLE: {
    favor: ["Healthcare", "Utilities", "Consumer staples", "Investment-grade credit", "Long duration (rates peaking)", "Energy"],
    avoid: ["High-beta cyclicals", "Small caps", "High-yield credit", "EM equities"],
    theme: "Quality over beta. Reduce cyclical exposure; add duration as rates peak.",
  },
  RECESSION: {
    favor: ["Cash", "Short-duration Treasuries", "Healthcare", "Utilities", "Staples", "High-quality credit"],
    avoid: ["Cyclicals", "Small caps", "EM equities", "High-yield credit", "Equities broadly"],
    theme: "Capital preservation. Cash and quality above all.",
  },
  RECOVERY: {
    favor: ["Early cyclicals (materials, discretionary)", "High-yield credit", "REITs", "EM equities", "Small caps"],
    avoid: ["Long-duration bonds (rates starting to rise)", "Cash drag", "Defensives lagging"],
    theme: "Lead the re-acceleration. Credit and early cyclicals before data confirms.",
  },
};

// ── Master Composite ──────────────────────────────────────────────────────────

export function masterComposite(pages: Record<string, PageResult>): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [pageId, weight] of Object.entries(PAGE_WEIGHTS)) {
    const score = pages[pageId]?.score;
    if (score === null || score === undefined) continue;
    weightedSum += score * weight;
    weightTotal += weight;
  }
  if (weightTotal === 0) return null;
  return Math.round(weightedSum / weightTotal);
}

// ── Verdict ───────────────────────────────────────────────────────────────────

export interface VerdictParts {
  assessment: string;
  fedText: string;
  tilt: string;
}

export function generateVerdictParts(
  masterScore: number | null,
  cyclePhase: CyclePhase | null,
  pages: Record<string, PageResult>
): VerdictParts {
  if (masterScore === null) {
    return { assessment: "Insufficient data to generate assessment.", fedText: "", tilt: "" };
  }

  const fedScore = pages["fed"]?.score ?? null;

  let assessment = "";
  if (cyclePhase === "RECESSION") {
    assessment = "Recession underway. Broad economic contraction is confirmed. Capital preservation is the priority — avoid speculative exposure and prefer cash, Treasuries, and high-quality credit.";
  } else if (cyclePhase === "RECOVERY") {
    assessment = "Recovery phase. Economic conditions are improving from a cyclical trough. Early cyclicals and credit spreads typically lead — position ahead of the re-acceleration.";
  } else if (cyclePhase === "EARLY_EXPANSION") {
    assessment = "Early expansion. Growth is re-accelerating with inflation still contained. Historically the strongest phase for risk assets — cyclicals and value tend to lead.";
  } else if (cyclePhase === "MID_EXPANSION") {
    assessment = "Mid-cycle expansion. Fundamentals are broadly supportive with balanced growth and manageable inflation. Broad market participation is typical — stay pro-risk but avoid over-concentration.";
  } else if (cyclePhase === "LATE_CYCLE") {
    assessment = "Late-cycle. Growth is decelerating and recession risk is rising. Quality over cyclicality — reduce beta exposure and watch credit spreads as the leading warning.";
  } else {
    assessment = "Cycle phase is unclear. Mixed signals across leading indicators make a firm regime call difficult. Maintain a balanced posture until signals clarify.";
  }

  let fedText = "";
  if (fedScore !== null) {
    if (fedScore > 30) {
      fedText = "Fed is in accommodative territory. Rate cuts are underway or priced in — supportive for equity multiples, duration, and credit. Tailwind for risk assets.";
    } else if (fedScore > -20) {
      fedText = "Fed is in a neutral stance. Inflation progress has been made but policy remains data-dependent. No clear rate catalyst in either direction — watch CPI and PCE closely.";
    } else {
      fedText = "Fed remains restrictive. Elevated rates continue to weigh on equity multiples, housing, and credit. Headwind persists until inflation durably returns to target.";
    }
  }

  let tilt = "";
  if (masterScore >= 40) {
    tilt = "OFFENSE — Overweight cyclicals and growth. Underweight defensives and cash. Max risk-on positioning justified by the composite reading.";
  } else if (masterScore >= 10) {
    tilt = "PRO-RISK LEAN — Balanced with a tilt toward cyclicals. Selective exposure to growth assets; keep quality as the anchor. Monitor for late-cycle deterioration.";
  } else if (masterScore >= -10) {
    tilt = "NEUTRAL — High quality across equities and fixed income. Balanced duration. Avoid speculative positioning until the composite moves decisively in either direction.";
  } else if (masterScore >= -40) {
    tilt = "DEFENSIVE — Quality over beta. Reduce cyclical exposure. Prefer defensives, investment-grade credit, and shorter duration until conditions improve.";
  } else {
    tilt = "CAPITAL PRESERVATION — Strong defensive posture warranted. Prioritize cash, short-duration Treasuries, and high-quality credit. Avoid high-beta and speculative assets.";
  }

  return { assessment, fedText, tilt };
}

export function generateVerdict(
  masterScore: number | null,
  cyclePhase: CyclePhase | null,
  pages: Record<string, PageResult>
): string {
  const { assessment, fedText, tilt } = generateVerdictParts(masterScore, cyclePhase, pages);
  return [assessment, fedText, tilt].filter(Boolean).join(" ");
}

// ── Dashboard assembly ────────────────────────────────────────────────────────

export function buildDashboard(
  all: Record<string, Indicator | null>,
  pageIndicators: Record<string, (Indicator | null)[]>,
  lastUpdated: string
): DashboardData {
  const pages: Record<string, PageResult> = {};
  for (const pageId of PAGE_IDS) {
    pages[pageId] = buildPageResult(pageId, pageIndicators[pageId] ?? []);
  }

  const master = masterComposite(pages);
  const cyclePhase = classifyCyclePhase(all);
  const verdict = generateVerdict(master, cyclePhase, pages);

  // Aggregate equity bias across all pages
  const allScored = Object.values(pages).flatMap((p) => p.indicators);
  const equityBias = buildEquityBiasBreakdown(allScored);

  return {
    masterScore: master,
    masterZone: getScoreZone(master),
    cyclePhase,
    pages,
    verdict,
    lastUpdated,
    equityBias,
  };
}
