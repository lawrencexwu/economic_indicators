import type { Indicator, ScoredIndicator, PageResult, DashboardData, CyclePhase, ScoreZone } from "./types";
import { computeScore, getScoreZone, zoneLabel } from "./scoring";

// ── Page definitions ──────────────────────────────────────────────────────────

export const PAGE_IDS = ["regime", "fed", "pulse", "cycle", "rotation"] as const;

export const PAGE_NAMES: Record<string, string> = {
  regime: "Regime / Recession Risk",
  fed: "Fed Reaction Function",
  pulse: "Growth Pulse",
  cycle: "Cycle & Earnings Momentum",
  rotation: "Sector Rotation",
};

/** Master composite weights per page. */
const PAGE_WEIGHTS: Record<string, number> = {
  regime: 0.30,
  fed: 0.25,
  cycle: 0.20,
  pulse: 0.15,
  rotation: 0.10,
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

export function generateVerdict(
  masterScore: number | null,
  cyclePhase: CyclePhase | null,
  pages: Record<string, PageResult>
): string {
  if (masterScore === null) return "Insufficient data to generate assessment.";

  const fedScore = pages["fed"]?.score ?? null;
  const regimeScore = pages["regime"]?.score ?? null;

  // Assessment
  let assessment = "";
  if (cyclePhase === "RECESSION") {
    assessment = "Recession underway. Broad economic contraction signals extreme caution.";
  } else if (cyclePhase === "RECOVERY") {
    assessment = "Recovery phase. Economic conditions improving from a trough.";
  } else if (cyclePhase === "EARLY_EXPANSION") {
    assessment = "Early expansion. Growth re-accelerating with limited inflation pressure.";
  } else if (cyclePhase === "MID_EXPANSION") {
    assessment = "Mid-cycle expansion. Fundamentals broadly supportive.";
  } else if (cyclePhase === "LATE_CYCLE") {
    assessment = "Late-cycle. Recession risk rising as growth decelerates.";
  } else {
    assessment = "Cycle phase unclear. Mixed signals across leading indicators.";
  }

  // Fed commentary
  let fedText = "";
  if (fedScore !== null) {
    if (fedScore > 30) {
      fedText = "Fed in accommodative mode — supportive for duration and equity multiples.";
    } else if (fedScore > -20) {
      fedText = "Fed neutral. Inflation progress made but policy remains data-dependent.";
    } else {
      fedText = "Fed in restrictive territory. Elevated rates weigh on multiples and credit.";
    }
  }

  // Positioning tilt
  let tilt = "";
  if (masterScore >= 40) {
    tilt = "Tilt: Offense. Cyclicals and growth over defensives.";
  } else if (masterScore >= 10) {
    tilt = "Tilt: Balanced with pro-risk lean. Selective cyclicals.";
  } else if (masterScore >= -10) {
    tilt = "Tilt: Neutral. High quality, balanced duration.";
  } else if (masterScore >= -40) {
    tilt = "Tilt: Defensive. Quality over speculative. Reduce cyclical exposure.";
  } else {
    tilt = "Tilt: Defensive. Capital preservation priority. High quality, short duration.";
  }

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

  return {
    masterScore: master,
    masterZone: getScoreZone(master),
    cyclePhase,
    pages,
    verdict,
    lastUpdated,
  };
}
