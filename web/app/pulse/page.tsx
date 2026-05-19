import { loadIndicators } from "@/lib/data";
import { buildPageResult } from "@/lib/composites";
import PageLayout from "@/components/PageLayout";
import ScoreBar from "@/components/ScoreBar";

const CLUSTERS: Record<string, string[]> = {
  "Weekly Labor (Thu 8:30)": ["initial_claims", "continuing_claims"],
  "Weekly Housing (Wed 7:00)": ["mba_purchase", "mba_refi"],
  "Weekly Rail (Wed)": ["aar_carloads"],
  "Weekly Bank Credit (Fri 16:15)": ["ci_loans", "total_loans"],
  "Regional Fed Manufacturing": ["empire_state_mfg", "philly_fed_mfg", "richmond_fed_mfg", "kc_fed_mfg", "dallas_fed_mfg"],
  "Other Monthly": ["challenger_layoffs", "cass_freight"],
};

const ALL_IDS = Object.values(CLUSTERS).flat();

export default function PulsePage() {
  const data = loadIndicators(ALL_IDS);
  const indicators = ALL_IDS.map((id) => data[id] ?? null);
  const page = buildPageResult("pulse", indicators);

  const clusterScores = Object.entries(CLUSTERS).map(([name, ids]) => {
    const result = buildPageResult(`cluster_${name}`, ids.map((id) => data[id] ?? null));
    return { name, score: result.score };
  });

  return (
    <PageLayout
      page={page}
      description="What is happening this week? Real-time confirmation or divergence vs. slower monthly indicators."
    >
      <div className="card">
        <span className="label" style={{ display: "block", marginBottom: 12 }}>By Frequency / Source</span>
        {clusterScores.map(({ name, score }) => (
          <ScoreBar key={name} label={name} score={score} showZoneLabel />
        ))}
      </div>
    </PageLayout>
  );
}
