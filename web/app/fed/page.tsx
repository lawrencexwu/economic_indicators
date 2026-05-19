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

const ALL_IDS = [...new Set([...Object.values(CLUSTERS).flat(), "nfp_payrolls"])];

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400000);
  return d >= 0 ? d : null;
}

function toDateLabel(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countdownLabel(days: number): string {
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  return `in ${days} days`;
}

export default function FedPage() {
  const data = loadIndicators(ALL_IDS);
  const pageIds = [...new Set(Object.values(CLUSTERS).flat())];
  const indicators = pageIds.map((id) => data[id] ?? null);
  const page = buildPageResult("fed", indicators);

  const clusterScores = Object.entries(CLUSTERS).map(([name, ids]) => {
    const clusterInds = ids.map((id) => data[id] ?? null);
    const result = buildCluster(`cluster_${name}`, clusterInds);
    return { name, score: result.score, zone: result.zone };
  });

  const nextFomc = getNextFomc(new Date());

  const cpiDate = data["cpi_headline"]?.next_expected_release;
  const nfpDate = data["nfp_payrolls"]?.next_expected_release;
  const cpiDays = daysUntil(cpiDate);
  const nfpDays = daysUntil(nfpDate);

  return (
    <PageLayout
      page={page}
      description="What is the Fed likely to do next, and how does that affect equity multiples? +100 = maximally dovish (bullish), −100 = maximally hawkish (bearish)."
    >
      {/* FOMC + CPI + NFP countdowns */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {nextFomc && (
          <div className="card" style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
            borderLeft: `3px solid ${nextFomc.isThisWeek ? "#f5a623" : "var(--accent)"}`,
          }}>
            <span className="label" style={{ flexShrink: 0 }}>Next FOMC</span>
            <span style={{
              fontFamily: "var(--font-mono), monospace", fontSize: 15,
              color: nextFomc.isThisWeek ? "#f5a623" : "var(--text)", fontWeight: 600,
            }}>
              {nextFomc.label}
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 12,
              color: nextFomc.isThisWeek ? "#f5a623" : "var(--muted)",
              fontWeight: nextFomc.isThisWeek ? 700 : 400,
            }}>
              {countdownLabel(nextFomc.daysUntil)}
            </span>
          </div>
        )}

        {(cpiDays !== null || nfpDays !== null) && (
          <div className="card" style={{ display: "flex", gap: 0, padding: 0, overflow: "hidden" }}>
            {cpiDays !== null && (
              <div style={{
                flex: 1,
                padding: "12px 20px",
                borderLeft: "3px solid var(--accent)",
                borderRight: nfpDays !== null ? "1px solid var(--border)" : "none",
              }}>
                <span className="label" style={{ display: "block", marginBottom: 4 }}>Next CPI</span>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                  {toDateLabel(cpiDate)}
                </div>
                <div style={{ fontSize: 12, color: cpiDays <= 7 ? "#f5a623" : "var(--muted)", marginTop: 2, fontWeight: cpiDays <= 7 ? 700 : 400 }}>
                  {countdownLabel(cpiDays)}
                </div>
              </div>
            )}
            {nfpDays !== null && (
              <div style={{
                flex: 1,
                padding: "12px 20px",
                borderLeft: "3px solid var(--accent)",
              }}>
                <span className="label" style={{ display: "block", marginBottom: 4 }}>Next NFP</span>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                  {toDateLabel(nfpDate)}
                </div>
                <div style={{ fontSize: 12, color: nfpDays <= 7 ? "#f5a623" : "var(--muted)", marginTop: 2, fontWeight: nfpDays <= 7 ? 700 : 400 }}>
                  {countdownLabel(nfpDays)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
