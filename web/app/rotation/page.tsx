import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";
import ScoreBar from "@/components/ScoreBar";

const CLUSTERS: Record<string, string[]> = {
  "Homebuilders / REITs": [
    "housing_permits_1f", "housing_starts", "housing_starts_1f",
    "existing_home_sales", "new_home_sales", "case_shiller_hpi", "nahb_traffic",
    "mba_purchase",
  ],
  "Consumer Cyclicals": [
    "retail_sales", "pce", "pce_real_durable",
    "umich_sentiment", "consumer_credit",
  ],
  "Banks / Credit": ["ci_loans", "total_loans"],
  "Industrials / Transport": ["nfp_trucks"],
  "Sentiment": ["consumer_confidence", "umich_sentiment"],
};

// Deduplicate IDs
const ALL_IDS = [...new Set(Object.values(CLUSTERS).flat())];

export default function RotationPage() {
  const data = loadIndicators(ALL_IDS);
  const indicators = ALL_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("rotation", indicators);

  const clusterScores = Object.entries(CLUSTERS).map(([name, ids]) => {
    const uniqueIds = [...new Set(ids)];
    const result = buildPageResult(`cluster_${name}`, uniqueIds.map((id) => data[id] ?? null));
    return { name, score: result.score };
  });

  return (
    <PageLayout
      page={page}
      description="Which sectors should outperform? Maps macro data to sector attractiveness."
    >
      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 12 }}>Sector Clusters</span>
        {clusterScores.map(({ name, score }) => (
          <ScoreBar key={name} label={name} score={score} showZoneLabel />
        ))}
      </div>
    </PageLayout>
  );
}
