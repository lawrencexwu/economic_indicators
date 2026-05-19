import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";
import { zoneColor, getScoreZone } from "@/lib/scoring";

interface ClusterConfig {
  ids: string[];
  drivers: string;
}

const CLUSTERS: Record<string, ClusterConfig> = {
  "Homebuilders / REITs": {
    ids: [
      "housing_permits_1f", "housing_starts", "housing_starts_1f",
      "existing_home_sales", "new_home_sales", "case_shiller_hpi",
      "nahb_traffic", "mba_purchase",
    ],
    drivers: "Housing starts, permits, mortgage demand, home sales",
  },
  "Consumer Cyclicals": {
    ids: ["retail_sales", "pce", "pce_real_durable", "umich_sentiment", "consumer_credit"],
    drivers: "Retail sales, PCE, consumer sentiment, credit growth",
  },
  "Banks / Credit": {
    ids: ["ci_loans", "total_loans"],
    drivers: "C&I loan growth, total credit expansion",
  },
  "Industrials / Transport": {
    ids: ["nfp_trucks"],
    drivers: "Truck employment, freight volumes",
  },
  "Sentiment": {
    ids: ["consumer_confidence", "umich_sentiment"],
    drivers: "Consumer confidence, UMich sentiment index",
  },
};

const ALL_IDS = [...new Set(Object.values(CLUSTERS).flatMap((c) => c.ids))];

function recommendation(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "NO DATA", color: "var(--muted)" };
  if (score >= 20) return { label: "OVERWEIGHT", color: "#2ecc71" };
  if (score >= -20) return { label: "NEUTRAL", color: "#f5a623" };
  return { label: "UNDERWEIGHT", color: "#e74c5c" };
}

export default function RotationPage() {
  const data = loadIndicators(ALL_IDS);
  const indicators = ALL_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("rotation", indicators);

  const clusterRows = Object.entries(CLUSTERS).map(([name, { ids, drivers }]) => {
    const result = buildPageResult(
      `cluster_${name}`,
      [...new Set(ids)].map((id) => data[id] ?? null)
    );
    const rec = recommendation(result.score);
    return {
      name,
      score: result.score,
      scoreColor: zoneColor(result.zone),
      drivers,
      recLabel: rec.label,
      recColor: rec.color,
    };
  });

  const thStyle: React.CSSProperties = {
    padding: "8px 16px",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted)",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  return (
    <PageLayout
      page={page}
      description="Which sectors should outperform? Maps macro data to sector attractiveness."
    >
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span className="label">Sector Recommendations</span>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
            based on current macro signals
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...thStyle, textAlign: "left" }}>Sector</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Score</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Rec</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Key Drivers</th>
              </tr>
            </thead>
            <tbody>
              {clusterRows.map(({ name, score, scoreColor, drivers, recLabel, recColor }, i) => (
                <tr
                  key={name}
                  style={{
                    borderBottom: i < clusterRows.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <td style={{ padding: "11px 16px", color: "var(--text)", fontWeight: 500, fontSize: 13 }}>
                    {name}
                  </td>
                  <td
                    style={{
                      padding: "11px 16px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono), monospace",
                      color: scoreColor,
                      fontWeight: 700,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: recColor,
                        background: `${recColor}18`,
                        border: `1px solid ${recColor}40`,
                        borderRadius: 3,
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {recLabel}
                    </span>
                  </td>
                  <td style={{ padding: "11px 16px", color: "var(--muted)", fontSize: 12 }}>
                    {drivers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
