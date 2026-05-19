import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";
import ScoreBar from "@/components/ScoreBar";
import { buildPageResult as buildCluster } from "@/lib/composites";
import { getNextFomc } from "@/lib/fomc";

const CLUSTERS: Record<string, string[]> = {
  "Inflation": ["cpi_core", "cpi_headline", "core_pce", "pce_deflator", "ppi_final_demand", "ppi_crude_ex_food_energy"],
  "Labor": ["unemployment_rate", "unemployment_u6", "labor_force_participation", "avg_hourly_earnings", "eci"],
  "Market-Implied": ["breakeven_5y", "fed_funds_rate", "tips_real_yield"],
};

const ALL_IDS = Object.values(CLUSTERS).flat();

export default function FedPage() {
  const data = loadIndicators(ALL_IDS);
  const indicators = ALL_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("fed", indicators);

  // Build mini cluster sub-scores for display
  const clusterScores = Object.entries(CLUSTERS).map(([name, ids]) => {
    const clusterInds = ids.map((id) => data[id] ?? null);
    const result = buildCluster(`cluster_${name}`, clusterInds);
    return { name, score: result.score, zone: result.zone };
  });

  const nextFomc = getNextFomc(new Date());

  return (
    <PageLayout
      page={page}
      description="What is the Fed likely to do next, and how does that affect equity multiples? +100 = maximally dovish (bullish), −100 = maximally hawkish (bearish)."
    >
      {/* FOMC countdown */}
      {nextFomc && (
        <div className="card" style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
          borderLeft: `3px solid ${nextFomc.isThisWeek ? "var(--amber, #f5a623)" : "var(--accent)"}`,
        }}>
          <span className="label">Next FOMC</span>
          <span style={{
            fontFamily: "var(--font-mono), monospace", fontSize: 15,
            color: nextFomc.isThisWeek ? "var(--amber, #f5a623)" : "var(--text)", fontWeight: 600,
          }}>
            {nextFomc.label}
          </span>
          <span style={{
            marginLeft: "auto", fontSize: 12,
            color: nextFomc.isThisWeek ? "var(--amber, #f5a623)" : "var(--muted)",
            fontWeight: nextFomc.isThisWeek ? 700 : 400,
          }}>
            {nextFomc.daysUntil === 0 ? "TODAY" : nextFomc.daysUntil === 1 ? "TOMORROW" : `in ${nextFomc.daysUntil} days`}
          </span>
        </div>
      )}

      {/* Cluster sub-scores */}
      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 12 }}>Cluster Scores</span>
        {clusterScores.map(({ name, score }) => (
          <ScoreBar key={name} label={name} score={score} showZoneLabel />
        ))}
      </div>
    </PageLayout>
  );
}
