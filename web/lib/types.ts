export interface DataPoint {
  date: string;
  value: number;
}

export interface IndicatorMetadata {
  what_it_measures?: string;
  why_it_matters?: string;
  scoring_rule?: string;
}

export type LevelTrendState =
  | "Strong"
  | "Peaking"
  | "Neutral"
  | "Recovering"
  | "Deteriorating";

export interface ZScoreBlock {
  level_z: number;
  level_mean: number;
  level_std: number;
  level_value_used: number;
  trend_z: number;
  trend_value_used: number | null;
  window: "10y" | "full";
  transform: "level" | "yoy" | "raw";
  computed_at: string;
}

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
  zscore?: ZScoreBlock | null;
  level_trend_state?: LevelTrendState;
}

export type ScoreZone = "strong_bull" | "bull" | "neutral" | "bear" | "strong_bear" | "na";

export type CyclePhase =
  | "EARLY_EXPANSION"
  | "MID_EXPANSION"
  | "LATE_CYCLE"
  | "RECESSION"
  | "RECOVERY";

export interface ScoredIndicator extends Indicator {
  computed_score: number | null;
  zone: ScoreZone;
}

export interface PageResult {
  id: string;
  name: string;
  score: number | null;
  zone: ScoreZone;
  indicators: ScoredIndicator[];
}

export interface DashboardData {
  masterScore: number | null;
  masterZone: ScoreZone;
  cyclePhase: CyclePhase | null;
  pages: Record<string, PageResult>;
  verdict: string;
  lastUpdated: string;
}
